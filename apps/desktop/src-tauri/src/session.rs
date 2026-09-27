//! One owner per recording. UI, tray, and shortcuts all send Stop/Cancel to the same task.
//! Only confirmed complete transcripts can reach automatic paste.
use crate::{audio, cleanup, desktop, model::*, publish, storage, AppState};
use futures_util::{FutureExt, SinkExt, StreamExt};
use std::{
    collections::VecDeque,
    future::Future,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Message},
};

#[derive(Clone, Copy)]
pub enum Control {
    Stop,
    Cancel,
}

pub async fn signal(app: &AppHandle, control: Control) -> Result<(), String> {
    let sender = app
        .state::<AppState>()
        .control
        .lock()
        .map_err(|_| "Session unavailable.")?
        .clone();
    if let Some(sender) = sender {
        sender
            .send(control)
            .await
            .map_err(|_| "The recording has already finished.".into())
    } else {
        Ok(())
    }
}
pub async fn toggle(app: AppHandle) -> Result<(), String> {
    let active = app
        .state::<AppState>()
        .control
        .lock()
        .map_err(|_| "Session unavailable.")?
        .is_some();
    if active {
        signal(&app, Control::Stop).await
    } else {
        start(app, false, true).await
    }
}

pub async fn start(app: AppHandle, test: bool, external: bool) -> Result<(), String> {
    let settings = storage::settings(&app)?;
    let (tx, mut rx) = mpsc::channel(8);
    {
        let state = app.state::<AppState>();
        let mut control = state.control.lock().map_err(|_| "Session unavailable.")?;
        if control.is_some() {
            return Err("A dictation is already running.".into());
        }
        *control = Some(tx);
    }
    // Open capture before window work or network/keyring waits.
    let capture = match audio::start(&settings.microphone) {
        Ok(capture) => capture,
        Err(error) => {
            if let Ok(mut control) = app.state::<AppState>().control.lock() {
                *control = None;
            }
            return Err(error);
        }
    };
    let mut snapshot = Snapshot {
        session_id: uuid::Uuid::new_v4().to_string(),
        phase: Phase::Listening,
        is_test: test,
        ..Snapshot::default()
    };
    publish(&app, &snapshot);
    if external {
        show_overlay(&app);
    }
    tauri::async_runtime::spawn(async move {
        let target = if external {
            desktop::focused_window().await
        } else {
            None
        };
        // Third-party runtime failures must never strand the app in a recording state.
        let result = std::panic::AssertUnwindSafe(run(
            &app,
            &settings,
            &mut snapshot,
            &mut rx,
            capture,
            test,
        ))
        .catch_unwind()
        .await
        .unwrap_or_else(|_| {
            Err(
                "The recording stopped unexpectedly. Your received text is kept; please try again."
                    .into(),
            )
        });
        let cancelled = drain_cancel(&mut rx);
        let result = if cancelled { Ok(false) } else { result };
        match result {
            Ok(false) => {
                snapshot = Snapshot {
                    session_id: snapshot.session_id.clone(),
                    ..Snapshot::default()
                };
            }
            Ok(true) if test => {
                snapshot.phase = Phase::Done;
                snapshot.message.clear();
            }
            Ok(true) => {
                snapshot.phase = Phase::Done;
                snapshot.interim.clear();
                if snapshot.text.trim().is_empty() {
                    snapshot.message =
                        "No speech detected. Check your microphone and try again.".into();
                } else {
                    // In-app recordings intentionally stay in VoxType. External recordings paste into the focused application.
                    snapshot.delivery = "saved".into();
                    snapshot.message = "Your transcript is ready.".into();
                    if external {
                        if let Some(w) = app.get_webview_window("overlay") {
                            let _ = w.hide();
                        }
                        match desktop::copy(&snapshot.text).await {
                            Ok(()) => {
                                snapshot.delivery = "copied".into();
                                snapshot.message = "Copied to your clipboard.".into();
                                if settings.auto_paste {
                                    // Let the compositor process hiding the overlay and modifier-key release.
                                    tokio::time::sleep(Duration::from_millis(180)).await;
                                    let delivery = if drain_cancel(&mut rx) {
                                        Err("Insertion cancelled. Text remains on the clipboard."
                                            .into())
                                    } else {
                                        desktop::paste(target.as_deref()).await
                                    };
                                    match delivery {
                                        Ok(()) => {
                                            snapshot.delivery = "pasted".into();
                                            snapshot.message =
                                                "Paste sent to the focused app.".into();
                                        }
                                        Err(e) => {
                                            snapshot.message = e;
                                            show_overlay(&app);
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                snapshot.message = e;
                                show_overlay(&app);
                            }
                        }
                    }
                    if settings.keep_history {
                        let item = HistoryItem {
                            id: snapshot.session_id.clone(),
                            text: snapshot.text.clone(),
                            original_text: snapshot.original_text.clone(),
                            created_at: now_ms(),
                            duration_ms: snapshot.elapsed_ms,
                            words: snapshot.text.split_whitespace().count(),
                            delivery: snapshot.delivery.clone(),
                        };
                        if let Err(e) = storage::append_history(&app, item) {
                            snapshot.message =
                                format!("{} History could not be saved: {e}", snapshot.message);
                        }
                    }
                }
            }
            Err(e) => {
                snapshot.phase = Phase::Error;
                snapshot.message = e;
            }
        }
        if !snapshot.cleanup_warning.is_empty() {
            snapshot.message = format!("{} {}", snapshot.message, snapshot.cleanup_warning);
            let _ = app.emit("app-error", &snapshot.cleanup_warning);
        }
        snapshot.level = 0.0;
        snapshot.speech_active = false;
        // Release the recording lock before notifying clients that recording has ended.
        if let Ok(mut control) = app.state::<AppState>().control.lock() {
            *control = None;
        }
        publish(&app, &snapshot);
        let id = snapshot.session_id.clone();
        if snapshot.phase == Phase::Idle {
            if let Some(w) = app.get_webview_window("overlay") {
                let _ = w.hide();
            }
        } else if snapshot.phase == Phase::Done
            && (snapshot.delivery == "pasted" || snapshot.text.is_empty())
        {
            tokio::time::sleep(Duration::from_millis(1500)).await;
            let current = app
                .state::<AppState>()
                .snapshot
                .lock()
                .map(|s| s.session_id == id && s.phase == Phase::Done)
                .unwrap_or(false);
            if current {
                if let Some(w) = app.get_webview_window("overlay") {
                    let _ = w.hide();
                }
            }
        }
    });
    Ok(())
}

fn overlay_position(
    area_position: tauri::PhysicalPosition<i32>,
    area_size: tauri::PhysicalSize<u32>,
    overlay_size: tauri::PhysicalSize<u32>,
    gap: u32,
) -> tauri::PhysicalPosition<i32> {
    let x = area_position.x + (area_size.width.saturating_sub(overlay_size.width) / 2) as i32;
    let y = area_position.y
        + area_size
            .height
            .saturating_sub(overlay_size.height)
            .saturating_sub(gap) as i32;
    tauri::PhysicalPosition::new(x, y)
}

fn position_overlay(w: &tauri::WebviewWindow) {
    let monitor = w
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| w.primary_monitor().ok().flatten());
    if let (Some(monitor), Ok(size)) = (monitor, w.outer_size()) {
        let area = monitor.work_area();
        let gap = 0;
        let _ = w.set_position(overlay_position(area.position, area.size, size, gap));
    }
}

fn show_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.set_focusable(false);
        position_overlay(&w);
        let _ = w.show();
        // GNOME can override the first position when mapping a new window.
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(80)).await;
            position_overlay(&w);
        });
    }
}

