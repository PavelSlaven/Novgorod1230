import { deepFreeze } from '@rus/kernel';

const REQUEST_KEYS = ['schema', 'request_id', 'npc_ref', 'profile_ref',
  'observable_context'];
const CONTEXT_KEYS = ['display_label', 'observable_cues', 'scene_details'];
const PROPOSAL_KEYS = ['schema', 'request_id', 'ordinary_descriptor',
  'ordinary_activity'];
const AUDIT_KEYS = ['schema', 'request_id', 'approved', 'concern_kinds'];
const AUDIT_CONCERNS = new Set(['context_contradiction',
  'forbidden_authority', 'formal_owner_overlap', 'new_entity']);

export function validateNpcOrdinarySemanticRemainderRequest(value) {
  return exact(value, REQUEST_KEYS)
    && value.schema === 'npc_ordinary_semantic_remainder_request_v1'
    && text(value.request_id) && text(value.npc_ref) && text(value.profile_ref)
    && exact(value.observable_context, CONTEXT_KEYS)
    && text(value.observable_context.display_label)
    && plain(value.observable_context.observable_cues)
    && textArray(value.observable_context.scene_details, 8);
}

export function validateNpcOrdinarySemanticRemainderProposal(value, request) {
  return validateNpcOrdinarySemanticRemainderRequest(request)
    && exact(value, PROPOSAL_KEYS)
    && value.schema === 'npc_ordinary_semantic_remainder_proposal_v1'
    && value.request_id === request.request_id
    && boundedText(value.ordinary_descriptor, 240)
    && value.ordinary_activity === null;
}

export function validateNpcOrdinarySemanticRemainderAudit(value, request) {
  return validateNpcOrdinarySemanticRemainderRequest(request)
    && exact(value, AUDIT_KEYS)
    && value.schema === 'npc_ordinary_semantic_remainder_audit_v1'
    && value.request_id === request.request_id
    && typeof value.approved === 'boolean'
    && Array.isArray(value.concern_kinds)
    && new Set(value.concern_kinds).size === value.concern_kinds.length
    && value.concern_kinds.every((kind) => AUDIT_CONCERNS.has(kind))
    && (value.approved ? value.concern_kinds.length === 0
      : value.concern_kinds.length > 0);
}

export function buildNpcOrdinarySemanticRemainder({ request, proposal,
  profileRef, causalBasisRefs, ordinaryActivity }) {
  if (!validateNpcOrdinarySemanticRemainderProposal(proposal, request)
      || profileRef !== request.profile_ref
      || !boundedText(ordinaryActivity, 240)
      || !textArray(causalBasisRefs, 2)
      || causalBasisRefs.length !== 2) fail();
  return deepFreeze({
    schema: 'rus.n1_npc_semantic_remainder.v1',
    version: 1,
    profile_ref: profileRef,
    npc_ref: request.npc_ref,
    ordinary_descriptor: proposal.ordinary_descriptor,
    ordinary_activity: ordinaryActivity,
    causal_basis_refs: structuredClone(causalBasisRefs)
  });
}

export function validateNpcOrdinarySemanticRemainder(value) {
  return exact(value, ['schema', 'version', 'profile_ref', 'npc_ref',
    'ordinary_descriptor', 'ordinary_activity', 'causal_basis_refs'])
    && value.schema === 'rus.n1_npc_semantic_remainder.v1'
    && value.version === 1 && text(value.profile_ref) && text(value.npc_ref)
    && boundedText(value.ordinary_descriptor, 240)
    && boundedText(value.ordinary_activity, 240)
    && textArray(value.causal_basis_refs, 2)
    && value.causal_basis_refs.length === 2;
}

function exact(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
function boundedText(value, max) { return text(value) && value.length <= max; }
function textArray(value, max) {
  return Array.isArray(value) && value.length <= max
    && new Set(value).size === value.length && value.every(text);
}
function fail() {
  throw Object.assign(new Error('NPC_ORDINARY_SEMANTIC_REMAINDER_INVALID'),
    { code: 'NPC_ORDINARY_SEMANTIC_REMAINDER_INVALID' });
}
