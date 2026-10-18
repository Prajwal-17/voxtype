package com.voxtype.nativebridge

import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo

/** Resolve virtual editors without treating accessibility focus as keyboard input focus. */
internal object FocusedEditor {
  fun isCandidate(node: AccessibilityNodeInfo): Boolean = node.isFocused && FocusGuard.isTextEditor(node)

  /** The caller owns root; the returned node is a separate, caller-owned reference. */
  fun find(root: AccessibilityNodeInfo, editorPackage: String? = null): AccessibilityNodeInfo? {
    fun matches(node: AccessibilityNodeInfo) = isCandidate(node) &&
      (editorPackage == null || node.packageName?.toString() == editorPackage)

    // Search siblings before descending into a conversation's message history. A
    // depth-first scan can spend its entire budget before reaching the composer.
    fun search(start: AccessibilityNodeInfo): AccessibilityNodeInfo? {
      data class Pending(val node: AccessibilityNodeInfo, val depth: Int, val owned: Boolean)
      val pending = ArrayDeque<Pending>()
      pending.add(Pending(start, 0, false))
      var remaining = 127
      try {
        while (pending.isNotEmpty()) {
          val (node, depth, owned) = pending.removeFirst()
          try {
            if (matches(node)) return AccessibilityNodeInfo.obtain(node)
            if (depth >= 16) continue
            for (i in 0 until node.childCount) {
              if (remaining-- <= 0) break
              node.getChild(i)?.let { pending.add(Pending(it, depth + 1, true)) }
            }
          } finally { if (owned) node.recycle() }
        }
        return null
      } finally {
        pending.forEach { if (it.owned) it.node.recycle() }
      }
    }

    root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.let { focused ->
      if (matches(focused)) return focused
      try { search(focused)?.let { return it } } finally { focused.recycle() }
    }
    return search(root)
  }

  /** The IME can own window focus while the app still owns the focused editor. */
  fun find(windows: List<AccessibilityWindowInfo>, editorPackage: String): AccessibilityNodeInfo? {
    val apps = windows.filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
    // Never search a background app when a different app is explicitly focused.
    val candidates = apps.filter { it.isFocused }.ifEmpty {
      apps.filter { it.isActive }.ifEmpty { apps }
    }
    for (window in candidates.sortedByDescending { it.layer }) {
      val root = window.root ?: continue
      try { find(root, editorPackage)?.let { return it } } finally { root.recycle() }
    }
    return null
  }
}
