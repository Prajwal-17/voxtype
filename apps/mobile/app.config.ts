import type { ConfigContext, ExpoConfig } from 'expo/config';
import { AndroidConfig, withStringsXml } from 'expo/config-plugins';

/** Keep install identity separate from Gradle's debug/release compilation mode. */
export function appConfig({ config }: ConfigContext): ExpoConfig {
  const development = process.env.APP_VARIANT === 'development';
  const sourceCommit: unknown = process.env.VOXTYPE_BUILD_COMMIT;
  const buildCommit =
    typeof sourceCommit === 'string' && /^[a-f0-9]{40}$/i.test(sourceCommit) ? sourceCommit : null;
  const result: ExpoConfig = {
    ...config,
    name: development ? 'VoxType Dev' : 'VoxType',
    scheme: development ? 'voxtype-dev' : 'voxtype',
    slug: config.slug ?? 'voxtype-mobile',
    version: development
      ? `${config.version ?? '0.2.0'}-dev.${buildCommit?.slice(0, 7) ?? 'local'}`
      : config.version,
    android: {
      ...config.android,
      package: development ? 'com.voxtype.dictation.mobile.dev' : 'com.voxtype.dictation.mobile',
    },
    extra: {
      ...config.extra,
      appVariant: development ? 'development' : 'production',
      buildCommit,
    },
  };
  return withStringsXml(result, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'voxtype_accessibility_label' }, _: `${result.name} voice bubble` }],
      mod.modResults,
    );
    return mod;
  });
}

export default appConfig;
