import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, MaterializationError } from './core.js';

const KINDS = new Set(['ordinary_structure', 'local_natural_feature']);
const NEEDS = new Set(['interaction', 'projection', 'perception']);

// This is intentionally an internal, data-only S1 boundary.  It admits a
// semantic description after the spatial owner has already reserved one slot;
// it neither chooses a slot nor creates topology.
export function prepareSpatialSemanticRemainder(input) {
  const value = json(input, 'S1_SPATIAL_INPUT_INVALID', 'input');
  exact(value, ['schema', 'request_id', 'causal_request_ref', 'party_id', 'need',
    'reservation'], 'S1_SPATIAL_INPUT_INVALID', 'input');
  text(value.schema, 'S1_SPATIAL_INPUT_INVALID', 'input.schema');
  if (value.schema !== 'rus.s1_spatial_semantic_request.v1') {
    fail('S1_SPATIAL_INPUT_INVALID', 'Unsupported S1 request schema.');
  }
  text(value.request_id, 'S1_SPATIAL_INPUT_INVALID', 'input.request_id');
  text(value.causal_request_ref, 'S1_SPATIAL_INPUT_INVALID', 'input.causal_request_ref');
  text(value.party_id, 'S1_SPATIAL_INPUT_INVALID', 'input.party_id');
  if (!NEEDS.has(value.need)) fail('S1_SPATIAL_INPUT_INVALID', 'S1 need is unsupported.');
  const reservation = reservationOf(value.reservation);
  const identity = structuralIdentity(value, reservation);
  const code_owned = deepFreeze({
    party_id: value.party_id,
    structural_identity: identity,
    structural_primitive: reservation.envelope.structural_primitive,
    containment: { parent_g6_ref: reservation.envelope.g6_ref },
    position: { position_ref: reservation.envelope.position_ref },
    reservation_ref: reservation.reservation_ref,
    envelope_ref: reservation.envelope.envelope_ref
  });
  const model_request = deepFreeze({
    schema: 'rus.s1_spatial_semantic_model_request.v1',
    request_id: value.request_id,
    qualitative_need: value.need,
    allowed_kind: reservation.envelope.kind,
    allowed_descriptors: deepFreeze(structuredClone(
      reservation.envelope.allowed_descriptors)),
    read_only_pins: deepFreeze({
      baseline_ref: reservation.envelope.baseline_ref,
      g5_ref: reservation.envelope.g5_ref,
      template_ref: reservation.envelope.template_ref,
      property_ref: reservation.envelope.property_ref,
      function_ref: reservation.envelope.function_ref,
      environment_ref: reservation.envelope.environment_ref
    }),
    proposal_schema: 'rus.s1_spatial_semantic_proposal.v1'
  });
  return deepFreeze({ schema: 'rus.s1_spatial_semantic_prepared.v1', request_id: value.request_id,
    causal_request_ref: value.causal_request_ref, party_id: value.party_id,
    reservation, code_owned, model_request });
}

export function admitSpatialSemanticRemainder({ prepared, proposal }) {
  const safePrepared = preparedOf(prepared);
  const safeProposal = proposalOf(proposal, safePrepared);
  const resolution = {
    schema: 'rus.s1_spatial_semantic_resolution.v1',
    request_id: safePrepared.request_id,
    causal_request_ref: safePrepared.causal_request_ref,
    party_id: safePrepared.party_id,
    reservation: safePrepared.reservation,
    structural: safePrepared.code_owned,
    semantics: {
      kind: safeProposal.kind,
      descriptor_ref: safeProposal.descriptor_ref,
      description: safeProposal.description,
      variant: safeProposal.variant,
      movement_effect: 'none',
      hazard_effect: 'none'
    }
  };
  return seal(resolution);
}

// Fully authored details are already an exact fact.  The helper keeps the
// orchestration contract explicit: no semantic provider call is required.
export function resolveAuthoredSpatialSemanticRemainder({ prepared, authored_semantics }) {
  const safePrepared = preparedOf(prepared);
  const authored = authoredOf(authored_semantics, safePrepared);
  const resolution = admitSpatialSemanticRemainder({ prepared: safePrepared,
    proposal: { schema: 'rus.s1_spatial_semantic_proposal.v1',
      request_id: safePrepared.request_id, kind: authored.kind,
      descriptor_ref: authored.descriptor_ref,
      movement_effect: 'none', hazard_effect: 'none' } });
  const { resolution_digest: _digest, ...unsigned } = resolution;
  return seal({ ...unsigned, model_calls: 0 });
}

export function normalizeSpatialSemanticEnvelope(value) {
  return envelopeOf(value);
}

