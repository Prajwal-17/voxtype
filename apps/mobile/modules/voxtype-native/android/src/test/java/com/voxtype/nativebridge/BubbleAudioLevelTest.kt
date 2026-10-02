package com.voxtype.nativebridge

import org.junit.Assert.*
import org.junit.Test

class BubbleAudioLevelTest {
  private fun pcm(vararg values: Int): ByteArray = values.flatMap {
    listOf(it.toByte(), (it shr 8).toByte())
  }.toByteArray()

  @Test fun silenceAndEmptyBuffersStayStill() {
    assertEquals(0f, BubbleAudioLevel.fromPcm(ByteArray(3200)))
    assertEquals(0f, BubbleAudioLevel.fromPcm(byteArrayOf()))
    assertEquals(0f, BubbleAudioLevel.fromPcm(byteArrayOf(127)))
  }

  @Test fun actualSpeechEnergyControlsTheAmplitude() {
    val quiet = BubbleAudioLevel.fromPcm(pcm(100, -100, 100, -100))
    val speech = BubbleAudioLevel.fromPcm(pcm(4000, -4000, 4000, -4000))
    val loud = BubbleAudioLevel.fromPcm(pcm(32767, -32768))
    assertTrue(quiet > 0f)
    assertTrue(speech > quiet)
    assertTrue(loud > speech)
    assertEquals(1f, loud)
  }

  @Test fun signedLittleEndianSamplesHaveSymmetricEnergy() {
    assertEquals(BubbleAudioLevel.fromPcm(pcm(256)), BubbleAudioLevel.fromPcm(pcm(-256)))
    assertEquals(BubbleAudioLevel.fromPcm(pcm(1000)), BubbleAudioLevel.fromPcm(pcm(1000) + byteArrayOf(127)))
  }
}
