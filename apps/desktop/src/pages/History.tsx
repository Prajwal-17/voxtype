import { useMemo, useState } from 'react';
import { Search, Copy, Trash2, ArrowUpRight, History, AudioLines } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, useCopy, useHistory } from '../lib/api';
import { duration } from '../lib/types';
import { Button, Confirm, IconButton } from '../components/ui';
import { ui } from '../design-system/classes';

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
      <div className={ui.pageHeading}>
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
      <div className={ui.historyToolbar}>
        <label className={ui.searchField}>
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
        <div className={ui.loadingSurface}>
          <div />
          <div />
        </div>
      ) : history.isError ? (
        <div className={ui.emptyState}>
          <h2>History couldn’t load.</h2>
          <p>{String(history.error)}</p>
          <Button onClick={() => void history.refetch()}>Try again</Button>
        </div>
      ) : !filtered.length ? (
        <div className={ui.historyEmpty}>
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
            <article className={ui.historyItem} key={item.id}>
              <div className={ui.historyMeta}>
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
                <details className={ui.originalTranscript}>
                  <summary>Original transcript</summary>
                  <p>{item.originalText}</p>
                  <Button variant="ghost" onClick={() => copy.mutate(item.originalText!)}>
                    <Copy size={14} /> Copy original
                  </Button>
                </details>
              )}
              <div className={ui.historyItemFooter}>
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
      <footer className={ui.pageFooter}>
        <span>Up to 200 recent dictations. No cloud sync.</span>
        <span></span>
      </footer>
    </>
  );
}
