import { useMemo, useState } from 'react';
import { Search, Copy, Trash2, ArrowUpRight, History, AudioLines } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, useCopy, useHistory } from '../lib/api';
import { duration } from '../lib/types';
import { Button, Confirm, IconButton } from '../components/ui';

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
      <div className="mb-7 flex items-center justify-between gap-5 [&_h1]:text-heading [&_h1]:font-semibold [&_h1]:tracking-[-.035em] [&_h1]:text-balance [&_p]:mt-2 [&_p]:text-ui [&_p]:text-muted max-[700px]:flex-wrap max-[700px]:items-start max-[700px]:gap-3 max-[700px]:[&_h1]:text-[26px]">
        <div>
          <h1>History</h1>
          <p>Recent transcripts saved on this device.</p>
        </div>
        {!!history.data?.length && (
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
        )}
      </div>
      <div className="mb-1 flex items-center justify-between gap-5 border-b border-line pb-5 [&>span]:shrink-0 [&>span]:text-caption [&>span]:text-muted max-[700px]:gap-3">
        <label className="flex w-80 max-w-full items-center gap-2 rounded-control border border-line bg-surface px-3 text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:py-2.5 [&_input]:text-ui [&_input]:text-ink [&_input]:outline-none [&_input]:placeholder:text-muted">
          <Search size={17} />
          <input
            type="search"
            placeholder="Find something you said…"
            aria-label="Search history"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span>{history.data?.length ?? 0} dictations</span>
      </div>
      {history.isPending ? (
        <div className="flex flex-col gap-5 py-5 [&>div]:h-6 [&>div]:w-2/5 [&>div]:rounded-control [&>div]:bg-line [&>div:last-child]:h-72 [&>div:last-child]:w-full">
          <div />
          <div />
        </div>
      ) : history.isError ? (
        <div className="px-5 py-16 [&_p]:mt-3 [&_p]:mb-6 [&_p]:text-muted">
          <h2>History couldn’t load.</h2>
          <p>{String(history.error)}</p>
          <Button onClick={() => void history.refetch()}>Try again</Button>
        </div>
      ) : !filtered.length ? (
        <div className="flex flex-col items-center px-6 py-20 text-center [&_h2]:text-title [&_h2]:font-medium [&_p]:mt-2 [&_p]:mb-6 [&_p]:max-w-sm [&_p]:text-ui [&_p]:text-muted max-[700px]:px-0 max-[700px]:py-12 max-[700px]:[&_button]:whitespace-normal">
          <span className="mb-5 text-muted">
            <History size={30} strokeWidth={1.3} />
          </span>
          <h2>{search ? 'No matching transcripts' : 'No dictations yet'}</h2>
          <p>
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
            <article
              className="border-b border-line py-6 [&>p]:mt-3 [&>p]:whitespace-pre-wrap [&>p]:[overflow-wrap:anywhere] [&>p]:text-body [&>p]:leading-[1.85]"
              key={item.id}
            >
              <div className="flex justify-between gap-3 text-caption text-muted tabular-nums [&>span_span]:px-1 max-[700px]:flex-wrap">
                <time dateTime={new Date(item.createdAt).toISOString()}>
                  {new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(item.createdAt)}
                </time>
                <span>
                  {duration(item.durationMs)} <span>·</span> {item.words} words
                </span>
              </div>
              <p>{item.text}</p>
              {item.originalText && (
                <details className="my-4 text-ui text-muted [&_summary]:w-fit [&_summary]:cursor-pointer [&_summary]:py-1.5 [&_summary]:font-medium [&_p]:my-2 [&_p]:whitespace-pre-wrap [&_p]:[overflow-wrap:anywhere] [&_p]:text-body">
                  <summary>Original transcript</summary>
                  <p>{item.originalText}</p>
                  <Button variant="ghost" onClick={() => copy.mutate(item.originalText!)}>
                    <Copy size={14} /> Copy original
                  </Button>
                </details>
              )}
              <div className="mt-3 flex items-center justify-between gap-3 [&>span]:text-caption [&>span]:text-muted [&>div]:flex [&>div]:gap-1 [&>div]:text-muted">
                <span>
                  {item.delivery === 'pasted'
                    ? 'Paste sent'
                    : item.delivery === 'copied'
                      ? 'Copied to clipboard'
                      : 'Recorded in Flow'}
                </span>
                <div>
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
      <footer className="mt-5 flex items-center justify-between gap-4 text-caption text-muted [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 max-[700px]:flex-wrap max-[700px]:gap-2">
        <span>Up to 200 recent dictations. No cloud sync.</span>
        <span></span>
      </footer>
    </>
  );
}
