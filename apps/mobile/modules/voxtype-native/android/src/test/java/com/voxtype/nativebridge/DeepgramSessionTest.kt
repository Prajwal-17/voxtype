package com.voxtype.nativebridge

import android.os.Looper
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.ByteString
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import org.robolectric.annotation.experimental.LazyApplication
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE, sdk = [28])
@LooperMode(LooperMode.Mode.PAUSED)
@LazyApplication(LazyApplication.LazyLoad.ON)
class DeepgramSessionTest {
  private lateinit var server: MockWebServer
  private lateinit var session: DeepgramSession
  private val sockets = FakeSockets()
  private var lost = 0

  @Before fun setup() {
    server = MockWebServer()
    server.start()
    repeat(12) { server.enqueue(MockResponse().setBody("""{"data":{"token":"temporary-jwt","expiresIn":60}}""")) }
    session = DeepgramSession({ "account-session" }, { server.url("/").toString() }, { lost++ }, sockets)
  }

  @After fun teardown() { session.close(); server.shutdown() }

  @Test fun capturesBeforeConnectingAndFlushesInOrderBeforeFinalize() {
    session.begin()
    session.audio(byteArrayOf(1, 2))
    session.audio(byteArrayOf(3, 4))
    var result: String? = null
    session.finalize { result = it }
    val socket = awaitSocket()
    assertTrue(socket.packets.isEmpty())
    assertEquals("Bearer temporary-jwt", socket.request.header("Authorization"))
    val tokenRequest = server.takeRequest()
    assertEquals("/v1/speech/token", tokenRequest.path)
    assertEquals("Bearer account-session", tokenRequest.getHeader("Authorization"))
    socket.open()
    assertEquals(listOf("audio:0102", "audio:0304", "Finalize"), socket.packets)
    socket.result(0.0, "First words", true)
    idle(250)
    assertEquals("First words", result)
    assertEquals(0, lost)
  }

  @Test fun aWarmSocketKeepsTakesSeparateAndDoesNotRequestAnotherToken() {
    session.begin()
    val socket = awaitSocket()
    socket.open()
    session.audio(ByteArray(VoxConstants.BYTES_PER_SECOND))
    session.finalize {}
    socket.result(0.0, "First take", true)
    idle(250)
    session.begin()
    session.audio(byteArrayOf(7, 8))
    var result: String? = null
    session.finalize { result = it }
    socket.result(0.0, "Late old result", false)
    socket.result(1.0, "Second take", true)
    idle(250)
    assertEquals("Second take", result)
    assertEquals(1, sockets.values.size)
    assertEquals(1, server.requestCount)
    idle(4_000)
    assertEquals("KeepAlive", socket.packets.last())
    idle(VoxConstants.SOCKET_KEEP_ALIVE_MS)
    assertTrue(socket.canceled)
  }

  @Test fun activeRecordingNeverExpiresAtTheIdleDeadline() {
    session.begin()
    val socket = awaitSocket()
    socket.open()
    idle(VoxConstants.SOCKET_KEEP_ALIVE_MS + 8_000)
    assertFalse(socket.canceled)
    session.audio(byteArrayOf(1, 2))
    assertEquals("audio:0102", socket.packets.last())
  }

  @Test fun cancelDropsQueuedAudioAndIgnoresTheOldConnection() {
    session.begin()
    session.audio(byteArrayOf(1, 2))
    val old = awaitSocket()
    session.abort()
    assertTrue(old.canceled)
    old.open()
    assertTrue(old.packets.isEmpty())
    session.begin()
    session.audio(byteArrayOf(3, 4))
    val next = awaitSocket(2)
    next.open()
    assertEquals(listOf("audio:0304"), next.packets)
  }

  @Test fun timeoutKeepsReceivedTextButRetiresUnconfirmedSocket() {
    session.begin()
    val socket = awaitSocket()
    socket.open()
    session.audio(byteArrayOf(1, 2))
    socket.result(0.0, "Recoverable text", false)
    var result: String? = null
    session.finalize { result = it }
    idle(VoxConstants.FINALIZE_TIMEOUT_MS)
    assertEquals("Recoverable text", result)
    assertTrue(socket.canceled)
  }

  @Test fun failedSendStopsTheTakeAndKeepsPartialText() {
    session.begin()
    val socket = awaitSocket()
    socket.open()
    socket.result(0.0, "Partial", false)
    socket.acceptSends = false
    session.audio(byteArrayOf(1, 2))
    idle()
    assertEquals(1, lost)
    var result: String? = null
    session.finalize { result = it }
    assertEquals("Partial", result)
  }

  @Test fun connectionTimeoutStopsCaptureAndInvalidatesLateOpen() {
    session.begin()
    session.audio(byteArrayOf(1, 2))
    val socket = awaitSocket()
    idle(VoxConstants.CONNECT_TIMEOUT_MS)
    assertEquals(1, lost)
    assertTrue(socket.canceled)
    socket.open()
    assertTrue(socket.packets.isEmpty())
    var result: String? = null
    session.finalize { result = it }
    assertEquals("", result)
  }

  @Test fun closingDuringSetupNeverOpensALateSocket() {
    session.begin()
    session.audio(byteArrayOf(1, 2))
    session.close()
    idle()
    Thread.sleep(50)
    idle()
    assertTrue(sockets.values.isEmpty())
    assertEquals(0, lost)
  }

  @Test fun bufferingIsBoundedAndOverflowIsAnExplicitFailure() {
    session.begin()
    session.audio(ByteArray(VoxConstants.MAX_BUFFERED_AUDIO_BYTES))
    session.audio(byteArrayOf(1, 2))
    idle()
    assertEquals(1, lost)
    val backlog = AudioBacklog()
    assertTrue(backlog.push(byteArrayOf(1, 2)))
    assertTrue(backlog.push(byteArrayOf(3, 4)))
    assertArrayEquals(byteArrayOf(1, 2), backlog.pop())
    backlog.clear()
    assertNull(backlog.pop())
    assertEquals(0, backlog.size)
  }

  private fun awaitSocket(count: Int = 1): FakeSocket {
    val until = System.nanoTime() + 5_000_000_000L
    while (sockets.values.size < count && System.nanoTime() < until) { idle(); Thread.sleep(10) }
    assertEquals(count, sockets.values.size)
    return sockets.values.last()
  }

  private fun idle(ms: Long = 0) { shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(ms)) }

  private inner class FakeSockets : WebSocket.Factory {
    val values = mutableListOf<FakeSocket>()
    override fun newWebSocket(request: Request, listener: WebSocketListener): WebSocket =
      FakeSocket(request, listener).also { values.add(it) }
  }

  private inner class FakeSocket(val request: Request, private val listener: WebSocketListener) : WebSocket {
    val packets = mutableListOf<String>()
    var canceled = false
    var acceptSends = true
    override fun request() = request
    override fun queueSize() = 0L
    override fun send(text: String): Boolean {
      if (!acceptSends) return false
      packets.add(org.json.JSONObject(text).getString("type")); return true
    }
    override fun send(bytes: ByteString): Boolean {
      if (!acceptSends) return false
      packets.add("audio:${bytes.hex()}"); return true
    }
    override fun close(code: Int, reason: String?) = true
    override fun cancel() { canceled = true }
    fun open() {
      listener.onOpen(this, Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(101).message("Switching Protocols").build())
      idle()
    }
    fun result(start: Double, text: String, finalized: Boolean) {
      listener.onMessage(this, """{"type":"Results","is_final":true,"start":$start,"from_finalize":$finalized,"channel":{"alternatives":[{"transcript":"$text"}]}}""")
      idle()
    }
  }
}
