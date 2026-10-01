package com.voxtype.nativebridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.File
import java.util.UUID

/** Phone-only data. No dictation or recording is written through the Worker. */
class VoxTypeStore(private val context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {
  companion object {
    private const val DB_NAME = "voxtype.db"
    private const val DB_VERSION = 1
    private const val KEY_BUBBLE = "bubble_enabled"
    private const val KEY_CLEANUP = "cleanup_enabled"
    private const val KEY_AUDIO_LIMIT = "audio_limit"
    val VALID_AUDIO_LIMITS = listOf(5, 10, 15)
    val VALID_DELIVERIES = listOf("saved", "copied", "pasted")
  }

  override fun onCreate(db: SQLiteDatabase) {
    context.assets.open("voxtype_schema.sql").bufferedReader().use { reader ->
      reader.readText().split(';').map { it.trim() }.filter { it.isNotBlank() }.forEach { db.execSQL(it) }
    }
  }
  // v1: no migration yet. When bumping DB_VERSION, add ALTER TABLE branches here.
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    VoxLog.w("voxtype.db upgrade $oldVersion -> $newVersion has no migration")
  }

  private fun setting(key: String, fallback: String): String = readableDatabase.rawQuery(
    "SELECT value FROM settings WHERE key = ?", arrayOf(key)
  ).use { if (it.moveToFirst()) it.getString(0) else fallback }

  private fun putSetting(key: String, value: String) {
    writableDatabase.insertWithOnConflict("settings", null, ContentValues().apply {
      put("key", key); put("value", value)
    }, SQLiteDatabase.CONFLICT_REPLACE)
  }

  var bubbleEnabled: Boolean
    get() = setting(KEY_BUBBLE, "1") == "1"
    set(value) = putSetting(KEY_BUBBLE, if (value) "1" else "0")
  var cleanupEnabled: Boolean
    get() = setting(KEY_CLEANUP, "0") == "1"
    set(value) = putSetting(KEY_CLEANUP, if (value) "1" else "0")
  var audioLimit: Int
    get() = setting(KEY_AUDIO_LIMIT, "10").toIntOrNull()?.takeIf { it in VALID_AUDIO_LIMITS } ?: 10
    set(value) { require(value in VALID_AUDIO_LIMITS) { "audioLimit must be one of $VALID_AUDIO_LIMITS" }; putSetting(KEY_AUDIO_LIMIT, value.toString()); pruneAudio() }

  fun save(userId: String, text: String, original: String, duration: Long, audio: File?): String {
    val id = UUID.randomUUID().toString()
    val now = System.currentTimeMillis()
    val words = if (text.isBlank()) 0 else text.trim().split(Regex("\\s+")).count { it.isNotBlank() }
    writableDatabase.insertOrThrow("dictations", null, ContentValues().apply {
      put("id", id); put("user_id", userId); put("text", text); put("original_text", original)
      put("created_at", now); put("updated_at", now); put("duration_ms", duration)
      put("word_count", words)
      put("delivery", "saved"); put("audio_file", audio?.absolutePath)
    })
    pruneAudio()
    VoxTypeNativeModule.changed()
    return id
  }

  fun dictations(): List<Map<String, Any?>> {
    val result = mutableListOf<Map<String, Any?>>()
    readableDatabase.rawQuery("SELECT id,user_id,text,original_text,created_at,updated_at,duration_ms,word_count,delivery,audio_file FROM dictations ORDER BY created_at DESC", null).use { cursor ->
      while (cursor.moveToNext()) result += mapOf(
        "id" to cursor.getString(0), "userId" to cursor.getString(1), "text" to cursor.getString(2),
        "originalText" to cursor.getString(3), "createdAt" to cursor.getLong(4), "updatedAt" to cursor.getLong(5),
        "durationMs" to cursor.getLong(6), "wordCount" to cursor.getInt(7), "delivery" to cursor.getString(8),
        "audioFile" to cursor.getString(9)
      )
    }
    return result
  }

  fun text(id: String): String? = readableDatabase.rawQuery("SELECT text FROM dictations WHERE id = ?", arrayOf(id)).use {
    if (it.moveToFirst()) it.getString(0) else null
  }

  fun setDelivery(id: String, delivery: String) {
    require(delivery in VALID_DELIVERIES) { "delivery must be one of $VALID_DELIVERIES" }
    writableDatabase.update("dictations", ContentValues().apply { put("delivery", delivery); put("updated_at", System.currentTimeMillis()) }, "id = ?", arrayOf(id))
    VoxTypeNativeModule.changed()
  }

  fun copyToClipboard(id: String): Boolean {
    val value = text(id) ?: return false
    return try {
      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("VoxType transcript", value))
      setDelivery(id, "copied")
      true
    } catch (e: Exception) {
      VoxLog.e("copyToClipboard failed for $id", e)
      false
    }
  }

  private fun pruneAudio() {
    try {
      val query = context.assets.open("audio_to_prune.sql").bufferedReader().use { it.readText() }
      val expired = mutableListOf<Pair<String, String>>()
      readableDatabase.rawQuery(query, arrayOf(audioLimit.toString())).use { cursor ->
        while (cursor.moveToNext()) expired += cursor.getString(0) to cursor.getString(1)
      }
      expired.forEach { (id, path) ->
        try { File(path).delete() } catch (e: Exception) { VoxLog.w("could not delete $path", e) }
        writableDatabase.execSQL("UPDATE dictations SET audio_file = NULL WHERE id = ?", arrayOf(id))
      }
    } catch (e: Exception) {
      VoxLog.e("pruneAudio failed", e)
    }
  }
}
