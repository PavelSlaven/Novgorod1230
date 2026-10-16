import assert from 'node:assert/strict';
import test from 'node:test';
import { withIssue730Database, setupParty, makeResolver, resolve, commitPlan, counts, sourceState } from './fixtures/issue-730-finite-occurrence.js';
import { applyOrdinaryAggregateTransition } from '@rus/materialization';
import { applyOrdinaryMaterializationAtomicWritePlanInTransaction,
  createOrdinaryMaterializationAtomicWritePlan } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-phase-6-commit.js';
import { createPostgresOrdinaryMaterializationEnablementRepository } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-enablement.js';
import { createPostgresOrdinaryMaterializationAggregateStore } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-aggregate-store.js';

test('finite-source occurrence acceptance through discovery and durable readback', async (t) => {
  await withIssue730Database(t);
await t.test('finite-source occurrence is distinct for fresh roots through discovery and phase6', async (t) => {
  const pool = await withIssue730Database(t);
  if (pool == null) return;
  await t.test('fresh root keeps same candidate inputs in one resolver', async () => {
    const context = await setupParty(pool, 'fresh-runtime', { finite: true });
    const firstResolver = makeResolver(context, pool);
    const first = await resolve(firstResolver, context, 'root-a');
    const firstPlan = first.ordinary_materialization_atomic_write_plan;
    assert.ok(firstPlan?.item, 'initial finite-source resolution must reach phase6');
    await commitPlan(pool, firstPlan, `${context.partyId}:change-1`, context.partyVersion);

    const replay = await resolve(firstResolver, context, 'root-a');
    assert.deepEqual(replay.known_resolution, firstPlan.next_aggregate.presence_resolutions.at(-1),
      'same root and step replay must return the committed resolution');
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 1, materializations: 1, decrements: 1
    }, 'same root replay must preserve one item and one source decrement');

    const second = await resolve(firstResolver, context, 'root-b', firstPlan.item);
    const secondPlan = second.ordinary_materialization_atomic_write_plan;
    assert.ok(secondPlan?.item,
      'new finite-source root must produce a distinct candidate resolution');
    assert.notEqual(secondPlan.item.candidate_key, firstPlan.item.candidate_key,
      'new finite-source root must have a distinct candidate identity');
    assert.notEqual(secondPlan.transitions.at(-1).resolution_ref,
      firstPlan.transitions.at(-1).resolution_ref,
      'new finite-source root must have a distinct resolution identity');
    assert.equal(context.query, 'ordinary material');
    assert.deepEqual(context.quantity, { value: 1, unit: 'item' });
    assert.equal(secondPlan.item.coverage_key, firstPlan.item.coverage_key);
    assert.notEqual(secondPlan.item.context_version, firstPlan.item.context_version);
    assert.equal(secondPlan.semantic_target_ref, firstPlan.semantic_target_ref);
    await commitPlan(pool, secondPlan, `${context.partyId}:change-2`, context.partyVersion + 1);
    assert.notEqual(secondPlan.item.item_id, firstPlan.item.item_id,
      'new finite-source root must create a distinct materialized item');
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 2, materializations: 2, decrements: 2
    });
    assert.deepEqual(await sourceState(pool, context), {
      state_version: '10', lifecycle_state: 'depleted', quantity_numerator: '0'
    });
    assert.equal(firstPlan.item.item_proposal.semantic_descriptor.name,
      secondPlan.item.item_proposal.semantic_descriptor.name);
    assert.equal(firstPlan.item.item_proposal.semantic_descriptor.semantic_type,
      secondPlan.item.item_proposal.semantic_descriptor.semantic_type);
    assert.deepEqual(firstPlan.item.mechanics_snapshot.mechanics.quantity,
      secondPlan.item.mechanics_snapshot.mechanics.quantity);
  });

  await t.test('inspect of finite source extracts another portion despite visible item', async () => {
    const context = await setupParty(pool, 'inspect-runtime', { finite: true });
    const first = (await resolve(makeResolver(context, pool), context, 'root-inspect-a',
      null, 'inspect')).ordinary_materialization_atomic_write_plan;
    assert.ok(first?.item);
    await commitPlan(pool, first, `${context.partyId}:change-1`, context.partyVersion);

    const repository = createPostgresOrdinaryMaterializationEnablementRepository({ pool });
    const resolver = makeResolver(context, pool, repository);
    const second = (await resolve(resolver, context, 'root-inspect-b',
      first.item, 'inspect')).ordinary_materialization_atomic_write_plan;
    assert.ok(second?.item, 'source inspection extracts a new portion');
    assert.notEqual(second.item.item_id, first.item.item_id);
    await commitPlan(pool, second, `${context.partyId}:change-2`, context.partyVersion + 1);
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 2, materializations: 2, decrements: 2
    });
  });

  await t.test('fresh root remains distinct after repository and resolver reload', async () => {
    const context = await setupParty(pool, 'fresh-reload', { finite: true });
    const first = await resolve(makeResolver(context, pool), context, 'root-c');
    const firstPlan = first.ordinary_materialization_atomic_write_plan;
    assert.ok(firstPlan?.item, 'initial finite-source resolution must reach phase6');
    await commitPlan(pool, firstPlan, `${context.partyId}:change-1`, context.partyVersion);

    const repository = createPostgresOrdinaryMaterializationEnablementRepository({ pool });
    const reloadedResolver = makeResolver(context, pool, repository);
    const replay = await resolve(reloadedResolver, context, 'root-c');
    assert.deepEqual(replay.known_resolution,
      firstPlan.next_aggregate.presence_resolutions.at(-1),
      'same root retry after resolver reload must return the stored resolution');
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 1, materializations: 1, decrements: 1
    });
    const second = await resolve(reloadedResolver, context, 'root-d');
    const secondPlan = second.ordinary_materialization_atomic_write_plan;
    assert.ok(secondPlan?.item,
      'reloaded resolver must admit a new finite-source root as a new occurrence');
    assert.notEqual(secondPlan.item.candidate_key, firstPlan.item.candidate_key,
      'reloaded resolver must retain occurrence-specific candidate identity');
    assert.equal(secondPlan.semantic_target_ref, firstPlan.semantic_target_ref);
    assert.equal(secondPlan.item.coverage_key, firstPlan.item.coverage_key);
    assert.notEqual(secondPlan.item.context_version, firstPlan.item.context_version);
    assert.equal(context.query, 'ordinary material');
    assert.deepEqual(context.quantity, { value: 1, unit: 'item' });
    await commitPlan(pool, secondPlan, `${context.partyId}:change-2`, context.partyVersion + 1);
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 2, materializations: 2, decrements: 2
    });
  });
});

