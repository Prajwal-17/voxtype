import { app, init, os, window as nativeWindow } from '@neutralinojs/lib';
import type { DictationState } from '@flow/core';
import './style.css';

const root = document.querySelector<HTMLElement>('#app')!;
root.innerHTML = `
<section id="panel">
  <h1>Flow</h1>
  <p>Desktop feasibility probe</p>
  <p>Test microphone access first. This is a diagnostic build, not the finished dictation app.</p>
  <label>Deepgram API key (optional)<input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="Leave blank to test microphone only"></label>
  <small>The key stays in memory. Audio goes to Deepgram only when a key is entered. No recordings are saved.</small>
  <div class="actions"><button id="start">Test microphone</button><button id="stop" disabled>Finish</button><button id="cancel" disabled>Cancel</button></div>
  <div class="actions"><button id="focus">Test overlay focus</button><button id="paste">Test paste</button><button id="deps">Check dependencies</button><button id="quit">Quit</button></div>
  <output id="status" role="status">Ready. Run inside Neutralino on your Ubuntu desktop.</output>
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
let stream: MediaStream | undefined;
let recorder: MediaRecorder | undefined;
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
function cleanup() {
  epoch++;
  clearTimeout(watchdog);
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  stream?.getTracks().forEach(track => track.stop());
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  recorder = undefined; stream = undefined; socket = undefined;
}
function fail(message: string) { cleanup(); renderState('error'); show(message); }
function finish() { cleanup(); renderState('idle'); show('Session complete. Microphone and connection released.'); }
function displayText() {
  const final = [...segments.entries()].sort(([a], [b]) => a - b).map(([, text]) => text).join(' ');
  transcript.textContent = [final, preview].filter(Boolean).join(' ');
}
async function start() {
  if (state !== 'idle' && state !== 'error') return;
  cleanup(); const session = epoch;
  segments.clear(); preview = ''; displayText();
  renderState('connecting'); show('Requesting microphone access…');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone API unavailable in this webview.');
    const captured = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    if (session !== epoch) { captured.getTracks().forEach(t => t.stop()); return; }
    stream = captured;
    const key = keyInput.value.trim(); keyInput.value = '';
    if (!key) {
      renderState('listening'); show('PASS: microphone opened. Finish or Cancel releases it. Automatic stop after 60 seconds.');
      watchdog = setTimeout(finish, 60_000); return;
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    if (!mimeType) throw new Error('No supported recording container found.');
    const ws = new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-3&language=en&punctuate=true&interim_results=true', ['token', key]);
    socket = ws;
    watchdog = setTimeout(() => fail('Deepgram connection timed out.'), 15_000);
    ws.onopen = () => {
      if (session !== epoch) return;
      clearTimeout(watchdog);
      const recording = new MediaRecorder(captured, { mimeType }); recorder = recording;
      recording.ondataavailable = event => {
        if (session === epoch && event.data.size && ws.readyState === WebSocket.OPEN) ws.send(event.data);
      };
      recording.onerror = () => { if (session === epoch) fail('Audio recording failed.'); };
      recording.onstop = () => {
        if (session !== epoch) return;
        captured.getTracks().forEach(t => t.stop());
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
          watchdog = setTimeout(() => fail('Final transcript timed out. Received text remains below.'), 10_000);
        } else fail('Connection closed before final audio could be sent.');
      };
      recording.start(250); renderState('listening'); show('Listening through Deepgram. Finish to flush the final audio.');
      watchdog = setTimeout(stop, 60_000);
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
        } else if (data.type === 'Metadata' && state === 'finishing') { preview = ''; displayText(); finish(); }
        else if (data.type === 'Error') fail('Deepgram reported an error. Check the key and account.');
      } catch { fail('Unexpected Deepgram response.'); }
    };
    ws.onerror = () => { if (session === epoch) fail('Deepgram connection failed. Check network access and API credentials.'); };
    ws.onclose = () => { if (session === epoch) fail('Connection closed before completion. Received text remains below.'); };
  } catch (error) {
    if (session === epoch) fail(error instanceof Error ? `${error.name}: ${error.message}` : 'Microphone test failed.');
  }
}
function stop() {
  if (state !== 'listening') return;
  clearTimeout(watchdog);
  if (!recorder) { finish(); return; }
  renderState('finishing'); show('Finishing…'); recorder.stop();
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
button('stop').onclick = stop;
button('cancel').onclick = () => { cleanup(); segments.clear(); preview = ''; displayText(); renderState('idle'); show('Cancelled. Audio and text discarded.'); };
button('focus').onclick = () => { void focusProbe().catch(report); };
button('restore').onclick = () => { void restore().catch(report); };
button('paste').onclick = () => { void pasteProbe().catch(report); };
button('deps').onclick = () => {
  try {
    requireNative();
    void os.execCommand('for tool in wl-copy ydotool secret-tool; do if command -v "$tool" >/dev/null 2>&1; then printf "%s: available\\n" "$tool"; else printf "%s: missing\\n" "$tool"; fi; done')
      .then(result => show(result.stdOut)).catch(report);
  } catch (error) { report(error); }
};
button('quit').onclick = () => { cleanup(); clearTimeout(pendingWindowTimer); if (native) void app.exit(); };
window.addEventListener('beforeunload', cleanup);
if ('NL_OS' in window) { init(); native = true; }
else show('Browser preview only. Browser microphone success does not validate the Neutralino webview.');
