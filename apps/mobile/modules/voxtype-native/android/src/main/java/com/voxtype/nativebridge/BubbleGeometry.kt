package com.voxtype.nativebridge

/** Window-local safe bounds; independent of Android so docking can be unit tested. */
data class BubbleGeometry(val left: Int, val top: Int, val right: Int, val bottom: Int) {
  fun dockX(rightEdge: Boolean, width: Int): Int =
    if (rightEdge) (right - width).coerceAtLeast(left) else left

  fun clampX(x: Int, width: Int): Int = x.coerceIn(left, (right - width).coerceAtLeast(left))
  fun clampY(y: Int, height: Int): Int = y.coerceIn(top, (bottom - height).coerceAtLeast(top))
  fun nearestRight(x: Int, width: Int): Boolean = x + width / 2f >= (left + right) / 2f
  fun yAt(fraction: Float, height: Int): Int =
    top + ((bottom - top - height).coerceAtLeast(0) * fraction.coerceIn(0f, 1f)).toInt()

  fun fractionAt(y: Int, height: Int): Float {
    val travel = bottom - top - height
    return if (travel <= 0) 1f else ((clampY(y, height) - top).toFloat() / travel).coerceIn(0f, 1f)
  }
}
