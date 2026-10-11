package com.voxtype.nativebridge

import org.junit.Assert.*
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import org.json.JSONArray
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class CloudRestoreTest {
  private val context get() = RuntimeEnvironment.getApplication()
  private val url = "https://example.test"
  @Before fun reset() { context.deleteDatabase("voxtype.db") }
  private fun row(id: String) = JSONObject().put("id", id).put("text", "Cloud transcript")
    .put("createdAt", 1000).put("updatedAt", 1000).put("durationMs", 3000).put("words", 2)

  @Test fun freshInstallRestoresHistoryWithoutReuploadingIt() {
    VoxTypeStore(context, onChanged = {}).use { store ->
      val rows = JSONArray().put(row("cloud-1"))
      store.restore("owner", url, rows)
      store.restore("owner", url, rows)
      assertEquals(1, store.dictations("owner").size)
      assertTrue(store.dictations("other").isEmpty())
      assertTrue(store.pendingUploads("owner", url).isEmpty())
    }
    // A new store instance represents the next launch, not an in-memory cache.
    VoxTypeStore(context, onChanged = {}).use { assertEquals("Cloud transcript", it.text("cloud-1")) }
  }

  @Test fun restoreDoesNotOverwriteUnsentLocalText() {
    VoxTypeStore(context, onChanged = {}).use { store ->
      val id = store.save("owner", "Unsent text", "Unsent text", 3000, null, url)
      store.restore("owner", url, JSONArray().put(row(id)))
      assertEquals("Unsent text", store.text(id))
      assertEquals(1, store.pendingUploads("owner", url).size)
    }
  }

  @Test fun cloudDeletionRemovesOnlySyncedRowsOfItsAccount() {
    VoxTypeStore(context, onChanged = {}).use { store ->
      val pending = store.save("owner", "Not uploaded", "Not uploaded", 3000, null, url)
      store.restore("owner", url, JSONArray().put(row("deleted")))
      store.restore("other", url, JSONArray().put(row("other-record")))
      store.reconcile("owner", url, emptySet())
      assertNull(store.text("deleted"))
      assertEquals("Not uploaded", store.text(pending))
      assertEquals(1, store.dictations("other").size)
    }
  }

  @Test fun invalidPageRollsBackAndDoesNotPartiallyRestore() {
    VoxTypeStore(context, onChanged = {}).use { store ->
      try {
        store.restore("owner", url, JSONArray().put(row("valid")).put(JSONObject().put("id", "broken")))
        fail("Invalid cloud page must fail")
      } catch (_: org.json.JSONException) { }
      assertTrue(store.dictations("owner").isEmpty())
    }
  }
  @Test fun searchFiltersTheWholeAccountCacheBeforePaginationAndTreatsWildcardsLiterally() {
    VoxTypeStore(context,onChanged = {}).use { store ->
      val rows = JSONArray()
      for (i in 0..25) rows.put(row("record-$i").put("text", if(i<13) "MATCH $i" else "other $i").put("createdAt",i))
      rows.put(row("literal").put("text","100%_exact"))
      store.restore("owner",url,rows)
      store.restore("other",url,JSONArray().put(row("secret").put("text","MATCH secret")))
      val first=store.page("owner",null,"match")
      assertEquals(12,(first["items"] as List<*>).size)
      val second=store.page("owner",first["nextCursor"] as String,"match")
      assertEquals(1,(second["items"] as List<*>).size)
      assertEquals(1,(store.page("owner",null,"%_")["items"] as List<*>).size)
      assertTrue((store.page("owner",null,"secret")["items"] as List<*>).isEmpty())
    }
  }

  @Test fun failedCloudDeleteKeepsPendingTextAndSuccessIsAccountScoped() {
    var account = Triple("owner",url,"bearer")
    var deletedId=""
    VoxTypeStore(context,onChanged = {}).use { store ->
      deletedId=store.save("owner","Pending text","Pending text",1000,null,url)
      store.restore("other",url,JSONArray().put(row("other-record")))
    }
    fun client(code:Int)=okhttp3.OkHttpClient.Builder().addInterceptor { chain ->
      okhttp3.Response.Builder().request(chain.request()).protocol(okhttp3.Protocol.HTTP_1_1)
        .code(code).message("test").body("".toResponseBody()).build()
    }.build()
    try {
      kotlinx.coroutines.runBlocking { TranscriptUploads.delete(context,deletedId,{ account },client(503)) }
      fail("Cloud failure must preserve the local record")
    } catch (_: java.io.IOException) { }
    VoxTypeStore(context,onChanged = {}).use { assertEquals("Pending text",it.text(deletedId)) }
    val changedAccount = okhttp3.OkHttpClient.Builder().addInterceptor { chain ->
      account = Triple("other",url,"other-bearer")
      okhttp3.Response.Builder().request(chain.request()).protocol(okhttp3.Protocol.HTTP_1_1)
        .code(204).message("test").body("".toResponseBody()).build()
    }.build()
    try {
      kotlinx.coroutines.runBlocking { TranscriptUploads.delete(context,deletedId,{ account },changedAccount) }
      fail("An account switch must not remove the original account’s cache")
    } catch (_: java.io.IOException) { }
    VoxTypeStore(context,onChanged = {}).use { assertEquals("Pending text",it.text(deletedId)) }
    account = Triple("owner",url,"bearer")
    kotlinx.coroutines.runBlocking { TranscriptUploads.delete(context,deletedId,{ account },client(204)) }
    VoxTypeStore(context,onChanged = {}).use { assertNull(it.text(deletedId));assertNotNull(it.text("other-record")) }
  }

}
