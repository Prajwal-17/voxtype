package com.voxtype.nativebridge

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.InputMethod
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ArgbEvaluator
import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.ViewConfiguration
import android.view.VelocityTracker
import android.view.WindowInsets
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.PathInterpolator
import android.view.inputmethod.EditorInfo
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ImageView
import android.widget.TextView
import android.widget.ProgressBar
import android.content.res.ColorStateList
import android.graphics.drawable.InsetDrawable
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.Call
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File

class VoxTypeAccessibilityService : AccessibilityService() {
  companion object { var instance: VoxTypeAccessibilityService? = null; private set }
  private enum class ForegroundMode { NONE, BUBBLE, MICROPHONE }

  private val main = Handler(Looper.getMainLooper())
  private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main + CoroutineExceptionHandler { _, error ->
    VoxLog.e("accessibility task failed", error)
    AppHealth.recordIssue(this, "accessibility_task", error)
    BubbleHealth.record(this, "service_error:${error.javaClass.simpleName}")
    main.post { if (connected) recoverRecording() }
  })
  private lateinit var windows: WindowManager
  private lateinit var store: VoxTypeStore
  private lateinit var session: NativeSession
  private var bubble: FrameLayout? = null
  private var bubbleMark: ImageView? = null
  private var bubbleGlyph: TextView? = null
  private var actionsRow: LinearLayout? = null
  private var cancelBtn: TextView? = null
  private var doneBtn: TextView? = null
  private var waveform: BubbleWaveformView? = null
  private var spinner: ProgressBar? = null
  private var bubbleColor = VoxConstants.BUBBLE_MUTED_COLOR
  private var bubbleError = ""
  private var connectionError = false
  private var dismissedForKeyboard = false
  @Volatile private var foregroundMode = ForegroundMode.NONE
  val foregroundStatus: String get() = foregroundMode.name.lowercase()
  @Volatile var foregroundError: String? = null; private set
  @Volatile var hiddenReason = "disconnected"; private set
  private var focusFailure = "waiting_for_editor"
  private val bubbleRefresh = BubbleRefresh(main) {
    if (!connected) false else { refreshBubbleOnce(); needsBubbleRetry() }
  }
  @Volatile var connected = false; private set
  @Volatile private var audioLevel = 0f
  private var placementAnimator: ValueAnimator? = null
  private var dockRight = true
  private var verticalPosition = 1f
  private var lastSafeBounds: BubbleGeometry? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var closeView: FrameLayout? = null
  private var closeHot = false
  private var downRawX = 0f
  private var downRawY = 0f
  private var dragStartX = 0
  private var dragStartY = 0
  private var dragVelocity: VelocityTracker? = null
  private var dragging = false
  private var discardNext = false
  private var engine: DeepgramSession? = null
  private var capture: AudioCapture? = null
  private var target: AccessibilityNodeInfo? = null
  private var recordingUserId: String? = null
  private var recordingFile: File? = null
  private var recordingDuration = 0L
  private var lastSavedId: String? = null
  private var lastDelivered = false
  private var lastCopied = false
  @Volatile private var lifecycleGeneration = 0
  private var processingJob: Job? = null
  @Volatile private var cleanupCall: Call? = null
  /** Bridge contract: plain strings (idle/connecting/listening/processing/saved/...). */
  var status: String = DictationStatus.IDLE.bridge; private set

  override fun onCreate() {
    super.onCreate()
    instance = this
    windows = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    store = VoxTypeStore(this)
    session = NativeSession(this)
    BubbleHealth.record(this, "service_created")
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    connected = true
    VoxLog.d("accessibility connected")
    runCatching { BubbleHealth.observeAccessibility(this) }
      .onFailure { VoxLog.w("accessibility observation failed", it) }
    BubbleHealth.record(this, "service_connected")
    refreshBubble()
    serviceScope.launch(Dispatchers.IO) { runCatching { store.pruneAudio() }.onFailure { VoxLog.w("audio pruning failed", it) } }
    VoxTypeNativeModule.changed()
  }
  override fun onCreateInputMethod(): InputMethod = object : InputMethod(this) {
    override fun onStartInput(attribute: EditorInfo, restarting: Boolean) {
      super.onStartInput(attribute, restarting)
      // EditorInfo can arrive after the window/focus event that first showed the keyboard.
      requestBubbleRefresh()
    }
    override fun onFinishInput() {
      super.onFinishInput()
      stopRecording()
      dismissedForKeyboard = false
      hideBubble("keyboard_closed")
      requestBubbleRefresh()
    }
  }

  private fun requestBubbleRefresh() {
    bubbleRefresh.request()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    refreshBubble()
    // A transient empty window list must not leave the overlay hidden indefinitely.
    requestBubbleRefresh()
  }
  override fun onInterrupt() { stopRecording() }

  /** Android only allows the user to re-enable access after disableSelf(). */
  fun pauseForPayments() {
    // Stop recovery and queued delivery before asking Android to revoke access.
    connected = false
    bubbleRefresh.cancel()
    resetRecording(DictationStatus.IDLE)
    hideBubble("payments_paused")
    disableSelf()
    BubbleHealth.record(this, "payments_pause")
    VoxTypeNativeModule.changed()
  }
  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    refreshBubble()
    requestBubbleRefresh()
  }
  override fun onUnbind(intent: android.content.Intent?): Boolean {
    connected = false
    bubbleRefresh.cancel()
    VoxLog.d("accessibility unbound")
    runCatching { BubbleHealth.observeAccessibility(this) }
      .onFailure { VoxLog.w("accessibility observation failed", it) }
    BubbleHealth.record(this, "service_unbound")
    VoxTypeNativeModule.changed()
    stopRecording()
    hideBubble("disconnected")
    stopForeground(STOP_FOREGROUND_REMOVE)
    foregroundMode = ForegroundMode.NONE
    return super.onUnbind(intent)
  }
  override fun onDestroy() {
    connected = false
    VoxLog.d("accessibility destroyed")
    BubbleHealth.record(this, "service_destroyed")
    bubbleRefresh.cancel()
    main.removeCallbacksAndMessages(null)
    lifecycleGeneration++; recordingUserId = null
    processingJob?.cancel(); cleanupCall?.cancel()
    recordingFile?.delete(); recordingFile = null
    capture?.stop(); engine?.close(); hideBubble("disconnected"); instance = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    foregroundMode = ForegroundMode.NONE
    releaseTarget()
    serviceScope.cancel()
    store.close()
    super.onDestroy()
  }

  private fun focus(): AccessibilityNodeInfo? {
    val root = rootInActiveWindow ?: return null
    return try { root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) } finally { root.recycle() }
  }

  private fun safeFocus(): AccessibilityNodeInfo? {
    focusFailure = "waiting_for_editor"
    if (!keyboardVisible()) { focusFailure = "keyboard_closed"; return null }
    val node = try { focus() } catch (e: Exception) { VoxLog.w("focus unavailable", e); null } ?: return null
    var owned = true
    try {
      val info = inputMethod?.currentInputEditorInfo ?: return null
      // Editor metadata can still belong to the previous app during a window transition.
      if (info.packageName == null || info.packageName != node.packageName?.toString()) return null
      val ok = FocusGuard.isEditableTextField(node, packageName, info)
      if (!ok) { focusFailure = "unsupported_field"; return null }
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

  private fun keyboardVisible(): Boolean = try {
    getWindows().any { it.type == android.view.accessibility.AccessibilityWindowInfo.TYPE_INPUT_METHOD }
  } catch (e: Exception) { VoxLog.w("keyboard windows unavailable", e); false }

  private fun expanded(): Boolean = status == DictationStatus.LISTENING.bridge

  fun refreshBubble() {
    refreshBubbleOnce()
    if (needsBubbleRetry()) requestBubbleRefresh()
  }

  private fun needsBubbleRetry(): Boolean = connected &&
    (foregroundError != null || hiddenReason in listOf("waiting_for_editor", "overlay_error", "state_error"))

  private fun refreshBubbleOnce() {
    try {
      refreshBubbleState()
    } catch (error: Exception) {
      VoxLog.w("bubble refresh failed", error)
      hideBubble("state_error")
    }
  }

  private fun bubbleReason(reason: String) {
    if (hiddenReason == reason) return
    hiddenReason = reason
    BubbleHealth.record(this, "bubble:$reason")
    VoxTypeNativeModule.changed()
  }

  private fun hideBubble(reason: String) { removeBubble(); bubbleReason(reason) }

  private fun refreshBubbleState() {
    updateBubbleForeground()
    if (!connected) { hideBubble("disconnected"); return }
    // Revalidate the target on both accessibility events and delayed editor callbacks.
    if (status == DictationStatus.LISTENING.bridge) {
      val current = safeFocus()
      val same = isSameAsTarget(current)
      current?.recycle()
      if (!same || !store.bubbleEnabled) { stopRecording(); hideBubble(focusFailure); return }
    }
    if (!keyboardVisible()) dismissedForKeyboard = false
    if (dismissedForKeyboard) { hideBubble("dismissed"); return }
    if (!store.bubbleEnabled) { bubbleRefresh.cancel(); hideBubble("disabled"); return }
    if (session.token == null) { bubbleRefresh.cancel(); hideBubble("sign_in_required"); return }
    if (InAppRecorder.busy) { hideBubble("in_app_recording"); return }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      hideBubble("microphone_permission"); return
    }
    if (!hasValidFocus()) { hideBubble(focusFailure); return }
    if (bubble == null) {
      createBubble()
      speechStream().warm()
    }
    if (bubble == null) return
    updateBubbleContent()
    if (!dragging && safeBounds() != lastSafeBounds) placeBubble(animate = true)
    if (bubble != null) bubbleReason("visible")
  }

  private val Int.dp: Int get() = (this * resources.displayMetrics.density).toInt()

  private fun bubblePrefs() = getSharedPreferences("voxtype_bubble_pos", Context.MODE_PRIVATE)

  private fun screenBounds(): android.graphics.Rect {
    return try {
      windows.currentWindowMetrics.bounds
    } catch (e: Exception) {
      VoxLog.w("window metrics unavailable", e)
      val metrics = resources.displayMetrics
      android.graphics.Rect(0, 0, metrics.widthPixels, metrics.heightPixels)
    }
  }

  /** Same coordinate system as overlay LayoutParams (full display, physical left/top). */
  private fun safeBounds(): BubbleGeometry {
    val bounds = screenBounds()
    val insets = try {
      windows.currentWindowMetrics.windowInsets.getInsetsIgnoringVisibility(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
    } catch (_: Exception) { android.graphics.Insets.NONE }
    val margin = VoxConstants.BUBBLE_EDGE_DP.dp
    val top = insets.top + margin
    val bottom = bounds.height() - insets.bottom - margin
    return BubbleGeometry(insets.left + margin, top,
      (bounds.width() - insets.right - margin).coerceAtLeast(insets.left + margin),
      bottom.coerceAtLeast(top + VoxConstants.BUBBLE_SIZE_DP.dp))
  }

  /** Only old preference migration uses keyboard bounds; live placement stays screen-relative. */
  private fun keyboardBounds(): BubbleGeometry {
    val area = safeBounds()
    val bounds = screenBounds()
    val margin = VoxConstants.BUBBLE_EDGE_DP.dp
    var bottom = area.bottom
    getWindows().filter { it.type == android.view.accessibility.AccessibilityWindowInfo.TYPE_INPUT_METHOD }
      .forEach { window ->
        val keyboard = android.graphics.Rect()
        window.getBoundsInScreen(keyboard)
        if (!keyboard.isEmpty) bottom = minOf(bottom, keyboard.top - bounds.top - margin)
      }
    return area.copy(bottom = bottom.coerceAtLeast(area.top + VoxConstants.BUBBLE_SIZE_DP.dp))
  }

  private fun updateBubbleLayout() {
    val root = bubble ?: return
    val params = bubbleParams ?: return
    try { windows.updateViewLayout(root, params) }
    catch (e: Exception) {
      VoxLog.w("bubble layout failed", e)
      // A stale reference otherwise prevents createBubble from ever running again.
      hideBubble("overlay_error")
      requestBubbleRefresh()
    }
  }

  private fun placeBubble(width: Int? = null, animate: Boolean = true) {
    val params = bubbleParams ?: return
    val area = safeBounds()
    lastSafeBounds = area
    val desiredWidth = width ?: if (expanded()) VoxConstants.BUBBLE_LISTEN_WIDTH_DP.dp else VoxConstants.BUBBLE_SIZE_DP.dp
    val targetWidth = desiredWidth.coerceAtMost((area.right - area.left).coerceAtLeast(1))
    val x = area.dockX(dockRight, targetWidth)
    val y = area.yAt(verticalPosition, params.height)
    val background = bubble?.background as? GradientDrawable
    val targetRadius = if (status in listOf("idle", "microphone_permission_needed"))
      VoxConstants.BUBBLE_RADIUS_DP.dp.toFloat() else minOf(targetWidth, params.height) / 2f
    val targetColor = when (status) {
      "listening", "processing", "connecting" -> VoxConstants.BUBBLE_ACTIVE_COLOR
      "microphone_permission_needed" -> VoxConstants.CLOSE_COLOR
      else -> VoxConstants.BUBBLE_MUTED_COLOR
    }
    placementAnimator?.cancel()
    placementAnimator = null
    // A fast stop can arrive while expansion is still at its initial width.
    // Cancel that animation even when the new compact target already matches.
    if (params.x == x && params.y == y && params.width == targetWidth &&
      background?.cornerRadius == targetRadius && bubbleColor == targetColor) return
    if (!animate || !ValueAnimator.areAnimatorsEnabled()) {
      params.x = x; params.y = y; params.width = targetWidth
      background?.cornerRadius = targetRadius
      bubbleColor = targetColor; background?.setColor(bubbleColor)
      bubble?.invalidateOutline()
      updateBubbleLayout()
      return
    }
    val startX = params.x; val startY = params.y; val startWidth = params.width
    val startRadius = background?.cornerRadius ?: targetRadius
    val startColor = bubbleColor
    val colorEvaluator = ArgbEvaluator()
    placementAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = if (startWidth != targetWidth || startRadius != targetRadius || startColor != targetColor)
        VoxConstants.BUBBLE_WIDTH_ANIM_MS else VoxConstants.BUBBLE_SNAP_ANIM_MS
      interpolator = PathInterpolator(0.2f, 0f, 0f, 1f)
      addUpdateListener {
        val fraction = it.animatedValue as Float
        params.x = (startX + (x - startX) * fraction).toInt()
        params.y = (startY + (y - startY) * fraction).toInt()
        params.width = (startWidth + (targetWidth - startWidth) * fraction).toInt()
        background?.cornerRadius = (startRadius + (targetRadius - startRadius) * fraction)
          .coerceAtMost(minOf(params.width, params.height) / 2f)
        bubbleColor = colorEvaluator.evaluate(fraction, startColor, targetColor) as Int
        background?.setColor(bubbleColor)
        bubble?.invalidateOutline()
        updateBubbleLayout()
      }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          if (placementAnimator === animation) placementAnimator = null
        }
      })
      start()
    }
  }

  /**
   * Muted edge-docked rounded square. Expands inwards for recording, with real microphone
   * history between stop and cancel. Only recording expands; processing is a compact spinner.
   */
  private fun createBubble() {
    val size = VoxConstants.BUBBLE_SIZE_DP.dp
    bubbleColor = VoxConstants.BUBBLE_MUTED_COLOR
    val root = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        setColor(VoxConstants.BUBBLE_MUTED_COLOR)
        setStroke(1.dp, VoxConstants.BUBBLE_OUTLINE_COLOR)
        cornerRadius = VoxConstants.BUBBLE_RADIUS_DP.dp.toFloat()
      }
      elevation = VoxConstants.BUBBLE_ELEVATION_DP.dp.toFloat()
      clipToOutline = true
      isClickable = true
      isFocusable = false
    }
    val mark = ImageView(this).apply {
      setImageResource(R.drawable.voxtype_bubble_mark)
      scaleType = ImageView.ScaleType.FIT_CENTER
      setColorFilter(VoxConstants.BUBBLE_DONE_ICON)
      alpha = 1f
      layoutParams = FrameLayout.LayoutParams(
        VoxConstants.BUBBLE_ICON_DP.dp, VoxConstants.BUBBLE_ICON_DP.dp, Gravity.CENTER)
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    val glyph = TextView(this).apply {
      setTextColor(VoxTheme.ink)
      textSize = VoxConstants.BUBBLE_GLYPH_SP
      gravity = Gravity.CENTER
      layoutParams = FrameLayout.LayoutParams(size, size, Gravity.CENTER)
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      visibility = View.GONE
    }
    val actionSize = VoxConstants.BUBBLE_ACTION_DP.dp
    val cancel = TextView(this).apply {
      text = "✕"; setTextColor(VoxConstants.BUBBLE_DONE_ICON); textSize = 18f; gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        setColor(VoxConstants.BUBBLE_ACTION_COLOR)
        cornerRadius = VoxConstants.BUBBLE_ACTION_RADIUS_DP.dp.toFloat()
      }
      layoutParams = LinearLayout.LayoutParams(actionSize, actionSize).apply {
        marginEnd = 4.dp
      }
      contentDescription = "Cancel dictation"
      isClickable = true
      isFocusable = false
    }
    val bars = BubbleWaveformView(this) { audioLevel }.apply {
      layoutParams = LinearLayout.LayoutParams(0, 34.dp, 1f)
    }
    val done = TextView(this).apply {
      text = "■"; setTextColor(VoxConstants.BUBBLE_DONE_ICON); textSize = 18f; gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        setColor(VoxConstants.BUBBLE_DONE_COLOR)
        cornerRadius = VoxConstants.BUBBLE_ACTION_RADIUS_DP.dp.toFloat()
      }
      layoutParams = LinearLayout.LayoutParams(actionSize, actionSize).apply {
        marginStart = 4.dp
      }
      contentDescription = "Finish and insert dictation"
      isClickable = true
      isFocusable = false
    }
    row.addView(done); row.addView(bars); row.addView(cancel)
    row.setPadding(4.dp, 0, 4.dp, 0)
    // Inset rounded controls retain their full 44dp touch targets.
    cancel.background = InsetDrawable(cancel.background, 7.dp)
    done.background = InsetDrawable(done.background, 7.dp)
    val loader = ProgressBar(this, null, android.R.attr.progressBarStyleSmall).apply {
      isIndeterminate = true
      indeterminateTintList = ColorStateList.valueOf(VoxConstants.BUBBLE_WAVE_COLOR)
      visibility = View.GONE
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    root.addView(mark); root.addView(glyph); root.addView(row)
    root.addView(loader, FrameLayout.LayoutParams(24.dp, 24.dp, Gravity.CENTER))
    spinner = loader
    waveform = bars
    bubbleMark = mark; bubbleGlyph = glyph; actionsRow = row
    cancelBtn = cancel; doneBtn = done

    val touch = View.OnTouchListener { view, event -> onBubbleTouch(view, event) }
    root.setOnTouchListener(touch)
    cancel.setOnTouchListener(touch)
    done.setOnTouchListener(touch)
    root.setOnClickListener { onBubbleTap() }
    cancel.setOnClickListener { cancelRecording() }
    done.setOnClickListener { stopRecording() }

    val area = safeBounds()
    val prefs = bubblePrefs()
    dockRight = if (prefs.contains("dockRight")) prefs.getBoolean("dockRight", true)
      else area.nearestRight(prefs.getInt("bx", area.right), size)
    verticalPosition = if (prefs.contains("screenVerticalPosition")) prefs.getFloat("screenVerticalPosition", 1f).coerceIn(0f, 1f)
      else {
        // Migrate the old keyboard-relative preference once. Keyboard changes must never
        // change the remembered screen position on later appearances.
        val legacy = keyboardBounds()
        val y = if (prefs.contains("verticalPosition")) legacy.yAt(prefs.getFloat("verticalPosition", 1f), size)
          else if (prefs.contains("by")) prefs.getInt("by", legacy.bottom) else legacy.yAt(1f, size)
        area.fractionAt(y, size).also { fraction ->
          prefs.edit().putFloat("screenVerticalPosition", fraction).apply()
        }
      }
    lastSafeBounds = area
    val params = WindowManager.LayoutParams(size, size,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT).apply {
      gravity = Gravity.TOP or Gravity.LEFT
      flags = flags or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
      softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
      setFitInsetsTypes(0)
      x = area.dockX(dockRight, size)
      y = area.yAt(verticalPosition, size)
    }
    bubble = root
    bubbleParams = params
    try {
      windows.addView(root, params)
    } catch (e: Exception) {
      VoxLog.e("add bubble failed", e)
      bubble = null; bubbleParams = null
      bubbleReason("overlay_error")
    }
  }

  private var lastBubbleRender: String? = null

  private fun updateBubbleContent() {
    val root = bubble ?: return
    // Accessibility events fire constantly; never restart running animations.
    val renderKey = "$status|$lastDelivered|$lastCopied|$connectionError|$bubbleError"
    if (renderKey == lastBubbleRender) return
    lastBubbleRender = renderKey
    stopMotion()
    spinner?.visibility = View.GONE
    when (status) {
      DictationStatus.LISTENING.bridge -> {
        bubbleMark?.visibility = View.GONE
        bubbleGlyph?.visibility = View.GONE
        actionsRow?.visibility = View.VISIBLE
        waveform?.visibility = View.VISIBLE
        doneBtn?.isEnabled = true
        doneBtn?.alpha = 1f
        waveform?.setListening(true)
        animateBubbleWidth(VoxConstants.BUBBLE_LISTEN_WIDTH_DP.dp)
      }
      DictationStatus.CONNECTING.bridge, DictationStatus.PROCESSING.bridge -> {
        bubbleMark?.visibility = View.GONE
        actionsRow?.visibility = View.GONE
        waveform?.visibility = View.GONE
        bubbleGlyph?.visibility = View.GONE
        spinner?.visibility = View.VISIBLE
        animateBubbleWidth(VoxConstants.BUBBLE_SIZE_DP.dp)
      }
      DictationStatus.SAVED.bridge -> {
        bubbleMark?.visibility = View.GONE
        actionsRow?.visibility = View.GONE
        bubbleGlyph?.visibility = View.VISIBLE
        bubbleGlyph?.text = "✓"
        bubbleGlyph?.setTextColor(VoxConstants.BUBBLE_DONE_ICON)
        animateBubbleWidth(VoxConstants.BUBBLE_SIZE_DP.dp)
      }
      DictationStatus.MICROPHONE_PERMISSION_NEEDED.bridge -> {
        bubbleMark?.visibility = View.GONE
        actionsRow?.visibility = View.GONE
        bubbleGlyph?.visibility = View.VISIBLE
        bubbleGlyph?.text = "!"
        bubbleGlyph?.setTextColor(VoxConstants.BUBBLE_DONE_ICON)
        animateBubbleWidth(VoxConstants.BUBBLE_SIZE_DP.dp)
      }
      DictationStatus.ERROR.bridge -> {
        actionsRow?.visibility = View.GONE
        bubbleGlyph?.visibility = if (connectionError) View.GONE else View.VISIBLE
        bubbleGlyph?.text = "!"
        bubbleGlyph?.setTextColor(VoxConstants.BUBBLE_DONE_ICON)
        bubbleMark?.setImageResource(R.drawable.voxtype_connection_error)
        bubbleMark?.visibility = if (connectionError) View.VISIBLE else View.GONE
        animateBubbleWidth(VoxConstants.BUBBLE_SIZE_DP.dp)
      }
      else -> {
        bubbleMark?.setImageResource(R.drawable.voxtype_bubble_mark)
        bubbleMark?.visibility = View.VISIBLE
        bubbleMark?.alpha = 1f
        bubbleGlyph?.visibility = View.GONE
        actionsRow?.visibility = View.GONE
        animateBubbleWidth(VoxConstants.BUBBLE_SIZE_DP.dp)
      }
    }
    root.contentDescription = bubbleDescription()
  }

  private fun bubbleDescription(): String = when (status) {
    DictationStatus.LISTENING.bridge -> "Dictating. Tap stop to finish, cross to cancel, or drag to dock on either edge."
    DictationStatus.PROCESSING.bridge, DictationStatus.CONNECTING.bridge -> "VoxType $status. Tap to cancel dictation."
    DictationStatus.MICROPHONE_PERMISSION_NEEDED.bridge -> "VoxType needs microphone access"
    DictationStatus.ERROR.bridge -> "$bubbleError Tap to retry dictation."
    DictationStatus.SAVED.bridge -> if (lastDelivered) "VoxType text inserted" else "Copy saved VoxType transcript"
    else -> "Start VoxType dictation. Drag to either edge, or drop on the close mark to hide."
  }

  private fun animateBubbleWidth(target: Int) {
    if (!dragging) placeBubble(target)
  }

  private fun stopMotion() {
    waveform?.setListening(false)
    bubbleGlyph?.rotation = 0f
  }

  private fun pressFeedback(view: View, pressed: Boolean) {
    view.animate().cancel()
    val scale = if (pressed) 0.96f else 1f
    if (ValueAnimator.areAnimatorsEnabled()) {
      view.animate().scaleX(scale).scaleY(scale).setDuration(120L).start()
    } else { view.scaleX = 1f; view.scaleY = 1f }
  }

  private fun onBubbleTouch(view: View, event: MotionEvent): Boolean {
    val params = bubbleParams ?: return false
    val root = bubble ?: return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        // Interrupt motion under the finger, without jumping to the animation's endpoint.
        placementAnimator?.cancel(); placementAnimator = null
        dragVelocity?.recycle()
        dragVelocity = VelocityTracker.obtain()
        trackDrag(event)
        downRawX = event.rawX; downRawY = event.rawY
        dragStartX = params.x; dragStartY = params.y
        dragging = false
        pressFeedback(view, true)
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        trackDrag(event)
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        if (!dragging && (kotlin.math.abs(event.rawX - downRawX) > slop || kotlin.math.abs(event.rawY - downRawY) > slop)) {
          dragging = true
          pressFeedback(view, false)
          root.elevation = 6.dp.toFloat()
          showCloseZone()
        }
        if (dragging) {
          val area = safeBounds()
          params.x = area.clampX((dragStartX + event.rawX - downRawX).toInt(), params.width)
          params.y = area.clampY((dragStartY + event.rawY - downRawY).toInt(), params.height)
          updateBubbleLayout()
          updateCloseHot()
        }
        return true
      }
      MotionEvent.ACTION_UP -> {
        trackDrag(event)
        dragVelocity?.computeCurrentVelocity(1000, ViewConfiguration.get(this).scaledMaximumFlingVelocity.toFloat())
        val velocityX = dragVelocity?.xVelocity ?: 0f
        val velocityY = dragVelocity?.yVelocity ?: 0f
        dragVelocity?.recycle(); dragVelocity = null
        pressFeedback(view, false)
        root.elevation = VoxConstants.BUBBLE_ELEVATION_DP.dp.toFloat()
        if (dragging) {
          dragging = false
          finishDrag(allowDismiss = true, velocityX = velocityX, velocityY = velocityY)
        } else {
          view.performClick()
          // A tap can interrupt docking without changing status (e.g. processing).
          if (placementAnimator == null) placeBubble()
        }
        return true
      }
      MotionEvent.ACTION_CANCEL -> {
        dragVelocity?.recycle(); dragVelocity = null
        pressFeedback(view, false)
        root.elevation = VoxConstants.BUBBLE_ELEVATION_DP.dp.toFloat()
        if (dragging) { dragging = false; finishDrag(allowDismiss = false) }
        else placeBubble()
        return true
      }
    }
    return false
  }

  private fun trackDrag(event: MotionEvent) {
    val tracker = dragVelocity ?: return
    // Local coordinates move with the overlay; fling speed needs screen coordinates.
    val screenEvent = MotionEvent.obtain(event)
    screenEvent.offsetLocation(event.rawX - event.x, event.rawY - event.y)
    tracker.addMovement(screenEvent)
    screenEvent.recycle()
  }

  private fun onBubbleTap() {
    if (status == DictationStatus.LISTENING.bridge) stopRecording()
    else if (status in listOf(DictationStatus.CONNECTING.bridge, DictationStatus.PROCESSING.bridge)) cancelRecording()
    else if (status == DictationStatus.SAVED.bridge && !lastDelivered) {
      lastSavedId?.let { store.copyToClipboard(it) }
      lastCopied = true; refreshBubble()
    } else if (status in listOf(DictationStatus.IDLE.bridge, DictationStatus.SAVED.bridge, DictationStatus.ERROR.bridge)) startRecording()
  }

  private fun showCloseZone() {
    if (closeView != null) return
    val size = VoxConstants.CLOSE_SIZE_DP.dp
    val zone = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        setColor(VoxConstants.CLOSE_COLOR)
        cornerRadius = (VoxConstants.CLOSE_SIZE_DP.dp / 2).toFloat()
      }
      elevation = VoxConstants.BUBBLE_ELEVATION_DP.dp.toFloat()
      alpha = 0.92f
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    val cross = TextView(this).apply {
      text = "✕"; setTextColor(VoxConstants.BUBBLE_DONE_ICON); textSize = 24f; gravity = Gravity.CENTER
      layoutParams = FrameLayout.LayoutParams(size, size, Gravity.CENTER)
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    zone.addView(cross)
    val params = WindowManager.LayoutParams(size, size,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
      PixelFormat.TRANSLUCENT).apply {
      gravity = Gravity.TOP or Gravity.LEFT
      flags = flags or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
      setFitInsetsTypes(0)
      val area = safeBounds()
      x = area.clampX((screenBounds().width() - size) / 2, size)
      y = (area.bottom - size).coerceAtLeast(area.top)
    }
    closeView = zone
    closeHot = false
    try { windows.addView(zone, params) } catch (e: Exception) {
      VoxLog.e("add close zone failed", e); closeView = null
    }
  }

  private fun updateCloseHot() {
    val zone = closeView ?: return
    val root = bubble ?: return
    val params = bubbleParams ?: return
    val zonePos = IntArray(2).also { zone.getLocationOnScreen(it) }
    val zoneCx = zonePos[0] + zone.width / 2
    val zoneCy = zonePos[1] + zone.height / 2
    val screen = screenBounds()
    val rootCx = screen.left + params.x + params.width / 2
    val rootCy = screen.top + params.y + params.height / 2
    val hit = VoxConstants.CLOSE_SIZE_DP.dp
    val hot = kotlin.math.abs(zoneCx - rootCx) < hit && kotlin.math.abs(zoneCy - rootCy) < hit
    if (hot != closeHot) {
      closeHot = hot
      (zone.background as? GradientDrawable)?.setColor(
        if (hot) VoxConstants.CLOSE_HOT_COLOR else VoxConstants.CLOSE_COLOR)
      zone.animate().cancel()
      val scale = if (hot) 1.08f else 1f
      if (ValueAnimator.areAnimatorsEnabled()) zone.animate().scaleX(scale).scaleY(scale).setDuration(120L).start()
      else { zone.scaleX = 1f; zone.scaleY = 1f }
      if (hot) root.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
    }
  }

  private fun hideCloseZone() {
    closeView?.let { try { windows.removeView(it) } catch (e: Exception) { VoxLog.w("remove close zone failed", e) } }
    closeView = null; closeHot = false
  }

  private fun finishDrag(allowDismiss: Boolean, velocityX: Float = 0f, velocityY: Float = 0f) {
    val droppedOnClose = allowDismiss && closeHot
    hideCloseZone()
    if (droppedOnClose) {
      // Dismiss this keyboard session, preserving the user's enabled preference.
      dismissedForKeyboard = true
      cancelRecording()
      hideBubble("dismissed")
      try { VoxTypeNativeModule.changed() } catch (e: Exception) { VoxLog.w("notify change failed", e) }
      return
    }
    val params = bubbleParams ?: return
    val area = safeBounds()
    dockRight = area.releaseRight(params.x, params.width, velocityX, velocityY,
      maxOf(500.dp.toFloat(), ViewConfiguration.get(this).scaledMinimumFlingVelocity.toFloat()))
    verticalPosition = area.fractionAt(params.y, params.height)
    if (allowDismiss) bubble?.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
    placeBubble(if (expanded()) VoxConstants.BUBBLE_LISTEN_WIDTH_DP.dp else VoxConstants.BUBBLE_SIZE_DP.dp)
    try { bubblePrefs().edit().putBoolean("dockRight", dockRight).putFloat("screenVerticalPosition", verticalPosition)
      .remove("verticalPosition").remove("bx").remove("by").apply() } catch (e: Exception) {
      VoxLog.w("bubble position save failed", e)
    }
  }

  private fun removeBubble() {
    dragVelocity?.recycle(); dragVelocity = null
    placementAnimator?.cancel(); placementAnimator = null
    lastSafeBounds = null
    bubble?.animate()?.cancel()
    stopMotion()
    hideCloseZone()
    bubble?.let { try { windows.removeView(it) } catch (e: Exception) { VoxLog.w("remove bubble failed", e) } }
    lastBubbleRender = null
    bubble = null; bubbleParams = null
    bubbleMark = null; bubbleGlyph = null; actionsRow = null
    cancelBtn = null; doneBtn = null; waveform = null; spinner = null
    dragging = false
  }

  private fun setStatus(value: DictationStatus) = setStatusBridge(value.bridge)

  private fun setStatusBridge(value: String) {
    status = value
    refreshBubble()
    try { VoxTypeNativeModule.changed() } catch (e: Exception) { VoxLog.w("notify change failed", e) }
  }

  private fun startRecording() {
    if (InAppRecorder.busy || status !in listOf(DictationStatus.IDLE.bridge, DictationStatus.SAVED.bridge, DictationStatus.ERROR.bridge)) return
    val node = safeFocus() ?: return
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      node.recycle()
      setStatus(DictationStatus.MICROPHONE_PERMISSION_NEEDED)
      main.postDelayed({ if (status == DictationStatus.MICROPHONE_PERMISSION_NEEDED.bridge) setStatus(DictationStatus.IDLE) }, VoxConstants.MIC_PERMISSION_RESET_MS)
      return
    }
    val network = getSystemService(ConnectivityManager::class.java)
    val canConnect = runCatching {
      network?.activeNetwork?.let { network.getNetworkCapabilities(it) }
        ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }.getOrDefault(false)
    if (!canConnect) {
      node.recycle()
      connectionFailed()
      return
    }
    bubbleError = ""; connectionError = false
    retainTarget(node)
    recordingUserId = session.userId
    if (recordingUserId == null) {
      releaseTarget()
      return
    }
    val recordingApiUrl = session.apiUrl ?: run { recordingUserId = null; releaseTarget(); return }
    LocalDiagnostics.record(this, LocalDiagnostics.Event.recording_started)
    val stream = speechStream()
    val generation = ++lifecycleGeneration
    try {
      stream.begin()
      showMicrophoneNotification()
      audioLevel = 0f
      capture = AudioCapture(this, { bytes ->
        audioLevel = BubbleAudioLevel.fromPcm(bytes)
        stream.audio(bytes)
      }, { file, duration ->
        main.post {
          if (generation != lifecycleGeneration) {
            try { file?.delete() } catch (e: Exception) { VoxLog.w("discarded audio delete failed", e) }
            return@post
          }
          capture = null
          audioLevel = 0f
          if (discardNext || recordingUserId == null) {
            discardNext = false
            try { file?.delete() } catch (e: Exception) { VoxLog.w("discarded audio delete failed", e) }
            recordingUserId = null
            releaseMicrophoneForeground()
            releaseTarget()
            setStatus(DictationStatus.IDLE)
            return@post
          }
          recordingFile = file
          recordingDuration = duration
          releaseMicrophoneForeground()
          setStatus(DictationStatus.PROCESSING)
          try { stream.finalize { if (generation == lifecycleGeneration) finishDictation(it, recordingApiUrl) } }
          catch (error: Exception) {
            VoxLog.e("speech finalization failed", error)
            BubbleHealth.record(this, "finalization_error:${error.javaClass.simpleName}")
            connectionFailed()
          }
        }
      }, {
        main.post {
          android.widget.Toast.makeText(this, "Microphone is in use by another app", android.widget.Toast.LENGTH_SHORT).show()
          cancelRecording()
        }
      }).also { it.start() }
      setStatus(DictationStatus.LISTENING)
    } catch (e: Exception) {
      VoxLog.e("start capture failed", e)
      failRecording("Couldn’t start recording. Try again.")
    }
  }

  fun stopRecording() {
    if (status != DictationStatus.LISTENING.bridge) return
    setStatus(DictationStatus.PROCESSING)
    try { capture?.stop() } catch (e: Exception) { VoxLog.w("capture stop failed", e) }
    capture = null
  }

  fun refreshVocabulary() {
    if (status == DictationStatus.LISTENING.bridge || status == DictationStatus.PROCESSING.bridge) return
    engine?.close()
    engine = null
  }

  private fun speechStream(): DeepgramSession {
    engine?.let { return it }
    lateinit var stream: DeepgramSession
    stream = DeepgramSession({ session.token }, { session.apiUrl }, {
      val generation = lifecycleGeneration
      main.post {
        if (engine === stream && generation == lifecycleGeneration &&
          status in listOf("listening", "processing", "connecting")) connectionFailed()
      }
    }, vocabulary = { VoxTypeStore(this).use { it.vocabulary } })
    engine = stream
    return stream
  }

  /** Cancel remains available during capture, finalization and cleanup. */
  private fun cancelRecording() {
    LocalDiagnostics.record(this, LocalDiagnostics.Event.cancelled)
    if (status !in listOf(DictationStatus.LISTENING.bridge, DictationStatus.PROCESSING.bridge, DictationStatus.CONNECTING.bridge)) return
    recoverRecording()
  }

  private fun showMicrophoneNotification() {
    try {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(NotificationChannel(VoxConstants.CHANNEL_ID, VoxConstants.CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW))
      val notification = Notification.Builder(this, VoxConstants.CHANNEL_ID)
        .setSmallIcon(R.drawable.voxtype_notification)
        .setContentTitle("${applicationInfo.loadLabel(packageManager)} is listening")
        .setContentText("Tap the bubble to stop and insert text")
        .setOngoing(true).build()
      if (Build.VERSION.SDK_INT >= 29) startForeground(VoxConstants.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      else startForeground(VoxConstants.NOTIFICATION_ID, notification)
      foregroundMode = ForegroundMode.MICROPHONE
      foregroundError = null
      BubbleHealth.record(this, "foreground:microphone")
    } catch (e: Exception) {
      VoxLog.e("foreground notification failed", e)
      throw e
    }
  }

  private fun releaseMicrophoneForeground() {
    // stopForeground clears the microphone type before returning to idle specialUse.
    try { stopForeground(STOP_FOREGROUND_REMOVE) }
    catch (error: Exception) { VoxLog.w("release microphone foreground failed", error) }
    foregroundMode = ForegroundMode.NONE
    updateBubbleForeground()
  }

  private fun updateBubbleForeground() {
    // Keep the system-bound accessibility process important between dictations too.
    // Never start microphone capture merely to keep the bubble alive.
    if (foregroundMode == ForegroundMode.MICROPHONE) return
    val enabled = connected && store.bubbleEnabled && session.userId != null
    if (!enabled) {
      if (foregroundMode != ForegroundMode.NONE) stopForeground(STOP_FOREGROUND_REMOVE)
      foregroundMode = ForegroundMode.NONE
      foregroundError = null
      return
    }
    if (foregroundMode == ForegroundMode.BUBBLE) return
    try {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(NotificationChannel(
        VoxConstants.BUBBLE_CHANNEL_ID, VoxConstants.BUBBLE_CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW))
      val builder = Notification.Builder(this, VoxConstants.BUBBLE_CHANNEL_ID)
        .setSmallIcon(R.drawable.voxtype_notification)
        .setContentTitle("${applicationInfo.loadLabel(packageManager)} voice bubble is ready")
        .setContentText("Open a text field to dictate. Pause here before payments.")
        .setOnlyAlertOnce(true)
        .setOngoing(true)
        .addAction(Notification.Action.Builder(null, "Pause for payments",
          PendingIntent.getBroadcast(this, 0,
            android.content.Intent(this, PauseBubbleReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)).build())
      packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
        builder.setContentIntent(PendingIntent.getActivity(this, 0, intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      }
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(VoxConstants.NOTIFICATION_ID, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        // API 33 predates specialUse; explicitly avoid the manifest's microphone type.
        startForeground(VoxConstants.NOTIFICATION_ID, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_NONE)
      }
      foregroundMode = ForegroundMode.BUBBLE
      foregroundError = null
      BubbleHealth.record(this, "foreground:bubble")
      VoxTypeNativeModule.changed()
    } catch (error: Exception) {
      // OEM background restrictions must not crash and disconnect accessibility.
      VoxLog.w("bubble foreground notification unavailable", error)
      val reason = error.javaClass.simpleName
      if (foregroundError != reason) {
        foregroundError = reason
        BubbleHealth.record(this, "foreground_error:$reason")
        VoxTypeNativeModule.changed()
      }
    }
  }

  private fun recoverRecording() = resetRecording(DictationStatus.IDLE)

  private fun connectionFailed() = failRecording("Connection unavailable. Check your internet and try again.", true)

  private fun failRecording(message: String, network: Boolean = false) {
    LocalDiagnostics.record(this, LocalDiagnostics.Event.transcription_failed)
    bubbleError = message; connectionError = network
    resetRecording(DictationStatus.ERROR)
    BubbleHealth.record(this, if (network) "dictation_error:connection" else "dictation_error:recording")
    android.widget.Toast.makeText(this, message, android.widget.Toast.LENGTH_SHORT).show()
  }

  private fun resetRecording(next: DictationStatus) {
    lifecycleGeneration++
    processingJob?.cancel(); processingJob = null
    cleanupCall?.cancel(); cleanupCall = null
    recordingUserId = null
    recordingFile?.delete(); recordingFile = null
    discardNext = false
    try { capture?.stop() } catch (error: Exception) { VoxLog.w("capture recovery failed", error) }
    capture = null
    try { engine?.close() } catch (error: Exception) { VoxLog.w("speech recovery failed", error) }
    engine = null
    releaseTarget()
    releaseMicrophoneForeground()
    setStatus(next)
  }

  private fun finishDictation(original: String, apiUrl: String) {
    val userId = recordingUserId ?: return
    LocalDiagnostics.record(this, LocalDiagnostics.Event.transcription_complete)
    if (original.isBlank()) {
      failRecording("No speech detected. Try again.")
      return
    }
    val generation = lifecycleGeneration
    val audio = recordingFile
    val duration = recordingDuration
    recordingUserId = null
    processingJob = serviceScope.launch(Dispatchers.IO) {
      var saved = false
      try {
        ensureActive()
        if (generation != lifecycleGeneration) return@launch
        val cleaned = try { if (store.cleanupEnabled) cleanup(original, generation) else original }
          catch (cancelled: CancellationException) { throw cancelled }
          catch (error: Exception) { VoxLog.w("cleanup preference unavailable", error); original }
        ensureActive()
        // Serialize the final save/insert with the X event on Android's main thread.
        // A canceled take cannot slip between a background save and queued insertion.
        withContext(Dispatchers.Main) {
          if (generation != lifecycleGeneration || session.userId != userId) return@withContext
          val id = store.save(userId, cleaned, original, duration, audio, apiUrl)
          saved = true
          recordingFile = null
          val delivered = try { cleaned.isNotBlank() && insertIntoTarget(cleaned) }
            catch (error: Exception) { VoxLog.w("target insertion failed", error); false }
          LocalDiagnostics.record(this@VoxTypeAccessibilityService, if (delivered) LocalDiagnostics.Event.delivery_sent else LocalDiagnostics.Event.delivery_recovery)
          if (delivered) {
            try { store.setDelivery(id, "pasted") } catch (e: Exception) { VoxLog.w("setDelivery failed", e) }
          }
          lastSavedId = id; lastDelivered = delivered; lastCopied = false
          setStatus(DictationStatus.SAVED)
          val delay = if (delivered) VoxConstants.SAVED_AUTO_DISMISS_DELIVERED_MS else VoxConstants.SAVED_AUTO_DISMISS_MS
          main.postDelayed({ if (generation == lifecycleGeneration && status == DictationStatus.SAVED.bridge) setStatus(DictationStatus.IDLE) }, delay)
        }
        if (saved && generation == lifecycleGeneration && cleaned.isNotBlank()) TranscriptUploads.sendPending(applicationContext)
      } catch (cancelled: CancellationException) { throw cancelled }
      catch (e: Exception) {
        LocalDiagnostics.record(this@VoxTypeAccessibilityService, LocalDiagnostics.Event.save_failed)
        VoxLog.e("dictation save failed", e)
        BubbleHealth.record(this@VoxTypeAccessibilityService, "save_error:${e.javaClass.simpleName}")
        withContext(Dispatchers.Main) {
          if (generation == lifecycleGeneration) {
            failRecording("Couldn’t save this recording. Try again.")
          }
        }
      } finally {
        if (!saved) audio?.delete()
      }
    }
  }

  private fun cleanup(original: String, generation: Int): String {
    val bearer = session.token ?: return original
    val url = session.apiUrl ?: return original
    if (original.isBlank()) return original
    return try {
      val body = JSONObject().put("text", original).toString().toRequestBody("application/json".toMediaType())
      val call = HttpClients.cleanup.newCall(Request.Builder().url("$url${VoxConstants.CLEANUP_PATH}")
        .header("Authorization", "Bearer $bearer").post(body).build())
      cleanupCall = call
      if (generation != lifecycleGeneration) { call.cancel(); return original }
      try { call.execute().use { response ->
        if (!response.isSuccessful) {
          LocalDiagnostics.record(this, LocalDiagnostics.Event.cleanup_fallback)
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
      } } finally { if (cleanupCall === call) cleanupCall = null }
    } catch (e: Exception) {
      LocalDiagnostics.record(this, LocalDiagnostics.Event.cleanup_fallback)
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
      return InsertionHelper.insert(this, current, inputMethod?.currentInputConnection, text)
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
    foregroundMode = ForegroundMode.NONE
    removeBubble()
    setStatus(DictationStatus.IDLE)
  }
}
