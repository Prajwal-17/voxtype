//! parec handles Ubuntu's PulseAudio/PipeWire capture and resampling.
//! A bounded Tokio channel caps audio buffering. Dropping the task kills its child.
use crate::{desktop, environment};
use std::{collections::VecDeque, process::Stdio, time::Duration};
use tokio::{
    io::AsyncReadExt,
    process::Command,
    sync::{mpsc, oneshot},
    time::timeout,
};

pub struct Capture {
    pub frames: mpsc::Receiver<Result<Vec<u8>, String>>,
    pub bluetooth: bool,
    stop: Option<oneshot::Sender<()>>,
    child: Option<tokio::process::Child>,
    task: Option<tokio::task::JoinHandle<()>>,
    restore_profile: Option<(String, String)>,
    restore_warning: Option<String>,
}
impl Capture {
    pub fn stop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        // Ask parec to flush and exit. The reader task drains its stdout tail.
        if let Some(child) = self.child.as_mut() {
            if child.try_wait().ok().flatten().is_none() {
                if let Some(id) = child.id() {
                    let _ = nix::sys::signal::kill(
                        nix::unistd::Pid::from_raw(id as i32),
                        nix::sys::signal::Signal::SIGINT,
                    );
                }
            }
        }
    }

    /// A Bluetooth card must not return to A2DP while parec still owns the
    /// SCO source. Tear the child down first, then restore the profile.
    /// Cancellation skips the drain so the UI does not wait for discarded audio.
    /// Safe to call more than once; the first completed call restores the card.
    pub async fn shutdown(&mut self, graceful: bool) -> Option<String> {
        self.stop();
        // Unblock a task waiting to enqueue audio that nobody will consume.
        self.frames.close();
        if let Some(mut task) = self.task.take() {
            let finished = if graceful {
                tokio::time::timeout(Duration::from_secs(2), &mut task)
                    .await
                    .is_ok()
            } else {
                false
            };
            if !finished {
                task.abort();
            }
        }
        if let Some(mut child) = self.child.take() {
            if child.try_wait().ok().flatten().is_none() {
                let _ = child.start_kill();
                let _ = timeout(Duration::from_secs(1), child.wait()).await;
            }
        }
        if let Some(warning) = desktop::restore_card_profile(self.restore_profile.take()).await {
            self.restore_warning = Some(warning.clone());
            return Some(warning);
        }
        None
    }

    pub fn take_restore_warning(&mut self) -> Option<String> {
        self.restore_warning.take()
    }
}
impl Drop for Capture {
    fn drop(&mut self) {
        self.stop();
        if let Some(child) = self.child.as_mut() {
            let _ = child.start_kill();
            // Drop cannot await, but the profile must not change underneath a
            // process that still has the Bluetooth source open.
            for _ in 0..20 {
                if child.try_wait().ok().flatten().is_some() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        if let Some(task) = self.task.take() {
            task.abort();
        }
        if let Some((card, profile)) = self.restore_profile.take() {
            restore_card_profile_blocking(&card, &profile);
        }
    }
}

fn restore_card_profile_blocking(card: &str, profile: &str) {
    for attempt in 0..2 {
        match std::process::Command::new("pactl")
            .args(["set-card-profile", card, profile])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
        {
            Ok(status) if status.success() => return,
            Ok(status) => eprintln!("pactl set-card-profile {card} {profile} exited with {status}"),
            Err(error) => eprintln!("pactl set-card-profile {card} {profile} failed: {error}"),
        }
        if attempt == 0 {
            std::thread::sleep(Duration::from_millis(150));
        }
    }
}

/// Bluetooth SCO transports need more buffering than a local analog source;
/// a 40ms hint can underrun after the transport's initial buffers drain.
pub fn capture_latency_ms(bluetooth: bool) -> u32 {
    if bluetooth {
        160
    } else {
        40
    }
}

pub async fn start_recording(
    device: &str,
    recording: Option<crate::recordings::SharedWriter>,
) -> Result<Capture, String> {
    let prepared = desktop::prepare_input(device).await?;
    let bluetooth = prepared.bluetooth;
    let restore_profile = prepared.restore_profile;
    let mut cmd = Command::new("parec");
    cmd.args([
        "--raw",
        "--format=s16le",
        "--rate=16000",
        "--channels=1",
        &format!("--latency-msec={}", capture_latency_ms(bluetooth)),
    ])
    .arg(format!(
        "--client-name={}",
        environment::audio_client_name()
    ))
    .arg("--stream-name=Dictation");
    if let Some(device) = prepared.device.as_deref() {
        cmd.arg(format!("--device={device}"));
    }
    let mut child = match cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(child) => child,
        Err(_) => {
            if let Some((card, profile)) = restore_profile {
                restore_card_profile_blocking(&card, &profile);
            }
            return Err("Microphone capture is unavailable. Install pulseaudio-utils.".into());
        }
    };
    let mut stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            if let Some((card, profile)) = restore_profile {
                restore_card_profile_blocking(&card, &profile);
            }
            return Err("Could not open the microphone stream.".into());
        }
    };
    // 96ms packets: six native 16ms VAD frames, even when pipe reads are fragmented.
    let (sender, frames) = mpsc::channel(32);
    let (stop, mut stopping) = oneshot::channel();
    let task = tokio::spawn(async move {
        let mut buffer = vec![0u8; PACKET_BYTES];
        let mut filled = 0;
        let mut finishing = false;
        let mut drain_deadline = tokio::time::Instant::now() + Duration::from_secs(3600);
        loop {
            tokio::select! {
                _ = &mut stopping, if !finishing => {
                    // Capture::stop sent SIGINT; keep draining the tail until
                    // parec closes stdout or the bounded deadline expires.
                    finishing = true;
                    drain_deadline = tokio::time::Instant::now() + Duration::from_secs(1);
                }
                _ = tokio::time::sleep_until(drain_deadline), if finishing => break,
                result = stdout.read(&mut buffer[filled..]) => match result {
                    Ok(0) => {
                        if !finishing { let _ = sender.send(Err("The microphone stopped. Check that your input device is connected.".into())).await; }
                        break;
                    },
                    Ok(n) => {
                        filled += n;
                        if filled < PACKET_BYTES { continue; }
                        if let Err(error) = save_audio(&recording, &buffer) {
                            let _ = sender.send(Err(error)).await;
                            filled = 0;
                            break;
                        }
                        // Never drop audio silently, nor permit unlimited queued audio on a slow network.
                        match timeout(Duration::from_secs(3), sender.send(Ok(buffer.clone()))).await {
                            Ok(Ok(())) => { filled = 0; },
                            Ok(Err(_)) => break,
                            Err(_) => {
                                let _ = sender.send(Err("Microphone buffering stalled. Your received text is available to copy.".into())).await;
                                filled = 0;
                                break;
                            },
                        }
                    },
                    Err(_) => { let _ = sender.send(Err("Could not read microphone audio.".into())).await; break; }
                }
            }
        }
        // Preserve the last complete PCM sample on Stop; never pad the wire audio.
        let tail = filled - filled % 2;
        if finishing && tail > 0 {
            if let Err(error) = save_audio(&recording, &buffer[..tail]) {
                let _ = sender.send(Err(error)).await;
                return;
            }
            let _ = timeout(
                Duration::from_secs(1),
                sender.send(Ok(buffer[..tail].to_vec())),
            )
            .await;
        }
    });
    Ok(Capture {
        frames,
        bluetooth,
        stop: Some(stop),
        child: Some(child),
        task: Some(task),
        restore_profile,
        restore_warning: None,
    })
}