await t.test('phase6 replay, payload collision, depletion, and non-finite dedupe controls', async (t) => {
  const pool = await withIssue730Database(t);
  if (pool == null) return;

  await t.test('same request replays exact commit; changed payload collides', async () => {
    const context = await setupParty(pool, 'replay-control', { finite: true });
    const resolver = makeResolver(context, pool);
    const first = await resolve(resolver, context, 'root-e');
    const plan = first.ordinary_materialization_atomic_write_plan;
    assert.ok(plan?.item, 'finite source must produce a phase6 plan');
    const changeSetId = `${context.partyId}:change-1`;
    assert.deepEqual(await commitPlan(pool, plan, changeSetId, context.partyVersion), {
      status: 'committed', replay: false, state_version: 2
    });
    assert.deepEqual(await commitPlan(pool, plan, changeSetId, context.partyVersion + 1), {
      status: 'committed', replay: true, state_version: 2
    });
    const { schema: _schema, write_plan_digest: _digest, ...raw } = plan;
    const changed = createOrdinaryMaterializationAtomicWritePlan({
      ...raw, input_digest: 'changed-payload'
    });
    await assert.rejects(() => commitPlan(pool, changed, changeSetId, context.partyVersion + 1),
      (error) => error.code === 'ORDINARY_PHASE6_IDEMPOTENCY_COLLISION');
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 1, materializations: 1, decrements: 1
    });
  });

  await t.test('SQL failure after source update rolls back source and item', async () => {
    const context = await setupParty(pool, 'rollback-control', { finite: true });
    const plan = (await resolve(makeResolver(context, pool), context, 'root-rollback'))
      .ordinary_materialization_atomic_write_plan;
    assert.ok(plan?.item);
    const client = await pool.connect();
    let reachedSourceUpdate = false;
    try {
      await client.query('BEGIN');
      const faultClient = new Proxy(client, { get(target, key) {
        if (key === 'query') return async (...args) => {
          const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text ?? '';
          const result = await target.query(...args);
          if (/UPDATE\s+party_runtime\.party_resource_nodes/u.test(sql)) {
            reachedSourceUpdate = true;
            throw new Error('ISSUE_730_TEST_AFTER_SOURCE_UPDATE');
          }
          return result;
        };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      await assert.rejects(() => applyOrdinaryMaterializationAtomicWritePlanInTransaction({
        client: faultClient, input: plan, partyStateVersionAfter: 1,
        p16ChangeSetId: `${context.partyId}:change-1`
      }), /ISSUE_730_TEST_AFTER_SOURCE_UPDATE/u);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    assert.equal(reachedSourceUpdate, true);
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 0, materializations: 0, decrements: 0
    });
    assert.deepEqual(await sourceState(pool, context), {
      state_version: '8', lifecycle_state: 'active', quantity_numerator: '2'
    });
    await commitPlan(pool, plan, `${context.partyId}:change-1`, context.partyVersion);
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 1, materializations: 1, decrements: 1
    });
  });

  await t.test('concurrent fresh roots serialize on aggregate and source state', async () => {
    const context = await setupParty(pool, 'concurrency-control', { finite: true });
    const resolver = makeResolver(context, pool);
    const first = (await resolve(resolver, context, 'root-concurrent-a'))
      .ordinary_materialization_atomic_write_plan;
    const stale = (await resolve(resolver, context, 'root-concurrent-b'))
      .ordinary_materialization_atomic_write_plan;
    assert.ok(first?.item && stale?.item);
    assert.notEqual(first.item.candidate_key, stale.item.candidate_key);
    await commitPlan(pool, first, `${context.partyId}:change-1`, context.partyVersion);
    await assert.rejects(
      () => commitPlan(pool, stale, `${context.partyId}:change-2`,
        context.partyVersion + 1),
      (error) => error.code === 'ORDINARY_PHASE6_PROPOSAL_STALE');
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 1, materializations: 1, decrements: 1
    });
    assert.deepEqual(await sourceState(pool, context), {
      state_version: '9', lifecycle_state: 'active', quantity_numerator: '1'
    });
  });

  await t.test('depleted source creates no item and adds no aggregate key', async () => {
    const context = await setupParty(pool, 'depleted-control', {
      finite: true, quantity: 1
    });
    const resolver = makeResolver(context, pool);
    const first = await resolve(resolver, context, 'root-f');
    assert.ok(first.ordinary_materialization_atomic_write_plan?.item);
    await commitPlan(pool, first.ordinary_materialization_atomic_write_plan,
      `${context.partyId}:change-1`, context.partyVersion);
    const before = (await pool.query(`SELECT aggregate_payload FROM
      party_runtime.party_ordinary_materialization_aggregates
      WHERE party_id=$1 AND scope_kind='g6' AND scope_id=$2`,
    [context.partyId, context.scope.entity_id])).rows[0].aggregate_payload;
    assert.deepEqual(await sourceState(pool, context), {
      state_version: '9', lifecycle_state: 'depleted', quantity_numerator: '0'
    }, 'the existing finite transition must exhaust the only source portion');
    const denied = await resolve(resolver, context, 'root-g');
    assert.equal(denied.known_resolution, undefined,
      'depleted source must be rejected by finite qualification before semantic dedupe');
    assert.equal(denied.ordinary_materialization_atomic_write_plan, undefined,
      'depleted source must not create a materialization write plan');
    const after = (await pool.query(`SELECT aggregate_payload FROM
      party_runtime.party_ordinary_materialization_aggregates
      WHERE party_id=$1 AND scope_kind='g6' AND scope_id=$2`,
    [context.partyId, context.scope.entity_id])).rows[0].aggregate_payload;
    assert.deepEqual(after.presence_resolutions, before.presence_resolutions);
    assert.deepEqual(after.closed_observation_scopes, before.closed_observation_scopes);
    const reloaded = makeResolver(context, pool);
    const reloadedDenied = await resolve(reloaded, context, 'root-g-reload');
    assert.equal(reloadedDenied.ordinary_materialization_atomic_write_plan, undefined,
      'reloaded resolver must leave depleted source without a write plan');
    const afterReload = (await pool.query(`SELECT aggregate_payload FROM
      party_runtime.party_ordinary_materialization_aggregates
      WHERE party_id=$1 AND scope_kind='g6' AND scope_id=$2`,
    [context.partyId, context.scope.entity_id])).rows[0].aggregate_payload;
    assert.deepEqual(afterReload.presence_resolutions, before.presence_resolutions);
    assert.deepEqual(afterReload.closed_observation_scopes, before.closed_observation_scopes);
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 1, materializations: 1, decrements: 1
    });
  });

  await t.test('same root replays after source depletion and repository reload', async () => {
    const context = await setupParty(pool, 'depleted-replay', {
      finite: true, quantity: 1
    });
    const resolver = makeResolver(context, pool);
    const first = await resolve(resolver, context, 'root-depleted-replay');
    const plan = first.ordinary_materialization_atomic_write_plan;
    assert.ok(plan?.item);
    await commitPlan(pool, plan, `${context.partyId}:change-1`, context.partyVersion);
    const committed = plan.next_aggregate.presence_resolutions.at(-1);
    assert.deepEqual(await sourceState(pool, context), {
      state_version: '9', lifecycle_state: 'depleted', quantity_numerator: '0'
    });
    const replay = await resolve(resolver, context, 'root-depleted-replay');
    assert.deepEqual(replay.known_resolution, committed);
    assert.equal(replay.ordinary_materialization_atomic_write_plan, undefined);
    const reloaded = makeResolver(context, pool);
    const reloadedReplay = await resolve(reloaded, context, 'root-depleted-replay');
    assert.deepEqual(reloadedReplay.known_resolution, committed);
    assert.equal(reloadedReplay.ordinary_materialization_atomic_write_plan, undefined);
    const denied = await resolve(reloaded, context, 'root-after-depletion');
    assert.equal(denied.known_resolution, undefined);
    assert.equal(denied.ordinary_materialization_atomic_write_plan, undefined);
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 1, materializations: 1, decrements: 1
    });
    assert.deepEqual(await sourceState(pool, context), {
      state_version: '9', lifecycle_state: 'depleted', quantity_numerator: '0'
    });
  });

  await t.test('non-finite fresh root stays already_resolved', async () => {
    const context = await setupParty(pool, 'nonfinite-control', { finite: false });
    const resolver = makeResolver(context, pool);
    const first = await resolve(resolver, context, 'root-h');
    const plan = first.ordinary_materialization_atomic_write_plan;
    assert.ok(plan?.item, 'non-finite source must materialize through ordinary discovery');
    await commitPlan(pool, plan, `${context.partyId}:change-1`, context.partyVersion);
    const second = await resolve(resolver, context, 'root-i');
    assert.equal(second.known_resolution?.resolution, 'materialize',
      'non-finite root must retain ordinary already-resolved behavior');
    assert.deepEqual(second.known_resolution,
      plan.next_aggregate.presence_resolutions.at(-1));
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 1, materializations: 1, decrements: 0
    });
    const reloaded = makeResolver(context, pool);
    const reloadedSecond = await resolve(reloaded, context, 'root-i-reload');
    assert.deepEqual(reloadedSecond.known_resolution,
      plan.next_aggregate.presence_resolutions.at(-1),
      'reloaded non-finite lookup must preserve the committed resolution');
    assert.deepEqual(await counts(pool, context.partyId), {
      items: 1, materializations: 1, decrements: 0
    });
  });
});

