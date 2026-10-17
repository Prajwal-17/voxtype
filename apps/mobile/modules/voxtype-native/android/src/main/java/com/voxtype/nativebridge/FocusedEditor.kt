package com.voxtype.nativebridge

import android.view.accessibility.AccessibilityNodeInfo

/** Resolve virtual editors without treating accessibility focus as keyboard input focus. */
internal object FocusedEditor {
  fun isCandidate(node: AccessibilityNodeInfo): Boolean = node.isFocused && FocusGuard.isTextEditor(node)

  /** The caller owns root; the returned node is a separate, caller-owned reference. */
  fun find(root: AccessibilityNodeInfo, editorPackage: String? = null): AccessibilityNodeInfo? {
    fun matches(node: AccessibilityNodeInfo) = isCandidate(node) &&
      (editorPackage == null || node.packageName?.toString() == editorPackage)
    root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.let { focused ->
      if (matches(focused)) return focused
      focused.recycle()
    }
    // Some virtual trees report focus on a container through findFocus while the
    // focused editor is exposed only in its descendants. Bound work on the main thread.
    var remaining = 128
    fun visit(node: AccessibilityNodeInfo, depth: Int): AccessibilityNodeInfo? {
      if (remaining-- <= 0 || depth > 16) return null
      if (matches(node)) return AccessibilityNodeInfo.obtain(node)
      for (i in 0 until node.childCount) {
        if (remaining <= 0) break
        val child = node.getChild(i) ?: continue
        try {
          visit(child, depth + 1)?.let { return it }
        } finally { child.recycle() }
      }
      return null
    }
    return visit(root, 0)
  }
}
