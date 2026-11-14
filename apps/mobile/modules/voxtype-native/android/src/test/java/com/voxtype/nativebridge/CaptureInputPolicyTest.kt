package com.voxtype.nativebridge

import android.media.AudioDeviceInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureInputPolicyTest {
  @Test fun aUsbHeadsetIsPreferredOverTheBuiltInMicrophone() {
    assertEquals(
      1,
      CaptureInputPolicy.choose(
        listOf(
          CaptureInput(AudioDeviceInfo.TYPE_BUILTIN_MIC, true),
          CaptureInput(AudioDeviceInfo.TYPE_USB_HEADSET, true),
        ),
      ),
    )
  }

  @Test fun aSixteenKilohertzInputIsPreferredWithinTheSameClass() {
    assertEquals(
      1,
      CaptureInputPolicy.choose(
        listOf(
          CaptureInput(AudioDeviceInfo.TYPE_BUILTIN_MIC, false),
          CaptureInput(AudioDeviceInfo.TYPE_BUILTIN_MIC, true),
        ),
      ),
    )
  }

  @Test fun theBuiltInMicrophoneIsTheFallback() {
    assertEquals(
      1,
      CaptureInputPolicy.choose(
        listOf(
          CaptureInput(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, true),
          CaptureInput(AudioDeviceInfo.TYPE_BUILTIN_MIC, true),
        ),
      ),
    )
  }

  @Test fun bluetoothOnlyInputsAreNeverSelectedAutomatically() {
    assertNull(
      CaptureInputPolicy.choose(
        listOf(
          CaptureInput(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, true),
          CaptureInput(AudioDeviceInfo.TYPE_BLE_HEADSET, true),
        ),
      ),
    )
  }

  @Test fun onlyCallModeAndLeAudioInputsAreTreatedAsBluetooth() {
    assertTrue(CaptureInputPolicy.isBluetooth(AudioDeviceInfo.TYPE_BLUETOOTH_SCO))
    assertTrue(CaptureInputPolicy.isBluetooth(AudioDeviceInfo.TYPE_BLE_HEADSET))
    assertFalse(CaptureInputPolicy.isBluetooth(AudioDeviceInfo.TYPE_BUILTIN_MIC))
    assertFalse(CaptureInputPolicy.isBluetooth(AudioDeviceInfo.TYPE_USB_HEADSET))
  }
}
