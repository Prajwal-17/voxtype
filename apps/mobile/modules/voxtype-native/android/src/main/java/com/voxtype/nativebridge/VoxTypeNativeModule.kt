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
import java.lang.ref.WeakReference

class VoxTypeNativeModule : Module() {
  companion object {
    private var active = WeakReference<VoxTypeNativeModule>(null)
    fun changed() { Handler(Looper.getMainLooper()).post { active.get()?.sendEvent("onChange", mapOf("changed" to true)) } }
  }

  override fun definition() = ModuleDefinition {
    Name("VoxTypeNative")
    Events("onChange")
    OnCreate { active = WeakReference(this@VoxTypeNativeModule) }

    AsyncFunction("getSnapshot") {
      val context = requireNotNull(appContext.reactContext)
      val store = VoxTypeStore(context)
      val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        ?.contains("${context.packageName}/${VoxTypeAccessibilityService::class.java.name}", true) == true
      mapOf(
        "accessibilityEnabled" to enabled,
        "microphoneGranted" to (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED),
        "bubbleEnabled" to store.bubbleEnabled,
        "cleanupEnabled" to store.cleanupEnabled,
        "audioLimit" to store.audioLimit,
        "status" to (VoxTypeAccessibilityService.instance?.status ?: "idle"),
        "dictations" to store.dictations(),
      )
    }

    AsyncFunction("openAccessibilitySettings") {
      val context = requireNotNull(appContext.reactContext)
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    AsyncFunction("setSession") { token: String, userId: String, apiUrl: String ->
      val context = requireNotNull(appContext.reactContext)
      NativeSession(context).save(token, userId, apiUrl)
      Handler(Looper.getMainLooper()).post { VoxTypeAccessibilityService.instance?.refreshBubble() }
    }

    AsyncFunction("getSession") {
      val session = NativeSession(requireNotNull(appContext.reactContext))
      mapOf("token" to session.token, "userId" to session.userId)
    }

    AsyncFunction("signOut") {
      val context = requireNotNull(appContext.reactContext)
      NativeSession(context).clear()
      Handler(Looper.getMainLooper()).post { VoxTypeAccessibilityService.instance?.onSignOut() }
    }

    AsyncFunction("setPreference") { key: String, value: String ->
      val context = requireNotNull(appContext.reactContext)
      val store = VoxTypeStore(context)
      when (key) {
        "bubbleEnabled" -> store.bubbleEnabled = value.toBooleanStrict()
        "cleanupEnabled" -> store.cleanupEnabled = value.toBooleanStrict()
        "audioLimit" -> store.audioLimit = value.toInt()
        else -> throw IllegalArgumentException("Unknown preference")
      }
      Handler(Looper.getMainLooper()).post { VoxTypeAccessibilityService.instance?.refreshBubble() }
      changed()
    }

    AsyncFunction("copyTranscript") { id: String ->
      VoxTypeStore(requireNotNull(appContext.reactContext)).copyToClipboard(id)
    }

    AsyncFunction("stopRecording") {
      Handler(Looper.getMainLooper()).post { VoxTypeAccessibilityService.instance?.stopRecording() }
    }
  }
}
