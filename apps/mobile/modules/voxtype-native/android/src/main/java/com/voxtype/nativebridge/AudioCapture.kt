package com.voxtype.nativebridge

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioManager
import android.media.AudioRecordingConfiguration
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.Process
import androidx.core.content.ContextCompat
import java.io.File
import java.io.RandomAccessFile
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/** 16 kHz mono PCM goes straight to the WebSocket and a private WAV file. */
class AudioCapture(private val context: Context, private val onAudio: (ByteArray) -> Unit,
                   private val onStopped: (File?, Long) -> Unit,
                   private val onSilenced: () -> Unit = {},
                   private val onUnhealthy: () -> Unit = {}) {
  private val running = AtomicBoolean(false)
  private val unhealthy = AtomicBoolean(false)
  @Volatile private var monitorHealth = false
  private var recorder: AudioRecord? = null
  private var thread: Thread? = null
  private var startedAt = 0L

  @SuppressLint("MissingPermission")
  fun start() {
    check(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
      "RECORD_AUDIO not granted"
    }
    check(running.compareAndSet(false, true)) { "already started" }
    val minSize = AudioRecord.getMinBufferSize(
      VoxConstants.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    check(minSize > 0) { "no microphone buffer size" }
    // One second of headroom prevents a route reconfiguration from starving
    // the reader; read() still hands the stream on in 100ms chunks.
    val audio = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, VoxConstants.SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
      maxOf(minSize * 4, VoxConstants.SAMPLE_RATE * 2))
    if (audio.state != AudioRecord.STATE_INITIALIZED) {
      audio.release()
      running.set(false)
      throw IllegalStateException("Microphone unavailable")
    }
    recorder = audio
    val manager = context.getSystemService(AudioManager::class.java)
    val inputDevices = manager?.getDevices(AudioManager.GET_DEVICES_INPUTS)
      ?: emptyArray<AudioDeviceInfo>()
    val preferred = CaptureInputPolicy.choose(inputDevices.map {
      CaptureInput(it.type, it.sampleRates.any { rate -> rate >= VoxConstants.SAMPLE_RATE })
    })?.let { inputDevices[it] }
    if (preferred != null) {
      runCatching { audio.setPreferredDevice(preferred) }
        .onFailure { VoxLog.w("preferred microphone unavailable", it) }
    }
    monitorHealth = CaptureInputPolicy.isBluetooth(audio.routedDevice?.type ?: -1)
    val recordingCallback = object : AudioManager.AudioRecordingCallback() {
      override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
        val current = configs.firstOrNull { it.clientAudioSessionId == audio.audioSessionId }
        current?.audioDevice?.let {
          monitorHealth = CaptureInputPolicy.isBluetooth(it.type)
        }
        if (running.get() && current?.isClientSilenced == true) {
          VoxLog.w("microphone silenced by Android audio policy")
          onSilenced()
        }
      }
    }
    audio.registerAudioRecordingCallback(context.mainExecutor, recordingCallback)
    val routingCallback = object : AudioRecord.OnRoutingChangedListener {
      override fun onRoutingChanged(recorder: AudioRecord) {
        monitorHealth = CaptureInputPolicy.isBluetooth(recorder.routedDevice?.type ?: -1)
      }
    }
    val routingRegistered = runCatching {
      audio.addOnRoutingChangedListener(routingCallback, Handler(Looper.getMainLooper()))
    }.onFailure { VoxLog.w("microphone routing callback unavailable", it) }.isSuccess
    val dir = File(context.filesDir, "recordings").apply { mkdirs() }
    // Active takes cannot be mistaken for completed recordings during pruning.
    val completedFile = File(dir, "${UUID.randomUUID()}.wav")
    val file = File(dir, "${completedFile.name}.part")
    startedAt = System.currentTimeMillis()
    thread = Thread {
      var output: RandomAccessFile? = null
      var dataSize = 0L
      val health = CaptureSignalHealth()
      try {
        // Never leave the AudioRecord and WAV file unowned if the platform
        // rejects a priority change. AUDIO is sufficient for capture and is
        // less likely to be blocked than URGENT_AUDIO.
        runCatching { Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO) }
          .onFailure { VoxLog.w("audio thread priority unavailable", it) }
        val writer = RandomAccessFile(file, "rw")
        output = writer
        writer.setLength(0)
        writer.write(ByteArray(VoxConstants.WAV_HEADER_BYTES))
        audio.startRecording()
        monitorHealth = CaptureInputPolicy.isBluetooth(audio.routedDevice?.type ?: -1)
        val buffer = ByteArray(VoxConstants.AUDIO_BUFFER_BYTES)
        while (running.get()) {
          val count = audio.read(buffer, 0, buffer.size)
          if (count > 0) {
            val chunk = buffer.copyOf(count)
            val healthy = !unhealthy.get() && (!monitorHealth || !health.push(chunk))
            if (healthy) {
              writer.write(chunk)
              dataSize += count
              try { onAudio(chunk) } catch (e: Exception) { VoxLog.w("onAudio callback failed", e) }
            } else if (running.get() && unhealthy.compareAndSet(false, true)) {
              VoxLog.w("Bluetooth microphone signal became unstable")
              onUnhealthy()
            }
          } else if (count < 0) {
            VoxLog.w("AudioRecord read error: $count")
            break
          }
        }
      } catch (e: Exception) {
        // Finalize any audio already sent and keep the transcript recoverable.
        VoxLog.e("microphone loop failed", e)
      } finally {
        running.set(false)
        try { audio.stop() } catch (e: Exception) { VoxLog.w("AudioRecord.stop failed", e) }
        if (routingRegistered) {
          runCatching { audio.removeOnRoutingChangedListener(routingCallback) }
            .onFailure { VoxLog.w("microphone routing cleanup failed", it) }
        }
        audio.unregisterAudioRecordingCallback(recordingCallback)
        audio.release()
        recorder = null
        try { output?.let { writeWavHeader(it, dataSize) } } catch (e: Exception) { VoxLog.w("wav header failed", e) }
        try { output?.close() } catch (e: Exception) { VoxLog.w("wav close failed", e) }
        val savedFile = completedFile.takeIf { file.exists() && dataSize > 0 && file.renameTo(it) }
        if (savedFile == null) file.delete()
        try { onStopped(savedFile, System.currentTimeMillis() - startedAt) }
        catch (e: Exception) { VoxLog.e("onStopped callback failed", e) }
      }
    }.apply { name = "VoxType microphone"; start() }
  }

  fun stop() {
    running.set(false)
    try { recorder?.stop() } catch (e: Exception) { VoxLog.w("AudioRecord.stop failed", e) }
  }

  private fun writeWavHeader(file: RandomAccessFile, bytes: Long) {
    file.seek(0)
    file.writeBytes("RIFF")
    writeInt(file, (bytes + 36).toInt())
    file.writeBytes("WAVEfmt ")
    writeInt(file, 16)
    writeShort(file, 1)
    writeShort(file, 1)
    writeInt(file, VoxConstants.SAMPLE_RATE)
    writeInt(file, VoxConstants.BYTE_RATE)
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
