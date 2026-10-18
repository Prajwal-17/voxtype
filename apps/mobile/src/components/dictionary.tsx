import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { nativeTheme as theme } from '@voxtype/shared';
import { IconButton, Text } from './primitives';
import { styles } from './styles';
import { useAppState } from '../state/app-state';
import Native from '../../modules/voxtype-native/src/VoxTypeNativeModule';
const c = theme.colors;

export function Dictionary({ terms, disabled }: { terms: string[]; disabled: boolean }) {
  const app = useAppState();
  const { available, refresh } = app;
  const [draft, setDraft] = useState(''),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!available) return;
    void Native.syncVocabulary()
      .catch(() => {})
      .then(() => refresh())
      .catch(() => {});
  }, [available, refresh]);
  const locked = disabled || saving || !app.user;
  const save = async (next: string[], added = false) => {
    if (locked) return;
    setSaving(true);
    setError('');
    try {
      await Native.setVocabulary(next, terms, app.user!.id);
      await app.refresh();
      if (added) setDraft('');
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Couldn’t sync your dictionary. Try again.',
      );
    } finally {
      setSaving(false);
    }
  };
  const add = () => {
    const term = draft.trim();
    if (!term || locked) return;
    if (term.length > 100) return setError('Use up to 100 characters per word or phrase.');
    if (terms.length >= 100)
      return setError('Your dictionary is full. Remove a term to add another.');
    if (terms.some((saved) => saved.toLocaleLowerCase() === term.toLocaleLowerCase()))
      return setError('That term is already in your dictionary.');
    void save([...terms, term], true);
  };
  return (
    <View style={{ gap: 16 }}>
      <Text style={styles.muted}>
        Help VoxType recognize names and words you use. Synced with your account across desktop and
        mobile, including the voice bubble.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          accessibilityLabel="Word or phrase to add"
          placeholder="Add a word or phrase"
          placeholderTextColor={c.textMuted}
          editable={!locked}
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            setError('');
          }}
          onSubmitEditing={add}
          submitBehavior="submit"
          returnKeyType="done"
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            flex: 1,
            minHeight: 48,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: c.surfaceSubtle,
            color: c.text,
            fontFamily: 'MonaSansRegular',
            fontSize: 15,
          }}
        />
        <IconButton label="Add term" disabled={locked || !draft.trim()} onPress={add}>
          <PlusIcon size={22} color={c.primary} />
        </IconButton>
      </View>
      {!!(error || app.snapshot?.dictionarySyncError) && (
        <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 13 }}>
          {error || app.snapshot?.dictionarySyncError}
        </Text>
      )}
      <View style={{ gap: 8 }}>
        <Text style={styles.muted}>
          {terms.length} / 100 terms{saving ? ' · Saving…' : ''}
        </Text>
        {terms.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {terms.map((term) => (
              <View
                key={term}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minWidth: 0,
                  maxWidth: '100%',
                  paddingLeft: 14,
                  borderRadius: 24,
                  backgroundColor: c.primaryContainer,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ minWidth: 0, flexShrink: 1, color: c.primary, paddingVertical: 8 }}
                >
                  {term}
                </Text>
                <IconButton
                  label={`Remove ${term}`}
                  disabled={locked}
                  onPress={() => void save(terms.filter((saved) => saved !== term))}
                >
                  <XIcon size={16} color={c.primary} />
                </IconButton>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>Add a name, brand, or specialist term to get started.</Text>
        )}
      </View>
    </View>
  );
}
