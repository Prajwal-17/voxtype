package com.voxtype.nativebridge

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.TreeMap

/** Capture starts immediately. One socket survives completed takes, never a canceled take. */
class DeepgramSession(private val token: () -> String?,
                      private val apiUrl: () -> String?,
                      private val onLost: () -> Unit,
                      private val client: WebSocket.Factory = HttpClients.streaming,
                      private val tokenClient: OkHttpClient = HttpClients.default,
                      private val listenUrl: String = VoxConstants.DEEPGRAM_WS_URL) {
  private val main = Handler(Looper.getMainLooper())
  // Serialize microphone packets with opening, finalizing, and resetting the socket.
  private val audioLock = Any()
  private val backlog = AudioBacklog()
  private var socket: WebSocket? = null
  private var ready = false
  @Volatile private var recording = false
  private var byteCount = 0L

  // Main-thread only state.
  private var connecting = false
  private var closed = false
  private var takeFailed = false
  private var takeActive = false
  private var pendingDone: ((String) -> Unit)? = null
  private val segments = TreeMap<Double, String>()
  private var boundary = 0.0
  private var keepUntil = 0L
  private var finishGeneration = 0
  private var connectGeneration = 0
  private var reconnectAttempt = 0
  private var retryAt = 0L

  private val maintenance = object : Runnable {
    override fun run() {
      if (closed) return
      if (!recording && pendingDone == null && SystemClock.elapsedRealtime() >= keepUntil) {
        disconnect()
        return
      }
      if (ready && !recording && pendingDone == null && socket?.send("{\"type\":\"KeepAlive\"}") != true) lost()
      if (!ready && !connecting && SystemClock.elapsedRealtime() >= retryAt) connect()
      main.postDelayed(this, VoxConstants.MAINTENANCE_INTERVAL_MS)
    }
  }

  fun begin() {
    check(!closed && !recording && pendingDone == null) { "already started or closed" }
    takeFailed = false
    takeActive = true
    segments.clear()
    synchronized(audioLock) {
      boundary = byteCount / VoxConstants.BYTES_PER_SECOND.toDouble()
      backlog.clear()
      recording = true
    }
    keepUntil = SystemClock.elapsedRealtime() + VoxConstants.SOCKET_KEEP_ALIVE_MS
    connect()
    main.removeCallbacks(maintenance)
    main.postDelayed(maintenance, VoxConstants.MAINTENANCE_INTERVAL_MS)
  }

  fun audio(bytes: ByteArray) {
    synchronized(audioLock) {
      if (!recording) return
      if (!ready) {
        if (!backlog.push(bytes)) {
          recording = false
          main.post { lost() }
        }
      } else if ((socket?.queueSize() ?: 0) + bytes.size <= VoxConstants.MAX_BUFFERED_AUDIO_BYTES &&
        socket?.send(bytes.toByteString()) == true) {
        byteCount += bytes.size
      } else {
        recording = false
        main.post { lost() }
      }
    }
  }

  /** A canceled take must not leave late results in a reusable socket. */
  fun abort() {
    takeActive = false
    synchronized(audioLock) { recording = false; backlog.clear() }
    pendingDone = null
    segments.clear()
    finishGeneration++
    disconnect()
    keepUntil = SystemClock.elapsedRealtime() + VoxConstants.SOCKET_KEEP_ALIVE_MS
    // Rewarm without opening the microphone; stale token responses are ignored.
    connect()
  }

  fun finalize(onDone: (String) -> Unit) {
    synchronized(audioLock) { recording = false }
    check(pendingDone == null) { "already finalizing" }
    pendingDone = onDone
    keepUntil = SystemClock.elapsedRealtime() + VoxConstants.SOCKET_KEEP_ALIVE_MS
    if (takeFailed || closed) { complete(false); return }
    // If finish was tapped while connecting, onOpen flushes the backlog before Finalize.
    if (ready) sendFinalize() else connect()
  }

  private fun sendFinalize() {
    if (socket?.send("{\"type\":\"Finalize\"}") != true) { lost(); return }
    val generation = ++finishGeneration
    main.postDelayed({
      if (pendingDone != null && generation == finishGeneration) complete(false)
    }, VoxConstants.FINALIZE_TIMEOUT_MS)
  }

  private fun complete(reusable: Boolean) {
    val done = pendingDone ?: return
    pendingDone = null
    takeActive = false
    finishGeneration++
    val result = segments.values.filter { it.isNotBlank() }.joinToString(" ").trim()
    segments.clear()
    // Without a Finalize acknowledgement, abandon the socket to isolate the next take.
    if (!reusable) disconnect()
    keepUntil = SystemClock.elapsedRealtime() + VoxConstants.SOCKET_KEEP_ALIVE_MS
    done(result)
  }

  private fun connect() {
    if (connecting || ready || closed) return
    val bearer = token()
    val url = apiUrl()
    if (bearer.isNullOrBlank() || url.isNullOrBlank()) { keepUntil = 0; lost(); return }
    connecting = true
    val generation = ++connectGeneration
    main.postDelayed({
      if (connecting && generation == connectGeneration) lost()
    }, VoxConstants.CONNECT_TIMEOUT_MS)
    Thread({
      try {
        val request = Request.Builder().url("${url.trimEnd('/')}${VoxConstants.TOKEN_PATH}")
          .header("Authorization", "Bearer $bearer").post(ByteArray(0).toRequestBody()).build()
        // Never log bearer or jwt.
        val (code, successful, jwt) = tokenClient.newCall(request).execute().use { response ->
          val body = response.body?.string()
          val parsed = JSONObject(body ?: "{}").optJSONObject("data")?.optString("token")
          Triple(response.code, response.isSuccessful, parsed)
        }
        main.post {
          if (closed || generation != connectGeneration) return@post
          if (code == 401 || code == 403) keepUntil = 0
          if (!successful || jwt.isNullOrBlank()) { lost(); return@post }
          val ws = Request.Builder().url(listenUrl).header("Authorization", "Bearer $jwt").build()
          socket = client.newWebSocket(ws, listener)
        }
      } catch (e: Exception) {
        VoxLog.w("deepgram connect failed", e)
        main.post { if (generation == connectGeneration && !closed) lost() }
      }
    }, "VoxType deepgram-connect").start()
  }

  private val listener = object : WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) {
      main.post {
        if (socket !== webSocket || closed) return@post
        connecting = false; reconnectAttempt = 0
        var flushed = true
        synchronized(audioLock) {
          byteCount = 0
          boundary = 0.0
          // Keep the lock for the flush so live mic packets cannot overtake queued speech.
          while (true) {
            val bytes = backlog.pop() ?: break
            if (!webSocket.send(bytes.toByteString())) { flushed = false; break }
            byteCount += bytes.size
          }
          ready = flushed
        }
        if (!flushed) { lost(); return@post }
        if (pendingDone != null) sendFinalize()
      }
    }
    override fun onMessage(webSocket: WebSocket, text: String) {
      main.post {
        if (socket !== webSocket || (!recording && pendingDone == null)) return@post
        try {
          val data = JSONObject(text)
          if (data.optString("type") == "Error") { lost(); return@post }
          if (data.optString("type") != "Results" || !data.optBoolean("is_final")) return@post
          val start = data.optDouble("start", -1.0)
          if (start < boundary - 0.001) return@post
          val words = data.optJSONObject("channel")?.optJSONArray("alternatives")?.optJSONObject(0)?.optString("transcript")?.trim().orEmpty()
          if (words.isNotBlank()) segments[start] = words
          if (pendingDone != null && data.optBoolean("from_finalize")) {
            val generation = ++finishGeneration
            main.postDelayed({
              if (pendingDone != null && generation == finishGeneration) complete(true)
            }, VoxConstants.FINALIZE_RESULT_DELAY_FROM_FINALIZE_MS)
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

  private fun disconnect() {
    connectGeneration++
    connecting = false
    synchronized(audioLock) {
      val previous = socket
      socket = null; ready = false; byteCount = 0
      backlog.clear()
      previous?.cancel()
    }
  }

  private fun lost() {
    val active = takeActive
    takeActive = false
    takeFailed = true
    synchronized(audioLock) { recording = false }
    disconnect()
    if (pendingDone != null) complete(false)
    else if (active) {
      try { onLost() } catch (e: Exception) { VoxLog.w("onLost failed", e) }
    }
    if (!closed && SystemClock.elapsedRealtime() < keepUntil) {
      val shift = minOf(reconnectAttempt++, VoxConstants.RECONNECT_MAX_SHIFT)
      val delay = minOf(VoxConstants.RECONNECT_MAX_MS, VoxConstants.RECONNECT_BASE_MS shl shift)
      retryAt = SystemClock.elapsedRealtime() + delay
      val generation = connectGeneration
      main.postDelayed({ if (generation == connectGeneration && !closed) connect() }, delay)
    }
  }

  fun close() {
    closed = true
    main.removeCallbacks(maintenance)
    pendingDone = null
    finishGeneration++
    segments.clear()
    synchronized(audioLock) { recording = false }
    disconnect()
  }
}
