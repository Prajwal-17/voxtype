package com.voxtype.nativebridge

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build

/** Own-process diagnostics only. Never includes credentials, transcript text, or crash traces. */
internal object AppHealth {
  private const val PREFS = "voxtype_app_health"

  fun recordIssue(context: Context, stage: String, error: Throwable) {
    runCatching {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putString("stage", stage)
        .putString("exception", error.javaClass.simpleName)
        .putLong("timestamp", System.currentTimeMillis()).apply()
    }.onFailure { VoxLog.w("could not record native issue", it) }
  }

  fun snapshot(context: Context): Map<String, Any?> {
    val exit = runCatching {
      context.getSystemService(ActivityManager::class.java)
        ?.getHistoricalProcessExitReasons(context.packageName, 0, 5)
        ?.firstOrNull { it.processName == context.applicationInfo.processName }
    }.getOrNull()
    val issue = runCatching {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (!prefs.contains("timestamp")) null else mapOf(
        "stage" to prefs.getString("stage", ""),
        "exception" to prefs.getString("exception", ""),
        "timestamp" to prefs.getLong("timestamp", 0),
      )
    }.getOrNull()
    return mapOf(
      "appName" to runCatching { context.applicationInfo.loadLabel(context.packageManager).toString() }.getOrNull(),
      "packageName" to context.packageName,
      "versionCode" to runCatching { context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode }.getOrNull(),
      "appVersion" to runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull(),
      "manufacturer" to Build.MANUFACTURER,
      "model" to Build.MODEL,
      "androidVersion" to Build.VERSION.RELEASE,
      "lastNativeIssue" to issue,
      "lastExit" to exit?.let { mapOf(
        "reason" to exitReason(it.reason), "code" to it.reason, "timestamp" to it.timestamp,
      ) },
    )
  }

  private fun exitReason(reason: Int): String = when (reason) {
    ApplicationExitInfo.REASON_CRASH -> "crash"
    ApplicationExitInfo.REASON_CRASH_NATIVE -> "native_crash"
    ApplicationExitInfo.REASON_ANR -> "not_responding"
    ApplicationExitInfo.REASON_LOW_MEMORY -> "low_memory"
    ApplicationExitInfo.REASON_USER_REQUESTED -> "user_requested"
    ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "permission_change"
    ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "resource_usage"
    else -> "other"
  }
}
