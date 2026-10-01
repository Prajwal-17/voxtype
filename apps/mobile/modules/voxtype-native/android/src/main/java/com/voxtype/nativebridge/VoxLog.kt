package com.voxtype.nativebridge

import android.util.Log

/** Thin wrapper so every silent catch becomes a visible log. Never logs tokens or transcripts. */
object VoxLog {
  private const val TAG = "VoxType"

  fun d(message: String) {
    Log.d(TAG, message)
  }

  fun w(message: String, error: Throwable? = null) {
    if (error == null) Log.w(TAG, message) else Log.w(TAG, message, error)
  }

  fun e(message: String, error: Throwable? = null) {
    if (error == null) Log.e(TAG, message) else Log.e(TAG, message, error)
  }
}
