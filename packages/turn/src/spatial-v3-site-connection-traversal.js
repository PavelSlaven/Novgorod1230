import { createMovementPlanner, createRoutePlanActivationValidator } from '@rus/movement-routes';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { createSpatialV3TraversalExecution } from './spatial-v3-execution-traversal.js';
import { clone, deepFreeze, sealed, typedError } from './spatial-v3-execution-support.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entity_kind, entity_id, version) => ({ entity_ref: ref(entity_kind, entity_id), authoring_version: String(version) });
const collection = (key, values) => ({ [key]: values, canonical_digest: digest(values).replace('sha256:', '') });
const authoringPin = (dependency_role, value) => ({ dependency_role, entity_ref: value.entity_ref,
  version_pin: { pin_kind: 'authoring_version', authoring_version: value.authoring_version, state_version: null } });

/** Compose existing P18/P19 owners over one persisted directed site connection.
 * Admission and current-state reads stay with the supplied runtime owners; the
 * returned proposals must be committed together under expected_state_versions.
 */
export async function prepareSpatialV3SiteConnectionTraversal(input = {}, ports = {}) {
  const fail = (code, reason) => typedError(code, { execution_id: input.execution_id, reason });
  const { connection, connection_profile: profile, journey_location: location } = input;
  if (typeof ports.validateCapability !== 'function' || typeof ports.loadCurrentState !== 'function'
    || typeof ports.recheckActivation !== 'function') return fail('movement_capability_missing', 'movement admission and activation ports are required');
  if (!connection || !profile || profile.status !== 'approved' || profile.profile_scope !== 'site_connection'
    || profile.cost_kind !== 'action' || connection.cost_kind !== 'action'
    || profile.action_units !== connection.action_units || !Number.isSafeInteger(connection.action_units)
    || connection.action_units < 1 || profile.passage_type_id !== connection.passage_type_id
    || !profile.id || !Number.isSafeInteger(Number(profile.version)) || Number(profile.version) < 1
    || !profile.canonical_digest || !input.footprint_rule_ref?.entity_ref?.entity_id
    || !input.footprint_rule_ref.authoring_version
    || !Number.isSafeInteger(input.movement_capacity_units) || input.movement_capacity_units < 1) {
    return fail('route_contract_missing', 'approved action-cost connection and footprint rule are required');
  }
  if (!location || location.party_id !== input.party_id || location.location_kind !== 'scene'
    || !['actor', 'cohort', 'transport'].includes(location.owner_kind)) {
    return fail('route_endpoint_invalid', 'root journey scene location is required');
  }
  const rows = [['site_connection', connection], ['party_journey_location', location]];
  const endpoints = [];
  for (const role of ['from', 'to']) {
    const matches = input.endpoint_bindings?.filter((row) => row.site_connection_id === connection.id
      && row.endpoint_role === role && row.status === 'active') ?? [];
    if (matches.length !== 1) return fail('route_endpoint_invalid', 'exact active endpoint binding is required');
    const binding = matches[0];
    const position = input.scene_positions?.find((row) => row.id === binding.position_id);
    const scene = input.g6_instances?.find((row) => row.id === position?.g6_instance_id);
    const baseline = input.scene_baselines?.find((row) => row.id === scene?.scene_baseline_id);
    const site = input.sites?.find((row) => row.id === connection[`${role}_site_id`]);
    if (!position || !scene || !baseline || !site || binding.g5_site_id !== site.id
      || baseline.host_kind !== 'g5_site' || baseline.host_id !== site.id
      || scene.host_kind !== 'g5_site' || scene.host_id !== site.id
      || (role === 'from' && location.scene_position_id !== position.id)) {
      return fail('route_endpoint_invalid', 'persisted connection does not match current scene and position');
    }
    rows.push(['party_site_connection_endpoint_binding', binding], ['scene_position_node', position],
      ['party_g6_instance', scene], ['party_scene_baseline', baseline], ['party_g5_site', site]);
    endpoints.push({ binding, position, baseline, site });
  }
  if (endpoints[0].site.parent_g4_id !== endpoints[1].site.parent_g4_id
    || rows.some(([, row]) => !row.id || row.party_id !== input.party_id
      || (row !== location && row.status !== 'active')
      || !Number.isSafeInteger(Number(row.state_version)) || Number(row.state_version) < 1)) {
    return fail('state_version_conflict', 'active same-party rows with exact positive state versions are required');
  }
  const uniqueRows = [...new Map(rows.map(([kind, row]) => [`${kind}\0${row.id}`, [kind, row]])).entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value);
  const entries = uniqueRows.map(([kind, row]) => ({ entity_ref: ref(kind, row.id), state_version: Number(row.state_version) }));
  const capabilityPins = input.capability_context?.dependency_pins?.pins ?? [];
  for (const pin of capabilityPins) {
    if (pin.version_pin?.pin_kind !== 'party_state_version') continue;
    const current = entries.find((entry) => entry.entity_ref.entity_kind === pin.entity_ref.entity_kind
      && entry.entity_ref.entity_id === pin.entity_ref.entity_id);
    if (current && current.state_version !== pin.version_pin.state_version) return fail('state_version_conflict', 'capability pin conflicts with persisted row');
    if (!current) entries.push({ entity_ref: clone(pin.entity_ref), state_version: pin.version_pin.state_version });
  }
  entries.sort((a, b) => `${a.entity_ref.entity_kind}\0${a.entity_ref.entity_id}` < `${b.entity_ref.entity_kind}\0${b.entity_ref.entity_id}` ? -1 : 1);
  const expected = collection('entries', entries);
  const profileRef = versioned('canonical_g5_connection_profile', profile.id, profile.version);
  const dependencyPins = collection('pins', [...capabilityPins,
    authoringPin('action_contract', profileRef), authoringPin('movement_footprint', input.footprint_rule_ref),
    ...entries.map((entry) => ({ dependency_role: 'movement_runtime', entity_ref: entry.entity_ref,
      version_pin: { pin_kind: 'party_state_version', state_version: entry.state_version, authoring_version: null } }))]);
  const snapshots = endpoints.map(({ binding, position, baseline, site }) => sealed({
    endpoint_ref: { endpoint_kind: 'site_connection_endpoint', endpoint_id: binding.id,
      target_ref: { spatial_kind: 'party_site', spatial_id: site.id } },
    dependency_pins: dependencyPins, resolved_scene_baseline_id: baseline.id,
    resolved_position_id: position.id, resolved_transit_anchor_id: null,
    resolved_travel_state_id: null, route_point_context_digest: null
  }));
  const action = sealed({ action_contract_ref: profileRef, relation_ref: ref('site_connection', connection.id),
    action_units: connection.action_units, movement_capacity_units: input.movement_capacity_units,
    mode_transition_contract_ref: null, completion_effect_contract_ref: null, dependency_pins: dependencyPins });
  const edge = { id: connection.id, edge_kind: 'site_connection', from_endpoint_ref: snapshots[0].endpoint_ref,
    to_endpoint_ref: snapshots[1].endpoint_ref, step_kind: 'immediate_action',
    static_contract_snapshot: sealed({ snapshot_kind: 'immediate_action', action_snapshot: action,
      activity_snapshot: null, traversal_snapshot: null }),
    cost_summary: sealed({ cost_kind: 'action', action_units_min: connection.action_units,
      action_units_max: connection.action_units, minutes_min: null, minutes_max: null, precision: 'exact' }),
    risk_summary: sealed({ risk_class: 'unknown', knowledge_precision: 'hidden', visible_risk_tags: [] }) };
  const query = sealed({ request_id: input.request_id, party_id: input.party_id, request_kind: 'ordinary',
    journey_owner_ref: ref(location.owner_kind, location.owner_id), journey_scope: 'world_travel',
    start_endpoint_ref: snapshots[0].endpoint_ref,
    target_request: { target_kind: 'factual_spatial', factual_target_ref: snapshots[1].endpoint_ref.target_ref, knowledge_target_ref: null },
    intended_direction_id: null, knowledge_subject_ref: null, recovery_binding_ref: null,
    administrative_authorization_pins: null, knowledge_scope: 'factual', cost_mode: 'action',
    capability_context: clone(input.capability_context), expected_state_versions: expected,
    planning_state_version: Number(location.state_version) });
  const planned = await createMovementPlanner({
    loadTopology: async () => ({ ok: true, edges: [edge], target_resolution_dependency_pins: dependencyPins }),
    snapshotEndpoint: async ({ endpoint_ref }) => snapshots.find((value) => value.endpoint_ref.endpoint_id === endpoint_ref.endpoint_id),
    validateCapability: ports.validateCapability
  }).resolve(query);
  if (!planned.ok) return planned;
  const option = planned.options[0];
  const activated = await createRoutePlanActivationValidator(ports).activate({
    plan_id: input.plan_id ?? `${input.execution_id}:plan`, option,
    world_revision_id: input.world_revision_id, catalog_digest: input.catalog_digest,
    planning_algorithm_version: 'p18-explicit-site-connection-v1', planning_context_dependency_pins: dependencyPins,
    created_change_set_id: input.change_set_id, created_at_turn: input.occurred_at_turn
  });
  if (!activated.ok) return activated;
  // P19 uses sealed object pins; P18 uses the canonical digest of the pin array.
  const executionPins = sealed({ pins: clone(dependencyPins.pins) });
  const executed = createSpatialV3TraversalExecution(new Map()).executeImmediateAction({
    party_id: input.party_id, run_id: input.run_id, execution_id: input.execution_id,
    idempotency_key: input.idempotency_key, idempotency_record_id: input.idempotency_record_id,
    change_set_id: input.change_set_id, occurred_at_turn: input.occurred_at_turn, step_ordinal: 0,
    endpoint_before: sealed({ endpoint_kind: 'site_connection_endpoint', endpoint_id: endpoints[0].binding.id }),
    endpoint_after: sealed({ endpoint_kind: 'site_connection_endpoint', endpoint_id: endpoints[1].binding.id }),
    action_snapshot: action, dependency_pins: executionPins, dynamic_dependency_pins: executionPins,
    execution_context_snapshot: input.execution_context_snapshot
  });
  if (!executed.ok) return executed;
  return deepFreeze({ ok: true, option, plan: activated.plan, result: executed.result,
    expected_state_versions: expected, dependency_pins: dependencyPins,
    location_update: { target_table: 'party_journey_locations', entity_id: location.id,
      expected_state_version: Number(location.state_version), payload: { ...clone(location),
        scene_position_id: endpoints[1].position.id, state_version: Number(location.state_version) + 1,
        updated_change_set_id: input.change_set_id } } });
}
