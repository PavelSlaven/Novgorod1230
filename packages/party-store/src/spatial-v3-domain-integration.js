import { deepFreeze } from '@rus/kernel';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { buildCombinedWritePlan } from '@rus/turn/spatial-v3-write-plan';

const ROOT_KINDS = new Set(['scene_position', 'moored_at_position', 'parked_at_position']);
const HOST_KINDS = new Set(['inside_entity', 'on_entity', 'attached_to_entity']);
const ENTITY_KINDS = new Set(['npc', 'item', 'container', 'property', 'transport', 'actor', 'cohort']);
const ATTACHMENT_KINDS = new Set(['actor', 'cohort', 'transport']);
const RELATIVE_RELATIONS = new Set(['using_cover', 'behind', 'in_front_of', 'beside', 'under', 'overlooking', 'grappling']);
const stableText = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const cloneFreeze = (value) => deepFreeze(structuredClone(value));
const entityKey = (ref) => ref && `${ref.entity_kind}:${ref.entity_id}`;
const error = (code, diagnostics = {}) => cloneFreeze({ ok: false, error: { code, diagnostics } });

function validRef(value, allowed = ENTITY_KINDS) {
  return value && typeof value === 'object' && allowed.has(value.entity_kind) && stableText(value.entity_id);
}

function validPlacement(value) {
  const known = new Set(['party_id', 'entity_ref', 'placement_kind', 'position_node_id', 'host_entity_ref', 'occupies_capacity_units', 'visibility_modifier_ref', 'interaction_profile_ref', 'state_version', 'updated_change_set_id']);
  if (!value || typeof value !== 'object' || Object.keys(value).some((key) => !known.has(key)) || !stableText(value.party_id) || !validRef(value.entity_ref) || !Number.isInteger(value.occupies_capacity_units) || value.occupies_capacity_units < 0) return false;
  if (value.placement_kind === 'scene_position') return stableText(value.position_node_id) && !value.host_entity_ref;
  if (value.placement_kind === 'moored_at_position' || value.placement_kind === 'parked_at_position') return stableText(value.position_node_id) && (!value.host_entity_ref || validRef(value.host_entity_ref));
  return HOST_KINDS.has(value.placement_kind) && validRef(value.host_entity_ref) && !value.position_node_id;
}

/**
 * Target-only P23 domain adapter.  It receives persisted-row shaped values and
 * validates their cross-domain spatial meaning; it neither writes storage nor
 * derives a location from labels, containment, or a latest catalog revision.
 */
