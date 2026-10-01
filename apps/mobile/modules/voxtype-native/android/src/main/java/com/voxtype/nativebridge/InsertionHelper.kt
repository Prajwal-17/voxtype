package com.voxtype.nativebridge

import android.view.accessibility.AccessibilityNodeInfo
import android.view.inputmethod.InputConnection

/**
 * Input-connection helpers. Kept separate so the service never
 * silently types into a different field than the one recorded.
 */
object InsertionHelper {
  /**
   * Reference equality is not enough: each [AccessibilityNodeInfo] query
   * returns a new object. Compare structural identity instead.
   */
  fun isSameField(a: AccessibilityNodeInfo, b: AccessibilityNodeInfo): Boolean {
    if (a === b) return true
    if (a.windowId != b.windowId) return false
    if (a.packageName?.toString() != b.packageName?.toString()) return false
    val viewA = a.viewIdResourceName
    val viewB = b.viewIdResourceName
    if (viewA != null || viewB != null) return viewA != null && viewA == viewB
    // No stable view id: same window + package + class is the best signal.
    return a.className?.toString() == b.className?.toString()
  }

  /** Commits text and verifies it actually landed, otherwise reports false. */
  fun commitAndVerify(connection: InputConnection, text: String): Boolean {
    return try {
      val before = connection.getSurroundingText(text.length, 0, 0)?.text?.toString()
      connection.commitText(text, 1, null)
      val after = connection.getSurroundingText(text.length, 0, 0)?.text?.toString()
      after != before && after?.endsWith(text) == true
    } catch (e: Exception) {
      VoxLog.w("commitText failed", e)
      false
    }
  }
}
