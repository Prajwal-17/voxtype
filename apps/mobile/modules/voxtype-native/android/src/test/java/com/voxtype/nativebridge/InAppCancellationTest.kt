package com.voxtype.nativebridge

import android.os.Looper
import kotlinx.coroutines.Job
import okhttp3.Request
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class InAppCancellationTest {
  private fun set(name: String, value: Any?) {
    InAppRecorder::class.java.getDeclaredField(name).apply { isAccessible = true }.set(null, value)
  }
  @Test fun cancelStopsPendingCleanupAndDiscardsFinalizingAudio() {
    val file = File(RuntimeEnvironment.getApplication().filesDir, "in-app-cancel.wav").apply { writeText("audio") }
    val job = Job()
    val call = HttpClients.cleanup.newCall(Request.Builder().url("https://example.test").build())
    try {
      set("status", "processing")
      set("pendingFile", file)
      set("processingJob", job)
      set("cleanupCall", call)
      InAppRecorder.cancel()
      shadowOf(Looper.getMainLooper()).idle()
      assertFalse(InAppRecorder.busy)
      assertEquals("idle", InAppRecorder.status)
      assertEquals("", InAppRecorder.text)
      assertTrue(job.isCancelled)
      assertTrue(call.isCanceled())
      assertFalse(file.exists())
      // A second X tap cannot resurrect a result or throw.
      InAppRecorder.cancel()
      assertEquals("idle", InAppRecorder.status)
    } finally { InAppRecorder.cancel(); file.delete() }
  }
}
