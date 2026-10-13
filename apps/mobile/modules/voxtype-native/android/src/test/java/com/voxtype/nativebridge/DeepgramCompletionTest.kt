package com.voxtype.nativebridge

import android.os.Looper
import okhttp3.*
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.ByteString
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.IOException
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class DeepgramCompletionTest {
  private class Socket(private val req: Request) : WebSocket {
    val sent = mutableListOf<String>()
    override fun request() = req
    override fun queueSize() = 0L
    override fun send(text: String): Boolean { sent += text; return true }
    override fun send(bytes: ByteString): Boolean { sent += "audio"; return true }
    override fun close(code: Int, reason: String?) = true
    override fun cancel() {}
  }
  private class Factory : WebSocket.Factory {
    @Volatile var socket: Socket? = null
    @Volatile var listener: WebSocketListener? = null
    override fun newWebSocket(request: Request, listener: WebSocketListener): WebSocket {
      this.listener = listener
      return Socket(request).also { socket = it }
    }
  }
  private fun response(request: Request) = Response.Builder().request(request).protocol(Protocol.HTTP_1_1)
    .code(200).message("OK").body("""{"data":{"token":"test"}}""".toResponseBody()).build()
  private fun final(text: String, start: Int = 0) = """{"type":"Results","is_final":true,"start":$start,"channel":{"alternatives":[{"transcript":"$text"}]}}"""
  private fun idle() { shadowOf(Looper.getMainLooper()).idle() }
  private fun opened(factory: Factory) : Pair<Socket, WebSocketListener> {
    repeat(100) { if (factory.socket == null) { Thread.sleep(10); idle() } }
    val socket = requireNotNull(factory.socket)
    val listener = requireNotNull(factory.listener)
    listener.onOpen(socket, response(socket.request())); idle()
    return socket to listener
  }
  private fun session(factory: Factory) = DeepgramSession({ "test" }, { "https://example.test" }, {}, factory,
    OkHttpClient.Builder().addInterceptor { response(it.request()) }.build())

  @Test fun dictionaryTermsAreEncodedAsSeparateKeytermParameters() {
    val factory = Factory()
    val terms = listOf("C++", "A&B", "नमस्ते", "two words")
    val stream = DeepgramSession({ "test" }, { "https://example.test" }, {}, factory,
      OkHttpClient.Builder().addInterceptor { response(it.request()) }.build(), vocabulary = { terms })
    try {
      stream.begin()
      val (socket, _) = opened(factory)
      assertEquals(terms, socket.request().url.queryParameterValues("keyterm"))
      assertEquals("nova-3", socket.request().url.queryParameter("model"))
    } finally { stream.close() }
  }

  @Test fun editorWarmupConnectsWithoutSendingAudioAndIsReusedOnBegin() {
    val factory = Factory(); val stream = session(factory)
    try {
      stream.warm(); val (socket, _) = opened(factory)
      assertTrue(socket.sent.isEmpty())
      stream.begin(); stream.audio(ByteArray(3200))
      assertSame(socket, factory.socket)
      assertEquals(listOf("audio"), socket.sent)
    } finally { stream.close() }
  }

  @Test fun alreadyFinalSpeechCompletesOnMetadataWithoutFiveSecondWait() {
    val factory = Factory(); val stream = session(factory)
    try {
      stream.begin(); val (socket, listener) = opened(factory)
      listener.onMessage(socket, final("Hello")); idle()
      var result: String? = null
      stream.finalize { result = it }
      assertEquals("""{"type":"CloseStream"}""", socket.sent.last())
      listener.onMessage(socket, """{"type":"Metadata"}"""); idle()
      assertEquals("Hello", result)
    } finally { stream.close() }
  }

  @Test fun finalWordsArrivingAfterStopAreIncludedExactlyOnce() {
    val factory = Factory(); val stream = session(factory)
    try {
      stream.begin(); val (socket, listener) = opened(factory)
      listener.onMessage(socket, final("Hello")); idle()
      var result = ""; var count = 0
      stream.finalize { result = it; count++ }
      listener.onMessage(socket, final("world", 1))
      listener.onMessage(socket, """{"type":"Metadata"}""")
      listener.onClosed(socket, 1000, "done"); idle()
      assertEquals("Hello world", result); assertEquals(1, count)
    } finally { stream.close() }
  }

  @Test fun stoppingDuringConnectionFlushesAudioBeforeCloseStream() {
    val factory = Factory(); val stream = session(factory)
    try {
      stream.begin(); stream.audio(ByteArray(3200))
      var result: String? = null
      stream.finalize { result = it }
      val (socket, listener) = opened(factory)
      assertEquals(listOf("audio", """{"type":"CloseStream"}"""), socket.sent)
      listener.onMessage(socket, final("Quick take"))
      listener.onMessage(socket, """{"type":"Metadata"}"""); idle()
      assertEquals("Quick take", result)
    } finally { stream.close() }
  }

  @Test fun losingTheConnectionWhileFinalizingNeverReportsSuccessOrReconnectsTheTake() {
    val factory = Factory()
    var failed = 0; var completed = 0
    val stream = DeepgramSession({ "test" }, { "https://example.test" }, { failed++ }, factory,
      OkHttpClient.Builder().addInterceptor { response(it.request()) }.build())
    try {
      stream.begin(); val (socket, listener) = opened(factory)
      listener.onMessage(socket, final("Partial speech")); idle()
      stream.finalize { completed++ }
      listener.onFailure(socket, IOException("offline"), null); idle()
      listener.onMessage(socket, """{"type":"Metadata"}""")
      listener.onClosed(socket, 1000, "late close"); idle()
      shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(30))
      assertEquals(1, failed)
      assertEquals(0, completed)
      assertSame(socket, factory.socket)
    } finally { stream.close() }
  }

  @Test fun finalizationDeadlineShowsFailureInsteadOfAnEmptyDoneState() {
    val factory = Factory(); var failed = 0; var completed = 0
    val stream = DeepgramSession({ "test" }, { "https://example.test" }, { failed++ }, factory,
      OkHttpClient.Builder().addInterceptor { response(it.request()) }.build())
    try {
      stream.begin(); opened(factory)
      stream.finalize { completed++ }
      shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(VoxConstants.FINALIZE_TIMEOUT_MS + 1))
      assertEquals(1, failed)
      assertEquals(0, completed)
    } finally { stream.close() }
  }
}
