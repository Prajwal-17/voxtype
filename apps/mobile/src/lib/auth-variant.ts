export function mobileAuthVariant(packageName: string | undefined) {
  const development = packageName === 'com.voxtype.dictation.mobile.dev';
  return {
    variant: development ? 'development' : 'production',
    callbackUrl: development ? 'voxtype-dev://auth/callback' : 'voxtype://auth/callback',
  } as const;
}
