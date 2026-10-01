package com.voxtype.nativebridge

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Android Keystore backed session; the bearer credential is never in SQLite or Expo config. */
class NativeSession(context: Context) {
  private val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  companion object {
    private const val PREFS = "voxtype_session"
    private const val KEY_ALIAS = "voxtype_bearer_v1"
    private const val GCM_TAG_BITS = 128
    private const val GCM_IV_BYTES = 12
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build())
    }.generateKey()
  }

  fun save(token: String, userId: String, apiUrl: String) {
    require(token.isNotBlank()) { "token must not be blank" }
    require(userId.isNotBlank()) { "userId must not be blank" }
    require(apiUrl.startsWith("https://") || apiUrl.startsWith("http://localhost:") ||
      apiUrl.startsWith("http://10.0.2.2:")) { "apiUrl must be https or a local dev host" }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
    preferences.edit()
      .putString("token", Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP))
      .putString("userId", userId)
      .putString("apiUrl", apiUrl.trimEnd('/'))
      .apply()
  }

  val token: String?
    get() {
      val encoded = preferences.getString("token", null) ?: return null
      return try {
        val bytes = Base64.decode(encoded, Base64.NO_WRAP)
        if (bytes.size <= GCM_IV_BYTES) {
          VoxLog.w("saved token has invalid length; clearing")
          clear()
          return null
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
          init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(GCM_TAG_BITS, bytes.copyOfRange(0, GCM_IV_BYTES)))
        }
        String(cipher.doFinal(bytes.copyOfRange(GCM_IV_BYTES, bytes.size)), Charsets.UTF_8)
      } catch (e: Exception) {
        // Key invalidated (e.g. lock-screen change) or data corrupted: drop it, never crash.
        VoxLog.w("could not decrypt token; clearing session", e)
        clear()
        null
      }
    }

  val userId: String? get() = preferences.getString("userId", null)
  val apiUrl: String? get() = preferences.getString("apiUrl", null)
  fun clear() { preferences.edit().clear().apply() }
}
