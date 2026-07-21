import test from 'node:test';
import assert from 'node:assert/strict';
import { createMovementPlanner, createRoutePlanActivationValidator } from '@rus/movement-routes';
import { createTraversalResolver } from '@rus/movement-routes/spatial-v3';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';

const digest = (value) => computeSpatialV3CanonicalDigest(value);
const pins = () => { const entries = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'revision' }, version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }]; return { pins: entries, canonical_digest: digest(entries).replace('sha256:', '') }; };
const versions = () => { const entries = [{ entity_ref: { entity_kind: 'actor', entity_id: 'actor' }, state_version: 1 }]; return { entries, canonical_digest: digest(entries).replace('sha256:', '') }; };
const capabilityContext = (overrides = {}) => { const value = { cohort_membership_snapshot_pin: null, load_state_pin: null, root_carrier_attachment_pins: null, allowed_movement_methods: ['walk'], available_transport_pins: null, equipment_state_pins: null, legal_access_fact_pins: null, allowed_pace_modes: ['normal'], dependency_pins: pins() }; const payload = { ...value, ...overrides }; return { ...payload, canonical_digest: digest(payload) }; };
const endpoint = (kind, id, target = null) => ({ endpoint_kind: kind, endpoint_id: id, ...(target ? { target_ref: target } : {}) });
const snapshot = (value) => { const anchor = value.endpoint_kind === 'transit_anchor'; const stranded = value.endpoint_kind === 'stranded_state'; const result = { endpoint_ref: value, dependency_pins: pins(), resolved_scene_baseline_id: !anchor && !stranded ? 'baseline' : null, resolved_position_id: !anchor && !stranded ? value.endpoint_id : null, resolved_transit_anchor_id: anchor ? value.endpoint_id : null, resolved_travel_state_id: stranded ? value.endpoint_id : null, route_point_context_digest: anchor ? 'a'.repeat(64) : null }; return { ...result, canonical_digest: digest(result) }; };
const costValue = { cost_kind: 'action', action_units_min: 1, action_units_max: 1, minutes_min: null, minutes_max: null, precision: 'exact' };
const cost = { ...costValue, canonical_digest: digest(costValue) };
const riskValue = { risk_class: 'none', knowledge_precision: 'exact', visible_risk_tags: [] };
const risk = { ...riskValue, canonical_digest: digest(riskValue) };
const versioned = (kind) => ({ entity_ref: { entity_kind: kind, entity_id: `${kind}-id` }, authoring_version: '1' });
const staticStep = (kind = 'immediate_action') => { const action = { action_contract_ref: versioned('action_contract'), relation_ref: { entity_kind: 'scene_edge', entity_id: 'edge' }, action_units: 1, movement_capacity_units: 1, mode_transition_contract_ref: null, completion_effect_contract_ref: null, dependency_pins: pins() }; action.canonical_digest = digest(action); const value = { snapshot_kind: kind, action_snapshot: kind === 'immediate_action' ? action : null, activity_snapshot: null, traversal_snapshot: null }; return { ...value, canonical_digest: digest(value) }; };
const traversalStep = () => { const traversal = { physical_segment_ref: versioned('world_route_segment'), selected_movement_method_id: 'walk', movement_carrier_ref: { entity_kind: 'actor', entity_id: 'actor' }, movement_capacity_units: 1, environment_profile_ref: versioned('environment_profile'), orientation_profile_ref: versioned('movement_orientation_profile'), cost_profile_ref: versioned('movement_cost_profile'), recheck_policy_ref: versioned('dynamic_recheck_policy'), factual_context_snapshot: { context: 'pinned' }, dependency_pins: pins() }; traversal.canonical_digest = digest(traversal); const value = { snapshot_kind: 'timed_traversal', action_snapshot: null, activity_snapshot: null, traversal_snapshot: traversal }; return { ...value, canonical_digest: digest(value) }; };
const activityStep = (completion = null) => { const activity = { activity_contract_ref: versioned('activity_contract'), planned_total_minutes: 1, mode_transition_contract_ref: null, completion_effect_contract_ref: completion, dependency_pins: pins() }; activity.canonical_digest = digest(activity); const value = { snapshot_kind: 'timed_activity', action_snapshot: null, activity_snapshot: activity, traversal_snapshot: null }; return { ...value, canonical_digest: digest(value) }; };
const activationValidator = () => createRoutePlanActivationValidator({ loadCurrentState: async ({ option }) => ({ ok: true, expected_state_versions: option.expected_state_versions }), validateCapability: async () => ({ ok: true }), recheckActivation: async () => ({ ok: true }) });
const proposalVersions = () => ({ entries: [{ entity_ref: { entity_kind: 'expansion_frontier', entity_id: 'frontier' }, state_version: 1 }], canonical_digest: digest([{ entity_ref: { entity_kind: 'expansion_frontier', entity_id: 'frontier' }, state_version: 1 }]).replace('sha256:', '') });
const frontierProposal = () => { const value = { command_id: 'topology', frontier_id: 'frontier', command_kind: 'materialize_next_g5', reservation_request: { party_id: 'party', g4_id: 'g4', profile_ref: versioned('expansion_profile'), slot_ref: versioned('expansion_slot'), frontier_id: 'frontier', selected_template_ref: versioned('generated_g5_template'), requested_units: 1 }, terminal_policy_ref: null, resolved_terminal_target_ref: null, resolved_terminal_target_pins: null, expected_state_versions: proposalVersions(), idempotency_key: 'idem' }; return { ...value, canonical_digest: digest(value) }; };
const preparationMember = () => { const value = { ordinal: 0, member_kind: 'endpoint', source_authoring_ref: versioned('scene_endpoint_slot'), share_mode: 'reusable', dependency_pins: pins() }; return { ...value, member_digest: digest(value) }; };
const preparationProposal = (q) => { const members = [preparationMember()]; const value = { command_id: 'prepare', planning_request_id: q.request_id, planning_request_digest: q.canonical_digest, party_id: q.party_id, proposed_member_set_digest: digest(members).replace('sha256:', ''), expected_state_versions: proposalVersions(), idempotency_key: 'idem', required_member_proposals: members }; return { ...value, canonical_digest: digest(value) }; };

