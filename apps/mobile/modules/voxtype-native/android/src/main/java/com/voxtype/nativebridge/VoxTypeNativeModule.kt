package com.voxtype.nativebridge

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues
import java.lang.ref.WeakReference

class VoxTypeNativeModule : Module() {
  companion object {
    private var active = WeakReference<VoxTypeNativeModule>(null)
    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }
    fun changed() { mainHandler.post {
      try { active.get()?.sendEvent("onChange", mapOf("changed" to true)) }
      catch (error: Exception) { VoxLog.w("UI bridge unavailable", error) }
    } }
    private fun refreshBubble() {
      mainHandler.post { VoxTypeAccessibilityService.instance?.refreshBubble() }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("VoxTypeNative")
    Events("onChange")
    OnCreate {
      active = WeakReference(this@VoxTypeNativeModule)
    }

    AsyncFunction("getSnapshot") {
      val context = requireNotNull(appContext.reactContext)
      VoxTypeStore(context).use { store ->
        val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
          ?.contains("${context.packageName}/${VoxTypeAccessibilityService::class.java.name}", true) == true
        mapOf(
          "accessibilityEnabled" to enabled,
          "accessibilityConnected" to (VoxTypeAccessibilityService.instance?.connected == true),
          "microphoneGranted" to (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED),
          "bubbleEnabled" to store.bubbleEnabled,
          "cleanupEnabled" to store.cleanupEnabled,
          "audioLimit" to VoxTypeStore.AUDIO_LIMIT,
          "syncing" to TranscriptUploads.syncing,
          "syncError" to TranscriptUploads.error,
          "status" to (VoxTypeAccessibilityService.instance?.status ?: DictationStatus.IDLE.bridge),
          "inApp" to InAppRecorder.snapshot(),
        )
      }
    }

    AsyncFunction("openAccessibilitySettings") {
      val context = requireNotNull(appContext.reactContext)
      try {
        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (e: Exception) {
        VoxLog.e("openAccessibilitySettings failed", e)
        throw e
      }
    }

    AsyncFunction("setSession") { token: String, userId: String, apiUrl: String ->
      val context = requireNotNull(appContext.reactContext)
      NativeSession(context).save(token, userId, apiUrl)
      TranscriptUploads.request(context)
      refreshBubble()
    }

    AsyncFunction("getSession") {
      val session = NativeSession(requireNotNull(appContext.reactContext))
      mapOf("token" to session.token, "userId" to session.userId)
    }

    AsyncFunction("signOut") {
      val context = requireNotNull(appContext.reactContext)
      mainHandler.post { InAppRecorder.cancel() }
      NativeSession(context).clear()
      mainHandler.post { VoxTypeAccessibilityService.instance?.onSignOut() }
    }

    AsyncFunction("setPreference") { key: String, value: String ->
      val context = requireNotNull(appContext.reactContext)
      VoxTypeStore(context).use { store ->
      when (key) {
        "bubbleEnabled" -> store.bubbleEnabled =
          value.toBooleanStrictOrNull() ?: throw IllegalArgumentException("bubbleEnabled must be 'true' or 'false'")
        "cleanupEnabled" -> store.cleanupEnabled =
          value.toBooleanStrictOrNull() ?: throw IllegalArgumentException("cleanupEnabled must be 'true' or 'false'")
        else -> throw IllegalArgumentException("Unknown preference: $key")
      }
      }
      refreshBubble()
      changed()
    }

    // Typed alternatives to the generic string-based setPreference. Additive only.
    AsyncFunction("setBubbleEnabled") { enabled: Boolean ->
      VoxTypeStore(requireNotNull(appContext.reactContext)).use { it.bubbleEnabled = enabled }
      refreshBubble()
      changed()
    }

    AsyncFunction("setCleanupEnabled") { enabled: Boolean ->
      VoxTypeStore(requireNotNull(appContext.reactContext)).use { it.cleanupEnabled = enabled }
      refreshBubble()
      changed()
    }

    AsyncFunction("copyTranscript") { id: String ->
      VoxTypeStore(requireNotNull(appContext.reactContext)).use { it.copyToClipboard(id) }
    }

    AsyncFunction("startRecording") {
      InAppRecorder.start(requireNotNull(appContext.reactContext).applicationContext)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("stopRecording") { InAppRecorder.stop() }.runOnQueue(Queues.MAIN)
    AsyncFunction("cancelRecording") { InAppRecorder.cancel() }.runOnQueue(Queues.MAIN)
    AsyncFunction("syncTranscripts") {
      TranscriptUploads.request(requireNotNull(appContext.reactContext))
    }
    AsyncFunction("getTranscripts") { cursor: String? ->
      val context = requireNotNull(appContext.reactContext)
      VoxTypeStore(context).use { it.page(requireNotNull(NativeSession(context).userId), cursor) }
    }
    OnActivityEntersBackground { mainHandler.post { InAppRecorder.stop() } }
    OnDestroy {
      if (active.get() === this@VoxTypeNativeModule) active.clear()
      mainHandler.post { InAppRecorder.cancel() }
    }
  }
}
