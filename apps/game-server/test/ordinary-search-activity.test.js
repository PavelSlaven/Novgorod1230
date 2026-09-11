import { projectDirectSeedChanges } from '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { canonicalDigest } from '@rus/materialization';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolveTurnStepSemanticActivityTime } from '@rus/turn';
import { enabled, group, request, verifyStageBCutover } from './lower-dvina-trace-o1-fixture.js';
import { createPorts, projection } from './lower-dvina-trace-turn-step-runtime-ports-fixture.js';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { createLowerDvinaTraceTurnStepGenericOwners } from '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { validateTurnStepBatchPlanBindings } from '../src/infrastructure/postgres/lower-dvina-trace-turn-step-plan-binding.js';

const raw = await readFile(new URL('../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-owner-profiles.json', import.meta.url));
const owners = createLowerDvinaTraceTurnStepGenericOwners({ profiles: JSON.parse(raw),
  artifactPin: { digest: createHash('sha256').update(raw).digest('hex') } });
const clock = (minutes) => ({ whole_minutes: String(minutes), subminute_numerator: '0', subminute_denominator: '1' });

for (const resolution of ['absent', 'no_change', 'authority_required']) {
  test(`new ordinary search ${resolution} binds exact activity only after admission`, async () => {
    const input = request('Перебрать сор в поисках обрезка кожи.');
    input.request.step_index = 1;
    input.request.actor = { actor_id: 'mikula', body: { health: 100, satiety: 100,
      energy: 100, active_conditions: [], body_parts: {} } };
    input.operation = { ...input.operation, op: 'request_discovery',
      actor_ref: 'mikula', discovery_kind: 'search' };
    input.plan = { resolution: 'domain_request', activity: { owner: 'domain' },
      operations: [input.operation] };
    input.working_projection = projection();
    let calls = 0, committed = null;
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
      inputDigest: 'search', verifyStageBCutover, loadEnablement: async () => restoredEnablement(committed),
      ordinaryMaterializationModel: async (modelRequest) => {
        calls += 1;
        return modelRequest.mode === 'seed_scope' ? {
          schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
          resolution: 'seeded', density_band_proposal: 'ordinary', background_groups: [group()],
          entities: [], presence_resolutions: [], reason_code: 'seed'
        } : { schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
          resolution, density_band_proposal: null, background_groups: [], entities: [],
          presence_resolutions: [{ candidate_key: modelRequest.candidate_query.candidate_key,
            coverage_key: modelRequest.candidate_query.coverage_key, resolution }], reason_code: resolution };
      } });
    const ports = createPorts({ ordinaryDiscoveryResolver: resolver,
      semanticActivityOwner: owners.semanticActivityOwner });
    const applied = await ports.ordinaryDiscoveryResolver(input);
    assert.equal(calls, 2);
    assert.equal(applied.ordinary_materialization_atomic_write_plan.resolution, resolution);
    assert.equal(applied.consequence_fragment.visible_seed.ordinary_presence_seed.query, input.operation.query);
    const ordinaryPlan = applied.ordinary_materialization_atomic_write_plan;
    const binding = { batch: { root_turn_id: input.request.root_turn_id, operations: applied.write_fragments },
      state: { actor_id: 'mikula', items: [] }, ordinaryPlan,
      factual: { loop_trace: { step_traces: [{ applied: true, step_index: 1,
        approved_plan: input.plan, plan_request: input.request }] } } };
    assert.doesNotThrow(() => validateTurnStepBatchPlanBindings(binding));
    assert.deepEqual(projectDirectSeedChanges({ input: { consequence: applied.consequence_fragment },
      directSeedKeys: Object.entries(applied.consequence_fragment.visible_seed)
        .filter(([, value]) => value.kind === 'semantic_activity').map(([key]) => key) }),
      resolution === 'absent' ? ['Поиск занял 15 минут.'] : [
        `За 15 минут поиска по вопросу «${input.operation.query}» подтверждённой находки нет.`]);
    assert.equal(applied.duration_minutes, 15);
    assert.equal(applied.consequence_fragment.duration_minutes, 15);
    assert.equal(applied.body_state_after.energy, 99);
    assert.equal(applied.player_response_boundary, true);
    assert.equal(applied.write_fragments.length, 1);
    const time = resolveTurnStepSemanticActivityTime({ batch: binding.batch,
      consequence: applied.consequence_fragment, clockBefore: clock(100), clockAfter: clock(115),
      exactElapsed: { exact_minutes: { numerator: '15', denominator: '1' } } });
    assert.equal(time.semantic_activity_resolutions.length, 1);
    assert.equal(time.semantic_activity_resolutions[0].execution.ended_at.whole_minutes, '115');
    assert.throws(() => validateTurnStepBatchPlanBindings({ ...binding,
      ordinaryPlan: { ...ordinaryPlan, request_identity: 'another-presence' } }),
    { code: 'TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH' });
    committed = ordinaryPlan;
    const retryPorts = createPorts({ semanticActivityOwner: owners.semanticActivityOwner,
      ordinaryDiscoveryResolver: resolver });
    const retryRequest = { ...input.request, root_turn_id: 'turn:party:2' };
    const retry = await retryPorts.ordinaryDiscoveryResolver({ ...input, request: retryRequest });
    assert.equal(calls, 2, 'restored exact negative result does not reroll the model');
    assert.equal(retry.duration_minutes, 15);
    assert.equal(retry.write_fragments.length, 1);
    assert.equal(retry.ordinary_materialization_atomic_write_plan, undefined);
    const cachedBinding = { ...binding, ordinaryPlan: null,
      batch: { ...binding.batch, root_turn_id: retryRequest.root_turn_id, operations: retry.write_fragments },
      factual: { loop_trace: { step_traces: [{ ...binding.factual.loop_trace.step_traces[0], plan_request: retryRequest }] } } };
    assert.doesNotThrow(() => validateTurnStepBatchPlanBindings(cachedBinding));
    for (const fragments of [[...retry.write_fragments, ...retry.write_fragments],
      retry.write_fragments.map(fragment => ({ ...fragment, value: { ...fragment.value, step_index: 2 } })),
      retry.write_fragments.map(fragment => ({ ...fragment, value: { ...fragment.value, effort: 'heavy' } }))]) {
      assert.throws(() => validateTurnStepBatchPlanBindings({ ...cachedBinding,
        batch: { ...cachedBinding.batch, operations: fragments } }),
      { code: 'TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH' });
    }
    assert.throws(() => validateTurnStepBatchPlanBindings({ ...binding,
      batch: { ...binding.batch, operations: [] } }),
    { code: 'TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH' });
    const recall = await retryPorts.ordinaryDiscoveryResolver({ ...input,
      operation: { ...input.operation, discovery_kind: 'inspect' } });
    assert.equal(recall.duration_minutes, 0);
    assert.equal(JSON.stringify(recall.consequence_fragment).includes('discovery_result'), false);
    assert.equal(calls, 2);
    const firstTrace = { ...cachedBinding.factual.loop_trace.step_traces[0],
      approved_plan: { ...input.plan, operations: [{ ...input.operation, discovery_kind: 'inspect' }] } };
    const secondTrace = { ...cachedBinding.factual.loop_trace.step_traces[0], step_index: 2,
      plan_request: { ...retryRequest, step_index: 2 } };
    assert.doesNotThrow(() => validateTurnStepBatchPlanBindings({ ...cachedBinding,
      ordinaryPlan: { ...ordinaryPlan, resolution: 'materialize',
        request_identity: `${retryRequest.root_turn_id}:ordinary:presence:step:1` },
      factual: { loop_trace: { step_traces: [firstTrace, secondTrace] } },
      batch: { ...cachedBinding.batch, operations: retry.write_fragments.map(fragment => ({
        ...fragment, value: { ...fragment.value, step_index: 2 } })) } }));
    committed = null;
    const inspect = await ports.ordinaryDiscoveryResolver({ ...input,
      operation: { ...input.operation, discovery_kind: 'inspect' } });
    assert.equal(inspect.duration_minutes, 0, 'material prerequisite does not perform a physical search');
  });
}

