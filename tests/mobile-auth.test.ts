import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthCompletion } from '../apps/mobile/src/lib/auth-completion';

test('browser and router share one exchange, including a late route mount', async () => {
  let calls = 0;
  const auth = createAuthCompletion({
    pendingState: async () => 'state',
    exchange: async () => {
      calls++;
      return { id: 'user' };
    },
  });
  const results = await Promise.all([
    auth.complete('state', 'grant'),
    auth.complete('state', 'grant'),
  ]);
  assert.deepEqual(results, [{ id: 'user' }, { id: 'user' }]);
  assert.deepEqual(await auth.complete('state', 'grant'), { id: 'user' });
  assert.equal(calls, 1);
  assert.deepEqual(await auth.resultFor('state'), { id: 'user' });
  assert.equal(auth.resultFor('other'), undefined);
  auth.reset();
  assert.equal(auth.resultFor('state'), undefined);
});

test('cold-start callback requires the persisted state and a successful grant', async () => {
  let calls = 0;
  const auth = createAuthCompletion({
    pendingState: async () => 'persisted',
    exchange: async () => {
      calls++;
      return 'user';
    },
  });
  await assert.rejects(auth.complete(undefined, 'grant'), /verified/);
  await assert.rejects(auth.complete('wrong', 'grant'), /verified/);
  await assert.rejects(auth.complete('persisted', 'grant', 'denied'), /could not sign in/);
  await assert.rejects(auth.complete('persisted', undefined), /expired/);
  assert.equal(calls, 0);
  assert.equal(await auth.complete('persisted', 'grant'), 'user');
});

test('expired pending state and rejected grants remain errors; a new attempt can succeed', async () => {
  let state: string | null = null;
  const auth = createAuthCompletion({
    pendingState: async () => state,
    exchange: async (grant) => {
      if (grant === 'bad') throw new Error('expired');
      return 'user';
    },
  });
  await assert.rejects(auth.complete('old', 'good'), /verified/);
  state = 'new';
  await assert.rejects(auth.complete('new', 'bad'), /expired/);
  auth.reset();
  assert.equal(await auth.complete('new', 'good'), 'user');
});
