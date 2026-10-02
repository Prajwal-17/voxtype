package com.voxtype.nativebridge

import android.view.View
import android.widget.FrameLayout
import android.widget.ProgressBar
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
