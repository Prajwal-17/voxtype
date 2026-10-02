import { useState, useDeferredValue } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, TrashSimpleIcon } from '../components/icons';
import { PageHeader } from '../components/layout';
import { Loader } from '../components/loader';
import { Button, IconButton } from '../components/ui';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { api, useHistory, useCopy } from '../lib/api';
import { duration } from '../lib/types';
export function HistoryPage({ onRecord }: { onRecord: () => void }) {
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search);
  const history = useHistory(query);
  const client = useQueryClient();
  const copy = useCopy();
  const remove = useMutation({
    mutationFn: api.deleteHistory,
    onSuccess: () => void client.invalidateQueries({ queryKey: ['history'] }),
  });
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      <PageHeader title="Transcripts" />
      <Input
        type="search"
        placeholder="Search transcripts"
        aria-label="Search transcripts"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="mb-5 max-w-sm"
      />
      <Card className="overflow-hidden border-0 shadow-none">
        {history.isPending ? (
          <Loader />
        ) : history.isError ? (
          <div className="p-8" role="alert">
            Couldn’t load transcripts. <Button onClick={() => void history.refetch()}>Retry</Button>
          </div>
        ) : !items.length ? (
          <div className="py-16 text-center">
            <p className="mb-5 text-muted">{search ? 'No matches' : 'No transcripts yet'}</p>
            <Button onClick={search ? () => setSearch('') : onRecord}>
              {search ? 'Clear search' : 'Record'}
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {items.map((item) => (
              <article key={item.id} className="px-6 py-5">
                <div className="flex items-center justify-between gap-3 text-caption text-muted tabular-nums">
                  <time dateTime={new Date(item.createdAt).toISOString()}>
                    {new Date(item.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                  <span>
                    {duration(item.durationMs)} · {item.words} words
                  </span>
                </div>
                <details className="group mt-3">
                  <summary className="cursor-pointer list-none whitespace-pre-wrap text-body [overflow-wrap:anywhere]">
                    <span className="line-clamp-2 group-open:hidden">
                      {item.text || 'Empty transcript'}
                    </span>
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap text-body [overflow-wrap:anywhere]">
                    {item.text}
                  </p>
                </details>
                <div className="mt-2 flex justify-end gap-1">
                  <IconButton label="Copy transcript" onClick={() => copy.mutate(item.text)}>
                    <CopyIcon size={16} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label="Delete transcript"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(item.id)}
                  >
                    <TrashSimpleIcon size={16} aria-hidden="true" />
                  </IconButton>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
      {history.hasNextPage && (
        <Button
          className="mx-auto mt-5 flex"
          variant="outline"
          loading={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </>
  );
}
