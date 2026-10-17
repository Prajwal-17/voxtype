import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import desktopConfig from '../apps/desktop/src-tauri/tauri.conf.json';
import desktopPackage from '../apps/desktop/package.json';
import mobileConfig from '../apps/mobile/app.json';
import mobilePackage from '../apps/mobile/package.json';

test('displayed release versions agree with the native and package build sources', () => {
  const cargo = readFileSync(
    new URL('../apps/desktop/src-tauri/Cargo.toml', import.meta.url),
    'utf8',
  );
  assert.equal(cargo.match(/^version = "([^"]+)"/m)?.[1], desktopConfig.version);
  assert.equal(desktopPackage.version, desktopConfig.version);
  assert.equal(mobilePackage.version, mobileConfig.expo.version);
  assert(mobileConfig.expo.android.versionCode > 0);
});
