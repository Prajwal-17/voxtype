package com.voxtype.nativebridge

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowSystemClock
import java.io.File
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LocalRecoveryTest {
  private val context get() = RuntimeEnvironment.getApplication()
  @Before fun reset() {
    context.deleteDatabase("voxtype.db")
    File(context.filesDir,"recordings").deleteRecursively()
    context.getSharedPreferences("voxtype_local_diagnostics",Context.MODE_PRIVATE).edit().clear().commit()
  }
  @Test fun latestTenRawTakesSurviveRestartAndStayOutOfUploadsAndCloudRestore() {
    val audio = File(context.filesDir,"recordings").apply { mkdirs() }
    VoxTypeStore(context,onChanged={}).use { store ->
      for (i in 0..14) {
        ShadowSystemClock.advanceBy(Duration.ofMillis(100))
        val file=File(audio,"take-$i.wav").apply { writeText("audio $i"); setLastModified(System.currentTimeMillis()) }
        store.save(if(i==14) "other" else "owner","clean $i","private original $i",1000,file,"https://example.test")
      }
      assertEquals(10,audio.listFiles()!!.size)
      assertEquals(9,store.localRecordings("owner").size)
      assertEquals(1,store.localRecordings("other").size)
      assertTrue(store.localRecordings("owner").none { it["originalText"] == "private original 0" })
      for (pending in store.pendingUploads("owner","https://example.test")) {
        assertFalse(pending.payload.has("originalText")); assertFalse(pending.payload.toString().contains("private original"))
        assertTrue(pending.payload.getString("text").startsWith("clean"))
      }
      store.restore("owner","https://example.test",JSONArray().put(JSONObject().put("id","cloud").put("text","clean cloud")
        .put("originalText","remote secret").put("createdAt",1).put("updatedAt",1).put("durationMs",1).put("words",2)))
      assertNull(store.dictations("owner").find { it["id"] == "cloud" }?.get("originalText"))
      assertTrue(store.localRecordings("owner").none { it["originalText"] == "remote secret" })
    }
    VoxTypeStore(context,onChanged={}).use { store ->
      assertEquals(9,store.localRecordings("owner").size)
      val row=store.localRecordings("owner").first()
      assertTrue(store.recoveryAudio("owner",row["id"] as String)!!.isFile)
      assertNull(store.recoveryAudio("other",row["id"] as String))
      // Remote cleaned-history removal cannot erase local recovery.
      store.pendingUploads("owner","https://example.test").forEach { store.acknowledgeUpload(it) }
      store.reconcile("owner","https://example.test",emptySet())
      assertEquals(9,store.localRecordings("owner").size)
    }
  }
  @Test fun versionTwoMigrationSeparatesBoundedOriginalsWithoutDeletingCleanedHistory() {
    val db=context.openOrCreateDatabase("voxtype.db",Context.MODE_PRIVATE,null)
    val schema=context.assets.open("voxtype_schema.sql").bufferedReader().readText().substringBefore("CREATE TABLE local_recordings")
    schema.split(';').map { it.trim() }.filter { it.isNotBlank() }.forEach { db.execSQL(it) }
    for(i in 0..14) db.execSQL("INSERT INTO dictations(id,user_id,text,original_text,created_at,updated_at,duration_ms,word_count,delivery,uploaded) VALUES(?,?,?,?,?,?,1,1,'saved',0)",arrayOf<Any>("legacy-$i","owner","clean $i","raw $i",i,i))
    db.version=2;db.close()
    VoxTypeStore(context,onChanged={}).use { store ->
      assertEquals(10,store.localRecordings("owner").size)
      assertEquals("raw 14",store.localRecordings("owner").first()["originalText"])
      store.prepareUploads("owner","https://example.test")
      assertEquals(15,store.pendingUploads("owner","https://example.test").size)
      assertEquals("clean 0",store.text("legacy-0"))
      assertTrue(store.dictations("owner").all { it["originalText"] == null })
    }
  }
  @Test fun diagnosticsAreRedactedAccountScopedBoundedAndExpireOnRead() {
    val now=LocalDiagnostics.RETENTION_MS+1000
    LocalDiagnostics.append(context,"owner",LocalDiagnostics.Event.recording_started,1000)
    for(i in 0..510) LocalDiagnostics.append(context,"owner",LocalDiagnostics.Event.delivery_recovery,now)
    LocalDiagnostics.append(context,"other",LocalDiagnostics.Event.transcription_failed,now)
    val report=JSONObject(LocalDiagnostics.export(context,"owner",now))
    assertEquals(499,report.getJSONArray("events").length())
    assertFalse(report.toString().contains("owner"));assertFalse(report.toString().contains("other"))
    val event=report.getJSONArray("events").getJSONObject(0)
    assertEquals(setOf("event","timestamp"),event.keys().asSequence().toSet())
    assertEquals("delivery_recovery",event.getString("event"))
    assertEquals(0,JSONObject(LocalDiagnostics.export(context,"owner",now+LocalDiagnostics.RETENTION_MS)).getJSONArray("events").length())
    val persisted=context.getSharedPreferences("voxtype_local_diagnostics",0).getString("events","")
    assertEquals("[]",persisted)
    val untrusted=JSONArray().put(JSONObject().put("timestamp",now).put("event","secret token https://private.example/transcript").put("text","private"))
    assertEquals(0,LocalDiagnostics.trim(untrusted,now).length())
  }
}
