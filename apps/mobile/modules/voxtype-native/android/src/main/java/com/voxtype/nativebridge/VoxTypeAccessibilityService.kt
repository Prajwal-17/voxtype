package com.voxtype.nativebridge

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.InputMethod
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
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
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.DecelerateInterpolator
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
  private enum class ForegroundMode { NONE, BUBBLE, MICROPHONE }

  private val main = Handler(Looper.getMainLooper())
  private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
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
  private var dismissedForKeyboard = false
  private var foregroundMode = ForegroundMode.NONE
  private val bubbleRefresh = Runnable { if (connected) refreshBubble() }
  var connected = false; private set
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

  override fun onServiceConnected() {
    super.onServiceConnected()
    connected = true
    VoxLog.d("accessibility connected")
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
      removeBubble()
      requestBubbleRefresh()
    }
  }

  private fun requestBubbleRefresh() {
    main.removeCallbacks(bubbleRefresh)
    main.postDelayed(bubbleRefresh, VoxConstants.BUBBLE_REFRESH_DELAY_MS)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    refreshBubble()
    // A transient empty window list must not leave the overlay hidden indefinitely.
    requestBubbleRefresh()
  }
  override fun onInterrupt() { stopRecording() }
  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    refreshBubble()
    requestBubbleRefresh()
  }
  override fun onUnbind(intent: android.content.Intent?): Boolean {
    connected = false
    main.removeCallbacks(bubbleRefresh)
    VoxLog.d("accessibility unbound")
    VoxTypeNativeModule.changed()
    stopRecording()
    removeBubble()
    stopForeground(STOP_FOREGROUND_REMOVE)
    foregroundMode = ForegroundMode.NONE
    return super.onUnbind(intent)
  }
  override fun onDestroy() {
    connected = false
    VoxLog.d("accessibility destroyed")
    main.removeCallbacksAndMessages(null)
    lifecycleGeneration++; recordingUserId = null
    capture?.stop(); engine?.close(); removeBubble(); instance = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    foregroundMode = ForegroundMode.NONE
    releaseTarget()
    serviceScope.cancel()
    super.onDestroy()
  }

  private fun focus(): AccessibilityNodeInfo? {
    val root = rootInActiveWindow ?: return null
    return try { root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) } finally { root.recycle() }
  }

  private fun safeFocus(): AccessibilityNodeInfo? {
    if (!keyboardVisible()) return null
    val node = try { focus() } catch (e: Exception) { VoxLog.w("focus unavailable", e); null } ?: return null
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

  private fun keyboardVisible(): Boolean = try {
    getWindows().any { it.type == android.view.accessibility.AccessibilityWindowInfo.TYPE_INPUT_METHOD }
  } catch (e: Exception) { VoxLog.w("keyboard windows unavailable", e); false }

  private fun expanded(): Boolean = status in listOf("listening", "processing", "connecting", "saved")

  fun refreshBubble() {
    try {
      refreshBubbleState()
    } catch (error: Exception) {
      VoxLog.w("bubble refresh failed", error)
      removeBubble()
    }
  }

  private fun refreshBubbleState() {
    updateBubbleForeground()
    if (!connected) { removeBubble(); return }
    // Revalidate the target on both accessibility events and delayed editor callbacks.
    if (status == DictationStatus.LISTENING.bridge) {
      val current = safeFocus()
      val same = isSameAsTarget(current)
      current?.recycle()
      if (!same || !store.bubbleEnabled) { stopRecording(); removeBubble(); return }
    }
    if (!keyboardVisible()) dismissedForKeyboard = false
    if (dismissedForKeyboard) { removeBubble(); return }
    if (session.token == null || InAppRecorder.busy || !store.bubbleEnabled || ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED || !hasValidFocus()) { removeBubble(); return }
    if (bubble == null) {
      createBubble()
      speechStream().warm()
    }
    if (bubble == null) return
    updateBubbleContent()
    if (!dragging && safeBounds() != lastSafeBounds) placeBubble(animate = true)
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
    var bottom = bounds.height() - insets.bottom - margin
    getWindows().filter { it.type == android.view.accessibility.AccessibilityWindowInfo.TYPE_INPUT_METHOD }
      .forEach { window ->
        val keyboard = android.graphics.Rect()
        window.getBoundsInScreen(keyboard)
        if (!keyboard.isEmpty) bottom = minOf(bottom, keyboard.top - bounds.top - margin)
      }
    return BubbleGeometry(insets.left + margin, top,
      (bounds.width() - insets.right - margin).coerceAtLeast(insets.left + margin),
      bottom.coerceAtLeast(top + VoxConstants.BUBBLE_SIZE_DP.dp))
  }

  private fun updateBubbleLayout() {
    val root = bubble ?: return
    val params = bubbleParams ?: return
    try { windows.updateViewLayout(root, params) }
    catch (e: Exception) { VoxLog.w("bubble layout failed", e) }
  }

  private fun placeBubble(width: Int? = null, animate: Boolean = true) {
    val params = bubbleParams ?: return
    placementAnimator?.cancel()
    val area = safeBounds()
    lastSafeBounds = area
    val desiredWidth = width ?: if (expanded()) VoxConstants.BUBBLE_LISTEN_WIDTH_DP.dp else VoxConstants.BUBBLE_SIZE_DP.dp
    val targetWidth = desiredWidth.coerceAtMost((area.right - area.left).coerceAtLeast(1))
    val x = area.dockX(dockRight, targetWidth)
    val y = area.yAt(verticalPosition, params.height)
    if (!animate || !ValueAnimator.areAnimatorsEnabled()) {
      params.x = x; params.y = y; params.width = targetWidth
      updateBubbleLayout()
      return
    }
    val startX = params.x; val startY = params.y; val startWidth = params.width
    if (startX == x && startY == y && startWidth == targetWidth) return
    placementAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = if (startWidth != targetWidth) VoxConstants.BUBBLE_WIDTH_ANIM_MS else VoxConstants.BUBBLE_SNAP_ANIM_MS
      interpolator = DecelerateInterpolator(2f)
      addUpdateListener {
        val fraction = it.animatedValue as Float
        params.x = (startX + (x - startX) * fraction).toInt()
        params.y = (startY + (y - startY) * fraction).toInt()
        params.width = (startWidth + (targetWidth - startWidth) * fraction).toInt()
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
   * history between cancel and stop. Drag release docks to the nearest edge.
   */
  private fun createBubble() {
    val size = VoxConstants.BUBBLE_SIZE_DP.dp
    val root = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        setColor(VoxConstants.BUBBLE_MUTED_COLOR)
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
      setColorFilter(VoxTheme.accentInk)
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
      text = "✕"; setTextColor(VoxTheme.ink); textSize = 18f; gravity = Gravity.CENTER
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
    row.addView(cancel); row.addView(bars); row.addView(done)
    row.setPadding(4.dp, 0, 4.dp, 0)
    // Inset rounded controls retain their full 44dp touch targets.
    cancel.background = InsetDrawable(cancel.background, 7.dp)
    done.background = InsetDrawable(done.background, 7.dp)
    val loader = ProgressBar(this, null, android.R.attr.progressBarStyleSmall).apply {
      isIndeterminate = true
      indeterminateTintList = ColorStateList.valueOf(VoxTheme.accentInk)
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
    verticalPosition = if (prefs.contains("verticalPosition")) prefs.getFloat("verticalPosition", 1f).coerceIn(0f, 1f)
      else if (prefs.contains("by")) area.fractionAt(prefs.getInt("by", area.bottom), size) else 1f
    lastSafeBounds = area
    val params = WindowManager.LayoutParams(size, size,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT).apply {
      gravity = Gravity.TOP or Gravity.LEFT
      flags = flags or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
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
    }
  }

  private var lastBubbleRender: String? = null

  private fun updateBubbleContent() {
    val root = bubble ?: return
    // Accessibility events fire constantly; never restart running animations.
    val renderKey = "$status|$lastDelivered|$lastCopied"
    if (renderKey == lastBubbleRender) return
    lastBubbleRender = renderKey
    val bg = root.background as? GradientDrawable
    stopMotion()
    spinner?.visibility = View.GONE
    when (status) {
      DictationStatus.LISTENING.bridge -> {
        bg?.setColor(VoxConstants.BUBBLE_ACTIVE_COLOR)
        bubbleMark?.visibility = View.GONE
        bubbleGlyph?.visibility = View.GONE
        actionsRow?.visibility = View.VISIBLE
        waveform?.setListening(true)
        animateBubbleWidth(VoxConstants.BUBBLE_LISTEN_WIDTH_DP.dp)
      }
      DictationStatus.CONNECTING.bridge, DictationStatus.PROCESSING.bridge -> {
        bg?.setColor(VoxConstants.BUBBLE_MUTED_COLOR)
        bubbleMark?.visibility = View.GONE
        actionsRow?.visibility = View.GONE
        bubbleGlyph?.visibility = View.GONE
        spinner?.visibility = View.VISIBLE
        animateBubbleWidth(VoxConstants.BUBBLE_LISTEN_WIDTH_DP.dp)
      }
      DictationStatus.SAVED.bridge -> {
        bg?.setColor(VoxConstants.BUBBLE_SAVED_COLOR)
        bubbleMark?.visibility = View.GONE
        actionsRow?.visibility = View.GONE
        bubbleGlyph?.visibility = View.VISIBLE
        bubbleGlyph?.text = "✓"
        animateBubbleWidth(VoxConstants.BUBBLE_LISTEN_WIDTH_DP.dp)
      }
      DictationStatus.MICROPHONE_PERMISSION_NEEDED.bridge -> {
        bg?.setColor(VoxConstants.CLOSE_COLOR)
        bubbleMark?.visibility = View.GONE
        actionsRow?.visibility = View.GONE
        bubbleGlyph?.visibility = View.VISIBLE
        bubbleGlyph?.text = "!"
        animateBubbleWidth(VoxConstants.BUBBLE_SIZE_DP.dp)
      }
      else -> {
        bg?.setColor(VoxConstants.BUBBLE_MUTED_COLOR)
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
    DictationStatus.PROCESSING.bridge, DictationStatus.CONNECTING.bridge -> "VoxType $status"
    DictationStatus.MICROPHONE_PERMISSION_NEEDED.bridge -> "VoxType needs microphone access"
    DictationStatus.SAVED.bridge -> if (lastDelivered) "VoxType text inserted" else "Copy saved VoxType transcript"
    else -> "Start VoxType dictation. Drag to either edge, or drop on the close mark to hide."
  }

  private fun animateBubbleWidth(target: Int) {
    if (!dragging) placeBubble(target, animate = false)
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
        // Finish a width transition before drag math; interrupt an edge snap in place.
        if (params.width != VoxConstants.BUBBLE_SIZE_DP.dp && params.width != VoxConstants.BUBBLE_LISTEN_WIDTH_DP.dp) placementAnimator?.end()
        placementAnimator?.cancel(); placementAnimator = null
        downRawX = event.rawX; downRawY = event.rawY
        dragStartX = params.x; dragStartY = params.y
        dragging = false
        pressFeedback(view, true)
        return true
      }
      MotionEvent.ACTION_MOVE -> {
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
        pressFeedback(view, false)
        root.elevation = VoxConstants.BUBBLE_ELEVATION_DP.dp.toFloat()
        if (dragging) {
          dragging = false
          finishDrag(allowDismiss = true)
        } else {
          view.performClick()
          // A tap can interrupt docking without changing status (e.g. processing).
          if (placementAnimator == null) placeBubble()
        }
        return true
      }
      MotionEvent.ACTION_CANCEL -> {
        pressFeedback(view, false)
        root.elevation = VoxConstants.BUBBLE_ELEVATION_DP.dp.toFloat()
        if (dragging) { dragging = false; finishDrag(allowDismiss = false) }
        else placeBubble()
        return true
      }
    }
    return false
  }

  private fun onBubbleTap() {
    if (status == DictationStatus.LISTENING.bridge) stopRecording()
    else if (status == DictationStatus.SAVED.bridge && !lastDelivered) {
      lastSavedId?.let { store.copyToClipboard(it) }
      lastCopied = true; refreshBubble()
    } else if (status == DictationStatus.IDLE.bridge || status == DictationStatus.SAVED.bridge) startRecording()
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
      text = "✕"; setTextColor(VoxTheme.danger); textSize = 24f; gravity = Gravity.CENTER
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
      x = (area.left + area.right - size) / 2
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

  private fun finishDrag(allowDismiss: Boolean) {
    val droppedOnClose = allowDismiss && closeHot
    hideCloseZone()
    if (droppedOnClose) {
      // Dismiss this keyboard session, preserving the user's enabled preference.
      dismissedForKeyboard = true
      if (status == DictationStatus.LISTENING.bridge) stopRecording()
      removeBubble()
      try { VoxTypeNativeModule.changed() } catch (e: Exception) { VoxLog.w("notify change failed", e) }
      return
    }
    val params = bubbleParams ?: return
    val area = safeBounds()
    dockRight = area.nearestRight(params.x, params.width)
    verticalPosition = area.fractionAt(params.y, params.height)
    if (allowDismiss) bubble?.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
    placeBubble(if (expanded()) VoxConstants.BUBBLE_LISTEN_WIDTH_DP.dp else VoxConstants.BUBBLE_SIZE_DP.dp)
    try { bubblePrefs().edit().putBoolean("dockRight", dockRight).putFloat("verticalPosition", verticalPosition).remove("bx").remove("by").apply() } catch (e: Exception) {
      VoxLog.w("bubble position save failed", e)
    }
  }

  private fun removeBubble() {
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
    if (InAppRecorder.busy || (status != DictationStatus.IDLE.bridge && status != DictationStatus.SAVED.bridge)) return
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
    val recordingApiUrl = session.apiUrl ?: run { recordingUserId = null; releaseTarget(); return }
    val stream = speechStream()
    val generation = lifecycleGeneration
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
          stream.finalize { finishDictation(it, recordingApiUrl) }
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
      capture = null
      recordingUserId = null
      stream.abort()
      releaseTarget()
      releaseMicrophoneForeground()
      setStatus(DictationStatus.IDLE)
    }
  }

  fun stopRecording() {
    if (status != DictationStatus.LISTENING.bridge) return
    setStatus(DictationStatus.PROCESSING)
    try { capture?.stop() } catch (e: Exception) { VoxLog.w("capture stop failed", e) }
    capture = null
  }

  private fun speechStream(): DeepgramSession = engine ?: DeepgramSession({ session.token }, { session.apiUrl }, {
    main.post { if (status == DictationStatus.LISTENING.bridge) stopRecording() }
  }).also { engine = it }

  /** ✕ while listening: drop the take entirely, no transcript, no insert. */
  private fun cancelRecording() {
    if (status != DictationStatus.LISTENING.bridge) return
    discardNext = true
    engine?.abort()
    setStatus(DictationStatus.PROCESSING)
    try { capture?.stop() } catch (e: Exception) { VoxLog.w("capture stop failed", e) }
    capture = null
  }

  private fun showMicrophoneNotification() {
    try {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(NotificationChannel(VoxConstants.CHANNEL_ID, VoxConstants.CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW))
      val notification = Notification.Builder(this, VoxConstants.CHANNEL_ID)
        .setSmallIcon(R.drawable.voxtype_notification)
        .setContentTitle("VoxType is listening")
        .setContentText("Tap the bubble to stop and insert text")
        .setOngoing(true).build()
      if (Build.VERSION.SDK_INT >= 29) startForeground(VoxConstants.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      else startForeground(VoxConstants.NOTIFICATION_ID, notification)
      foregroundMode = ForegroundMode.MICROPHONE
    } catch (e: Exception) {
      VoxLog.e("foreground notification failed", e)
      throw e
    }
  }

  private fun releaseMicrophoneForeground() {
    // stopForeground clears the microphone type before returning to idle specialUse.
    stopForeground(STOP_FOREGROUND_REMOVE)
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
      return
    }
    if (foregroundMode == ForegroundMode.BUBBLE) return
    try {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(NotificationChannel(
        VoxConstants.BUBBLE_CHANNEL_ID, VoxConstants.BUBBLE_CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW))
      val builder = Notification.Builder(this, VoxConstants.BUBBLE_CHANNEL_ID)
        .setSmallIcon(R.drawable.voxtype_notification)
        .setContentTitle("VoxType voice bubble is ready")
        .setContentText("Open a text field to dictate. Manage the bubble in VoxType.")
        .setOnlyAlertOnce(true)
        .setOngoing(true)
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
    } catch (error: Exception) {
      // OEM background restrictions must not crash and disconnect accessibility.
      VoxLog.w("bubble foreground notification unavailable", error)
    }
  }

  private fun finishDictation(original: String, apiUrl: String) {
    val userId = recordingUserId ?: return
    val generation = lifecycleGeneration
    val audio = recordingFile
    val duration = recordingDuration
    recordingFile = null; recordingUserId = null
    serviceScope.launch(Dispatchers.IO) {
      val cleaned = if (store.cleanupEnabled) cleanup(original) else original
      val id = try {
        store.save(userId, cleaned, original, duration, audio, apiUrl)
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
      if (cleaned.isNotBlank()) TranscriptUploads.sendPending(applicationContext)
    }
  }

  private fun cleanup(original: String): String {
    val bearer = session.token ?: return original
    val url = session.apiUrl ?: return original
    if (original.isBlank()) return original
    return try {
      val body = JSONObject().put("text", original).toString().toRequestBody("application/json".toMediaType())
      HttpClients.cleanup.newCall(Request.Builder().url("$url${VoxConstants.CLEANUP_PATH}")
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
    foregroundMode = ForegroundMode.NONE
    removeBubble()
    setStatus(DictationStatus.IDLE)
  }
}
