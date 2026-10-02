package com.voxtype.nativebridge

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.InputMethod
import android.animation.ObjectAnimator
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
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
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
  private var bubble: FrameLayout? = null
  private var bubbleMark: ImageView? = null
  private var bubbleGlyph: TextView? = null
  private var actionsRow: LinearLayout? = null
  private var cancelBtn: TextView? = null
  private var doneBtn: TextView? = null
  private var barViews: List<View> = emptyList()
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var closeView: FrameLayout? = null
  private var closeHot = false
  private var downRawX = 0f
  private var downRawY = 0f
  private var dragStartX = 0
  private var dragStartY = 0
  private var dragging = false
  private var motionAnims = mutableListOf<android.animation.Animator>()
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
    super.onServiceConnected(); refreshBubble()
    store.pruneAudio()
  }
  override fun onCreateInputMethod(): InputMethod = InputMethod(this)

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // Window changes and a dismissed keyboard can leave an old editor node behind.
    // Revalidate every event, including while connecting/processing.
    if (status == DictationStatus.LISTENING.bridge) {
      val current = safeFocus()
      val same = isSameAsTarget(current)
      current?.recycle()
      if (!same) { stopRecording(); removeBubble(); return }
    }
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
    if (getWindows().none { it.type == android.view.accessibility.AccessibilityWindowInfo.TYPE_INPUT_METHOD }) return null
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
    if (session.token == null || InAppRecorder.busy || !store.bubbleEnabled || ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED || !hasValidFocus()) { removeBubble(); return }
    if (bubble == null) createBubble()
    if (bubble == null) return
    updateBubbleContent()
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

  /**
   * Compact chat-head: a small muted square at rest that only shows color when
   * active. While listening it expands to [cancel | level bars | done], mirroring
   * the desktop overlay. The whole head is draggable; dropping it on the close
   * zone turns the bubble off.
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
      setImageResource(R.drawable.voxtype_logo)
      alpha = 1f
      layoutParams = FrameLayout.LayoutParams(
        VoxConstants.BUBBLE_ICON_DP.dp, VoxConstants.BUBBLE_ICON_DP.dp, Gravity.CENTER)
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    val glyph = TextView(this).apply {
      setTextColor(Color.WHITE)
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
      text = "✕"; setTextColor(Color.WHITE); textSize = 18f; gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        setColor(VoxConstants.BUBBLE_ACTION_COLOR)
        cornerRadius = VoxConstants.BUBBLE_RADIUS_DP.dp.toFloat()
      }
      layoutParams = LinearLayout.LayoutParams(actionSize, actionSize).apply {
        marginEnd = 8.dp
      }
      contentDescription = "Cancel dictation"
      isClickable = true
      isFocusable = false
    }
    val bars = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(0, VoxConstants.BUBBLE_BAR_HEIGHT_DP.dp, 1f)
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    val built = mutableListOf<View>()
    repeat(5) {
      val bar = View(this).apply {
        setBackgroundColor(Color.WHITE)
        alpha = 0.9f
        layoutParams = LinearLayout.LayoutParams(
          VoxConstants.BUBBLE_BAR_DP.dp, VoxConstants.BUBBLE_BAR_HEIGHT_DP.dp).apply {
          marginStart = 2.dp; marginEnd = 2.dp
        }
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      }
      bars.addView(bar)
      built += bar
    }
    val done = TextView(this).apply {
      text = "✓"; setTextColor(VoxConstants.BUBBLE_DONE_ICON); textSize = 20f; gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        setColor(VoxConstants.BUBBLE_DONE_COLOR)
        cornerRadius = VoxConstants.BUBBLE_RADIUS_DP.dp.toFloat()
      }
      layoutParams = LinearLayout.LayoutParams(actionSize, actionSize).apply {
        marginStart = 8.dp
      }
      contentDescription = "Finish and insert dictation"
      isClickable = true
      isFocusable = false
    }
    row.addView(cancel); row.addView(bars); row.addView(done)
    row.setPadding(8.dp, 0, 8.dp, 0)
    root.addView(mark); root.addView(glyph); root.addView(row)
    barViews = built
    bubbleMark = mark; bubbleGlyph = glyph; actionsRow = row
    cancelBtn = cancel; doneBtn = done

    val touch = View.OnTouchListener { _, event -> onBubbleTouch(event) }
    root.setOnTouchListener(touch)
    cancel.setOnTouchListener(touch)
    done.setOnTouchListener(touch)
    root.setOnClickListener { onBubbleTap() }
    cancel.setOnClickListener { cancelRecording() }
    done.setOnClickListener { stopRecording() }

    val bounds = screenBounds()
    val prefs = bubblePrefs()
    val params = WindowManager.LayoutParams(size, size,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT).apply {
      gravity = Gravity.TOP or Gravity.START
      if (prefs.contains("bx") && prefs.contains("by")) {
        x = prefs.getInt("bx", bounds.width() - size - VoxConstants.BUBBLE_EDGE_DP.dp)
        y = prefs.getInt("by", bounds.height() / 2)
      } else {
        x = bounds.width() - size - VoxConstants.BUBBLE_EDGE_DP.dp
        y = bounds.height() / 2 - size / 2
      }
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
    when (status) {
      DictationStatus.LISTENING.bridge -> {
        bg?.setColor(VoxConstants.BUBBLE_ACTIVE_COLOR)
        bubbleMark?.visibility = View.GONE
        bubbleGlyph?.visibility = View.GONE
        actionsRow?.visibility = View.VISIBLE
        barViews.forEach { it.scaleY = 0.65f }
        animateBubbleWidth(VoxConstants.BUBBLE_LISTEN_WIDTH_DP.dp)
      }
      DictationStatus.CONNECTING.bridge, DictationStatus.PROCESSING.bridge -> {
        bg?.setColor(VoxConstants.BUBBLE_MUTED_COLOR)
        bubbleMark?.visibility = View.GONE
        actionsRow?.visibility = View.GONE
        bubbleGlyph?.visibility = View.VISIBLE
        bubbleGlyph?.text = "◌"
        startSpin()
        animateBubbleWidth(VoxConstants.BUBBLE_SIZE_DP.dp)
      }
      DictationStatus.SAVED.bridge -> {
        bg?.setColor(VoxConstants.BUBBLE_SAVED_COLOR)
        bubbleMark?.visibility = View.GONE
        actionsRow?.visibility = View.GONE
        bubbleGlyph?.visibility = View.VISIBLE
        bubbleGlyph?.text = "✓"
        animateBubbleWidth(VoxConstants.BUBBLE_SIZE_DP.dp)
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
    DictationStatus.LISTENING.bridge -> "Dictating. Tap check to finish, cross to cancel, or drag the bubble to move it."
    DictationStatus.PROCESSING.bridge, DictationStatus.CONNECTING.bridge -> "VoxType $status"
    DictationStatus.MICROPHONE_PERMISSION_NEEDED.bridge -> "VoxType needs microphone access"
    DictationStatus.SAVED.bridge -> if (lastDelivered) "VoxType text inserted" else "Copy saved VoxType transcript"
    else -> "Start VoxType dictation. Drag to move, drop on the close mark to hide."
  }

  private fun animateBubbleWidth(target: Int) {
    val params = bubbleParams ?: return
    val root = bubble ?: return
    params.x = params.x.coerceIn(0, (screenBounds().width() - target).coerceAtLeast(0))
    if (params.width == target) return
    if (!ValueAnimator.areAnimatorsEnabled()) {
      params.width = target
      try { windows.updateViewLayout(root, params) } catch (e: Exception) { VoxLog.w("bubble resize failed", e) }
      return
    }
    val anim = ValueAnimator.ofInt(params.width, target).apply {
      duration = VoxConstants.BUBBLE_WIDTH_ANIM_MS
      interpolator = DecelerateInterpolator()
      addUpdateListener { value ->
        params.width = value.animatedValue as Int
        try { windows.updateViewLayout(root, params) } catch (e: Exception) { VoxLog.w("bubble resize failed", e) }
      }
    }
    motionAnims += anim
    anim.start()
  }

  private fun startSpin() {
    val glyph = bubbleGlyph ?: return
    if (!ValueAnimator.areAnimatorsEnabled()) return
    val anim = ObjectAnimator.ofFloat(glyph, "rotation", 0f, 360f).apply {
      duration = 1100L
      repeatCount = ObjectAnimator.INFINITE
      interpolator = android.view.animation.LinearInterpolator()
    }
    motionAnims += anim
    anim.start()
  }

  private fun stopMotion() {
    motionAnims.forEach { try { it.cancel() } catch (e: Exception) { VoxLog.w("motion cancel failed", e) } }
    motionAnims.clear()
    barViews.forEach { it.scaleY = 1f }
    bubbleGlyph?.rotation = 0f
  }

  private fun onBubbleTouch(event: MotionEvent): Boolean {
    val params = bubbleParams ?: return false
    val root = bubble ?: return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downRawX = event.rawX; downRawY = event.rawY
        dragStartX = params.x; dragStartY = params.y
        dragging = false
        return false
      }
      MotionEvent.ACTION_MOVE -> {
        val slop = VoxConstants.DRAG_SLOP_DP.dp
        if (!dragging &&
          (kotlin.math.abs(event.rawX - downRawX) > slop ||
            kotlin.math.abs(event.rawY - downRawY) > slop)) {
          dragging = true
          showCloseZone()
        }
        if (dragging) {
          val bounds = screenBounds()
          params.x = (dragStartX + (event.rawX - downRawX)).toInt()
            .coerceIn(0, (bounds.width() - root.width).coerceAtLeast(0))
          params.y = (dragStartY + (event.rawY - downRawY)).toInt()
            .coerceIn(0, (bounds.height() - root.height).coerceAtLeast(0))
          try { windows.updateViewLayout(root, params) } catch (e: Exception) { VoxLog.w("bubble drag failed", e) }
          updateCloseHot()
          return true
        }
        return false
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (dragging) {
          dragging = false
          finishDrag()
          return true
        }
        return false
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
      text = "✕"; setTextColor(Color.WHITE); textSize = 24f; gravity = Gravity.CENTER
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
      gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      y = VoxConstants.CLOSE_BOTTOM_MARGIN_DP.dp
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
    val zonePos = IntArray(2).also { zone.getLocationOnScreen(it) }
    val rootPos = IntArray(2).also { root.getLocationOnScreen(it) }
    val zoneCx = zonePos[0] + zone.width / 2
    val zoneCy = zonePos[1] + zone.height / 2
    val rootCx = rootPos[0] + root.width / 2
    val rootCy = rootPos[1] + root.height / 2
    val hit = VoxConstants.CLOSE_SIZE_DP.dp
    val hot = kotlin.math.abs(zoneCx - rootCx) < hit && kotlin.math.abs(zoneCy - rootCy) < hit
    if (hot != closeHot) {
      closeHot = hot
      (zone.background as? GradientDrawable)?.setColor(
        if (hot) VoxConstants.CLOSE_HOT_COLOR else VoxConstants.CLOSE_COLOR)
      zone.scaleX = if (hot) 1.12f else 1f
      zone.scaleY = if (hot) 1.12f else 1f
    }
  }

  private fun hideCloseZone() {
    closeView?.let { try { windows.removeView(it) } catch (e: Exception) { VoxLog.w("remove close zone failed", e) } }
    closeView = null; closeHot = false
  }

  private fun finishDrag() {
    val droppedOnClose = closeHot
    hideCloseZone()
    if (droppedOnClose) {
      // Dropped on the close mark: turn the bubble off entirely.
      store.bubbleEnabled = false
      removeBubble()
      try { VoxTypeNativeModule.changed() } catch (e: Exception) { VoxLog.w("notify change failed", e) }
      return
    }
    val params = bubbleParams ?: return
    try { bubblePrefs().edit().putInt("bx", params.x).putInt("by", params.y).apply() } catch (e: Exception) {
      VoxLog.w("bubble position save failed", e)
    }
  }

  private fun removeBubble() {
    stopMotion()
    hideCloseZone()
    bubble?.let { try { windows.removeView(it) } catch (e: Exception) { VoxLog.w("remove bubble failed", e) } }
    lastBubbleRender = null
    bubble = null; bubbleParams = null
    bubbleMark = null; bubbleGlyph = null; actionsRow = null
    cancelBtn = null; doneBtn = null; barViews = emptyList()
    dragging = false
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
    val stream = engine ?: DeepgramSession({ session.token }, { session.apiUrl }, {
      main.post {
        if (status == DictationStatus.LISTENING.bridge) stopRecording()
      }
    }).also { engine = it }
    val generation = lifecycleGeneration
    try {
      stream.begin()
      showMicrophoneNotification()
      capture = AudioCapture(this, { stream.audio(it) }, { file, duration ->
        main.post {
          if (generation != lifecycleGeneration) {
            try { file?.delete() } catch (e: Exception) { VoxLog.w("discarded audio delete failed", e) }
            return@post
          }
          capture = null
          if (discardNext || recordingUserId == null) {
            discardNext = false
            try { file?.delete() } catch (e: Exception) { VoxLog.w("discarded audio delete failed", e) }
            recordingUserId = null
            stopForeground(STOP_FOREGROUND_REMOVE)
            releaseTarget()
            setStatus(DictationStatus.IDLE)
            return@post
          }
          recordingFile = file
          recordingDuration = duration
          stopForeground(STOP_FOREGROUND_REMOVE)
          setStatus(DictationStatus.PROCESSING)
          stream.finalize { finishDictation(it, recordingApiUrl) }
        }
      }).also { it.start() }
      setStatus(DictationStatus.LISTENING)
    } catch (e: Exception) {
      VoxLog.e("start capture failed", e)
      capture = null
      recordingUserId = null
      stream.abort()
      releaseTarget()
      stopForeground(STOP_FOREGROUND_REMOVE)
      setStatus(DictationStatus.IDLE)
    }
  }

  fun stopRecording() {
    if (status != DictationStatus.LISTENING.bridge) return
    setStatus(DictationStatus.PROCESSING)
    try { capture?.stop() } catch (e: Exception) { VoxLog.w("capture stop failed", e) }
    capture = null
  }

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