export function createSpatialV3DomainPlacementIntegrator() {
  function validatePlacements({ party_id, placements, active_position_ids = [] } = {}) {
    if (!stableText(party_id) || !Array.isArray(placements) || !Array.isArray(active_position_ids)) return error('generated_schema_mismatch', { reason: 'party_id, placements and active_position_ids are required' });
    const positionIds = new Set(active_position_ids);
    const byEntity = new Map();
    for (const placement of placements) {
      if (!validPlacement(placement) || placement.party_id !== party_id) return error('generated_schema_mismatch', { reason: 'placement shape is invalid' });
      const key = entityKey(placement.entity_ref);
      if (byEntity.has(key)) return error('dual_location_owner', { entity_ref: placement.entity_ref, reason: 'one authoritative placement is required' });
      if (ROOT_KINDS.has(placement.placement_kind) && !positionIds.has(placement.position_node_id)) return error('route_endpoint_invalid', { entity_ref: placement.entity_ref, position_node_id: placement.position_node_id });
      byEntity.set(key, placement);
    }
    for (const [key, placement] of byEntity) {
      const seen = new Set([key]); let current = placement;
      while (HOST_KINDS.has(current.placement_kind)) {
        const hostKey = entityKey(current.host_entity_ref); const host = byEntity.get(hostKey);
        if (!host) return error('route_endpoint_invalid', { entity_ref: placement.entity_ref, reason: 'host placement is absent' });
        if (seen.has(hostKey)) return error('attachment_graph_invalid', { entity_ref: placement.entity_ref, reason: 'placement graph is cyclic' });
        seen.add(hostKey); current = host;
      }
      if (!ROOT_KINDS.has(current.placement_kind) || !positionIds.has(current.position_node_id)) return error('route_endpoint_invalid', { entity_ref: placement.entity_ref, reason: 'placement must resolve to one active scene position' });
    }
    return cloneFreeze({ ok: true, placements: [...byEntity.values()] });
  }

  function validateNpcSchedule({ npc_ref, placement, schedule_endpoint_ref, schedule_profile_ref, dependency_pins } = {}) {
    if (!validRef(npc_ref, new Set(['npc'])) || !validPlacement(placement) || entityKey(npc_ref) !== entityKey(placement.entity_ref)
      || !schedule_endpoint_ref || !stableText(schedule_endpoint_ref.endpoint_kind) || !stableText(schedule_endpoint_ref.endpoint_id)
      || !schedule_profile_ref?.entity_ref || !stableText(schedule_profile_ref.authoring_version) || !dependency_pins?.canonical_digest) {
      return error('route_plan_version_pin_missing', { reason: 'NPC schedule requires exact placement, endpoint, profile and pins' });
    }
    return cloneFreeze({ ok: true, npc_ref, placement, schedule_endpoint_ref, schedule_profile_ref, dependency_pins });
  }

  function validateRelativePosition({ party_id, actor_ref, target_entity_ref, relation, against_position_id = null, condition_ref, active_position_ids = [] } = {}) {
    if (!stableText(party_id) || !validRef(actor_ref, new Set(['actor'])) || !validRef(target_entity_ref) || !RELATIVE_RELATIONS.has(relation)
      || !condition_ref?.entity_ref || !stableText(condition_ref.authoring_version) || !Array.isArray(active_position_ids)
      || (against_position_id != null && (!stableText(against_position_id) || !active_position_ids.includes(against_position_id)))) return error('generated_schema_mismatch', { reason: 'relative position requires exact actor, target, condition and same-scope position' });
    return cloneFreeze({ ok: true, party_id, actor_ref, target_entity_ref, relation, against_position_id, condition_ref });
  }

  function validateCarrierState({ transport_ref, attached_g6_ids = [], approved_attached_scene_template_ref = null, active_attachment_chain = [], own_journey_location = null, actor_carrier_position = null, transport_travel_state, context_mode = 'carrier_derived_context', dependency_pins } = {}) {
    if (!validRef(transport_ref, new Set(['transport'])) || !Array.isArray(attached_g6_ids) || new Set(attached_g6_ids).size !== attached_g6_ids.length || !attached_g6_ids.every(stableText)
      || !Array.isArray(active_attachment_chain) || !transport_travel_state?.id || !Number.isInteger(transport_travel_state.state_version) || !dependency_pins?.canonical_digest) {
      return error('generated_schema_mismatch', { reason: 'transport state is incomplete' });
    }
    if (context_mode !== 'carrier_derived_context') return error('route_plan_version_pin_missing', { reason: 'moving attached scene requires carrier-derived context' });
    if (attached_g6_ids.length && (!approved_attached_scene_template_ref?.entity_ref || !stableText(approved_attached_scene_template_ref.authoring_version))) return error('spatial_candidate_gap', { reason: 'attached G6 requires an approved transport scene template' });
    const chain = active_attachment_chain.map((row) => ({ subject_ref: row?.subject_ref, carrier_ref: row?.carrier_ref }));
    if (chain.some(({ subject_ref, carrier_ref }) => !validRef(subject_ref, ATTACHMENT_KINDS) || !validRef(carrier_ref, new Set(['cohort', 'transport'])))) return error('attachment_graph_invalid', { reason: 'attachment reference is invalid' });
    if (chain.length > 2 || chain.some(({ carrier_ref }) => carrier_ref.entity_kind === 'cohort' && !carrier_ref.entity_id)) return error('attachment_graph_invalid', { reason: 'attachment depth or kind is invalid' });
    const terminal = chain.at(-1)?.carrier_ref;
    if (chain.length === 2 && !(chain[0].subject_ref.entity_kind === 'actor' && chain[0].carrier_ref.entity_kind === 'cohort' && entityKey(chain[0].carrier_ref) === entityKey(chain[1].subject_ref) && chain[1].carrier_ref.entity_kind === 'transport')) return error('attachment_graph_invalid', { reason: 'only actor→cohort→transport may have depth two' });
    if (chain.length === 1 && !(((chain[0].subject_ref.entity_kind === 'actor' || chain[0].subject_ref.entity_kind === 'cohort') && chain[0].carrier_ref.entity_kind === 'transport') || (chain[0].subject_ref.entity_kind === 'actor' && chain[0].carrier_ref.entity_kind === 'cohort'))) return error('attachment_graph_invalid', { reason: 'attachment kind is not allowed' });
    if (chain.length && entityKey(terminal) !== entityKey(transport_ref)) return error('attachment_graph_invalid', { reason: 'attachment must terminate at the transport root' });
    if (chain.length && own_journey_location) return error('dual_location_owner', { reason: 'attached subject cannot own a world location' });
    if (actor_carrier_position && (!validRef(actor_carrier_position.actor_ref, new Set(['actor'])) || !stableText(actor_carrier_position.local_position_node_id) || entityKey(actor_carrier_position.root_carrier_ref) !== entityKey(transport_ref))) return error('journey_location_ownership_mismatch', { reason: 'carrier position does not belong to transport root' });
    return cloneFreeze({ ok: true, transport_ref, attached_g6_ids, root_context: { transport_travel_state, dependency_pins }, actor_carrier_position: actor_carrier_position ?? null });
  }

  function validateCarrierLocalAction({ journey_scope, transport_state, actor_carrier_position, action_endpoint_ref, root_execution, synchronized_slice } = {}) {
    if (journey_scope !== 'carrier_local' || !transport_state?.ok || !actor_carrier_position?.local_position_node_id || action_endpoint_ref?.endpoint_kind !== 'scene_position' || action_endpoint_ref.endpoint_id !== actor_carrier_position.local_position_node_id) return error('movement_endpoint_kind_invalid', { reason: 'carrier-local action must start at the exact persisted interior position' });
    if (root_execution?.status === 'active' && !synchronized_slice?.root_execution_id) return error('time_accumulator_invalid', { reason: 'moving transport requires a synchronized root slice' });
    return cloneFreeze({ ok: true, context_mode: 'carrier_derived_context', action_endpoint_ref, synchronized_root_execution_id: synchronized_slice?.root_execution_id ?? null });
  }

  return Object.freeze({ validatePlacements, validateNpcSchedule, validateRelativePosition, validateCarrierState, validateCarrierLocalAction });
}

