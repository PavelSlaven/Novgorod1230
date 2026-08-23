import { deepFreeze } from '@rus/kernel';
import { MaterializationError } from './core.js';

const KINDS = new Set(['ordinary_structure', 'local_natural_feature']);
const NEEDS = new Set(['interaction', 'projection', 'perception']);

export function prepareSpatialSemanticRemainder(input) {
  const value = json(input, 'S1_SPATIAL_INPUT_INVALID', 'input');
  exact(value, ['schema', 'request_id', 'causal_request_ref', 'party_id', 'need', 'envelope'],
    'S1_SPATIAL_INPUT_INVALID', 'input');
  if (value.schema !== 'rus.s1_spatial_semantic_request.v1' || !NEEDS.has(value.need)) {
    fail('S1_SPATIAL_INPUT_INVALID', 'S1 request is invalid.');
  }
  for (const key of ['request_id', 'causal_request_ref', 'party_id']) {
    text(value[key], 'S1_SPATIAL_INPUT_INVALID', `input.${key}`);
  }
  const envelope = envelopeOf(value.envelope);
  const semantic_context = structuredClone(envelope.semantic_context);
  const code_owned = { envelope: structuredClone(envelope), local_ref: `s1-local:${value.request_id}` };
  const model_request = {
    schema: 'rus.s1_spatial_semantic_model_request.v1', request_id: value.request_id,
    proposal_schema: 'rus.s1_spatial_semantic_proposal.v1', semantic_context,
    proposal_example: { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: value.request_id,
      name: 'ordinary local reference', description: 'ordinary local description' }
  };
  return deepFreeze({ schema: 'rus.s1_spatial_semantic_prepared.v1', request_id: value.request_id,
    causal_request_ref: value.causal_request_ref, party_id: value.party_id, need: value.need,
    envelope, code_owned, model_request });
}

export function admitSpatialSemanticRemainder({ prepared, proposal }) {
  const safePrepared = preparedOf(prepared);
  const safeProposal = proposalOf(proposal, safePrepared);
  const { envelope, local_ref } = safePrepared.code_owned;
  return deepFreeze({ schema: 'rus.s1_spatial_semantic_resolution.v1',
    request_id: safePrepared.request_id, causal_request_ref: safePrepared.causal_request_ref,
    party_id: safePrepared.party_id, local_ref, envelope_ref: envelope.envelope_ref,
    position_ref: envelope.position_ref, semantics: { kind: envelope.kind, name: safeProposal.name,
      description: safeProposal.description, mechanics_class: envelope.mechanics_class } });
}

export function normalizeSpatialSemanticEnvelope(value, { allowExhausted = false } = {}) {
  return envelopeOf(value, allowExhausted);
}

export function validateSpatialSemanticResolution(value) {
  const resolution = json(value, 'S1_SPATIAL_RESOLUTION_INVALID', 'resolution');
  exact(resolution, ['schema', 'request_id', 'causal_request_ref', 'party_id', 'local_ref',
    'envelope_ref', 'position_ref', 'semantics'], 'S1_SPATIAL_RESOLUTION_INVALID', 'resolution');
  if (resolution.schema !== 'rus.s1_spatial_semantic_resolution.v1') {
    fail('S1_SPATIAL_RESOLUTION_INVALID', 'S1 resolution schema is invalid.');
  }
  for (const key of ['request_id', 'causal_request_ref', 'party_id', 'envelope_ref', 'position_ref']) {
    text(resolution[key], 'S1_SPATIAL_RESOLUTION_INVALID', `resolution.${key}`);
  }
  if (resolution.local_ref !== `s1-local:${resolution.request_id}`) {
    fail('S1_SPATIAL_RESOLUTION_INVALID', 'S1 local ref is invalid.');
  }
  const semantics = json(resolution.semantics, 'S1_SPATIAL_RESOLUTION_INVALID', 'resolution.semantics');
  exact(semantics, ['kind', 'name', 'description', 'mechanics_class'],
    'S1_SPATIAL_RESOLUTION_INVALID', 'resolution.semantics');
  if (!KINDS.has(semantics.kind) || semantics.mechanics_class !== 'descriptive_only') {
    fail('S1_SPATIAL_RESOLUTION_INVALID', 'S1 semantics exceed descriptive authority.');
  }
  text(semantics.name, 'S1_SPATIAL_RESOLUTION_INVALID', 'resolution.semantics.name');
  text(semantics.description, 'S1_SPATIAL_RESOLUTION_INVALID', 'resolution.semantics.description');
  return deepFreeze(resolution);
}

function preparedOf(value) {
  const prepared = json(value, 'S1_SPATIAL_PREPARED_INVALID', 'prepared');
  exact(prepared, ['schema', 'request_id', 'causal_request_ref', 'party_id', 'need', 'envelope',
    'code_owned', 'model_request'], 'S1_SPATIAL_PREPARED_INVALID', 'prepared');
  if (prepared.schema !== 'rus.s1_spatial_semantic_prepared.v1') {
    fail('S1_SPATIAL_PREPARED_INVALID', 'Prepared S1 schema is invalid.');
  }
  const rebuilt = prepareSpatialSemanticRemainder({ schema: 'rus.s1_spatial_semantic_request.v1',
    request_id: prepared.request_id, causal_request_ref: prepared.causal_request_ref,
    party_id: prepared.party_id, need: prepared.need, envelope: prepared.envelope });
  if (JSON.stringify(rebuilt) !== JSON.stringify(prepared)) {
    fail('S1_SPATIAL_PREPARED_INVALID', 'Prepared S1 payload was recomposed after validation.');
  }
  return rebuilt;
}