export function validateSpatialSemanticResolution(value) {
  const resolution = json(value, 'S1_SPATIAL_RESOLUTION_INVALID', 'resolution');
  const keys = ['schema','request_id','causal_request_ref','party_id',
    'reservation','structural','semantics','resolution_digest'];
  if (resolution.model_calls === 0) keys.splice(-1, 0, 'model_calls');
  exact(resolution, keys, 'S1_SPATIAL_RESOLUTION_INVALID', 'resolution');
  if (resolution.schema !== 'rus.s1_spatial_semantic_resolution.v1'
      || typeof resolution.request_id !== 'string' || !resolution.request_id
      || typeof resolution.causal_request_ref !== 'string' || !resolution.causal_request_ref) {
    fail('S1_SPATIAL_RESOLUTION_INVALID', 'S1 resolution identity is invalid.');
  }
  const prepared = prepareSpatialSemanticRemainder({
    schema: 'rus.s1_spatial_semantic_request.v1', request_id: resolution.request_id,
    causal_request_ref: resolution.causal_request_ref, party_id: resolution.party_id,
    need: 'interaction', reservation: resolution.reservation });
  const rebuilt = admitSpatialSemanticRemainder({ prepared, proposal: {
    schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: resolution.request_id,
    kind: resolution.semantics?.kind, descriptor_ref: resolution.semantics?.descriptor_ref,
    movement_effect: resolution.semantics?.movement_effect,
    hazard_effect: resolution.semantics?.hazard_effect } });
  const { resolution_digest: _rebuiltDigest, ...rebuiltUnsigned } = rebuilt;
  const expected = resolution.model_calls === 0
    ? seal({ ...rebuiltUnsigned, model_calls: 0 }) : rebuilt;
  if (canonicalDigest(expected) !== canonicalDigest(resolution)) {
    fail('S1_SPATIAL_RESOLUTION_INVALID', 'S1 resolution was not code-owned rebuild output.');
  }
  return expected;
}

function preparedOf(value) {
  const prepared = json(value, 'S1_SPATIAL_PREPARED_INVALID', 'prepared');
  exact(prepared, ['schema', 'request_id', 'causal_request_ref', 'party_id',
    'reservation', 'code_owned', 'model_request'], 'S1_SPATIAL_PREPARED_INVALID', 'prepared');
  if (prepared.schema !== 'rus.s1_spatial_semantic_prepared.v1') {
    fail('S1_SPATIAL_PREPARED_INVALID', 'Prepared S1 schema is invalid.');
  }
  // Rebuild, rather than trust a caller-supplied sealed payload.
  const rebuilt = prepareSpatialSemanticRemainder({ schema: 'rus.s1_spatial_semantic_request.v1',
    request_id: prepared.request_id, causal_request_ref: prepared.causal_request_ref,
    party_id: prepared.party_id, need: prepared.model_request?.qualitative_need,
    reservation: prepared.reservation });
  if (canonicalDigest(rebuilt) !== canonicalDigest(prepared)) {
    fail('S1_SPATIAL_PREPARED_INVALID', 'Prepared S1 proof was recomposed after validation.');
  }
  return rebuilt;
}

function reservationOf(value) {
  const reservation = json(value, 'S1_SPATIAL_RESERVATION_INVALID', 'reservation');
  exact(reservation, ['reservation_ref', 'state_version', 'status', 'capacity', 'envelope',
    'reservation_digest'],
    'S1_SPATIAL_RESERVATION_INVALID', 'reservation');
  text(reservation.reservation_ref, 'S1_SPATIAL_RESERVATION_INVALID', 'reservation.reservation_ref');
  positive(reservation.state_version, 'S1_SPATIAL_RESERVATION_INVALID', 'reservation.state_version');
  if (reservation.status !== 'committed_reserved') {
    fail('S1_SPATIAL_RESERVATION_REQUIRED', 'S1 needs a committed spatial reservation.');
  }
  const capacity = json(reservation.capacity, 'S1_SPATIAL_RESERVATION_INVALID', 'reservation.capacity');
  exact(capacity, ['total', 'reserved', 'remaining'], 'S1_SPATIAL_RESERVATION_INVALID', 'reservation.capacity');
  for (const key of ['total', 'reserved', 'remaining']) nonnegative(capacity[key], 'S1_SPATIAL_RESERVATION_INVALID', `reservation.capacity.${key}`);
  if (capacity.reserved < 1 || capacity.total !== capacity.reserved + capacity.remaining || capacity.remaining < 0) {
    fail('S1_SPATIAL_CAPACITY_INVALID', 'Spatial capacity is not a valid finite reservation envelope.');
  }
  const envelope = envelopeOf(reservation.envelope);
  const unsigned = { reservation_ref: reservation.reservation_ref,
    state_version: reservation.state_version, status: reservation.status,
    capacity: { ...capacity }, envelope };
  if (reservation.reservation_digest !== `sha256:${canonicalDigest(unsigned)}`) {
    fail('S1_SPATIAL_RESERVATION_INVALID', 'Spatial reservation digest does not match its exact proof.');
  }
  return deepFreeze({ ...unsigned, reservation_digest: reservation.reservation_digest });
}

