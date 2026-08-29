import assert from 'node:assert/strict';
import test from 'node:test';
import { createTraceRandomSourceFactory } from
  '../src/runtime/releases/spatial-v3-production-trace-runtime.js';

const firstRun = {
  party_id: 'party:first', request_id: 'scenario-seed:inspect',
  idempotency_key: 'run:first:inspect'
};
const secondRun = {
  party_id: 'party:second', request_id: 'scenario-seed:inspect',
  idempotency_key: 'run:second:inspect'
};

test('developer playtest RNG stays stable across unique run identities', () => {
  const factory = createTraceRandomSourceFactory({ env: {
    RUS_DEVELOPER_MODE: 'true',
    RUS_PUBLIC_PLAYTEST_SCENARIO_SEED: 'scenario-seed'
  } });
  const first = factory(firstRun);
  const second = factory(secondRun);
  assert.equal(first.snapshot().seed_ref, second.snapshot().seed_ref);
  assert.deepEqual([first.next(), first.next()], [second.next(), second.next()]);
});

test('normal production RNG remains bound to party and idempotency identity', () => {
  const factory = createTraceRandomSourceFactory({ env: {} });
  assert.notEqual(factory(firstRun).snapshot().seed_ref,
    factory(secondRun).snapshot().seed_ref);
});
