package com.voxtype.nativebridge

import android.os.Build
import android.text.InputType
import android.view.accessibility.AccessibilityNodeInfo
import android.view.inputmethod.EditorInfo

/**
 * Decides whether a focused node is safe for dictation.
 * Password, OTP, payment and non-text fields are always rejected.
 */
object FocusGuard {
  private val BLOCKED_HINTS = listOf(
    "password", "passcode", "pin code", "security code", "verification code",
    "one-time", "one time", "otp", "2fa", "cvv", "cvc", "credit card",
    "card number", "payment card", "security answer",
  )

  private val BLOCKED_VARIATIONS = setOf(
    InputType.TYPE_TEXT_VARIATION_PASSWORD,
    InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
    InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
  )

  fun isEditableTextField(
    node: AccessibilityNodeInfo,
    ownPackage: String,
    editorPackage: String?,
    editorInputType: Int,
    editorNoPersonalizedLearning: Boolean,
  ): Boolean {
    if (!node.isEditable || !node.isFocused || !node.isVisibleToUser || !node.isEnabled || node.isPassword) return false
    if (node.packageName?.toString() == ownPackage) return false
    if (Build.VERSION.SDK_INT < 33) return false
    if (editorPackage == null || editorPackage != node.packageName?.toString()) return false
    if (editorInputType == InputType.TYPE_NULL) return false
    // Dictation is for prose. Numeric/phone/date classes also cover most OTP/payment fields.
    if ((editorInputType and InputType.TYPE_MASK_CLASS) != InputType.TYPE_CLASS_TEXT) return false
    if ((editorInputType and InputType.TYPE_MASK_VARIATION) in BLOCKED_VARIATIONS) return false
    if (editorNoPersonalizedLearning) return false
    val hint = listOfNotNull(node.hintText?.toString(), node.contentDescription?.toString())
      .joinToString(" ").lowercase()
    return BLOCKED_HINTS.none { hint.contains(it) }
  }

  fun editorNoPersonalizedLearning(imeOptions: Int): Boolean =
    (imeOptions and EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING) != 0
}
