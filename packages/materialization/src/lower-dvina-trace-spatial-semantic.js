import { deepFreeze } from '@rus/kernel';
import { MaterializationError } from './core.js';
import { materializeS1FormalSpatialProposal } from './spatial-v3.js';
export { materializeS1FormalSpatialProposal } from './spatial-v3.js';

const KINDS = new Set(['ordinary_structure', 'local_natural_feature']);
const NEEDS = new Set(['interaction', 'projection', 'perception']);
const REQUIREMENTS = new Set(['interior_space', 'controlled_passage', 'movement_constraint',
  'hazard', 'extractable_resource']);
const STRUCTURAL_REQUIREMENTS = Object.freeze({
  open_one_space: new Set(['interior_space']),
  one_space_controlled_passage: new Set(['interior_space', 'controlled_passage']),
  descriptive_local_reference: new Set()
});

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
  assertSpatialSemanticStructuralVariantAdmitted(envelope.structural_variant);
  const semantic_context = structuredClone(envelope.semantic_context);
  const approved_envelope = {
    kind: envelope.kind, structural_variant: envelope.structural_variant,
    available_mechanics: structuredClone(envelope.available_mechanics)
  };
  const code_owned = { envelope: structuredClone(envelope), local_ref: `s1-local:${value.request_id}` };
  const model_request = {
    schema: 'rus.s1_spatial_semantic_model_request.v1', request_id: value.request_id,
    proposal_schema: 'rus.s1_spatial_semantic_proposal.v1', semantic_context, approved_envelope,
    proposal_example: { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: value.request_id,
      name: 'ordinary local reference', description: 'ordinary local description',
      semantic_requirements: [] }
  };
  return deepFreeze({ schema: 'rus.s1_spatial_semantic_prepared.v1', request_id: value.request_id,
    causal_request_ref: value.causal_request_ref, party_id: value.party_id, need: value.need,
    envelope, code_owned, model_request });
}

export function admitSpatialSemanticRemainder({ prepared, proposal }) {
  const safePrepared = preparedOf(prepared);
  const safeProposal = proposalOf(proposal, safePrepared);
  const { envelope, local_ref } = safePrepared.code_owned;
  assertSpatialSemanticRequirementsAdmitted({
    semantic_requirements: safeProposal.semantic_requirements,
    structural_variant: envelope.structural_variant,
    available_mechanics: envelope.available_mechanics
  });
  const formal = materializeS1FormalSpatialProposal({ party_id: safePrepared.party_id,
    request_id: safePrepared.request_id, local_ref, kind: envelope.kind,
    structural_variant: envelope.structural_variant, baseline_ref: envelope.baseline_ref,
    g5_ref: envelope.g5_ref, position_ref: envelope.position_ref });
  if (!formal.ok) fail('S1_SPATIAL_DATA_GAP', 'S1 formal spatial data is unavailable.');
  return deepFreeze({ schema: 'rus.s1_spatial_semantic_resolution.v1',
    request_id: safePrepared.request_id, causal_request_ref: safePrepared.causal_request_ref,
    party_id: safePrepared.party_id, local_ref, envelope_ref: envelope.envelope_ref,
    position_ref: envelope.position_ref,
    outcome: { name: safeProposal.name, description: safeProposal.description,
      semantic_requirements: safeProposal.semantic_requirements }, materialized: true,
    formal_spatial_refs: structuredClone(formal.proposal.refs),
    formal_spatial_proposal: formal.proposal });
}

