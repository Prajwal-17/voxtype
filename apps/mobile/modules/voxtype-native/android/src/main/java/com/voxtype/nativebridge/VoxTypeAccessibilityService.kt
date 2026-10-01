package com.voxtype.nativebridge

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.InputMethod
import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.LinearLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File

class VoxTypeAccessibilityService : AccessibilityService() {
  companion object { var instance: VoxTypeAccessibilityService? = null; private set }

  private val main = Handler(Looper.getMainLooper())
  private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  private lateinit var windows: WindowManager
  private lateinit var store: VoxTypeStore
  private lateinit var session: NativeSession
  private var bubble: LinearLayout? = null
  private var label: TextView? = null
  private var engine: DeepgramSession? = null
  private var capture: AudioCapture? = null
  private var target: AccessibilityNodeInfo? = null
  private var recordingUserId: String? = null
  private var recordingFile: File? = null
  private var recordingDuration = 0L
  private var lastSavedId: String? = null
  private var lastDelivered = false
  private var lastCopied = false
  private var lifecycleGeneration = 0
  /** Bridge contract: plain strings (idle/connecting/listening/processing/saved/...). */
  var status: String = DictationStatus.IDLE.bridge; private set

  override fun onCreate() {
    super.onCreate()
    instance = this
    windows = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    store = VoxTypeStore(this)
    session = NativeSession(this)
  }

