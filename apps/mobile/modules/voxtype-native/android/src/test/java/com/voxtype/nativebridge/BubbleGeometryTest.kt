package com.voxtype.nativebridge

import org.junit.Assert.*
import org.junit.Test

class BubbleGeometryTest {
  private val portrait = BubbleGeometry(12, 36, 378, 480)

  @Test fun freePositionsChooseTheNearestEdge() {
    assertFalse(portrait.nearestRight(50, 48))
    assertTrue(portrait.nearestRight(260, 48))
    assertEquals(12, portrait.dockX(false, 48))
    assertEquals(330, portrait.dockX(true, 48))
  }

  @Test fun expandingAndCollapsingKeepTheSameEdge() {
    for (width in listOf(48, 90, 150, 200, 48)) {
      assertEquals(portrait.right, portrait.dockX(true, width) + width)
      assertEquals(portrait.left, portrait.dockX(false, width))
    }
  }

  @Test fun keyboardAndRotationPreserveHeightPreferenceWithinSafeBounds() {
    val fraction = portrait.fractionAt(360, 48)
    for (area in listOf(portrait, BubbleGeometry(12, 36, 378, 300), BubbleGeometry(36, 12, 800, 220))) {
      val y = area.yAt(fraction, 48)
      assertTrue(y >= area.top)
      assertTrue(y + 48 <= area.bottom)
      assertEquals(fraction, area.fractionAt(y, 48), 0.01f)
    }
    assertEquals(432, portrait.yAt(1f, 48)) // Default above the keyboard, never screen center.
    assertEquals(432, portrait.clampY(900, 48))
    assertEquals(36, portrait.clampY(-100, 48))
  }

  @Test fun tinyBoundsNeverProduceInvalidClampRanges() {
    val tiny = BubbleGeometry(12, 36, 32, 50)
    assertEquals(12, tiny.dockX(true, 200))
    assertEquals(12, tiny.clampX(500, 200))
    assertEquals(36, tiny.yAt(1f, 48))
    assertEquals(1f, tiny.fractionAt(500, 48))
  }
}