fn save_audio(
    recording: &Option<crate::recordings::SharedWriter>,
    bytes: &[u8],
) -> Result<(), String> {
    if let Some(recording) = recording {
        if let Some(writer) = recording
            .lock()
            .map_err(|_| "Recording unavailable.")?
            .as_mut()
        {
            writer.append(bytes)?;
        }
    }
    Ok(())
}

pub const PCM_BYTES_PER_SECOND: usize = 32_000;
pub const PACKET_BYTES: usize = 3_072;
const VAD_FRAME_BYTES: usize = 512; // 256 signed samples at 16kHz = 16ms.
const PRE_ROLL_FRAMES: usize = 20; // 320ms protects soft speech onsets.
const HANGOVER_FRAMES: usize = 50; // 800ms lets Deepgram's 300ms endpoint settle.

/// A per-session, embedded neural model. Silence is discarded only after local
/// inference; no raw audio leaves this device during sustained pauses.
pub struct SpeechGate {
    detector: earshot::Detector,
    enabled: bool,
    pending: Vec<u8>,
    pre_roll: VecDeque<Vec<u8>>,
    hangover: usize,
    pub speaking: bool,
}
impl SpeechGate {
    pub fn new(enabled: bool) -> Self {
        Self {
            detector: earshot::Detector::default(),
            enabled,
            pending: Vec::with_capacity(PACKET_BYTES),
            pre_roll: VecDeque::with_capacity(PRE_ROLL_FRAMES),
            hangover: 0,
            speaking: false,
        }
    }