  override fun onServiceConnected() { super.onServiceConnected(); refreshBubble() }
  override fun onCreateInputMethod(): InputMethod = InputMethod(this)

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (status == DictationStatus.LISTENING.bridge &&
      event?.eventType == AccessibilityEvent.TYPE_VIEW_FOCUSED) {
      val current = safeFocus()
      val same = isSameAsTarget(current)
      if (current !== target) {
        try { current?.recycle() } catch (e: Exception) { VoxLog.w("node recycle failed", e) }
      }
      if (!same) { stopRecording(); return }
    }
    if (status == DictationStatus.PROCESSING.bridge || status == DictationStatus.CONNECTING.bridge) return
    refreshBubble()
  }
  override fun onInterrupt() { stopRecording() }
  override fun onUnbind(intent: android.content.Intent?): Boolean {
    stopRecording()
    return super.onUnbind(intent)
  }
  override fun onDestroy() {
    lifecycleGeneration++; recordingUserId = null
    capture?.stop(); engine?.close(); removeBubble(); instance = null
    releaseTarget()
    serviceScope.cancel()
    super.onDestroy()
  }

  private fun focus(): AccessibilityNodeInfo? = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

  private fun safeFocus(): AccessibilityNodeInfo? {
    val node = focus() ?: return null
    var owned = true
    try {
      val info = inputMethod?.currentInputEditorInfo ?: return null
      val ok = FocusGuard.isEditableTextField(
        node, packageName,
        info.packageName, info.inputType,
        FocusGuard.editorNoPersonalizedLearning(info.imeOptions),
      )
      if (!ok) return null
      owned = false
      return node
    } catch (e: Exception) {
      VoxLog.w("safeFocus check failed", e)
      return null
    } finally {
      if (owned) {
        // Rejected or failed checks: caller never sees this node, so recycle here.
        // Accepted nodes are recycled by the caller (retainTarget / transient use).
        try { node.recycle() } catch (_: Exception) {}
      }
    }
  }

  /** Transient check that never leaks the queried node. */
  private fun hasValidFocus(): Boolean {
    val node = safeFocus() ?: return false
    node.recycle()
    return true
  }

  private fun isSameAsTarget(current: AccessibilityNodeInfo?): Boolean {
    if (current == null || target == null) return false
    return InsertionHelper.isSameField(current, target!!)
  }

  private fun retainTarget(node: AccessibilityNodeInfo) {
    releaseTarget()
    target = node
  }

  private fun releaseTarget() {
    try { target?.recycle() } catch (e: Exception) { VoxLog.w("target recycle failed", e) }
    target = null
  }

  fun refreshBubble() {
    if (session.token == null || !store.bubbleEnabled || !hasValidFocus()) { removeBubble(); return }
    if (bubble == null) {
      val container = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(VoxConstants.BUBBLE_PAD_H_DP.dp, VoxConstants.BUBBLE_PAD_V_DP.dp, VoxConstants.BUBBLE_PAD_H_DP.dp, VoxConstants.BUBBLE_PAD_V_DP.dp)
        background = GradientDrawable().apply { setColor(VoxConstants.BUBBLE_COLOR); cornerRadius = VoxConstants.BUBBLE_RADIUS_DP.dp.toFloat() }
        elevation = VoxConstants.BUBBLE_ELEVATION_DP.dp.toFloat()
        setOnClickListener {
          if (status == DictationStatus.LISTENING.bridge) stopRecording()
          else if (status == DictationStatus.SAVED.bridge && !lastDelivered) {
            lastSavedId?.let { store.copyToClipboard(it) }
            lastCopied = true; refreshBubble()
          } else if (status == DictationStatus.IDLE.bridge || status == DictationStatus.SAVED.bridge) startRecording()
        }
      }
      val text = TextView(this).apply {
        setTextColor(Color.WHITE); textSize = 14f
        setPadding(VoxConstants.BUBBLE_TEXT_DP.dp, 0, VoxConstants.BUBBLE_TEXT_DP.dp, 0)
      }
      container.addView(ImageView(this).apply {
        setImageResource(R.drawable.voxtype_logo)
        layoutParams = LinearLayout.LayoutParams(VoxConstants.BUBBLE_ICON_DP.dp, VoxConstants.BUBBLE_ICON_DP.dp)
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      })
      container.addView(text)
      label = text
      bubble = container
      val params = WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
        PixelFormat.TRANSLUCENT).apply { gravity = Gravity.END or Gravity.CENTER_VERTICAL; x = VoxConstants.BUBBLE_EDGE_DP.dp }
      try {
        windows.addView(container, params)
      } catch (e: Exception) {
        VoxLog.e("add bubble failed", e)
        bubble = null; label = null
        return
      }
    }
    label?.text = bubbleText()
    bubble?.contentDescription = bubbleDescription()
    bubble?.isEnabled = status != DictationStatus.PROCESSING.bridge && status != DictationStatus.CONNECTING.bridge
  }

  private fun bubbleText(): String = when (status) {
    DictationStatus.LISTENING.bridge -> "●  Listening  ·  Stop"
    DictationStatus.CONNECTING.bridge -> "Connecting…"
    DictationStatus.PROCESSING.bridge -> "Processing…"
    DictationStatus.SAVED.bridge -> when { lastDelivered -> "Inserted  ·  VoxType"; lastCopied -> "Copied  ·  Paste anywhere"; else -> "Saved  ·  Tap to copy" }
    else -> "VoxType"
  }

  private fun bubbleDescription(): String = when (status) {
    DictationStatus.LISTENING.bridge -> "Stop VoxType recording"
    DictationStatus.PROCESSING.bridge, DictationStatus.CONNECTING.bridge -> "VoxType $status"
    DictationStatus.SAVED.bridge -> if (lastDelivered) "VoxType text inserted" else "Copy saved VoxType transcript"
    else -> "Start VoxType dictation"
  }

  private val Int.dp: Int get() = (this * resources.displayMetrics.density).toInt()
  private fun removeBubble() {
    bubble?.let { try { windows.removeView(it) } catch (e: Exception) { VoxLog.w("remove bubble failed", e) } }
    bubble = null; label = null
  }

  private fun setStatus(value: DictationStatus) = setStatusBridge(value.bridge)

  private fun setStatusBridge(value: String) {
    status = value
    refreshBubble()
    bubble?.let { view ->
      view.animate().cancel()
      if (ValueAnimator.areAnimatorsEnabled()) {
        view.scaleX = 0.96f; view.scaleY = 0.96f; view.alpha = 0.86f
        view.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(VoxConstants.BUBBLE_PRESS_ANIM_MS).start()
      } else {
        view.scaleX = 1f; view.scaleY = 1f; view.alpha = 1f
      }
    }
    try { VoxTypeNativeModule.changed() } catch (e: Exception) { VoxLog.w("notify change failed", e) }
  }

  private fun startRecording() {
    if (status != DictationStatus.IDLE.bridge && status != DictationStatus.SAVED.bridge) return
    val node = safeFocus() ?: return
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      node.recycle()
      setStatus(DictationStatus.MICROPHONE_PERMISSION_NEEDED)
      main.postDelayed({ if (status == DictationStatus.MICROPHONE_PERMISSION_NEEDED.bridge) setStatus(DictationStatus.IDLE) }, VoxConstants.MIC_PERMISSION_RESET_MS)
      return
    }
    retainTarget(node)
    recordingUserId = session.userId
    if (recordingUserId == null) {
      releaseTarget()
      return
    }
    setStatus(DictationStatus.CONNECTING)
    val stream = engine ?: DeepgramSession({ session.token }, { session.apiUrl }) {
      main.post {
        if (status == DictationStatus.LISTENING.bridge) { capture?.stop(); setStatus(DictationStatus.PROCESSING) }
        else if (status == DictationStatus.CONNECTING.bridge) setStatus(DictationStatus.IDLE)
      }
    }.also { engine = it }
    try {
      stream.begin {
        if (status != DictationStatus.CONNECTING.bridge) return@begin
        try {
          showMicrophoneNotification()
          capture = AudioCapture(this, { stream.audio(it) }, { file, duration ->
            main.post {
              if (recordingUserId == null) {
                file?.delete()
                stopForeground(STOP_FOREGROUND_REMOVE)
                return@post
              }
              recordingFile = file
              recordingDuration = duration
              stopForeground(STOP_FOREGROUND_REMOVE)
              stream.finalize { finishDictation(it) }
            }
          }).also { it.start() }
          setStatus(DictationStatus.LISTENING)
        } catch (e: Exception) {
          VoxLog.e("start capture failed", e)
          stopForeground(STOP_FOREGROUND_REMOVE)
          setStatus(DictationStatus.IDLE)
        }
      }
    } catch (e: Exception) {
      VoxLog.e("begin stream failed", e)
      setStatus(DictationStatus.IDLE)
    }
  }

  fun stopRecording() {
    if (status != DictationStatus.LISTENING.bridge) return
    setStatus(DictationStatus.PROCESSING)
    try { capture?.stop() } catch (e: Exception) { VoxLog.w("capture stop failed", e) }
    capture = null
  }

  private fun showMicrophoneNotification() {
    try {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(NotificationChannel(VoxConstants.CHANNEL_ID, VoxConstants.CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW))
      val notification = Notification.Builder(this, VoxConstants.CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_btn_speak_now)
        .setContentTitle("VoxType is listening")
        .setContentText("Tap the bubble to stop and insert text")
        .setOngoing(true).build()
      if (Build.VERSION.SDK_INT >= 29) startForeground(VoxConstants.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      else startForeground(VoxConstants.NOTIFICATION_ID, notification)
    } catch (e: Exception) {
      VoxLog.e("foreground notification failed", e)
      throw e
    }
  }

  private fun finishDictation(original: String) {
    val userId = recordingUserId ?: return
    val generation = lifecycleGeneration
    val audio = recordingFile
    val duration = recordingDuration
    recordingFile = null; recordingUserId = null
    serviceScope.launch(Dispatchers.IO) {
      val cleaned = if (store.cleanupEnabled) cleanup(original) else original
      val id = try {
        store.save(userId, cleaned, original, duration, audio)
      } catch (e: Exception) {
        VoxLog.e("dictation save failed", e)
        return@launch
      }
      withContext(Dispatchers.Main) {
        if (generation != lifecycleGeneration) return@withContext
        val delivered = if (cleaned.isNotBlank()) insertIntoTarget(cleaned) else false
        if (delivered) {
          try { store.setDelivery(id, "pasted") } catch (e: Exception) { VoxLog.w("setDelivery failed", e) }
        }
        lastSavedId = id; lastDelivered = delivered; lastCopied = false
        setStatus(DictationStatus.SAVED)
        val delay = if (delivered) VoxConstants.SAVED_AUTO_DISMISS_DELIVERED_MS else VoxConstants.SAVED_AUTO_DISMISS_MS
        main.postDelayed({ if (status == DictationStatus.SAVED.bridge) setStatus(DictationStatus.IDLE) }, delay)
      }
    }
  }

  private fun cleanup(original: String): String {
    val bearer = session.token ?: return original
    val url = session.apiUrl ?: return original
    if (original.isBlank()) return original
    return try {
      val body = JSONObject().put("text", original).toString().toRequestBody("application/json".toMediaType())
      HttpClients.default.newCall(Request.Builder().url("$url${VoxConstants.CLEANUP_PATH}")
        .header("Authorization", "Bearer $bearer").post(body).build()).execute().use { response ->
        if (!response.isSuccessful) {
          VoxLog.w("cleanup HTTP ${response.code}")
          return original
        }
        val payload = try { response.body?.string() } catch (e: Exception) {
          VoxLog.w("cleanup body failed", e); null
        }
        try {
          JSONObject(payload ?: "{}").optJSONObject("data")?.optString("text")?.takeIf { it.isNotBlank() }
        } catch (e: Exception) {
          VoxLog.w("cleanup parse failed", e); null
        } ?: original
      }
    } catch (e: Exception) {
      VoxLog.w("cleanup failed", e)
      original
    }
  }

  /** Never silently type in a different target, even if focus moved during processing. */
  private fun insertIntoTarget(text: String): Boolean {
    val current = safeFocus() ?: return false
    try {
      val pinned = target ?: return false
      if (!InsertionHelper.isSameField(current, pinned)) return false
      val connection = inputMethod?.currentInputConnection ?: return false
      return InsertionHelper.commitAndVerify(connection, text)
    } finally {
      // Do not recycle `target` itself here; it is released on next recording/sign-out.
      if (current !== target) {
        try { current.recycle() } catch (e: Exception) { VoxLog.w("node recycle failed", e) }
      }
    }
  }

  fun pasteTranscript(id: String): Boolean {
    val current = safeFocus() ?: return false
    try {
      if (!current.isEditable) return false
      if (!store.copyToClipboard(id)) return false
      val text = try { store.text(id) } catch (e: Exception) { VoxLog.w("read transcript failed", e); null } ?: return false
      val connection = inputMethod?.currentInputConnection ?: return false
      return try {
        val before = connection.getSurroundingText(text.length, 0, 0)?.text?.toString()
        connection.performContextMenuAction(android.R.id.paste)
        val after = connection.getSurroundingText(text.length, 0, 0)?.text?.toString()
        if (after != before && after?.endsWith(text) == true) {
          try { store.setDelivery(id, "pasted") } catch (e: Exception) { VoxLog.w("setDelivery failed", e) }
          true
        } else false
      } catch (e: Exception) {
        VoxLog.w("paste failed", e)
        false
      }
    } finally {
      if (current !== target) {
        try { current.recycle() } catch (e: Exception) { VoxLog.w("node recycle failed", e) }
      }
    }
  }

  fun onSignOut() {
    lifecycleGeneration++
    try { capture?.stop() } catch (e: Exception) { VoxLog.w("capture stop failed", e) }
    try { engine?.close() } catch (e: Exception) { VoxLog.w("engine close failed", e) }
    engine = null
    recordingUserId = null; recordingFile = null; lastSavedId = null
    releaseTarget()
    try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (e: Exception) { VoxLog.w("stopForeground failed", e) }
    removeBubble()
    setStatus(DictationStatus.IDLE)
  }
}
