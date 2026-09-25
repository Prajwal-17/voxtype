import { app, events, Icon, init, os, window as nativeWindow } from '@neutralinojs/lib';
import type { DictationState } from '@flow/core';
import { AudioBufferQueue } from './audio/buffer.ts';
import { LauncherBridge } from './launcher.ts';
import { parseLauncherCommand, type LauncherCommand } from './commands.ts';
import { ParecCapture, type ProcessEvent } from './audio/parec.ts';
import { pcmLevel } from './audio/pcm.ts';
import captureScript from './audio/capture.sh?raw';
import './style.css';

const root = document.querySelector<HTMLElement>('#app')!;
root.innerHTML = `
<main id="settings">
  <header>
    <div class="brand"><span class="brand-mark">F</span><div><h1>Flow</h1><p>Fast, private voice dictation for Linux</p></div></div>
    <button id="hide" class="quiet" title="Hide Flow to the tray">Hide</button>
  </header>
  <section class="card">
    <h2>Deepgram</h2>
    <p class="muted">Flow records locally first, then streams the short buffer as soon as Deepgram connects. Audio and transcript history are never saved.</p>
    <label for="key">API key</label>
    <input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your Deepgram key">
    <div class="row"><button id="save-key">Save to GNOME Keyring</button><button id="forget-key" class="quiet">Forget saved key</button></div>
    <small id="key-status">No key loaded. You can still test the microphone.</small>
  </section>
  <section class="card compact">
    <div class="card-heading"><div><h2>Dictation</h2><p class="muted">Use the tray menu or your GNOME shortcut to start and stop.</p></div><span id="state-badge">Idle</span></div>
    <div class="actions"><button id="start" class="primary">Start dictation</button><button id="stop" disabled>Finish and paste</button><button id="cancel" disabled class="quiet">Cancel</button></div>
    <div class="meter-row"><span>Microphone</span><meter id="level" min="0" max="1" value="0"></meter></div>
    <output id="status" role="status">Flow is running in the background. Use the tray icon to begin.</output>
    <output id="transcript" aria-live="polite"></output>
    <button id="copy" class="quiet recovery" disabled>Copy transcript</button>
  </section>
  <section class="card help">
    <h2>Linux setup</h2>
    <p class="muted">Default shortcut: <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd>. Add a GNOME custom shortcut that runs <code>flow toggle</code>. The tray menu remains available if the shortcut is not configured.</p>
    <p class="muted">Paste uses <code>wl-copy</code> and <code>ydotool</code>. Install them with <code>sudo apt install wl-clipboard ydotool</code>.</p>
    <div class="row"><button id="deps" class="quiet">Check dependencies</button><button id="quit" class="quiet">Quit Flow</button></div>
  </section>
</main>
<section id="pill" aria-live="polite">
  <span class="pulse"></span><div><strong id="pill-state">Listening</strong><small id="pill-detail">Speak naturally</small></div>
  <meter id="pill-level" min="0" max="1" value="0"></meter>
  <button id="pill-stop" title="Finish and paste">Done</button><button id="pill-cancel" class="quiet" title="Cancel">×</button>
</section>`;

const status = document.querySelector<HTMLOutputElement>('#status')!;
const transcript = document.querySelector<HTMLOutputElement>('#transcript')!;
const keyInput = document.querySelector<HTMLInputElement>('#key')!;
const keyStatus = document.querySelector<HTMLElement>('#key-status')!;
const badge = document.querySelector<HTMLElement>('#state-badge')!;
const level = document.querySelector<HTMLMeterElement>('#level')!;
const pillLevel = document.querySelector<HTMLMeterElement>('#pill-level')!;
const pillState = document.querySelector<HTMLElement>('#pill-state')!;
const pillDetail = document.querySelector<HTMLElement>('#pill-detail')!;
const button = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;

let native = false;
let state: DictationState = 'idle';
let epoch = 0;
let capture: ParecCapture | undefined;
let socket: WebSocket | undefined;
let audioQueue: AudioBufferQueue | undefined;
let configuredKey = '';
let launcher: LauncherBridge | undefined;
let preview = '';
let finalizing = false;
let failing = false;
let exiting = false;
let stopRequested = false;
let captureStopped = false;
let closeSent = false;
let metadataReceived = false;
let noAudioTimer: ReturnType<typeof setTimeout> | undefined;
let connectionTimer: ReturnType<typeof setTimeout> | undefined;
let finalTimer: ReturnType<typeof setTimeout> | undefined;
let lastLevelAt = 0;
let connectionStartedAt = 0;
const segments = new Map<number, string>();

