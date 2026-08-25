import { buildStage15CandidateIndex } from '../references/indexes.js';

const FIELDS = new Set(['display_name', 'visible_descriptor']);
const REQUEST_SCHEMA = 'stage15_npc_semantic_remainder_request_v1';
const PLAN_SCHEMA = 'stage15_npc_semantic_remainder_plan_v1';

export function buildStage15NpcSemanticRemainderRequest(draft, input) {
  const candidates = buildStage15CandidateIndex(input).byId;
  const npc_remainders = (draft.npc_instances ?? []).flatMap((npc) => {
    const candidate = candidates.get(npc.npc_candidate_id);
    const declared = candidate?.ordinary_semantic_remainder_fields ?? [];
    if (!Array.isArray(declared) || declared.some((field) => !FIELDS.has(field)) || new Set(declared).size !== declared.length) {
      throw semanticRemainderError('NPC_SEMANTIC_REMAINDER_FIELDS_INVALID', 'Candidate declares unsupported ordinary semantic remainder fields.');
    }
    const current = npc.ordinary_semantic ?? {};
    if (!isPlainRecord(current)) throw semanticRemainderError('NPC_SEMANTIC_REMAINDER_STATE_INVALID', 'ordinary_semantic must be a plain object.');
    const allowed_fields = declared.filter((field) => {
      if (!Object.hasOwn(current, field)) return true;
      if (!boundedText(current[field])) throw semanticRemainderError('NPC_SEMANTIC_REMAINDER_STATE_INVALID', `Existing ${field} must be bounded text.`);
      return false;
    });
    return allowed_fields.length === 0 ? [] : [{
      npc_instance_id: npc.npc_instance_id,
      npc_candidate_id: npc.npc_candidate_id,
      allowed_fields,
      formal_facet_snapshot: {
        profile_set_id: npc.profile_set_id ?? null,
        profile_level: npc.profile_level,
        base_refs: structuredClone(npc.base_refs),
        placement: structuredClone(npc.placement),
        visibility_state: structuredClone(npc.visibility_state),
        access_state: structuredClone(npc.access_state ?? {}),
        machine_state: structuredClone(npc.machine_state ?? npc.interaction_state)
      }
    }];
  });
  return { version: 1, schema: REQUEST_SCHEMA, request_id: input.request_id, npc_remainders };
}

export function applyStage15NpcSemanticRemainder(draft, plan, request) {
  const values = validatePlan(plan, request);
  const next = structuredClone(draft);
  const byId = new Map(next.npc_instances.map((npc) => [npc.npc_instance_id, npc]));
  for (const { npc_instance_id, fields } of values) {
    const npc = byId.get(npc_instance_id);
    const current = npc.ordinary_semantic ?? {};
    for (const [field, value] of Object.entries(fields)) {
      if (Object.hasOwn(current, field)) throw semanticRemainderError('NPC_SEMANTIC_REMAINDER_OVERWRITE_FORBIDDEN', `ordinary_semantic.${field} already exists.`);
      current[field] = value;
    }
    npc.ordinary_semantic = current;
  }
  return next;
}

function validatePlan(plan, request) {
  if (!isPlainJson(plan) || !sameKeys(plan, ['version', 'schema', 'request_id', 'npc_remainders'])
    || plan.version !== 1 || plan.schema !== PLAN_SCHEMA || plan.request_id !== request.request_id
    || !Array.isArray(plan.npc_remainders) || plan.npc_remainders.length !== request.npc_remainders.length) {
    throw semanticRemainderError('NPC_SEMANTIC_REMAINDER_PLAN_INVALID', 'Semantic remainder plan shape or request binding is invalid.');
  }
  const expected = new Map(request.npc_remainders.map((value) => [value.npc_instance_id, value.allowed_fields]));
  const seen = new Set();
  return plan.npc_remainders.map((entry) => {
    if (!isPlainRecord(entry) || !sameKeys(entry, ['npc_instance_id', 'fields']) || !expected.has(entry.npc_instance_id) || seen.has(entry.npc_instance_id) || !isPlainRecord(entry.fields)) {
      throw semanticRemainderError('NPC_SEMANTIC_REMAINDER_PLAN_INVALID', 'Semantic remainder plan has an unknown or duplicate NPC entry.');
    }
    seen.add(entry.npc_instance_id);
    const fields = expected.get(entry.npc_instance_id);
    if (!sameKeys(entry.fields, fields) || !fields.every((field) => boundedText(entry.fields[field]))) {
      throw semanticRemainderError('NPC_SEMANTIC_REMAINDER_PLAN_INVALID', 'Semantic remainder fields must exactly match requested bounded text fields.');
    }
    return { npc_instance_id: entry.npc_instance_id, fields: structuredClone(entry.fields) };
  });
}

function boundedText(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 160; }
function sameKeys(value, keys) { const actual = Object.keys(value).sort(); return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]); }
function isPlainRecord(value) { const prototype = value != null && typeof value === 'object' ? Object.getPrototypeOf(value) : null; return prototype === Object.prototype || prototype === null; }
function isPlainJson(value) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isPlainJson);
  if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length > 0) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => 'value' in descriptor && isPlainJson(descriptor.value));
}
function semanticRemainderError(code, message) { return Object.assign(new Error(message), { code }); }
