package com.voxtype.nativebridge

/**
 * Single source of truth for dictation states.
 * [bridge] keeps the exact strings sent over the Expo bridge so TS types never break.
 */
enum class DictationStatus(val bridge: String) {
  IDLE("idle"),
  CONNECTING("connecting"),
  LISTENING("listening"),
  PROCESSING("processing"),
  SAVED("saved"),
  MICROPHONE_PERMISSION_NEEDED("microphone_permission_needed");

  companion object {
    fun fromBridge(value: String?): DictationStatus =
      values().firstOrNull { it.bridge == value } ?: IDLE
  }
}
