import { app, events, init, os, window as nativeWindow } from '@neutralinojs/lib';
import type { DictationState } from '@flow/core';
import { ParecCapture, type ProcessEvent } from './audio/parec.ts';
import { pcmLevel } from './audio/pcm.ts';
import captureScript from './audio/capture.sh?raw';
import './style.css';

const root = document.querySelector<HTMLElement>('#app')!;
root.innerHTML = `
<section id="panel">
  <h1>Flow</h1>
  <p>Desktop feasibility probe</p>
  <p>Test Linux microphone capture first. This is a diagnostic build, not the finished dictation app.</p>
  <label>Deepgram API key (optional)<input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="Leave blank to test microphone only"></label>
  <small>The key stays in memory. Audio goes to Deepgram only when a key is entered. No recordings are saved.</small>
  <div class="actions"><button id="start">Test microphone</button><button id="stop" disabled>Finish</button><button id="cancel" disabled>Cancel</button></div>
  <div class="actions"><button id="focus">Test overlay focus</button><button id="paste">Test paste</button><button id="deps">Check dependencies</button><button id="quit">Quit</button></div>
  <output id="status" role="status">Ready. Run inside Neutralino on your Ubuntu desktop.</output>
  <label>Microphone level <meter id="level" min="0" max="1" value="0"></meter></label>
  <small>Uses your default Ubuntu input through parec. No browser permission prompt is needed.</small>
  <output id="transcript"></output>
  <p>Overlay test: the window hides for 5 seconds. Focus a browser text field and keep typing when the overlay reappears. The panel returns after 15 seconds.</p>
  <p>Paste test: focus a disposable text field during the 5-second delay. This replaces your clipboard with “Flow paste test”.</p>
</section>
<section id="pill"><span class="dot"></span><span>Flow · focus test</span><button id="restore">Return</button></section>`;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const transcript = document.querySelector<HTMLOutputElement>('#transcript')!;
const keyInput = document.querySelector<HTMLInputElement>('#key')!;
const button = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;
let native = false;
let state: DictationState = 'idle';
let epoch = 0;
let capture: ParecCapture | undefined;
const level = document.querySelector<HTMLMeterElement>('#level')!;
let socket: WebSocket | undefined;
let watchdog: ReturnType<typeof setTimeout> | undefined;
let pendingWindowTimer: ReturnType<typeof setTimeout> | undefined;
let preview = '';
const segments = new Map<number, string>();