function exactVersionSet(entries) {
  return Array.isArray(entries) && entries.length > 0 && entries.every((entry) => stableText(entry?.resource) && stableText(entry?.id) && Number.isInteger(entry.state_version) && entry.state_version >= 0);
}

function sameRef(left, right) { return entityKey(left) && entityKey(left) === entityKey(right); }

function validatePersistedDomainSnapshot(snapshot, request) {
  if (!snapshot || snapshot.party_id !== request.party_id || !Array.isArray(snapshot.placements) || !Array.isArray(snapshot.controls) || !Array.isArray(snapshot.npc_schedules)) return 'snapshot is incomplete';
  const placements = new Map(snapshot.placements.map((row) => [entityKey(row.entity_ref), row]));
  const controls = new Map(snapshot.controls.map((row) => [entityKey(row.entity_ref), row]));
  for (const control of controls.values()) {
    if (!validRef(control.entity_ref) || !validRef(control.owner_ref) || !validRef(control.holder_ref) || !validRef(control.controller_ref)
      || !control.access_profile_ref?.entity_ref || !stableText(control.access_profile_ref.authoring_version) || !Number.isInteger(control.capacity_units) || control.capacity_units < 0 || !placements.has(entityKey(control.entity_ref))) return 'ownership, holder, controller or access is invalid';
  }
  for (const schedule of snapshot.npc_schedules) {
    const placement = placements.get(entityKey(schedule.npc_ref));
    if (!placement || !schedule.active || !schedule.schedule_profile_ref?.entity_ref || !stableText(schedule.schedule_profile_ref.authoring_version) || !schedule.dependency_pins?.canonical_digest || !schedule.causal_state_ref?.entity_ref || schedule.current_endpoint_ref?.endpoint_kind !== 'scene_position' || schedule.current_endpoint_ref?.endpoint_id !== placement.position_node_id) return 'NPC schedule endpoint does not equal its current active placement';
    if (!snapshot.active_route_endpoint_ids?.includes(schedule.current_endpoint_ref.endpoint_id)) return 'NPC schedule endpoint is not active on its exact route/scene binding';
  }
  const used = new Map();
  for (const placement of snapshot.placements) {
    if (!HOST_KINDS.has(placement.placement_kind)) continue;
    const host = placements.get(entityKey(placement.host_entity_ref)); const control = controls.get(entityKey(placement.host_entity_ref));
    if (!host || !control) return 'nested placement host lacks authoritative access/capacity state';
    used.set(entityKey(placement.host_entity_ref), (used.get(entityKey(placement.host_entity_ref)) ?? 0) + placement.occupies_capacity_units);
  }
  for (const [host, units] of used) if (units > controls.get(host).capacity_units) return 'host capacity exceeded';
  if (Array.isArray(snapshot.position_capacities)) {
    const positionCaps = new Map(snapshot.position_capacities.map((row) => [row.id, row]));
    const occupied = new Map();
    for (const placement of snapshot.placements) if (ROOT_KINDS.has(placement.placement_kind)) occupied.set(placement.position_node_id, (occupied.get(placement.position_node_id) ?? 0) + placement.occupies_capacity_units);
    for (const [positionId, units] of occupied) if (!positionCaps.has(positionId) || units > positionCaps.get(positionId).capacity) return 'scene position capacity exceeded';
  }
  if (request.domain_mutation?.required_access_profile_ref) {
    const target = controls.get(`${request.domain_mutation.entity_kind}:${request.domain_mutation.entity_id}`);
    const required = request.domain_mutation.required_access_profile_ref;
    if (!target || target.access_profile_ref?.entity_ref?.entity_kind !== required?.entity_ref?.entity_kind || target.access_profile_ref?.entity_ref?.entity_id !== required?.entity_ref?.entity_id || target.access_profile_ref?.authoring_version !== required?.authoring_version) return 'ownership, holder, controller or access is invalid';
  }
  const carrier = snapshot.carrier;
  if (carrier) {
    const chain = carrier.active_attachment_chain ?? []; const root = chain.at(-1)?.carrier_ref;
    if (!sameRef(root, carrier.transport_ref) || !carrier.approved_attached_scene_template_ref?.entity_ref || !stableText(carrier.approved_attached_scene_template_ref.authoring_version)
      || !carrier.bound_attached_g6?.id || carrier.bound_attached_g6.template_ref?.entity_id !== carrier.approved_attached_scene_template_ref.entity_ref.entity_id
      || carrier.bound_attached_g6.template_ref?.authoring_version !== carrier.approved_attached_scene_template_ref.authoring_version) return 'carrier attachment or bound G6 template is invalid';
    const position = carrier.actor_carrier_position;
    if (position && (!sameRef(position.root_carrier_ref, carrier.transport_ref) || !chain.some((edge) => sameRef(edge.subject_ref, position.actor_ref)))) return 'actor carrier position lacks same-party active attachment chain';
  }
  if (request.carrier_local) {
    const slice = snapshot.synchronized_slice;
    if (!slice || slice.id !== request.carrier_local.slice_id || slice.root_execution_id !== request.carrier_local.root_execution_id || slice.root_travel_state_id !== request.carrier_local.root_travel_state_id || slice.root_execution_state_version !== request.carrier_local.root_execution_state_version || slice.root_travel_state_version !== request.carrier_local.root_travel_state_version || slice.change_set_id !== request.carrier_local.change_set_id || slice.write_plan_digest !== request.carrier_local.slice_digest || slice.root_result_kind !== 'root_traversal') return 'carrier-local result lacks exact shared root slice pins';
    if (!carrier || slice.root_journey_scope !== 'world_travel' || slice.root_travel_status !== 'active' || !sameRef(slice.journey_owner_ref, carrier.transport_ref) || !sameRef(slice.movement_carrier_ref, carrier.transport_ref)) return 'carrier-local result lacks the exact active root transport traversal';
  }
  return null;
}

