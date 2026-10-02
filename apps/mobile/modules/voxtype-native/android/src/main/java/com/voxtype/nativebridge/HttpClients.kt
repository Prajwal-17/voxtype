package com.voxtype.nativebridge

import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * Shared OkHttp clients. Previously each class built its own client,
 * which wastes connections and threads.
 */
object HttpClients {
  val uploads: OkHttpClient by lazy {
    default.newBuilder().followRedirects(false).followSslRedirects(false)
      .callTimeout(20, TimeUnit.SECONDS).build()
  }
  val default: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(10, TimeUnit.SECONDS)
      .writeTimeout(10, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS)
      .build()
  }

  /** Streaming socket needs no read timeout; connects/writes still bounded. */
  val streaming: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(10, TimeUnit.SECONDS)
      .writeTimeout(10, TimeUnit.SECONDS)
      .readTimeout(0, TimeUnit.MILLISECONDS)
      .build()
  }
}
