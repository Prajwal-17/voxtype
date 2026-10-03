package com.voxtype.nativebridge

import android.app.Notification
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Looper
import android.view.inputmethod.EditorInfo
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.Duration

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33, 35])
class BubbleLifecycleTest {
  private fun invoke(service: VoxTypeAccessibilityService, name: String) {
    service.javaClass.getDeclaredMethod(name).apply { isAccessible = true }.invoke(service)
  }
  private fun field(service: VoxTypeAccessibilityService, name: String): Any? =
    service.javaClass.getDeclaredField(name).apply { isAccessible = true }.get(service)
  private fun set(service: VoxTypeAccessibilityService, name: String, value: Any) {
    service.javaClass.getDeclaredField(name).apply { isAccessible = true }.set(service, value)
  }
  private fun enable(service: VoxTypeAccessibilityService) {
    // Notification tests need account presence only; no bearer or provider connection.
    service.getSharedPreferences("voxtype_session", Context.MODE_PRIVATE)
      .edit().putString("userId", "test-user").apply()
    VoxTypeStore(service).use { it.bubbleEnabled = true }
    set(service, "connected", true)
    invoke(service, "updateBubbleForeground")
  }

  @Test fun enabledBubbleKeepsIdleForegroundWithoutCapturingAudio() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      enable(service)
      val notification = shadowOf(service).lastForegroundNotification
      assertNotNull(notification)
      assertEquals("VoxType voice bubble is ready", notification.extras.getString(Notification.EXTRA_TITLE))
      assertNull(field(service, "capture"))
      assertEquals(if (android.os.Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        else ServiceInfo.FOREGROUND_SERVICE_TYPE_NONE, service.foregroundServiceType)
      VoxTypeStore(service).use { it.bubbleEnabled = false }
      invoke(service, "updateBubbleForeground")
      assertTrue(shadowOf(service).isForegroundStopped)
      assertEquals("NONE", field(service, "foregroundMode").toString())
    } finally { controller.destroy() }
  }

  @Test fun finishingMicrophoneRestoresReadyNotificationAndDropsMicrophoneType() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      enable(service)
      invoke(service, "showMicrophoneNotification")
      assertTrue(service.foregroundServiceType and ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE != 0)
      invoke(service, "releaseMicrophoneForeground")
      assertEquals("VoxType voice bubble is ready",
        shadowOf(service).lastForegroundNotification.extras.getString(Notification.EXTRA_TITLE))
      assertEquals(0, service.foregroundServiceType and ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } finally { controller.destroy() }
  }

  @Test fun foregroundRestrictionDoesNotDisconnectServiceAndCanBeRetried() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      shadowOf(service).setThrowInStartForeground(SecurityException("Background restriction"))
      enable(service)
      assertTrue(service.connected)
      assertEquals("NONE", field(service, "foregroundMode").toString())
      assertNull(field(service, "capture"))
      shadowOf(service).setThrowInStartForeground(null)
      invoke(service, "updateBubbleForeground")
      assertEquals("BUBBLE", field(service, "foregroundMode").toString())
    } finally { controller.destroy() }
  }

  @Test fun signOutRemovesIdleNotificationAndBubble() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      enable(service)
      invoke(service, "createBubble")
      NativeSession(service).clear()
      service.onSignOut()
      assertTrue(shadowOf(service).isForegroundStopped)
      assertNull(field(service, "bubble"))
      assertEquals("NONE", field(service, "foregroundMode").toString())
    } finally { controller.destroy() }
  }

  @Test fun editorCallbackRetriesWhenWindowFocusEventArrivedTooEarly() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      set(service, "connected", true)
      invoke(service, "createBubble")
      val input = service.onCreateInputMethod()
      input.onStartInput(EditorInfo(), false)
      assertNotNull(field(service, "bubble"))
      shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(VoxConstants.BUBBLE_REFRESH_DELAY_MS))
      // No safe field/session: the delayed refresh ran and removed the stale overlay.
      assertNull(field(service, "bubble"))
    } finally { controller.destroy() }
  }

  @Test fun unbindRemovesOverlayAndNotificationWithoutDisablingPreference() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      enable(service)
      invoke(service, "createBubble")
      service.onUnbind(Intent())
      assertFalse(service.connected)
      assertNull(field(service, "bubble"))
      assertTrue(shadowOf(service).isForegroundStopped)
      VoxTypeStore(service).use { assertTrue(it.bubbleEnabled) }
      // Android can bind the same service again; its ready notification must return.
      invoke(service, "onServiceConnected")
      assertTrue(service.connected)
      assertEquals("VoxType voice bubble is ready",
        shadowOf(service).lastForegroundNotification.extras.getString(Notification.EXTRA_TITLE))
    } finally { controller.destroy() }
  }
}
