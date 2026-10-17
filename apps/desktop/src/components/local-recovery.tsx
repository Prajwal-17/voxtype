import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, native, useAuthUser, useCopy, useSession } from '../lib/api';
import { Button } from './ui';
import { toast } from 'sonner';
import { errorMessage, isActive, type LocalRecording } from '../lib/types';
export function LocalRecovery() {
  const auth = useAuthUser(),
    copy = useCopy();
  const client = useQueryClient();
  const session = useSession();
  const recording = isActive(session.data.phase);
  const regenerate = useMutation({
    mutationFn: (id: string) => api.regenerateTranscript(id, auth.data!.id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['local-recordings'] });
      void client.invalidateQueries({ queryKey: ['history'] });
      toast.success('Transcript regenerated and replaced');
    },
  });
  const rows = useQuery({
    queryKey: ['local-recordings', auth.data?.id],
    queryFn: api.localRecordings,
    enabled: !!auth.data,
  });
  return (
    <details
      onToggle={(event) => {
        if (!event.currentTarget.open)
          event.currentTarget.querySelectorAll('audio').forEach((audio) => audio.pause());
      }}
      className="mb-5 rounded-panel border border-line bg-surface p-4"
    >
      <summary className="cursor-pointer text-ui font-semibold">
        Local recordings &amp; originals
      </summary>
      <p className="my-3 text-caption text-muted">
        Latest 10 takes on this device. Play saved audio or regenerate its text. Regenerating sends
        the recording for transcription and replaces the existing text.
      </p>
      {rows.isError ? (
        <Button variant="outline" onClick={() => void rows.refetch()}>
          Retry local recordings
        </Button>
      ) : rows.isPending ? (
        <p>Loading local recordings…</p>
      ) : !rows.data.length ? (
        <p className="text-ui text-muted">No local recordings available.</p>
      ) : (
        rows.data.map((row) => (
          <article key={row.id} className="border-t border-line py-3">
            <p className="text-caption text-muted">{new Date(row.createdAt).toLocaleString()}</p>
            <p className="my-2 select-text whitespace-pre-wrap text-ui [overflow-wrap:anywhere]">
              {row.originalText || 'No transcript received. Play or regenerate the saved audio.'}
            </p>
            <Playback
              key={`${auth.data?.id}:${row.id}`}
              row={row}
              userId={auth.data!.id}
              disabled={regenerate.isPending || recording}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!native || !row.audioFile || regenerate.isPending || recording}
                loading={regenerate.isPending && regenerate.variables === row.id}
                onClick={() => regenerate.mutate(row.id)}
              >
                Regenerate text
              </Button>
              <Button
                variant="outline"
                disabled={!row.originalText || copy.isPending}
                onClick={() => copy.mutate(row.originalText)}
              >
                Copy original
              </Button>
              <Button
                variant="outline"
                disabled={!native || !row.audioFile}
                onClick={() =>
                  void api
                    .exportRecording(row.id)
                    .catch((error) => toast.error(errorMessage(error)))
                }
              >
                Export audio
              </Button>
            </div>
          </article>
        ))
      )}
    </details>
  );
}

function Playback({
  row,
  userId,
  disabled,
}: {
  row: LocalRecording;
  userId: string;
  disabled: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null),
    [loading, setLoading] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (disabled) audio.current?.pause();
  }, [disabled]);
  const alive = useRef(true),
    objectUrl = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  const load = async () => {
    setLoading(true);
    try {
      const data = await api.recordingAudio(row.id, userId);
      if (!alive.current) return;
      const next = URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = next;
      setUrl(next);
    } catch (error) {
      if (alive.current) toast.error(errorMessage(error));
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  return (
    <div className="my-3">
      {url ? (
        <audio
          ref={audio}
          aria-label="Recording playback"
          controls
          autoPlay
          preload="metadata"
          src={url}
          className="w-full max-w-md"
          onPlay={(event) => {
            if (disabled || !event.currentTarget.closest('details')?.open) {
              event.currentTarget.pause();
              return;
            }
            document.querySelectorAll('audio').forEach((audio) => {
              if (audio !== event.currentTarget) audio.pause();
            });
          }}
        />
      ) : (
        <Button
          variant="outline"
          disabled={!native || !row.audioFile || disabled}
          loading={loading}
          onClick={() => void load()}
        >
          Play recording
        </Button>
      )}
    </div>
  );
}