function query(overrides = {}) {
  const value = {
    request_id: 'request', party_id: 'party', request_kind: 'ordinary', journey_owner_ref: { entity_kind: 'actor', entity_id: 'actor' }, journey_scope: 'world_travel',
    start_endpoint_ref: endpoint('scene_position', 'start'), target_request: { target_kind: 'factual_spatial', factual_target_ref: { spatial_kind: 'canonical_g5', spatial_id: 'site' }, knowledge_target_ref: null }, intended_direction_id: null,
    knowledge_subject_ref: null, recovery_binding_ref: null, administrative_authorization_pins: null, knowledge_scope: 'factual', cost_mode: 'action', capability_context: capabilityContext(), expected_state_versions: versions(), planning_state_version: 1
  };
  const { canonical_digest: suppliedDigest, ...rest } = overrides;
  const payload = { ...value, ...rest };
  return { ...payload, canonical_digest: suppliedDigest ?? digest(payload) };
}

function planner(edges, overrides = {}) {
  return createMovementPlanner({
    loadTopology: async () => ({ ok: true, edges, target_resolution_dependency_pins: pins() }),
    snapshotEndpoint: async ({ endpoint_ref }) => snapshot(endpoint_ref),
    validateCapability: async () => ({ ok: true }),
    ...overrides
  });
}

test('P18 resolves only explicit directed topology and produces a ready immutable option', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  const edge = { id: 'edge', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const result = await planner([edge]).resolve(query());
  assert.equal(result.ok, true); assert.equal(result.options.length, 1);
  assert.equal(result.options[0].mechanical_readiness, 'ready'); assert.equal(result.options[0].executable, true);
  assert.equal(result.options[0].steps.length, 1); assert.ok(Object.isFrozen(result.options[0]));
});

