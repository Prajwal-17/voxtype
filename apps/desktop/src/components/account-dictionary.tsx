import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, native, useAuthUser } from '../lib/api';
import { errorMessage } from '../lib/types';
import { Button, IconButton } from './ui';
import { Input } from './ui/input';
import { XIcon } from './icons';
import { SectionHeader } from './layout';

export function AccountDictionaryEditor({ active }: { active: boolean }) {
  const { data: user } = useAuthUser();
  return <DictionaryWords key={user?.id ?? 'signed-out'} userId={user?.id} active={active} />;
}
function DictionaryWords({ userId, active }: { userId?: string; active: boolean }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const queryKey = ['dictionary', userId];
  const dictionary = useQuery({
    queryKey,
    queryFn: () => api.dictionary(userId!),
    enabled: native && !!userId,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const terms = dictionary.data?.terms ?? [];
  const save = useMutation({
    meta: { suppressErrorToast: true },
    mutationFn: ({ next, base }: { next: string[]; base: string[]; added?: boolean }) =>
      api.updateDictionary(userId!, base, next),
    onMutate: async () => {
      setError('');
      await client.cancelQueries({ queryKey });
    },
    onSuccess: (value, { added }) => {
      client.setQueryData(queryKey, value);
      if (added) setDraft('');
    },
    onError: (failure) => setError(errorMessage(failure)),
    onSettled: () => {
      void client.invalidateQueries({ queryKey });
    },
  });
  const locked = active || save.isPending || !native || !userId || !dictionary.data;
  const add = () => {
    const term = draft.trim();
    if (!term || locked) return;
    if (term.length > 100) return setError('Use up to 100 characters per word or phrase.');
    if (terms.length >= 100) return setError('Remove a word before adding another.');
    if (terms.some((word) => word.toLowerCase() === term.toLowerCase()))
      return setError('That term is already in your dictionary.');
    save.mutate({ next: [...terms, term], base: terms, added: true });
  };
  return (
    <>
      <SectionHeader title="Personal dictionary" />
      <p className="mb-4 text-ui text-muted">
        Names and words you use, synced across desktop and mobile.
      </p>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Word or phrase to add"
          placeholder="Add a word or phrase"
          value={draft}
          disabled={locked}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" disabled={locked || !draft.trim()} onClick={add}>
          Add
        </Button>
      </div>
      <p className="my-3 text-caption text-muted" aria-live="polite">
        {dictionary.isPending && native && userId
          ? 'Loading dictionary…'
          : `${terms.length} / 100 terms${save.isPending ? ' · Saving…' : ''}`}
      </p>
      {(error || dictionary.data?.syncError || dictionary.error) && (
        <div className="mb-3 flex items-center gap-2 text-caption">
          <p role="alert">
            {error || dictionary.data?.syncError || errorMessage(dictionary.error)}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={dictionary.isFetching || save.isPending}
            onClick={() => void dictionary.refetch()}
          >
            Retry
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {terms.map((term) => (
          <div
            key={term}
            className="flex max-w-full items-center rounded-full bg-subtle pl-3 text-ui text-accent"
          >
            <span className="min-w-0 truncate" title={term}>
              {term}
            </span>
            <IconButton
              label={`Remove ${term}`}
              disabled={locked}
              onClick={() =>
                save.mutate({ next: terms.filter((word) => word !== term), base: terms })
              }
            >
              <XIcon size={16} />
            </IconButton>
          </div>
        ))}
      </div>
    </>
  );
}
