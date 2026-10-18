package com.voxtype.nativebridge

import android.content.Context
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** The account owns the dictionary. This cache also serves the background voice bubble. */
object DictionarySync {
  private val lock = Mutex()
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var lastAccount = ""
  private var lastSync = 0L
  private fun prefs(context: Context) = context.getSharedPreferences("voxtype_dictionary", 0)
  internal fun key(user: String, url: String) = JSONArray(listOf(url.trimEnd('/'), user)).toString()
  internal fun strings(array: JSONArray) = List(array.length()) { array.getString(it) }
  internal fun normalize(terms: List<String>): List<String> {
    val result = terms.map { it.trim() }.filter { it.isNotEmpty() }.distinctBy { it.lowercase(java.util.Locale.ROOT) }
    require(result.size <= 100 && result.all { it.length <= 100 }) { "Use at most 100 terms, each up to 100 characters." }
    return result
  }
  fun cached(context: Context): List<String> {
    val session = NativeSession(context)
    return cached(context, session.userId ?: return emptyList(), session.apiUrl ?: return emptyList())
  }
  internal fun cached(context: Context, user: String, url: String) = strings(JSONArray(prefs(context).getString(key(user, url), "[]")))
  fun error(context: Context): String {
    val session = NativeSession(context)
    val user = session.userId ?: return ""
    val url = session.apiUrl ?: return ""
    return prefs(context).getString("error:${key(user, url)}", "") ?: ""
  }
  fun request(context: Context) {
    val app = context.applicationContext
    scope.launch { runCatching { sync(app) } }
  }
  // The owner is persisted before uploading. A later account can never claim these legacy words.
  internal fun pendingImport(context: Context, user: String, url: String): JSONObject? {
    val prefs = prefs(context)
    if (!prefs.contains("legacyOwner")) {
      val terms = VoxTypeStore(context).use { normalize(it.legacyVocabulary) }
      val pending = JSONObject().put("base", JSONArray()).put("terms", JSONArray(terms)).put("importId", UUID.randomUUID().toString())
      val edit = prefs.edit().putString("legacyOwner", key(user, url))
        .putString("legacyImport", if (terms.isEmpty()) "" else pending.toString())
      if (!prefs.contains(key(user, url))) edit.putString(key(user, url), JSONArray(terms).toString())
      check(edit.commit()) { "Could not save dictionary import." }
    }
    return if (prefs.getString("legacyOwner", null) == key(user, url))
      prefs.getString("legacyImport", "")?.takeIf { it.isNotEmpty() }?.let { JSONObject(it) } else null
  }
  suspend fun sync(context: Context, force: Boolean = false) = exchange(context, null, null, force)
  suspend fun update(context: Context, user: String, base: List<String>, terms: List<String>) =
    exchange(context, user, JSONObject().put("base", JSONArray(normalize(base))).put("terms", JSONArray(normalize(terms))), true)

  private fun currentAccount(context: Context): Triple<String, String, String>? {
    val session = NativeSession(context)
    val token = session.token ?: return null
    return Triple(session.userId ?: return null, session.apiUrl ?: return null, token)
  }
  internal suspend fun exchange(context: Context, expectedUser: String?, patch: JSONObject?, force: Boolean,
    accountProvider: () -> Triple<String, String, String>? = { currentAccount(context) },
    client: OkHttpClient = HttpClients.uploads) = lock.withLock {
    val identity = accountProvider() ?: if (patch == null) return@withLock else throw IllegalStateException("Sign in to edit your dictionary.")
    val (user, url, token) = identity
    require(expectedUser == null || expectedUser == user) { "Your account changed. Open the dictionary again." }
    val account = key(user, url)
    if (!force && lastAccount == account && android.os.SystemClock.elapsedRealtime() - lastSync < 30_000) return@withLock
    fun checkAccount() { check(accountProvider() == identity) { "Your account changed. Open the dictionary again." } }
    fun fetch(body: JSONObject?): List<String> {
      checkAccount()
      val request = Request.Builder().url("${url.trimEnd('/')}/v1/dictionary").header("Authorization", "Bearer $token")
      if (body != null) request.patch(body.toString().toRequestBody("application/json".toMediaType()))
      return client.newCall(request.build()).execute().use { response ->
        val raw = response.body?.string() ?: "{}"
        val json = runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
        check(response.isSuccessful) { json.optJSONObject("error")?.optString("message")?.takeIf { it.isNotBlank() } ?: "Couldn’t sync your dictionary. Try again when connected." }
        normalize(strings(json.getJSONArray("terms")))
      }
    }
    try {
      val pending = pendingImport(context, user, url)
      val imported = pending?.let { fetch(it) }
      checkAccount()
      if (imported != null) {
        check(prefs(context).edit().putString(account, JSONArray(imported).toString()).putString("legacyImport", "").commit())
      }
      val terms = if (patch == null && imported != null) imported else fetch(patch)
      checkAccount()
      val changed = terms != cached(context, user, url)
      check(prefs(context).edit().putString(account, JSONArray(terms).toString()).remove("error:$account").commit())
      lastAccount = account; lastSync = android.os.SystemClock.elapsedRealtime()
      if (changed || imported != null) Handler(Looper.getMainLooper()).post { VoxTypeAccessibilityService.instance?.refreshVocabulary() }
      VoxTypeNativeModule.changed()
    } catch (failure: Exception) {
      prefs(context).edit().putString("error:$account", "Couldn’t sync. Your saved words are available offline.").apply()
      VoxTypeNativeModule.changed()
      throw failure
    }
  }
}
