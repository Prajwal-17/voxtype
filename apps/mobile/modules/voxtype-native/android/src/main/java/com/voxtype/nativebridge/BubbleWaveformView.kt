package com.voxtype.nativebridge

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.os.SystemClock
import android.view.View
import kotlin.math.sin

/** Rolling microphone history, rendered in one lightweight native view. */
class BubbleWaveformView(context: Context, private val level: () -> Float) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = VoxTheme.accentInk }
  private val samples = FloatArray(17)
  private val display = FloatArray(17)
  private var listening = false
  private var sampledAt = 0L
  private var frameAt = 0L
  private val frame = object : Runnable {
    override fun run() {
      if (!listening || !isAttachedToWindow) return
      val now = SystemClock.uptimeMillis()
      val current = level().coerceIn(0f, 1f)
      val animated = ValueAnimator.areAnimatorsEnabled()
      if (now - sampledAt >= 65L) {
        samples.copyInto(samples, 0, 1)
        samples[samples.lastIndex] = current
        sampledAt = now
      }
      val blend = ((now - frameAt).coerceAtMost(64) / 80f).coerceIn(0.05f, 1f)
      samples.indices.forEach { i ->
        val target = if (animated) samples[i] else current
        display[i] = if (animated) display[i] + (target - display[i]) * blend else target
      }
      frameAt = now
      invalidate()
      if (animated) postOnAnimation(this) else postDelayed(this, 100L)
    }
  }

  init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }

  fun setListening(value: Boolean) {
    if (listening == value) return
    listening = value
    removeCallbacks(frame)
    samples.fill(0f); display.fill(0f)
    sampledAt = 0L; frameAt = SystemClock.uptimeMillis()
    invalidate()
    if (value && isAttachedToWindow) postOnAnimation(frame)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (listening) postOnAnimation(frame)
  }

  override fun onDetachedFromWindow() {
    removeCallbacks(frame)
    super.onDetachedFromWindow()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val step = width.toFloat() / samples.size
    val barWidth = minOf(3.5f * resources.displayMetrics.density, step * 0.6f)
    display.forEachIndexed { i, value ->
      val envelope = 0.55f + 0.45f * sin(i.toFloat() / samples.lastIndex * Math.PI).toFloat()
      val amplitude = value * envelope
      val barHeight = maxOf(2f * resources.displayMetrics.density, height * (0.14f + amplitude * 0.86f))
      val x = step * (i + 0.5f)
      paint.alpha = 255
      canvas.drawRoundRect(x - barWidth / 2, (height - barHeight) / 2,
        x + barWidth / 2, (height + barHeight) / 2, barWidth / 2, barWidth / 2, paint)
    }
  }
}
