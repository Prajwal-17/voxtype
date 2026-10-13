package com.voxtype.nativebridge

import android.content.Context
import android.os.Looper
import android.view.View
import android.widget.LinearLayout
import kotlinx.coroutines.Job
import okhttp3.Request
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class BubbleCancellationTest {
  private fun field(service: VoxTypeAccessibilityService, name: String): Any? =
    service.javaClass.getDeclaredField(name).apply { isAccessible = true }.get(service)
  private fun set(service: VoxTypeAccessibilityService, name: String, value: Any?) {
    service.javaClass.getDeclaredField(name).apply { isAccessible = true }.set(service, value)
  }
  private fun invoke(service: VoxTypeAccessibilityService, name: String) {
    service.javaClass.getDeclaredMethod(name).apply { isAccessible = true }.invoke(service)
  }
  private fun finish(service: VoxTypeAccessibilityService, text: String) {
    service.javaClass.getDeclaredMethod("finishDictation", String::class.java, String::class.java)
      .apply { isAccessible = true }.invoke(service, text, "https://example.test")
  }
  private fun awaitJob(job: Job?) {
    repeat(100) {
      shadowOf(Looper.getMainLooper()).idle()
      if (job == null || job.isCompleted) return
      Thread.sleep(10)
    }
    fail("Processing did not settle")
  }

  @Test fun recordingControlsStayAtOppositeEndsAndCompactProcessingTapCancels() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      invoke(service, "createBubble")
      set(service, "status", "listening")
      invoke(service, "updateBubbleContent")
      val row = field(service, "actionsRow") as LinearLayout
      val stop = field(service, "doneBtn") as View
      val close = field(service, "cancelBtn") as View
      assertSame(stop, row.getChildAt(0))
      assertSame(close, row.getChildAt(row.childCount - 1))
      assertEquals(View.VISIBLE, row.visibility)
      assertTrue(close.isEnabled)
      assertTrue(stop.isEnabled)
      set(service, "status", "processing")
      invoke(service, "updateBubbleContent")
      assertEquals(View.GONE, row.visibility)
      assertEquals(View.VISIBLE, (field(service, "spinner") as View).visibility)
      val root = field(service, "bubble") as View
      assertTrue(root.contentDescription.toString().contains("Tap to cancel"))
      val job = Job()
      val call = HttpClients.cleanup.newCall(Request.Builder().url("https://example.test").build())
      set(service, "processingJob", job)
      set(service, "cleanupCall", call)
      val before = field(service, "lifecycleGeneration") as Int
      root.performClick()
      assertEquals("idle", service.status)
      assertTrue(job.isCancelled)
      assertTrue(call.isCanceled())
      assertTrue((field(service, "lifecycleGeneration") as Int) > before)
      assertNull(field(service, "recordingUserId"))
    } finally { controller.destroy() }
  }

  @Test fun dragToCloseDiscardsInsteadOfFinishingTheRecording() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    val file = File(service.filesDir, "cancel-test.wav").apply { writeText("audio") }
    try {
      set(service, "status", "listening")
      set(service, "recordingUserId", "owner")
      set(service, "recordingFile", file)
      set(service, "closeHot", true)
      service.javaClass.getDeclaredMethod("finishDrag", Boolean::class.javaPrimitiveType,
        Float::class.javaPrimitiveType, Float::class.javaPrimitiveType)
        .apply { isAccessible = true }.invoke(service, true, 0f, 0f)
      assertEquals("idle", service.status)
      assertEquals(true, field(service, "dismissedForKeyboard"))
      assertNull(field(service, "recordingUserId"))
      assertFalse(file.exists())
      assertNull(field(service, "processingJob"))
    } finally { controller.destroy(); file.delete() }
  }

  @Test fun cancelAfterFinalResultsSuppressesQueuedSaveAndDelivery() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    val user = "canceled-owner"
    val file = File(service.filesDir, "cancel-pending.wav").apply { writeText("audio") }
    try {
      service.getSharedPreferences("voxtype_session", Context.MODE_PRIVATE).edit().putString("userId", user).apply()
      set(service, "status", "processing")
      set(service, "recordingUserId", user)
      set(service, "recordingFile", file)
      finish(service, "Must never be saved or pasted")
      val job = field(service, "processingJob") as Job
      invoke(service, "cancelRecording")
      awaitJob(job)
      finish(service, "Late final callback")
      VoxTypeStore(service).use { assertTrue(it.dictations(user).isEmpty()) }
      assertEquals("idle", service.status)
      assertNull(field(service, "lastSavedId"))
      assertFalse(file.exists())
    } finally { controller.destroy(); file.delete() }
  }

  @Test fun uncanceledCompletionStillSavesTheTranscript() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    val user = "finished-owner"
    try {
      service.getSharedPreferences("voxtype_session", Context.MODE_PRIVATE).edit().putString("userId", user).apply()
      set(service, "status", "processing")
      set(service, "recordingUserId", user)
      finish(service, "Keep this finished transcript")
      awaitJob(field(service, "processingJob") as Job)
      VoxTypeStore(service).use { store ->
        assertEquals(1, store.dictations(user).size)
        assertEquals("Keep this finished transcript", store.dictations(user).first()["text"])
      }
      assertEquals("saved", service.status)
    } finally { controller.destroy() }
  }
}
