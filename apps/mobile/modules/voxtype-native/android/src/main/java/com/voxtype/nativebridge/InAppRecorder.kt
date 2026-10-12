package com.voxtype.nativebridge

import android.content.Context
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.Call
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/** Foreground-only recorder, independent of accessibility and never inserts into other apps. */
object InAppRecorder {
  private val main = Handler(Looper.getMainLooper())
  private var capture: AudioCapture? = null
  private var engine: DeepgramSession? = null
  @Volatile private var generation = 0
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  @Volatile var status = "idle"; private set
  @Volatile var text = ""; private set
  @Volatile var error = ""; private set
  @Volatile var durationMs = 0L; private set
  @Volatile var level = 0f; private set
  private var lastLevelAt = 0L
  private var processingJob: Job? = null
  private var pendingFile: java.io.File? = null
  @Volatile private var cleanupCall: Call? = null
  val busy: Boolean get() = status == "listening" || status == "processing"
  fun snapshot() = mapOf("status" to status, "text" to text, "error" to error, "durationMs" to durationMs, "level" to level)
  private fun changed() {
    VoxTypeNativeModule.changed()
    main.post { VoxTypeAccessibilityService.instance?.refreshBubble() }
  }

  fun start(context: Context) {
    check(!busy) { "A recording is already running." }
    check(VoxTypeAccessibilityService.instance?.status !in listOf("listening", "connecting", "processing")) { "Finish the bubble recording first." }
    val session = NativeSession(context)
    val userId = requireNotNull(session.userId) { "Sign in again." }
    val apiUrl = requireNotNull(session.apiUrl) { "Sign in again." }
    check(session.token != null) { "Sign in again." }
    val current = ++generation
    text = ""; error = ""; durationMs = 0L; level = 0f; lastLevelAt = 0L
    val stream = DeepgramSession({ session.token }, { session.apiUrl }, { main.post { stop() } }, vocabulary = { VoxTypeStore(context).use { it.vocabulary } })
    engine = stream
    try {
      status = "listening"
      stream.begin()
      capture = AudioCapture(context, { bytes ->
        stream.audio(bytes)
        val now = android.os.SystemClock.uptimeMillis()
        if (current == generation && status == "listening" && now-lastLevelAt >= 80L) {
          level = BubbleAudioLevel.fromPcm(bytes); lastLevelAt = now
          VoxTypeNativeModule.audioLevel(level)
        }
      }, { file, duration ->
        main.post {
          if (current != generation) { file?.delete(); return@post }
          capture = null
          pendingFile = file
          durationMs = duration
          status = "processing"; level = 0f; changed()
          stream.finalize { original ->
            stream.close()
            if (current != generation) { file?.delete(); return@finalize }
            processingJob = scope.launch {
              val store = VoxTypeStore(context)
              var saved = false
              try {
                ensureActive()
                if (current != generation) return@launch
                val cleaned = if (store.cleanupEnabled && original.isNotBlank()) cleanup(session, original, current) else original
                ensureActive()
                withContext(Dispatchers.Main) {
                  if (current != generation || session.userId != userId) return@withContext
                  store.save(userId, cleaned, original, duration, file, apiUrl)
                  saved = true
                  pendingFile = null
                  text = cleaned; status = "saved"; if (text.isBlank()) error = "No speech detected"; changed()
                }
                if (saved && current == generation && cleaned.isNotBlank()) TranscriptUploads.sendPending(context)
              } catch (cancelled: CancellationException) { throw cancelled }
              catch (exception: Exception) {
                main.post { if (current == generation) { text = original; error = "Couldn’t save recording"; status = "error"; changed() } }
                VoxLog.e("in-app save failed", exception)
              } finally { if (!saved) file?.delete(); store.close() }
            }
          }
        }
      }, {
        main.post { cancel(); error = "Microphone is in use by another app"; status = "error"; changed() }
      }).also { it.start() }
      changed()
    } catch (exception: Exception) {
      cancel(); throw exception
    }
  }
  fun stop() {
    if (status != "listening") return
    status = "processing"; level = 0f; changed()
    capture?.stop(); capture = null
  }
  fun cancel() {
    generation++
    processingJob?.cancel(); processingJob = null
    cleanupCall?.cancel(); cleanupCall = null
    pendingFile?.delete(); pendingFile = null
    capture?.stop(); capture = null
    engine?.abort(); engine?.close(); engine = null
    status = "idle"; text = ""; error = ""; level = 0f; changed()
  }
  private fun cleanup(session: NativeSession, original: String, current: Int): String {
    if (original.length > 12000) return original
    return try {
      val request = Request.Builder().url("${session.apiUrl}${VoxConstants.CLEANUP_PATH}")
        .header("Authorization", "Bearer ${session.token}")
        .post(JSONObject().put("text", original).toString().toRequestBody("application/json".toMediaType())).build()
      val call = HttpClients.cleanup.newCall(request)
      cleanupCall = call
      if (current != generation) { call.cancel(); return original }
      try { call.execute().use { response ->
        if (!response.isSuccessful) original else JSONObject(response.body?.string() ?: "{}").optJSONObject("data")?.optString("text")?.takeIf { it.isNotBlank() } ?: original
      } } finally { if (cleanupCall === call) cleanupCall = null }
    } catch (_: Exception) { original }
  }
}
