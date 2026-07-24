import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createSpatialV3DomainMutationService, createSpatialV3DomainPlacementIntegrator } from '@rus/party-store/spatial-v3-domain-integration';

const api = createSpatialV3DomainPlacementIntegrator();
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const pins = { canonical_digest: 'sha256:'.padEnd(71, 'a') };
const root = (entity_ref, position_node_id = 'p1') => ({ party_id: 'party', entity_ref, placement_kind: 'scene_position', position_node_id, occupies_capacity_units: 1 });
const inside = (entity_ref, host_entity_ref) => ({ party_id: 'party', entity_ref, placement_kind: 'inside_entity', host_entity_ref, occupies_capacity_units: 1 });

test('P23 enforces one normalized authoritative placement, acyclic nesting and exact access root', () => {
  const chest = ref('container', 'chest'); const item = ref('item', 'item');
  assert.equal(api.validatePlacements({ party_id: 'party', active_position_ids: ['p1'], placements: [root(chest), inside(item, chest)] }).ok, true);
  assert.equal(api.validatePlacements({ party_id: 'party', active_position_ids: ['p1'], placements: [root(chest), root(chest)] }).error.code, 'dual_location_owner');
  assert.equal(api.validatePlacements({ party_id: 'party', active_position_ids: ['p1'], placements: [inside(chest, item), inside(item, chest)] }).error.code, 'attachment_graph_invalid');
  assert.equal(api.validatePlacements({ party_id: 'party', active_position_ids: ['p1'], placements: [root(chest, 'missing')] }).error.code, 'route_endpoint_invalid');
  assert.equal(api.validatePlacements({ party_id: 'party', active_position_ids: ['p1'], placements: [{ ...root(chest), host_entity_ref: ref('transport', 'boat') }] }).ok, false, 'scene position may not silently acquire a host');
});

test('P23 placement property/metamorphic checks do not infer topology from ordering or entity label', () => {
  const entries = [root(ref('container', 'box')), inside(ref('item', 'coin'), ref('container', 'box')), inside(ref('property', 'seal'), ref('container', 'box'))];
  for (const placements of [entries, [...entries].reverse(), [...entries].sort(() => 0)]) assert.equal(api.validatePlacements({ party_id: 'party', active_position_ids: ['p1'], placements }).ok, true);
  const mutated = structuredClone(entries); mutated[1].host_entity_ref = ref('container', 'invented-nearest-box');
  assert.equal(api.validatePlacements({ party_id: 'party', active_position_ids: ['p1'], placements: mutated }).ok, false);
});

test('P23 validates causal NPC schedule pins and rejects anchor-only/rematerialized placement', () => {
  const npc = ref('npc', 'guard'); const placement = root(npc);
  assert.equal(api.validateNpcSchedule({ npc_ref: npc, placement, schedule_endpoint_ref: { endpoint_kind: 'scene_position', endpoint_id: 'p1' }, schedule_profile_ref: { entity_ref: ref('schedule_profile', 'day'), authoring_version: 'r1' }, dependency_pins: pins }).ok, true);
  assert.equal(api.validateNpcSchedule({ npc_ref: npc, placement: { ...placement, g5_anchor_id: 'legacy' }, schedule_endpoint_ref: { endpoint_kind: 'scene_position', endpoint_id: 'p1' }, schedule_profile_ref: { entity_ref: ref('schedule_profile', 'day'), authoring_version: 'r1' }, dependency_pins: pins }).ok, false, 'legacy anchor-only placement is never inferred');
  assert.equal(api.validateNpcSchedule({ npc_ref: npc, placement, schedule_endpoint_ref: { endpoint_kind: 'scene_position', endpoint_id: 'p1' }, schedule_profile_ref: { entity_ref: ref('schedule_profile', 'day') }, dependency_pins: pins }).ok, false);
});

test('P23 keeps movable cover as a revalidated relative relation, never a second placement', () => {
  const valid = api.validateRelativePosition({ party_id: 'party', actor_ref: ref('actor', 'a'), target_entity_ref: ref('item', 'shield'), relation: 'using_cover', against_position_id: 'p1', condition_ref: { entity_ref: ref('condition_profile', 'raised-shield'), authoring_version: 'r1' }, active_position_ids: ['p1'] });
  assert.equal(valid.ok, true);
  assert.equal(api.validateRelativePosition({ ...valid, active_position_ids: [] }).ok, false);
});