test('P18 respects direction and does not derive travel from containment or reverse edges', async () => {
  const edge = { id: 'one-way', edge_kind: 'scene_edge', direction_id: 'east', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: endpoint('scene_position', 'end'), step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const result = await planner([edge]).resolve(query({ target_request: null, intended_direction_id: 'west' }));
  assert.equal(result.ok, false); assert.equal(result.error.code, 'knowledge_target_resolution_gap');
});

test('P18 resolves knowledge token separately and returns typed data gap without a resolver', async () => {
  const result = await planner([]).resolve(query({ knowledge_scope: 'character_known', knowledge_subject_ref: { entity_kind: 'actor', entity_id: 'actor' }, target_request: { target_kind: 'knowledge_spatial', factual_target_ref: null, knowledge_target_ref: { knowledge_kind: 'known_party_site', knowledge_id: 'belief' } } }));
  assert.equal(result.ok, false); assert.equal(result.error.code, 'knowledge_target_resolution_gap');
});

test('P18 exposes each non-ready state as a finite non-mutating command proposal', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  for (const readiness of ['requires_frontier_resolution', 'requires_preparation', 'temporarily_blocked', 'data_gap']) {
    const q = query(); const proposal = readiness === 'requires_frontier_resolution' ? frontierProposal() : readiness === 'requires_preparation' ? preparationProposal(q) : null;
    const severity = readiness === 'temporarily_blocked' ? 'temporary' : 'hard_block'; const reasons = ['temporarily_blocked', 'data_gap'].includes(readiness) ? [{ reason_code: readiness, severity, diagnostic_message: 'blocked' }] : [];
    const edge = { id: readiness, edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk, readiness, command_proposal: proposal, blocking_reasons: reasons };
    const result = await planner([edge]).resolve(q);
    assert.equal(result.ok, true, readiness); const option = result.options[0]; assert.equal(option.executable, false, readiness); assert.equal(option.steps.length, 0, readiness);
    assert.equal(option.mechanical_readiness, readiness); assert.equal(readiness === 'requires_frontier_resolution' ? option.topology_command_proposal.command_id : option.topology_command_proposal, readiness === 'requires_frontier_resolution' ? 'topology' : null);
  }
});

test('P18 activation accepts only ready continuous options and seals a digest', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  const edge = { id: 'edge', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const option = (await planner([edge]).resolve(query())).options[0];
  const activated = await activationValidator().activate({ plan_id: 'plan', option, world_revision_id: 'revision', catalog_digest: '1'.repeat(64), planning_algorithm_version: '1', planning_context_dependency_pins: pins(), created_change_set_id: 'change', created_at_turn: 0 });
  assert.equal(activated.ok, true); assert.equal(activated.plan.status, 'ready'); assert.ok(activated.plan.canonical_serialization_digest.startsWith('sha256:'));
  const blocked = await activationValidator().activate({ plan_id: 'no', option: { ...option, executable: false, mechanical_readiness: 'data_gap' } });
  assert.equal(blocked.ok, false); assert.equal(blocked.error.code, 'route_plan_snapshot_missing');
});

test('P18 seals canonical plan payload independently of lifecycle and rejects handcrafted ready options', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  const edge = { id: 'edge', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const option = (await planner([edge]).resolve(query())).options[0]; const validator = activationValidator();
  const common = { plan_id: 'plan', option, world_revision_id: 'revision', catalog_digest: '1'.repeat(64), planning_algorithm_version: '1', planning_context_dependency_pins: pins() };
  const first = await validator.activate({ ...common, created_change_set_id: 'change-a', created_at_turn: 0 });
  const second = await validator.activate({ ...common, created_change_set_id: 'change-b', created_at_turn: 9 });
  assert.equal(first.plan.canonical_serialization_digest, second.plan.canonical_serialization_digest, 'lifecycle fields do not affect immutable payload digest');
  const forged = { ...option, steps: [{ ...option.steps[0], ordinal: 9 }] };
  const rejected = await validator.activate({ ...common, option: forged, created_change_set_id: 'change', created_at_turn: 0 });
  assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'route_plan_snapshot_missing');
});

