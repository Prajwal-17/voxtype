package com.voxtype.nativebridge

import android.Manifest
import android.content.Intent
import android.content.Context
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.provider.Settings
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues
import java.lang.ref.WeakReference
import java.io.File
import androidx.core.content.FileProvider
import kotlinx.coroutines.runBlocking

class VoxTypeNativeModule : Module() {
  private var observedContext: Context? = null
  private var permissionObserver: ContentObserver? = null
  companion object {
    private var active = WeakReference<VoxTypeNativeModule>(null)
    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }
    fun changed() { mainHandler.post {
      try { active.get()?.sendEvent("onChange", mapOf("changed" to true)) }
      catch (error: Exception) { VoxLog.w("UI bridge unavailable", error) }
    } }
    fun audioLevel(level: Float) { mainHandler.post {
      try { active.get()?.sendEvent("onAudioLevel", mapOf("level" to level)) }
      catch (error: Exception) { VoxLog.w("audio level bridge unavailable", error) }
    } }
    private fun refreshBubble() {
      mainHandler.post { VoxTypeAccessibilityService.instance?.refreshBubble() }
    }
  }

  private fun observePermissions() {
    if (permissionObserver != null) return
    val context = appContext.reactContext?.applicationContext ?: return
    val observer = object : ContentObserver(mainHandler) {
      override fun onChange(selfChange: Boolean) {
        runCatching { BubbleHealth.observeAccessibility(context) }
          .onFailure { VoxLog.w("accessibility observation failed", it) }
        changed()
      }
    }
    try {
      context.contentResolver.registerContentObserver(
        Settings.Secure.getUriFor(Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES), false, observer)
    } catch (error: Exception) { VoxLog.w("accessibility observer unavailable", error); return }
    observedContext = context
    permissionObserver = observer
  }

  override fun definition() = ModuleDefinition {
    Name("VoxTypeNative")
    Events("onChange", "onAudioLevel")
    OnCreate {
      active = WeakReference(this@VoxTypeNativeModule)
      observePermissions()
    }

    AsyncFunction("getSnapshot") {
      val context = requireNotNull(appContext.reactContext)
      VoxTypeStore(context).use { store ->
        val enabled = BubbleHealth.observeAccessibility(context)
        mapOf(
          "accessibilityEnabled" to enabled,
          "accessibilityConnected" to (VoxTypeAccessibilityService.instance?.connected == true),
          "microphoneGranted" to (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED),
          "bubbleEnabled" to store.bubbleEnabled,
          "cleanupEnabled" to store.cleanupEnabled,
          "vocabulary" to store.vocabulary,
          "audioLimit" to VoxTypeStore.AUDIO_LIMIT,
          "syncing" to TranscriptUploads.syncing,
          "syncError" to TranscriptUploads.error,
          "status" to (VoxTypeAccessibilityService.instance?.status ?: DictationStatus.IDLE.bridge),
          "inApp" to InAppRecorder.snapshot(),
          "bubbleHealth" to BubbleHealth.snapshot(context),
          "appHealth" to AppHealth.snapshot(context),
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

    AsyncFunction("pauseForPayments") {
      val service = VoxTypeAccessibilityService.instance
      if (service?.connected == true) service.pauseForPayments()
      else {
        // A system-enabled but disconnected service cannot call disableSelf().
        requireNotNull(appContext.reactContext).startActivity(
          Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setAuthState") { state: String ->
      requireNotNull(appContext.reactContext).getSharedPreferences("voxtype_oauth", 0).edit()
        .putString("state", state).putLong("created", System.currentTimeMillis()).commit()
      Unit
    }
    AsyncFunction("getAuthState") {
      val prefs = requireNotNull(appContext.reactContext).getSharedPreferences("voxtype_oauth", 0)
      val age = System.currentTimeMillis() - prefs.getLong("created", 0)
      if (age >= 0 && age < 600_000) prefs.getString("state", null) else null
    }
    AsyncFunction("setVocabulary") { terms: List<String> ->
      VoxTypeStore(requireNotNull(appContext.reactContext)).use { it.vocabulary = terms }
      // Drop any prewarmed socket so the next take uses the saved dictionary.
      mainHandler.post { VoxTypeAccessibilityService.instance?.refreshVocabulary() }
      changed()
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
      context.getSharedPreferences("voxtype_oauth", 0).edit().clear().apply()
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
    AsyncFunction("getTranscripts") { cursor: String?, query: String ->
      val context = requireNotNull(appContext.reactContext)
      VoxTypeStore(context).use { it.page(requireNotNull(NativeSession(context).userId), cursor, query.take(500)) }
    }
    AsyncFunction("deleteTranscript") { id: String ->
      val context = requireNotNull(appContext.reactContext).applicationContext
      runBlocking { TranscriptUploads.delete(context,id) }
    }
    AsyncFunction("shareInsights") { csv: String ->
      require(csv.toByteArray(Charsets.UTF_8).size <= 8_000_000) { "Export exceeds the file limit" }
      val context = requireNotNull(appContext.reactContext)
      val file = File(File(context.cacheDir,"insights").apply { mkdirs() }, "voxtype-insights.csv")
      file.writeText(csv,Charsets.UTF_8)
      val uri = FileProvider.getUriForFile(context,"${context.packageName}.voxtype.exports",file)
      val intent = Intent(Intent.ACTION_SEND).setType("text/csv")
        .putExtra(Intent.EXTRA_STREAM,uri)
        .apply {
          clipData = android.content.ClipData.newRawUri("Insights",uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      context.startActivity(Intent.createChooser(intent,"Export insights").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    OnActivityEntersBackground { mainHandler.post { InAppRecorder.stop() } }
    OnActivityEntersForeground { observePermissions(); changed(); refreshBubble() }
    OnDestroy {
      runCatching { permissionObserver?.let { observedContext?.contentResolver?.unregisterContentObserver(it) } }
        .onFailure { VoxLog.w("accessibility observer cleanup failed", it) }
      permissionObserver = null
      observedContext = null
      if (active.get() === this@VoxTypeNativeModule) active.clear()
      mainHandler.post { InAppRecorder.cancel() }
    }
  }
}
