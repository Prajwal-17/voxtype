package com.voxtype.nativebridge

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import java.io.File
import java.io.RandomAccessFile
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/** 16 kHz mono PCM goes straight to the WebSocket and a private WAV file. */
class AudioCapture(private val context: Context, private val onAudio: (ByteArray) -> Unit,
                   private val onStopped: (File?, Long) -> Unit) {
  private val running = AtomicBoolean(false)
  private var recorder: AudioRecord? = null
  private var thread: Thread? = null
  private var startedAt = 0L

  @SuppressLint("MissingPermission")
  fun start() {
    check(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
    check(running.compareAndSet(false, true))
    val minSize = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    check(minSize > 0)
    val audio = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000,
      AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minSize, 3200))
    if (audio.state != AudioRecord.STATE_INITIALIZED) {
      audio.release()
      running.set(false)
      throw IllegalStateException("Microphone unavailable")
    }
    recorder = audio
    val dir = File(context.filesDir, "recordings").apply { mkdirs() }
    val file = File(dir, "${UUID.randomUUID()}.wav")
    startedAt = System.currentTimeMillis()
    thread = Thread {
      var output: RandomAccessFile? = null
      var dataSize = 0L
      try {
        val writer = RandomAccessFile(file, "rw")
        output = writer
        writer.setLength(0)
        writer.write(ByteArray(44))
        audio.startRecording()
        val buffer = ByteArray(3200)
        while (running.get()) {
          val count = audio.read(buffer, 0, buffer.size)
          if (count > 0) {
            val chunk = buffer.copyOf(count)
            writer.write(chunk)
            dataSize += count
            onAudio(chunk)
          } else if (count < 0) break
        }
      } catch (_: Exception) {
        // Finalize any audio already sent and keep the transcript recoverable.
      } finally {
        running.set(false)
        try { audio.stop() } catch (_: Exception) {}
        audio.release()
        recorder = null
        try { output?.let { writeWavHeader(it, dataSize) } } catch (_: Exception) {}
        try { output?.close() } catch (_: Exception) {}
        val savedFile = file.takeIf { it.exists() && dataSize > 0 }
        if (savedFile == null) file.delete()
        onStopped(savedFile, System.currentTimeMillis() - startedAt)
      }
    }.apply { name = "VoxType microphone"; start() }
  }

  fun stop() {
    running.set(false)
    try { recorder?.stop() } catch (_: Exception) {}
  }

  private fun writeWavHeader(file: RandomAccessFile, bytes: Long) {
    file.seek(0)
    file.writeBytes("RIFF")
    writeInt(file, (bytes + 36).toInt())
    file.writeBytes("WAVEfmt ")
    writeInt(file, 16)
    writeShort(file, 1)
    writeShort(file, 1)
    writeInt(file, 16000)
    writeInt(file, 32000)
    writeShort(file, 2)
    writeShort(file, 16)
    file.writeBytes("data")
    writeInt(file, bytes.toInt())
  }
  private fun writeInt(file: RandomAccessFile, value: Int) {
    file.writeByte(value); file.writeByte(value ushr 8); file.writeByte(value ushr 16); file.writeByte(value ushr 24)
  }
  private fun writeShort(file: RandomAccessFile, value: Int) {
    file.writeByte(value); file.writeByte(value ushr 8)
  }
}
