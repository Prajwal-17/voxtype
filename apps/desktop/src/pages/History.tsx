import { useState, useDeferredValue, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, TrashSimpleIcon } from '../components/icons';
import { PageHeader } from '../components/layout';
import { Loader } from '../components/loader';
import { Button, IconButton } from '../components/ui';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../components/ui/alert-dialog';
import { api, useHistory, useCopy } from '../lib/api';
import { duration, type HistoryItem } from '../lib/types';
export function HistoryPage({ onRecord }: { onRecord: () => void }) {
  const [search, setSearch] = useState(''),
    [deleting, setDeleting] = useState<HistoryItem | null>(null);
  const query = useDeferredValue(search),
    history = useHistory(query),
    client = useQueryClient(),
    copy = useCopy();
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const remove = useMutation({
    mutationFn: api.deleteHistory,
    onSuccess: () => {
      setDeleting(null);
      void client.invalidateQueries({ queryKey: ['history'] });
      void client.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <PageHeader title="Transcripts" />
      <Input
        type="search"
        placeholder="Search transcripts"
        aria-label="Search transcripts"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-5 max-w-sm"
      />
      <Card className="overflow-hidden shadow-none">
        {history.isPending ? (
          <Loader />
        ) : history.isError && !items.length ? (
          <div className="p-6" role="alert">
            Couldn’t load transcripts. <Button onClick={() => void history.refetch()}>Retry</Button>
          </div>
        ) : !items.length ? (
          <div className="py-12 text-center">
            <p className="mb-4 text-ui text-muted">
              {search ? 'No matches' : 'No transcripts yet'}
            </p>
            <Button onClick={search ? () => setSearch('') : onRecord}>
              {search ? 'Clear search' : 'Start recording'}
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {items.map((item) => (
              <article key={item.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-muted">
                  <time dateTime={new Date(item.createdAt).toISOString()}>
                    {new Date(item.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                  <span>
                    {item.words} words · {duration(item.durationMs)}
                  </span>
                </div>
                <details className="group mt-2">
                  <summary className="cursor-pointer text-body focus-visible:outline-2 focus-visible:outline-accent [overflow-wrap:anywhere]">
                    <span className="line-clamp-1 group-open:hidden">
                      {item.text.split('\n').find((l) => l.trim()) || 'Empty transcript'}
                    </span>
                    <span className="hidden text-ui font-medium text-accent group-open:inline">
                      Collapse transcript
                    </span>
                  </summary>
                  <p className="mt-3 select-text whitespace-pre-wrap text-body [overflow-wrap:anywhere]">
                    {item.text || 'Empty transcript'}
                  </p>
                </details>
                <div className="mt-1 flex justify-end gap-1">
                  <IconButton label="Copy transcript" onClick={() => copy.mutate(item.text)}>
                    <CopyIcon size={16} />
                  </IconButton>
                  <IconButton
                    label="Delete transcript"
                    disabled={remove.isPending}
                    onClick={(e) => {
                      deleteTrigger.current = e.currentTarget;
                      remove.reset();
                      setDeleting(item);
                    }}
                  >
                    <TrashSimpleIcon size={16} />
                  </IconButton>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
      {history.isFetchNextPageError && (
        <p role="alert" className="mt-4 text-ui text-danger">
          Couldn’t load more transcripts.
        </p>
      )}
      {(history.hasNextPage || history.isFetchNextPageError) && (
        <Button
          className="mx-auto mt-4 flex"
          variant="outline"
          loading={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {history.isFetchNextPageError ? 'Retry' : 'Load more'}
        </Button>
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (deleteTrigger.current?.isConnected) deleteTrigger.current.focus();
            else document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
          }}
        >
          <AlertDialogTitle>Delete this transcript?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the transcript from your account and this device’s cache. Other devices
            update after sync.
          </AlertDialogDescription>
          <p className="line-clamp-2 text-ui text-muted">{deleting?.text}</p>
          {remove.isError && (
            <p role="alert" className="text-ui text-danger">
              Deletion failed. The transcript is still available. Check your connection and retry.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep transcript</AlertDialogCancel>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                if (deleting) remove.mutate(deleting.id);
              }}
            >
              Delete transcript
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
