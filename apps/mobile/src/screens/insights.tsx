import { useState } from 'react';
import { View } from 'react-native';
import { minutes, type AnalyticsRange } from '@voxtype/shared/analytics';
import { Screen } from '../components/screen';
import { Action, Loader, Text } from '../components/primitives';
import { RangeControl, Metrics, ActivityCalendar, TrendChart } from '../components/analytics';
import { styles as ui } from '../components/styles';
import { useAnalyticsData } from '../state/app-state';
export default function InsightsScreen() {
  const [range, setRange] = useState<AnalyticsRange>('30d'),
    query = useAnalyticsData(range),
    data = query.data;
  return (
    <Screen title="Insights">
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
    </Screen>
  );
}
