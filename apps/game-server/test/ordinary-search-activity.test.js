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

for (const resolution of ['absent', 'authority_required']) {
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
    if (resolution === 'authority_required') {
      assert.equal(applied.duration_minutes, 0);
      assert.deepEqual(applied.write_fragments, []);
      return;
    }
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
      ordinaryPlan: { ...ordinaryPlan, resolution: 'authority_required' } }),
    { code: 'TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH' });
    committed = ordinaryPlan;
    const retryPorts = createPorts({ semanticActivityOwner: owners.semanticActivityOwner,
      ordinaryDiscoveryResolver: resolver });
    const retry = await retryPorts.ordinaryDiscoveryResolver({ ...input,
      request: { ...input.request, root_turn_id: 'turn:party:2' } });
    assert.equal(calls, 2, 'restored exact negative result does not reroll the model');
    assert.equal(retry.duration_minutes, 0);
    assert.deepEqual(retry.write_fragments, []);
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
