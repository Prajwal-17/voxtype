package com.voxtype.nativebridge

import android.app.Notification
import android.content.Context
import android.content.Intent
import android.os.Looper
import kotlinx.coroutines.Job
import okhttp3.Request
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import org.robolectric.shadow.api.Shadow
import org.robolectric.shadows.ShadowAccessibilityService
import java.io.File
import java.time.Duration

@Implements(android.accessibilityservice.AccessibilityService::class)
class PaymentAccessibilityShadow : ShadowAccessibilityService() {
  var disabled = false
  @Implementation fun disableSelf() { disabled = true }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33, 35], shadows = [PaymentAccessibilityShadow::class])
class PaymentPauseTest {
  private fun set(service: VoxTypeAccessibilityService, name: String, value: Any?) {
    service.javaClass.getDeclaredField(name).apply { isAccessible = true }.set(service, value)
  }
  private fun field(service: VoxTypeAccessibilityService, name: String): Any? =
    service.javaClass.getDeclaredField(name).apply { isAccessible = true }.get(service)
  private fun invoke(service: VoxTypeAccessibilityService, name: String) {
    service.javaClass.getDeclaredMethod(name).apply { isAccessible = true }.invoke(service)
  }

  @Test fun pauseRevokesAccessAndCancelsPendingDeliveryWithoutAnAutomaticRestart() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    val audio = File(service.filesDir, "payments-pending.wav").apply { writeText("audio") }
    try {
      service.getSharedPreferences("voxtype_session", Context.MODE_PRIVATE).edit()
        .putString("userId", "owner").apply()
      VoxTypeStore(service).use { it.bubbleEnabled = true }
      set(service, "connected", true)
      invoke(service, "updateBubbleForeground")
      invoke(service, "createBubble")
      set(service, "status", "processing")
      set(service, "recordingUserId", "owner")
      set(service, "recordingFile", audio)
      val job = Job()
      val call = HttpClients.cleanup.newCall(Request.Builder().url("https://example.test").build())
      set(service, "processingJob", job)
      set(service, "cleanupCall", call)
      val generation = field(service, "lifecycleGeneration") as Int
      service.pauseForPayments()
      assertTrue(Shadow.extract<PaymentAccessibilityShadow>(service).disabled)
      assertFalse(service.connected)
      assertEquals("payments_paused", service.hiddenReason)
      assertEquals("idle", service.status)
      assertEquals("none", service.foregroundStatus)
      assertNull(field(service, "bubble"))
      assertNull(field(service, "target"))
      assertNull(field(service, "recordingUserId"))
      assertTrue(job.isCancelled)
      assertTrue(call.isCanceled())
      assertFalse(audio.exists())
      assertTrue((field(service, "lifecycleGeneration") as Int) > generation)
      service.refreshBubble()
      shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(10))
      assertFalse(service.connected)
      assertEquals("none", service.foregroundStatus)
      assertNull(field(service, "bubble"))
      // Preserve the preference so re-enabling access restores the user's bubble.
      VoxTypeStore(service).use { assertTrue(it.bubbleEnabled) }
    } finally { controller.destroy(); audio.delete() }
  }

  @Test fun notificationPauseActionTargetsThePrivateReceiverAndDisablesAccess() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      service.getSharedPreferences("voxtype_session", Context.MODE_PRIVATE).edit()
        .putString("userId", "owner").apply()
      VoxTypeStore(service).use { it.bubbleEnabled = true }
      set(service, "connected", true)
      invoke(service, "updateBubbleForeground")
      val notification: Notification = shadowOf(service).lastForegroundNotification
      val action = notification.actions.single { it.title.toString() == "Pause for payments" }
      val intent = shadowOf(action.actionIntent).savedIntent
      assertEquals(PauseBubbleReceiver::class.java.name, intent.component?.className)
      val receiver = service.packageManager.getReceiverInfo(intent.component!!, 0)
      assertFalse(receiver.exported)
      PauseBubbleReceiver().onReceive(service, Intent(intent))
      assertTrue(Shadow.extract<PaymentAccessibilityShadow>(service).disabled)
      assertFalse(service.connected)
    } finally { controller.destroy() }
  }
}