test('P18 rejects sparse endpoint/static snapshots and carrier-local non-scene traversal', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  const sparse = { id: 'sparse', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: { snapshot_kind: 'immediate_action', action_snapshot: {}, activity_snapshot: null, traversal_snapshot: null, canonical_digest: 'x'.repeat(64) }, cost_summary: cost, risk_summary: risk };
  const rejected = await planner([sparse]).resolve(query()); assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'route_endpoint_invalid');
  const connection = { id: 'connection', edge_kind: 'site_connection', from_endpoint_ref: endpoint('site_connection_endpoint', 'a'), to_endpoint_ref: endpoint('site_connection_endpoint', 'b'), step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const local = await planner([connection]).resolve(query({ journey_scope: 'carrier_local', target_request: null, intended_direction_id: 'go' }));
  assert.equal(local.ok, false); assert.equal(local.error.code, 'movement_endpoint_kind_invalid');
  const badSnapshot = await createMovementPlanner({ loadTopology: async () => ({ ok: true, edges: [{ id: 'ok', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk }], target_resolution_dependency_pins: pins() }), snapshotEndpoint: async ({ endpoint_ref }) => ({ endpoint_ref, dependency_pins: pins(), canonical_digest: digest({ endpoint_ref }) }), validateCapability: async () => ({ ok: true }) }).resolve(query());
  assert.equal(badSnapshot.ok, false); assert.equal(badSnapshot.error.code, 'route_plan_snapshot_missing');
});

test('P18 activation permits only an exact, sealed preparation request pair', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  const edge = { id: 'edge', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const option = (await planner([edge]).resolve(query())).options[0];
  const preparation = { id: 'preparation', planning_request_id: option.planning_request_id, planning_request_digest: option.path_query_digest };
  preparation.canonical_digest = digest(preparation);
  const input = { plan_id: 'plan', option, world_revision_id: 'revision', catalog_digest: '1'.repeat(64), planning_algorithm_version: '1', planning_context_dependency_pins: pins(), created_change_set_id: 'change', created_at_turn: 0 };
  const accepted = await activationValidator().activate({ ...input, preparation_snapshot: preparation });
  assert.equal(accepted.ok, true); assert.equal(accepted.plan.preparation_snapshot_id, 'preparation'); assert.equal(accepted.plan.preparation_snapshot_digest, preparation.canonical_digest);
  const arbitrary = { ...preparation, planning_request_id: 'other' }; arbitrary.canonical_digest = digest({ id: arbitrary.id, planning_request_id: arbitrary.planning_request_id, planning_request_digest: arbitrary.planning_request_digest });
  const rejected = await activationValidator().activate({ ...input, preparation_snapshot: arbitrary });
  assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'target_preparation_failed');
});

test('P18 verifies dependency pin digests and readiness reason matrix', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  const edge = { id: 'bad-pins', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const brokenPins = { ...pins(), canonical_digest: '0'.repeat(64) };
  const pinResult = await createMovementPlanner({ loadTopology: async () => ({ ok: true, edges: [edge], target_resolution_dependency_pins: brokenPins }), snapshotEndpoint: async ({ endpoint_ref }) => snapshot(endpoint_ref), validateCapability: async () => ({ ok: true }) }).resolve(query());
  assert.equal(pinResult.ok, false); assert.equal(pinResult.error.code, 'route_plan_version_pin_missing');
  const invalidReason = { ...edge, id: 'bad-reason', readiness: 'temporarily_blocked', blocking_reasons: [{ reason_code: 'not-temporary', severity: 'hard_block', diagnostic_message: 'wrong' }] };
  const reasonResult = await planner([invalidReason]).resolve(query()); assert.equal(reasonResult.ok, false); assert.equal(reasonResult.error.code, 'route_endpoint_invalid');
});

