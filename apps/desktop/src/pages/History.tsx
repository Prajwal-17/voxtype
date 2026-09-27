import { useMemo, useState } from 'react';
import { ArrowUpRight, AudioLines, Copy, History, Search, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, useCopy, useHistory } from '../lib/api';
import { duration } from '../lib/types';
import { PageHeader } from '../components/layout';
import { Button, Confirm, IconButton } from '../components/ui';
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
        description="Recent transcripts saved on this device."
        actions={
          !!history.data?.length && (
            <Confirm
              title="Delete all history?"
              description="This removes saved transcripts from this device. This cannot be undone."
              onConfirm={() => remove.mutate(null)}
              pending={remove.isPending}
              trigger={
                <Button variant="ghost">
                  <Trash2 size={15} /> Clear history
                </Button>
              }
            />
          )
        }
      />
      <div className="mb-1 flex items-center justify-between gap-5 border-b border-line pb-5 max-md:gap-3">
        <label className="flex w-80 max-w-full items-center gap-2 rounded-control border border-line bg-surface px-3 text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <Search size={17} className="shrink-0" />
          <Input
            type="search"
            placeholder="Find something you said…"
            aria-label="Search history"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="py-2.5"
          />
        </label>
        <span className="shrink-0 text-caption text-muted">
          {history.data?.length ?? 0} dictations
        </span>
      </div>
      {history.isPending ? (
        <div className="flex flex-col gap-5 py-5">
          <Skeleton className="h-6 w-2/5" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : history.isError ? (
        <div className="px-5 py-16">
          <h2 className="text-title font-medium">History couldn’t load.</h2>
          <p className="mt-3 mb-6 text-muted">{String(history.error)}</p>
          <Button onClick={() => void history.refetch()}>Try again</Button>
        </div>
      ) : !filtered.length ? (
        <div className="flex flex-col items-center px-6 py-20 text-center max-md:px-0 max-md:py-12">
          <span className="mb-5 text-muted">
            <History size={30} strokeWidth={1.3} />
          </span>
          <h2 className="text-title font-medium">
            {search ? 'No matching transcripts' : 'No dictations yet'}
          </h2>
          <p className="mt-2 mb-6 max-w-sm text-ui text-muted">
            {search
              ? 'Try a different word or clear your search.'
              : 'Finished dictations appear here when local history is enabled.'}
          </p>
          {search ? (
            <Button onClick={() => setSearch('')}>Clear search</Button>
          ) : (
            <Button onClick={onRecord}>
              <AudioLines size={16} /> Make your first dictation <ArrowUpRight size={14} />
            </Button>
          )}
        </div>
      ) : (
        <div>
          {filtered.map((item) => (
            <article className="border-b border-line py-6" key={item.id}>
              <div className="flex justify-between gap-3 text-caption text-muted tabular-nums max-md:flex-wrap">
                <time dateTime={new Date(item.createdAt).toISOString()}>
                  {new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(item.createdAt)}
                </time>
                <span>
                  {duration(item.durationMs)} <span className="px-1">·</span> {item.words} words
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap [overflow-wrap:anywhere] text-body leading-[1.85]">
                {item.text}
              </p>
              {item.originalText && (
                <details className="my-4 text-ui text-muted">
                  <summary className="w-fit cursor-pointer py-1.5 font-medium">
                    Original transcript
                  </summary>
                  <p className="my-2 whitespace-pre-wrap [overflow-wrap:anywhere] text-body">
                    {item.originalText}
                  </p>
                  <Button variant="ghost" onClick={() => copy.mutate(item.originalText!)}>
                    <Copy size={14} /> Copy original
                  </Button>
                </details>
              )}
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-caption text-muted">
                  {item.delivery === 'pasted'
                    ? 'Paste sent'
                    : item.delivery === 'copied'
                      ? 'Copied to clipboard'
                      : 'Recorded in Flow'}
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
      <footer className="mt-5 flex items-center justify-between gap-4 text-caption text-muted max-md:flex-wrap max-md:gap-2">
        <span className="flex items-center gap-1.5">
          Up to 200 recent dictations. No cloud sync.
        </span>
        <span></span>
      </footer>
    </>
  );
}
