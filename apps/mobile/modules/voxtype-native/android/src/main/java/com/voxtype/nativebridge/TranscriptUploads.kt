package com.voxtype.nativebridge

import android.content.Context
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** One upload pass per new transcript. Failures wait locally for the next dictation. */
object TranscriptUploads {
  private val lock = Mutex()

  suspend fun sendPending(context: Context) = lock.withLock {
    val session = NativeSession(context)
    val userId = session.userId ?: return@withLock
    val apiUrl = session.apiUrl ?: return@withLock
    val bearer = session.token ?: return@withLock
    if (session.userId != userId || session.apiUrl != apiUrl) return@withLock
    try {
      VoxTypeStore(context).use { store -> sendPending(store, userId, apiUrl, bearer) }
    } catch (e: Exception) {
      VoxLog.w("transcript kept locally until the next dictation", e)
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
        if (response.code == 401 || response.code == 403) return
        if (response.isSuccessful) { store.acknowledgeUpload(item); VoxTypeNativeModule.changed() }
      }
    }
  }
}
