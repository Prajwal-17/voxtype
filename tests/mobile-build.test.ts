import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appConfig } from '../apps/mobile/app.config';
import appJson from '../apps/mobile/app.json';

test('development APK is a separate install; production identity and OAuth callback stay stable', () => {
  const original = process.env.APP_VARIANT;
  const originalCommit = process.env.VOXTYPE_BUILD_COMMIT;
  const context = {
    config: appJson.expo,
    projectRoot: '',
    staticConfigPath: null,
    packageJsonPath: '',
  } as Parameters<typeof appConfig>[0];
  try {
    process.env.APP_VARIANT = 'development';
    process.env.VOXTYPE_BUILD_COMMIT = '1234567890123456789012345678901234567890';
    const development = appConfig(context);
    process.env.APP_VARIANT = 'production';
    const production = appConfig(context);
    assert.equal(development.name, 'VoxType Dev');
    assert.equal(development.android?.package, 'com.voxtype.dictation.mobile.dev');
    assert.equal(development.version, `${appJson.expo.version}-dev.1234567`);
    assert.equal(production.name, 'VoxType');
    assert.equal(production.android?.package, 'com.voxtype.dictation.mobile');
    assert.equal(production.version, appJson.expo.version);
    assert.equal(development.scheme, 'voxtype-dev');
    assert.equal(production.scheme, 'voxtype');
    assert.deepEqual(development.plugins, production.plugins);
    assert.equal(development.android?.versionCode, production.android?.versionCode);
    assert.equal(appJson.expo.android.package, 'com.voxtype.dictation.mobile');
  } finally {
    if (original === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = original;
    if (originalCommit === undefined) delete process.env.VOXTYPE_BUILD_COMMIT;
    else process.env.VOXTYPE_BUILD_COMMIT = originalCommit;
  }
});
