package com.voxtype.nativebridge

import java.util.ArrayDeque

/** Bounded PCM queue, guarded by DeepgramSession's audio lock. Never silently drop speech. */
internal class AudioBacklog {
  private val frames = ArrayDeque<ByteArray>()
  var size = 0
    private set

  fun push(bytes: ByteArray): Boolean {
    if (size + bytes.size > VoxConstants.MAX_BUFFERED_AUDIO_BYTES) return false
    frames.addLast(bytes)
    size += bytes.size
    return true
  }

  fun pop(): ByteArray? {
    val bytes = frames.pollFirst() ?: return null
    size -= bytes.size
    return bytes
  }

  fun clear() { frames.clear(); size = 0 }
}