    fn accept(&mut self, frame: Vec<u8>, output: &mut Vec<u8>) {
        let mut samples = [0i16; 256];
        for (sample, bytes) in samples.iter_mut().zip(frame.chunks_exact(2)) {
            *sample = i16::from_le_bytes([bytes[0], bytes[1]]);
        }
        let probability = self.detector.predict_i16(&samples);
        // Hysteresis avoids chopping quieter syllables after speech has started.
        self.speaking = probability >= if self.hangover > 0 { 0.35 } else { 0.5 };
        if self.speaking {
            self.hangover = HANGOVER_FRAMES;
            for lead in self.pre_roll.drain(..) {
                output.extend(lead);
            }
        }
        if self.speaking || self.hangover > 0 {
            output.extend(frame);
        } else {
            self.pre_roll.push_back(frame);
            if self.pre_roll.len() > PRE_ROLL_FRAMES {
                self.pre_roll.pop_front();
            }
        }
        if !self.speaking {
            self.hangover = self.hangover.saturating_sub(1);
        }
    }

    pub fn push(&mut self, bytes: Vec<u8>) -> Vec<Vec<u8>> {
        if !self.enabled {
            self.speaking = level(&bytes) > 0.02;
            return vec![bytes];
        }
        self.pending.extend(bytes);
        let complete = self.pending.len() / VAD_FRAME_BYTES * VAD_FRAME_BYTES;
        let frames: Vec<u8> = self.pending.drain(..complete).collect();
        let mut output = Vec::new();
        for frame in frames.chunks_exact(VAD_FRAME_BYTES) {
            self.accept(frame.to_vec(), &mut output);
        }
        output.chunks(PACKET_BYTES).map(<[u8]>::to_vec).collect()
    }

    pub fn finish(&mut self) -> Vec<Vec<u8>> {
        let mut output = Vec::new();
        if !self.pending.is_empty() {
            let tail = std::mem::take(&mut self.pending);
            self.accept(tail, &mut output);
        }
        self.pre_roll.clear();
        self.speaking = false;
        output.chunks(PACKET_BYTES).map(<[u8]>::to_vec).collect()
    }
}

pub fn level(bytes: &[u8]) -> f32 {
    let count = bytes.len() / 2;
    if count == 0 {
        return 0.0;
    }
    let sum: f32 = bytes
        .chunks_exact(2)
        .map(|b| {
            let x = i16::from_le_bytes([b[0], b[1]]) as f32 / 32768.0;
            x * x
        })
        .sum();
    ((sum / count as f32).sqrt() * 5.0).clamp(0.0, 1.0)
}