function isCurrent(session: number) { return session === epoch; }
function show(message: string) { status.textContent = message; }
function clearTimers() {
  clearTimeout(noAudioTimer); noAudioTimer = undefined;
  clearTimeout(connectionTimer); connectionTimer = undefined;
  clearTimeout(finalTimer); finalTimer = undefined;
}
function transcriptText() {
  return [...segments.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, text]) => text.trim())
    .filter(Boolean)
    .concat(preview.trim() ? [preview.trim()] : [])
    .join(' ')
    .trim();
}
function displayText() {
  transcript.textContent = transcriptText();
  button('copy').disabled = !transcript.textContent;
}
function trayLabel() {
  if (state === 'listening') return 'Stop and paste';
  if (state === 'finishing') return 'Finishing…';
  if (state === 'connecting') return 'Connecting…';
  if (state === 'error') return 'Retry dictation';
  return 'Start dictation';
}
let trayUpdate = Promise.resolve();
let trayFailureNotified = false;
function updateTray() {
  if (!native) return;
  trayUpdate = trayUpdate.then(() => os.setTray({
    icon: '/dist/flow.png',
    menuItems: [
      { id: 'toggle', text: trayLabel() },
      { id: 'cancel', text: 'Cancel current session', isDisabled: state !== 'listening' && state !== 'finishing' },
      { id: 'settings', text: 'Settings' },
      { text: '-' },
      { id: 'quit', text: 'Quit Flow' },
    ],
  })).catch(() => {
    if (!trayFailureNotified) {
      trayFailureNotified = true;
      void showSettings().catch(() => {});
    }
  });
}
function renderState(next: DictationState) {
  state = next;
  const busy = next !== 'idle' && next !== 'error';
  button('start').disabled = busy;
  button('stop').disabled = next !== 'listening';
  button('cancel').disabled = !busy;
  badge.textContent = next.charAt(0).toUpperCase() + next.slice(1);
  pillState.textContent = next === 'finishing' ? 'Finishing' : next === 'connecting' ? 'Connecting' : next === 'error' ? 'Flow error' : 'Listening';
  document.body.dataset.state = next;
  updateTray();
}
function requireNative() {
  if (!native) throw new Error('Run Flow inside Neutralino on your Ubuntu desktop.');
}
async function delay(milliseconds: number) {
  await new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}
