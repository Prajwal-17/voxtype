package com.voxtype.nativebridge

import android.accessibilityservice.InputMethod
import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.PersistableBundle
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Input-connection helpers. Kept separate so the service never
 * silently types into a different field than the one recorded.
 */
object InsertionHelper {
  /**
   * Reference equality is not enough: each [AccessibilityNodeInfo] query
   * returns a new object. Android equality compares window and source node IDs,
   * including virtual descendants in web editors. View IDs/classes can be shared.
   */
  fun isSameField(a: AccessibilityNodeInfo, b: AccessibilityNodeInfo): Boolean {
    return a == b
  }

  /**
   * Rich web editors may support paste without implementing surrounding-text reads
   * or accessibility IME commits. Let the editor handle selection and input events.
   * Never retry an accepted paste: the editor may finish it asynchronously.
   * Keep the transcript on the clipboard for manual recovery, as on desktop.
   */
  fun insert(
    context: Context,
    node: AccessibilityNodeInfo,
    connection: InputMethod.AccessibilityInputConnection?,
    text: String,
  ): Boolean {
    if (text.isBlank()) return false
    try {
      val clipboard = context.getSystemService(ClipboardManager::class.java)
      val clip = ClipData.newPlainText("VoxType transcript", text)
      clip.description.extras = PersistableBundle().apply {
        putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
      }
      clipboard.setPrimaryClip(clip)
    } catch (error: Exception) {
      VoxLog.w("clipboard unavailable", error)
      return connection?.let { commitAndVerify(it, text) } ?: false
    }
    try {
      // TextView/WebView can omit ACTION_PASTE while the clipboard is empty.
      // Try after populating it instead of trusting the earlier action list.
      if (node.performAction(AccessibilityNodeInfo.ACTION_PASTE)) return true
    } catch (error: Exception) {
      // The outcome after dispatch is unknown. Retrying could duplicate text.
      VoxLog.w("paste action failed", error)
      return false
    }
    return connection?.let { commitAndVerify(it, text) } ?: false
  }

  /** Commits text and verifies it actually landed, otherwise reports false. */
  fun commitAndVerify(connection: InputMethod.AccessibilityInputConnection, text: String): Boolean {
    return try {
      // Surrounding text is optional. A failed read must not prevent the commit.
      val before = runCatching { connection.getSurroundingText(text.length, 0, 0) }.getOrNull()
      connection.commitText(text, 1, null)
      val after = connection.getSurroundingText(text.length, 0, 0)
      // Repeated words can produce identical slices; also check cursor movement.
      val changed = before?.text?.toString() != after?.text?.toString() ||
        (before != null && after != null && before.offset >= 0 && after.offset >= 0 &&
          before.offset + before.selectionEnd != after.offset + after.selectionEnd)
      changed && after?.text?.toString()?.endsWith(text) == true
    } catch (e: Exception) {
      VoxLog.w("commitText failed", e)
      false
    }
  }
}
