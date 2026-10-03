package com.voxtype.nativebridge

import android.view.View
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.ImageView
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.VectorDrawable
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class BubbleRenderingTest {
  private fun field(service: VoxTypeAccessibilityService, name: String): Any? =
    service.javaClass.getDeclaredField(name).apply { isAccessible = true }.get(service)
  private fun invoke(service: VoxTypeAccessibilityService, name: String) {
    service.javaClass.getDeclaredMethod(name).apply { isAccessible = true }.invoke(service)
  }
  private fun status(service: VoxTypeAccessibilityService, value: String) {
    service.javaClass.getDeclaredField("status").apply { isAccessible = true }.set(service, value)
    invoke(service, "updateBubbleContent")
  }

  @Test fun idleBubbleIsARoundedSquareWithACenteredVectorMark() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      invoke(service, "createBubble")
      status(service, "idle")
      val root = field(service, "bubble") as FrameLayout
      val width = root.layoutParams.width
      val height = root.layoutParams.height
      root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
      root.layout(0, 0, width, height)
      val density = service.resources.displayMetrics.density
      val radius = (root.background as GradientDrawable).cornerRadius
      assertEquals(width, height)
      assertEquals(14f * density, radius, 1f)
      assertTrue("Corners do not make a circle", radius < height / 2f)
      val mark = field(service, "bubbleMark") as ImageView
      assertTrue(mark.drawable is VectorDrawable)
      assertEquals(24f * density, mark.width.toFloat(), 1f)
      assertEquals(width / 2f, mark.left + mark.width / 2f, 1f)
      assertEquals(height / 2f, mark.top + mark.height / 2f, 1f)
    } finally { controller.destroy() }
  }

  @Test fun processingKeepsRecordingWidthAndUsesNativeSpinner() {
    val controller = Robolectric.buildService(VoxTypeAccessibilityService::class.java).create()
    val service = controller.get()
    try {
      invoke(service, "createBubble")
      status(service, "listening")
      val root = field(service, "bubble") as FrameLayout
      val width = root.layoutParams.width
      val height = root.layoutParams.height
      root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
      root.layout(0, 0, width, height)
      val wave = field(service, "waveform") as View
      val density = service.resources.displayMetrics.density
      assertTrue("Waveform has room between controls", wave.measuredWidth / density >= 100)
      assertEquals(34, (wave.measuredHeight / density).toInt())
      status(service, "processing")
      assertEquals("No shrinking while processing", width, root.layoutParams.width)
      assertEquals(View.VISIBLE, (field(service, "spinner") as ProgressBar).visibility)
      assertEquals(View.GONE, (field(service, "bubbleGlyph") as View).visibility)
    } finally { controller.destroy() }
  }
}
