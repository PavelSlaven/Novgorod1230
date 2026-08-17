import { createSpatialSemanticAuthorityRepository } from
  '../../infrastructure/postgres/spatial-semantic-authority-repository.js';
import { createSpatialSemanticAtomicWritePlan,
  spatialSemanticReservationRef, spatialSemanticTraceActionRef } from
  '../../infrastructure/postgres/spatial-semantic-atomic-write-plan.js';
import { prepareSpatialSemanticRemainder, admitSpatialSemanticRemainder,
  resolveAuthoredSpatialSemanticRemainder } from
  '@rus/materialization/internal/lower-dvina-trace-s1';
import { canonicalDigest } from '@rus/materialization';

export function createLowerDvinaTraceS1ProductionResolverFactory({ pool, loadedProfile,
  spatialSemanticModel } = {}) {
  const profile = requireProfile(loadedProfile);
  if (!pool?.connect || typeof spatialSemanticModel !== 'function') {
    throw new TypeError('S1 PostgreSQL pool and descriptor model are required.');
  }
  const authority = createSpatialSemanticAuthorityRepository({ pool });
  return ({ partyId }) => async function resolveSpatialSemantic(envelope) {
    const safeEnvelope = strictSnapshot(envelope);
    const marker = markerOf(safeEnvelope.request?.player_safe_state);
    const operation = safeEnvelope.operation;
    const actor = safeEnvelope.actor?.actor_id;
    if (operation?.op !== 'request_discovery' || operation.discovery_kind !== 'look'
        || !Array.isArray(operation.target_refs) || operation.target_refs.length !== 1
        || operation.target_refs[0] !== marker?.position_ref || operation.actor_ref !== actor
        || !text(actor) || marker.profile_ref !== profile.profile_id
        || marker.profile_version !== profile.revision || marker.policy_ref !== profile.policy_ref
        || marker.policy_version !== profile.policy_version) fail('TRACE_S1_SCOPE_INVALID');
    const rootTurnId = safeEnvelope.request.root_turn_id;
    const stepIndex = safeEnvelope.request.step_index;
    const reservationRef = spatialSemanticReservationRef({ partyId, rootTurnId,
      stepIndex, envelopeRef: marker.envelope_ref });
    const turn = Number(safeEnvelope.committed_state?.party_state?.turn_number) + 1;
    const acquired = await authority.acquireOrReuseReservation({ party_id: partyId,
      envelope_ref: marker.envelope_ref, reservation_ref: reservationRef,
      change_set_id: null });
    try {
      const actionRef = spatialSemanticTraceActionRef({ rootTurnId, stepIndex,
        approvedPlan: safeEnvelope.plan });
      const prepared = prepareSpatialSemanticRemainder({
        schema: 'rus.s1_spatial_semantic_request.v1',
        request_id: safeEnvelope.request.request_id,
        causal_request_ref: actionRef, party_id: partyId, need: 'perception',
        reservation: acquired.reservation });
      const authored = marker.authored_descriptor_ref == null ? null : {
        kind: marker.kind, descriptor_ref: marker.authored_descriptor_ref };
      const resolution = authored == null ? admitSpatialSemanticRemainder({ prepared,
        proposal: await spatialSemanticModel(prepared.model_request) })
        : resolveAuthoredSpatialSemanticRemainder({ prepared,
          authored_semantics: authored });
      const atomic = createSpatialSemanticAtomicWritePlan({
        schema: 'spatial_semantic_atomic_write_request_v1', party_id: partyId,
        base_party_state_version:
          Number(safeEnvelope.request.committed_state_version),
        change_set_id: `change:${partyId}:turn-step:${turn}`,
        causal_identity: { request_id: safeEnvelope.request.request_id,
          root_turn_id: rootTurnId, action_ref: actionRef, step_index: stepIndex,
          actor_ref: actor,
          operation_digest: `sha256:${canonicalDigest(operation)}` },
        envelope_pin: acquired.envelope_pin,
        reservation_pin: acquired.reservation_pin, resolution });
      return Object.freeze({ working_projection:
        structuredClone(safeEnvelope.working_projection),
      summary: 'spatial semantic detail resolved', write_fragments: [],
      player_response_boundary: true, spatial_semantic_atomic_write_plan: atomic });
    } catch (cause) {
      try { await authority.releaseReservation({ party_id: partyId,
        reservation_ref: reservationRef }); }
      catch (releaseCause) { throw Object.assign(
        new Error('TRACE_S1_RESERVATION_RELEASE_FAILED'),
        { code: 'TRACE_S1_RESERVATION_RELEASE_FAILED', cause: releaseCause }); }
      throw cause;
    }
  };
}

