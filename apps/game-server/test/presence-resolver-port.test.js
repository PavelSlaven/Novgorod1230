import assert from 'node:assert/strict';
import test from 'node:test';
import { delegateToPresenceResolverPort } from
  '../src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';

test('presence resolver port delegates to the installed resolver', async () => {
  const port = { resolve: async (input) => ({ echoed: input.partyId }) };
  assert.deepEqual(await delegateToPresenceResolverPort(port)({ partyId: 'p' }), { echoed: 'p' });
});

test('presence resolver port fails closed when no resolver was installed', async () => {
  await assert.rejects(delegateToPresenceResolverPort({ resolve: null })({ partyId: 'p' }),
    { code: 'SPATIAL_V3_TARGET_PRESENCE_RESOLVER_REQUIRED' });
});