export function assertSpatialSemanticRequirementsAdmitted({ semantic_requirements,
  structural_variant, available_mechanics }) {
  if (!Object.hasOwn(STRUCTURAL_REQUIREMENTS, structural_variant)
      || !Array.isArray(available_mechanics)
      || new Set(available_mechanics).size !== available_mechanics.length
      || !available_mechanics.every((requirement) => REQUIREMENTS.has(requirement))
      || !Array.isArray(semantic_requirements)
      || new Set(semantic_requirements).size !== semantic_requirements.length
      || !semantic_requirements.every((requirement) => REQUIREMENTS.has(requirement))) {
    fail('S1_SPATIAL_ADMISSION_INVALID', 'S1 admission context is invalid.');
  }
  for (const requirement of semantic_requirements) {
    if (STRUCTURAL_REQUIREMENTS[structural_variant]?.has(requirement)) continue;
    if (requirement === 'interior_space' || requirement === 'controlled_passage') {
      fail('S1_SPATIAL_DATA_GAP', 'S1 requirement has no approved structural data.', { requirement });
    }
    if (!available_mechanics.includes(requirement)) {
      fail('S1_SPATIAL_MECHANICS_GAP', 'S1 requirement has no approved mechanic.', { requirement });
    }
    fail('S1_SPATIAL_DATA_GAP', 'S1 requirement has no approved structural data.', { requirement });
  }
}

// Controlled passages need a portal condition/profile owner that this M12
// profile does not bind. Do not send an unusable variant to model or P16.
export function assertSpatialSemanticStructuralVariantAdmitted(structural_variant) {
  if (structural_variant === 'one_space_controlled_passage') {
    fail('S1_SPATIAL_DATA_GAP', 'S1 controlled passage has no approved portal condition profile.');
  }
}

export function normalizeSpatialSemanticEnvelope(value, { allowExhausted = false } = {}) {
  return envelopeOf(value, allowExhausted);
}

export function validateSpatialSemanticResolution(value) {
  return validateResolution(value, true);
}
export function validateSpatialSemanticCandidate(value) {
  return validateResolution(value, false);
}
function validateResolution(value, final) {
  const resolution = json(value, 'S1_SPATIAL_RESOLUTION_INVALID', 'resolution');
  exact(resolution, ['schema', 'request_id', 'causal_request_ref', 'party_id', 'local_ref',
    'envelope_ref', 'position_ref', 'outcome', 'materialized', 'formal_spatial_refs',
    'formal_spatial_proposal'],
  'S1_SPATIAL_RESOLUTION_INVALID', 'resolution');
  if (resolution.schema !== 'rus.s1_spatial_semantic_resolution.v1') {
    fail('S1_SPATIAL_RESOLUTION_INVALID', 'S1 resolution schema is invalid.');
  }
  for (const key of ['request_id', 'causal_request_ref', 'party_id', 'envelope_ref', 'position_ref']) {
    text(resolution[key], 'S1_SPATIAL_RESOLUTION_INVALID', `resolution.${key}`);
  }
  if (resolution.local_ref !== `s1-local:${resolution.request_id}`) {
    fail('S1_SPATIAL_RESOLUTION_INVALID', 'S1 local ref is invalid.');
  }
  proposalOf({ schema: 'rus.s1_spatial_semantic_proposal.v1',
    request_id: resolution.request_id, ...json(resolution.outcome,
      'S1_SPATIAL_RESOLUTION_INVALID', 'resolution.outcome') }, { request_id: resolution.request_id });
  if (resolution.materialized !== true) fail('S1_SPATIAL_RESOLUTION_INVALID', 'S1 materialization is invalid.');
  formalSpatialRefs(resolution.formal_spatial_refs, final);
  formalSpatialProposal(resolution.formal_spatial_proposal, resolution.formal_spatial_refs);
  return deepFreeze(resolution);
}

