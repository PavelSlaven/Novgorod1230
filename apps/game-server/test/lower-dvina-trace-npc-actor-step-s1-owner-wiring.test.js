import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { createLowerDvinaTraceS1ProductionResolverFactory } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';

test('NPC actor-step S1 look reaches production owner only with known prepared position', async () => {
  const state = s1State();
  const resolverFactory = createLowerDvinaTraceS1ProductionResolverFactory({
    pool: { query: async (sql) => sql.includes('party_spatial_semantic_resolutions')
      ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [envelopeRow()] } },
    resolveSpatialSemanticDescriptor: async ({ request: { request_id } }) => ({
      schema: 'rus.s1_spatial_semantic_proposal.v1', request_id,
      name: 'Незнакомый выступ', description: 'Сырым камнем выдается у воды.',
      semantic_requirements: [] })
  });
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createSpatialSemanticResolver: resolverFactory });
  const phase7Contracts = { zhdanko: state.npcs[0], npcSemanticProfile: {
    profile_id: 'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1, status: 'approved',
    activation_boundary: { phase: 'phase_7', npc_participant_slot_ref: 'zhdanko_storehouse_controller' } } };
  const findS1 = async () => (await factory({ partyId: 'party', requestId: 'request:npc',
    inputDigest: 'digest', state, phase7Contracts })).find(({ operation, capability }) =>
    operation === 'request_discovery' && capability.allowed?.[0]?.target_refs?.[0] === 'position:npc');
  const s1 = await findS1();
  assert.ok(s1);
  assert.equal((await createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory()({
    partyId: 'party', requestId: 'request:npc', inputDigest: 'digest', state,
    phase7Contracts })).some(({ operation }) => operation === 'request_discovery'), false);
  assert.equal(s1.supports({ operation: { actor_ref: 'npc', discovery_kind: 'look',
    target_refs: ['position:npc'] } }), true);
  assert.equal(s1.supports({ operation: { actor_ref: 'npc', discovery_kind: 'inspect',
    target_refs: ['position:npc'] } }), false);
  const result = await s1.execute(execution());
  assert.equal(result.spatial_semantic_atomic_write_plan.schema,
    'spatial_semantic_atomic_write_plan_v1');
  state.npcs[0].perception_snapshot.visible_objects = [];
  assert.equal(await findS1(), undefined);
  state.npcs[0].perception_snapshot.visible_objects = [evidence()];
  state.spatial_semantic[0].consumed_count = 1;
  assert.equal(await findS1(), undefined);
});

function s1State() {
  return { party_id: 'party', party_state: { state_version: 1, turn_number: 0 }, items: [],
    position: { position_id: 'position:player', g6_ref: 'g6:player' }, npcs: [{
      instance_id: 'npc', anchor_id: 'npc-anchor', machine_state: { location_ref: 'npc-place',
        spatial_zone_ref: 'npc-zone', g6_ref: 'g6:npc' }, perception_snapshot: {
        visible_objects: [evidence()] } }], spatial_semantic: [{ status: 'committed',
      envelope_ref: 'envelope:npc', capacity_total: 1, consumed_count: 0,
      envelope: { g6_ref: 'g6:npc', position_ref: 'position:npc' }, resolutions: [] }] };
}
function evidence() { return { entity_ref: { entity_id: 'position:npc' }, source_perception_ref: 'p:npc' }; }
function envelopeRow() {
  return { envelope: { envelope_ref: 'envelope:npc', kind: 'local_natural_feature',
    scope_kind: 'current_position_local_reference', structural_variant: 'descriptive_local_reference',
    available_mechanics: [], required_semantic_requirements: [], topology: null,
    baseline_ref: 'baseline:npc', g5_ref: 'g5:npc', g6_ref: 'g6:npc', position_ref: 'position:npc',
    property_ref: 'property:npc', function_ref: 'function:npc', environment_ref: 'environment:npc',
    semantic_context: { allowed_kind: 'local_natural_feature', period: 'period', region: 'region',
      place_type: 'place', environment: 'environment', material_culture: 'culture', ordinary_boundary: 'ordinary only' },
    profile_ref: 'profile:npc', profile_version: 1, policy_ref: 'policy:npc', policy_version: 1,
    baseline_state_version: 0, g5_state_version: 0, g6_state_version: 0, position_state_version: 0,
    capacity_total: 1, consumed_count: 0, state_version: 1 }, capacity_total: 1,
    consumed_count: 0, state_version: 1, status: 'committed' };
}
function execution() {
  return { operation: { op: 'request_discovery', actor_ref: 'npc', discovery_kind: 'look',
    target_refs: ['position:npc'] }, plan: { schema: 'npc_step_plan_v1' }, request: {
    request_id: 'request:npc', root_turn_id: 'turn:party:1', step_index: 1,
    committed_state_version: 1, actor: { actor_id: 'npc' } }, working_projection: { actor_id: 'npc' },
  prepared_chain_context: null };
}
