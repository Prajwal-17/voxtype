import { useMemo, useState } from 'react';
import { ArrowRight, AudioLines, Copy, History, Search, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, useCopy, useHistory } from '../lib/api';
import { duration } from '../lib/types';
import { PageHeader } from '../components/layout';
import { Button, Confirm, IconButton } from '../components/ui';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';

export function HistoryPage({ onRecord }: { onRecord: () => void }) {
  const [search, setSearch] = useState('');
  const history = useHistory();
  const copy = useCopy();
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: api.deleteHistory,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['history'] });
      toast.success('History deleted');
    },
  });
  const filtered = useMemo(
    () =>
      history.data?.filter((item) =>
        item.text.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ) ?? [],
    [history.data, search],
  );

  return (
    <>
      <PageHeader
        title="History"
        description="Browse and reuse transcripts stored on this device."
        actions={
          !!history.data?.length && (
            <Confirm
              title="Delete all history?"
              description="This permanently removes every saved transcript from this device."
              onConfirm={() => remove.mutate(null)}
              pending={remove.isPending}
              trigger={
                <Button variant="outline" size="sm">
                  <Trash2 size={14} /> Clear history
                </Button>
              }
            />
          )
        }
      />

      <Card className="overflow-hidden">
        <div className="flex min-h-16 items-center justify-between gap-5 border-b border-line bg-raised px-5 max-md:flex-wrap max-md:gap-3 max-md:py-3">
          <label className="flex w-80 max-w-full items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent max-md:w-full">
            <Search size={16} className="shrink-0" />
            <Input
              type="search"
              placeholder="Search transcripts"
              aria-label="Search history"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={!history.data?.length}
              className="py-2"
            />
          </label>
          <span className="shrink-0 text-caption text-muted">
            {search
              ? `${filtered.length} of ${history.data?.length ?? 0}`
              : (history.data?.length ?? 0)}{' '}
            {history.data?.length === 1 ? 'dictation' : 'dictations'}
          </span>
        </div>

        {history.isPending ? (
          <div className="space-y-5 p-6">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : history.isError ? (
          <div className="px-6 py-16 text-center">
            <h2 className="text-title font-semibold">History couldn’t load</h2>
            <p className="mt-2 mb-5 text-body text-muted">
              VoxType couldn’t read your local history. Nothing was deleted.
            </p>
            <Button onClick={() => void history.refetch()}>Try again</Button>
          </div>
        ) : !filtered.length ? (
          <div className="flex min-h-[390px] flex-col items-center justify-center px-6 py-16 text-center">
            <History size={26} strokeWidth={1.6} className="mb-5 text-faint" />
            <h2 className="text-title font-semibold">
              {search ? 'No matching transcripts' : 'No dictations yet'}
            </h2>
            <p className="mt-2 mb-6 max-w-sm text-body text-muted">
              {search
                ? 'Try another word or clear the search to see all transcripts.'
                : 'Finished dictations will appear here when local history is enabled.'}
            </p>
            {search ? (
              <Button variant="outline" onClick={() => setSearch('')}>
                Clear search
              </Button>
            ) : (
              <Button variant="primary" onClick={onRecord}>
                <AudioLines size={16} /> Start a dictation <ArrowRight size={14} />
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((item) => (
              <article
                className="px-6 py-5 transition-colors hover:bg-raised max-md:px-5"
                key={item.id}
              >
                <div className="flex justify-between gap-3 text-caption text-muted tabular-nums max-md:flex-wrap">
                  <time
                    dateTime={new Date(item.createdAt).toISOString()}
                    className="font-medium text-ink"
                  >
                    {new Intl.DateTimeFormat(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(item.createdAt)}
                  </time>
                  <span>
                    {duration(item.durationMs)} · {item.words} words
                  </span>
                </div>
                <p className="mt-3 max-w-4xl whitespace-pre-wrap [overflow-wrap:anywhere] text-body leading-7">
                  {item.text}
                </p>
                {item.originalText && (
                  <details className="mt-4 text-ui text-muted">
                    <summary className="w-fit cursor-pointer py-1 font-medium text-ink">
                      Original transcript
                    </summary>
                    <p className="my-2 max-w-4xl whitespace-pre-wrap [overflow-wrap:anywhere] text-body">
                      {item.originalText}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copy.mutate(item.originalText!)}
                    >
                      <Copy size={14} /> Copy original
                    </Button>
                  </details>
                )}
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-caption text-muted">
                    {item.delivery === 'pasted'
                      ? 'Pasted into the active app'
                      : item.delivery === 'copied'
                        ? 'Copied to the clipboard'
                        : 'Recorded in VoxType'}
                  </span>
                  <div className="flex gap-1 text-muted">
                    <IconButton label="Copy transcript" onClick={() => copy.mutate(item.text)}>
                      <Copy size={15} />
                    </IconButton>
                    <IconButton
                      label="Delete transcript"
                      onClick={() => remove.mutate(item.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <p className="mt-4 text-caption text-muted">
        VoxType keeps up to 200 dictations locally. Nothing is synced to the cloud.
      </p>
    </>
  );
}