async function showSettings() {
  requireNative();
  document.body.classList.remove('overlay');
  await nativeWindow.setAlwaysOnTop(false);
  await nativeWindow.setBorderless(false);
  await nativeWindow.setSize({ width: 640, height: 650 });
  await nativeWindow.show();
}
async function showOverlay() {
  requireNative();
  document.body.classList.add('overlay');
  await nativeWindow.setBorderless(true);
  await nativeWindow.setAlwaysOnTop(true);
  await nativeWindow.setSize({ width: 430, height: 92 });
  await nativeWindow.show();
}
async function hideOverlay() {
  if (!native) return;
  document.body.classList.remove('overlay');
  await nativeWindow.setAlwaysOnTop(false).catch(() => {});
  await nativeWindow.setBorderless(false).catch(() => {});
  await nativeWindow.hide().catch(() => {});
}
async function cleanup() {
  epoch++;
  clearTimers();
  const oldCapture = capture;
  capture = undefined;
  const oldSocket = socket;
  socket = undefined;
  audioQueue?.clear();
  audioQueue = undefined;
  level.value = 0;
  pillLevel.value = 0;
  if (oldSocket && oldSocket.readyState < WebSocket.CLOSING) oldSocket.close();
  await oldCapture?.stop(true);
}
async function fail(message: string) {
  if (failing || exiting) return;
  failing = true;
  renderState('finishing');
  const release = cleanup();
  const session = epoch;
  try { await release; } catch { /* Keep the original error visible. */ }
  if (session === epoch) {
    renderState('error');
    show(message);
    if (native) void os.showNotification('Flow', message, Icon.ERROR).catch(() => {});
  }
  failing = false;
}
function sendAudio(ws: WebSocket, bytes: Uint8Array) {
  if (ws.readyState !== WebSocket.OPEN) throw new Error('Deepgram connection closed while recording.');
  if (ws.bufferedAmount > 512_000) throw new Error('Deepgram is receiving too slowly. Stop and retry.');
  ws.send(bytes);
}
async function pasteTranscript(text: string) {
  requireNative();
  await hideOverlay();
  // Let the target application become the visible active window before the
  // synthetic paste. The transcript is supplied through stdin, never a shell.
  await delay(80);
  const copied = await os.execCommand('wl-copy', { stdIn: text });
  if (copied.exitCode !== 0) throw new Error(copied.stdErr.trim() || 'wl-copy could not update the clipboard.');
  const pasted = await os.execCommand('ydotool key 29:1 47:1 47:0 29:0');
  if (pasted.exitCode !== 0) throw new Error(pasted.stdErr.trim() || 'ydotool could not paste. The transcript remains on the clipboard.');
}
async function completeTranscript(session: number) {
  if (!isCurrent(session) || finalizing || state !== 'finishing' || !captureStopped || !metadataReceived) return;
  finalizing = true;
  const text = transcriptText();
  try {
    await cleanup();
    if (!text) {
      renderState('idle');
      show('No speech detected. Microphone released.');
      await hideOverlay();
      return;
    }
    await pasteTranscript(text);
    renderState('idle');
    show('Pasted. The transcript is still on your clipboard.');
  } catch (error) {
    renderState('error');
    show(error instanceof Error ? error.message : 'Paste failed. The transcript remains below.');
    if (native) void os.showNotification('Flow', 'Paste failed. Use Copy transcript in Settings.', Icon.ERROR).catch(() => {});
  } finally {
    finalizing = false;
  }
}
function maybeSendClose(session: number) {
  if (!isCurrent(session) || !stopRequested || !captureStopped || closeSent || !socket) return;
  if (socket.readyState === WebSocket.CONNECTING) return;
  if (socket.readyState !== WebSocket.OPEN) {
    void fail('Deepgram disconnected before the final audio could be sent. Received text remains below.');
    return;
  }
  closeSent = true;
  socket.send(JSON.stringify({ type: 'CloseStream' }));
  if (metadataReceived) void completeTranscript(session);
  clearTimeout(finalTimer);
  finalTimer = setTimeout(() => {
    if (isCurrent(session)) void fail('Final transcript timed out. Received text remains below.');
  }, 10_000);
}
function createCapture(session: number, queue?: AudioBufferQueue) {
  let receivedAudio = false;
  const recording = new ParecCapture({
    listen: async handler => {
      const listener = (event: CustomEvent<ProcessEvent>) => handler(event.detail);
      await events.on('spawnedProcess', listener);
      return async () => { await events.off('spawnedProcess', listener); };
    },
    spawn: command => os.spawnProcess(command),
    update: (id, action, data) => os.updateSpawnedProcess(id, action, data),
  }, captureScript, bytes => {
    if (!isCurrent(session)) return;
    if (queue) queue.push(bytes);
    if (!receivedAudio) {
      receivedAudio = true;
      clearTimeout(noAudioTimer);
      pillDetail.textContent = queue ? 'Sending as soon as Deepgram is ready' : 'Speak naturally';
    }
    const now = performance.now();
    if (now - lastLevelAt >= 80) {
      const value = pcmLevel(bytes);
      level.value = value;
      pillLevel.value = value;
      lastLevelAt = now;
    }
  }, error => {
    if (isCurrent(session)) void fail(error.message);
  });
  capture = recording;
  noAudioTimer = setTimeout(() => {
    if (isCurrent(session)) void fail('No microphone audio received. Check Ubuntu Sound input and install pulseaudio-utils.');
  }, 10_000);
  return recording;
}
async function start() {
  if (state !== 'idle' && state !== 'error') return;
  requireNative();
  renderState('connecting');
  try {
    await cleanup();
    const session = epoch;
    segments.clear(); preview = ''; displayText();
    stopRequested = false; captureStopped = false; closeSent = false; metadataReceived = false;
    finalizing = false;
    const key = keyInput.value.trim() || configuredKey;
    keyInput.value = '';
    const queue = key ? new AudioBufferQueue() : undefined;
    audioQueue = queue;
    const recording = createCapture(session, queue);
    renderState('listening');
    show(key ? 'Listening. Connecting to Deepgram in the background…' : 'Listening. Speak naturally.');
    pillDetail.textContent = key ? 'Connecting securely to Deepgram' : 'Speak naturally';
    await showOverlay();
    // Start the microphone immediately. Do not await the WebSocket first.
    const captureStarting = recording.start();
    if (!key) {
      await captureStarting;
      return;
    }
    connectionStartedAt = performance.now();
    const ws = new WebSocket(
      'wss://api.deepgram.com/v1/listen?model=nova-3&language=en&punctuate=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1',
      ['token', key],
    );
    socket = ws;
    connectionTimer = setTimeout(() => {
      if (isCurrent(session)) void fail('Deepgram connection timed out. Audio was not sent and has been discarded.');
    }, 15_000);
    ws.onopen = () => {
      if (!isCurrent(session)) return;
      clearTimeout(connectionTimer);
      try {
        queue!.open(bytes => sendAudio(ws, bytes));
      } catch (error) {
        void fail(error instanceof Error ? error.message : 'Could not send the microphone buffer.');
        return;
      }
      const elapsed = Math.round(performance.now() - connectionStartedAt);
      show(`Listening. Deepgram connected in ${elapsed} ms.`);
      pillDetail.textContent = 'Streaming live';
      maybeSendClose(session);
    };
    ws.onmessage = event => {
      if (!isCurrent(session)) return;
      try {
        const data = JSON.parse(String(event.data));
        if (data.type === 'Results') {
          const text = data.channel?.alternatives?.[0]?.transcript;
          if (typeof text !== 'string') return;
          if (data.is_final) {
            const start = typeof data.start === 'number' ? data.start : segments.size;
            if (text.trim()) segments.set(start, text.trim());
            preview = '';
          } else preview = text;
          displayText();
        } else if (data.type === 'Metadata') {
          metadataReceived = true;
          preview = '';
          displayText();
          void completeTranscript(session);
        } else if (data.type === 'Error') {
          void fail('Deepgram rejected the stream. Check the API key and account.');
        }
      } catch {
        void fail('Unexpected response from Deepgram. Received text remains below.');
      }
    };
    ws.onerror = () => {
      if (isCurrent(session)) void fail('Deepgram connection failed. Check network access and API credentials.');
    };
    ws.onclose = () => {
      if (isCurrent(session) && !metadataReceived) {
        void fail('Deepgram disconnected before completion. Received text remains below.');
      }
    };
    await captureStarting;
  } catch (error) {
    if (state !== 'error') await fail(error instanceof Error ? error.message : 'Could not start dictation.');
  }
}
async function stop() {
  if (state !== 'listening') return;
  const session = epoch;
  clearTimeout(noAudioTimer); noAudioTimer = undefined;
  stopRequested = true;
  renderState('finishing');
  show('Finishing microphone capture…');
  pillState.textContent = 'Finishing';
  pillDetail.textContent = 'Waiting for final words';
  try {
    await capture?.stop();
    if (!isCurrent(session)) return;
    captureStopped = true;
    level.value = 0; pillLevel.value = 0;
    if (!socket) {
      await cleanup();
      renderState('idle');
      show('Microphone released. Add a Deepgram key to transcribe.');
      await hideOverlay();
      return;
    }
    maybeSendClose(session);
  } catch (error) {
    if (isCurrent(session)) await fail(error instanceof Error ? error.message : 'Could not finish microphone capture.');
  }
}
async function cancel() {
  if (state === 'idle' && !capture && !socket) return;
  renderState('finishing');
  try {
    await cleanup();
    segments.clear(); preview = ''; displayText();
    stopRequested = false; captureStopped = false;
    renderState('idle');
    show('Cancelled. Audio and text discarded.');
    await hideOverlay();
  } catch {
    renderState('error');
    show('Audio cleanup failed. Quit Flow before starting another session.');
  }
}
async function copyTranscript() {
  requireNative();
  const text = transcriptText();
  if (!text) return;
  const result = await os.execCommand('wl-copy', { stdIn: text });
  show(result.exitCode === 0 ? 'Copied. The transcript remains on your clipboard.' : 'Copy failed. Check wl-clipboard.');
}
async function saveKey() {
  requireNative();
  const key = keyInput.value.trim();
  if (!key) { keyStatus.textContent = 'Paste a key first.'; return; }
  const result = await os.execCommand(
    "secret-tool store --label='Flow Deepgram API key' application flow credential deepgram",
    { stdIn: key + '\n' },
  );
  if (result.exitCode !== 0) {
    keyStatus.textContent = result.stdErr.trim() || 'GNOME Keyring is unavailable. The key will only be used for this session.';
    configuredKey = key;
    return;
  }
  configuredKey = key;
  keyInput.value = '';
  keyStatus.textContent = 'Saved in GNOME Keyring. The key never enters Flow logs or settings files.';
}
async function forgetKey() {
  requireNative();
  const result = await os.execCommand('secret-tool clear application flow credential deepgram');
  configuredKey = '';
  keyInput.value = '';
  keyStatus.textContent = result.exitCode === 0 ? 'Saved key removed.' : 'No saved key found.';
}
async function loadKey() {
  if (!native) return;
  try {
    const result = await os.execCommand('secret-tool lookup application flow credential deepgram');
    if (result.exitCode === 0 && result.stdOut.trim()) {
      configuredKey = result.stdOut.trim();
      keyStatus.textContent = 'A Deepgram key is available from GNOME Keyring.';
    }
  } catch {
    keyStatus.textContent = 'GNOME Keyring is unavailable. You can enter a key for this session.';
  }
}
async function checkDependencies() {
  requireNative();
  const result = await os.execCommand('for tool in parec base64 dd wl-copy ydotool secret-tool; do if command -v "$tool" >/dev/null 2>&1; then printf "%s: available\\n" "$tool"; else printf "%s: missing\\n" "$tool"; fi; done');
  show(result.stdOut || result.stdErr);
}
function handleLauncherCommand(command: LauncherCommand) {
  if (command === 'toggle') void (state === 'listening' ? stop() : start()).catch(report);
  else if (command === 'cancel') void cancel().catch(report);
  else void showSettings().catch(report);
}
async function quit() {
  if (exiting) return;
  exiting = true;
  try { await cancel(); await launcher?.stop(); } catch { /* Exit even if a helper is already gone. */ }
  if (native) await app.exit();
}
function report(error: unknown) {
  show(error instanceof Error ? error.message : 'Native operation failed.');
}
button('start').onclick = () => { void start().catch(report); };
button('stop').onclick = () => { void stop().catch(report); };
button('pill-stop').onclick = () => { void stop().catch(report); };
button('cancel').onclick = () => { void cancel().catch(report); };
button('pill-cancel').onclick = () => { void cancel().catch(report); };
button('copy').onclick = () => { void copyTranscript().catch(report); };
button('save-key').onclick = () => { void saveKey().catch(report); };
button('forget-key').onclick = () => { void forgetKey().catch(report); };
button('deps').onclick = () => { void checkDependencies().catch(report); };
button('hide').onclick = () => { void hideOverlay().catch(report); };
button('quit').onclick = () => { void quit().catch(report); };

window.addEventListener('beforeunload', () => { void cleanup().catch(() => {}); });

if ('NL_OS' in window) {
  init();
  native = true;
  launcher = new LauncherBridge();
  const initialCommand = parseLauncherCommand(window.NL_ARGS.find(argument => argument.startsWith('--flow-command=')));
  void launcher.start(handleLauncherCommand).then(() => {
    if (initialCommand) setTimeout(() => handleLauncherCommand(initialCommand), 150);
  }).catch(error => show(error instanceof Error ? error.message : 'Launcher channel unavailable.'));
  void events.on('trayMenuItemClicked', event => {
    const id = (event.detail as { id?: string } | undefined)?.id;
    if (id === 'toggle') void (state === 'listening' ? stop() : start()).catch(report);
    else if (id === 'cancel') void cancel().catch(report);
    else if (id === 'settings') void showSettings().catch(report);
    else if (id === 'quit') void quit().catch(report);
  });
  void events.on('windowClose', () => {
    // Closing the settings window hides Flow; only the tray Quit item exits.
    if (!exiting) void hideOverlay().catch(report);
  });
  updateTray();
  void loadKey();
} else {
  show('Browser preview only. Run pnpm probe inside your Ubuntu desktop session.');
}
