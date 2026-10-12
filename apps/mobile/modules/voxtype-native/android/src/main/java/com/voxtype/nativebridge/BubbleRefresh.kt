package com.voxtype.nativebridge

import android.os.Handler

/** A short recovery window, not a permanent background polling loop. */
internal class BubbleRefresh(private val handler: Handler, private val refresh: () -> Boolean) {
  private var attempt = 0
  private var pending = false
  private var running = false
  private var cancelled = false
  private val task = object : Runnable {
    override fun run() {
      pending = false
      running = true
      val retry = try { refresh() } finally { running = false }
      attempt++
      if (retry && !cancelled && attempt < VoxConstants.BUBBLE_REFRESH_ATTEMPTS) schedule()
    }
  }

  fun request() {
    // Frequent window events must not postpone an already scheduled recovery.
    if (pending || running) return
    cancelled = false
    attempt = 0
    schedule()
  }

  fun cancel() {
    handler.removeCallbacks(task)
    pending = false
    cancelled = true
  }

  private fun schedule() {
    pending = true
    handler.postDelayed(task, VoxConstants.BUBBLE_REFRESH_DELAY_MS shl attempt)
  }
}
