import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createNpcRoutineState, npcRoutineActivity } from '@rus/npc-runtime';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { integrateSpatialV3TemporalWriteFragments } from
  '@rus/turn/spatial-v3-temporal-write-integration';

const ownerPath = process.env.REDT_MUTANT_ROOT
  ? resolve(process.env.REDT_MUTANT_ROOT,
    'apps/game-server/src/runtime/npc-routine-temporal.js')
  : resolve('apps/game-server/src/runtime/npc-routine-temporal.js');
const { npcRoutineCandidate, npcRoutineTemporalRegistration } =
  await import(pathToFileURL(ownerPath).href);

const at = (whole_minutes) => ({ whole_minutes: String(whole_minutes),
  subminute_numerator: '0', subminute_denominator: '1' });
const seal = (value) => ({ ...value,
  canonical_digest: computeSpatialV3CanonicalDigest(value) });

function fixture({ secondMovement }) {
  const profile = { schema: 'npc_routine_profile_v1', profile_id: 'two-handoffs',
    revision: 1, status: 'approved', phases: [
      { state_id: 'work', duration_minutes: 60, activity_ref: 'work',
        summary: 'Работает.', activity_status: 'active', runtime_status: 'available',
        can_continue_automatically: true, decision_required: false,
        presence_state: 'on_site', location_ref: 'pf_home' },
      { state_id: 'walk-home', duration_minutes: 12, activity_ref: 'walk-home',
        summary: 'Идёт домой.', activity_status: 'active', runtime_status: 'unavailable',
        can_continue_automatically: true, decision_required: false,
        presence_state: 'on_site', location_ref: 'pf_home',
        movement_handoff: { route_ref: 'work-home', source_endpoint_ref: 'work-endpoint',
          destination_endpoint_ref: 'home-endpoint', destination_location_ref: 'pf_home',
          duration_minutes: 12 } },
      { state_id: 'walk-yard', duration_minutes: 12, activity_ref: 'walk-yard',
        summary: 'Идёт во двор.', activity_status: 'active', runtime_status: 'unavailable',
        can_continue_automatically: true, decision_required: false,
        presence_state: 'on_site', location_ref: 'pf_yard',
        movement_handoff: secondMovement ? { route_ref: 'home-yard',
          source_endpoint_ref: 'home-endpoint', destination_endpoint_ref: 'yard-endpoint',
          destination_location_ref: 'pf_yard', duration_minutes: 12 } : null },
      { state_id: 'rest', duration_minutes: 480, activity_ref: 'rest',
        summary: 'Отдыхает.', activity_status: 'active', runtime_status: 'available',
        can_continue_automatically: true, decision_required: false,
        presence_state: 'on_site', location_ref: 'pf_yard' }
    ] };
  const runtime = createNpcRoutineState({ profile, started_at: at(42050) });
  const activity = npcRoutineActivity(runtime);
  const npc = { instance_id: 'worker', machine_state: { status: 'idle',
    current_activity: activity, current_activity_ref: activity.activity_ref } };
  const row = { id: 'schedule-worker', party_id: 'party', npc_id: 'worker',
    state_version: 1, current_position_node_id: 'work-position',
    current_activity_execution_id: null, causal_state_ref: { routine_state: runtime },
    last_completed_movement: { destination_position_node_id: 'work-position',
      destination_location_ref: 'pf_home', completed_at: at(42000) },
    approved_location_bindings: [
      { position_node_id: 'work-position', location_ref: 'pf_home',
        binding_ref: { entity_id: 'binding-work', authoring_version: '1' } },
      ...['pf_home', 'pf_yard'].map((location_ref) => ({
        position_node_id: location_ref === 'pf_home' ? 'home-position' : 'yard-position',
        location_ref, binding_ref: { entity_id: `binding-${location_ref}`,
          authoring_version: '1' } }))
    ],
    npc_snapshot: structuredClone(npc),
    npc_placement: { entity_kind: 'npc', entity_id: 'worker',
      position_node_id: 'work-position', state_version: 1 },
    attention_state_ref: ref('condition_set', 'attention'),
    body_state_ref: ref('body_state', 'body'),
    knowledge_state_ref: ref('knowledge_fact', 'knowledge'),
    relationship_state_ref: ref('condition_set', 'relations'),
    route_endpoint_positions: {
      'work-endpoint': { position_id: 'work-position', status: 'active' },
      'home-endpoint': { position_id: 'home-position', status: 'active' },
      'yard-endpoint': { position_id: 'yard-position', status: 'active' }
    } };
  return { projection: { npcs: [npc], npc_schedule_runtime: [row] }, row };
}

