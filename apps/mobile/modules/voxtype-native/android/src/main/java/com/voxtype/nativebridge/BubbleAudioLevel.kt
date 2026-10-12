package com.voxtype.nativebridge

import kotlin.math.pow
import kotlin.math.sqrt
import kotlin.math.log10

object BubbleAudioLevel {
  /** Display gain only: preserve silence and make low microphone levels legible. */
  fun displayGain(level: Float): Float = if (!level.isFinite()) 0f
    else level.coerceIn(0f, 1f).toDouble().pow(0.7).toFloat().times(1.25f).coerceIn(0f, 1f)

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
    val rms = sqrt(energy / samples)
    if (rms <= 0.0001) return 0f
    // Map -60..-12 dBFS to the available height. Quiet speech remains visible.
    return ((20.0 * log10(rms) + 60.0) / 48.0).toFloat().coerceIn(0f, 1f)
  }
}
