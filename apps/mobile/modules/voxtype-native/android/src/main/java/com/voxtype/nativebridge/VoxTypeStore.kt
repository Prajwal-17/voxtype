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
class VoxTypeStore(private val context: Context) : SQLiteOpenHelper(context, "voxtype.db", null, 1) {
  override fun onCreate(db: SQLiteDatabase) {
    context.assets.open("voxtype_schema.sql").bufferedReader().use { reader ->
      reader.readText().split(';').map { it.trim() }.filter { it.isNotBlank() }.forEach { db.execSQL(it) }
    }
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

  private fun setting(key: String, fallback: String): String = readableDatabase.rawQuery(
    "SELECT value FROM settings WHERE key = ?", arrayOf(key)
  ).use { if (it.moveToFirst()) it.getString(0) else fallback }

  private fun putSetting(key: String, value: String) {
    writableDatabase.insertWithOnConflict("settings", null, ContentValues().apply {
      put("key", key); put("value", value)
    }, SQLiteDatabase.CONFLICT_REPLACE)
  }

  var bubbleEnabled: Boolean
    get() = setting("bubble_enabled", "1") == "1"
    set(value) = putSetting("bubble_enabled", if (value) "1" else "0")
  var cleanupEnabled: Boolean
    get() = setting("cleanup_enabled", "0") == "1"
    set(value) = putSetting("cleanup_enabled", if (value) "1" else "0")
  var audioLimit: Int
    get() = setting("audio_limit", "10").toIntOrNull()?.takeIf { it in listOf(5, 10, 15) } ?: 10
    set(value) { require(value in listOf(5, 10, 15)); putSetting("audio_limit", value.toString()); pruneAudio() }

  fun save(userId: String, text: String, original: String, duration: Long, audio: File?): String {
    val id = UUID.randomUUID().toString()
    val now = System.currentTimeMillis()
    writableDatabase.insertOrThrow("dictations", null, ContentValues().apply {
      put("id", id); put("user_id", userId); put("text", text); put("original_text", original)
      put("created_at", now); put("updated_at", now); put("duration_ms", duration)
      put("word_count", text.trim().split(Regex("\\s+")).count { it.isNotBlank() })
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
    require(delivery in listOf("saved", "copied", "pasted"))
    writableDatabase.update("dictations", ContentValues().apply { put("delivery", delivery); put("updated_at", System.currentTimeMillis()) }, "id = ?", arrayOf(id))
    VoxTypeNativeModule.changed()
  }

  fun copyToClipboard(id: String): Boolean {
    val value = text(id) ?: return false
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("VoxType transcript", value))
    setDelivery(id, "copied")
    return true
  }

  private fun pruneAudio() {
    val query = context.assets.open("audio_to_prune.sql").bufferedReader().use { it.readText() }
    val expired = mutableListOf<Pair<String, String>>()
    readableDatabase.rawQuery(query, arrayOf(audioLimit.toString())).use { cursor ->
      while (cursor.moveToNext()) expired += cursor.getString(0) to cursor.getString(1)
    }
    expired.forEach { (id, path) ->
      File(path).delete()
      writableDatabase.execSQL("UPDATE dictations SET audio_file = NULL WHERE id = ?", arrayOf(id))
    }
  }
}
