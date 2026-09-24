#!/usr/bin/env bash
# Neutralino's process events carry UTF-8 text, so encode PCM over stdout.
# No files, credentials, or recording data are written to disk.
set -uo pipefail
export LC_ALL=C
capture_pid=''
encoder_pid=''
cleanup() {
  trap - EXIT INT TERM HUP
  if [[ -n "$capture_pid" ]]; then kill "$capture_pid" 2>/dev/null || true; fi
  if [[ -n "$encoder_pid" ]]; then kill "$encoder_pid" 2>/dev/null || true; fi
  if [[ -n "$capture_pid" ]]; then wait "$capture_pid" 2>/dev/null || true; fi
  if [[ -n "$encoder_pid" ]]; then wait "$encoder_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
# Wait until the application knows the process ID and has installed its listener.
IFS= read -r command || exit 0
if [[ "$command" == stop ]]; then printf 'FLOW_END\n'; exit 0; fi
[[ "$command" == start ]] || exit 2
for tool in parec base64 stdbuf; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'Missing %s. Install pulseaudio-utils and coreutils.\n' "$tool" >&2; exit 127; }
done
coproc MICROPHONE { exec parec --raw --format=s16le --rate=16000 --channels=1 --latency-msec=50 --client-name=Flow --stream-name=Dictation; }
capture_pid=$MICROPHONE_PID
# Duplicate the coprocess descriptor before launching an asynchronous encoder.
exec {audio_fd}<&"${MICROPHONE[0]}" || exit 1
stdbuf -oL base64 --wrap=4096 <&"$audio_fd" &
encoder_pid=$!
exec {audio_fd}<&-
started=$SECONDS
while true; do
  if IFS= read -r -t 0.25 command; then
    [[ "$command" == stop ]] && break
  else
    read_status=$?
    # EOF means the app exited. A timeout (>128) just checks process health.
    (( read_status > 128 )) || break
  fi
  if ! kill -0 "$capture_pid" 2>/dev/null || ! kill -0 "$encoder_pid" 2>/dev/null; then
    printf 'Audio capture ended unexpectedly. Check Ubuntu Sound input and the audio server.\n' >&2
    exit 1
  fi
  if (( SECONDS - started >= 65 )); then
    printf 'Audio capture safety limit reached.\n' >&2
    exit 1
  fi
done
kill "$capture_pid" 2>/dev/null || true
wait "$capture_pid" 2>/dev/null || true
capture_pid=''
# Drain the final PCM bytes before acknowledging stop.
wait "$encoder_pid" || exit 1
encoder_pid=''
printf 'FLOW_END\n'
