package com.voxtype.nativebridge

import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.*
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33, 34, 35])
class FocusedEditorTest {
  private fun editor() = AccessibilityNodeInfo.obtain().apply {
    isFocused = true
    isEditable = true
    packageName = "chat.example"
  }

  @Test fun usesInputFocusWhenAvailable() {
    val root = mock(AccessibilityNodeInfo::class.java)
    val input = editor()
    `when`(root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)).thenReturn(input)
    assertSame(input, FocusedEditor.find(root))
    verify(root, never()).getChild(anyInt())
    input.recycle()
  }

  @Test fun findsVirtualEditorWhenFindFocusReturnsAContainer() {
    val root = mock(AccessibilityNodeInfo::class.java)
    val container = AccessibilityNodeInfo.obtain()
    val input = editor()
    `when`(root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)).thenReturn(container)
    `when`(root.childCount).thenReturn(1)
    `when`(root.getChild(0)).thenReturn(input)
    val result = FocusedEditor.find(root)
    assertNotNull(result)
    assertTrue(result!!.isFocused)
    assertTrue(result.isEditable)
    assertEquals("chat.example", result.packageName.toString())
    result.recycle()
  }

  @Test fun neverUsesAccessibilityFocusOrAnUnfocusedEditableField() {
    val root = mock(AccessibilityNodeInfo::class.java)
    val input = editor().apply { isFocused = false; isAccessibilityFocused = true }
    `when`(root.childCount).thenReturn(1)
    `when`(root.getChild(0)).thenReturn(input)
    assertNull(FocusedEditor.find(root))
    verify(root, never()).findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
  }

  @Test fun searchStopsAtItsNodeBudget() {
    val root = mock(AccessibilityNodeInfo::class.java)
    `when`(root.childCount).thenReturn(1000)
    `when`(root.getChild(anyInt())).thenAnswer { AccessibilityNodeInfo.obtain() }
    assertNull(FocusedEditor.find(root))
    verify(root, times(127)).getChild(anyInt())
  }

  @Test fun skipsFocusFromAnotherPackageAndFindsTheCurrentEditor() {
    val root = mock(AccessibilityNodeInfo::class.java)
    val other = editor().apply { packageName = "keyboard.example" }
    `when`(root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)).thenReturn(other)
    `when`(root.childCount).thenReturn(1)
    `when`(root.getChild(0)).thenReturn(editor())
    val result = FocusedEditor.find(root, "chat.example")
    assertNotNull(result)
    assertEquals("chat.example", result!!.packageName.toString())
    result.recycle()
  }

  @Test fun findsComposerBesideALongConversationBeforeExhaustingTheBudget() {
    val root = mock(AccessibilityNodeInfo::class.java)
    val conversation = mock(AccessibilityNodeInfo::class.java)
    `when`(root.childCount).thenReturn(2)
    `when`(root.getChild(0)).thenReturn(conversation)
    `when`(root.getChild(1)).thenReturn(editor())
    `when`(conversation.childCount).thenReturn(1000)
    `when`(conversation.getChild(anyInt())).thenAnswer { AccessibilityNodeInfo.obtain() }
    val result = FocusedEditor.find(root, "chat.example")
    assertNotNull("Conversation messages must not starve the composer", result)
    assertEquals("chat.example", result!!.packageName.toString())
    result.recycle()
  }

  @Test fun searchesTheReportedFocusedContainerBeforeUnrelatedWindowContent() {
    val root = mock(AccessibilityNodeInfo::class.java)
    val container = mock(AccessibilityNodeInfo::class.java)
    `when`(root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)).thenReturn(container)
    `when`(container.childCount).thenReturn(1)
    `when`(container.getChild(0)).thenReturn(editor())
    val result = FocusedEditor.find(root, "chat.example")
    assertNotNull(result)
    result!!.recycle()
    verify(root, never()).getChild(anyInt())
  }

  private fun window(pkg: String, focused: Boolean = false, active: Boolean = false): AccessibilityWindowInfo {
    val root = mock(AccessibilityNodeInfo::class.java)
    `when`(root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)).thenReturn(editor().apply { packageName = pkg })
    return mock(AccessibilityWindowInfo::class.java).also {
      `when`(it.type).thenReturn(AccessibilityWindowInfo.TYPE_APPLICATION)
      `when`(it.isFocused).thenReturn(focused)
      `when`(it.isActive).thenReturn(active)
      `when`(it.root).thenReturn(root)
    }
  }

  @Test fun findsTheAppEditorWhenTheKeyboardOwnsWindowFocus() {
    val keyboard = mock(AccessibilityWindowInfo::class.java)
    `when`(keyboard.type).thenReturn(AccessibilityWindowInfo.TYPE_INPUT_METHOD)
    `when`(keyboard.isFocused).thenReturn(true)
    val result = FocusedEditor.find(listOf(keyboard, window("chat.example")), "chat.example")
    assertNotNull(result)
    assertEquals("chat.example", result!!.packageName.toString())
    result.recycle()
    verify(keyboard, never()).getRoot()
  }

  @Test fun doesNotUseStaleEditorMetadataToSearchABackgroundApp() {
    val background = window("chat.example")
    assertNull(FocusedEditor.find(listOf(window("other.app", focused = true), background), "chat.example"))
    verify(background, never()).getRoot()
  }

  @Test fun anActiveDialogPreventsFallingBackToABackgroundEditor() {
    val background = window("chat.example")
    assertNull(FocusedEditor.find(listOf(window("other.app", active = true), background), "chat.example"))
    verify(background, never()).getRoot()
  }
}
