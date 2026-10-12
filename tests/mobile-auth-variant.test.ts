import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mobileAuthVariant } from '../apps/mobile/src/lib/auth-variant';
import { mobileAuthQuerySchema } from '../apps/api/src/modules/auth/auth.validation';
import { finishMobileSignIn } from '../apps/api/src/modules/auth/auth.service';

const state = '00000000-0000-4000-8000-000000000001';

test('Dev and regular apps use separate fixed OAuth callbacks; legacy clients default to production', async () => {
  assert.equal(
    mobileAuthVariant('com.voxtype.dictation.mobile.dev').callbackUrl,
    'voxtype-dev://auth/callback',
  );
  assert.equal(
    mobileAuthVariant('com.voxtype.dictation.mobile').callbackUrl,
    'voxtype://auth/callback',
  );
  assert.equal(mobileAuthVariant(undefined).variant, 'production');
  assert.equal(mobileAuthQuerySchema.parse({ state }).variant, 'production');
  for (const variant of ['development', 'production'] as const) {
    const redirect = new URL(
      await finishMobileSignIn(
        {} as Env,
        { waitUntil() {} },
        new Headers(),
        state,
        'email_not_allowed',
        variant,
      ),
    );
    assert.equal(redirect.protocol, variant === 'development' ? 'voxtype-dev:' : 'voxtype:');
    assert.equal(redirect.host, 'auth');
    assert.equal(redirect.pathname, '/callback');
    assert.equal(redirect.searchParams.get('state'), state);
    assert.equal(redirect.searchParams.get('error'), 'account_not_allowed');
  }
});

test('OAuth variant validation rejects arbitrary redirect schemes and destinations', () => {
  for (const variant of ['https://attacker.example', 'other-app', 'voxtype-dev', '', null]) {
    assert.equal(mobileAuthQuerySchema.safeParse({ state, variant }).success, false);
  }
});
