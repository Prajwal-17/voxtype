package com.voxtype.nativebridge

import java.util.ArrayDeque
import kotlin.math.sqrt

/**
 * Detects the digital-burst pattern produced by a failing Bluetooth SCO
 * transport: packets made mostly of exact zeros that still contain energy.
 * Real silence and ordinary speech do not match, because silence has no energy
 * and speech is not mostly exact zeros.
 *
 * AudioRecord.read can return short reads at arbitrary byte boundaries. Each
 * read is therefore aggregated into a fixed 100 ms frame before it contributes
 * to the window; otherwise a burst of short reads would look like minutes of
 * corrupt audio and trigger far too early.
 */
internal class CaptureSignalHealth(
  private val frameBytes: Int = FRAME_BYTES,
  private val windowSize: Int = 16,
  private val required: Int = 12,
) {
  private val pending = ByteArray(frameBytes)
  private var pendingBytes = 0
  private val window = ArrayDeque<Boolean>(windowSize)
  private var reported = false

  fun push(bytes: ByteArray): Boolean {
    if (reported || frameBytes < 2) return false
    var index = 0
    while (index < bytes.size) {
      val copied = minOf(frameBytes - pendingBytes, bytes.size - index)
      System.arraycopy(bytes, index, pending, pendingBytes, copied)
      pendingBytes += copied
      index += copied
      if (pendingBytes == frameBytes) {
        val suspicious = suspiciousFrame(pending)
        pendingBytes = 0
        window.addLast(suspicious)
        while (window.size > windowSize) window.removeFirst()
        var suspiciousFrames = 0
        for (frame in window) if (frame) suspiciousFrames++
        if (window.size >= required && suspiciousFrames >= required) {
          reported = true
          return true
        }
      }
    }
    return false
  }

  private fun suspiciousFrame(bytes: ByteArray): Boolean {
    var zeros = 0
    var energy = 0.0
    var samples = 0
    var index = 0
    while (index + 1 < bytes.size) {
      val sample = (((bytes[index + 1].toInt() shl 8) or
        (bytes[index].toInt() and 0xff)).toShort()).toInt()
      if (sample == 0) zeros++
      val normalized = sample / 32768.0
      energy += normalized * normalized
      samples++
      index += 2
    }
    if (samples == 0) return false
    val zeroRatio = zeros.toDouble() / samples
    val rms = sqrt(energy / samples)
    return zeroRatio >= 0.5 && rms >= 0.004
  }

  private companion object {
    const val FRAME_BYTES = 3_200 // 100 ms of 16 kHz mono 16-bit PCM.
  }
}
