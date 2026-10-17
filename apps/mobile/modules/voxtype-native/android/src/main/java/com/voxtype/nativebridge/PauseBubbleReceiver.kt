package com.voxtype.nativebridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Private notification action; it cannot be invoked by another app. */
class PauseBubbleReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    VoxTypeAccessibilityService.instance?.pauseForPayments()
  }
}
