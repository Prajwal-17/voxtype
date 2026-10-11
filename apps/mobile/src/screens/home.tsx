import { View } from 'react-native';
import { router, usePathname } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { MicrophoneIcon } from 'phosphor-react-native/src/icons/Microphone';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { nativeTheme as theme } from '@voxtype/shared';
import { Screen } from '../components/screen';
import { Action, Card, Loader, Text } from '../components/primitives';
import { Metrics } from '../components/analytics';
import { LiveWaveform } from '../components/live-waveform';
import { styles as ui } from '../components/styles';
import { useAppState, useAnalyticsData, useTranscripts } from '../state/app-state';
export default function HomeScreen() {
  const app = useAppState(),
    analytics = useAnalyticsData('30d'),
    history = useTranscripts(),
    path = usePathname();
  const take = app.snapshot?.inApp,
    recording = take?.status === 'listening',
    processing = take?.status === 'processing';
  const bubbleActive = ['listening', 'processing', 'connecting'].includes(
    app.snapshot?.status ?? '',
  );
  const copy = (text: string) =>
    void app.run(async () => {
      await Clipboard.setStringAsync(text);
      app.notify('Copied');
    });
  return (
    <Screen title="Home">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              backgroundColor: theme.colors.primaryContainer,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MicrophoneIcon size={25} color={theme.colors.primary} />
          </View>
          <Text style={ui.title}>Dictation</Text>
        </View>
        {recording && (
          <View style={{ marginTop: 12 }}>
            <Text accessibilityLiveRegion="polite" style={ui.muted}>
              Recording
            </Text>
            <LiveWaveform active={recording && path.endsWith('/home')} />
          </View>
        )}
        {processing && <Loader label="Transcribing" />}
        <View style={{ marginTop: 16, gap: 10 }}>
          {recording ? (
            <Action
              label="Finish recording"
              disabled={app.busy}
              onPress={() => void app.finish()}
            />
          ) : !processing ? (
            <Action
              label={take?.text ? 'Record again' : 'Start recording'}
              disabled={!app.available || app.busy || bubbleActive}
              onPress={() => void app.record()}
            />
          ) : null}
          {(recording || processing) && (
            <Action
              label="Cancel"
              secondary
              disabled={app.busy}
              onPress={() => void app.cancel()}
            />
          )}
        </View>
        {!!take?.text && (
          <View style={{ gap: 12, marginTop: 16 }}>
            <Text selectable>{take.text}</Text>
            <Action label="Copy text" secondary onPress={() => copy(take.text)} />
          </View>
        )}
        {!!take?.error && (
          <Text
            accessibilityLiveRegion="polite"
            style={{ marginTop: 12, color: theme.colors.danger }}
          >
            {take.error}
          </Text>
        )}
        {!app.available && (
          <Text style={[ui.muted, { marginTop: 12 }]}>
            Recording is available in the installed app.
          </Text>
        )}
      </Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={ui.muted}>Last 30 days</Text>
        <Action label="Insights →" secondary onPress={() => router.navigate('/(tabs)/insights')} />
      </View>
      {analytics.loading ? (
        <Loader />
      ) : analytics.error ? (
        <Action label="Retry overview" secondary onPress={analytics.retry} />
      ) : (
        analytics.data && <Metrics data={analytics.data} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={ui.title}>Recent transcripts</Text>
        <Action
          label="View all →"
          secondary
          onPress={() => router.navigate('/(tabs)/transcripts')}
        />
      </View>
      {history.loading && !history.items.length ? (
        <Loader />
      ) : history.error ? (
        <Action label="Retry transcripts" secondary onPress={() => void history.refresh()} />
      ) : !history.items.length ? (
        <Text style={ui.muted}>No transcripts yet</Text>
      ) : (
        history.items.slice(0, 3).map((item) => (
          <View
            key={item.id}
            style={{
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: 8,
              gap: 6,
            }}
          >
            <Text numberOfLines={2}>{item.text}</Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <Text style={[ui.muted, { flex: 1 }]}>
                {new Date(item.createdAt).toLocaleDateString()} · {item.wordCount} words
              </Text>
              <Action
                label="Copy"
                secondary
                icon={<CopyIcon size={18} color={theme.colors.primary} />}
                onPress={() => copy(item.text)}
              />
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}