function formalSpatialProposal(value, refs) {
  const proposal = json(value, 'S1_SPATIAL_RESOLUTION_INVALID', 'resolution.formal_spatial_proposal');
  exact(proposal, ['schema', 'refs', 'rows'], 'S1_SPATIAL_RESOLUTION_INVALID',
    'resolution.formal_spatial_proposal');
  if (proposal.schema !== 'rus.s1_formal_spatial_proposal.v1'
      || JSON.stringify(proposal.refs) !== JSON.stringify(refs)
      || !Array.isArray(proposal.rows) || proposal.rows.length === 0) {
    fail('S1_SPATIAL_RESOLUTION_INVALID', 'S1 formal spatial proposal is invalid.');
  }
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
  const keys = ['envelope_ref', 'kind', 'scope_kind', 'structural_variant', 'available_mechanics', 'baseline_ref', 'g5_ref',
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
      || !Object.hasOwn(STRUCTURAL_REQUIREMENTS, envelope.structural_variant)
      || !Array.isArray(envelope.available_mechanics)
      || new Set(envelope.available_mechanics).size !== envelope.available_mechanics.length
      || !envelope.available_mechanics.every((requirement) => REQUIREMENTS.has(requirement))) {
    fail('S1_SPATIAL_ENVELOPE_INVALID', 'S1 envelope authority is invalid.');
  }
  if ((envelope.kind === 'ordinary_structure')
    !== (envelope.structural_variant !== 'descriptive_local_reference')) {
    fail('S1_SPATIAL_ENVELOPE_INVALID', 'S1 kind and structural variant are incompatible.');
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
  exact(proposal, ['schema', 'request_id', 'name', 'description', 'semantic_requirements'],
    'S1_SPATIAL_PROPOSAL_INVALID', 'proposal');
  if (proposal.schema !== 'rus.s1_spatial_semantic_proposal.v1'
      || proposal.request_id !== prepared.request_id) {
    fail('S1_SPATIAL_PROPOSAL_INVALID', 'Proposal does not match prepared S1 request.');
  }
  text(proposal.name, 'S1_SPATIAL_PROPOSAL_INVALID', 'proposal.name');
  text(proposal.description, 'S1_SPATIAL_PROPOSAL_INVALID', 'proposal.description');
  if (!Array.isArray(proposal.semantic_requirements)
      || new Set(proposal.semantic_requirements).size !== proposal.semantic_requirements.length
      || !proposal.semantic_requirements.every((requirement) => REQUIREMENTS.has(requirement))) {
    fail('S1_SPATIAL_PROPOSAL_INVALID', 'S1 proposal requirements are invalid.');
  }
  return deepFreeze(proposal);
}

function formalSpatialRefs(value) {
  const refs = json(value, 'S1_SPATIAL_RESOLUTION_INVALID', 'resolution.formal_spatial_refs');
  const keys = ['schema', 'status', 'structural_variant', 'local_ref', 'placement_ref',
    'g6_instance_ref', 'position_ref', 'portal_ref', 'movement_edge_refs', 'visibility_link_refs'];
  exact(refs, keys, 'S1_SPATIAL_RESOLUTION_INVALID', 'resolution.formal_spatial_refs');
  if (refs.schema !== 'rus.s1_formal_spatial_refs.v1' || refs.status !== 'materialized'
      || !Object.hasOwn(STRUCTURAL_REQUIREMENTS, refs.structural_variant)
      || ![refs.local_ref, refs.placement_ref].every((value) => typeof value === 'string' && value.length > 0)
      || !Array.isArray(refs.movement_edge_refs) || !Array.isArray(refs.visibility_link_refs)
      || ![...refs.movement_edge_refs, ...refs.visibility_link_refs].every((value) => typeof value === 'string' && value.length > 0)) {
    fail('S1_SPATIAL_RESOLUTION_INVALID', 'S1 formal spatial refs are invalid.');
  }
  const structural = refs.structural_variant !== 'descriptive_local_reference';
  if (structural !== (typeof refs.g6_instance_ref === 'string' && typeof refs.position_ref === 'string')
      || (refs.structural_variant === 'one_space_controlled_passage')
        !== (typeof refs.portal_ref === 'string')
      || (!structural && (refs.portal_ref !== null || refs.movement_edge_refs.length !== 0 || refs.visibility_link_refs.length !== 0))
      || (structural && (refs.movement_edge_refs.length !== 2 || refs.visibility_link_refs.length !== 2))) {
    fail('S1_SPATIAL_RESOLUTION_INVALID', 'S1 formal spatial refs are invalid.');
  }
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