export function projectLowerDvinaTraceS1Capability({ playerSafeState, committedState,
  loadedProfile, resolverAvailable }) {
  let safePlayer; let safeCommitted;
  try { safePlayer = strictSnapshot(playerSafeState);
    safeCommitted = strictSnapshot(committedState); }
  catch { return safePlayer ?? {}; }
  const profile = loadedProfile?.profile;
  const source = safeCommitted?.spatial_semantic ?? [];
  if (!resolverAvailable || profile?.status !== 'approved'
      || !/^[0-9a-f]{64}$/u.test(loadedProfile?.artifact_digest)
      || !Array.isArray(source)) {
    return safePlayer;
  }
  const position = safeCommitted?.position?.position_id
    ?? safeCommitted?.position?.position_ref;
  const available = profile.envelopes.map(({ envelope_ref }) => source.find(
    (entry) => entry?.envelope?.envelope_ref === envelope_ref
      && entry?.status === 'committed'
      && entry?.envelope?.position_ref === position
      && matchingProfileEntry(entry.envelope, loadedProfile) != null
      && (entry?.capacity?.remaining > 0
        || entry?.pending_reservation?.status === 'committed_reserved'))).find(Boolean);
  const visibleResults = source.filter((entry) => entry?.resolution?.semantics != null)
    .map((entry) => ({ structural_identity: entry.resolution.structural.structural_identity,
      kind: entry.resolution.semantics.kind,
      descriptor_ref: entry.resolution.semantics.descriptor_ref,
      description: entry.resolution.semantics.description }));
  if (!available) return visibleResults.length === 0 ? safePlayer
    : { ...safePlayer, spatial_semantic_results: visibleResults };
  const profileEntry = matchingProfileEntry(available.envelope, loadedProfile);
  const authoredDescriptorRef = codeOwnedDescriptorRef(profileEntry);
  return { ...safePlayer,
    ...(visibleResults.length === 0 ? {} : { spatial_semantic_results: visibleResults }),
    spatial_semantic: {
    semantic_grounding_available: true, envelope_ref: available.envelope.envelope_ref,
    position_ref: position, kind: available.envelope.kind, profile_ref: profile.profile_id,
    profile_version: profile.revision, policy_ref: profile.policy_ref,
    policy_version: profile.policy_version,
    ...(authoredDescriptorRef == null ? {} : {
      authored_descriptor_ref: authoredDescriptorRef }) } };
}

function codeOwnedDescriptorRef(entry) {
  if (entry?.authored_descriptor_ref != null) return entry.authored_descriptor_ref;
  return entry?.allowed_descriptors?.length === 1
    ? entry.allowed_descriptors[0].descriptor_ref : null;
}

function matchingProfileEntry(envelope, loadedProfile) {
  const profile = loadedProfile.profile;
  const entry = profile.envelopes.find((candidate) =>
    candidate.envelope_ref === envelope?.envelope_ref);
  if (entry == null || envelope.kind !== entry.kind
      || envelope.structural_primitive !== entry.structural_primitive
      || envelope.profile_ref !== profile.profile_id
      || envelope.profile_version !== profile.revision
      || envelope.profile_digest !== `sha256:${loadedProfile.artifact_digest}`
      || envelope.policy_ref !== profile.policy_ref
      || envelope.policy_version !== profile.policy_version
      || envelope.property_ref !== profile.property_ref
      || envelope.function_ref !== profile.function_ref
      || envelope.environment_ref !== profile.environment_ref
      || !/^sha256:[0-9a-f]{64}$/u.test(envelope.template_ref)
      || canonicalDigest(envelope.allowed_descriptors)
        !== canonicalDigest(entry.allowed_descriptors)) return null;
  return entry;
}

