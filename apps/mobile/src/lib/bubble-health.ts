import type { Snapshot } from '../../modules/voxtype-native/src/VoxTypeNative.types';

export function accessibilityLabel(enabled: boolean, connected: boolean): string {
  return enabled ? (connected ? 'Enabled' : 'Reconnecting') : 'Off';
}

/** Explicit allowlist: a snapshot also contains dictated text, which must not be copied. */
export function bubbleDiagnostics(snapshot: Snapshot): string {
  const health = snapshot.bubbleHealth;
  return JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      device: health && {
        manufacturer: health.device.manufacturer,
        model: health.device.model,
        androidVersion: health.device.androidVersion,
        appVersion: health.device.appVersion,
      },
      accessibilityEnabled: snapshot.accessibilityEnabled,
      accessibilityConnected: snapshot.accessibilityConnected,
      microphoneGranted: snapshot.microphoneGranted,
      bubbleEnabled: snapshot.bubbleEnabled,
      recordingStatus: snapshot.status,
      foregroundMode: health?.foregroundMode,
      foregroundError: health?.foregroundError,
      hiddenReason: health?.hiddenReason,
      batteryOptimizationsIgnored: health?.batteryOptimizationsIgnored,
      backgroundRestricted: health?.backgroundRestricted,
      lastRecordedProcessExit: health?.lastExit && {
        reason: health.lastExit.reason,
        code: health.lastExit.code,
        timestamp: health.lastExit.timestamp,
      },
      // Accessibility events are observation times, not proof of when or why Android disabled it.
      recentEvents: health?.events.map(({ event, timestamp }) => ({ event, timestamp })),
    },
    null,
    2,
  );
}
