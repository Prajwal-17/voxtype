import { CaretLeftIcon } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { nativeTheme as theme, color } from '@voxtype/shared';
import {
  activityDescription,
  activityLevel,
  minutes,
  type Analytics,
  type AnalyticsRange,
} from '@voxtype/shared/analytics';
import { Action, IconButton, Card, Text } from './primitives';
import { styles as ui } from './styles';
const c = theme.colors;
export function RangeControl({
  value,
  onChange,
}: {
  value: AnalyticsRange;
  onChange: (value: AnalyticsRange) => void;
}) {
  return (
    <View style={s.segment} accessibilityLabel="Insights period">
      {(
        [
          ['7d', '7 days'],
          ['30d', '30 days'],
          ['all', 'All time'],
        ] as const
      ).map(([id, label]) => (
        <Pressable
          key={id}
          accessibilityRole="button"
          accessibilityState={{ selected: value === id }}
          onPress={() => onChange(id)}
          style={[s.segmentButton, value === id && { backgroundColor: c.surface }]}
        >
          <Text style={{ fontSize: 14, color: value === id ? c.primary : c.textMuted }}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Metrics({ data }: { data: Analytics }) {
  return (
    <View style={s.metrics}>
      {[
        ['Words dictated', data.summary.totalWords.toLocaleString(), ''],
        ['Recording time', minutes(data.summary.totalDurationMs), 'min'],
        [
          'Average speed',
          data.summary.totalDurationMs ? String(data.summary.averageWordsPerMinute) : '—',
          'WPM',
        ],
        ['Current streak', String(data.streaks.current), 'days'],
      ].map(([label, value, unit]) => (
        <View key={label} style={s.metric}>
          <Text style={ui.muted}>{label}</Text>
          <Text style={s.value}>
            {value} <Text style={ui.muted}>{unit}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}
export function ActivityCalendar({ data }: { data: Analytics }) {
  const days = data.activity.days,
    initial = Math.max(
      0,
      days.findIndex((d) => d.date === data.period.end),
    ),
    [index, setIndex] = useState(initial);
  const selected = days[index],
    colors = [color.activity0, color.activity1, color.activity2, color.activity3, color.activity4];
  const select = (next: number) => setIndex(Math.min(initial, Math.max(0, next)));
  return (
    <Card>
      <Text accessibilityRole="header" style={ui.title}>
        Activity
      </Text>
      <Text style={[ui.muted, { marginTop: 4 }]}>
        {data.activity.start} – {data.activity.end}
      </Text>
      {days.length ? (
        <>
          <Text style={[ui.muted, { marginTop: 8 }]}>
            {days.filter((d) => d.dictations > 0).length} active days ·{' '}
            {days.reduce((n, d) => n + d.dictations, 0)} dictations
          </Text>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`14-week activity calendar. ${selected ? activityDescription(selected) : 'No activity'}`}
            accessibilityHint="Use the previous and next day controls to read daily activity"
            accessibilityActions={[
              { name: 'increment', label: 'Next day' },
              { name: 'decrement', label: 'Previous day' },
            ]}
            onAccessibilityAction={(e) =>
              select(index + (e.nativeEvent.actionName === 'increment' ? 1 : -1))
            }
            style={{ marginTop: 16, alignSelf: 'flex-start' }}
          >
            <View style={{ flexDirection: 'row', marginLeft: 30, marginBottom: 8 }}>
              {Array.from({ length: 14 }, (_, week) => {
                const day = days[week * 7],
                  prev = days[(week - 1) * 7];
                return (
                  <View key={week} style={{ width: 15 }}>
                    <Text style={{ fontSize: 12, color: c.textMuted, width: 44 }}>
                      {day && (!prev || day.date.slice(0, 7) !== prev.date.slice(0, 7))
                        ? new Date(`${day.date}T12:00Z`).toLocaleDateString(undefined, {
                            month: 'short',
                            timeZone: 'UTC',
                          })
                        : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: 30, justifyContent: 'space-between', height: 102 }}>
                <Text style={s.dayLabel}>Mon</Text>
                <Text style={s.dayLabel}>Wed</Text>
                <Text style={s.dayLabel}>Fri</Text>
                <Text style={s.dayLabel}>Sun</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {Array.from({ length: 14 }, (_, week) => (
                  <View key={week} style={{ gap: 3 }}>
                    {days.slice(week * 7, week * 7 + 7).map((day) => (
                      <View
                        key={day.date}
                        accessible={false}
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          backgroundColor: colors[activityLevel(day.words)],
                          opacity: day.date > data.period.end ? 0.35 : 1,
                          borderWidth: day.date === selected?.date ? 1 : 0,
                          borderColor: c.text,
                        }}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', marginTop: 12 }}>
            <Text style={[ui.muted, { marginRight: 4 }]}>Less</Text>
            {colors.map((value) => (
              <View
                key={value}
                style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: value }}
              />
            ))}
            <Text style={[ui.muted, { marginLeft: 4 }]}>More</Text>
          </View>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: c.border,
              marginTop: 16,
              paddingTop: 12,
              gap: 10,
            }}
          >
            <Text accessibilityLiveRegion="polite" style={{ fontSize: 14 }}>
              {selected ? activityDescription(selected) : 'No activity'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
              <IconButton
                label="Previous day"
                disabled={index === 0}
                onPress={() => select(index - 1)}
              >
                <CaretLeftIcon size={20} color={c.primary} />
              </IconButton>
              <IconButton
                label="Next day"
                disabled={index >= initial}
                onPress={() => select(index + 1)}
              >
                <CaretRightIcon size={20} color={c.primary} />
              </IconButton>
            </View>
          </View>
        </>
      ) : (
        <Text style={[ui.muted, { marginTop: 12 }]}>No activity yet</Text>
      )}
    </Card>
  );
}
export function TrendChart({ data }: { data: Analytics }) {
  const [mode, setMode] = useState<'words' | 'speed'>('words'),
    [valuesVisible, setValuesVisible] = useState(false);
  const rows = data.trend.days,
    values = rows.map((d) => (mode === 'words' ? d.words : d.wordsPerMinute)),
    axisMax = Math.max(0, ...values),
    max = Math.max(1, axisMax);
  return (
    <Card>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Text accessibilityRole="header" style={ui.title}>
          {mode === 'words' ? 'Words' : 'Speed'}
        </Text>
        <View style={s.segment}>
          {(['words', 'speed'] as const).map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === id }}
              style={[s.segmentButton, mode === id && { backgroundColor: c.surface }]}
              onPress={() => setMode(id)}
            >
              <Text style={{ fontSize: 14, color: c.primary }}>
                {id === 'words' ? 'Words' : 'Speed'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
        <View
          style={{
            width: 36,
            height: 140,
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <Text style={ui.muted}>{axisMax.toLocaleString()}</Text>
          <Text style={ui.muted}>{axisMax / 2}</Text>
          <Text style={ui.muted}>0</Text>
        </View>
        <View
          accessible
          accessibilityLabel={`${data.trend.bucket} ${mode} trend, ${rows.length} periods, maximum ${max}. Use Show values for exact figures.`}
          style={{
            height: 140,
            flex: 1,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 2,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          {rows.map((day, i) => (
            <View
              key={day.date}
              style={{
                flex: 1,
                minWidth: 0,
                height: values[i] ? Math.max(1, ((values[i] ?? 0) / max) * 140) : 1,
                backgroundColor: c.primary,
                borderTopLeftRadius: 2,
                borderTopRightRadius: 2,
              }}
            />
          ))}
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginLeft: 44,
          marginTop: 8,
        }}
      >
        <Text style={ui.muted}>{rows[0]?.date ?? '—'}</Text>
        <Text style={ui.muted}>{rows.at(-1)?.date ?? '—'}</Text>
      </View>
      <Text style={[ui.muted, { marginVertical: 10 }]}>
        {data.trend.bucket} {mode === 'words' ? 'word totals' : 'weighted WPM'}
      </Text>
      <Action
        label={valuesVisible ? 'Hide values' : 'Show values'}
        secondary
        onPress={() => setValuesVisible(!valuesVisible)}
      />
      {valuesVisible &&
        rows.map((d) => (
          <Text key={d.date} style={[ui.muted, { marginTop: 8 }]}>
            {d.date} · {d.words} words · {d.wordsPerMinute} WPM
          </Text>
        ))}
    </Card>
  );
}
const s = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 3,
    gap: 2,
    borderRadius: 10,
    backgroundColor: c.surfaceSubtle,
  },
  segmentButton: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 7,
    justifyContent: 'center',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: c.border,
    paddingVertical: 12,
  },
  metric: { width: '50%', paddingVertical: 8, paddingRight: 8 },
  value: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.7,
    marginTop: 4,
  },
  dayLabel: { fontSize: 12, lineHeight: 14, color: c.textMuted },
});
