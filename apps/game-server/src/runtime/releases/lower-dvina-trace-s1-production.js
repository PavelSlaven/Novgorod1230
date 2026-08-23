import { createSpatialSemanticAuthorityRepository } from
  '../../infrastructure/postgres/spatial-semantic-authority-repository.js';
import { createSpatialSemanticAtomicWritePlan } from
  '../../infrastructure/postgres/spatial-semantic-atomic-write-plan.js';
import { prepareSpatialSemanticRemainder, admitSpatialSemanticRemainder } from
  '@rus/materialization/internal/lower-dvina-trace-s1';

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
    const target = operation?.target_refs?.[0];
    if (!lookOperation(operation, actor) || !text(target)
        || operation.target_refs.length !== 1 || !text(request?.request_id)) {
      fail('TRACE_S1_SCOPE_INVALID');
    }
    const committed = await authority.findCommittedResolution({ party_id: partyId,
      request_id: request.request_id, local_ref: target });
    if (committed != null) {
      if (committed.position_ref !== currentPosition(value.committed_state)
          || committed.position_ref !== target) {
        fail('TRACE_S1_SCOPE_INVALID');
      }
      return resolvedResult(value, committed);
    }
    const marker = markerOf(request.player_safe_state);
    if (marker?.position_ref !== target || !text(marker.envelope_ref)) {
      fail('TRACE_S1_SCOPE_INVALID');
    }
    const preModel = await authority.loadPreModel({ party_id: partyId,
      envelope_ref: marker.envelope_ref });
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
      resolution
    });
    return Object.freeze({ working_projection: structuredClone(value.working_projection),
      summary: 'spatial semantic detail resolved', write_fragments: [],
      player_response_boundary: true, spatial_semantic_atomic_write_plan: atomic });
  };
}

function lookOperation(operation, actor) {
  return operation?.op === 'request_discovery' && operation.discovery_kind === 'look'
    && operation.actor_ref === actor && text(actor);
}
export function projectLowerDvinaTraceS1Capability({ playerSafeState,
  committedState, resolverAvailable }) {
  let player; let committed;
  try { player = strictSnapshot(playerSafeState); committed = strictSnapshot(committedState); }
  catch { return player ?? {}; }
  if (!resolverAvailable || !Array.isArray(committed.spatial_semantic)) return player;
  const position = committed.position?.position_id ?? committed.position?.position_ref;
  if (!text(position)) return player;
  const descriptions = committed.spatial_semantic.flatMap(({ resolutions = [] }) =>
    resolutions.filter((resolution) => resolution?.position_ref === position
      && visibleResolution(resolution)).map(({ semantics }) =>
      `${semantics.name}: ${semantics.description}`));
  const existing = Array.isArray(player.known_context) ? player.known_context : [];
  const next = descriptions.length === 0 ? player : { ...player,
    known_context: [...existing, ...descriptions.filter((description) =>
      !existing.includes(description))] };
  const available = committed.spatial_semantic.find(({ envelope_ref: ref, envelope, status,
    capacity_total: total, consumed_count: used }) => status === 'committed'
      && text(ref) && envelope?.position_ref === position && Number.isSafeInteger(total)
      && Number.isSafeInteger(used) && used < total);
  return available == null ? next : { ...next, spatial_semantic: {
    semantic_grounding_available: true,
    envelope_ref: available.envelope_ref,
    position_ref: position } };
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
  if (marker == null || Object.keys(marker).length !== 3
      || marker.semantic_grounding_available !== true) return null;
  return marker;
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