test('P18 supports the exact world-route endpoint to anchor matrix and rejects unsealed static action', async () => {
  const routeEnd = endpoint('world_route_endpoint', 'route-end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  const timeCostValue = { cost_kind: 'time', action_units_min: null, action_units_max: null, minutes_min: { numerator: 1, denominator: 1 }, minutes_max: { numerator: 1, denominator: 1 }, precision: 'exact' };
  const segment = { id: 'first-segment', edge_kind: 'world_route_segment', from_endpoint_ref: endpoint('world_route_endpoint', 'start-route'), to_endpoint_ref: endpoint('transit_anchor', 'anchor'), step_kind: 'timed_traversal', static_contract_snapshot: traversalStep(), cost_summary: { ...timeCostValue, canonical_digest: digest(timeCostValue) }, risk_summary: risk };
  const last = { ...segment, id: 'last-segment', from_endpoint_ref: endpoint('transit_anchor', 'anchor'), to_endpoint_ref: routeEnd };
  const result = await planner([segment, last]).resolve(query({ start_endpoint_ref: endpoint('world_route_endpoint', 'start-route'), cost_mode: 'segmented' }));
  assert.equal(result.ok, true); assert.equal(result.options[0].steps.length, 2);
  const malformed = staticStep(); malformed.action_snapshot.action_units = 0;
  const bad = await planner([{ id: 'bad-action', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' }), step_kind: 'immediate_action', static_contract_snapshot: malformed, cost_summary: cost, risk_summary: risk }]).resolve(query());
  assert.equal(bad.ok, false); assert.equal(bad.error.code, 'route_endpoint_invalid');
});

test('P18 activation requires sealed context pins and current/capability/recheck collaborators', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' }); const edge = { id: 'edge', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const option = (await planner([edge]).resolve(query())).options[0]; const input = { plan_id: 'p', option, world_revision_id: 'revision', catalog_digest: '1'.repeat(64), planning_algorithm_version: '1', planning_context_dependency_pins: pins(), created_change_set_id: 'c', created_at_turn: 0 };
  const unavailable = await createRoutePlanActivationValidator().activate(input); assert.equal(unavailable.ok, false); assert.equal(unavailable.error.code, 'route_plan_version_pin_missing');
  const invalidContext = await activationValidator().activate({ ...input, planning_context_dependency_pins: { ...pins(), canonical_digest: '0'.repeat(64) } }); assert.equal(invalidContext.ok, false); assert.equal(invalidContext.error.code, 'route_plan_version_pin_missing');
});

test('P18 rejects empty readiness command objects and seals full Appendix B proposals', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' }); const base = { edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const frontier = await planner([{ ...base, id: 'frontier', readiness: 'requires_frontier_resolution', command_proposal: {} }]).resolve(query()); assert.equal(frontier.ok, false); assert.equal(frontier.error.code, 'route_plan_version_pin_missing');
  const preparation = await planner([{ ...base, id: 'prep', readiness: 'requires_preparation', command_proposal: {} }]).resolve(query()); assert.equal(preparation.ok, false); assert.equal(preparation.error.code, 'route_plan_version_pin_missing');
  const q = query(); const valid = await planner([{ ...base, id: 'valid-prep', readiness: 'requires_preparation', command_proposal: preparationProposal(q) }]).resolve(q); assert.equal(valid.ok, true); assert.equal(valid.options[0].preparation_command_proposal.command_id, 'prepare');
});

test('P18 activation rejects relation/endpoint matrix mismatch even with recomputed option digest', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' }); const edge = { id: 'edge', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const option = (await planner([edge]).resolve(query())).options[0]; const forged = structuredClone(option); forged.steps[0].departure_endpoint_snapshot = snapshot(endpoint('site_connection_endpoint', 'wrong')); forged.steps[0].arrival_endpoint_snapshot = snapshot(endpoint('site_connection_endpoint', 'wrong2')); delete forged.canonical_digest; forged.canonical_digest = digest(forged);
  const result = await activationValidator().activate({ plan_id: 'bad', option: forged, world_revision_id: 'revision', catalog_digest: '1'.repeat(64), planning_algorithm_version: '1', planning_context_dependency_pins: pins(), created_change_set_id: 'change', created_at_turn: 0 });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'route_plan_snapshot_missing');
});