function ref(entity_kind, entity_id) { return { entity_kind, entity_id }; }

function temporalContext(projection, persistedProjection) {
  const withSourceProof = projection.temporal_source_proof ? projection : {
    ...projection, temporal_source_proof: {
      npc_schedule_runtime: structuredClone(persistedProjection.npc_schedule_runtime)
    }
  };
  return { projection: withSourceProof,
    request: { relevant_state_projection: persistedProjection,
      idempotency_context: { change_set_id: 'change-placement-cas' } } };
}

function runWindow({ secondMovement }) {
  const { projection: initial, row } = fixture({ secondMovement });
  const persisted = structuredClone(initial);
  const registration = npcRoutineTemporalRegistration();
  let projection = initial;
  let candidate = npcRoutineCandidate(row);
  const transitions = [];
  let completedMovements = 0;
  while (candidate != null && completedMovements < (secondMovement ? 2 : 1)) {
    const result = registration.resolve(candidate,
      temporalContext(projection, persisted));
    transitions.push(...result.proposals);
    completedMovements += result.proposals.filter(({ npc_routine_transition }) =>
      npc_routine_transition.proposal?.movement_transition?.status === 'completed').length;
    projection = result.state_projection;
    candidate = result.replacement;
  }
  assert.equal(completedMovements, secondMovement ? 2 : 1,
    'fixture must complete requested movement handoffs');
  const temporalResult = seal({ combined_change_set: { proposals:
    transitions.map((proposal) => seal(proposal)) } });
  return { initial, temporalResult,
    integrated: integrateSpatialV3TemporalWriteFragments({
      base_write_plan_input: { plan_id: 'plan', party_id: 'party',
        canonical_input_digest: 'sha256:base', expected_state_versions: [],
        lock_context: { physical_keys: [] },
        approved_write_sets: [{ appends: [], inserts: [], updates: [] }] },
      temporal_result: temporalResult }) };
}

test('two completed D-1 handoffs share persisted placement CAS and commit one version', () => {
  const { integrated } = runWindow({ secondMovement: true });
  assert.equal(integrated.ok, true, JSON.stringify(integrated.error));
  const writes = integrated.input.approved_write_sets.flatMap(({ updates }) => updates)
    .filter(({ target_table }) => target_table === 'entity_placements');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].record.position_node_id, 'yard-position');
  assert.equal(writes[0].record.state_version, 2);
  assert.deepEqual(integrated.input.expected_state_versions.filter(({ target_table }) =>
    target_table === 'entity_placements').map(({ state_version }) => state_version), [1]);
});

test('one completed D-1 handoff remains a valid placement write', () => {
  const { integrated } = runWindow({ secondMovement: false });
  assert.equal(integrated.ok, true, JSON.stringify(integrated.error));
  const writes = integrated.input.approved_write_sets.flatMap(({ updates }) => updates)
    .filter(({ target_table }) => target_table === 'entity_placements');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].record.position_node_id, 'home-position');
  assert.equal(writes[0].record.state_version, 2);
  assert.deepEqual(integrated.input.expected_state_versions.filter(({ target_table }) =>
    target_table === 'entity_placements').map(({ state_version }) => state_version), [1]);
});