pub fn listen_url(settings: &Settings) -> Result<url::Url, String> {
    let mut url = url::Url::parse("wss://api.deepgram.com/v1/listen").map_err(|e| e.to_string())?;
    {
        let mut params = url.query_pairs_mut();
        params.extend_pairs([
            ("model", "nova-3"),
            ("language", settings.language.as_str()),
            ("encoding", "linear16"),
            ("sample_rate", "16000"),
            ("channels", "1"),
            ("interim_results", "true"),
            ("smart_format", "true"),
            ("punctuate", "true"),
            ("endpointing", "300"),
        ]);
        for term in &settings.vocabulary {
            params.append_pair("keyterm", term);
        }
    }
    Ok(url)
}

#[derive(Default)]
pub struct Transcript {
    pub text: String,
    pub interim: String,
    last_end: f64,
}
impl Transcript {
    pub fn accept(&mut self, value: &serde_json::Value) {
        if value["type"] != "Results" {
            return;
        }
        let text = value["channel"]["alternatives"][0]["transcript"]
            .as_str()
            .unwrap_or_default()
            .trim();
        if value["is_final"].as_bool().unwrap_or(false) {
            let end =
                value["start"].as_f64().unwrap_or(0.0) + value["duration"].as_f64().unwrap_or(0.0);
            // Deepgram final segments append once. Never deduplicate by text: repeated words are legitimate speech.
            if !text.is_empty() && end > self.last_end {
                if !self.text.is_empty() {
                    self.text.push(' ');
                }
                self.text.push_str(text);
                self.last_end = end;
            }
            self.interim.clear();
        } else {
            self.interim = text.into();
        }
    }
}

