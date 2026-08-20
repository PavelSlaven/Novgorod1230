import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOrdinaryAggregateStore,
  OrdinaryAggregateStoreError,
  normalizeOrdinaryAggregateIdentity,
  normalizeOrdinaryAggregateMutation
} from '../src/ordinary-materialization.js';
import {
  applyOrdinaryAggregateTransition,
  createOrdinaryAggregate
} from '@rus/materialization';

const identity = { party_id: 'party-a', scope_ref: { entity_kind: 'g6', entity_id: 'scope-a' } };
const aggregate = applyOrdinaryAggregateTransition({
  aggregate: createOrdinaryAggregate({ scope_ref: identity.scope_ref, resolution_record_cap: 1 }),
  transition: { kind: 'seed', request_identity: 'seed-a', expected_state_version: 0, density_band: 'sparse', identity_budget: 1, background_groups: [] }
});

test('ordinary aggregate logical contract normalizes exact identity and next version without owning persistence', async () => {
  let received = null;
  const store = createOrdinaryAggregateStore({
    load: async () => ({ status: 'unseeded' }),
    compareAndSet: async (mutation) => { received = mutation; return { status: 'committed', state_version: 1 }; }
  });
  assert.deepEqual(await store.load(identity), { status: 'unseeded' });
  const committed = await store.compareAndSet({ ...identity, expected_state_version: 0, aggregate });
  assert.deepEqual(committed, { status: 'committed', state_version: 1 });
  assert.ok(Object.isFrozen(received));
  assert.throws(() => normalizeOrdinaryAggregateMutation({ ...identity, expected_state_version: 1, aggregate }), (error) => error instanceof OrdinaryAggregateStoreError && error.code === 'ORDINARY_AGGREGATE_VERSION_RELATION_INVALID');
  assert.throws(() => normalizeOrdinaryAggregateMutation({ ...identity, scope_ref: { entity_kind: 'unknown', entity_id: 'scope-a' }, expected_state_version: 0, aggregate }), (error) => error.code === 'ORDINARY_AGGREGATE_SCOPE_INVALID');
  for (const entity_id of ['\tscope-a', 'scope-a\n', 'scope\u0000a']) assert.throws(() => normalizeOrdinaryAggregateIdentity({ ...identity, scope_ref: { ...identity.scope_ref, entity_id } }), (error) => error.code === 'ORDINARY_AGGREGATE_SCOPE_INVALID');
});

test('ordinary aggregate logical contract keeps stale CAS explicit', async () => {
  const store = createOrdinaryAggregateStore({
    load: async () => ({ status: 'present', aggregate }),
    compareAndSet: async () => ({ status: 'stale' })
  });
  const loaded = await store.load(identity);
  assert.equal(loaded.status, 'present');
  assert.ok(Object.isFrozen(loaded));
  assert.deepEqual(await store.compareAndSet({ ...identity, expected_state_version: 0, aggregate }), { status: 'stale' });
});

test('ordinary aggregate logical contract rejects malformed public payloads before its ports run', async () => {
  let calls = 0;
  const store = createOrdinaryAggregateStore({
    load: async () => { calls += 1; return { status: 'present', aggregate: { malformed: true } }; },
    compareAndSet: async () => { calls += 1; return { status: 'stale' }; }
  });
  await assert.rejects(() => store.load(identity), (error) => error.code === 'ORDINARY_AGGREGATE_INVALID');
  await assert.rejects(() => store.compareAndSet({ ...identity, expected_state_version: 0, aggregate: { malformed: true } }), (error) => error.code === 'ORDINARY_AGGREGATE_INVALID');
  assert.equal(calls, 1, 'malformed mutation must be rejected before compareAndSet port invocation');
});
