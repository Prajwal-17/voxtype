import assert from 'node:assert/strict';
import test from 'node:test';
import { accessibilityLabel, bubbleDiagnostics } from '../apps/mobile/src/lib/bubble-health';
import type { Snapshot } from '../apps/mobile/modules/voxtype-native/src/VoxTypeNative.types';

test('accessibility access stays enabled while the service reconnects', () => {
  assert.equal(accessibilityLabel(true, false), 'Reconnecting');
  assert.equal(accessibilityLabel(true, true), 'Enabled');
  assert.equal(accessibilityLabel(false, false), 'Off');
});

test('diagnostics exclude dictated text and work on an older native snapshot', () => {
  const snapshot: Snapshot = {
    accessibilityEnabled: true,
    accessibilityConnected: false,
    microphoneGranted: true,
    bubbleEnabled: true,
    cleanupEnabled: false,
    syncing: false,
    syncError: '',
    audioLimit: 10,
    status: 'idle',
    inApp: { status: 'saved', text: 'private transcript', error: 'private error', durationMs: 123 },
  };
  const report = bubbleDiagnostics(snapshot);
  assert.equal(report.includes('private'), false);
  assert.equal(JSON.parse(report).accessibilityEnabled, true);
  assert.equal(JSON.parse(report).accessibilityConnected, false);

  const health = {
    device: {
      manufacturer: 'vivo',
      model: 'Neo 6',
      androidVersion: '14',
      appVersion: '0.0.8',
      account: 'private account',
    },
    foregroundMode: 'none' as const,
    foregroundError: 'SecurityException',
    hiddenReason: 'disconnected',
    batteryOptimizationsIgnored: false,
    backgroundRestricted: true,
    lastExit: { reason: 'crash', code: 4, timestamp: 123, trace: 'private crash context' },
    events: [{ event: 'accessibility_disabled', timestamp: 124, token: 'private token' }],
  };
  const detailed = bubbleDiagnostics({ ...snapshot, bubbleHealth: health });
  assert.equal(detailed.includes('private'), false);
  assert.equal(JSON.parse(detailed).lastRecordedProcessExit.reason, 'crash');
  assert.equal(JSON.parse(detailed).recentEvents[0].event, 'accessibility_disabled');
});
