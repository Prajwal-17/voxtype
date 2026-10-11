import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { nativeTheme as theme } from '@voxtype/shared';
import { Action, Text, Loader } from '@/components/primitives';
import { useAppState } from '@/state/app-state';
import { completeAuth } from '@/lib/mobile-api';

const c = theme.colors;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

/** Warm and cold redirects share state validation and single-use grant completion. */
export default function AuthCallback() {
  const router = useRouter();
  const { acceptUser, refresh } = useAppState();
  const params = useLocalSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed) return;

    let cancelled = false;
    void completeAuth(
      firstParam(params.state),
      firstParam(params.token),
      firstParam(params.error),
    ).then(
      (user) => {
        if (!cancelled) {
          acceptUser(user);
          void refresh();
          router.replace('/');
        }
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [failed, params.state, params.token, params.error, router, acceptUser, refresh]);

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