/// Some Bluetooth HFP transports degrade into long runs of exact digital
/// silence interleaved with packet bursts. The pattern is distinguishable from
/// real silence because the zero-heavy packets still carry energy. It is not
/// recoverable by parsing the PCM, so the session ends with the captured audio
/// instead of confidently transcribing noise.
pub struct CaptureHealth {
    window: VecDeque<bool>,
    reported: bool,
}
impl Default for CaptureHealth {
    fn default() -> Self {
        Self::new()
    }
}
impl CaptureHealth {
    const WINDOW: usize = 16;
    const UNSTABLE: usize = 12;
    const ZERO_RATIO: f64 = 0.5;
    const MIN_RMS: f64 = 0.004;

    pub fn new() -> Self {
        Self {
            window: VecDeque::with_capacity(Self::WINDOW),
            reported: false,
        }
    }

    pub fn push(&mut self, bytes: &[u8]) -> bool {
        let samples = bytes.len() / 2;
        if samples == 0 || self.reported {
            return false;
        }
        let mut zeros = 0usize;
        let mut energy = 0f64;
        for bytes in bytes.chunks_exact(2) {
            let sample = i16::from_le_bytes([bytes[0], bytes[1]]);
            if sample == 0 {
                zeros += 1;
            }
            let normalized = sample as f64 / 32768.0;
            energy += normalized * normalized;
        }
        let zero_ratio = zeros as f64 / samples as f64;
        let rms = (energy / samples as f64).sqrt();
        let suspicious = zero_ratio >= Self::ZERO_RATIO && rms >= Self::MIN_RMS;
        self.window.push_back(suspicious);
        if self.window.len() > Self::WINDOW {
            self.window.pop_front();
        }
        let unstable = self.window.len() >= Self::UNSTABLE
            && self.window.iter().filter(|suspicious| **suspicious).count() >= Self::UNSTABLE;
        if unstable {
            self.reported = true;
        }
        unstable
    }
}

#[cfg(test)]
mod health_tests {
    use super::CaptureHealth;

    fn packet(samples: usize, amplitude: i16, zero_every: usize) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(samples * 2);
        for index in 0..samples {
            let value = if zero_every > 0 && index % zero_every != 0 {
                0
            } else if index % 2 == 0 {
                amplitude
            } else {
                -amplitude
            };
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes
    }

    #[test]
    fn bluetooth_capture_uses_a_larger_buffer_hint() {
        assert_eq!(super::capture_latency_ms(true), 160);
        assert_eq!(super::capture_latency_ms(false), 40);
    }

    #[test]
    fn ordinary_speech_and_real_silence_are_not_reported() {
        let mut health = CaptureHealth::new();
        for _ in 0..40 {
            assert!(!health.push(&packet(1536, 8000, 0)));
            assert!(!health.push(&packet(1536, 0, 1)));
        }
    }

    #[test]
    fn an_isolated_loud_or_zero_packet_does_not_trigger() {
        let mut health = CaptureHealth::new();
        for index in 0..40 {
            if index == 12 {
                assert!(!health.push(&packet(1536, 9000, 3)));
            } else {
                assert!(!health.push(&packet(1536, 8000, 0)));
            }
        }
    }

    #[test]
    fn corrupt_bluetooth_bursts_trigger_once_after_about_a_second() {
        let mut health = CaptureHealth::new();
        for _ in 0..11 {
            assert!(!health.push(&packet(1536, 8000, 3)));
        }
        assert!(health.push(&packet(1536, 8000, 3)));
        assert!(!health.push(&packet(1536, 8000, 3)));
    }

    #[test]
    fn a_rolling_window_tolerates_occasional_healthy_packets() {
        let mut health = CaptureHealth::new();
        let mut reported = false;
        for index in 0..16 {
            let bytes = if index % 4 == 0 {
                packet(1536, 8000, 0)
            } else {
                packet(1536, 8000, 3)
            };
            reported |= health.push(&bytes);
        }
        assert!(reported);
    }
}
