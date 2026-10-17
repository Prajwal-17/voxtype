import { useQuery } from '@tanstack/react-query';
import { api, native, useAuthUser, useCopy } from '../lib/api';
import { Button } from './ui';
import { toast } from 'sonner';
import { errorMessage } from '../lib/types';
export function LocalRecovery() {
  const auth = useAuthUser(),
    copy = useCopy();
  const rows = useQuery({
    queryKey: ['local-recordings', auth.data?.id],
    queryFn: api.localRecordings,
    enabled: !!auth.data,
  });
  return (
    <details className="mb-5 rounded-panel border border-line bg-surface p-4">
      <summary className="cursor-pointer text-ui font-semibold">
        Local recordings &amp; originals
      </summary>
      <p className="my-3 text-caption text-muted">
        Latest 10 takes on this device. Raw originals and audio stay local. Copy an original or
        export audio to recover it.
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
              {row.originalText || 'No transcript received. Recover the audio if available.'}
            </p>
            <div className="flex flex-wrap gap-2">
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