function p23PlanInput(request, snapshot, visiblePackageEnvelope) {
  const mutation = request.domain_mutation;
  const placementId = `${mutation.entity_kind}:${mutation.entity_id}`;
  const targetExpected = request.expected_state_versions.filter((entry) => entry.resource === 'entity_placements' && entry.id === placementId);
  if (targetExpected.length !== 1) return null;
  const expected = targetExpected.map((entry) => ({ target_table: entry.resource, id: entry.id, state_version: entry.state_version }));
  const changeSetId = `p23:${request.party_id}:${request.canonical_digest}`;
  const physical_keys = [
    ...snapshot.placements.map((row) => `party_runtime.entity_placements:${row.entity_ref.entity_kind}:${row.entity_ref.entity_id}`),
    ...snapshot.active_route_endpoint_ids.map((id) => `party_runtime.scene_position_nodes:${id}`),
    `party_runtime.party_v3_change_sets:${changeSetId}`
  ].sort();
  const owner_keys = snapshot.placements.filter((row) => ['actor', 'cohort', 'transport'].includes(row.entity_ref.entity_kind)).map((row) => `${row.entity_ref.entity_kind}:${row.entity_ref.entity_id}`).sort();
  const execution_keys = request.carrier_local ? [request.carrier_local.root_execution_id, request.carrier_local.root_travel_state_id].sort() : [];
  const recheckDigest = computeSpatialV3CanonicalDigest({ request: { party_id: request.party_id, expected_state_versions: request.expected_state_versions, domain_mutation: request.domain_mutation, carrier_local: request.carrier_local ?? null }, snapshot_digest: computeSpatialV3CanonicalDigest(snapshot) });
  return {
    plan_id: `p23-plan:${request.party_id}:${request.canonical_digest}`,
    party_id: request.party_id,
    write_plan_kind: 'semantic_commit',
    operation_kind: 'p23_placement',
    canonical_input_digest: request.canonical_digest,
    expected_state_versions: expected,
    validation_report: { status: 'pass', digest: recheckDigest },
    idempotency: { id: `p23-idem:${request.party_id}:${request.idempotency_key}`, key: request.idempotency_key },
    change_set: { id: changeSetId },
    visible_package_envelope: visiblePackageEnvelope,
    lock_context: { owner_keys, execution_keys, g4_keys: [], physical_keys },
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'].map((kind) => ({ kind, digest: recheckDigest })),
    approved_write_sets: [{
      inserts: [],
      updates: [{ target_table: 'entity_placements', id: placementId, record: { party_id: request.party_id, entity_kind: mutation.entity_kind, entity_id: mutation.entity_id, placement_kind: mutation.placement_kind, position_node_id: mutation.position_node_id, host_entity_ref: null, occupies_capacity_units: mutation.capacity_units, updated_change_set_id: changeSetId } }],
      appends: [{ target_table: 'party_v3_change_sets', id: changeSetId, record: { id: changeSetId, party_id: request.party_id, operation_kind: 'p23_placement', idempotency_record_id: `p23-idem:${request.party_id}:${request.idempotency_key}`, created_at_turn: 0, committed_at_turn: 0 } }]
    }]
  };
}

