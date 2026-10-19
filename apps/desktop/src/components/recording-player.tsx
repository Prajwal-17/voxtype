import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { duration, errorMessage } from '../lib/types';
import { Button, IconButton } from './ui';
import { ArrowCounterClockwiseIcon, PauseIcon, PlayIcon } from './icons';

/** The library mounts one player at a time, inline with its transcript. */
export function RecordingPlayer({
  id,
  userId,
  disabled,
  durationMs,
}: {
  id: string;
  userId: string;
  disabled: boolean;
  durationMs: number;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const source = useRef<string | null>(null);
  const mounted = useRef(true);
  const blocked = useRef(disabled);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [length, setLength] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    const element = audio.current;
    return () => {
      mounted.current = false;
      element?.pause();
      element?.removeAttribute('src');
      element?.load();
      if (source.current) URL.revokeObjectURL(source.current);
      source.current = null;
    };
  }, []);
  useEffect(() => {
    blocked.current = disabled;
    if (disabled) audio.current?.pause();
  }, [disabled]);
  const play = async () => {
    const element = audio.current;
    if (!element || disabled || loading) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (!source.current) {
        const bytes = await api.recordingAudio(id, userId);
        if (!mounted.current) return;
        source.current = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        element.src = source.current;
      }
      if (blocked.current || !mounted.current) return;
      if (element.ended) element.currentTime = 0;
      await element.play();
    } catch (failure) {
      if (mounted.current && !blocked.current) setError(errorMessage(failure));
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
          if (blocked.current) {
            audio.current?.pause();
            return;
          }
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) =>
          setLength(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)
        }
        onError={() => {
          setPlaying(false);
          setLoading(false);
          if (source.current) URL.revokeObjectURL(source.current);
          source.current = null;
          setError('Couldn’t play this recording. Retry or export the audio from the menu.');
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
          disabled={disabled || !length}
          onChange={(e) => {
            if (audio.current) {
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
