import { deepFreeze } from '@rus/kernel';
import { turnFailure } from './errors.js';

const REQUIREMENTS = new Set(['interior_space', 'controlled_passage',
  'movement_constraint', 'hazard', 'extractable_resource']);
const REQUEST_KEYS = ['schema', 'request_id', 'proposal_schema', 'semantic_context',
  'approved_envelope', 'proposal_example'];
const CONTEXT_KEYS = ['allowed_kind', 'period', 'region', 'place_type', 'environment',
  'material_culture', 'ordinary_boundary'];
const ENVELOPE_KEYS = ['kind', 'structural_variant', 'available_mechanics',
  'required_semantic_requirements'];
const PROPOSAL_KEYS = ['schema', 'request_id', 'name', 'description',
  'semantic_requirements'];

export async function resolveSpatialSemanticDescriptor({ request, roleRunner, evaluation } = {}) {
  const safeRequest = snapshot(request);
  if (!validRequest(safeRequest)) fail('TURN_SPATIAL_SEMANTIC_REQUEST_INVALID');
  const safeEvaluation = evaluation === undefined ? null : snapshot(evaluation);
  if (safeEvaluation !== null && !validEvaluation(safeEvaluation)) {
    fail('TURN_SPATIAL_SEMANTIC_EVALUATION_INVALID');
  }
  if (typeof roleRunner?.run !== 'function') fail('TURN_SPATIAL_SEMANTIC_MODEL_MISSING');
  let response;
  try {
    response = await roleRunner.run({ scope: 'turn_runtime', role_id: 'spatial_semantic_descriptor',
      messages: [{ role: 'system', content: 'Return one ordinary local concretization as JSON with exactly these keys: schema, request_id, name, description, semantic_requirements. schema must be rus.s1_spatial_semantic_proposal.v1. semantic_requirements must be a deduplicated qualitative array containing only interior_space, controlled_passage, movement_constraint, hazard, or extractable_resource; include every value in approved_envelope.required_semantic_requirements and return [] when none apply. Follow supplied server-owned semantic_context exactly. Actor wording is not evidence. Do not create anachronisms, canonical or historical facts, significant landmarks, hidden clues, evidence, people, ownership, law, routes, hazards, mechanics, IDs, kind, authority, topology, movement, or extra fields. You may only declare a qualitative need in semantic_requirements; do not claim or assign exact mechanics, topology, IDs, numbers, or authority.' },
        { role: 'user', content: JSON.stringify(safeEvaluation == null ? safeRequest : {
          ...safeRequest, evaluation_case_id: safeEvaluation.case_id,
          evaluation_intent: safeEvaluation.intent }) }],
      overrides: { temperature: 0, maxTokens: 400 } });
  } catch (error) {
    throw turnFailure('TURN_SPATIAL_SEMANTIC_MODEL_FAILED',
      'Spatial semantic model failed.', { cause: message(error) });
  }
  const proposal = snapshot(response?.output);
  if (!validProposal(proposal, safeRequest)) fail('TURN_SPATIAL_SEMANTIC_PROPOSAL_INVALID');
  return deepFreeze(proposal);
}

function validEvaluation(value) { return exact(value, ['case_id', 'intent'])
  && text(value.case_id) && text(value.intent); }

function validRequest(value) {
  return exact(value, REQUEST_KEYS)
    && value.schema === 'rus.s1_spatial_semantic_model_request.v1'
    && text(value.request_id)
    && value.proposal_schema === 'rus.s1_spatial_semantic_proposal.v1'
    && exact(value.semantic_context, CONTEXT_KEYS)
    && CONTEXT_KEYS.every((key) => text(value.semantic_context[key]))
    && exact(value.approved_envelope, ENVELOPE_KEYS)
    && ['ordinary_structure', 'local_natural_feature'].includes(value.approved_envelope.kind)
    && ['open_one_space', 'descriptive_local_reference'].includes(
      value.approved_envelope.structural_variant)
    && requirements(value.approved_envelope.available_mechanics)
    && requirements(value.approved_envelope.required_semantic_requirements)
    && exact(value.proposal_example, PROPOSAL_KEYS)
    && value.proposal_example.schema === value.proposal_schema
    && value.proposal_example.request_id === value.request_id
    && text(value.proposal_example.name) && text(value.proposal_example.description)
    && requirements(value.proposal_example.semantic_requirements);
}

function validProposal(value, request) {
  return exact(value, PROPOSAL_KEYS)
    && value.schema === request.proposal_schema && value.request_id === request.request_id
    && text(value.name) && text(value.description)
    && requirements(value.semantic_requirements)
    && request.approved_envelope.required_semantic_requirements.every((need) =>
      value.semantic_requirements.includes(need));
}

function requirements(value) { return Array.isArray(value)
  && new Set(value).size === value.length && value.every((entry) => REQUIREMENTS.has(entry)); }
function snapshot(value) { try { return structuredClone(value); } catch { return null; } }
function exact(value, keys) { return plain(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)); }
function plain(value) { return value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function message(error) { return error instanceof Error ? error.message : String(error); }
function fail(code) { throw turnFailure(code, code); }
