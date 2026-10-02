import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { nativeTheme as theme } from '@voxtype/shared';
import { Action, Text, Loader } from '@/components/primitives';
import { exchangeGrant } from '@/lib/mobile-api';

const c = theme.colors;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

/**
 * Cold-start fallback for the OAuth redirect `voxtype://auth/callback`.
 * The normal path is `WebBrowser.openAuthSessionAsync()` resolving in
 * `signIn()` (see `src/lib/mobile-api.ts`) after
 * `WebBrowser.maybeCompleteAuthSession()` in `_layout.tsx`.
 * If Android delivers the redirect as a fresh deep link instead, the
 * browser promise is lost but the single-use grant is in this route's
 * params — consume it here so sign-in still completes instead of showing
 * expo-router's "Unmatched Route" page. Home reloads the stored session
 * when the app becomes active again.
 */
export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [failed, setFailed] = useState(() => {
    const error = firstParam(params.error);
    const token = firstParam(params.token);
    return Boolean(error) || !token;
  });

  useEffect(() => {
    if (failed) return;
    const grant = firstParam(params.token);
    if (!grant) return;
    let cancelled = false;
    void exchangeGrant(grant).then(
      () => {
        if (!cancelled) router.replace('/');
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [failed, params.token, router]);

  if (failed) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Text style={{ color: c.text, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>
          Google sign-in was not completed.
        </Text>
        <Text
          style={{
            color: c.textMuted,
            fontSize: 14,
            marginTop: 8,
            marginBottom: 20,
            textAlign: 'center',
          }}
        >
          The sign-in link expired or the account is not allowed. Return home and try again.
        </Text>
        <Action label="Back home" onPress={() => router.replace('/')} />
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Loader label="Signing in" />
    </View>
  );
}
