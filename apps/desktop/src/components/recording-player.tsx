import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { isReleaseMediaSource, releaseMediaElement } from '../lib/media-playback';
import { duration, errorMessage } from '../lib/types';
import { Button, IconButton } from './ui';
import { ArrowCounterClockwiseIcon, PauseIcon, PlayIcon } from './icons';

const PLAYBACK_ERROR = 'Couldn’t play this recording. Retry or export the audio from the menu.';

type RecordingPlayerProps = {
  id: string;
  userId: string;
  disabled: boolean;
  durationMs: number;
};

/**
 * The library mounts one player at a time, inline with its transcript. Keying
 * the inner player guarantees that changing the recording tears down the old
 * object URL and OS media session before new playback state is created.
 */
export function RecordingPlayer(props: RecordingPlayerProps) {
  return <RecordingSourcePlayer key={`${props.userId}:${props.id}`} {...props} />;
}

function RecordingSourcePlayer({ id, userId, disabled, durationMs }: RecordingPlayerProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const clip = useRef<Blob | null>(null);
  const source = useRef<string | null>(null);
  const mounted = useRef(true);
  const blocked = useRef(disabled);
  // `released` is read by media event handlers; `cleared` mirrors it for the UI.
  const released = useRef(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [length, setLength] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    mounted.current = true;
    const element = audio.current;
    return () => {
      mounted.current = false;
      // A player that never got a source has no OS media session to release.
      if (element && !released.current && (source.current || element.currentSrc)) {
        releaseMediaElement(element);
      }
      released.current = true;
      if (source.current) URL.revokeObjectURL(source.current);
      source.current = null;
      clip.current = null;
    };
  }, []);

  useEffect(() => {
    blocked.current = disabled;
    if (disabled) audio.current?.pause();
  }, [disabled]);

  const release = (forgetClip: boolean) => {
    const element = audio.current;
    element?.pause();
    if (source.current) URL.revokeObjectURL(source.current);
    source.current = null;
    if (forgetClip) clip.current = null;
    if (!element || released.current) return;
    released.current = true;
    setCleared(true);
    releaseMediaElement(element);
  };

  const play = async () => {
    const element = audio.current;
    if (!element || disabled || loading) return;
    if (!element.paused && !released.current) {
      element.pause();
      return;
    }
    setLoading(true);
    setError('');
    try {
      let blob = clip.current;
      if (!blob) {
        const response = await api.recordingAudio(id, userId);
        if (!mounted.current) return;
        blob = new Blob([response], { type: 'audio/wav' });
        clip.current = blob;
      }
      if (blocked.current || !mounted.current) return;
      if (!source.current) source.current = URL.createObjectURL(blob);
      if (released.current) {
        released.current = false;
        setCleared(false);
        setElapsed(0);
        element.src = source.current;
      } else if (!element.currentSrc) {
        element.src = source.current;
      }
      if (element.ended) element.currentTime = 0;
      await element.play();
    } catch (failure) {
      if (mounted.current && !blocked.current) {
        setError(errorMessage(failure));
        if (source.current || element.currentSrc) release(true);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <div className="recording-player">
      <audio
        ref={audio}
        preload="metadata"
        aria-label="Saved recording"
        onPlay={() => {
          if (!mounted.current) return;
          if (blocked.current) {
            audio.current?.pause();
            return;
          }
          setPlaying(true);
        }}
        onPause={() => {
          if (mounted.current) setPlaying(false);
        }}
        onEnded={(e) => {
          if (!mounted.current) return;
          setPlaying(false);
          const total = Number.isFinite(e.currentTarget.duration)
            ? e.currentTarget.duration
            : length || durationMs / 1000;
          setElapsed(total);
          release(false);
        }}
        onTimeUpdate={(e) => {
          if (mounted.current && !released.current) setElapsed(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={(e) => {
          if (mounted.current && !released.current)
            setLength(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0);
        }}
        onError={(e) => {
          if (!mounted.current) return;
          if (released.current || isReleaseMediaSource(e.currentTarget)) return;
          setPlaying(false);
          setLoading(false);
          setError(PLAYBACK_ERROR);
          release(true);
        }}
      />
      <div className="flex min-w-0 items-center gap-3">
        <Button
          size="icon"
          variant="primary"
          loading={loading}
          disabled={disabled}
          aria-label={playing ? 'Pause recording' : 'Play recording'}
          onClick={() => void play()}
        >
          {!loading &&
            (playing ? (
              <PauseIcon size={16} weight="fill" />
            ) : (
              <PlayIcon size={16} weight="fill" />
            ))}
        </Button>
        <input
          type="range"
          aria-label="Recording position"
          min={0}
          max={length || 1}
          step={0.1}
          value={Math.min(elapsed, length || 1)}
          disabled={disabled || !length || cleared}
          onChange={(e) => {
            if (audio.current && !released.current) {
              audio.current.currentTime = Number(e.target.value);
              setElapsed(Number(e.target.value));
            }
          }}
          className="audio-seek min-w-0 flex-1"
        />
        <span className="shrink-0 text-caption text-muted tabular-nums">
          {duration(elapsed * 1000)} / {duration(length ? length * 1000 : durationMs)}
        </span>
      </div>
      {disabled && (
        <p className="mt-2 text-caption text-muted">Finish recording to play saved audio.</p>
      )}
      {error && (
        <div className="mt-2 flex items-center gap-2 text-caption text-danger" role="alert">
          <p>{error}</p>
          <IconButton
            label="Retry playback"
            onClick={() => void play()}
            disabled={disabled || loading}
          >
            <ArrowCounterClockwiseIcon size={16} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
