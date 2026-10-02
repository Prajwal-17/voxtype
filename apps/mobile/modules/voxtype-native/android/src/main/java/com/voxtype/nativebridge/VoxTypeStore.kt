package com.voxtype.nativebridge

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.File
import java.util.UUID
import org.json.JSONObject

/** Transcripts stay local; unsent rows are tried when the next transcript is generated. */
class VoxTypeStore(
  private val context: Context,
  private val readSql: (String) -> String = { name -> context.assets.open(name).bufferedReader().use { it.readText() } },
  private val onChanged: () -> Unit = { VoxTypeNativeModule.changed() },
) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION), java.io.Closeable {
  companion object {
    private const val DB_NAME = "voxtype.db"
    private const val DB_VERSION = 2
    private const val KEY_BUBBLE = "bubble_enabled"
    private const val KEY_CLEANUP = "cleanup_enabled"
    const val AUDIO_LIMIT = 10
    val VALID_DELIVERIES = listOf("saved", "copied", "pasted")
  }

  override fun onCreate(db: SQLiteDatabase) {
    executeAsset(db, "voxtype_schema.sql")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    if (oldVersion < 2) executeAsset(db, "voxtype_upgrade_2.sql")
  }

  private fun asset(name: String) = readSql(name)
  private fun executeAsset(db: SQLiteDatabase, name: String) {
    asset(name).split(';').map { it.trim() }.filter { it.isNotBlank() }.forEach { db.execSQL(it) }
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
  fun save(userId: String, text: String, original: String, duration: Long, audio: File?, apiUrl: String?): String {
    val id = UUID.randomUUID().toString()
    val now = System.currentTimeMillis()
    val words = if (text.isBlank()) 0 else text.trim().split(Regex("\\s+")).count { it.isNotBlank() }
    writableDatabase.insertOrThrow("dictations", null, ContentValues().apply {
      put("id", id); put("user_id", userId); put("text", text); put("original_text", original)
      put("created_at", now); put("updated_at", now); put("duration_ms", duration)
      put("word_count", words)
      put("delivery", "saved"); put("audio_file", audio?.absolutePath)
      put("upload_api_url", apiUrl)
    })
    pruneAudio()
    onChanged()
    return id
  }

  fun page(userId: String, cursor: String?): Map<String, Any?> {
    val parts = cursor?.split(":", limit = 2)
    val time = parts?.firstOrNull()?.toLongOrNull() ?: Long.MAX_VALUE
    val id = parts?.getOrNull(1) ?: ""
    val items = dictations(userId, time, id)
    val more = items.size > 12
    val page = items.take(12)
    val last = page.lastOrNull()
    return mapOf("items" to page, "nextCursor" to if (more && last != null) "${last["createdAt"]}:${last["id"]}" else null)
  }
  fun dictations(userId: String, before: Long = Long.MAX_VALUE, beforeId: String = ""): List<Map<String, Any?>> {
    val result = mutableListOf<Map<String, Any?>>()
    readableDatabase.rawQuery("SELECT id,user_id,text,original_text,created_at,updated_at,duration_ms,word_count,delivery,audio_file FROM dictations WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT 13", arrayOf(userId, before.toString(), before.toString(), beforeId)).use { cursor ->
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
    writableDatabase.execSQL("UPDATE dictations SET delivery = ?, updated_at = ? WHERE id = ?",
      arrayOf<Any>(delivery, System.currentTimeMillis(), id))
    onChanged()
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

  fun pruneAudio() {
    try {
      val query = asset("audio_to_prune.sql")
      val expired = mutableListOf<Pair<String, String>>()
      readableDatabase.rawQuery(query, arrayOf(AUDIO_LIMIT.toString())).use { cursor ->
        while (cursor.moveToNext()) expired += cursor.getString(0) to cursor.getString(1)
      }
      for ((id, path) in expired) {
        val file = File(path)
        val directory = File(context.filesDir, "recordings").canonicalFile
        if (file.canonicalFile.parentFile != directory) continue
        if (!file.exists() || file.delete()) {
          writableDatabase.execSQL("UPDATE dictations SET audio_file = NULL WHERE id = ?", arrayOf(id))
        } else VoxLog.w("could not delete old recording")
      }
      // Include completed files left without a row after a crash or failed save.
      // An active microphone writes .part, so it never enters this list.
      val completed = File(context.filesDir, "recordings").listFiles()
        ?.filter { it.isFile && it.extension == "wav" }
        ?.sortedWith(compareByDescending<File> { it.lastModified() }.thenByDescending { it.name })
        ?: emptyList()
      for (file in completed.drop(AUDIO_LIMIT)) {
        if (file.delete()) {
          writableDatabase.execSQL("UPDATE dictations SET audio_file = NULL WHERE audio_file = ?", arrayOf(file.absolutePath))
        } else VoxLog.w("could not delete old recording")
      }
    } catch (e: Exception) {
      VoxLog.e("pruneAudio failed", e)
    }
  }

  /** Upgrade old local rows only for their existing account and the current API. */
  fun prepareUploads(userId: String, apiUrl: String) {
    writableDatabase.execSQL("UPDATE dictations SET upload_api_url = ? WHERE user_id = ? AND upload_api_url IS NULL",
      arrayOf(apiUrl, userId))
  }

  fun pendingUploads(userId: String, apiUrl: String): List<PendingDictation> {
    val result = mutableListOf<PendingDictation>()
    readableDatabase.rawQuery(asset("pending_uploads.sql"), arrayOf(userId, apiUrl)).use { cursor ->
      while (cursor.moveToNext()) {
        val text = cursor.getString(2)
        if (text.isBlank()) continue
        val original = cursor.getString(3)?.takeIf { it.isNotBlank() }
        val payload = JSONObject().put("text", text).put("originalText", original ?: JSONObject.NULL)
          .put("createdAt", cursor.getLong(4)).put("durationMs", cursor.getLong(5))
          .put("source", "mobile")
        result += PendingDictation(cursor.getString(0), payload)
      }
    }
    return result
  }

  fun acknowledgeUpload(item: PendingDictation) {
    writableDatabase.execSQL(asset("acknowledge_upload.sql"), arrayOf(item.id))
  }
}

data class PendingDictation(val id: String, val payload: JSONObject)
