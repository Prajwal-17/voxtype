import { useState } from 'react';
import { TextInput } from 'react-native';
import { nativeTheme as theme } from '@voxtype/shared';
import { Action, Card, Text } from './primitives';
import { styles } from './styles';
import { useAppState } from '../state/app-state';
import Native from '../../modules/voxtype-native/src/VoxTypeNativeModule';

export function Dictionary({ terms, disabled }: { terms: string[]; disabled: boolean }) {
  const app = useAppState();
  const [draft, setDraft] = useState(terms.join('\n'));
  const parsed = [
    ...new Set(
      draft
        .split('\n')
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ];
  const valid = parsed.length <= 100 && parsed.every((term) => term.length <= 100);
  const dirty = JSON.stringify(parsed) !== JSON.stringify(terms);
  return (
    <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={styles.title}>
        Personal dictionary
      </Text>
      <Text style={styles.muted}>
        Names and specialist terms, one per line. Saved on this device and used for both recording
        modes.
      </Text>
      <TextInput
        accessibilityLabel="Personal dictionary terms"
        multiline
        editable={!disabled}
        value={draft}
        onChangeText={setDraft}
        textAlignVertical="top"
        autoCorrect={false}
        style={{
          minHeight: 140,
          padding: 12,
          borderWidth: 1,
          borderRadius: 12,
          borderColor: theme.colors.border,
          color: theme.colors.text,
        }}
      />
      <Text style={styles.muted}>{parsed.length} / 100 terms · Up to 100 characters each</Text>
      {!valid && (
        <Text accessibilityRole="alert">Use at most 100 terms, each up to 100 characters.</Text>
      )}
      <Action
        label="Save dictionary"
        disabled={disabled || !valid || !dirty}
        onPress={() =>
          void app.run(async () => {
            await Native.setVocabulary(parsed);
            await app.refresh();
            app.notify('Dictionary saved');
          })
        }
      />
      {dirty && (
        <Action
          label="Discard changes"
          secondary
          disabled={disabled}
          onPress={() => setDraft(terms.join('\n'))}
        />
      )}
    </Card>
  );
}
