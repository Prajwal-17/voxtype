//! One owner per recording. UI, tray, and shortcuts all send Stop/Cancel to the same task.
//! Only confirmed complete transcripts can reach automatic paste.
use crate::{audio, cleanup, desktop, model::*, publish, recordings, speech, storage, AppState};
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
    let user_id = app
        .state::<AppState>()
        .user
        .lock()
        .map_err(|_| "Account unavailable.")?
        .as_ref()
        .map(|user| user.id.clone())
        .ok_or("Sign in with Google to use dictation.")?;
    let created_at = now_ms();
    let id = uuid::Uuid::new_v4().to_string();
    let recording = if test {
        None
    } else {
        Some(recordings::Recording::create(&app, &id, created_at)?)
    };
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
    let capture = match audio::start_recording(
        &settings.microphone,
        recording.as_ref().map(|r| r.writer.clone()),
    ) {
        Ok(capture) => capture,
        Err(error) => {
            if let Ok(mut control) = app.state::<AppState>().control.lock() {
                *control = None;
            }
            return Err(error);
        }
    };
    let mut snapshot = Snapshot {
        session_id: id,
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
        let keep_take = !test && !matches!(&result, Ok(false));
        let mut audio_file = None;
        let mut recording_error = None;
        if keep_take {
            if let Some(recording) = &recording {
                match recording.finish() {
                    Ok(path) => audio_file = path,
                    Err(error) => recording_error = Some(error),
                }
            }
        }
        let mut history_saved = false;
        let mut history_error = None;
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
                    // Commit received text before clipboard/paste work can fail or interrupt us.
                    match storage::append_history(
                        &app,
                        history_item(&snapshot, &user_id, created_at, audio_file.as_deref()),
                    ) {
                        Ok(()) => history_saved = true,
                        Err(error) => history_error = Some(error),
                    }
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
                }
            }
            Err(e) => {
                snapshot.phase = Phase::Error;
                snapshot.message = e;
            }
        }
        // Keep received text even when a provider failed before final confirmation.
        if keep_take && !snapshot.text.trim().is_empty() {
            let saving = if history_saved {
                storage::update_delivery(&app, &snapshot.session_id, &snapshot.delivery)
            } else {
                storage::append_history(
                    &app,
                    history_item(&snapshot, &user_id, created_at, audio_file.as_deref()),
                )
            };
            match saving {
                Ok(()) => {
                    history_error = None;
                    crate::uploads::send_pending(app.clone());
                }
                Err(error) => history_error = Some(error),
            }
        }
        if let Some(error) = history_error {
            snapshot.message = format!("{} History could not be saved: {error}", snapshot.message);
        }
        if keep_take {
            if let Err(error) = storage::prune_audio(&app) {
                recording_error = Some(error);
            }
        }
        if let Some(error) = recording_error {
            snapshot.message = format!("{} {error}", snapshot.message);
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
        let terminal_phase = snapshot.phase;
        if terminal_phase == Phase::Idle {
            if let Some(w) = app.get_webview_window("overlay") {
                let _ = w.hide();
            }
        } else if external && matches!(terminal_phase, Phase::Done | Phase::Error) {
            // A completed or failed dictation must not become a permanent
            // always-on-top window. The transcript remains in VoxType/history.
            let delay = if terminal_phase == Phase::Error
                || (terminal_phase == Phase::Done && snapshot.delivery != "pasted")
            {
                3000
            } else {
                1500
            };
            tokio::time::sleep(Duration::from_millis(delay)).await;
            let current = app
                .state::<AppState>()
                .snapshot
                .lock()
                .map(|s| s.session_id == id && s.phase == terminal_phase)
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

fn history_item(
    snapshot: &Snapshot,
    user_id: &str,
    created_at: u64,
    audio_file: Option<&str>,
) -> HistoryItem {
    HistoryItem {
        id: snapshot.session_id.clone(),
        text: snapshot.text.clone(),
        original_text: snapshot.original_text.clone(),
        created_at,
        duration_ms: snapshot.elapsed_ms,
        words: snapshot.text.split_whitespace().count(),
        delivery: if snapshot.delivery.is_empty() {
            "saved".into()
        } else {
            snapshot.delivery.clone()
        },
        user_id: Some(user_id.into()),
        audio_file: audio_file.map(str::to_owned),
        upload_api_url: Some(crate::auth::api_url()),
    }
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

fn positions_match(
    actual: tauri::PhysicalPosition<i32>,
    expected: tauri::PhysicalPosition<i32>,
) -> bool {
    actual.x.abs_diff(expected.x) <= 2 && actual.y.abs_diff(expected.y) <= 2
}

fn overlay_target(w: &tauri::WebviewWindow) -> Option<tauri::PhysicalPosition<i32>> {
    let monitor = w
        .cursor_position()
        .ok()
        .and_then(|cursor| w.monitor_from_point(cursor.x, cursor.y).ok().flatten())
        .or_else(|| w.current_monitor().ok().flatten())
        .or_else(|| w.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        // Hidden GTK windows have no reliable allocated size before their first
        // map. Use the capsule's configured logical size at this monitor's scale.
        let size = tauri::LogicalSize::new(288, crate::environment::overlay_height())
            .to_physical::<u32>(monitor.scale_factor());
        let area = monitor.work_area();
        return Some(overlay_position(area.position, area.size, size, 0));
    }
    None
}

fn overlay_is_positioned(w: &tauri::WebviewWindow, expected: tauri::PhysicalPosition<i32>) -> bool {
    w.outer_position()
        .is_ok_and(|actual| positions_match(actual, expected))
}

fn show_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.set_focusable(false);
        let _ = w.set_always_on_top(true);
        let _ = w.set_visible_on_all_workspaces(true);
        // Queue the initial position before mapping to avoid a centered flash.
        let expected = overlay_target(&w);
        if let Some(expected) = expected {
            let _ = w.set_position(expected);
        }
        let _ = w.show();
        // GNOME maps a hidden window asynchronously. Verify its final position
        // and retry using this exact window handle, never a title/PID search.
        // Always check after mapping: cached pre-map coordinates are not proof
        // that the compositor honored the requested placement.
        tauri::async_runtime::spawn(async move {
            for delay in [32, 64, 128, 256, 384] {
                tokio::time::sleep(Duration::from_millis(delay)).await;
                if !w.is_visible().unwrap_or(false) {
                    break;
                }
                if let Some(expected) = expected.or_else(|| overlay_target(&w)) {
                    let _ = w.set_position(expected);
                    if overlay_is_positioned(&w, expected) {
                        break;
                    }
                }
            }
        });
    }
}

/// Exercise the real native overlay without microphone capture or API calls.
#[cfg(debug_assertions)]
pub fn preview_overlay(app: &AppHandle) {
    show_overlay(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(15)).await;
        // Do not dismiss an actual recording started during the preview.
        if app
            .state::<AppState>()
            .control
            .lock()
            .is_ok_and(|c| c.is_none())
        {
            if let Some(w) = app.get_webview_window("overlay") {
                let _ = w.hide();
            }
        }
    });
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
    let token = speech::token().await?;
    let mut request = listen_url(settings)?
        .as_str()
        .into_client_request()
        .map_err(|_| "Could not create a Deepgram request.")?;
    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {token}")
            .parse()
            .map_err(|_| "The server returned invalid transcription credentials.")?,
    );
    drop(token);
    let (socket, _) = tokio::time::timeout(Duration::from_secs(10), connect_async(request))
        .await
        .map_err(|_| "Deepgram connection timed out. No text was inserted; try again.")?
        .map_err(|error| match error {
            tokio_tungstenite::tungstenite::Error::Http(response)
                if response.status().as_u16() == 401 || response.status().as_u16() == 403 =>
            {
                "Deepgram rejected the temporary credentials. Try dictating again."
            }
            _ => "Could not connect to Deepgram. Check your connection and try again.",
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

// Separate the wire protocol from desktop side effects so finalization is testable without a microphone or provider credentials.
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
                    if value["type"] == "Error" { return Err("Deepgram could not process this recording. Try again or check your language setting.".into()); }
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
