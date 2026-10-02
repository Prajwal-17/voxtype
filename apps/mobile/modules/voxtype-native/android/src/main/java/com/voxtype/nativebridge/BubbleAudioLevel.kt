package com.voxtype.nativebridge

import kotlin.math.sqrt

object BubbleAudioLevel {
  /** RMS of actual signed, little-endian 16-bit PCM; silence remains zero. */
  fun fromPcm(bytes: ByteArray): Float {
    val samples = bytes.size / 2
    if (samples == 0) return 0f
    var energy = 0.0
    for (i in 0 until samples) {
      val sample = ((bytes[i * 2].toInt() and 0xff) or (bytes[i * 2 + 1].toInt() shl 8)).toShort()
      val normalized = sample.toDouble() / 32768.0
      energy += normalized * normalized
    }
    // Perceptual gain matches the desktop waveform without inventing activity.
    return (sqrt(sqrt(energy / samples)) * 1.2).toFloat().coerceIn(0f, 1f)
  }
}
