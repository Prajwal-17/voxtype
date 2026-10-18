import { useState, useDeferredValue, useEffect, useId, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowsClockwiseIcon,
  CopyIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  PlayIcon,
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
import { libraryItems, type LibraryItem } from '../lib/transcript-library';

function TranscriptRow({
  item,
  initialFocus,
  userId,
  audioOpen,
  onToggleAudio,
  playbackDisabled,
  pending,
  onConfirm,
}: {
  item: LibraryItem;
  initialFocus: boolean;
  userId?: string;
  audioOpen: boolean;
  onToggleAudio: () => void;
  playbackDisabled: boolean;
  pending: boolean;
  onConfirm: (kind: 'delete' | 'regenerate', item: LibraryItem, target: HTMLElement | null) => void;
}) {
  const id = useId();
  const row = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(initialFocus);
  const [originalOpen, setOriginalOpen] = useState(false);
  const copy = useCopy();
  const original = item.recording?.originalText;
  const hasAudio = !!item.recording?.audioFile;
  const longText = item.text.length > 360;
  useEffect(() => {
    if (initialFocus) {
      row.current?.focus({ preventScroll: true });
      row.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [initialFocus]);
  return (
    <article ref={row} className="transcript-entry" tabIndex={-1} aria-labelledby={`${id}-date`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-10 text-caption text-muted">
        <h2 id={`${id}-date`} className="font-medium">
          <time dateTime={new Date(item.createdAt).toISOString()}>
            {new Date(item.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </time>
        </h2>
        <span>{duration(item.durationMs)}</span>
        <span>{item.words} words</span>
        {!item.transcript && <span className="text-accent">Original</span>}
      </div>
      <p id={`${id}-text`} className="transcript-entry-text">
        {item.text
          ? longText && !expanded
            ? `${item.text.slice(0, 360).trimEnd()}…`
            : item.text
          : 'No transcript yet. Listen to the recording or regenerate its text.'}
      </p>
      {longText && (
        <Button
          variant="link"
          size="sm"
          className="mt-1 px-0"
          aria-expanded={expanded}
          aria-controls={`${id}-text`}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
      <div className="transcript-actions">
        <Button
          variant="outline"
          size="sm"
          disabled={!item.text || copy.isPending}
          onClick={() => copy.mutate(item.text)}
        >
          <CopyIcon size={16} aria-hidden="true" />
          Copy
        </Button>
        {original && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={originalOpen}
            aria-controls={`${id}-original`}
            onClick={() => setOriginalOpen(!originalOpen)}
          >
            <FileTextIcon size={16} aria-hidden="true" />
            {originalOpen ? 'Hide original' : 'View original'}
          </Button>
        )}
        {hasAudio && (
          <>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={audioOpen}
              aria-controls={`${id}-audio`}
              onClick={onToggleAudio}
            >
              <PlayIcon size={16} aria-hidden="true" />
              {audioOpen ? 'Hide audio' : 'Listen'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!native || playbackDisabled}
              onClick={() => onConfirm('regenerate', item, row.current)}
            >
              <ArrowsClockwiseIcon size={16} aria-hidden="true" />
              Regenerate
            </Button>
          </>
        )}
        {(hasAudio || item.transcript) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="transcript-more"
                aria-label="More transcript actions"
              >
                <DotsThreeIcon size={20} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hasAudio && (
                <DropdownMenuItem
                  disabled={!native}
                  onSelect={() =>
                    void api.exportRecording(item.id).catch((e) => toast.error(errorMessage(e)))
                  }
                >
                  <DownloadSimpleIcon />
                  Export audio
                </DropdownMenuItem>
              )}
              {hasAudio && item.transcript && <DropdownMenuSeparator />}
              {item.transcript && (
                <DropdownMenuItem
                  className="text-danger focus:text-danger"
                  disabled={!native || pending}
                  onSelect={() => onConfirm('delete', item, row.current)}
                >
                  <TrashSimpleIcon />
                  Delete transcript
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {audioOpen && hasAudio && userId && (
        <div id={`${id}-audio`} className="mt-3">
          <RecordingPlayer
            key={`${userId}:${item.id}`}
            id={item.id}
            userId={userId}
            disabled={playbackDisabled}
            durationMs={item.durationMs}
          />
        </div>
      )}
      {originalOpen && original && (
        <section
          id={`${id}-original`}
          className="transcript-original"
          aria-labelledby={`${id}-original-heading`}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 id={`${id}-original-heading`} className="text-ui font-semibold">
              Original text
            </h3>
            <Button
              variant="ghost"
              size="sm"
              disabled={copy.isPending}
              onClick={() => copy.mutate(original)}
            >
              <CopyIcon size={16} aria-hidden="true" />
              Copy original
            </Button>
          </div>
          <p className="transcript-entry-text">{original}</p>
        </section>
      )}
    </article>
  );
}

export function HistoryPage({
  onRecord,
  initialId,
}: {
  onRecord: () => void;
  initialId?: string | null;
}) {
  const [search, setSearch] = useState('');
  const [audioId, setAudioId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    kind: 'delete' | 'regenerate';
    item: LibraryItem;
  } | null>(null);
  const query = useDeferredValue(search);
  const auth = useAuthUser(),
    history = useHistory(query);
  const client = useQueryClient();
  const { data: session } = useSession();
  const active = isActive(session.phase);
  const recordings = useQuery({
    queryKey: ['local-recordings', auth.data?.id],
    queryFn: api.localRecordings,
    enabled: !!auth.data,
  });
  const confirmationTarget = useRef<HTMLElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const mutation = useMutation({
    meta: { suppressErrorToast: true },
    mutationFn: async (action: NonNullable<typeof confirmation>) => {
      if (action.kind === 'delete') await api.deleteHistory(action.item.id);
      else await api.regenerateTranscript(action.item.id, auth.data!.id);
    },
    onSuccess: (_, action) => {
      if (action.kind === 'regenerate') toast.success('Transcript regenerated');
      setConfirmation(null);
      void client.invalidateQueries({ queryKey: ['history'] });
      void client.invalidateQueries({ queryKey: ['local-recordings'] });
    },
  });
  const items = libraryItems(
    history.data?.pages.flatMap((page) => page.items) ?? [],
    recordings.data ?? [],
    query,
  );
  const searching = search !== query || history.isPlaceholderData;
  const loading = history.isPending || recordings.isPending;
  const failed = history.isError || recordings.isError;
  const refresh = () => {
    void history.refetch();
    void recordings.refetch();
  };
  const showConfirmation = (
    kind: 'delete' | 'regenerate',
    item: LibraryItem,
    target: HTMLElement | null,
  ) => {
    confirmationTarget.current = target;
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
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <MagnifyingGlassIcon
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            ref={searchInput}
            type="search"
            placeholder="Search transcripts"
            aria-label="Search library"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setAudioId(null);
            }}
            className="pl-9"
          />
        </div>
      </div>
      <span className="sr-only" role="status">
        {searching ? 'Searching…' : ''}
      </span>
      <div className="transcript-library">
        <section
          className="transcript-list"
          aria-label="Transcript list"
          aria-busy={searching || loading}
        >
          {loading && !items.length ? (
            <Loader />
          ) : failed && !items.length ? (
            <div className="library-empty" role="alert">
              <p>Couldn’t load transcripts.</p>
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
                {search ? 'No matches' : 'No transcripts yet'}
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
                  Couldn’t refresh everything. Showing saved transcripts.
                  <Button size="sm" variant="ghost" onClick={refresh}>
                    Retry
                  </Button>
                </div>
              )}
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <TranscriptRow
                      item={item}
                      initialFocus={initialId === item.id}
                      userId={auth.data?.id}
                      audioOpen={audioId === item.id}
                      onToggleAudio={() => setAudioId(audioId === item.id ? null : item.id)}
                      playbackDisabled={active || mutation.isPending}
                      pending={mutation.isPending}
                      onConfirm={showConfirmation}
                    />
                  </li>
                ))}
              </ul>
              {(history.hasNextPage || history.isFetchNextPageError) && (
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
            if (confirmationTarget.current?.isConnected) confirmationTarget.current.focus();
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
