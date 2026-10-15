package com.voxtype.nativebridge

import android.accessibilityservice.InputMethod
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.text.InputType
import android.view.accessibility.AccessibilityNodeInfo
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.SurroundingText
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.Mockito.*
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33, 35])
class EditorCompatibilityTest {
  private val context: Context get() = RuntimeEnvironment.getApplication()
  private fun node() = AccessibilityNodeInfo.obtain().apply {
    packageName = "chat.example"
    isEditable = true
    isFocused = true
    isVisibleToUser = true
    isEnabled = true
  }
  private fun editor(type: Int = InputType.TYPE_CLASS_TEXT) = EditorInfo().apply {
    packageName = "chat.example"
    inputType = type
    imeOptions = EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING
  }

  @Test fun privateChatEditorsCanDictateWithoutEnablingKeyboardLearning() {
    val node = node()
    try {
      node.hintText = "Shipping instructions"
      assertTrue(FocusGuard.isEditableTextField(node, "voxtype", editor()))
    }
    finally { node.recycle() }
  }

  @Test fun passwordsNumericPaymentAndVerificationFieldsStayExcluded() {
    val node = node()
    try {
      for (type in listOf(InputType.TYPE_NULL, InputType.TYPE_CLASS_NUMBER,
        InputType.TYPE_CLASS_PHONE, InputType.TYPE_CLASS_DATETIME,
        InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
        InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
        InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD)) {
        assertFalse("inputType=$type", FocusGuard.isEditableTextField(node, "voxtype", editor(type)))
      }
      for (hint in listOf("OTP", "Verification code", "Card number", "PIN code", "PIN", "UPI PIN", "MPIN")) {
        node.hintText = hint
        assertFalse(hint, FocusGuard.isEditableTextField(node, "voxtype", editor()))
      }
      node.hintText = null
      node.isPassword = true
      assertFalse(FocusGuard.isEditableTextField(node, "voxtype", editor()))
      node.isPassword = false
      assertFalse(FocusGuard.isEditableTextField(node, "chat.example", editor()))
      assertFalse(FocusGuard.isEditableTextField(node, "voxtype", editor().apply { packageName = "other.app" }))
    } finally { node.recycle() }
  }

  @Test fun richEditorPasteWorksWithoutAnImeConnectionOrSurroundingText() {
    val node = mock(AccessibilityNodeInfo::class.java)
    `when`(node.actionList).thenReturn(listOf(AccessibilityNodeInfo.AccessibilityAction.ACTION_PASTE))
    `when`(node.performAction(AccessibilityNodeInfo.ACTION_PASTE)).thenReturn(true)
    assertTrue(InsertionHelper.insert(context, node, null, "A chat message"))
    verify(node, times(1)).performAction(AccessibilityNodeInfo.ACTION_PASTE)
    val clip = context.getSystemService(ClipboardManager::class.java).primaryClip!!
    assertEquals("A chat message", clip.getItemAt(0).text.toString())
    assertTrue(clip.description.extras!!.getBoolean(ClipDescription.EXTRA_IS_SENSITIVE))
  }

  @Test fun pasteCanBecomeAvailableOnlyAfterTheClipboardIsPopulated() {
    val node = mock(AccessibilityNodeInfo::class.java)
    `when`(node.actionList).thenReturn(emptyList())
    `when`(node.performAction(AccessibilityNodeInfo.ACTION_PASTE)).thenAnswer {
      context.getSystemService(ClipboardManager::class.java).primaryClip?.getItemAt(0)?.text == "hello"
    }
    assertTrue(InsertionHelper.insert(context, node, null, "hello"))
  }

  @Test fun acceptedAsyncPasteIsNeverFollowedByAnImeCommit() {
    val node = mock(AccessibilityNodeInfo::class.java)
    val connection = mock(InputMethod.AccessibilityInputConnection::class.java)
    `when`(node.actionList).thenReturn(listOf(AccessibilityNodeInfo.AccessibilityAction.ACTION_PASTE))
    `when`(node.performAction(AccessibilityNodeInfo.ACTION_PASTE)).thenReturn(true)
    assertTrue(InsertionHelper.insert(context, node, connection, "hello"))
    verifyNoInteractions(connection)
  }

  @Test fun rejectedPasteFallsBackToImeCommitAtTheCursor() {
    val node = mock(AccessibilityNodeInfo::class.java)
    val connection = mock(InputMethod.AccessibilityInputConnection::class.java)
    `when`(node.actionList).thenReturn(listOf(AccessibilityNodeInfo.AccessibilityAction.ACTION_PASTE))
    `when`(node.performAction(AccessibilityNodeInfo.ACTION_PASTE)).thenReturn(false)
    `when`(connection.getSurroundingText(anyInt(), anyInt(), anyInt())).thenReturn(
      SurroundingText("", 0, 0, 0), SurroundingText("hello", 5, 5, 0))
    assertTrue(InsertionHelper.insert(context, node, connection, "hello"))
    verify(connection, times(1)).commitText("hello", 1, null)
  }

  @Test fun repeatedTextIsVerifiedUsingAbsoluteCursorMovement() {
    val connection = mock(InputMethod.AccessibilityInputConnection::class.java)
    `when`(connection.getSurroundingText(anyInt(), anyInt(), anyInt())).thenReturn(
      SurroundingText("hello", 5, 5, 0), SurroundingText("hello", 5, 5, 5))
    assertTrue(InsertionHelper.commitAndVerify(connection, "hello"))
  }

  @Test fun unavailableSurroundingTextDoesNotPreventOrRepeatACommit() {
    val connection = mock(InputMethod.AccessibilityInputConnection::class.java)
    `when`(connection.getSurroundingText(anyInt(), anyInt(), anyInt())).thenThrow(UnsupportedOperationException())
    assertFalse(InsertionHelper.commitAndVerify(connection, "hello"))
    verify(connection, times(1)).commitText("hello", 1, null)
  }

  @Test fun aPasteExceptionWithUnknownOutcomeDoesNotTriggerAnotherInsertion() {
    val node = mock(AccessibilityNodeInfo::class.java)
    val connection = mock(InputMethod.AccessibilityInputConnection::class.java)
    `when`(node.actionList).thenReturn(listOf(AccessibilityNodeInfo.AccessibilityAction.ACTION_PASTE))
    `when`(node.performAction(AccessibilityNodeInfo.ACTION_PASTE)).thenThrow(IllegalStateException())
    assertFalse(InsertionHelper.insert(context, node, connection, "hello"))
    verifyNoInteractions(connection)
  }

  @Test fun matchingClassAndResourceIdDoNotMakeDifferentFieldsTheSameTarget() {
    val first = node().apply { className = "android.widget.EditText"; viewIdResourceName = "chat:id/input" }
    val second = node().apply { className = first.className; viewIdResourceName = first.viewIdResourceName }
    val copy = AccessibilityNodeInfo.obtain(first)
    try {
      assertTrue(InsertionHelper.isSameField(first, copy))
      assertFalse(InsertionHelper.isSameField(first, second))
    } finally { first.recycle(); second.recycle(); copy.recycle() }
  }
}
