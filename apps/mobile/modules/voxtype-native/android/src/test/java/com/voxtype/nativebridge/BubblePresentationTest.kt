package com.voxtype.nativebridge

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityWindowInfo
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33, 34, 35])
class BubblePresentationTest {
  private fun field(service: VoxTypeAccessibilityService, name: String): Any? =
    service.javaClass.getDeclaredField(name).apply { isAccessible = true }.get(service)
  private fun invoke(service: VoxTypeAccessibilityService, name: String) {
    service.javaClass.getDeclaredMethod(name).apply { isAccessible = true }.invoke(service)
  }
  private fun params(service: VoxTypeAccessibilityService) = field(service, "bubbleParams") as WindowManager.LayoutParams
  private fun keyboard(service: VoxTypeAccessibilityService, fraction: Float?) {
    if (fraction == null) { shadowOf(service).setWindows(emptyList()); return }
    val bounds = service.getSystemService(WindowManager::class.java).currentWindowMetrics.bounds
    val window = AccessibilityWindowInfo.obtain()
    shadowOf(window).setType(AccessibilityWindowInfo.TYPE_INPUT_METHOD)
    shadowOf(window).setBoundsInScreen(Rect(bounds.left, (bounds.height() * fraction).toInt(), bounds.right, bounds.bottom))
    shadowOf(service).setWindows(listOf(window))
  }
  private fun render(service: VoxTypeAccessibilityService, status: String) {
    service.javaClass.getDeclaredField("status").apply { isAccessible = true }.set(service, status)
    invoke(service, "updateBubbleContent")
    (field(service, "placementAnimator") as? ValueAnimator)?.end()
  }

  @Test fun keyboardOpeningResizingAndReopeningNeverMovesTheSavedScreenPosition() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      service.getSharedPreferences("voxtype_bubble_pos", Context.MODE_PRIVATE).edit()
        .putBoolean("dockRight", false).putFloat("screenVerticalPosition", 0.45f).apply()
      keyboard(service, 0.75f)
      invoke(service, "createBubble")
      val x = params(service).x
      val y = params(service).y
      for (height in listOf(0.5f, 0.8f, null, 0.65f)) {
        keyboard(service, height)
        invoke(service, "removeBubble")
        invoke(service, "createBubble")
        assertEquals(x, params(service).x)
        assertEquals(y, params(service).y)
        assertEquals(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING, params(service).softInputMode)
      }
    } finally { controller.destroy() }
  }

  @Test fun oldKeyboardRelativePreferenceIsMigratedOnlyOnce() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      val prefs = service.getSharedPreferences("voxtype_bubble_pos", Context.MODE_PRIVATE)
      prefs.edit().putFloat("verticalPosition", 0.6f).apply()
      keyboard(service, 0.65f)
      invoke(service, "createBubble")
      val y = params(service).y
      assertTrue(prefs.contains("screenVerticalPosition"))
      keyboard(service, 0.4f)
      invoke(service, "removeBubble")
      invoke(service, "createBubble")
      assertEquals(y, params(service).y)
    } finally { controller.destroy() }
  }

  @Test fun recordingExpandsInwardAndLoadingAndSuccessStayCompactOnTheSameEdge() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      invoke(service, "createBubble")
      val initial = params(service)
      val right = initial.x + initial.width
      val y = initial.y
      val density = service.resources.displayMetrics.density
      for (status in listOf("listening", "processing", "saved", "idle", "connecting")) {
        render(service, status)
        val expected = if (status == "listening") VoxConstants.BUBBLE_LISTEN_WIDTH_DP else VoxConstants.BUBBLE_SIZE_DP
        assertEquals((expected * density).toInt(), params(service).width)
        assertEquals(right, params(service).x + params(service).width)
        assertEquals(y, params(service).y)
        val loading = status == "connecting" || status == "processing"
        assertEquals(if (loading) View.VISIBLE else View.GONE, (field(service, "spinner") as View).visibility)
        assertEquals(if (status == "listening") View.VISIBLE else View.GONE, (field(service, "actionsRow") as View).visibility)
      }
    } finally { controller.destroy() }
  }

  @Test fun processingInterruptsAnUnfinishedRecordingExpansion() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      invoke(service, "createBubble")
      service.javaClass.getDeclaredField("status").apply { isAccessible = true }.set(service, "listening")
      invoke(service, "updateBubbleContent")
      render(service, "processing")
      assertEquals((VoxConstants.BUBBLE_SIZE_DP * service.resources.displayMetrics.density).toInt(), params(service).width)
      assertEquals(View.VISIBLE, (field(service, "spinner") as View).visibility)
    } finally { controller.destroy() }
  }

  @Test fun closingMorphsTheCornersWithTheWidthInsteadOfMakingTheBarRectangular() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      invoke(service, "createBubble"); render(service, "listening")
      val background = (field(service, "bubble") as View).background as GradientDrawable
      val startRadius = background.cornerRadius
      service.javaClass.getDeclaredField("status").apply { isAccessible = true }.set(service, "idle")
      invoke(service, "updateBubbleContent")
      assertEquals(startRadius, background.cornerRadius, 0.01f)
      val animation = field(service, "placementAnimator") as ValueAnimator
      for (fraction in listOf(0.1f, 0.3f, 0.6f, 0.9f)) {
        animation.setCurrentFraction(fraction)
        assertTrue(background.cornerRadius >= VoxConstants.BUBBLE_RADIUS_DP * service.resources.displayMetrics.density)
        assertTrue(background.cornerRadius <= minOf(params(service).width, params(service).height) / 2f)
      }
      animation.end()
    } finally { controller.destroy() }
  }

  @Test fun dismissTargetIsCenteredAtTheScreenBottomRegardlessOfKeyboardHeight() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      val bounds = service.getSystemService(WindowManager::class.java).currentWindowMetrics.bounds
      val area = service.javaClass.getDeclaredMethod("safeBounds").apply { isAccessible = true }.invoke(service) as BubbleGeometry
      for (height in listOf(0.4f, 0.7f, null)) {
        keyboard(service, height)
        invoke(service, "showCloseZone")
        val target = (field(service, "closeView") as View).layoutParams as WindowManager.LayoutParams
        assertEquals(bounds.width() / 2f, target.x + target.width / 2f, 1f)
        assertEquals(area.bottom, target.y + target.height)
        invoke(service, "hideCloseZone")
      }
    } finally { controller.destroy() }
  }
}
