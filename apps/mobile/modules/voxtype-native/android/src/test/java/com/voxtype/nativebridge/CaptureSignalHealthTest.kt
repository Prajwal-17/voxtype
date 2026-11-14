package com.voxtype.nativebridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureSignalHealthTest {
  private fun packet(samples: Int, amplitude: Int, zeroEvery: Int): ByteArray {
    val bytes = ByteArray(samples * 2)
    for (index in 0 until samples) {
      val value = when {
        zeroEvery > 0 && index % zeroEvery != 0 -> 0
        index % 2 == 0 -> amplitude
        else -> -amplitude
      }
      bytes[index * 2] = value.toByte()
      bytes[index * 2 + 1] = (value shr 8).toByte()
    }
    return bytes
  }

  private fun frame(amplitude: Int, zeroEvery: Int) = packet(1_600, amplitude, zeroEvery)

  @Test fun ordinarySpeechAndRealSilenceAreNotReported() {
    val health = CaptureSignalHealth()
    repeat(40) {
      assertFalse(health.push(frame(8000, 0)))
      assertFalse(health.push(frame(0, 1)))
    }
  }

  @Test fun anIsolatedLoudOrZeroPacketDoesNotTrigger() {
    val health = CaptureSignalHealth()
    repeat(40) { index ->
      if (index == 12) assertFalse(health.push(frame(9000, 3)))
      else assertFalse(health.push(frame(8000, 0)))
    }
  }

  @Test fun corruptBluetoothBurstsTriggerOnceAfterAboutASecond() {
    val health = CaptureSignalHealth()
    repeat(11) { assertFalse(health.push(frame(8000, 3))) }
    assertTrue(health.push(frame(8000, 3)))
    assertFalse(health.push(frame(8000, 3)))
  }

  @Test fun aRollingWindowToleratesOccasionalHealthyPackets() {
    val health = CaptureSignalHealth()
    var reported = false
    repeat(16) { index ->
      val bytes = if (index % 4 == 0) frame(8000, 0) else frame(8000, 3)
      reported = health.push(bytes) || reported
    }
    assertTrue(reported)
  }

  @Test fun shortReadsAreAggregatedIntoFixedFrames() {
    val health = CaptureSignalHealth()
    val corrupt = frame(8000, 3)
    // Twelve 100-byte reads are only 1,200 bytes, under one 100 ms frame. A
    // per-read window would have falsely triggered after these twelve calls.
    repeat(12) { assertFalse(health.push(corrupt.copyOf(100))) }
    // Feed irregular partial reads until twelve complete frames have arrived.
    val burst = ByteArray(12 * corrupt.size)
    repeat(12) { index ->
      System.arraycopy(corrupt, 0, burst, index * corrupt.size, corrupt.size)
    }
    var offset = 0
    var reported = false
    while (offset < burst.size) {
      val end = minOf(offset + 173, burst.size)
      reported = health.push(burst.copyOfRange(offset, end)) || reported
      offset = end
    }
    assertTrue(reported)
  }
}
