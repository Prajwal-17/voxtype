//! parec handles Ubuntu's PulseAudio/PipeWire capture and resampling.
//! A bounded Tokio channel caps audio buffering. Dropping the task kills its child.
use crate::environment;
use std::{collections::VecDeque, process::Stdio, time::Duration};
use tokio::{
    io::AsyncReadExt,
    process::Command,
    sync::{mpsc, oneshot},
    time::timeout,
};

pub struct Capture {
    pub frames: mpsc::Receiver<Result<Vec<u8>, String>>,
    stop: Option<oneshot::Sender<()>>,
    task: tokio::task::JoinHandle<()>,
}
impl Capture {
    pub fn stop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
    }
    #[cfg(test)]
    pub fn fixture() -> Self {
        let (sender, frames) = mpsc::channel(8);
        let (stop, stopping) = oneshot::channel();
        let task = tokio::spawn(async move {
            sender.send(Ok(vec![0; 3200])).await.unwrap();
            let _ = stopping.await;
            // The bytes arriving after Stop are the tail that must precede CloseStream.
            let _ = sender.send(Ok(vec![1; 320])).await;
        });
        Self {
            frames,
            stop: Some(stop),
            task,
        }
    }
}
impl Drop for Capture {
    fn drop(&mut self) {
        self.task.abort();
    }
}

pub fn start(device: &str) -> Result<Capture, String> {
    let mut cmd = Command::new("parec");
    cmd.args([
        "--raw",
        "--format=s16le",
        "--rate=16000",
        "--channels=1",
        "--latency-msec=40",
    ])
    .arg(format!(
        "--client-name={}",
        environment::audio_client_name()
    ))
    .arg("--stream-name=Dictation");
    if !device.is_empty() {
        cmd.arg(format!("--device={device}"));
    }
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| "Microphone capture is unavailable. Install pulseaudio-utils.")?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or("Could not open the microphone stream.")?;
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
                    finishing = true;
                    drain_deadline = tokio::time::Instant::now() + Duration::from_secs(1);
                    if let Some(id) = child.id() { let _ = nix::sys::signal::kill(nix::unistd::Pid::from_raw(id as i32), nix::sys::signal::Signal::SIGINT); }
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
            let _ = timeout(
                Duration::from_secs(1),
                sender.send(Ok(buffer[..tail].to_vec())),
            )
            .await;
        }
        let _ = child.kill().await;
        let _ = child.wait().await;
    });
    Ok(Capture {
        frames,
        stop: Some(stop),
        task,
    })
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
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn silence_and_real_audio_levels() {
        assert_eq!(level(&[0; 100]), 0.0);
        assert_eq!(level(&[]), 0.0);
        assert_eq!(level(&[255, 127, 0, 128]), 1.0);
        assert!(level(&[128, 8, 128, 8]) > 0.1);
    }
    #[tokio::test]
    #[ignore = "Briefly opens the actual microphone; no audio is saved or transmitted"]
    async fn native_microphone_capture() {
        let mut capture = start("").expect("Could not start parec");
        let first = timeout(Duration::from_secs(5), capture.frames.recv())
            .await
            .expect("Microphone timed out")
            .expect("Microphone ended")
            .expect("Capture error");
        assert!(!first.is_empty());
        capture.stop();
        timeout(Duration::from_secs(2), async {
            while capture.frames.recv().await.is_some() {}
        })
        .await
        .expect("Capture did not stop");
    }
}
