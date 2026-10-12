package com.voxtype.nativebridge

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

/** Local, bounded diagnostics. Never records text, audio, credentials, or other apps. */
internal object BubbleHealth {
  private const val PREFS = "voxtype_bubble_health"
  private const val EVENT_LIMIT = 20
  private val lock = Any()

  fun matchesService(setting: String?, expected: ComponentName): Boolean =
    setting?.split(':')?.any { ComponentName.unflattenFromString(it) == expected } == true

  fun observeAccessibility(context: Context): Boolean {
    val enabled = matchesService(
      Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES),
      ComponentName(context, VoxTypeAccessibilityService::class.java),
    )
    try {
      synchronized(lock) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.contains("enabled") && prefs.getBoolean("enabled", false) != enabled) {
          record(context, if (enabled) "accessibility_enabled" else "accessibility_disabled")
        }
        if (!prefs.contains("enabled") || prefs.getBoolean("enabled", false) != enabled) {
          prefs.edit().putBoolean("enabled", enabled).apply()
        }
      }
    } catch (error: Exception) { VoxLog.w("could not remember accessibility state", error) }
    return enabled
  }

  fun record(context: Context, event: String) {
    try {
      synchronized(lock) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val previous = runCatching { JSONArray(prefs.getString("events", "[]")) }.getOrDefault(JSONArray())
        val next = JSONArray()
        for (i in maxOf(0, previous.length() - EVENT_LIMIT + 1) until previous.length()) next.put(previous.get(i))
        next.put(JSONObject().put("event", event.take(100)).put("timestamp", System.currentTimeMillis()))
        prefs.edit().putString("events", next.toString()).apply()
      }
    } catch (error: Exception) { VoxLog.w("could not record bubble health", error) }
  }

  fun snapshot(context: Context): Map<String, Any?> {
    val manager = context.getSystemService(ActivityManager::class.java)
    val exit = runCatching {
      manager.getHistoricalProcessExitReasons(context.packageName, 0, 5)
        .firstOrNull { it.processName == context.applicationInfo.processName }
    }.getOrNull()
    val events = runCatching {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val rows = JSONArray(prefs.getString("events", "[]"))
      (0 until rows.length()).map { i ->
        val row = rows.getJSONObject(i)
        mapOf("event" to row.getString("event"), "timestamp" to row.getLong("timestamp"))
      }
    }.getOrDefault(emptyList())
    val appVersion = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull()
    val service = VoxTypeAccessibilityService.instance
    return mapOf(
      "device" to mapOf("manufacturer" to Build.MANUFACTURER, "model" to Build.MODEL,
        "androidVersion" to Build.VERSION.RELEASE, "appVersion" to appVersion),
      "foregroundMode" to (service?.foregroundStatus ?: "none"),
      "foregroundError" to service?.foregroundError,
      "hiddenReason" to (service?.hiddenReason ?: "disconnected"),
      "batteryOptimizationsIgnored" to runCatching {
        context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)
      }.getOrNull(),
      "backgroundRestricted" to runCatching { manager.isBackgroundRestricted }.getOrNull(),
      "lastExit" to exit?.let { mapOf("reason" to exitReason(it.reason), "code" to it.reason, "timestamp" to it.timestamp) },
      "events" to events,
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