function markerOf(value) {
  if (value == null || typeof value !== 'object'
      || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, 'spatial_semantic');
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
  const marker = descriptor.value;
  const required = ['semantic_grounding_available','envelope_ref','position_ref','kind',
    'profile_ref','profile_version','policy_ref','policy_version'];
  const optional = ['authored_descriptor_ref'];
  if (marker == null || Object.getPrototypeOf(marker) !== Object.prototype
      || Reflect.ownKeys(marker).some((key) => typeof key !== 'string')) return null;
  const descriptors = Object.getOwnPropertyDescriptors(marker);
  const keys = Object.keys(descriptors);
  if (keys.length < required.length || keys.length > required.length + 1
      || !required.every((key) => data(descriptors[key]))
      || keys.some((key) => !required.includes(key)
        && (!optional.includes(key) || !data(descriptors[key])))) return null;
  const copy = Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
  return copy.semantic_grounding_available === true ? structuredClone(copy) : null;
}
function data(descriptor) {
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
}
function strictSnapshot(value) {
  const seen = new WeakSet();
  const visit = (input) => {
    if (input === null || typeof input === 'string'
        || typeof input === 'boolean') return input;
    if (typeof input === 'number') {
      if (Number.isFinite(input)) return input;
      fail('TRACE_S1_INPUT_INVALID');
    }
    if (!input || typeof input !== 'object' || seen.has(input)
        || Object.getOwnPropertySymbols(input).length > 0
        || Object.getPrototypeOf(input)
          !== (Array.isArray(input) ? Array.prototype : Object.prototype)) {
      fail('TRACE_S1_INPUT_INVALID');
    }
    seen.add(input);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const names = Object.keys(descriptors).filter((key) => key !== 'length');
    if (Array.isArray(input)
        && (names.length !== input.length
          || names.some((key, index) => key !== String(index)))) {
      fail('TRACE_S1_INPUT_INVALID');
    }
    const copy = Array.isArray(input) ? [] : {};
    for (const key of names) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail('TRACE_S1_INPUT_INVALID');
      }
      if (Array.isArray(copy)) copy.push(visit(descriptor.value));
      else copy[key] = visit(descriptor.value);
    }
    return copy;
  };
  return visit(value);
}
function requireProfile(value) { const profile=value?.profile; const identity=value?.publication_identity; if (value?.schema!=='rus.lower_dvina_trace_s1_loaded_profile.v1'||value?.artifact_digest!=='dd29b10de589d6244621172191a6860e1a93c63f42665c67faae24ec724cb202'||value?.profile_canonical_digest!=='704348f529d06db15f9136bbc5e0e02e444e7c1b2c84ae785fa83758a7dcbcc5'||canonicalDigest(profile)!==value.profile_canonical_digest||identity?.m11_manifest_digest!=='d2851d72dd338e6b45747e481f8211c719a369a5364bbd7f598e4e7d98acd837'||identity?.phase_1a_manifest_digest!=='3ced300f893f659c7a601f995d288ca5bef604e12e9c72352f6386cb9120d2d8'||identity?.phase_1b_manifest_digest!=='7a872ccd602cb83c56f4f717a6d424e4d79dbf6f4d1f9ca1ba31f6358c0a88bf'||identity?.phase_1b_binding_digest!=='8efc7da30734ce05c357760bd62eb344e90b923825c0755652e61d0c7c156ee1'||profile?.schema!=='rus.lower_dvina_trace_spatial_semantic_profile.v1'||profile.status!=='approved') throw new TypeError('Exact loaded S1 profile is required.'); return profile; }
function text(value) { return typeof value==='string'&&value.length>0; }
function fail(code) { throw Object.assign(new Error(code),{code}); }