test('P23 carrier context keeps attached G6 identifiers stable, forbids dual root location and retries deterministically', () => {
  const transport = ref('transport', 'boat'); const state = { id: 'travel-1', state_version: 4 };
  const input = { transport_ref: transport, attached_g6_ids: ['cabin'], approved_attached_scene_template_ref: { entity_ref: ref('transport_template', 'boat-cabin'), authoring_version: 'r1' }, active_attachment_chain: [{ subject_ref: ref('actor', 'a'), carrier_ref: transport }], transport_travel_state: state, dependency_pins: pins, actor_carrier_position: { actor_ref: ref('actor', 'a'), root_carrier_ref: transport, local_position_node_id: 'berth' } };
  const first = api.validateCarrierState(input); const retry = api.validateCarrierState(structuredClone(input));
  assert.deepEqual(first, retry); assert.equal(first.root_context.transport_travel_state.id, 'travel-1'); assert.equal(first.attached_g6_ids[0], 'cabin');
  assert.equal(api.validateCarrierState({ ...input, own_journey_location: { location_kind: 'in_transit' } }).error.code, 'dual_location_owner');
  assert.equal(api.validateCarrierState({ ...input, approved_attached_scene_template_ref: null }).error.code, 'spatial_candidate_gap');
});

test('P23 allows interior action only at persisted carrier position and requires shared root clock while moving', () => {
  const transport = ref('transport', 'boat'); const state = api.validateCarrierState({ transport_ref: transport, attached_g6_ids: ['cabin'], approved_attached_scene_template_ref: { entity_ref: ref('transport_template', 'boat-cabin'), authoring_version: 'r1' }, active_attachment_chain: [{ subject_ref: ref('actor', 'a'), carrier_ref: transport }], transport_travel_state: { id: 'travel', state_version: 1 }, dependency_pins: pins, actor_carrier_position: { actor_ref: ref('actor', 'a'), root_carrier_ref: transport, local_position_node_id: 'berth' } });
  const action = { journey_scope: 'carrier_local', transport_state: state, actor_carrier_position: state.actor_carrier_position, action_endpoint_ref: { endpoint_kind: 'scene_position', endpoint_id: 'berth' }, root_execution: { status: 'active' }, synchronized_slice: { root_execution_id: 'root' } };
  assert.equal(api.validateCarrierLocalAction(action).ok, true);
  assert.equal(api.validateCarrierLocalAction({ ...action, action_endpoint_ref: { endpoint_kind: 'scene_position', endpoint_id: 'deck' } }).error.code, 'movement_endpoint_kind_invalid');
  assert.equal(api.validateCarrierLocalAction({ ...action, synchronized_slice: null }).error.code, 'time_accumulator_invalid');
});

function domainSnapshot() {
  const transport = ref('transport', 'boat'); const actor = ref('actor', 'a'); const npc = ref('npc', 'guard');
  return { party_id: 'party', placements: [root(npc), root(transport)], controls: [
    { entity_ref: npc, owner_ref: actor, holder_ref: actor, controller_ref: actor, access_profile_ref: { entity_ref: ref('access_profile', 'open'), authoring_version: 'r1' }, capacity_units: 2 },
    { entity_ref: transport, owner_ref: actor, holder_ref: actor, controller_ref: actor, access_profile_ref: { entity_ref: ref('access_profile', 'pilot'), authoring_version: 'r1' }, capacity_units: 2 }
  ], npc_schedules: [{ npc_ref: npc, active: true, current_endpoint_ref: { endpoint_kind: 'scene_position', endpoint_id: 'p1' }, schedule_profile_ref: { entity_ref: ref('schedule_profile', 'watch'), authoring_version: 'r1' }, dependency_pins: pins, causal_state_ref: { entity_ref: ref('npc_causal_state', 'watch') } }], active_route_endpoint_ids: ['p1'], carrier: { transport_ref: transport, approved_attached_scene_template_ref: { entity_ref: ref('transport_template', 'boat-cabin'), authoring_version: 'r1' }, bound_attached_g6: { id: 'cabin', template_ref: { entity_id: 'boat-cabin', authoring_version: 'r1' } }, active_attachment_chain: [{ subject_ref: actor, carrier_ref: transport }], actor_carrier_position: { actor_ref: actor, root_carrier_ref: transport } } };
}
function mutation(overrides = {}) { const request = { party_id: 'party', idempotency_key: 'p23-idem', expected_state_versions: [{ resource: 'entity_placements', id: 'npc:guard', state_version: 1 }], domain_mutation: { entity_kind: 'npc', entity_id: 'guard', placement_kind: 'scene_position', position_node_id: 'p1', capacity_units: 1 }, ...overrides }; return { ...request, canonical_digest: computeSpatialV3CanonicalDigest(request) }; }
function visibleEnvelope(request) {
  const changeSetId = `p23:${request.party_id}:${request.canonical_digest}`;
  const visiblePayload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Положение зафиксировано.',
    perceived_changes: ['Положение сущности изменено.'],
    sensory_details: [],
    visible_npcs: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const dependencyPins = [{
    dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'world_revision', entity_id: 'temporal-v4' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '4.3.0-target.1', state_version: null }
  }];
  return {
    package_id: `visible:${changeSetId}`,
    party_id: request.party_id,
    turn_id: `p23:${request.idempotency_key}`,
    committed_state_version: String(request.expected_state_versions[0].state_version + 1),
    change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
    visible_payload: visiblePayload,
    presentation_status: 'pending',
    projection_policy_ref: {
      entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection-v1' },
      authoring_version: '4.3.0-target.1'
    },
    dependency_pins: {
      pins: dependencyPins,
      canonical_digest: computeSpatialV3CanonicalDigest(dependencyPins).replace('sha256:', '')
    },
    idempotency_record_id: `p23-idem:${request.party_id}:${request.idempotency_key}`
  };
}
const commit = (service, request) => service.commit(request, {
  visible_package_envelope: visibleEnvelope(request)
});

