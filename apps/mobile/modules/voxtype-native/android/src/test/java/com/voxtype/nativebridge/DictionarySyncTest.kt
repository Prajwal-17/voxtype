package com.voxtype.nativebridge

import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.Protocol
import okhttp3.ResponseBody.Companion.toResponseBody
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class DictionarySyncTest {
  private val context get() = RuntimeEnvironment.getApplication()
  private val url = "https://example.test"
  private val alice = Triple("alice", url, "alice-token")
  @Before fun reset() {
    context.deleteDatabase("voxtype.db")
    context.getSharedPreferences("voxtype_dictionary", 0).edit().clear().commit()
    context.getSharedPreferences("voxtype_session", 0).edit().clear().commit()
  }
  private fun client(body: String, code: Int = 200, inspect: (okhttp3.Request) -> Unit = {}) = OkHttpClient.Builder().addInterceptor {
    inspect(it.request())
    Response.Builder().request(it.request()).protocol(Protocol.HTTP_1_1).code(code).message("test").body(body.toResponseBody()).build()
  }.build()
  @Test fun legacyWordsAreClaimedOnceAndPreservedOffline() {
    VoxTypeStore(context).use { it.legacyVocabulary = listOf("VoxType", "voxtype", "नमस्ते") }
    val first = DictionarySync.pendingImport(context, "alice", url)!!
    assertEquals(first.toString(), DictionarySync.pendingImport(context, "alice", url)!!.toString())
    assertNull(DictionarySync.pendingImport(context, "bob", url))
    assertEquals(listOf("VoxType", "नमस्ते"), DictionarySync.cached(context, "alice", url))
    assertTrue(DictionarySync.cached(context, "bob", url).isEmpty())
    assertTrue(DictionarySync.cached(context).isEmpty()) // Signed out recording cannot see another account's words.
  }
  @Test fun serverWordsReplaceCacheAndRecordingsReadOnlyActiveAccount() = runBlocking {
    DictionarySync.exchange(context, "alice", null, true, { alice }, client("""{"terms":["Desktop word"]}""") {
      assertEquals("Bearer alice-token", it.header("Authorization")); assertEquals("GET", it.method)
    })
    context.getSharedPreferences("voxtype_session", 0).edit().putString("userId", "alice").putString("apiUrl", url).commit()
    VoxTypeStore(context).use { assertEquals(listOf("Desktop word"), it.vocabulary) }
    context.getSharedPreferences("voxtype_session", 0).edit().putString("userId", "bob").commit()
    VoxTypeStore(context).use { assertTrue(it.vocabulary.isEmpty()) }
    assertTrue(DictionarySync.cached(context, "alice", "https://other.test").isEmpty())
  }
  @Test fun updatesSendBaseAndFailureDoesNotOverwriteCache() = runBlocking {
    DictionarySync.exchange(context, "alice", null, true, { alice }, client("""{"terms":["Saved"]}"""))
    val patch = JSONObject("""{"base":["Saved"],"terms":["Saved","New"]}""")
    try {
      DictionarySync.exchange(context, "alice", patch, true, { alice }, client("unavailable", 503) {
        assertEquals("PATCH", it.method)
        val body = okio.Buffer(); it.body!!.writeTo(body)
        assertEquals(patch.toString(), body.readUtf8())
      }); fail("Failed saves must reject")
    } catch (_: IllegalStateException) {}
    assertEquals(listOf("Saved"), DictionarySync.cached(context, "alice", url))
  }
  @Test fun accountSwitchDuringRequestCannotApplyResponse() = runBlocking {
    var account: Triple<String, String, String>? = alice
    try {
      DictionarySync.exchange(context, "alice", null, true, { account }, client("""{"terms":["Wrong account"]}""") { account = Triple("bob", url, "bob-token") })
      fail("Changed accounts must reject")
    } catch (_: IllegalStateException) {}
    assertTrue(DictionarySync.cached(context, "alice", url).isEmpty())
    assertTrue(DictionarySync.cached(context, "bob", url).isEmpty())
  }
  @Test fun successfulImportIsNotRepeatedOnRefresh() = runBlocking {
    VoxTypeStore(context).use { it.legacyVocabulary = listOf("Legacy") }
    DictionarySync.exchange(context, "alice", null, true, { alice }, client("""{"terms":["Legacy"]}""") { assertEquals("PATCH", it.method) })
    DictionarySync.exchange(context, "alice", null, true, { alice }, client("""{"terms":[]}""") { assertEquals("GET", it.method) })
    assertTrue(DictionarySync.cached(context, "alice", url).isEmpty())
    assertNull(DictionarySync.pendingImport(context, "alice", url))
  }
  @Test fun backgroundDictionaryRefreshNeverClosesAnActiveRecording() {
    val controller = org.robolectric.Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    val engine = org.mockito.Mockito.mock(DeepgramSession::class.java)
    val engineField = service.javaClass.getDeclaredField("engine").apply { isAccessible = true }
    val statusField = service.javaClass.getDeclaredField("status").apply { isAccessible = true }
    try {
      engineField.set(service, engine)
      for (status in listOf("connecting", "listening", "processing")) {
        statusField.set(service, status)
        service.refreshVocabulary()
        assertSame(engine, engineField.get(service))
      }
      org.mockito.Mockito.verify(engine, org.mockito.Mockito.never()).close()
      statusField.set(service, "idle")
      service.refreshVocabulary()
      org.mockito.Mockito.verify(engine).close()
      assertNull(engineField.get(service))
    } finally { controller.destroy() }
  }

}