test('P18 rejects partial reservation and missing preparation members', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' }); const base = { edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk }; const q = query();
  const partial = frontierProposal(); delete partial.reservation_request.slot_ref; delete partial.canonical_digest; partial.canonical_digest = digest(partial);
  const badReservation = await planner([{ ...base, id: 'partial', readiness: 'requires_frontier_resolution', command_proposal: partial }]).resolve(q); assert.equal(badReservation.ok, false); assert.equal(badReservation.error.code, 'route_plan_version_pin_missing');
  const missing = preparationProposal(q); missing.required_member_proposals = []; missing.proposed_member_set_digest = digest([]).replace('sha256:', ''); delete missing.canonical_digest; missing.canonical_digest = digest(missing);
  const badMembers = await planner([{ ...base, id: 'missing', readiness: 'requires_preparation', command_proposal: missing }]).resolve(q); assert.equal(badMembers.ok, false); assert.equal(badMembers.error.code, 'route_plan_version_pin_missing');
});

test('P18 activation rejects timed activity endpoint transformation without completion contract', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' }); const edge = { id: 'activity', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'timed_activity', static_contract_snapshot: activityStep(), cost_summary: cost, risk_summary: risk };
  const option = (await planner([edge]).resolve(query())).options[0]; const result = await activationValidator().activate({ plan_id: 'activity', option, world_revision_id: 'revision', catalog_digest: '1'.repeat(64), planning_algorithm_version: '1', planning_context_dependency_pins: pins(), created_change_set_id: 'change', created_at_turn: 0 });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'route_plan_snapshot_missing');
});

test('P18 rejects a forged path-query digest, unordered state pins and an empty capability context before loading topology', async () => {
  let calls = 0;
  const strict = createMovementPlanner({ loadTopology: async () => { calls += 1; return { ok: true, edges: [] }; }, snapshotEndpoint: async () => snapshot(endpoint('scene_position', 'start')), validateCapability: async () => ({ ok: true }) });
  const forged = query({ canonical_digest: '0'.repeat(64) });
  const forgedResult = await strict.resolve(forged);
  assert.equal(forgedResult.ok, false); assert.equal(forgedResult.error.code, 'generated_schema_mismatch');
  const reversed = [{ entity_ref: { entity_kind: 'z_actor', entity_id: 'z' }, state_version: 1 }, { entity_ref: { entity_kind: 'actor', entity_id: 'a' }, state_version: 1 }];
  const badVersions = query({ expected_state_versions: { entries: reversed, canonical_digest: digest(reversed).replace('sha256:', '') } });
  const versionResult = await strict.resolve(badVersions);
  assert.equal(versionResult.ok, false); assert.equal(versionResult.error.code, 'generated_schema_mismatch');
  const capabilityResult = await strict.resolve(query({ capability_context: capabilityContext({ allowed_movement_methods: [] }) }));
  assert.equal(capabilityResult.ok, false); assert.equal(capabilityResult.error.code, 'generated_schema_mismatch');
  assert.equal(calls, 0);
});

