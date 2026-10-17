package com.voxtype.nativebridge

import java.io.File
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.Protocol
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class RecordingRetryTest {
  private val context get() = RuntimeEnvironment.getApplication()
  private val api = "https://example.test"
  private val account = Triple("owner",api,"test-bearer")
  @Before fun reset() { context.deleteDatabase("voxtype.db"); File(context.filesDir,"recordings").deleteRecursively() }
  private fun audio(name: String, minutes: Int = 4) = File(File(context.filesDir,"recordings").apply { mkdirs() },name).apply {
    outputStream().use { it.write(ByteArray(44)); repeat(minutes*60) { _ -> it.write(ByteArray(32000)) } }
  }
  private fun client(body: String, code: Int = 200, onRequest: (okhttp3.Request) -> Unit = {}) = OkHttpClient.Builder().addInterceptor {
    onRequest(it.request())
    Response.Builder().request(it.request()).protocol(Protocol.HTTP_1_1).code(code).message("test").body(body.toResponseBody()).build()
  }.build()
  private val tokenClient get() = client("""{"data":{"token":"temporary-test-token"}}""")

  @Test fun fourMinuteFailureSurvivesLateStopAndRestartWhileCancelDiscards() {
    val failed = RecordingRecovery(context,"owner",api)
    failed.received("Plan received before connection loss")
    // An asynchronous stop can arrive after the UI has already started the next take.
    val next = RecordingRecovery(context,"owner",api)
    val original = audio("failed.wav")
    failed.stopped(original,240_000)
    VoxTypeStore(context,onChanged={}).use {
      assertTrue(original.exists())
      assertEquals("Plan received before connection loss",it.localRecordings("owner").first()["originalText"])
      assertEquals(240_000L,it.localRecordings("owner").first()["durationMs"])
      assertTrue(it.dictations("owner").isEmpty())
    }
    next.discard()
    val cancelled = audio("cancelled.wav",1)
    next.stopped(cancelled,60_000)
    assertFalse(cancelled.exists())
    VoxTypeStore(context,onChanged={}).use { assertEquals(1,it.localRecordings("owner").size) }
  }
  @Test fun retryReplacesOneTranscriptAndRawOriginalWithoutChangingIdTimeOrAudio() = runBlocking {
    val file=audio("retry.wav")
    val id=VoxTypeStore(context,onChanged={}).use { it.save("owner","Old cleaned","Old raw",240_000,file,api) }
    var transferred=0L
    val provider=client("""{"results":{"channels":[{"alternatives":[{"transcript":"Recovered full plan"}]}]}}""") { request ->
      assertEquals("Bearer temporary-test-token",request.header("Authorization"))
      val sink=okio.Buffer();requireNotNull(request.body).writeTo(sink);transferred=sink.size
      assertEquals("audio/wav",request.body!!.contentType().toString())
    }
    repeat(2) {
      assertEquals("Recovered full plan",RecordingTranscription.regenerate(context,id,"owner",{account},tokenClient,provider,{}))
    }
    assertEquals(file.length(),transferred)
    VoxTypeStore(context,onChanged={}).use {
      assertEquals(1,it.dictations("owner").size)
      assertEquals(id,it.dictations("owner").single()["id"])
      assertEquals("Recovered full plan",it.text(id))
      assertEquals("Recovered full plan",it.localRecordings("owner").single()["originalText"])
      assertFalse(it.pendingUploads("owner",api).single().payload.has("originalText"))
      assertEquals(file,it.recoveryAudio("owner",id));assertTrue(file.exists())
    }
  }
  @Test fun failedEmptyAndAccountChangedRetriesKeepExistingTextAndAudio() = runBlocking {
    val file=audio("unchanged.wav",1)
    val id=VoxTypeStore(context,onChanged={}).use { it.save("owner","Keep cleaned","Keep original",60_000,file,api) }
    for(provider in listOf(client("failure",503),client("""{"results":{"channels":[{"alternatives":[{"transcript":""}]}]}}"""))) {
      try { RecordingTranscription.regenerate(context,id,"owner",{account},tokenClient,provider,{});fail("Retry must fail") } catch(_:IllegalStateException) {}
    }
    var current=account
    val changed=client("""{"results":{"channels":[{"alternatives":[{"transcript":"Wrong account text"}]}]}}""") { current=Triple("other",api,"other-bearer") }
    try { RecordingTranscription.regenerate(context,id,"owner",{current},tokenClient,changed,{});fail("Account change must fail") } catch(_:IllegalStateException) {}
    VoxTypeStore(context,onChanged={}).use {
      assertEquals("Keep cleaned",it.text(id));assertEquals("Keep original",it.localRecordings("owner").single()["originalText"])
      assertTrue(it.localRecordings("other").isEmpty());assertTrue(file.exists())
    }
  }
  @Test fun failedInAppTakeRemainsAfterUiResetAndCanCreateItsFirstTranscript() = runBlocking {
    val file=audio("failed-in-app.wav")
    val take=RecordingRecovery(context,"owner",api)
    take.stopped(file,240_000)
    take.received("Partial plan")
    fun set(name:String,value:Any?) { InAppRecorder::class.java.getDeclaredField(name).apply { isAccessible=true }.set(null,value) }
    set("recovery",take);set("status","processing");set("pendingFile",file)
    InAppRecorder.fail("Connection failed")
    assertEquals("error",InAppRecorder.status)
    // Resetting the error UI is not an explicit cancellation of the already failed take.
    InAppRecorder.cancel()
    assertTrue(file.exists())
    val provider=client("""{"results":{"channels":[{"alternatives":[{"transcript":"Entire recovered plan"}]}]}}""")
    RecordingTranscription.regenerate(context,take.id,"owner",{account},tokenClient,provider,{})
    VoxTypeStore(context,onChanged={}).use {
      assertEquals(1,it.dictations("owner").size)
      assertEquals(take.id,it.dictations("owner").single()["id"])
      assertEquals(take.createdAt,it.dictations("owner").single()["createdAt"])
      assertEquals("Entire recovered plan",it.text(take.id))
    }
  }
  @Test fun simultaneousRetriesSendOnlyOneProviderRequest() {
    val file=audio("once.wav",1)
    val id=VoxTypeStore(context,onChanged={}).use { it.save("owner","Old","Old",60_000,file,api) }
    val entered=java.util.concurrent.CountDownLatch(1)
    val release=java.util.concurrent.CountDownLatch(1)
    val requests=java.util.concurrent.atomic.AtomicInteger()
    val executor=java.util.concurrent.Executors.newSingleThreadExecutor()
    val provider=client("""{"results":{"channels":[{"alternatives":[{"transcript":"New plan"}]}]}}""") {
      requests.incrementAndGet();entered.countDown();assertTrue(release.await(10,java.util.concurrent.TimeUnit.SECONDS))
    }
    try {
      val first=executor.submit<String> { runBlocking { RecordingTranscription.regenerate(context,id,"owner",{account},tokenClient,provider,{}) } }
      assertTrue(entered.await(10,java.util.concurrent.TimeUnit.SECONDS))
      try { runBlocking { RecordingTranscription.regenerate(context,id,"owner",{account},tokenClient,provider,{}) };fail("Concurrent retry must be rejected") }
      catch(_:IllegalStateException) {}
      release.countDown();assertEquals("New plan",first.get(10,java.util.concurrent.TimeUnit.SECONDS))
      assertEquals(1,requests.get())
    } finally { release.countDown();executor.shutdownNow() }
  }
  @Test fun aPrunedTakeCannotBeResurrectedByALateProviderResponse() = runBlocking {
    val file=audio("pruned.wav",1)
    val id=VoxTypeStore(context,onChanged={}).use { it.save("owner","Keep existing","Old raw",60_000,file,api) }
    val provider=client("""{"results":{"channels":[{"alternatives":[{"transcript":"Late response"}]}]}}""") {
      VoxTypeStore(context,onChanged={}).use { it.discardRecovery("owner",id) }
    }
    try { RecordingTranscription.regenerate(context,id,"owner",{account},tokenClient,provider,{});fail("Pruned take must fail") }
    catch(_:IllegalStateException) {}
    VoxTypeStore(context,onChanged={}).use { assertEquals("Keep existing",it.text(id));assertEquals(1,it.dictations("owner").size) }
  }

}