/** P23 prepares a sealed plan; only CombinedAtomicCommitter may write it. */
export function createSpatialV3DomainMutationService({ repository, committer, verifyApproval } = {}) {
  if (!repository || typeof repository.loadSnapshot !== 'function' || typeof repository.recheck !== 'function' || !committer || typeof committer.commit !== 'function' || typeof verifyApproval !== 'function') throw new TypeError('P23 requires injected read/recheck repository, approval verifier and CombinedAtomicCommitter');
  return Object.freeze({ async commit(request, options = {}) {
    const visiblePackageEnvelope = options?.visible_package_envelope ?? null;
    const body = request && { ...request }; if (body) delete body.canonical_digest;
    if (!request || !stableText(request.party_id) || !stableText(request.idempotency_key) || !exactVersionSet(request.expected_state_versions) || request.canonical_digest !== computeSpatialV3CanonicalDigest(body)) return error('generated_schema_mismatch', { reason: 'sealed P23 mutation request is required' });
    const snapshot = await repository.loadSnapshot({ party_id: request.party_id, expected_state_versions: request.expected_state_versions, carrier_local: request.carrier_local });
    if (!snapshot) return error('state_version_conflict', { reason: 'exact expected version set is unavailable' });
    const invalid = validatePersistedDomainSnapshot(snapshot, request);
    if (invalid) return error(invalid.includes('capacity') ? 'relation_capacity_undefined' : (invalid.includes('carrier') || invalid.includes('G6 template')) ? 'journey_location_ownership_mismatch' : 'route_plan_version_pin_missing', { reason: invalid });
    const input = p23PlanInput(request, snapshot, visiblePackageEnvelope);
    if (!input) return error('state_version_conflict', { reason: 'target placement CAS expectation is required exactly once' });
    const built = await buildCombinedWritePlan(input, { verifyApproval });
    if (!built.ok) return built;
    const sealedRequest = cloneFreeze(request);
    const result = await committer.commit({ plan: built.plan, recheck: async ({ transaction }) => {
      const checked = await repository.recheck({ transaction, request: sealedRequest });
      if (!checked?.ok || checked.snapshot?.expected_state_versions_valid === false) return { ok: false, code: 'state_version_conflict' };
      const recheckInvalid = validatePersistedDomainSnapshot(checked.snapshot, sealedRequest);
      return recheckInvalid ? { ok: false, code: recheckInvalid.includes('capacity') ? 'relation_capacity_undefined' : (recheckInvalid.includes('carrier') || recheckInvalid.includes('G6 template')) ? 'journey_location_ownership_mismatch' : 'route_plan_version_pin_missing' } : { ok: true };
    } });
    return cloneFreeze(result);
  } });
}
