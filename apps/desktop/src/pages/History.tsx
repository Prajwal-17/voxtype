import { useState, useDeferredValue, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  CopyIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  MicrophoneIcon,
  MagnifyingGlassIcon,
  TrashSimpleIcon,
} from '../components/icons';
import { PageHeader } from '../components/layout';
import { Loader } from '../components/loader';
import { Button } from '../components/ui';
import { Input } from '../components/ui/input';
import { RecordingPlayer } from '../components/recording-player';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../components/ui/alert-dialog';
import { api, native, useAuthUser, useHistory, useCopy, useSession } from '../lib/api';
import { duration, errorMessage, isActive } from '../lib/types';
import { libraryItems, type LibraryItem, type LibraryView } from '../lib/transcript-library';

export function HistoryPage({
  onRecord,
  initialId,
}: {
  onRecord: () => void;
  initialId?: string | null;
}) {
  const [view, setView] = useState<LibraryView>('transcripts');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [confirmation, setConfirmation] = useState<{
    kind: 'delete' | 'regenerate';
    item: LibraryItem;
  } | null>(null);
  const query = useDeferredValue(search);
  const auth = useAuthUser(),
    history = useHistory(view === 'transcripts' ? query : ''),
    copy = useCopy();
  const client = useQueryClient();
  const { data: session } = useSession();
  const active = isActive(session.phase);
  const recordings = useQuery({
    queryKey: ['local-recordings', auth.data?.id],
    queryFn: api.localRecordings,
    enabled: !!auth.data,
  });
  const readerHeading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const mutation = useMutation({
    meta: { suppressErrorToast: true },
    mutationFn: async (action: NonNullable<typeof confirmation>) => {
      if (action.kind === 'delete') await api.deleteHistory(action.item.id);
      else await api.regenerateTranscript(action.item.id, auth.data!.id);
    },
    onSuccess: (_, action) => {
      if (action.kind === 'delete') setSelectedId(null);
      else toast.success('Transcript regenerated');
      setConfirmation(null);
      void client.invalidateQueries({ queryKey: ['history'] });
      void client.invalidateQueries({ queryKey: ['local-recordings'] });
    },
  });
  const items = libraryItems(
    history.data?.pages.flatMap((page) => page.items) ?? [],
    recordings.data ?? [],
    view,
    query,
  );
  const selected = items.find((item) => item.id === selectedId);
  const searching = search !== query || (view === 'transcripts' && history.isPlaceholderData);
  const loading = view === 'transcripts' ? history.isPending : recordings.isPending;
  const failed = view === 'transcripts' ? history.isError : recordings.isError;
  const refresh = () => void (view === 'transcripts' ? history.refetch() : recordings.refetch());
  const select = (item: LibraryItem, button: HTMLButtonElement) => {
    selectedButton.current = button;
    setSelectedId(item.id);
    requestAnimationFrame(() => readerHeading.current?.focus({ preventScroll: true }));
  };
  const showConfirmation = (kind: 'delete' | 'regenerate', item: LibraryItem) => {
    mutation.reset();
    setConfirmation({ kind, item });
  };
  return (
    <>
      <PageHeader
        title="Transcripts"
        actions={
          <Button variant="primary" onClick={onRecord}>
            <MicrophoneIcon size={16} />
            New recording
          </Button>
        }
      />
      <div className="library-toolbar">
        <div className="compact-tabs" role="group" aria-label="Library view">
          {(['transcripts', 'recordings'] as const).map((kind) => (
            <button
              key={kind}
              aria-pressed={view === kind}
              onClick={() => {
                setView(kind);
                setSelectedId(null);
              }}
            >
              {kind === 'transcripts' ? 'Transcripts' : 'Recordings'}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <MagnifyingGlassIcon
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            ref={searchInput}
            type="search"
            placeholder={view === 'transcripts' ? 'Search transcripts' : 'Search recordings'}
            aria-label="Search library"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedId(null);
            }}
            className="pl-9"
          />
        </div>
      </div>
      <span className="sr-only" role="status">
        {searching ? 'Searching…' : ''}
      </span>
      {view === 'recordings' && (
        <p className="mb-3 text-caption text-muted">
          Latest 10 takes on this device. Audio stays on this device.
        </p>
      )}
      <div className="transcript-workspace" data-selected={!!selected} data-empty={!items.length}>
        <section
          className="transcript-list"
          aria-label={view === 'transcripts' ? 'Transcript list' : 'Recording list'}
          aria-busy={searching || loading}
        >
          {loading ? (
            <Loader />
          ) : failed && !items.length ? (
            <div className="library-empty" role="alert">
              <p>Couldn’t load {view}.</p>
              <Button onClick={refresh}>Retry</Button>
            </div>
          ) : searching && !items.length ? (
            <div className="library-empty">
              <p className="text-ui text-muted">Searching…</p>
            </div>
          ) : !items.length ? (
            <div className="library-empty">
              <FileTextIcon size={26} className="text-muted" aria-hidden="true" />
              <h2 className="text-title font-medium">
                {search
                  ? 'No matches'
                  : view === 'transcripts'
                    ? 'No transcripts yet'
                    : 'No saved recordings'}
              </h2>
              <p className="text-ui text-muted">
                {search ? 'Try another word or phrase.' : 'Your next recording will appear here.'}
              </p>
              <Button variant="outline" onClick={search ? () => setSearch('') : onRecord}>
                {search ? 'Clear search' : 'Start recording'}
              </Button>
            </div>
          ) : (
            <>
              {failed && (
                <div
                  className="flex items-center justify-between gap-2 px-4 py-2 text-caption text-muted"
                  role="status"
                >
                  Couldn’t refresh. Showing saved {view}.
                  <Button size="sm" variant="ghost" onClick={refresh}>
                    Retry
                  </Button>
                </div>
              )}
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      className="transcript-row"
                      aria-pressed={selectedId === item.id}
                      onClick={(e) => select(item, e.currentTarget)}
                    >
                      <span className="line-clamp-2 text-ui font-medium text-ink [overflow-wrap:anywhere]">
                        {item.text || 'Recording without a transcript'}
                      </span>
                      <span className="mt-2 flex items-center gap-2 text-caption text-muted">
                        <time dateTime={new Date(item.createdAt).toISOString()}>
                          {new Date(item.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </time>
                        <span>·</span>
                        <span>{duration(item.durationMs)}</span>
                        <span className="ml-auto">
                          {item.recording?.audioFile ? (
                            <MicrophoneIcon size={14} aria-label="Audio available" />
                          ) : (
                            `${item.words} words`
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {view === 'transcripts' && (history.hasNextPage || history.isFetchNextPageError) && (
                <div className="p-3">
                  <Button
                    className="w-full"
                    variant="ghost"
                    loading={history.isFetchingNextPage}
                    onClick={() => void history.fetchNextPage()}
                  >
                    {history.isFetchNextPageError ? 'Retry loading more' : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
        <section className="transcript-reader" aria-label="Transcript reader">
          {selected ? (
            <>
              <div className="reader-toolbar">
                <Button
                  variant="ghost"
                  size="sm"
                  className="reader-back"
                  onClick={() => {
                    setSelectedId(null);
                    requestAnimationFrame(() =>
                      (selectedButton.current?.isConnected
                        ? selectedButton.current
                        : searchInput.current
                      )?.focus(),
                    );
                  }}
                >
                  <ArrowLeftIcon size={16} />
                  Back
                </Button>
                <div className="min-w-0 flex-1">
                  <h2
                    ref={readerHeading}
                    tabIndex={-1}
                    className="text-ui font-semibold outline-none"
                  >
                    {new Date(selected.createdAt).toLocaleDateString(undefined, {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </h2>
                  <p className="mt-1 text-caption text-muted">
                    {new Date(selected.createdAt).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}{' '}
                    · {selected.words} words · {duration(selected.durationMs)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  disabled={!selected.text || copy.isPending}
                  onClick={() => copy.mutate(selected.text)}
                >
                  <CopyIcon size={16} />
                  Copy
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More transcript actions">
                      <DotsThreeIcon size={20} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={!selected.recording?.originalText || copy.isPending}
                      onSelect={() => copy.mutate(selected.recording!.originalText)}
                    >
                      <CopyIcon />
                      Copy original text
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!native || !selected.recording?.audioFile}
                      onSelect={() =>
                        void api
                          .exportRecording(selected.id)
                          .catch((e) => toast.error(errorMessage(e)))
                      }
                    >
                      <DownloadSimpleIcon />
                      Export audio
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={
                        !native || !selected.recording?.audioFile || active || mutation.isPending
                      }
                      onSelect={() => showConfirmation('regenerate', selected)}
                    >
                      <ArrowsClockwiseIcon />
                      Regenerate transcript
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-danger focus:text-danger"
                      disabled={!native || !selected.transcript || mutation.isPending}
                      onSelect={() => showConfirmation('delete', selected)}
                    >
                      <TrashSimpleIcon />
                      Delete transcript
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {selected.recording?.audioFile && auth.data && (
                <div className="px-5 pt-4">
                  <RecordingPlayer
                    key={`${auth.data.id}:${selected.id}`}
                    id={selected.id}
                    userId={auth.data.id}
                    disabled={active || mutation.isPending}
                    durationMs={selected.durationMs}
                  />
                </div>
              )}
              <div className="reader-content">
                <p className="select-text whitespace-pre-wrap text-transcript [overflow-wrap:anywhere]">
                  {selected.text ||
                    'No text was received. Play the recording or regenerate its transcript from the menu.'}
                </p>
              </div>
            </>
          ) : (
            <div className="library-empty">
              <FileTextIcon size={28} className="text-muted" aria-hidden="true" />
              <h2 className="text-title font-medium">Select a transcript</h2>
              <p className="max-w-[25ch] text-ui text-muted">
                Choose a transcript to read, copy, or listen to its recording.
              </p>
            </div>
          )}
        </section>
      </div>
      <AlertDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setConfirmation(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (readerHeading.current) readerHeading.current.focus();
            else searchInput.current?.focus();
          }}
        >
          <AlertDialogTitle>
            {confirmation?.kind === 'delete'
              ? 'Delete this transcript?'
              : 'Regenerate this transcript?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmation?.kind === 'delete'
              ? 'This removes the transcript from your account and synced devices. Its local audio and original text stay on this device until replaced by newer takes.'
              : 'VoxType will transcribe the saved audio again and replace the current text. The recording stays on this device.'}
          </AlertDialogDescription>
          {mutation.isError && (
            <p role="alert" className="text-ui text-danger">
              {errorMessage(mutation.error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant={confirmation?.kind === 'delete' ? 'danger' : 'primary'}
              loading={mutation.isPending}
              onClick={() => {
                if (confirmation) mutation.mutate(confirmation);
              }}
            >
              {confirmation?.kind === 'delete' ? 'Delete transcript' : 'Regenerate'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
