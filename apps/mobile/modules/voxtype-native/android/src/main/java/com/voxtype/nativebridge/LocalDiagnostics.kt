package com.voxtype.nativebridge

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Device-only bounded events. No text, target-app identifiers, credentials or exception messages. */
internal object LocalDiagnostics {
  const val RETENTION_MS = 14L * 24 * 60 * 60 * 1000
  const val LIMIT = 500
  enum class Event { recording_started, transcription_complete, transcription_failed, cleanup_fallback,
    delivery_sent, delivery_recovery, clipboard_failed, save_failed, cancelled }

  @Synchronized fun record(context: Context, event: Event, now: Long = System.currentTimeMillis()) {
    runCatching {
      val user = NativeSession(context).userId ?: return
      append(context, user, event, now)
    }
  }
  @Synchronized internal fun append(context: Context, user: String, event: Event, now: Long) {
    val rows = retained(context, now)
    rows.put(JSONObject().put("owner", user).put("timestamp", now).put("event", event.name))
    persist(context, trim(rows, now))
  }
  internal fun trim(rows: JSONArray, now: Long): JSONArray {
    val valid = (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }.filter {
      val age = now - it.optLong("timestamp", -1)
      age >= 0 && age < RETENTION_MS && Event.entries.any { code -> code.name == it.optString("event") }
    }.takeLast(LIMIT)
    return JSONArray(valid)
  }
  private fun retained(context: Context, now: Long): JSONArray = trim(runCatching {
    JSONArray(context.getSharedPreferences("voxtype_local_diagnostics", 0).getString("events", "[]"))
  }.getOrDefault(JSONArray()), now)
  private fun persist(context: Context, rows: JSONArray) {
    check(context.getSharedPreferences("voxtype_local_diagnostics", 0).edit().putString("events", rows.toString()).commit())
  }
  @Synchronized fun prune(context: Context, now: Long = System.currentTimeMillis()) {
    runCatching { persist(context, retained(context, now)) }
  }
  @Synchronized internal fun export(context: Context, user: String, now: Long = System.currentTimeMillis()): String {
    val rows = retained(context, now)
    persist(context, rows)
    val redacted = JSONArray()
    for (i in 0 until rows.length()) {
      val row = rows.getJSONObject(i)
      if (row.optString("owner") == user) redacted.put(JSONObject()
        .put("timestamp", row.getLong("timestamp")).put("event", row.getString("event")))
    }
    val version = context.packageManager.getPackageInfo(context.packageName, 0).versionName
    return JSONObject().put("version", version).put("retentionDays", 14).put("events", redacted).toString(2)
  }
}