await t.test('closed observation scope from G6 reducer CAS does not swallow finite occurrence', async (t) => {
  const pool = await withIssue730Database(t);
  if (pool == null) return;
  const context = await setupParty(pool, 'closure-control', { finite: true });
  const preview = await resolve(makeResolver(context, pool, undefined,
    { resolution: 'no_change' }), context, 'root-previous');
  const previousPlan = preview.ordinary_materialization_atomic_write_plan;
  assert.ok(previousPlan && previousPlan.item == null,
    'closure fixture must obtain an uncommitted negative result from the common owner');
  const previous = previousPlan.transitions.at(-1);
  assert.equal(previous.kind, 'resolve_presence');
  const aggregateStore = createPostgresOrdinaryMaterializationAggregateStore();
  const transaction = await pool.connect();
  let closureRecord;
  try {
    await transaction.query('BEGIN');
    const loaded = await aggregateStore.load({ transaction,
      party_id: context.partyId, scope_ref: context.scope });
    const aggregate = loaded.aggregate;
    const closure = applyOrdinaryAggregateTransition({ aggregate,
      transition: { kind: 'close_coverage',
        request_identity: previous.request_identity,
        expected_state_version: aggregate.state_version,
        coverage_key: previous.coverage_key,
        category_key: previous.category_key,
        context_version: previous.context_version,
        resolution: 'no_change' } });
    closureRecord = closure.closed_observation_scopes.at(-1);
    assert.deepEqual(await aggregateStore.compareAndSet({ transaction,
      party_id: context.partyId, scope_ref: context.scope,
      expected_state_version: aggregate.state_version, aggregate: closure }), {
      status: 'committed', state_version: closure.state_version
    });
    await transaction.query('COMMIT');
  } catch (error) {
    await transaction.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    transaction.release();
  }
  const persisted = (await pool.query(`SELECT aggregate_payload
    FROM party_runtime.party_ordinary_materialization_aggregates
    WHERE party_id=$1 AND scope_kind='g6' AND scope_id=$2`,
  [context.partyId, context.scope.entity_id])).rows[0].aggregate_payload;
  assert.deepEqual(persisted.closed_observation_scopes.at(-1),
    closureRecord);

  const closedResolver = makeResolver(context, pool);
  const replay = await resolve(closedResolver, context, 'root-previous');
  assert.deepEqual(replay.known_resolution, closureRecord,
    'same root retry must preserve the committed observation closure');
  const reloadedReplay = await resolve(makeResolver(context, pool), context,
    'root-previous');
  assert.deepEqual(reloadedReplay.known_resolution, closureRecord,
    'repository reload must preserve the same closed-scope request');
  const result = await resolve(closedResolver, context, 'root-j');
  const plan = result.ordinary_materialization_atomic_write_plan;
  assert.ok(plan?.item,
    'closed observation scope must not suppress a new finite-source occurrence');
  await commitPlan(pool, plan, `${context.partyId}:change-1`, context.partyVersion);
  const committed = (await pool.query(`SELECT aggregate_payload
    FROM party_runtime.party_ordinary_materialization_aggregates
    WHERE party_id=$1 AND scope_kind='g6' AND scope_id=$2`,
  [context.partyId, context.scope.entity_id])).rows[0].aggregate_payload;
  assert.equal(committed.closed_observation_scopes.length, 1);
  assert.equal(committed.presence_resolutions.length, 1);
  assert.deepEqual(await counts(pool, context.partyId), {
    items: 1, materializations: 1, decrements: 1
  }, 'fresh finite occurrence after closure must persist one item and one decrement');
  assert.deepEqual(await sourceState(pool, context), {
    state_version: '9', lifecycle_state: 'active', quantity_numerator: '1'
  }, 'fresh occurrence after closure consumes exactly one source portion');
});

});