fn drain_cancel(control: &mut mpsc::Receiver<Control>) -> bool {
    let mut cancelled = false;
    while let Ok(command) = control.try_recv() {
        if matches!(command, Control::Cancel) {
            cancelled = true;
        }
    }
    cancelled
}

async fn run(
    app: &AppHandle,
    settings: &Settings,
    snapshot: &mut Snapshot,
    control: &mut mpsc::Receiver<Control>,
    mut capture: audio::Capture,
    test: bool,
) -> Result<bool, String> {
    let started = Instant::now();
    if test {
        snapshot.phase = Phase::Listening;
        publish(app, snapshot);
        loop {
            tokio::select! {
                command = control.recv() => return Ok(matches!(command, Some(Control::Stop))),
                frame = capture.frames.recv() => {
                    let bytes = frame.ok_or("The microphone stopped unexpectedly.")??;
                    snapshot.level = audio::level(&bytes);
                    snapshot.elapsed_ms = started.elapsed().as_millis() as u64;
                    publish(app, snapshot);
                },
                _ = tokio::time::sleep(Duration::from_secs(5)) => return Err("No audio arrived. Check the selected microphone.".into()),
                _ = tokio::time::sleep_until(tokio::time::Instant::from_std(started + Duration::from_secs(30))) => return Ok(true),
            }
        }
    }
    let prepared = prepare_stream(
        snapshot,
        control,
        &mut capture,
        started,
        connect(settings),
        audio::SpeechGate::new(settings.voice_detection),
        |s| publish(app, s),
    )
    .await?;
    let Some(prepared) = prepared else {
        return Ok(false);
    };
    let completed = pump(snapshot, control, capture, prepared, started, |s| {
        publish(app, s)
    })
    .await?;
    if !completed || !settings.cleanup_enabled || snapshot.text.trim().is_empty() {
        return Ok(completed);
    }
    if drain_cancel(control) {
        return Ok(false);
    }
    snapshot.phase = Phase::Cleaning;
    snapshot.level = 0.0;
    snapshot.interim.clear();
    publish(app, snapshot);
    let original = snapshot.text.clone();
    let cleaning = cleanup::clean(&original);
    tokio::pin!(cleaning);
    loop {
        tokio::select! {
            biased;
            command = control.recv() => {
                match command {
                    Some(Control::Stop) => continue,
                    Some(Control::Cancel) | None => return Ok(false),
                }
            }
            result = &mut cleaning => {
                match result {
                    Ok(text) => {
                        snapshot.original_text = Some(original.clone());
                        snapshot.text = text;
                    }
                    Err(error) => {
                        snapshot.cleanup_warning = format!("{error} Used your original transcript.");
                    }
                }
                return Ok(true);
            }
        }
    }
}