function envelopeOf(value) {
  const envelope = json(value, 'S1_SPATIAL_ENVELOPE_INVALID', 'reservation.envelope');
  const keys = ['envelope_ref', 'kind', 'baseline_ref', 'g5_ref', 'g6_ref', 'position_ref',
    'template_ref', 'property_ref', 'function_ref', 'environment_ref', 'structural_primitive',
    'profile_ref', 'profile_version', 'profile_digest', 'policy_ref', 'policy_version',
    'baseline_state_version', 'g5_state_version', 'g6_state_version',
    'position_state_version', 'allowed_descriptors'];
  exact(envelope, keys, 'S1_SPATIAL_ENVELOPE_INVALID', 'reservation.envelope');
  for (const key of ['envelope_ref', 'baseline_ref', 'g5_ref', 'g6_ref', 'position_ref',
    'template_ref', 'property_ref', 'function_ref', 'environment_ref', 'structural_primitive',
    'profile_ref', 'profile_digest', 'policy_ref']) text(envelope[key], 'S1_SPATIAL_ENVELOPE_INVALID', `reservation.envelope.${key}`);
  if (!/^sha256:[0-9a-f]{64}$/u.test(envelope.profile_digest)) {
    fail('S1_SPATIAL_ENVELOPE_INVALID', 'S1 profile digest is invalid.');
  }
  positive(envelope.profile_version, 'S1_SPATIAL_ENVELOPE_INVALID', 'reservation.envelope.profile_version');
  positive(envelope.policy_version, 'S1_SPATIAL_ENVELOPE_INVALID', 'reservation.envelope.policy_version');
  for (const key of ['baseline_state_version','g5_state_version','g6_state_version','position_state_version']) nonnegative(envelope[key], 'S1_SPATIAL_ENVELOPE_INVALID', `reservation.envelope.${key}`);
  if (!KINDS.has(envelope.kind)) fail('S1_SPATIAL_ENVELOPE_INVALID', 'S1 envelope kind is unsupported.');
  const expectedPrimitive = envelope.kind === 'ordinary_structure'
    ? 'party_scoped_ordinary_structure' : 'party_scoped_local_natural_feature';
  if (envelope.structural_primitive !== expectedPrimitive) {
    fail('S1_SPATIAL_MECHANICS_GAP', 'The approved envelope lacks the required structural primitive.');
  }
  if (!Array.isArray(envelope.allowed_descriptors)
      || envelope.allowed_descriptors.length < 1 || envelope.allowed_descriptors.length > 8) {
    fail('S1_SPATIAL_ENVELOPE_INVALID', 'S1 envelope requires a finite descriptor catalog.');
  }
  const descriptorRefs = new Set();
  const allowed_descriptors = envelope.allowed_descriptors.map((entry, index) => {
    const descriptor = json(entry, 'S1_SPATIAL_ENVELOPE_INVALID',
      `reservation.envelope.allowed_descriptors.${index}`);
    exact(descriptor, ['descriptor_ref', 'description', 'variant'],
      'S1_SPATIAL_ENVELOPE_INVALID', `reservation.envelope.allowed_descriptors.${index}`);
    for (const key of ['descriptor_ref', 'description', 'variant']) text(descriptor[key],
      'S1_SPATIAL_ENVELOPE_INVALID', `reservation.envelope.allowed_descriptors.${index}.${key}`);
    if (descriptorRefs.has(descriptor.descriptor_ref)) {
      fail('S1_SPATIAL_ENVELOPE_INVALID', 'S1 descriptor refs must be unique.');
    }
    descriptorRefs.add(descriptor.descriptor_ref);
    return descriptor;
  });
  return deepFreeze({ ...envelope, allowed_descriptors });
}

