package com.voxtype.nativebridge

import android.os.Handler
import android.os.Looper
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.TreeMap

/** One socket across dictations. A new recording cannot start until Finalize has drained. */
class DeepgramSession(private val token: () -> String?,
                      private val apiUrl: () -> String?,
                      private val onLost: () -> Unit) {
  private val client = HttpClients.streaming
  private val main = Handler(Looper.getMainLooper())

  // Touched from mic thread (audio) and main thread: must be volatile.
  @Volatile private var socket: WebSocket? = null
  @Volatile private var connecting = false
  @Volatile private var ready = false
  @Volatile private var closed = false
  @Volatile private var recording = false
  @Volatile private var byteCount = 0L

  // Main-thread only state.
  private var pendingReady: (() -> Unit)? = null
  private var pendingDone: ((String) -> Unit)? = null
  private val segments = TreeMap<Double, String>()
  private var boundary = 0.0
  private var keepUntil = 0L
  private var finishGeneration = 0
  private var reconnectAttempt = 0

  private val maintenance = object : Runnable {
    override fun run() {
      if (closed) return
      if (System.currentTimeMillis() >= keepUntil && pendingReady == null && pendingDone == null) {
        try { socket?.send("{\"type\":\"CloseStream\"}") } catch (e: Exception) { VoxLog.w("CloseStream failed", e) }
        try { socket?.close(1000, "idle timeout") } catch (e: Exception) { VoxLog.w("socket close failed", e) }
        socket = null; ready = false
        return
      }
      if (ready && !recording && pendingReady == null && pendingDone == null) {
        try { socket?.send("{\"type\":\"KeepAlive\"}") } catch (e: Exception) { VoxLog.w("KeepAlive failed", e) }
      }
      if (!ready && !connecting && System.currentTimeMillis() < keepUntil) connect()
      main.postDelayed(this, VoxConstants.MAINTENANCE_INTERVAL_MS)
    }
  }

  fun begin(onReady: () -> Unit) {
    check(pendingReady == null && pendingDone == null) { "already started" }
    keepUntil = System.currentTimeMillis() + VoxConstants.SOCKET_KEEP_ALIVE_MS
    pendingReady = {
      boundary = byteCount / VoxConstants.BYTES_PER_SECOND.toDouble()
      segments.clear()
      recording = true
      onReady()
    }
    if (ready) pendingReady?.also { pendingReady = null; it() } else connect()
    main.removeCallbacks(maintenance)
    main.postDelayed(maintenance, VoxConstants.MAINTENANCE_INTERVAL_MS)
  }

  fun audio(bytes: ByteArray) {
    if (!ready || pendingDone != null) return
    try {
      if (socket?.send(bytes.toByteString()) == true) byteCount += bytes.size
    } catch (e: Exception) {
      VoxLog.w("audio send failed", e)
    }
  }

  fun finalize(onDone: (String) -> Unit) {
    recording = false
    if (!ready) { onDone(segments.values.joinToString(" ").trim()); return }
    pendingDone = onDone
    keepUntil = System.currentTimeMillis() + VoxConstants.SOCKET_KEEP_ALIVE_MS
    try { socket?.send("{\"type\":\"Finalize\"}") } catch (e: Exception) { VoxLog.w("Finalize send failed", e) }
    val generation = ++finishGeneration
    main.postDelayed({ if (pendingDone != null && generation == finishGeneration) complete() }, VoxConstants.FINALIZE_TIMEOUT_MS)
  }

  private fun complete() {
    val done = pendingDone ?: return
    pendingDone = null
    finishGeneration++
    val result = segments.values.filter { it.isNotBlank() }.joinToString(" ").trim()
    segments.clear()
    done(result)
  }

  private fun connect() {
    if (connecting || ready || closed) return
    val bearer = token() ?: run { pendingReady = null; return }
    val url = apiUrl() ?: run { pendingReady = null; return }
    connecting = true
    Thread({
      try {
        val request = Request.Builder().url("$url${VoxConstants.TOKEN_PATH}")
          .header("Authorization", "Bearer $bearer").post(ByteArray(0).toRequestBody()).build()
        // Never log bearer or jwt.
        val (code, successful, jwt) = HttpClients.default.newCall(request).execute().use { response ->
          val body = try { response.body?.string() } catch (e: Exception) {
            VoxLog.w("token body read failed", e); null
          }
          val parsed = try {
            JSONObject(body ?: "{}").optJSONObject("data")?.optString("token")
          } catch (e: Exception) {
            VoxLog.w("token json parse failed", e); null
          }
          Triple(response.code, response.isSuccessful, parsed)
        }
        if (code == 401 || code == 403) keepUntil = 0
        if (!successful || jwt.isNullOrBlank()) throw IllegalStateException("Token unavailable ($code)")
        main.post {
          if (closed || System.currentTimeMillis() >= keepUntil) { connecting = false; return@post }
          val ws = Request.Builder().url(VoxConstants.DEEPGRAM_WS_URL)
            .header("Authorization", "Bearer $jwt").build()
          socket = client.newWebSocket(ws, listener)
        }
      } catch (e: Exception) {
        VoxLog.w("deepgram connect failed", e)
        main.post { lost() }
      }
    }, "VoxType deepgram-connect").start()
  }

  private val listener = object : WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) {
      main.post {
        if (socket !== webSocket) return@post
        connecting = false; ready = true; reconnectAttempt = 0; byteCount = 0
        pendingReady?.also { pendingReady = null; it() }
      }
    }
    override fun onMessage(webSocket: WebSocket, text: String) {
      main.post {
        if (socket !== webSocket) return@post
        try {
          val data = JSONObject(text)
          if (data.optString("type") != "Results" || !data.optBoolean("is_final")) return@post
          val start = data.optDouble("start", -1.0)
          val words = data.optJSONObject("channel")?.optJSONArray("alternatives")?.optJSONObject(0)?.optString("transcript")?.trim().orEmpty()
          // KeepAlive does not advance the audio clock. Old results cannot enter the next dictation.
          if (start < boundary - 0.05 || words.isBlank()) return@post
          segments[start] = words
          if (pendingDone != null) {
            val generation = ++finishGeneration
            val delay = if (data.optBoolean("from_finalize")) VoxConstants.FINALIZE_RESULT_DELAY_FROM_FINALIZE_MS else VoxConstants.FINALIZE_RESULT_DELAY_MS
            main.postDelayed({ if (pendingDone != null && generation == finishGeneration) complete() }, delay)
          }
        } catch (e: Exception) {
          VoxLog.w("deepgram message parse failed", e)
        }
      }
    }
    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
      VoxLog.d("deepgram closed $code")
      main.post { if (socket === webSocket) lost() }
    }
    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      VoxLog.w("deepgram socket failure", t)
      main.post { if (socket === webSocket) lost() }
    }
  }

  private fun lost() {
    socket = null; ready = false; connecting = false; recording = false; byteCount = 0
    pendingReady = null
    if (pendingDone != null) complete() else {
      try { onLost() } catch (e: Exception) { VoxLog.w("onLost failed", e) }
    }
    if (!closed && System.currentTimeMillis() < keepUntil) {
      val shift = minOf(reconnectAttempt++, VoxConstants.RECONNECT_MAX_SHIFT)
      val delay = minOf(VoxConstants.RECONNECT_MAX_MS, VoxConstants.RECONNECT_BASE_MS shl shift)
      main.postDelayed({ connect() }, delay)
    }
  }

  fun close() {
    closed = true
    main.removeCallbacks(maintenance)
    try { socket?.close(1000, "sign out") } catch (e: Exception) { VoxLog.w("socket close failed", e) }
    socket = null; ready = false; recording = false
  }
}
