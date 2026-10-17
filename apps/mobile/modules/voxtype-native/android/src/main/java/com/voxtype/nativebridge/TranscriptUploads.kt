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
  private var lastAccount: Triple<String, String, String>? = null
  private var lastSyncAt = 0L
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
    val account = Triple(user, url, bearer)
    if (lastAccount == account && android.os.SystemClock.elapsedRealtime() - lastSyncAt < 120_000L) return@withLock
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
          if (sameAccount()) { lastAccount = account; lastSyncAt = android.os.SystemClock.elapsedRealtime() }
        }
      }
    } catch (failure: Exception) {
      error = "Cloud sync unavailable"; throw failure
    } finally { syncing = false; VoxTypeNativeModule.changed() }
  }


  fun sendPendingAsync(context: Context) {
    val app = context.applicationContext
    scope.launch { sendPending(app) }
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

  internal suspend fun replaceTranscript(context: Context, id: String, user: String, api: String,
    raw: String, text: String, sameAccount: () -> Boolean) = lock.withLock {
    check(sameAccount()) { "Account changed" }
    VoxTypeStore(context).use { it.replaceTranscript(user,id,raw,text,api) }
  }

  /** Serialize delete with restore/upload so a queued PUT cannot resurrect the record. */
  suspend fun delete(context: Context, id: String, client: OkHttpClient = HttpClients.uploads) {
    val session = NativeSession(context)
    delete(context, id, {
      val bearer = session.token
      val userId = session.userId
      val apiUrl = session.apiUrl
      if (bearer != null && userId != null && apiUrl != null) Triple(userId, apiUrl, bearer) else null
    }, client)
  }

  /** Transport/store boundary; tests supply credentials without an Android Keystore. */
  internal suspend fun delete(
    context: Context,
    id: String,
    currentAccount: () -> Triple<String, String, String>?,
    client: OkHttpClient,
  ) = lock.withLock {
    require(id.length in 1..200 && id.matches(Regex("[A-Za-z0-9-]+"))) { "Invalid transcript ID" }
    val account = requireNotNull(currentAccount()) { "Sign in again" }
    val (userId, apiUrl, bearer) = account
    val request = Request.Builder().url("$apiUrl/v1/dictations/$id").header("Authorization", "Bearer $bearer").delete().build()
    client.newCall(request).execute().use { response ->
      if (!response.isSuccessful && response.code != 404) throw java.io.IOException("Couldn’t delete cloud transcript. Check your connection.")
    }
    if (currentAccount() != account) throw java.io.IOException("Account changed. Try again.")
    VoxTypeStore(context).use { it.delete(userId,id,apiUrl) }
    VoxTypeNativeModule.changed("analytics")
  }

  internal fun sendPending(
    store: VoxTypeStore,
    userId: String,
    apiUrl: String,
    bearer: String,
    client: OkHttpClient = HttpClients.uploads,
  ) {
    store.prepareUploads(userId, apiUrl)
    var uploaded = false
    try { for (item in store.pendingUploads(userId, apiUrl)) {
      val request = Request.Builder().url("$apiUrl/v1/dictations/${item.id}")
        .header("Authorization", "Bearer $bearer")
        .put(item.payload.toString().toRequestBody("application/json".toMediaType())).build()
      client.newCall(request).execute().use { response ->
        if (!response.isSuccessful) throw java.io.IOException("Transcript upload HTTP ${response.code}")
        store.acknowledgeUpload(item); uploaded = true
      }
    } } finally { if (uploaded) VoxTypeNativeModule.changed("analytics") }
  }
}