type SpeechSocket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn connect(settings: &Settings) -> Result<SpeechSocket, String> {
    let key = tokio::time::timeout(
        Duration::from_secs(15),
        tokio::task::spawn_blocking(storage::key),
    )
    .await
    .map_err(|_| "Keyring timed out. Unlock your login keyring and try again.")?
    .map_err(|_| "Keyring request failed.")??
    .ok_or("Add your Deepgram API key in Settings before dictating.")?;
    let mut request = listen_url(settings)?
        .as_str()
        .into_client_request()
        .map_err(|_| "Could not create a Deepgram request.")?;
    request.headers_mut().insert(
        "Authorization",
        format!("Token {key}")
            .parse()
            .map_err(|_| "The saved API key is invalid.")?,
    );
    drop(key);
    let (socket, _) = tokio::time::timeout(Duration::from_secs(10), connect_async(request))
        .await
        .map_err(|_| "Deepgram connection timed out. No text was inserted; try again.")?
        .map_err(|error| match error {
            tokio_tungstenite::tungstenite::Error::Http(response)
                if response.status().as_u16() == 401 || response.status().as_u16() == 403 =>
            {
                "Deepgram rejected the API key. Replace it in Settings."
            }
            _ => {
                "Could not connect to Deepgram. Check your connection, API key, and account credit."
            }
        })?;
    Ok(socket)
}

// The backlog holds at most 32 seconds of transmitted PCM. Capture and writer
// channels have separate small bounds. Never persist raw audio or lose queued speech silently.
#[derive(Default)]
struct AudioBuffer {
    frames: VecDeque<Vec<u8>>,
    bytes: usize,
}
impl AudioBuffer {
    fn push(&mut self, bytes: Vec<u8>) -> Result<(), String> {
        if self.bytes + bytes.len() > 32 * audio::PCM_BYTES_PER_SECOND {
            return Err(
                "Audio buffering reached its limit. Check your connection and try again.".into(),
            );
        }
        self.bytes += bytes.len();
        self.frames.push_back(bytes);
        Ok(())
    }
    fn pop(&mut self) -> Option<Vec<u8>> {
        let bytes = self.frames.pop_front()?;
        self.bytes -= bytes.len();
        Some(bytes)
    }
}
struct PreparedStream {
    socket: SpeechSocket,
    buffer: AudioBuffer,
    stopping: bool,
    gate: audio::SpeechGate,
}

async fn prepare_stream(
    snapshot: &mut Snapshot,
    control: &mut mpsc::Receiver<Control>,
    capture: &mut audio::Capture,
    started: Instant,
    connection: impl Future<Output = Result<SpeechSocket, String>>,
    mut gate: audio::SpeechGate,
    publish: impl Fn(&Snapshot),
) -> Result<Option<PreparedStream>, String> {
    tokio::pin!(connection);
    let mut buffer = AudioBuffer::default();
    let mut stopping = false;
    let mut audio_done = false;
    let mut last_audio = tokio::time::Instant::now();
    loop {
        tokio::select! {
            result = &mut connection => return Ok(Some(PreparedStream { socket: result?, buffer, stopping, gate })),
            command = control.recv() => match command {
                Some(Control::Stop) => { stopping = true; capture.stop(); snapshot.phase = Phase::Finishing; snapshot.level = 0.0; snapshot.speech_active = false; snapshot.elapsed_ms = started.elapsed().as_millis() as u64; publish(snapshot); },
                _ => return Ok(None),
            },
            frame = capture.frames.recv(), if !audio_done => match frame {
                Some(Ok(bytes)) => {
                    last_audio = tokio::time::Instant::now();
                    if !stopping { snapshot.level = audio::level(&bytes); snapshot.elapsed_ms = started.elapsed().as_millis() as u64; }
                    for packet in gate.push(bytes) { buffer.push(packet)?; }
                    snapshot.speech_active = !stopping && gate.speaking;
                    publish(snapshot);
                },
                Some(Err(e)) => return Err(e),
                None if stopping => {
                    for packet in gate.finish() { buffer.push(packet)?; }
                    audio_done = true;
                },
                None => return Err("The microphone stopped unexpectedly.".into()),
            },
            _ = tokio::time::sleep_until(last_audio + Duration::from_secs(5)), if !audio_done => return Err("No audio arrived. Check the selected microphone.".into()),
        }
    }
}

