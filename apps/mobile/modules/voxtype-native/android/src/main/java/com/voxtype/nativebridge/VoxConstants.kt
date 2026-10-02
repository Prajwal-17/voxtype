package com.voxtype.nativebridge

/** Central constants. No magic numbers/URLs scattered in service or network code. */
object VoxConstants {
  const val NOTIFICATION_ID = 7341
  const val CHANNEL_ID = "voxtype_recording"
  const val CHANNEL_NAME = "VoxType recording"

  const val SOCKET_KEEP_ALIVE_MS = 420_000L
  const val MAINTENANCE_INTERVAL_MS = 4_000L
  const val CONNECT_TIMEOUT_MS = 20_000L
  const val FINALIZE_TIMEOUT_MS = 5_000L
  const val FINALIZE_RESULT_DELAY_FROM_FINALIZE_MS = 250L
  const val SAVED_AUTO_DISMISS_DELIVERED_MS = 1_600L
  const val SAVED_AUTO_DISMISS_MS = 5_000L
  const val MIC_PERMISSION_RESET_MS = 2_000L
  const val RECONNECT_BASE_MS = 1_000L
  const val RECONNECT_MAX_MS = 8_000L
  const val RECONNECT_MAX_SHIFT = 3

  const val TOKEN_PATH = "/v1/speech/token"
  const val CLEANUP_PATH = "/v1/speech/cleanup"

  // Deepgram live transcription endpoint. Model params are versioned here on purpose.
  const val DEEPGRAM_WS_URL =
    "wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true&smart_format=true"

  const val SAMPLE_RATE = 16_000
  const val BYTES_PER_SECOND = 32_000
  const val MAX_BUFFERED_AUDIO_BYTES = 32 * BYTES_PER_SECOND
  const val AUDIO_BUFFER_BYTES = 3_200
  const val BYTE_RATE = 32_000
  const val WAV_HEADER_BYTES = 44

  // Translucent light surfaces keep underlying content visible; controls stay opaque.
  val BUBBLE_MUTED_COLOR = androidx.core.graphics.ColorUtils.setAlphaComponent(VoxTheme.surfaceSubtle, 230)
  val BUBBLE_ACTIVE_COLOR = androidx.core.graphics.ColorUtils.setAlphaComponent(VoxTheme.accentSoft, 240)
  val BUBBLE_ACTION_COLOR = VoxTheme.surface
  val BUBBLE_DONE_COLOR = VoxTheme.accent
  val BUBBLE_DONE_ICON = VoxTheme.inverse
  val BUBBLE_SAVED_COLOR = androidx.core.graphics.ColorUtils.setAlphaComponent(VoxTheme.successSoft, 240)
  val CLOSE_COLOR = androidx.core.graphics.ColorUtils.setAlphaComponent(VoxTheme.dangerSoft, 240)
  val CLOSE_HOT_COLOR = VoxTheme.dangerSoft
  const val BUBBLE_RADIUS_DP = 24
  const val BUBBLE_ELEVATION_DP = 3
  const val BUBBLE_ICON_DP = 24
  const val BUBBLE_EDGE_DP = 12
  // Compact capsule sizing: idle is circular, listening expands to
  // [cancel | level bars | done] like the desktop overlay.
  const val BUBBLE_SIZE_DP = 48
  const val BUBBLE_LISTEN_WIDTH_DP = 200
  const val BUBBLE_ACTION_DP = 44
  const val BUBBLE_GLYPH_SP = 22f
  const val CLOSE_SIZE_DP = 72
  const val BUBBLE_WIDTH_ANIM_MS = 150L
  const val BUBBLE_SNAP_ANIM_MS = 220L
}
