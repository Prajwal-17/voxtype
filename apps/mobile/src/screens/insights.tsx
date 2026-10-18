import { useState } from 'react';
import { DotsThreeIcon } from 'phosphor-react-native/src/icons/DotsThree';
import { nativeTheme } from '@voxtype/shared';
import { Sheet } from '../components/sheet';
import { View } from 'react-native';
import { minutes, type AnalyticsRange } from '@voxtype/shared/analytics';
import { Screen } from '../components/screen';
import { Action, IconButton, SettingLink, Loader, Text } from '../components/primitives';
import { RangeControl, Metrics, ActivityCalendar, TrendChart } from '../components/analytics';
import { styles as ui } from '../components/styles';
import { useAppState, useAnalyticsData } from '../state/app-state';
import { exportInsights } from '../lib/mobile-api';
export default function InsightsScreen() {
  const app = useAppState(),
    [range, setRange] = useState<AnalyticsRange>('30d'),
    query = useAnalyticsData(range),
    data = query.data,
    [definitions, setDefinitions] = useState(false),
    [menu, setMenu] = useState(false);
  return (
    <Screen
      title="Insights"
      actions={
        <IconButton label="Insights actions" onPress={() => setMenu(true)}>
          <DotsThreeIcon size={24} weight="bold" color={nativeTheme.colors.textMuted} />
        </IconButton>
      }
    >
      <RangeControl value={range} onChange={setRange} />
      {query.error && data && (
        <Action label="Retry insights refresh" secondary onPress={query.retry} />
      )}
      {query.loading && !data ? (
        <Loader />
      ) : query.error && !data ? (
        <>
          <Text style={ui.muted}>Insights unavailable</Text>
          <Action label="Retry" secondary onPress={query.retry} />
        </>
      ) : (
        data && (
          <>
            <Metrics data={data} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {[
                `${data.summary.dictations} dictations`,
                `${data.summary.dictations ? minutes(data.summary.averageDurationMs) : '—'} min / session`,
                `${data.summary.activeDays} active days`,
                `${data.streaks.longest} days longest streak`,
              ].map((value) => (
                <Text key={value} style={ui.muted}>
                  {value}
                </Text>
              ))}
            </View>
            <ActivityCalendar key={data.activity.start} data={data} />
            <TrendChart data={data} />
          </>
        )
      )}
      <Sheet title="Insights actions" visible={menu} onClose={() => setMenu(false)}>
        <SettingLink
          label="How metrics are calculated"
          onPress={() => {
            setMenu(false);
            setDefinitions(true);
          }}
        />
        <SettingLink
          label="Export CSV"
          disabled={!app.available || app.busy || !data?.summary.dictations}
          onPress={() => {
            setMenu(false);
            void app.run(() => exportInsights(range));
          }}
        />
      </Sheet>
      <Sheet
        title="About your insights"
        visible={definitions}
        onClose={() => setDefinitions(false)}
      >
        <Text style={[ui.muted, { paddingBottom: 20 }]}>
          Speed is words divided by recorded minutes. Average session is minutes divided by
          dictations. Streaks use full account history and end today or yesterday. Canceled
          recordings and microphone tests are excluded. Dates use {data?.timezone}. Pending uploads
          appear after sync.
        </Text>
      </Sheet>
    </Screen>
  );
}