// Separate the wire protocol from desktop side effects so finalization is testable without a microphone or API key.
async fn pump(
    snapshot: &mut Snapshot,
    control: &mut mpsc::Receiver<Control>,
    mut capture: audio::Capture,
    prepared: PreparedStream,
    started: Instant,
    publish: impl Fn(&Snapshot),
) -> Result<bool, String> {
    let PreparedStream {
        socket,
        mut buffer,
        mut stopping,
        mut gate,
    } = prepared;
    let (mut sink, mut incoming) = socket.split();
    // One bounded writer owns the sink. Its future is pinned across select! polls:
    // cancellation of another branch must never cancel a partially written frame.
    let (outgoing, mut packets) = mpsc::channel::<Option<Vec<u8>>>(8);
    let writer = async move {
        let mut next_send = tokio::time::Instant::now();
        loop {
            let packet = match tokio::time::timeout(Duration::from_secs(4), packets.recv()).await {
                Ok(Some(packet)) => packet,
                Ok(None) => {
                    return Err::<(), String>("The audio sender stopped unexpectedly.".into())
                }
                Err(_) => {
                    tokio::time::timeout(Duration::from_secs(15), sink.send(Message::Text("{\"type\":\"KeepAlive\"}".into())))
                        .await.map_err(|_| "The connection stopped responding. Your received text is available to copy.")?
                        .map_err(|_| "Deepgram disconnected. Your received text is available to copy.")?;
                    continue;
                }
            };
            let Some(bytes) = packet else {
                tokio::time::timeout(
                    Duration::from_secs(15),
                    sink.send(Message::Text("{\"type\":\"CloseStream\"}".into())),
                )
                .await
                .map_err(|_| {
                    "Could not finish sending audio. Your received text is available to copy."
                })?
                .map_err(|_| "Deepgram disconnected before finalization.")?;
                return Ok(());
            };
            tokio::time::sleep_until(next_send).await;
            let sent_at = tokio::time::Instant::now();
            let audio_duration = Duration::from_secs_f64(
                bytes.len() as f64 / (audio::PCM_BYTES_PER_SECOND as f64 * 1.25),
            );
            tokio::time::timeout(Duration::from_secs(15), sink.send(Message::Binary(bytes.into())))
                .await.map_err(|_| "Audio upload stalled. Your received text is available to copy; nothing was inserted.")?
                .map_err(|_| "Deepgram disconnected. Your received text is available to copy.")?;
            // Account for write time. Adding a fresh delay after each write causes
            // cumulative lag; a stalled write must not create an unbounded burst.
            next_send = sent_at + audio_duration;
        }
    };
    tokio::pin!(writer);
    snapshot.phase = if stopping {
        Phase::Finishing
    } else {
        Phase::Listening
    };
    publish(snapshot);
    let mut transcript = Transcript::default();
    let mut audio_done = false;
    let mut close_queued = false;
    let mut close_sent = false;
    let mut final_deadline = tokio::time::Instant::now() + Duration::from_secs(3600);
    let mut last_audio = tokio::time::Instant::now();
    let mut meter_updated = Instant::now();
    let session_deadline = tokio::time::Instant::from_std(started + Duration::from_secs(600));
    loop {
        tokio::select! {
            // User actions and write completion win over continuously ready input.
            biased;
            command = control.recv() => match command {
                Some(Control::Stop) if !stopping => {
                    stopping = true; capture.stop(); snapshot.phase = Phase::Finishing;
                    snapshot.level = 0.0; snapshot.speech_active = false;
                    snapshot.elapsed_ms = started.elapsed().as_millis() as u64;
                    publish(snapshot);
                },
                Some(Control::Stop) => {},
                _ => return Ok(false),
            },
            result = &mut writer, if !close_sent => {
                result?;
                close_sent = true;
                final_deadline = tokio::time::Instant::now() + Duration::from_secs(15);
            },
            incoming = incoming.next() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    let value: serde_json::Value = serde_json::from_str(&text).map_err(|_| "Deepgram returned an unreadable response.")?;
                    if value["type"] == "Error" { return Err("Deepgram could not process this recording. Check language, account credit, and API key.".into()); }
                    if value["type"] == "Metadata" && close_sent { return Ok(true); }
                    transcript.accept(&value);
                    snapshot.text = transcript.text.clone(); snapshot.interim = transcript.interim.clone();
                    publish(snapshot);
                },
                // Tungstenite automatically queues Pong; the independent writer
                // flushes it on the next audio packet or idle KeepAlive.
                Some(Ok(Message::Ping(_))) => {},
                Some(Ok(Message::Close(_))) | None => return Err("The connection closed before final confirmation. Copy the received text manually.".into()),
                Some(Err(_)) => return Err("Connection interrupted. Your received text is available to copy.".into()),
                _ => {},
            },
            permit = outgoing.reserve(), if !close_queued && (!buffer.frames.is_empty() || audio_done) => {
                let permit = permit.map_err(|_| "The audio sender stopped unexpectedly.")?;
                if let Some(bytes) = buffer.pop() { permit.send(Some(bytes)); }
                else { close_queued = true; permit.send(None); }
            },
            frame = capture.frames.recv(), if !audio_done => {
                match frame {
                    Some(Ok(bytes)) => {
                        last_audio = tokio::time::Instant::now();
                        if !stopping { snapshot.level = audio::level(&bytes); snapshot.elapsed_ms = started.elapsed().as_millis() as u64; }
                        for packet in gate.push(bytes) { buffer.push(packet)?; }
                        snapshot.speech_active = !stopping && gate.speaking;
                        if meter_updated.elapsed() >= Duration::from_millis(60) { publish(snapshot); meter_updated = Instant::now(); }
                    },
                    Some(Err(e)) => return Err(e),
                    None if stopping => {
                        for packet in gate.finish() { buffer.push(packet)?; }
                        audio_done = true;
                    },
                    None => return Err("The microphone stream ended unexpectedly. Your received text has been kept.".into()),
                }
            },
            _ = tokio::time::sleep_until(final_deadline), if close_sent => return Err("Final transcription timed out. Your received text is available to copy.".into()),
            _ = tokio::time::sleep_until(last_audio + Duration::from_secs(5)), if !audio_done => return Err("Microphone audio stalled. Check the input device and try again.".into()),
            _ = tokio::time::sleep_until(session_deadline), if !stopping => {
                stopping = true; capture.stop(); snapshot.phase = Phase::Finishing;
                snapshot.level = 0.0; snapshot.speech_active = false; publish(snapshot);
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlay_is_centered_at_the_monitor_work_area_edge() {
        let position = overlay_position(
            tauri::PhysicalPosition::new(1920, 40),
            tauri::PhysicalSize::new(2560, 1400),
            tauri::PhysicalSize::new(672, 160),
            0,
        );
        assert_eq!(position.x, 2864);
        assert_eq!(position.y, 1280);
    }
    use serde_json::json;
    fn frame(text: &str, final_: bool, start: f64) -> serde_json::Value {
        json!({"type":"Results","is_final":final_,"start":start,"duration":1.0,"channel":{"alternatives":[{"transcript":text}]}})
    }
    #[test]
    fn interim_replaces_and_final_segments_append_once() {
        let mut t = Transcript::default();
        t.accept(&frame("hel", false, 0.0));
        t.accept(&frame("hello", false, 0.0));
        assert_eq!(t.interim, "hello");
        assert!(t.text.is_empty());
        t.accept(&frame("Hello.", true, 0.0));
        t.accept(&frame("Hello.", true, 0.0));
        assert_eq!(t.text, "Hello.");
        assert!(t.interim.is_empty());
        t.accept(&frame("Hello.", true, 1.0));
        assert_eq!(t.text, "Hello. Hello.");
    }
    #[test]
    fn speech_endpoint_is_not_session_completion() {
        let mut t = Transcript::default();
        let mut f = frame("A thought.", true, 0.0);
        f["speech_final"] = json!(true);
        t.accept(&f);
        t.accept(&frame("Another thought.", true, 1.0));
        assert_eq!(t.text, "A thought. Another thought.");
    }
    #[test]
    fn vocabulary_is_encoded_as_separate_keyterms() {
        let settings = Settings {
            vocabulary: vec!["Cloudflare Workers".into(), "R&D".into()],
            ..Settings::default()
        };
        let url = listen_url(&settings).unwrap();
        let terms: Vec<_> = url
            .query_pairs()
            .filter(|(k, _)| k == "keyterm")
            .map(|(_, v)| v.into_owned())
            .collect();
        assert_eq!(terms, settings.vocabulary);
        assert!(!url.as_str().contains("Token"));
    }
    async fn wire_fixture(complete: bool, cancel: bool) -> (Result<bool, String>, Snapshot, usize) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (tx, mut rx) = mpsc::channel(8);
        let server = tokio::spawn(async move {
            let (tcp, _) = listener.accept().await.unwrap();
            let mut ws = tokio_tungstenite::accept_async(tcp).await.unwrap();
            let mut bytes = 0;
            while let Some(Ok(message)) = ws.next().await {
                match message {
                    Message::Binary(data) => {
                        bytes += data.len();
                        if bytes == 3200 {
                            ws.send(Message::Text(
                                frame("First sentence.", true, 0.0).to_string().into(),
                            ))
                            .await
                            .unwrap();
                            tx.send(if cancel {
                                Control::Cancel
                            } else {
                                Control::Stop
                            })
                            .await
                            .unwrap();
                        }
                    }
                    Message::Text(text) if text.contains("CloseStream") => {
                        assert_eq!(
                            bytes, 3520,
                            "the captured tail must arrive before CloseStream"
                        );
                        ws.send(Message::Text(
                            frame("Last word.", true, 1.0).to_string().into(),
                        ))
                        .await
                        .unwrap();
                        if complete {
                            ws.send(Message::Text(json!({"type":"Metadata"}).to_string().into()))
                                .await
                                .unwrap();
                        }
                        ws.close(None).await.unwrap();
                        // Keep the control sender alive so a channel close cannot masquerade as Cancel.
                        tokio::time::sleep(Duration::from_millis(100)).await;
                        break;
                    }
                    _ => {}
                }
            }
            bytes
        });
        let (socket, _) = connect_async(format!("ws://{address}")).await.unwrap();
        let mut snapshot = Snapshot::default();
        let result = tokio::time::timeout(
            Duration::from_secs(3),
            pump(
                &mut snapshot,
                &mut rx,
                audio::Capture::fixture(),
                PreparedStream {
                    socket,
                    buffer: AudioBuffer::default(),
                    stopping: false,
                    gate: audio::SpeechGate::new(false),
                },
                Instant::now(),
                |_| {},
            ),
        )
        .await
        .unwrap();
        (result, snapshot, server.await.unwrap())
    }
    #[tokio::test]
    async fn stop_drains_audio_and_waits_for_final_confirmation() {
        let (result, snapshot, bytes) = wire_fixture(true, false).await;
        assert!(result.unwrap());
        assert_eq!(bytes, 3520);
        assert_eq!(snapshot.text, "First sentence. Last word.");
    }
    #[tokio::test]
    async fn premature_socket_close_never_authorizes_paste() {
        let (result, snapshot, _) = wire_fixture(false, false).await;
        assert!(result.is_err());
        assert_eq!(snapshot.text, "First sentence. Last word.");
    }
    #[tokio::test]
    async fn cancellation_does_not_flush_or_deliver() {
        let (result, _, bytes) = wire_fixture(false, true).await;
        assert!(!result.unwrap());
        assert_eq!(bytes, 3200);
    }
    #[tokio::test]
    async fn early_finish_buffers_audio_and_updates_meter_before_connection() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (tx, mut rx) = mpsc::channel(8);
        let server = tokio::spawn(async move {
            let (tcp, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(tcp).await.unwrap();
            let mut audio = Vec::new();
            while let Some(Ok(message)) = socket.next().await {
                match message {
                    Message::Binary(bytes) => audio.extend_from_slice(&bytes),
                    Message::Text(text) if text.contains("CloseStream") => {
                        assert_eq!(audio, [vec![0; 3200], vec![1; 320]].concat());
                        socket
                            .send(Message::Text(json!({"type":"Metadata"}).to_string().into()))
                            .await
                            .unwrap();
                        break;
                    }
                    _ => {}
                }
            }
        });
        let mut capture = audio::Capture::fixture();
        let started = Instant::now();
        let mut snapshot = Snapshot {
            phase: Phase::Listening,
            ..Snapshot::default()
        };
        let meter_events = std::cell::Cell::new(0);
        let stop = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(30)).await;
            tx.send(Control::Stop).await.unwrap();
            tx // Keep sender alive until delivery finishes.
        });
        let prepared = prepare_stream(
            &mut snapshot,
            &mut rx,
            &mut capture,
            started,
            async {
                tokio::time::sleep(Duration::from_millis(150)).await;
                connect_async(format!("ws://{address}"))
                    .await
                    .map(|(socket, _)| socket)
                    .map_err(|e| e.to_string())
            },
            audio::SpeechGate::new(false),
            |state| {
                if state.phase == Phase::Listening {
                    meter_events.set(meter_events.get() + 1);
                }
            },
        )
        .await
        .unwrap()
        .unwrap();
        let _sender = stop.await.unwrap();
        assert!(
            meter_events.get() > 0,
            "meter events must not wait for the handshake"
        );
        assert!(prepared.stopping);
        assert_eq!(
            prepared.buffer.bytes, 3520,
            "keep the opening audio and stopped tail"
        );
        assert!(
            pump(&mut snapshot, &mut rx, capture, prepared, started, |_| {})
                .await
                .unwrap()
        );
        server.await.unwrap();
    }
    #[tokio::test]
    async fn cancel_during_connection_discards_buffer_without_waiting() {
        let mut capture = audio::Capture::fixture();
        let (tx, mut rx) = mpsc::channel(8);
        tx.send(Control::Cancel).await.unwrap();
        let mut snapshot = Snapshot::default();
        let result = tokio::time::timeout(
            Duration::from_millis(100),
            prepare_stream(
                &mut snapshot,
                &mut rx,
                &mut capture,
                Instant::now(),
                std::future::pending(),
                audio::SpeechGate::new(false),
                |_| {},
            ),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(result.is_none());
    }
    #[test]
    fn audio_buffer_fails_explicitly_instead_of_growing_or_dropping_audio() {
        let mut buffer = AudioBuffer::default();
        assert!(buffer.push(vec![0; 32 * 32000]).is_ok());
        assert!(buffer.push(vec![1; 2]).is_err());
        assert_eq!(buffer.pop().unwrap().len(), 32 * 32000);
        assert!(buffer.push(vec![1; 2]).is_ok());
    }
    #[tokio::test]
    #[ignore = "Uses the saved Deepgram key and sends 100ms of synthetic silence"]
    async fn native_deepgram_connection() {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let key = storage::key()
            .expect("Unlock the keyring")
            .expect("Save a key in VoxType first");
        let mut request = listen_url(&Settings::default())
            .unwrap()
            .as_str()
            .into_client_request()
            .unwrap();
        request
            .headers_mut()
            .insert("Authorization", format!("Token {key}").parse().unwrap());
        let result = tokio::time::timeout(Duration::from_secs(10), connect_async(request))
            .await
            .expect("Connection timed out");
        let (mut socket, _) = result.unwrap_or_else(|e| {
            panic!(
                "Deepgram connection failed: {}",
                match e {
                    tokio_tungstenite::tungstenite::Error::Http(r) =>
                        format!("HTTP {}", r.status()),
                    _ => "transport error".into(),
                }
            )
        });
        socket
            .send(Message::Binary(vec![0; 3200].into()))
            .await
            .unwrap();
        socket
            .send(Message::Text(
                serde_json::json!({"type":"CloseStream"}).to_string().into(),
            ))
            .await
            .unwrap();
        let confirmed = tokio::time::timeout(Duration::from_secs(10), async {
            while let Some(Ok(Message::Text(text))) = socket.next().await {
                let value: serde_json::Value = serde_json::from_str(&text).unwrap();
                if value["type"] == "Metadata" {
                    return true;
                }
            }
            false
        })
        .await
        .unwrap();
        assert!(confirmed, "Deepgram did not confirm finalization");
    }
}
