import { createSpatialSemanticAuthorityRepository } from
  '../../infrastructure/postgres/spatial-semantic-authority-repository.js';
import { createSpatialSemanticAtomicWritePlan } from
  '../../infrastructure/postgres/spatial-semantic-atomic-write-plan.js';
import { prepareSpatialSemanticRemainder, admitSpatialSemanticRemainder } from
  '@rus/materialization/internal/lower-dvina-trace-s1';
import { planApprovedActorDestinationTransition } from '@rus/movement-routes';

export function createLowerDvinaTraceS1ProductionResolverFactory({ pool,
  spatialSemanticModel } = {}) {
  if (!pool?.query || typeof spatialSemanticModel !== 'function') {
    throw new TypeError('S1 PostgreSQL pool and descriptor model are required.');
  }
  const authority = createSpatialSemanticAuthorityRepository({ pool });
  return ({ partyId }) => async function resolveSpatialSemantic(input) {
    const value = strictSnapshot(input);
    const operation = value.operation;
    const request = value.request;
    const actor = value.actor?.actor_id;
    const target = lookOperation(operation, actor) ? operation.target_refs?.[0]
      : movementOperation(operation, actor) ? operation.target_ref : null;
    if (!text(target) || !text(request?.request_id)
        || lookOperation(operation, actor) && operation.target_refs.length !== 1) {
      fail('TRACE_S1_SCOPE_INVALID');
    }
    if (movementOperation(operation, actor)) {
      return resolveLocalMovement({ value, authority, partyId, target });
    }
    const initialTarget = operation.discovery_kind === 'look'
      && markerOf(request.player_safe_state)?.position_ref === target;
    const localTarget = !initialTarget;
    const committed = await authority.findCommittedResolution(localTarget
      ? { party_id: partyId, local_ref: target }
      : { party_id: partyId, request_id: request.request_id });
    if (committed != null) {
      if (committed.position_ref !== currentPosition(value.committed_state)
          || localTarget && (!visibleLocalReference(request.player_safe_state, target)
            || committed.local_ref !== target)) {
        fail('TRACE_S1_SCOPE_INVALID');
      }
      return resolvedResult(value, committed);
    }
    const marker = markerOf(request.player_safe_state);
    if (localTarget || marker?.position_ref !== target) {
      fail('TRACE_S1_SCOPE_INVALID');
    }
    const preModel = await authority.loadPreModelAtPosition({ party_id: partyId,
      position_ref: target });
    if (preModel.envelope.position_ref !== target) fail('TRACE_S1_SCOPE_INVALID');
    const actionRef = `s1:${request.root_turn_id}:${request.step_index}`;
    const prepared = prepareSpatialSemanticRemainder({
      schema: 'rus.s1_spatial_semantic_request.v1', request_id: request.request_id,
      causal_request_ref: actionRef, party_id: partyId, need: 'perception',
      envelope: preModel.envelope
    });
    const resolution = admitSpatialSemanticRemainder({ prepared,
      proposal: await spatialSemanticModel(prepared.model_request) });
    const atomic = createSpatialSemanticAtomicWritePlan({
      schema: 'spatial_semantic_atomic_write_plan_v1', party_id: partyId,
      base_party_state_version: Number(request.committed_state_version),
      change_set_id: `change:${partyId}:turn-step:${Number(value.committed_state?.party_state?.turn_number) + 1}`,
      causal_identity: { request_id: request.request_id,
        root_turn_id: request.root_turn_id, action_ref: actionRef,
        step_index: request.step_index, actor_ref: actor },
      envelope_ref: preModel.envelope_ref,
      expected_envelope_state_version: preModel.state_version,
      formal_spatial_context: { baseline_ref: preModel.envelope.baseline_ref,
        g5_ref: preModel.envelope.g5_ref, kind: preModel.envelope.kind,
        structural_variant: preModel.envelope.structural_variant,
        available_mechanics: preModel.envelope.available_mechanics,
        required_semantic_requirements: preModel.envelope.required_semantic_requirements,
        topology: preModel.envelope.topology },
      resolution
    });
    return Object.freeze({ working_projection: structuredClone(value.working_projection),
      summary: 'spatial semantic detail resolved', write_fragments: [],
      player_response_boundary: true, spatial_semantic_atomic_write_plan: atomic });
  };
}

