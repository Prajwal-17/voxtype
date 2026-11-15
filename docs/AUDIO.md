# Audio capture and recovery

Both clients send 16 kHz mono signed 16-bit PCM to Deepgram. Local WAV files use
the same format. The capture code owns route selection, buffering and recovery;
the transcription session never sees a device-specific format.

## Route policy

Desktop **Automatic (best available)** uses a connected USB or wired headset
microphone and otherwise the system microphone. It does not change a Bluetooth
card's profile, so earbuds stay on A2DP for playback. A Bluetooth card that
offers a usable headset profile also appears as **<device> microphone (call
mode)** in Settings and the tray, including when the card is currently off. That
explicit choice switches the card to HFP for the take and restores the previous
profile afterward, whether that was A2DP or off.

An explicitly selected microphone must be used or the take fails with an
actionable error. It never falls back silently to a different device while the
Home screen still names the selected one.

Android prefers a USB or wired headset input and otherwise the built-in
microphone. `AudioRecord.setPreferredDevice` pins that choice, and the recorder
updates its health monitor if Android still reports a Bluetooth route.

## Why Bluetooth capture is opt-in

HFP/HSP carries a microphone over SCO. It is narrowband by design, and the
Linux/PipeWire and Android HAL paths have documented failure modes where SCO
packets are corrupted or never delivered while the source remains open. The
symptom is not a normal low-quality call recording: saved PCM can contain long
runs of exact digital zeros interleaved with short broadband bursts, so the
first seconds are clear and the rest is unusable. Deepgram receives the same
corrupt samples and cannot recover the words.

Consequently:

- Automatic mode never starts Bluetooth call mode.
- Explicit call mode prefers CVSD over mSBC. mSBC is clearer but has a wider
  reported set of adapter/BlueZ interoperability failures. The quality tradeoff
  is intentional.
- After switching profiles, the desktop waits for the card's active profile and
  the new source to remain stable for 250 ms before opening `parec`. The whole
  readiness check shares one 4 s deadline, so two slow `pactl` probes cannot
  stretch into minutes.
- Bluetooth capture asks for a 160 ms latency hint instead of 40 ms, so the
  transport is not starved after its initial buffers drain.
- Capture tears down `parec` and restores the previous profile as soon as the
  audio queue drains, before remote finalization or transcript cleanup. The
  restore command's exit status is checked and retried; a failure is reported
  instead of leaving the headset silently in call mode.
- Both clients detect the zero-heavy burst pattern and end the take with a
  clear message instead of presenting a confident transcript of noise. Android
  aggregates short reads into fixed 100 ms frames so a burst of partial reads
  cannot trigger the detector early. On Android, recovery text is only promised
  when a finalized recording or partial transcript actually exists.

## Verification

Desktop tests cover automatic source selection, explicit call-mode planning,
off-card restore, explicit-unavailable failures, the shared readiness deadline,
profile choice, and the digital-burst detector. Android tests cover the same
input policy and a burst detector that aggregates partial reads into fixed
frames. Neither test suite can prove a particular Bluetooth adapter works; that
requires the device and a real SCO link. A healthy capture has ordinary speech
energy and very few exact zero samples; a failing SCO capture is mostly exact
zeros with bursts.

When a Bluetooth microphone fails, use Automatic or the laptop/phone microphone
for reliable dictation. The application cannot repair a corrupted kernel SCO
transport.
