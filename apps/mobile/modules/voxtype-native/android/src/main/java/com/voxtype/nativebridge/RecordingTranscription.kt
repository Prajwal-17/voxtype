package com.voxtype.nativebridge

import android.content.Context
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.sync.Mutex
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import okio.source
import org.json.JSONObject

/** Explicit re-transcription sends WAV bytes only to the existing speech provider, never to VoxType history storage. */
internal object RecordingTranscription {
  const val MAX_AUDIO_BYTES = 64L * 1024 * 1024
  private val lock = Mutex()
  private val client by lazy { HttpClients.default.newBuilder().followRedirects(false)
    .retryOnConnectionFailure(false).callTimeout(180, TimeUnit.SECONDS).readTimeout(180, TimeUnit.SECONDS).build() }

  internal fun parse(body: String): String {
    val text = JSONObject(body).optJSONObject("results")?.optJSONArray("channels")?.optJSONObject(0)
      ?.optJSONArray("alternatives")?.optJSONObject(0)?.optString("transcript")?.trim().orEmpty()
    check(text.isNotBlank() && text.length <= 100_000) { "No usable speech received. Your previous text and recording are unchanged." }
    return text
  }
  suspend fun regenerate(context: Context, id: String, expectedUserId: String,
    currentAccount: () -> Triple<String,String,String>? = {
      val session = NativeSession(context)
      val user = session.userId; val api = session.apiUrl; val bearer = session.token
      if (user != null && api != null && bearer != null) Triple(user,api,bearer) else null
    }, tokenClient: okhttp3.OkHttpClient = HttpClients.default,
    transcriptionClient: okhttp3.OkHttpClient = client,
    sync: (Context) -> Unit = TranscriptUploads::sendPendingAsync): String {
    check(lock.tryLock()) { "Another recording is already being regenerated." }
    try {
      val account = requireNotNull(currentAccount()) { "Sign in again" }
      val (user, api, bearer) = account
      check(user == expectedUserId) { "Account changed" }
      fun sameAccount() = currentAccount() == account
      val file = VoxTypeStore(context).use { it.recoveryAudio(user,id) } ?: error("Recording no longer available")
      val audioBytes = file.length()
      check(audioBytes in 45..MAX_AUDIO_BYTES) { "Recording is empty or exceeds the 64 MB retry limit." }
      LocalDiagnostics.record(context, LocalDiagnostics.Event.regeneration_started)
      // Open before requesting a token: pruning can unlink the path without destroying this read handle.
      val raw = file.inputStream().use { input ->
        val tokenRequest = Request.Builder().url("$api${VoxConstants.TOKEN_PATH}").header("Authorization","Bearer $bearer")
          .post(ByteArray(0).toRequestBody()).build()
        val jwt = tokenClient.newCall(tokenRequest).execute().use {
          check(it.isSuccessful) { "Couldn’t start transcription. Your recording is kept." }
          JSONObject(it.body?.string() ?: "{}").getJSONObject("data").getString("token")
        }
        check(sameAccount()) { "Account changed" }
        val vocabulary = VoxTypeStore(context).use { it.vocabulary }
        val url = okhttp3.HttpUrl.Builder().scheme("https").host("api.deepgram.com").addPathSegments("v1/listen")
          .addQueryParameter("model","nova-3").addQueryParameter("smart_format","true").addQueryParameter("punctuate","true")
          .apply { vocabulary.forEach { addQueryParameter("keyterm",it) } }.build()
        val body = object : RequestBody() {
          override fun contentType() = "audio/wav".toMediaType()
          override fun contentLength() = audioBytes
          override fun isOneShot() = true
          override fun writeTo(sink: BufferedSink) { input.source().use { sink.writeAll(it) } }
        }
        transcriptionClient.newCall(Request.Builder().url(url).header("Authorization","Bearer $jwt").post(body).build()).execute().use {
          check(it.isSuccessful) { "Transcription failed. Your previous text and recording are unchanged." }
          val response = it.body ?: error("Empty transcription response")
          check(response.contentLength() <= 8_000_000) { "Transcription response is too large" }
          val source = response.source()
          source.request(8_000_001)
          check(source.buffer.size <= 8_000_000) { "Transcription response is too large" }
          parse(source.buffer.readUtf8())
        }
      }
      check(sameAccount()) { "Account changed" }
      val cleanupEnabled = VoxTypeStore(context).use { it.cleanupEnabled }
      val cleaned = if (cleanupEnabled) runCatching {
        val request = Request.Builder().url("$api${VoxConstants.CLEANUP_PATH}").header("Authorization","Bearer $bearer")
          .post(JSONObject().put("text",raw).toString().toRequestBody("application/json".toMediaType())).build()
        HttpClients.cleanup.newCall(request).execute().use {
          if (it.isSuccessful) JSONObject(it.body?.string() ?: "{}").optJSONObject("data")?.optString("text")?.takeIf { text -> text.isNotBlank() } ?: raw else raw
        }
      }.getOrDefault(raw) else raw
      // Reuse the synchronization lock so an older upload cannot acknowledge the new revision.
      TranscriptUploads.replaceTranscript(context,id,user,api,raw,cleaned,::sameAccount)
      InAppRecorder.replaceRecoveredText(id,cleaned)
      LocalDiagnostics.record(context, LocalDiagnostics.Event.regeneration_complete)
      sync(context)
      return cleaned
    } catch (error: Exception) {
      LocalDiagnostics.record(context, LocalDiagnostics.Event.regeneration_failed)
      throw error
    } finally { lock.unlock() }
  }
}
