import { useState } from 'react';
import { FlatList, Modal, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { nativeTheme as theme } from '@voxtype/shared';
import { LocalRecovery } from '../components/local-recovery';
import { Screen } from '../components/screen';
import { Action, Card, Loader, Text } from '../components/primitives';
import { styles as ui } from '../components/styles';
import { useAppState, useTranscripts } from '../state/app-state';
import Native from '../../modules/voxtype-native/src/VoxTypeNativeModule';
import type { Dictation } from '../../modules/voxtype-native/src/VoxTypeNative.types';
const c = theme.colors;
export default function TranscriptsScreen() {
  const app = useAppState(),
    [search, setSearch] = useState(''),
    query = useTranscripts(search),
    [deleting, setDeleting] = useState<Dictation | null>(null),
    [deleteError, setDeleteError] = useState('');
  const confirm = () =>
    void app.run(async () => {
      if (!deleting) return;
      try {
        await Native.deleteTranscript(deleting.id);
        setDeleting(null);
        setDeleteError('');
        await query.refresh();
        app.notify('Deleted');
      } catch {
        setDeleteError('Couldn’t delete. Check your connection and retry.');
      }
    });
  return (
    <Screen title="Transcripts" scroll={false}>
      <FlatList
        data={query.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <LocalRecovery />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search transcripts"
              placeholderTextColor={c.textMuted}
              accessibilityLabel="Search transcripts"
              autoCapitalize="none"
              style={{
                minHeight: 48,
                borderWidth: 1,
                borderColor: c.borderStrong,
                borderRadius: 10,
                paddingHorizontal: 14,
                color: c.text,
                fontFamily: 'MonaSansRegular',
                fontSize: 16,
                backgroundColor: c.surface,
              }}
            />
          </View>
        }
        renderItem={({ item }) => (
          <TranscriptRow
            item={item}
            onCopy={() =>
              void app.run(async () => {
                await Clipboard.setStringAsync(item.text);
                app.notify('Copied');
              })
            }
            onDelete={() => {
              setDeleteError('');
              setDeleting(item);
            }}
          />
        )}
        ListEmptyComponent={
          query.loading ? (
            <Loader />
          ) : (
            <View style={{ gap: 16, paddingVertical: 24 }}>
              <Text style={ui.muted}>
                {query.error
                  ? 'Transcripts unavailable'
                  : search
                    ? 'No matches'
                    : 'No transcripts yet'}
              </Text>
              <Action
                label={query.error ? 'Retry' : search ? 'Clear search' : 'Start recording'}
                secondary
                onPress={
                  query.error
                    ? () => void query.refresh()
                    : search
                      ? () => setSearch('')
                      : () => router.navigate('/(tabs)/home')
                }
              />
            </View>
          )
        }
        ListFooterComponent={
          query.items.length > 0 && (query.cursor || query.error || query.loading) ? (
            <View style={{ gap: 12 }}>
              {query.error && (
                <Text accessibilityLiveRegion="polite" style={{ color: c.danger }}>
                  Couldn’t load more transcripts
                </Text>
              )}
              <Action
                label={query.loading ? 'Loading' : query.error ? 'Retry' : 'Load more'}
                secondary
                disabled={query.loading}
                onPress={() => void query.more()}
              />
            </View>
          ) : null
        }
      />
      <Modal
        visible={!!deleting}
        transparent
        animationType="none"
        onRequestClose={() => {
          if (!app.busy) setDeleting(null);
        }}
      >
        <View
          style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#23332d88' }}
        >
          <Card style={{ gap: 16 }}>
            <View accessibilityViewIsModal>
              <Text accessibilityRole="header" style={ui.title}>
                Delete this transcript?
              </Text>
              <Text style={[ui.muted, { marginTop: 12 }]}>
                This removes the cleaned transcript from your account and synced cache. Local
                recordings and originals remain until replaced by newer takes. Other devices update
                after sync.
              </Text>
              <Text numberOfLines={2} style={{ marginTop: 12 }}>
                {deleting?.text}
              </Text>
              {!!deleteError && (
                <Text accessibilityLiveRegion="polite" style={{ marginTop: 12, color: c.danger }}>
                  {deleteError}
                </Text>
              )}
            </View>
            <Action
              label="Keep transcript"
              secondary
              disabled={app.busy}
              onPress={() => setDeleting(null)}
            />
            <Action
              label={app.busy ? 'Deleting' : 'Delete transcript'}
              disabled={app.busy || !app.available}
              onPress={confirm}
            />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
function TranscriptRow({
  item,
  onCopy,
  onDelete,
}: {
  item: Dictation;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse transcript' : 'Expand transcript'}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        {!expanded && <Text numberOfLines={2}>{item.text || 'Empty transcript'}</Text>}
        <Text style={[ui.muted, { marginTop: 6, color: c.primary }]}>
          {expanded ? 'Collapse ↑' : 'Expand ↓'}
        </Text>
      </Pressable>
      {expanded && (
        <Text selectable style={{ marginTop: 8 }}>
          {item.text || 'Empty transcript'}
        </Text>
      )}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 8,
          gap: 8,
        }}
      >
        <Text style={[ui.muted, { flex: 1 }]}>
          {new Date(item.createdAt).toLocaleString()} · {item.wordCount} words ·{' '}
          {(item.durationMs / 60000).toFixed(1)} min
        </Text>
        <View style={{ flexDirection: 'row' }}>
          {[
            { label: 'Copy transcript', onPress: onCopy, icon: CopyIcon },
            { label: 'Delete transcript', onPress: onDelete, icon: TrashIcon },
          ].map(({ label, onPress, icon: Icon }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={onPress}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={20} color={c.primary} />
            </Pressable>
          ))}
        </View>
      </View>
    </Card>
  );
}
