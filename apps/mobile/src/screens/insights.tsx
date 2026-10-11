import { useState } from 'react';
import { View } from 'react-native';
import { minutes, type AnalyticsRange } from '@voxtype/shared/analytics';
import { Screen } from '../components/screen';
import { Action, Loader, Text } from '../components/primitives';
import { RangeControl, Metrics, ActivityCalendar, TrendChart } from '../components/analytics';
import { styles as ui } from '../components/styles';
import { useAppState, useAnalyticsData } from '../state/app-state';
import { exportInsights } from '../lib/mobile-api';
export default function InsightsScreen() {
  const app = useAppState(),
    [range, setRange] = useState<AnalyticsRange>('30d'),
    query = useAnalyticsData(range),
    data = query.data,
    [definitions, setDefinitions] = useState(false);
  return (
    <Screen title="Insights">
      <RangeControl value={range} onChange={setRange} />
      {query.loading ? (
        <Loader />
      ) : query.error ? (
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
            <Action
              label={definitions ? 'Hide definitions' : 'Definitions'}
              secondary
              onPress={() => setDefinitions(!definitions)}
            />
            {definitions && (
              <Text style={ui.muted}>
                Speed is words divided by recorded minutes. Average session is minutes divided by
                dictations. Streaks use full account history and end today or yesterday. Canceled
                recordings and microphone tests are excluded. Dates use {data.timezone}. Pending
                uploads appear after sync.
              </Text>
            )}
            <Action
              label="Export CSV"
              secondary
              disabled={!app.available || app.busy || !data.summary.dictations}
              onPress={() => void app.run(() => exportInsights(range))}
            />
          </>
        )
      )}
    </Screen>
  );
}