test('P18 enforces knowledge-scope target boundaries and filters hidden character-known topology', async () => {
  const end = endpoint('scene_position', 'hidden-end', { spatial_kind: 'canonical_g5', spatial_id: 'secret' });
  const hiddenEdge = { id: 'hidden-edge', edge_kind: 'scene_edge', knowledge_visibility: 'hidden', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  let snapshotCalls = 0;
  const resolver = createMovementPlanner({
    resolveKnowledgeTarget: async () => ({ ok: true, factual_target_ref: { spatial_kind: 'canonical_g5', spatial_id: 'secret' }, dependency_pins: pins() }),
    loadTopology: async ({ knowledge_scope, knowledge_subject_ref }) => { assert.equal(knowledge_scope, 'character_known'); assert.equal(knowledge_subject_ref.entity_id, 'actor'); return { ok: true, edges: [hiddenEdge], target_resolution_dependency_pins: pins() }; },
    snapshotEndpoint: async ({ endpoint_ref }) => { snapshotCalls += 1; return snapshot(endpoint_ref); }, validateCapability: async () => ({ ok: true })
  });
  const known = await resolver.resolve(query({ knowledge_scope: 'character_known', knowledge_subject_ref: { entity_kind: 'actor', entity_id: 'actor' }, target_request: { target_kind: 'knowledge_spatial', factual_target_ref: null, knowledge_target_ref: { knowledge_kind: 'known_party_site', knowledge_id: 'belief' } } }));
  assert.equal(known.ok, false); assert.equal(known.error.code, 'route_contract_missing');
  assert.equal(snapshotCalls, 0, 'hidden topology must be filtered before factual snapshots are read');
  const wrongScope = await planner([]).resolve(query({ knowledge_scope: 'character_known', knowledge_subject_ref: { entity_kind: 'actor', entity_id: 'actor' } }));
  assert.equal(wrongScope.ok, false); assert.equal(wrongScope.error.code, 'generated_schema_mismatch');
});

test('P18 validates sealed cost/risk summaries in resolve and activation', async () => {
  const end = endpoint('scene_position', 'end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  const malformedCost = { ...cost, canonical_digest: '0'.repeat(64) };
  const edge = { id: 'bad-cost', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: malformedCost, risk_summary: risk };
  const resolved = await planner([edge]).resolve(query());
  assert.equal(resolved.ok, false); assert.equal(resolved.error.code, 'route_endpoint_invalid');
  const readyEdge = { ...edge, id: 'ready', cost_summary: cost };
  const option = (await planner([readyEdge]).resolve(query())).options[0];
  const forged = structuredClone(option); forged.risk_summary = { risk_class: 'none', knowledge_precision: 'hidden', visible_risk_tags: [] }; forged.risk_summary.canonical_digest = digest(forged.risk_summary); forged.canonical_digest = digest({ ...forged, canonical_digest: undefined });
  delete forged.canonical_digest; forged.canonical_digest = digest(forged);
  const activated = await activationValidator().activate({ plan_id: 'bad-risk', option: forged, world_revision_id: 'revision', catalog_digest: '1'.repeat(64), planning_algorithm_version: '1', planning_context_dependency_pins: pins(), created_change_set_id: 'change', created_at_turn: 0 });
  assert.equal(activated.ok, false); assert.equal(activated.error.code, 'route_plan_snapshot_missing');
});

test('P18 cost aggregation is deterministic for a bounded action path', async () => {
  for (let first = 1; first <= 5; first += 1) {
    const second = first + 1;
    const firstValue = { cost_kind: 'action', action_units_min: first, action_units_max: first + 1, minutes_min: null, minutes_max: null, precision: 'bounded' };
    const secondValue = { cost_kind: 'action', action_units_min: second, action_units_max: second + 1, minutes_min: null, minutes_max: null, precision: 'bounded' };
    const middle = endpoint('scene_position', `middle-${first}`);
    const end = endpoint('scene_position', `end-${first}`, { spatial_kind: 'canonical_g5', spatial_id: `site-${first}` });
    const edges = [
      { id: `first-${first}`, edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: middle, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: { ...firstValue, canonical_digest: digest(firstValue) }, risk_summary: risk },
      { id: `second-${first}`, edge_kind: 'scene_edge', from_endpoint_ref: middle, to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: { ...secondValue, canonical_digest: digest(secondValue) }, risk_summary: risk }
    ];
    const result = await planner(edges).resolve(query({ target_request: { target_kind: 'factual_spatial', factual_target_ref: { spatial_kind: 'canonical_g5', spatial_id: `site-${first}` }, knowledge_target_ref: null } }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.options[0].cost_summary.action_units_min, first + second);
    assert.deepEqual(result.options[0].cost_summary.action_units_max, first + second + 2);
    assert.equal(result.options[0].cost_summary.precision, 'bounded');
  }
});

test('P18 registered P08 traversal resolver reaches the real planner and remains fail-closed when unwired', async () => {
  const end = endpoint('scene_position', 'registered-end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  const edge = { id: 'registered', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const resolver = createTraversalResolver({ loadTopology: async () => ({ ok: true, edges: [edge], target_resolution_dependency_pins: pins() }), snapshotEndpoint: async ({ endpoint_ref }) => snapshot(endpoint_ref), validateCapability: async () => ({ ok: true }) });
  const result = await resolver.resolve(query());
  assert.equal(result.ok, true);
  const unwired = await createTraversalResolver().resolve(query());
  assert.equal(unwired.ok, false);
  assert.ok(unwired.error.code, 'unwired registered port must return a typed failure');
});

test('P18 requires a capability port and rejects a traversal method absent from the sealed context', async () => {
  assert.throws(() => createMovementPlanner({ loadTopology: async () => ({ ok: true, edges: [] }), snapshotEndpoint: async () => snapshot(endpoint('scene_position', 'start')) }), /validateCapability/);
  const end = endpoint('world_route_endpoint', 'route-end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  const edge = { id: 'forbidden-method', edge_kind: 'world_route_segment', from_endpoint_ref: endpoint('world_route_endpoint', 'start-route'), to_endpoint_ref: end, step_kind: 'timed_traversal', static_contract_snapshot: traversalStep(), cost_summary: { ...(() => { const value = { cost_kind: 'time', action_units_min: null, action_units_max: null, minutes_min: { numerator: 1, denominator: 1 }, minutes_max: { numerator: 1, denominator: 1 }, precision: 'exact' }; return value; })(), canonical_digest: digest({ cost_kind: 'time', action_units_min: null, action_units_max: null, minutes_min: { numerator: 1, denominator: 1 }, minutes_max: { numerator: 1, denominator: 1 }, precision: 'exact' }) }, risk_summary: risk };
  const result = await planner([edge]).resolve(query({ start_endpoint_ref: endpoint('world_route_endpoint', 'start-route'), capability_context: capabilityContext({ allowed_movement_methods: ['boat'] }) }));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'movement_capability_missing');
});

test('P18 seals capability dependency pins into query, option and activated plan', async () => {
  const end = endpoint('scene_position', 'capability-end', { spatial_kind: 'canonical_g5', spatial_id: 'site' });
  const edge = { id: 'capability', edge_kind: 'scene_edge', from_endpoint_ref: endpoint('scene_position', 'start'), to_endpoint_ref: end, step_kind: 'immediate_action', static_contract_snapshot: staticStep(), cost_summary: cost, risk_summary: risk };
  const tampered = capabilityContext(); tampered.allowed_movement_methods = ['boat'];
  const malformed = await planner([edge]).resolve(query({ capability_context: tampered }));
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error.code, 'generated_schema_mismatch');
  const staleEntry = { dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'different-revision' }, version_pin: { pin_kind: 'authoring_version', authoring_version: '2', state_version: null } };
  const stalePins = { pins: [staleEntry], canonical_digest: digest([staleEntry]).replace('sha256:', '') };
  const option = (await planner([edge]).resolve(query({ capability_context: capabilityContext({ dependency_pins: stalePins }) }))).options[0];
  assert.equal(option.capability_context.canonical_digest, option.capability_context_digest ?? option.capability_context.canonical_digest);
  const rejected = await activationValidator().activate({ plan_id: 'missing-capability-pin', option, world_revision_id: 'revision', catalog_digest: '1'.repeat(64), planning_algorithm_version: '1', planning_context_dependency_pins: pins(), created_change_set_id: 'change', created_at_turn: 0 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'route_plan_version_pin_missing');
  const accepted = await activationValidator().activate({ plan_id: 'covered-capability-pin', option, world_revision_id: 'revision', catalog_digest: '1'.repeat(64), planning_algorithm_version: '1', planning_context_dependency_pins: stalePins, created_change_set_id: 'change', created_at_turn: 0 });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.plan.capability_context_digest, option.capability_context.canonical_digest);
});
