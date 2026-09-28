package com.voxtype.nativebridge

import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.TreeMap
import java.util.concurrent.TimeUnit

/** One socket across dictations. A new recording cannot start until Finalize has drained. */
class DeepgramSession(private val token: () -> String?,
                      private val apiUrl: () -> String?,
                      private val onLost: () -> Unit) {
  private val client = OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).build()
  private val main = Handler(Looper.getMainLooper())
  private var socket: WebSocket? = null
  private var connecting = false
  private var ready = false
  private var closed = false
  private var pendingReady: (() -> Unit)? = null
  private var pendingDone: ((String) -> Unit)? = null
  private val segments = TreeMap<Double, String>()
  private var boundary = 0.0
  private var byteCount = 0L
  private var keepUntil = 0L
  private var finishGeneration = 0
  private var reconnectAttempt = 0
  private var recording = false

  private val maintenance = object : Runnable {
    override fun run() {
      if (closed) return
      if (System.currentTimeMillis() >= keepUntil && pendingReady == null && pendingDone == null) {
        socket?.send("{\"type\":\"CloseStream\"}")
        socket?.close(1000, "idle timeout")
        socket = null; ready = false
        return
      }
      if (ready && !recording && pendingReady == null && pendingDone == null) socket?.send("{\"type\":\"KeepAlive\"}")
      if (!ready && !connecting && System.currentTimeMillis() < keepUntil) connect()
      main.postDelayed(this, 4000)
    }
  }

  fun begin(onReady: () -> Unit) {
    check(pendingReady == null && pendingDone == null)
    keepUntil = System.currentTimeMillis() + 420_000
    pendingReady = {
      boundary = byteCount / 32000.0
      segments.clear()
      recording = true
      onReady()
    }
    if (ready) pendingReady?.also { pendingReady = null; it() } else connect()
    main.removeCallbacks(maintenance)
    main.postDelayed(maintenance, 4000)
  }

  fun audio(bytes: ByteArray) {
    if (ready && pendingDone == null && socket?.send(bytes.toByteString()) == true) byteCount += bytes.size
  }

  fun finalize(onDone: (String) -> Unit) {
    recording = false
    if (!ready) { onDone(segments.values.joinToString(" ").trim()); return }
    pendingDone = onDone
    keepUntil = System.currentTimeMillis() + 420_000
    socket?.send("{\"type\":\"Finalize\"}")
    val generation = ++finishGeneration
    main.postDelayed({ if (pendingDone != null && generation == finishGeneration) complete() }, 2500)
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
    Thread {
      try {
        val response = client.newCall(Request.Builder().url("$url/v1/speech/token")
          .header("Authorization", "Bearer $bearer").post(ByteArray(0).toRequestBody()).build()).execute()
        val jwt = JSONObject(response.body?.string() ?: "{}").optJSONObject("data")?.optString("token")
        response.close()
        if (response.code == 401 || response.code == 403) keepUntil = 0
        if (!response.isSuccessful || jwt.isNullOrBlank()) throw IllegalStateException("Token unavailable")
        main.post {
          if (closed || System.currentTimeMillis() >= keepUntil) { connecting = false; return@post }
          val request = Request.Builder().url("wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true&smart_format=true")
            .header("Authorization", "Bearer $jwt").build()
          socket = client.newWebSocket(request, listener)
        }
      } catch (_: Exception) { main.post { lost() } }
    }.start()
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
            main.postDelayed({ if (pendingDone != null && generation == finishGeneration) complete() },
              if (data.optBoolean("from_finalize")) 250 else 700)
          }
        } catch (_: Exception) {}
      }
    }
    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
      main.post { if (socket === webSocket) lost() }
    }
    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      main.post { if (socket === webSocket) lost() }
    }
  }

  private fun lost() {
    socket = null; ready = false; connecting = false; recording = false; byteCount = 0
    pendingReady = null
    if (pendingDone != null) complete() else onLost()
    if (!closed && System.currentTimeMillis() < keepUntil) {
      val delay = minOf(8000L, 1000L shl minOf(reconnectAttempt++, 3))
      main.postDelayed({ connect() }, delay)
    }
  }

  fun close() {
    closed = true
    main.removeCallbacks(maintenance)
    socket?.close(1000, "sign out")
    socket = null; ready = false; recording = false
  }
}
