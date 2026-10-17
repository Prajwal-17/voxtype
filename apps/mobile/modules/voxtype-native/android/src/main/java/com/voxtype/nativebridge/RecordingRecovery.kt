package com.voxtype.nativebridge

import android.content.Context
import java.io.File
import java.util.UUID

/** A take owns its recovery even after the UI starts another take. Only explicit cancellation discards it. */
internal class RecordingRecovery(private val context: Context, val userId: String,
  val apiUrl: String?, val id: String = UUID.randomUUID().toString(),
  val createdAt: Long = System.currentTimeMillis()) {
  private var audio: File? = null
  private var duration = 0L
  private var raw = ""
  private var discarded = false
  private var committed = false

  @Synchronized fun stopped(file: File?, durationMs: Long) {
    if (discarded) { file?.delete(); return }
    if (file != null) audio = file
    duration = durationMs
    checkpoint()
  }
  @Synchronized fun received(text: String) {
    if (text.isNotBlank()) raw = text
    checkpoint()
  }
  @Synchronized fun commit() { committed = true }
  @Synchronized fun discard() {
    if (committed) return
    discarded = true
    audio?.delete(); audio = null
    runCatching { VoxTypeStore(context).use { it.discardRecovery(userId, id) } }
      .onFailure { VoxLog.w("local recovery discard failed", it) }
  }
  private fun checkpoint() {
    if (discarded || committed || (audio == null && raw.isBlank())) return
    runCatching { VoxTypeStore(context).use {
      it.saveRecovery(id, userId, raw, createdAt, duration, audio)
      it.pruneAudio()
    }; VoxTypeNativeModule.changed("history") }
      .onFailure { VoxLog.w("local recovery save failed", it) }
  }
}