function proposalOf(value, prepared) {
  const proposal = json(value, 'S1_SPATIAL_PROPOSAL_INVALID', 'proposal');
  exact(proposal, ['schema', 'request_id', 'kind', 'descriptor_ref',
    'movement_effect', 'hazard_effect'], 'S1_SPATIAL_PROPOSAL_INVALID', 'proposal');
  if (proposal.schema !== 'rus.s1_spatial_semantic_proposal.v1'
      || proposal.request_id !== prepared.request_id || proposal.kind !== prepared.reservation.envelope.kind) {
    fail('S1_SPATIAL_PROPOSAL_INVALID', 'Proposal does not match the prepared S1 envelope.');
  }
  text(proposal.descriptor_ref, 'S1_SPATIAL_PROPOSAL_INVALID', 'proposal.descriptor_ref');
  if (proposal.movement_effect !== 'none' || proposal.hazard_effect !== 'none') {
    fail('S1_SPATIAL_MECHANICS_GAP', 'Movement or hazard semantics require a formal spatial owner handoff.');
  }
  const descriptor = prepared.reservation.envelope.allowed_descriptors.find(
    (entry) => entry.descriptor_ref === proposal.descriptor_ref);
  if (descriptor == null) {
    fail('S1_SPATIAL_AUTHORITY_REQUIRED', 'Proposal descriptor is outside the approved ordinary envelope.');
  }
  return deepFreeze({ ...proposal, description: descriptor.description,
    variant: descriptor.variant });
}

function authoredOf(value, prepared) {
  const authored = json(value, 'S1_SPATIAL_AUTHORED_INVALID', 'authored_semantics');
  exact(authored, ['kind', 'descriptor_ref'], 'S1_SPATIAL_AUTHORED_INVALID', 'authored_semantics');
  if (authored.kind !== prepared.reservation.envelope.kind) fail('S1_SPATIAL_AUTHORED_INVALID', 'Authored semantics do not match the approved envelope.');
  text(authored.descriptor_ref, 'S1_SPATIAL_AUTHORED_INVALID', 'authored_semantics.descriptor_ref');
  if (!prepared.reservation.envelope.allowed_descriptors.some(
    (entry) => entry.descriptor_ref === authored.descriptor_ref)) {
    fail('S1_SPATIAL_AUTHORITY_REQUIRED', 'Authored descriptor is outside the approved ordinary envelope.');
  }
  return deepFreeze({ ...authored });
}

function structuralIdentity(input, reservation) {
  const prefix = reservation.envelope.kind === 'ordinary_structure'
    ? 's1_structure' : 's1_natural_feature';
  return `${prefix}_${canonicalDigest({ domain: `s1_spatial_semantic_${reservation.envelope.kind}_v1`,
    party_id: input.party_id, reservation_ref: reservation.reservation_ref,
    reservation_state_version: reservation.state_version,
    envelope_ref: reservation.envelope.envelope_ref }).slice(0, 24)}`;
}

function seal(value) {
  const detached = JSON.parse(JSON.stringify(value));
  return deepFreeze({ ...detached, resolution_digest: `sha256:${canonicalDigest(detached)}` });
}

function json(value, code, path) {
  const seen = new Set();
  const visit = (entry, where) => {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return;
    if (typeof entry === 'number') {
      if (Number.isFinite(entry)) return;
      fail(code, 'Input must contain finite JSON numbers.', { path: where });
    }
    if (typeof entry !== 'object' || seen.has(entry)) fail(code, 'Input must be acyclic JSON data.', { path: where });
    seen.add(entry);
    if (Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== Array.prototype) fail(code, 'Input must use plain JSON containers.', { path: where });
    if (Object.getOwnPropertySymbols(entry).length) fail(code, 'Input must not contain symbols.', { path: where });
    if (Array.isArray(entry)) {
      if (Object.keys(entry).length !== entry.length) {
        fail(code, 'Input arrays must be dense JSON data.', { path: where });
      }
      for (let index = 0; index < entry.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(entry, String(index));
        if (descriptor == null || !('value' in descriptor) || !descriptor.enumerable) {
          fail(code, 'Input must not contain accessor or exotic properties.', {
            path: `${where}.${index}` });
        }
        visit(descriptor.value, `${where}.${index}`);
      }
      return;
    }
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(entry))) {
      if (!('value' in descriptor) || !descriptor.enumerable) fail(code, 'Input must not contain accessor or exotic properties.', { path: `${where}.${key}` });
      visit(descriptor.value, `${where}.${key}`);
    }
  };
  visit(value, path);
  return structuredClone(value);
}
function exact(value, keys, code, path) { if (!value || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) fail(code, 'Input has an unsupported shape.', { path }); }
function text(value, code, path) { if (typeof value !== 'string' || value.length === 0) fail(code, 'A non-empty string is required.', { path }); }
function nonnegative(value, code, path) { if (!Number.isSafeInteger(value) || value < 0) fail(code, 'A non-negative integer is required.', { path }); }
function positive(value, code, path) { if (!Number.isSafeInteger(value) || value < 1) fail(code, 'A positive integer is required.', { path }); }
function fail(code, message, details = {}) { throw new MaterializationError(code, message, details); }
