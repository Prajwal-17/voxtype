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
  private val preferences = context.getSharedPreferences("voxtype_session", Context.MODE_PRIVATE)
  private val alias = "voxtype_bearer_v1"

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build())
    }.generateKey()
  }

  fun save(token: String, userId: String, apiUrl: String) {
    require(token.isNotBlank() && userId.isNotBlank() &&
      (apiUrl.startsWith("https://") || apiUrl.startsWith("http://localhost:") ||
        apiUrl.startsWith("http://10.0.2.2:")))
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
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
          init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        }
        String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
      } catch (_: Exception) { null }
    }

  val userId: String? get() = preferences.getString("userId", null)
  val apiUrl: String? get() = preferences.getString("apiUrl", null)
  fun clear() { preferences.edit().clear().apply() }
}