function lookOperation(operation, actor) {
  return operation?.op === 'request_discovery' && ['look', 'inspect'].includes(operation.discovery_kind)
    && operation.actor_ref === actor && text(actor);
}
function movementOperation(operation, actor) {
  return operation?.op === 'request_movement' && operation.movement_kind === 'local'
    && operation.actor_ref === actor && text(actor);
}
async function resolveLocalMovement({ value, authority, partyId, target }) {
  const committed = await authority.findCommittedResolution({ party_id: partyId,
    local_ref: target });
  if (committed == null || committed.position_ref !== currentPosition(value.committed_state)
      || !visibleLocalReference(value.request.player_safe_state, target)) {
    fail('TRACE_S1_SCOPE_INVALID');
  }
  const refs = committed.formal_spatial_refs;
  if (refs?.structural_variant !== 'open_one_space'
      || !text(refs.position_ref) || !Array.isArray(refs.movement_edge_refs)
      || refs.movement_edge_refs.length !== 2) fail('TRACE_S1_SCOPE_INVALID');
  const movementEdgeRef = await authority.findLocalMovementEdge({ party_id: partyId,
    from_position_ref: committed.position_ref, to_position_ref: refs.position_ref,
    movement_edge_refs: refs.movement_edge_refs });
  const result = planApprovedActorDestinationTransition({
    state_version: value.request.committed_state_version,
    expected_state_version: value.request.committed_state_version,
    actor: { actor_ref: { entity_kind: 'player_character', entity_id: value.actor.actor_id },
      location_ref: committed.position_ref, zone_ref: committed.position_ref },
    destination: { entity_ref: { entity_kind: 'spatial_local_reference', entity_id: target },
      location_ref: committed.position_ref, zone_ref: refs.position_ref },
    local_transition_bindings: [{ schema: 'rus.trace_local_zone_transition.v1',
      terminal_outcome: 'same_materialized_location_new_zone',
      location_ref: committed.position_ref,
      source_zone_candidates: [committed.position_ref],
      destination_zone_ref: refs.position_ref, admitted_subject_classes: ['actor'],
      transition_id: movementEdgeRef, duration_minutes: 1 }],
    allowed_movement_refs: [movementEdgeRef]
  });
  if (!result.pass) fail('TRACE_S1_MOVEMENT_OWNER_REJECTED');
  return Object.freeze({ working_projection: structuredClone(value.working_projection),
    summary: 'local spatial movement resolved', write_fragments: [],
    consequence_fragment: { position_transition: { owner: '@rus/movement-routes',
      actor_id: value.actor.actor_id, local_ref: target,
      from_position_ref: committed.position_ref, to_position_ref: refs.position_ref,
      movement_edge_ref: result.proposal.movement_ref } },
    player_response_boundary: true });
}
export function projectLowerDvinaTraceS1Capability({ playerSafeState,
  committedState, resolverAvailable }) {
  let player; let committed;
  try { player = strictSnapshot(playerSafeState); committed = strictSnapshot(committedState); }
  catch { return player ?? {}; }
  if (!resolverAvailable || !Array.isArray(committed.spatial_semantic)) return player;
  const position = committed.position?.position_id ?? committed.position?.position_ref;
  if (!text(position)) return player;
  const resolutions = committed.spatial_semantic.flatMap(({ resolutions = [] }) =>
    resolutions.filter((resolution) => resolution?.position_ref === position
      && visibleResolution(resolution)));
  const next = projectLowerDvinaTraceS1Resolutions({ playerSafeState: player,
    resolutions });
  const available = committed.spatial_semantic.find(({ envelope_ref: ref, envelope, status,
    capacity_total: total, consumed_count: used }) => status === 'committed'
      && text(ref) && envelope?.position_ref === position && Number.isSafeInteger(total)
      && Number.isSafeInteger(used) && used < total);
  return available == null ? next : { ...next, spatial_semantic: {
    semantic_grounding_available: true,
    position_ref: position } };
}

