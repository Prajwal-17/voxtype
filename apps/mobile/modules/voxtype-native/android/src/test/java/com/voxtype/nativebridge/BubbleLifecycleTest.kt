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
@Config(sdk = [33, 34, 35])
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
      assertEquals("${service.applicationInfo.loadLabel(service.packageManager)} voice bubble is ready", notification.extras.getString(Notification.EXTRA_TITLE))
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
      assertEquals("${service.applicationInfo.loadLabel(service.packageManager)} voice bubble is ready",
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
      assertEquals("SecurityException", service.foregroundError)
      assertNull(field(service, "capture"))
      shadowOf(service).setThrowInStartForeground(null)
      invoke(service, "updateBubbleForeground")
      assertEquals("BUBBLE", field(service, "foregroundMode").toString())
      assertNull(service.foregroundError)
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

  @Test fun transientKeyboardAndUnsupportedEditorStatesKeepTheBoundedRetryWindow() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      set(service, "connected", true)
      val retry = service.javaClass.getDeclaredMethod("needsBubbleRetry").apply { isAccessible = true }
      for (reason in listOf("keyboard_closed", "unsupported_field", "waiting_for_editor", "waiting_for_editor_info")) {
        set(service, "hiddenReason", reason)
        assertEquals(reason, true, retry.invoke(service))
      }
      for (reason in listOf("visible", "disabled", "dismissed", "payments_paused", "sign_in_required")) {
        set(service, "hiddenReason", reason)
        assertEquals(reason, false, retry.invoke(service))
      }
      set(service, "hiddenReason", "keyboard_closed")
      set(service, "connected", false)
      assertEquals(false, retry.invoke(service))
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
      assertEquals("${service.applicationInfo.loadLabel(service.packageManager)} voice bubble is ready",
        shadowOf(service).lastForegroundNotification.extras.getString(Notification.EXTRA_TITLE))
    } finally { controller.destroy() }
  }

  @Test fun aFailedIdleForegroundStartRetriesWithoutAnotherWindowEvent() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      shadowOf(service).setThrowInStartForeground(SecurityException("Background restriction"))
      enable(service)
      service.refreshBubble()
      shadowOf(service).setThrowInStartForeground(null)
      shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(VoxConstants.BUBBLE_REFRESH_DELAY_MS))
      assertEquals("bubble", service.foregroundStatus)
      assertNull(service.foregroundError)
      assertNull(field(service, "capture"))
    } finally { controller.destroy() }
  }

  @Test fun unbindCancelsRecoveryWithoutChangingTheSystemAccessibilitySetting() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    val component = android.content.ComponentName(service, VoxTypeAccessibilityService::class.java).flattenToString()
    android.provider.Settings.Secure.putString(service.contentResolver,
      android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, component)
    try {
      shadowOf(service).setThrowInStartForeground(SecurityException("Background restriction"))
      enable(service)
      service.refreshBubble()
      service.onUnbind(Intent())
      shadowOf(service).setThrowInStartForeground(null)
      shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(10))
      assertEquals("none", service.foregroundStatus)
      assertFalse(service.connected)
      assertTrue(BubbleHealth.observeAccessibility(service))
    } finally { controller.destroy() }
  }

  @Test fun recordingRecoveryReleasesMicrophoneAndReturnsToIdle() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      enable(service)
      invoke(service, "showMicrophoneNotification")
      set(service, "status", "processing")
      set(service, "discardNext", true)
      invoke(service, "recoverRecording")
      assertEquals("idle", service.status)
      assertEquals("bubble", service.foregroundStatus)
      assertNull(field(service, "capture"))
      assertNull(field(service, "target"))
      assertEquals(false, field(service, "discardNext"))
    } finally { controller.destroy() }
  }

  @Test fun aDetachedOverlayIsClearedSoItCanBeCreatedAgain() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      invoke(service, "createBubble")
      val root = field(service, "bubble") as android.view.View
      val windows = service.getSystemService(android.view.WindowManager::class.java)
      windows.removeView(root)
      // Robolectric does not reject layout updates for detached views as Android does.
      val detached = java.lang.reflect.Proxy.newProxyInstance(
        android.view.WindowManager::class.java.classLoader,
        arrayOf(android.view.WindowManager::class.java),
      ) { _, method, args ->
        if (method.name == "updateViewLayout") throw IllegalArgumentException("View is not attached")
        method.invoke(windows, *(args ?: emptyArray()))
      }
      set(service, "windows", detached)
      invoke(service, "updateBubbleLayout")
      assertNull(field(service, "bubble"))
      assertEquals("overlay_error", service.hiddenReason)
      set(service, "windows", windows)
      invoke(service, "createBubble")
      assertNotNull(field(service, "bubble"))
      assertNotSame(root, field(service, "bubble"))
    } finally { controller.destroy() }
  }
}