function envelopeOf(value, allowExhausted = false) {
  const envelope = json(value, 'S1_SPATIAL_ENVELOPE_INVALID', 'envelope');
  const keys = ['envelope_ref', 'kind', 'scope_kind', 'mechanics_class', 'baseline_ref', 'g5_ref',
    'g6_ref', 'position_ref', 'property_ref', 'function_ref', 'environment_ref', 'semantic_context',
    'profile_ref', 'profile_version', 'policy_ref', 'policy_version', 'baseline_state_version',
    'g5_state_version', 'g6_state_version', 'position_state_version', 'capacity_total',
    'consumed_count', 'state_version'];
  exact(envelope, keys, 'S1_SPATIAL_ENVELOPE_INVALID', 'envelope');
  for (const key of ['envelope_ref', 'baseline_ref', 'g5_ref', 'g6_ref', 'position_ref',
    'property_ref', 'function_ref', 'environment_ref', 'profile_ref', 'policy_ref']) {
    text(envelope[key], 'S1_SPATIAL_ENVELOPE_INVALID', `envelope.${key}`);
  }
  if (!KINDS.has(envelope.kind) || envelope.scope_kind !== 'current_position_local_reference'
      || envelope.mechanics_class !== 'descriptive_only') {
    fail('S1_SPATIAL_ENVELOPE_INVALID', 'S1 envelope authority is invalid.');
  }
  semanticContext(envelope.semantic_context, envelope.kind);
  for (const key of ['profile_version', 'policy_version', 'capacity_total', 'state_version']) {
    positive(envelope[key], 'S1_SPATIAL_ENVELOPE_INVALID', `envelope.${key}`);
  }
  for (const key of ['baseline_state_version', 'g5_state_version', 'g6_state_version',
    'position_state_version', 'consumed_count']) {
    nonnegative(envelope[key], 'S1_SPATIAL_ENVELOPE_INVALID', `envelope.${key}`);
  }
  if (envelope.consumed_count > envelope.capacity_total
      || (!allowExhausted && envelope.consumed_count === envelope.capacity_total)) {
    fail('S1_SPATIAL_CAPACITY_INVALID', 'S1 envelope has no remaining capacity.');
  }
  return deepFreeze(envelope);
}

function proposalOf(value, prepared) {
  const proposal = json(value, 'S1_SPATIAL_PROPOSAL_INVALID', 'proposal');
  exact(proposal, ['schema', 'request_id', 'name', 'description'],
    'S1_SPATIAL_PROPOSAL_INVALID', 'proposal');
  if (proposal.schema !== 'rus.s1_spatial_semantic_proposal.v1'
      || proposal.request_id !== prepared.request_id) {
    fail('S1_SPATIAL_PROPOSAL_INVALID', 'Proposal does not match prepared S1 request.');
  }
  text(proposal.name, 'S1_SPATIAL_PROPOSAL_INVALID', 'proposal.name');
  text(proposal.description, 'S1_SPATIAL_PROPOSAL_INVALID', 'proposal.description');
  return deepFreeze(proposal);
}

function semanticContext(value, kind) {
  const context = json(value, 'S1_SPATIAL_ENVELOPE_INVALID', 'envelope.semantic_context');
  const keys = ['allowed_kind', 'period', 'region', 'place_type', 'environment',
    'material_culture', 'ordinary_boundary'];
  exact(context, keys, 'S1_SPATIAL_ENVELOPE_INVALID', 'envelope.semantic_context');
  for (const key of keys) text(context[key], 'S1_SPATIAL_ENVELOPE_INVALID',
    `envelope.semantic_context.${key}`);
  if (context.allowed_kind !== kind) {
    fail('S1_SPATIAL_ENVELOPE_INVALID', 'S1 semantic context kind is invalid.');
  }
  return deepFreeze(context);
}

function json(value, code, path) {
  const seen = new Set();
  const visit = (entry, where) => {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return;
    if (typeof entry === 'number') { if (Number.isFinite(entry)) return; fail(code, 'Input must contain finite JSON numbers.', { path: where }); }
    if (typeof entry !== 'object' || seen.has(entry)) fail(code, 'Input must be acyclic JSON data.', { path: where });
    seen.add(entry);
    if (Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== Array.prototype) fail(code, 'Input must use plain JSON containers.', { path: where });
    if (Object.getOwnPropertySymbols(entry).length) fail(code, 'Input must not contain symbols.', { path: where });
    if (Array.isArray(entry)) {
      if (Object.keys(entry).length !== entry.length) fail(code, 'Input arrays must be dense JSON data.', { path: where });
      for (let index = 0; index < entry.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(entry, String(index));
        if (descriptor == null || !('value' in descriptor) || !descriptor.enumerable) {
          fail(code, 'Input must not contain accessor or exotic properties.', { path: `${where}.${index}` });
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
  visit(value, path); return structuredClone(value);
}
function exact(value, keys, code, path) { if (!value || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) fail(code, 'Input has an unsupported shape.', { path }); }
function text(value, code, path) { if (typeof value !== 'string' || value.trim() !== value || value.length === 0) fail(code, 'A non-empty string is required.', { path }); }
function positive(value, code, path) { if (!Number.isSafeInteger(value) || value < 1) fail(code, 'A positive integer is required.', { path }); }
function nonnegative(value, code, path) { if (!Number.isSafeInteger(value) || value < 0) fail(code, 'A non-negative integer is required.', { path }); }
function fail(code, message, details = {}) { throw new MaterializationError(code, message, details); }
