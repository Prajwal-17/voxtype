package com.voxtype.nativebridge

import android.content.Context
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import org.json.JSONObject
import okhttp3.HttpUrl.Companion.toHttpUrl
import kotlinx.coroutines.sync.withLock
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** Account-scoped upload and restore. Local rows are an offline cache, never the only archive. */
object TranscriptUploads {
  private val lock = Mutex()
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  @Volatile var syncing = false; private set
  @Volatile var error = ""; private set
  fun request(context: Context) {
    val app = context.applicationContext
    TranscriptSyncJob.schedule(app)
    scope.launch { try { sync(app) } catch (_: Exception) { /* The persistent job retries. */ } }
  }

  suspend fun sync(context: Context) = lock.withLock {
    val session = NativeSession(context)
    val user = session.userId ?: return@withLock
    val url = session.apiUrl ?: return@withLock
    val bearer = session.token ?: return@withLock
    fun sameAccount() = session.userId == user && session.apiUrl == url && session.token == bearer
    syncing = true; error = ""; VoxTypeNativeModule.changed()
    try {
      VoxTypeStore(context).use { store ->
        // Restore is independent of upload failures (e.g. an older server missing its PUT schema).
        var cursor: String? = null
        val cursors = mutableSetOf<String>()
        val cloudIds = mutableSetOf<String>()
        do {
          currentCoroutineContext().ensureActive()
          if (!sameAccount()) return@withLock
          val endpoint = "$url/v1/dictations".toHttpUrl().newBuilder().addQueryParameter("limit", "100")
          cursor?.let { endpoint.addQueryParameter("cursor", it) }
          val request = Request.Builder().url(endpoint.build()).header("Authorization", "Bearer $bearer").build()
          val page = HttpClients.uploads.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw java.io.IOException("Cloud history HTTP ${response.code}")
            JSONObject(response.body?.string() ?: throw java.io.IOException("Empty history response"))
          }
          if (!sameAccount()) return@withLock
          val rows = page.getJSONArray("data")
          for (i in 0 until rows.length()) cloudIds += rows.getJSONObject(i).getString("id")
          store.restore(user, url, rows)
          VoxTypeNativeModule.changed()
          cursor = page.optString("nextCursor").takeIf { it.isNotBlank() && it != "null" }
          if (cursor != null && !cursors.add(cursor!!)) throw java.io.IOException("Repeated history cursor")
        } while (cursor != null)
        if (sameAccount()) {
          store.reconcile(user, url, cloudIds)
          sendPending(store, user, url, bearer)
        }
      }
    } catch (failure: Exception) {
      error = "Cloud sync unavailable"; throw failure
    } finally { syncing = false; VoxTypeNativeModule.changed() }
  }


  suspend fun sendPending(context: Context) = lock.withLock {
    TranscriptSyncJob.schedule(context)
    val session = NativeSession(context)
    val userId = session.userId ?: return@withLock
    val apiUrl = session.apiUrl ?: return@withLock
    val bearer = session.token ?: return@withLock
    if (session.userId != userId || session.apiUrl != apiUrl) return@withLock
    try {
      VoxTypeStore(context).use { store -> sendPending(store, userId, apiUrl, bearer) }
    } catch (e: Exception) {
      VoxLog.w("transcript queued for cloud retry", e)
    }
  }

  internal fun sendPending(
    store: VoxTypeStore,
    userId: String,
    apiUrl: String,
    bearer: String,
    client: OkHttpClient = HttpClients.uploads,
  ) {
    store.prepareUploads(userId, apiUrl)
    for (item in store.pendingUploads(userId, apiUrl)) {
      val request = Request.Builder().url("$apiUrl/v1/dictations/${item.id}")
        .header("Authorization", "Bearer $bearer")
        .put(item.payload.toString().toRequestBody("application/json".toMediaType())).build()
      client.newCall(request).execute().use { response ->
        if (!response.isSuccessful) throw java.io.IOException("Transcript upload HTTP ${response.code}")
        store.acknowledgeUpload(item); VoxTypeNativeModule.changed()
      }
    }
  }
}
