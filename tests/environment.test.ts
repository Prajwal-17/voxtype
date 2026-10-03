import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOCAL_API_URL,
  PRODUCTION_API_URL,
  resolveApiUrl,
} from '../apps/mobile/src/lib/environment';

test('mobile development always defaults to the local API', () => {
  for (const unset of [undefined, null, '', '   ', 123]) {
    assert.equal(resolveApiUrl(unset, true), LOCAL_API_URL);
    assert.equal(resolveApiUrl(unset, false), PRODUCTION_API_URL);
  }
});

test('explicit mobile API overrides work in both builds without trailing slashes', () => {
  for (const development of [true, false]) {
    assert.equal(resolveApiUrl(' http://10.0.2.2:8788/// ', development), 'http://10.0.2.2:8788');
    assert.equal(
      resolveApiUrl('https://api.example.test/', development),
      'https://api.example.test',
    );
  }
});