export function projectLowerDvinaTraceS1Resolutions({ playerSafeState,
  resolutions }) {
  let player; let safeResolutions;
  try {
    player = strictSnapshot(playerSafeState);
    safeResolutions = strictSnapshot(resolutions);
  } catch { return player ?? {}; }
  if (!Array.isArray(safeResolutions)) return player;
  const visibleResolutions = safeResolutions.filter(visibleResolution);
  const descriptions = visibleResolutions.map(({ semantics }) =>
    `${semantics.name}: ${semantics.description}`);
  const existing = Array.isArray(player.known_context) ? player.known_context : [];
  const visible = Array.isArray(player.visible_objects) ? player.visible_objects : [];
  const knownRefs = new Set(visible.map((object) => object?.entity_ref?.entity_id));
  const visible_objects = [...visible, ...visibleResolutions.filter(({ local_ref }) => !knownRefs.has(local_ref))
    .map(({ local_ref, semantics }) => ({ entity_ref: {
      entity_kind: 'spatial_local_reference', entity_id: local_ref },
    display_label: semantics.name, recognition: 'recognized', visible_status: 'замечен' }))];
  return descriptions.length === 0 ? player : { ...player, visible_objects,
    known_context: [...existing, ...descriptions.filter((description) =>
      !existing.includes(description))] };
}

function resolvedResult(value, committed) {
  if (!visibleResolution(committed)) fail('TRACE_S1_RESOLUTION_INVALID');
  return Object.freeze({ working_projection: structuredClone(value.working_projection),
    summary: committed.semantics.description, write_fragments: [],
    player_response_boundary: true });
}
function visibleResolution(value) {
  return text(value?.local_ref) && text(value?.position_ref)
    && text(value?.semantics?.name) && text(value?.semantics?.description)
    && text(value?.semantics?.kind);
}
function currentPosition(value) {
  const position = value?.position;
  return text(position?.position_id) ? position.position_id
    : text(position?.position_ref) ? position.position_ref : null;
}
function markerOf(value) {
  const marker = ownRecord(value, 'spatial_semantic');
  if (marker == null || Object.keys(marker).length !== 2
      || marker.semantic_grounding_available !== true) return null;
  return marker;
}
function visibleLocalReference(value, target) {
  return Array.isArray(value?.visible_objects) && value.visible_objects.some((object) =>
    Object.keys(object ?? {}).length === 4
      && ['entity_ref', 'display_label', 'recognition', 'visible_status'].every((key) =>
        Object.hasOwn(object, key))
      && text(object.display_label) && object.recognition === 'recognized'
      && object.visible_status === 'замечен' && Object.keys(object.entity_ref ?? {}).length === 2
      && object.entity_ref?.entity_kind === 'spatial_local_reference'
      && object.entity_ref.entity_id === target);
}
function ownRecord(value, key) {
  if (value == null || typeof value !== 'object') return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) return null;
  const record = descriptor.value;
  if (record == null || typeof record !== 'object' || Array.isArray(record)
      || Object.getPrototypeOf(record) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(record);
  if (Object.values(descriptors).some((entry) => entry.enumerable !== true
      || !Object.hasOwn(entry, 'value'))) return null;
  return Object.fromEntries(Object.entries(descriptors)
    .map(([name, entry]) => [name, entry.value]));
}
function strictSnapshot(value) {
  const seen = new WeakSet();
  const visit = (input) => {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') { if (Number.isFinite(input)) return input; fail('TRACE_S1_INPUT_INVALID'); }
    if (!input || typeof input !== 'object' || seen.has(input)
        || Object.getOwnPropertySymbols(input).length > 0
        || Object.getPrototypeOf(input) !== (Array.isArray(input) ? Array.prototype : Object.prototype)) fail('TRACE_S1_INPUT_INVALID');
    seen.add(input); const descriptors = Object.getOwnPropertyDescriptors(input);
    const names = Object.keys(descriptors).filter((key) => key !== 'length');
    if (Array.isArray(input) && (names.length !== input.length || names.some((key, index) => key !== String(index)))) fail('TRACE_S1_INPUT_INVALID');
    return Array.isArray(input) ? names.map((key) => {
      const descriptor = descriptors[key]; if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('TRACE_S1_INPUT_INVALID'); return visit(descriptor.value);
    }) : Object.fromEntries(names.map((key) => {
      const descriptor = descriptors[key]; if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('TRACE_S1_INPUT_INVALID'); return [key, visit(descriptor.value)];
    }));
  };
  return visit(value);
}
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function fail(code) { throw Object.assign(new Error(code), { code }); }