function show(message: string) { status.textContent = message; }
function renderState(next: DictationState) {
  state = next;
  const busy = next !== 'idle' && next !== 'error';
  button('start').disabled = busy;
  button('stop').disabled = next !== 'listening';
  button('cancel').disabled = !busy;
  for (const id of ['focus', 'paste', 'deps']) button(id).disabled = busy;
}
async function cleanup() {
  epoch++;
  clearTimeout(watchdog);
  const oldCapture = capture; capture = undefined;
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  socket = undefined; level.value = 0;
  await oldCapture?.stop(true);
}
async function fail(message: string) {
  renderState('finishing');
  const release = cleanup(); const session = epoch;
  try { await release; } catch { /* Original failure already explains why capture ended. */ }
  if (session !== epoch) return;
  renderState('error'); show(message);
}
async function finish() {
  try { await cleanup(); renderState('idle'); show('Session complete. Microphone and connection released.'); }
  catch { renderState('error'); show('Audio process cleanup failed. Quit Flow before starting another test.'); }
}
function displayText() {
  const final = [...segments.entries()].sort(([a], [b]) => a - b).map(([, text]) => text).join(' ');
  transcript.textContent = [final, preview].filter(Boolean).join(' ');
}
async function start() {
  if (state !== 'idle' && state !== 'error') return;
  renderState('connecting');
  const release = cleanup(); const session = epoch;
  segments.clear(); preview = ''; displayText();
  show('Starting Linux microphone capture…');
  try {
    await release;
    if (session !== epoch) return;
    requireNative();
    const key = keyInput.value.trim(); keyInput.value = '';
    const beginCapture = async (ws?: WebSocket) => {
      if (session !== epoch) return;
      let receivedAudio = false;
      let lastLevel = 0;
      const recording = new ParecCapture({
        listen: async handler => {
          const listener = (event: CustomEvent<ProcessEvent>) => handler(event.detail);
          await events.on('spawnedProcess', listener);
          return async () => { await events.off('spawnedProcess', listener); };
        },
        spawn: command => os.spawnProcess(command),
        update: (id, action, data) => os.updateSpawnedProcess(id, action, data),
      }, captureScript, bytes => {
        if (session !== epoch) return;
        if (ws) {
          if (ws.readyState !== WebSocket.OPEN) throw new Error('Deepgram connection closed while recording.');
          if (ws.bufferedAmount > 256_000) throw new Error('Network is too slow for live audio. Please retry.');
          ws.send(new Uint8Array(bytes));
        }
        if (!receivedAudio && state === 'connecting') {
          receivedAudio = true;
          clearTimeout(watchdog);
          renderState('listening');
          show(ws ? 'Listening through Deepgram. Finish to send the final audio.' : 'PASS: Linux microphone audio received. Speak to test the level meter. Automatic stop after 60 seconds.');
          watchdog = setTimeout(() => { void stop(); }, 60_000);
        }
        if (performance.now() - lastLevel >= 100) { level.value = pcmLevel(bytes); lastLevel = performance.now(); }
      }, error => { if (session === epoch) void fail(error.message); });
      capture = recording;
      watchdog = setTimeout(() => { if (session === epoch) void fail('No microphone audio received. Install pulseaudio-utils and check Ubuntu Sound input.'); }, 10_000);
      await recording.start();
    };
    if (!key) { await beginCapture(); return; }
    const ws = new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-3&language=en&punctuate=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1', ['token', key]);
    socket = ws;
    show('Connecting to Deepgram…');
    watchdog = setTimeout(() => { if (session === epoch) void fail('Deepgram connection timed out.'); }, 15_000);
    ws.onopen = () => {
      if (session !== epoch) return;
      clearTimeout(watchdog);
      void beginCapture(ws).catch(() => { if (session === epoch) void fail('Could not start audio capture.'); });
    };
    ws.onmessage = event => {
      if (session !== epoch) return;
      try {
        const data = JSON.parse(String(event.data));
        if (data.type === 'Results') {
          const text = data.channel?.alternatives?.[0]?.transcript;
          if (typeof text !== 'string') return;
          if (data.is_final && typeof data.start === 'number') { if (text) segments.set(data.start, text); preview = ''; }
          else preview = text;
          displayText();
        } else if (data.type === 'Metadata' && state === 'finishing') { preview = ''; displayText(); void finish(); }
        else if (data.type === 'Error') void fail('Deepgram reported an error. Check the key and account.');
      } catch { void fail('Unexpected Deepgram response.'); }
    };
    ws.onerror = () => { if (session === epoch) void fail('Deepgram connection failed. Check network access and API credentials.'); };
    ws.onclose = () => { if (session === epoch) void fail('Connection closed before completion. Received text remains below.'); };
  } catch (error) {
    if (session === epoch) void fail(error instanceof Error ? error.message : 'Microphone test failed.');
  }
}
async function stop() {
  if (state !== 'listening') return;
  const session = epoch;
  clearTimeout(watchdog);
  renderState('finishing'); show('Finishing…');
  try {
    // Keep accepting final PCM until the process exits and its output is drained.
    await capture?.stop();
    if (session !== epoch) return;
    level.value = 0;
    if (!socket) { await finish(); return; }
    if (socket.readyState !== WebSocket.OPEN) throw new Error('Connection closed before final audio could be sent.');
    socket.send(JSON.stringify({ type: 'CloseStream' }));
    watchdog = setTimeout(() => { if (session === epoch) void fail('Final transcript timed out. Received text remains below.'); }, 10_000);
  } catch (error) { if (session === epoch) void fail(error instanceof Error ? error.message : 'Could not finish capture.'); }
}
async function cancel() {
  renderState('finishing');
  try {
    await cleanup(); segments.clear(); preview = ''; displayText();
    renderState('idle'); show('Cancelled. Audio and text discarded.');
  } catch { renderState('error'); show('Audio process cleanup failed. Quit Flow before starting another test.'); }
}
async function quit() {
  clearTimeout(pendingWindowTimer);
  await cancel();
  if (native) await app.exit();
}
function requireNative() { if (!native) throw new Error('Run pnpm probe inside your Ubuntu graphical session.'); }
async function restore() {
  clearTimeout(pendingWindowTimer);
  document.body.classList.remove('overlay');
  await nativeWindow.setAlwaysOnTop(false); await nativeWindow.setBorderless(false);
  await nativeWindow.setSize({ width: 640, height: 700 }); await nativeWindow.show();
}
async function focusProbe() {
  requireNative();
  await nativeWindow.hide();
  document.body.classList.add('overlay');
  await nativeWindow.setBorderless(true); await nativeWindow.setSize({ width: 380, height: 90 });
  await nativeWindow.setAlwaysOnTop(true);
  pendingWindowTimer = setTimeout(() => {
    void nativeWindow.show().then(() => {
      pendingWindowTimer = setTimeout(() => { void restore().catch(report); }, 15_000);
    }).catch(report);
  }, 5_000);
}
async function pasteProbe() {
  requireNative();
  show('Paste test armed. Focus a disposable text field now.'); await nativeWindow.hide();
  pendingWindowTimer = setTimeout(() => {
    // All command text is fixed; no user-provided data enters the shell.
    void os.execCommand("printf '%s' 'Flow paste test' | wl-copy && ydotool key 29:1 47:1 47:0 29:0")
      .then(result => show(result.exitCode === 0 ? 'Paste command completed. Verify the target field manually.' : 'Paste failed. Check wl-copy and ydotool daemon access.'))
      .catch(report).finally(() => {
        pendingWindowTimer = setTimeout(() => { void nativeWindow.show().catch(report); }, 5_000);
      });
  }, 5_000);
}
function report(error: unknown) { show(error instanceof Error ? error.message : 'Native operation failed. See the feasibility guide.'); }
button('start').onclick = () => { void start(); };
button('stop').onclick = () => { void stop(); };
button('cancel').onclick = () => { void cancel(); };
button('focus').onclick = () => { void focusProbe().catch(report); };
button('restore').onclick = () => { void restore().catch(report); };
button('paste').onclick = () => { void pasteProbe().catch(report); };
button('deps').onclick = () => {
  try {
    requireNative();
    void os.execCommand('for tool in parec base64 stdbuf wl-copy ydotool secret-tool; do if command -v "$tool" >/dev/null 2>&1; then printf "%s: available\\n" "$tool"; else printf "%s: missing\\n" "$tool"; fi; done')
      .then(result => show(result.stdOut)).catch(report);
  } catch (error) { report(error); }
};
button('quit').onclick = () => { void quit(); };
window.addEventListener('beforeunload', () => { void cleanup().catch(() => {}); });
if ('NL_OS' in window) {
  init(); native = true;
  void events.on('windowClose', () => { void quit(); });
} else show('Browser preview only. Linux microphone capture requires pnpm probe in your Ubuntu desktop session.');
