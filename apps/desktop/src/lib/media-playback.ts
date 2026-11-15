/**
 * WebKitGTK exposes every HTMLMediaElement that starts playing as an MPRIS
 * player for the lifetime of the web process. Pausing, clearing
 * `navigator.mediaSession`, removing `src`, and calling `load()` are not
 * enough: WebKit keeps the player registered, so GNOME continues to show media
 * controls after a recording has ended.
 *
 * Loading an empty local audio blob makes WebKit report a fatal media error.
 * That error path deactivates the media session and unregisters the MPRIS
 * player. The blob URL is shared and intentionally never revoked so it remains
 * valid for every release in this process.
 */
const EMPTY_AUDIO_TYPE = 'audio/wav';
let releaseSource: string | null = null;

function emptyAudioSource(): string | null {
  if (releaseSource) return releaseSource;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  releaseSource = URL.createObjectURL(new Blob([], { type: EMPTY_AUDIO_TYPE }));
  return releaseSource;
}

/** Stop a media element and release its OS media session, if it has one. */
export function releaseMediaElement(element: HTMLMediaElement): void {
  element.pause();
  element.removeAttribute('src');
  const source = emptyAudioSource();
  if (source) element.src = source;
  element.load();
}

/**
 * True while the element points at the empty release resource. Media error
 * events from that deliberate load must not be shown as playback failures.
 */
export function isReleaseMediaSource(element: HTMLMediaElement): boolean {
  return (
    releaseSource !== null &&
    (element.currentSrc === releaseSource || element.src === releaseSource)
  );
}