test('P23 mutation protocol locks exact snapshot, retries only identical input and commits one atomic effect', async () => {
  const calls = []; let committed = false; const repository = { loadSnapshot: async () => { calls.push(['load']); return domainSnapshot(); }, recheck: async () => { calls.push(['recheck']); return { ok: true, snapshot: domainSnapshot() }; } };
  const committer = { commit: async ({ plan, recheck }) => { calls.push(['committer', plan.schema]); if (committed) return { ok: true, replay: true, change_set_id: 'cs' }; for (const check of plan.commit_rechecks) assert.equal((await recheck({ transaction: {}, check, plan })).ok, true); committed = true; return { ok: true, replay: false, change_set_id: 'cs' }; } };
  const service = createSpatialV3DomainMutationService({ repository, committer, verifyApproval: async () => ({ ok: true }) }); const request = mutation();
  assert.equal((await commit(service, request)).ok, true); assert.equal((await commit(service, structuredClone(request))).replay, true); assert.deepEqual(calls.map(([kind]) => kind), ['load', 'committer', 'recheck', 'recheck', 'recheck', 'recheck', 'recheck', 'recheck', 'recheck', 'recheck', 'load', 'committer']);
  assert.equal((await commit(service, { ...request, expected_state_versions: [{ resource: 'entity_placements', id: 'npc:guard', state_version: 2 }] })).error.code, 'generated_schema_mismatch');
});

test('P23 adversarial persisted snapshot checks schedule, ownership capacity, carrier binding and root time identity', async () => {
  const committer = { commit: async ({ recheck }) => recheck({ transaction: {} }) };
  const repo = (snapshot) => ({ loadSnapshot: async () => snapshot, recheck: async () => ({ ok: true, snapshot }) });
  const badSchedule = domainSnapshot(); badSchedule.npc_schedules[0].current_endpoint_ref.endpoint_id = 'wrong';
  assert.equal((await commit(createSpatialV3DomainMutationService({ repository: repo(badSchedule), committer, verifyApproval: async () => ({ ok: true }) }), mutation())).ok, false);
  const badCarrier = domainSnapshot(); badCarrier.carrier.bound_attached_g6.template_ref.authoring_version = 'other';
  assert.equal((await commit(createSpatialV3DomainMutationService({ repository: repo(badCarrier), committer, verifyApproval: async () => ({ ok: true }) }), mutation())).error.code, 'journey_location_ownership_mismatch');
  const badSlice = domainSnapshot(); badSlice.synchronized_slice = { root_execution_id: 'root', root_travel_state_id: 'travel', root_execution_state_version: 1, root_travel_state_version: 1, canonical_digest: 'slice' };
  const request = mutation({ carrier_local: { root_execution_id: 'root', root_travel_state_id: 'travel', root_execution_state_version: 1, root_travel_state_version: 1, slice_digest: 'forged' } });
  assert.equal((await commit(createSpatialV3DomainMutationService({ repository: repo(badSlice), committer, verifyApproval: async () => ({ ok: true }) }), request)).ok, false);
});

test('P23 fails closed without an injected approval verifier', () => {
  assert.throws(() => createSpatialV3DomainMutationService({ repository: { loadSnapshot: async () => domainSnapshot(), recheck: async () => ({ ok: true, snapshot: domainSnapshot() }) }, committer: { commit: async () => ({ ok: true }) } }), /approval verifier/u);
});

test('P23 approval rejection fails before the committer receives a plan', async () => {
  let committed = false;
  const repository = { loadSnapshot: async () => domainSnapshot(), recheck: async () => ({ ok: true, snapshot: domainSnapshot() }) };
  const service = createSpatialV3DomainMutationService({ repository, committer: { commit: async () => { committed = true; return { ok: true }; } }, verifyApproval: async () => ({ ok: false }) });
  assert.equal((await commit(service, mutation())).error.code, 'generated_schema_mismatch');
  assert.equal(committed, false);
});

test('P23 rejects a semantic mutation before approval and commit when its visible package is absent', async () => {
  let approved = false; let committed = false;
  const repository = { loadSnapshot: async () => domainSnapshot(), recheck: async () => ({ ok: true, snapshot: domainSnapshot() }) };
  const service = createSpatialV3DomainMutationService({
    repository,
    committer: { commit: async () => { committed = true; return { ok: true }; } },
    verifyApproval: async () => { approved = true; return { ok: true }; }
  });
  assert.equal((await service.commit(mutation())).error.code, 'visible_package_persistence_gap');
  assert.equal(approved, false);
  assert.equal(committed, false);
});
