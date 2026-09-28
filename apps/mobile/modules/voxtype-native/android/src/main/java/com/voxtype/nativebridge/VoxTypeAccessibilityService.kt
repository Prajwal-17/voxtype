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
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.LinearLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File

class VoxTypeAccessibilityService : AccessibilityService() {
  companion object { var instance: VoxTypeAccessibilityService? = null; private set }
  private val main = Handler(Looper.getMainLooper())
  private val client = OkHttpClient()
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
  var status: String = "idle"; private set

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
    if (status == "listening" && event?.eventType == AccessibilityEvent.TYPE_VIEW_FOCUSED && safeFocus() != target) { stopRecording(); return }
    if (status == "processing" || status == "connecting") return
    refreshBubble()
  }
  override fun onInterrupt() { stopRecording() }
  override fun onDestroy() {
    lifecycleGeneration++; recordingUserId = null
    capture?.stop(); engine?.close(); removeBubble(); instance = null
    super.onDestroy()
  }

  private fun focus(): AccessibilityNodeInfo? = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

  private fun safeFocus(): AccessibilityNodeInfo? {
    val node = focus() ?: return null
    if (!node.isEditable || node.isPassword || node.packageName?.toString() == packageName) return null
    if (Build.VERSION.SDK_INT < 33) return null
    val info = inputMethod?.currentInputEditorInfo ?: return null
    if (info.packageName != node.packageName?.toString()) return null
    val kind = info.inputType
    if (kind == InputType.TYPE_NULL) return null
    // Dictation is for prose fields. Excluding numeric, phone and date inputs also blocks
    // many one-time-code and payment fields that do not expose a password flag.
    if ((kind and InputType.TYPE_MASK_CLASS) != InputType.TYPE_CLASS_TEXT) return null
    val variation = kind and InputType.TYPE_MASK_VARIATION
    if (variation in setOf(InputType.TYPE_TEXT_VARIATION_PASSWORD,
      InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD, InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD)) return null
    if ((info.imeOptions and android.view.inputmethod.EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING) != 0) return null
    val hint = listOfNotNull(node.hintText?.toString(), node.contentDescription?.toString()).joinToString(" ").lowercase()
    if (listOf("password", "passcode", "pin code", "security code", "verification code",
      "one-time", "one time", "otp", "2fa", "cvv", "cvc", "credit card", "card number",
      "payment card", "security answer").any { hint.contains(it) }) return null
    return node
  }

  fun refreshBubble() {
    if (session.token == null || !store.bubbleEnabled || safeFocus() == null) { removeBubble(); return }
    if (bubble == null) {
      val container = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(16.dp, 10.dp, 16.dp, 10.dp)
        background = GradientDrawable().apply { setColor(Color.rgb(32, 34, 31)); cornerRadius = 32.dp.toFloat() }
        elevation = 8.dp.toFloat()
        setOnClickListener {
          if (status == "listening") stopRecording()
          else if (status == "saved" && !lastDelivered) {
            lastSavedId?.let { store.copyToClipboard(it) }
            lastCopied = true; refreshBubble()
          } else if (status == "idle" || status == "saved") startRecording()
        }
      }
      val text = TextView(this).apply {
        setTextColor(Color.WHITE); textSize = 14f
        setPadding(8.dp, 0, 8.dp, 0)
      }
      container.addView(ImageView(this).apply {
        setImageResource(R.drawable.voxtype_logo)
        layoutParams = LinearLayout.LayoutParams(24.dp, 24.dp)
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      })
      container.addView(text)
      label = text
      bubble = container
      val params = WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
        PixelFormat.TRANSLUCENT).apply { gravity = Gravity.END or Gravity.CENTER_VERTICAL; x = 12.dp }
      windows.addView(container, params)
    }
    label?.text = when (status) {
      "listening" -> "●  Listening  ·  Stop"
      "connecting" -> "Connecting…"
      "processing" -> "Processing…"
      "saved" -> when { lastDelivered -> "Inserted  ·  VoxType"; lastCopied -> "Copied  ·  Paste anywhere"; else -> "Saved  ·  Tap to copy" }
      else -> "VoxType"
    }
    bubble?.contentDescription = when (status) {
      "listening" -> "Stop VoxType recording"
      "processing", "connecting" -> "VoxType $status"
      "saved" -> if (lastDelivered) "VoxType text inserted" else "Copy saved VoxType transcript"
      else -> "Start VoxType dictation"
    }
    bubble?.isEnabled = status != "processing" && status != "connecting"
  }

  private val Int.dp: Int get() = (this * resources.displayMetrics.density).toInt()
  private fun removeBubble() {
    bubble?.let { try { windows.removeView(it) } catch (_: Exception) {} }
    bubble = null; label = null
  }
  private fun setStatus(value: String) {
    status = value
    refreshBubble()
    bubble?.let { view ->
      view.animate().cancel()
      if (ValueAnimator.areAnimatorsEnabled()) {
        view.scaleX = 0.96f; view.scaleY = 0.96f; view.alpha = 0.86f
        view.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(150).start()
      } else {
        view.scaleX = 1f; view.scaleY = 1f; view.alpha = 1f
      }
    }
    VoxTypeNativeModule.changed()
  }

  private fun startRecording() {
    if (status != "idle" && status != "saved") return
    val node = safeFocus() ?: return
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      setStatus("microphone_permission_needed")
      main.postDelayed({ if (status == "microphone_permission_needed") setStatus("idle") }, 2000)
      return
    }
    target = node
    recordingUserId = session.userId
    if (recordingUserId == null) return
    setStatus("connecting")
    val stream = engine ?: DeepgramSession({ session.token }, { session.apiUrl }) {
      main.post {
        if (status == "listening") { capture?.stop(); setStatus("processing") }
        else if (status == "connecting") setStatus("idle")
      }
    }.also { engine = it }
    try {
      stream.begin {
        if (status != "connecting") return@begin
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
          setStatus("listening")
        } catch (_: Exception) {
          stopForeground(STOP_FOREGROUND_REMOVE)
          setStatus("idle")
        }
      }
    } catch (_: Exception) { setStatus("idle") }
  }

  fun stopRecording() {
    if (status != "listening") return
    setStatus("processing")
    capture?.stop()
    capture = null
  }

  private fun showMicrophoneNotification() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(NotificationChannel("voxtype_recording", "VoxType recording", NotificationManager.IMPORTANCE_LOW))
    val notification = Notification.Builder(this, "voxtype_recording")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle("VoxType is listening")
      .setContentText("Tap the bubble to stop and insert text")
      .setOngoing(true).build()
    if (Build.VERSION.SDK_INT >= 29) startForeground(7341, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    else startForeground(7341, notification)
  }

  private fun finishDictation(original: String) {
    val userId = recordingUserId ?: return
    val generation = lifecycleGeneration
    val audio = recordingFile
    val duration = recordingDuration
    recordingFile = null; recordingUserId = null
    Thread {
      val cleaned = if (store.cleanupEnabled) cleanup(original) else original
      val id = store.save(userId, cleaned, original, duration, audio)
      main.post {
        if (generation != lifecycleGeneration) return@post
        val delivered = if (cleaned.isNotBlank()) insertIntoTarget(cleaned) else false
        if (delivered) store.setDelivery(id, "pasted")
        lastSavedId = id; lastDelivered = delivered; lastCopied = false
        setStatus("saved")
        main.postDelayed({ if (status == "saved") setStatus("idle") }, if (delivered) 1600 else 5000)
      }
    }.start()
  }

  private fun cleanup(original: String): String {
    val bearer = session.token ?: return original
    val url = session.apiUrl ?: return original
    if (original.isBlank()) return original
    return try {
      val body = JSONObject().put("text", original).toString().toRequestBody("application/json".toMediaType())
      val response = client.newCall(Request.Builder().url("$url/v1/speech/cleanup")
        .header("Authorization", "Bearer $bearer").post(body).build()).execute()
      val text = if (response.isSuccessful) JSONObject(response.body?.string() ?: "{}")
        .optJSONObject("data")?.optString("text")?.takeIf { it.isNotBlank() } else null
      response.close()
      text ?: original
    } catch (_: Exception) { original }
  }

  /** Never silently type in a different target, even if focus moved during processing. */
  private fun insertIntoTarget(text: String): Boolean {
    val current = safeFocus() ?: return false
    if (current != target) return false
    val connection = inputMethod?.currentInputConnection ?: return false
    return try {
      val before = connection.getSurroundingText(text.length, 0, 0)?.text?.toString()
      connection.commitText(text, 1, null)
      val around = connection.getSurroundingText(text.length, 0, 0)
      val after = around?.text?.toString()
      after != before && after?.endsWith(text) == true
    } catch (_: Exception) { false }
  }

  fun pasteTranscript(id: String): Boolean {
    val current = safeFocus() ?: return false
    if (!current.isEditable) return false
    if (!store.copyToClipboard(id)) return false
    return try {
      val text = store.text(id) ?: return false
      val connection = inputMethod?.currentInputConnection ?: return false
      val before = connection.getSurroundingText(text.length, 0, 0)?.text?.toString()
      connection.performContextMenuAction(android.R.id.paste)
      val after = connection.getSurroundingText(text.length, 0, 0)?.text?.toString()
      if (after != before && after?.endsWith(text) == true) { store.setDelivery(id, "pasted"); true } else false
    } catch (_: Exception) { false }
  }

  fun onSignOut() {
    lifecycleGeneration++
    capture?.stop(); engine?.close(); engine = null
    recordingUserId = null; target = null; recordingFile = null; lastSavedId = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    removeBubble()
    setStatus("idle")
  }
}