function restoredEnablement(plan) {
  const value = enabled();
  if (plan == null) return value;
  const aggregate = structuredClone(plan.next_aggregate);
  value.execution_context.supporting_bases = structuredClone(plan.next_supporting_basis_catalog);
  value.ordinary_aggregate = aggregate;
  value.objective_context.ordinary_state = {
    seeded: aggregate.seeded, density_band: aggregate.density_band,
    remaining_identity_budget: aggregate.remaining_identity_budget,
    background_groups: aggregate.background_groups.map(({ group_ref }) => group_ref),
    presence_resolutions: aggregate.presence_resolutions.map(({ resolution_ref }) => resolution_ref),
    closed_observation_scopes: aggregate.closed_observation_scopes.map(({ coverage_key }) => coverage_key)
  };
  value.version_pins = { ...value.version_pins, party_state_version: 1,
    ordinary_state_version: aggregate.state_version,
    supporting_basis_catalog_version: plan.next_supporting_basis_catalog_version,
    supporting_basis_catalog_digest: plan.next_supporting_basis_catalog_digest };
  return value;
}


test('missing supporting basis is preflight: first seed persists without search or presence, reload stays free', async () => {
  const input = request('Перебрать сор ради незнакомого предмета.');
  input.request.step_index = 1;
  input.request.actor = { actor_id: 'mikula', body: { health: 100, satiety: 100,
    energy: 100, active_conditions: [], body_parts: {} } };
  input.operation = { ...input.operation, op: 'request_discovery',
    actor_ref: 'mikula', discovery_kind: 'search' };
  input.plan = { resolution: 'domain_request', activity: { owner: 'domain' },
    operations: [input.operation] };
  input.working_projection = projection();
  let committed = null, calls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
    inputDigest: 'preflight', verifyStageBCutover, loadEnablement: async () => {
      const value = restoredEnablement(committed);
      value.execution_context.supporting_bases.forEach(basis => { basis.functional_buckets = ['household']; });
      value.version_pins.supporting_basis_catalog_digest = canonicalDigest({
        domain: 'ordinary_supporting_basis_catalog_v1',
        supporting_bases: value.execution_context.supporting_bases });
      return value;
    }, ordinaryMaterializationModel: async modelRequest => {
      calls += 1;
      assert.equal(modelRequest.mode, 'seed_scope', 'presence has no compatible supporting basis');
      return { schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
        resolution: 'seeded', density_band_proposal: 'ordinary', background_groups: [{ ...group(), functional_bucket: 'household' }],
        entities: [], presence_resolutions: [], reason_code: 'seed' };
    } });
  const ports = createPorts({ ordinaryDiscoveryResolver: resolver,
    semanticActivityOwner: owners.semanticActivityOwner });
  const first = await ports.ordinaryDiscoveryResolver(input);
  committed = first.ordinary_materialization_atomic_write_plan;
  assert.ok(committed, 'first encounter keeps its admitted scene seed');
  assert.equal(first.duration_minutes, 0);
  assert.equal(JSON.stringify(first.consequence_fragment).includes('discovery_result'), false);
  assert.deepEqual(first.write_fragments, []);
  assert.deepEqual(committed.next_aggregate.presence_resolutions, []);
  assert.ok(committed.transitions.every(transition => transition.kind !== 'resolve_presence'));
  assert.notEqual(committed.request_identity, `${input.request.root_turn_id}:ordinary:presence:step:1`);
  const reloaded = await createPorts({ ordinaryDiscoveryResolver: resolver,
    semanticActivityOwner: owners.semanticActivityOwner }).ordinaryDiscoveryResolver(input);
  assert.equal(reloaded.duration_minutes, 0);
  assert.deepEqual(reloaded.write_fragments, []);
  assert.equal(reloaded.ordinary_materialization_atomic_write_plan, undefined);
  assert.equal(calls, 1);
});

test('performed result belongs only to its search, not another unresolved query or activity', () => {
  const query = 'Найти обрезок верёвки.';
  const seed = { turn_step_search: { kind: 'semantic_activity', discovery_kind: 'search',
    duration_minutes: 15, discovery_result: { resolution: 'no_change', query } },
    turn_step_rest: { kind: 'semantic_activity', duration_minutes: 5 },
    ordinary_presence_seed: { kind: 'ordinary_presence_seed', resolution: 'no_change',
      query: 'Осмотреть роспись на чаше.' } };
  const changes = projectDirectSeedChanges({ input: { consequence: { visible_seed: seed } },
    directSeedKeys: ['turn_step_search', 'turn_step_rest'] });
  assert.deepEqual(changes, [
    `За 15 минут поиска по вопросу «${query}» подтверждённой находки нет.`,
    'Прошло 5 минут.']);
  assert.equal(changes.some(value => value.includes('роспись')), false);
  seed.turn_step_rest.discovery_result = seed.turn_step_search.discovery_result;
  assert.throws(() => projectDirectSeedChanges({ input: { consequence: { visible_seed: seed } },
    directSeedKeys: ['turn_step_rest'] }), { code: 'TRACE_CURRENT_SCENE_PROJECTION_INVALID' });
});
