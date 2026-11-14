package com.voxtype.nativebridge

import android.media.AudioDeviceInfo

/**
 * Speech capture prefers a wired/USB headset and otherwise the built-in
 * microphone. Bluetooth inputs are deliberately excluded from automatic
 * selection: they only exist in narrowband HFP/SCO call mode and several
 * Android/Linux transports corrupt or silence that path. A Bluetooth route is
 * still monitored if the platform forces it despite the preference.
 */
internal data class CaptureInput(val type: Int, val supports16k: Boolean)

internal object CaptureInputPolicy {
  fun choose(inputs: List<CaptureInput>): Int? {
    val order = intArrayOf(
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_USB_DEVICE,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_BUILTIN_MIC,
    )
    for (type in order) {
      val index = inputs.indexOfFirst { it.type == type && it.supports16k }
      if (index >= 0) return index
    }
    for (type in order) {
      val index = inputs.indexOfFirst { it.type == type }
      if (index >= 0) return index
    }
    return null
  }

  fun isBluetooth(type: Int): Boolean = when (type) {
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_BLE_HEADSET,
    AudioDeviceInfo.TYPE_BLE_SPEAKER -> true
    else -> false
  }
}
