import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { nativeTheme as theme } from '@voxtype/shared';
import Native, {
  isVoxTypeNativeAvailable,
} from '../../modules/voxtype-native/src/VoxTypeNativeModule';
/** Audio events render only this view; they never invalidate account queries. */
export function LiveWaveform({ active }: { active: boolean }) {
  const [samples, setSamples] = useState<number[]>(Array<number>(23).fill(0)),
    [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active || !isVoxTypeNativeAvailable()) return;
    const sub = Native.addListener('onAudioLevel', ({ level }) => {
      const amplitude = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
      setSamples((old) =>
        reduced ? Array<number>(23).fill(amplitude) : [...old.slice(1), amplitude],
      );
    });
    return () => sub.remove();
  }, [active, reduced]);
  return (
    <View
      accessible
      accessibilityLabel="Live microphone waveform"
      style={{
        height: 40,
        width: 148,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
      }}
    >
      {samples.map((level, i) => (
        <View
          key={i}
          style={{
            width: 3,
            borderRadius: 999,
            height: 3 + Math.min(1, Math.pow(active ? level : 0, 0.7) * 1.25) * 34,
            backgroundColor: theme.colors.primary,
          }}
        />
      ))}
    </View>
  );
}
