import { deepFreeze } from '@rus/kernel';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';

export { projectConversationAudience } from './conversation-audience.js';

export const VISIBLE_PACKAGE_KEYS = deepFreeze(['version','schema','visible_scene','visible_changes','sensory_details','visible_npc','visible_objects','known_context','uncertainties','allowed_tensions','do_not_imply']);
const FORBIDDEN_KEYS = ['hidden_state','hidden','secret','sourceDossier','audit','state_delta','dossier','witnesses','objectiveMap','requestRaw','responseRaw','world'];

export function detectHiddenLeaks(value) {
  const leaks = [];
  visit(value, [], leaks);
  const serialized = JSON.stringify(value ?? '').toLowerCase();
  if (/hidden_sentinel|op\d+_hidden_sentinel/iu.test(serialized)) leaks.push('hidden_sentinel');
  return deepFreeze([...new Set(leaks)]);
}

export function stripHiddenForNarrator(data = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return deepFreeze({});
  const clone = structuredClone(data);
  removeForbidden(clone);
  return deepFreeze(clone);
}

export function validateVisibleContext(data = {}) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok:false, errors:['visible context must be an object'] };
  if (data.version !== 1) errors.push('version must be 1');
  if (data.schema !== 'visible_context_package') errors.push('schema must be visible_context_package');
  if (!text(data.visible_scene)) errors.push('visible_scene is required');
  for (const key of Object.keys(data)) if (!VISIBLE_PACKAGE_KEYS.includes(key)) errors.push(`forbidden key: ${key}`);
  for (const leak of detectHiddenLeaks(data)) errors.push(`hidden leak: ${leak}`);
  return { ok:errors.length === 0, errors };
}

export function mergeKnowledgeFacts(current = [], updates = []) {
  const map = new Map();
  for (const fact of [...(Array.isArray(current) ? current : []), ...(Array.isArray(updates) ? updates : [])]) {
    if (!fact || typeof fact !== 'object') continue;
    const id = text(fact.id);
    if (!id) continue;
    map.set(id, structuredClone(fact));
  }
  return deepFreeze([...map.values()].sort((left, right) => text(left.id).localeCompare(text(right.id), 'en')));
}

export function validateMemoryFact(fact = {}) {
  const errors = [];
  if (!text(fact.id)) errors.push('memory fact id is required');
  if (!text(fact.type)) errors.push('memory fact type is required');
  if (!text(fact.summary)) errors.push('memory fact summary is required');
  if (!['known','rumor','belief','observation','obligation'].includes(text(fact.knowledge_status))) errors.push('memory fact knowledge_status is invalid');
  if (detectHiddenLeaks(fact).length) errors.push('memory fact contains hidden data');
  return { ok:errors.length === 0, errors };
}

export function buildSafeNarratorPackage(visible = {}) {
  const safe = stripHiddenForNarrator(visible);
  const validation = validateVisibleContext(safe);
  if (!validation.ok) return deepFreeze({ ok:false, errors:validation.errors, package:null });
  return deepFreeze({ ok:true, errors:[], package:safe });
}

/**
 * Builds the persisted player-safe envelope from an already code-owned
 * candidate projection. It validates but never invents objective world facts.
 */
export function buildPlayerSafeVisiblePackageEnvelope({
  package_id,
  party_id,
  turn_id,
  committed_state_version,
  change_set_id,
  visible_payload,
  projection_policy_ref,
  dependency_pins,
  idempotency_record_id
} = {}) {
  const failure = (error_code, message) => deepFreeze({
    ok: false,
    error_code,
    errors: [message],
    envelope: null
  });
  if (!visible_payload || typeof visible_payload !== 'object'
    || Array.isArray(visible_payload)
    || detectHiddenLeaks(visible_payload).length > 0) {
    return failure(
      'hidden_information_leak',
      'player-safe projection contains forbidden hidden information'
    );
  }
  const envelope = {
    package_id,
    party_id,
    turn_id,
    committed_state_version,
    change_set_id,
    package_digest: computeSpatialV3CanonicalDigest(visible_payload),
    visible_payload: structuredClone(visible_payload),
    presentation_status: 'pending',
    projection_policy_ref,
    dependency_pins,
    idempotency_record_id
  };
  const errors = validateSpatialV3Contract(
    'visible_package_persistence_envelope',
    envelope
  );
  if (errors.length > 0) {
    return failure(
      errors[0].code,
      `visible package envelope is invalid: ${errors[0].message}`
    );
  }
  return deepFreeze({ ok: true, error_code: null, errors: [], envelope });
}

export function mergeValidatedKnowledgeMemory({
  current_facts = [],
  current_hypotheses = [],
  proposal,
  source_perception = null,
  received_message_ref = null
} = {}) {
  const failure = (error) => deepFreeze({
    ok: false,
    errors: [error],
    state: null
  });
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)
    || !Array.isArray(proposal.facts) || !Array.isArray(proposal.hypotheses)
    || !text(proposal.source_perception_id)
    || proposal.facts.some((fact) => !validateMemoryFact(fact).ok)
    || proposal.hypotheses.some((fact) => !validateMemoryFact(fact).ok)) {
    return failure('knowledge proposal is malformed or contains hidden data');
  }
  const hasPerception = source_perception !== null
    && validateSpatialV3Contract('perception_result', source_perception).length === 0
    && source_perception.perception_id === proposal.source_perception_id;
  const hasMessage = received_message_ref !== null
    && typeof received_message_ref === 'object'
    && text(received_message_ref.entity_kind)
    && text(received_message_ref.entity_id);
  if (!hasPerception && !hasMessage) {
    return failure('knowledge update requires a matching perception or received message');
  }
  if (hasPerception && source_perception.result === 'not_perceived'
    && (proposal.facts.length || proposal.hypotheses.length)) {
    return failure('not_perceived cannot grant knowledge or memory');
  }
  if (hasPerception && source_perception.result === 'misinterpreted'
    && proposal.facts.length) {
    return failure('misinterpreted perception may create hypotheses only');
  }
  const facts = mergeKnowledgeFacts(current_facts, proposal.facts);
  const hypotheses = mergeKnowledgeFacts(current_hypotheses, proposal.hypotheses);
  return deepFreeze({
    ok: true,
    errors: [],
    state: { facts, hypotheses },
    source: hasPerception ? 'perception' : 'received_message'
  });
}

const entityRefKey = (value) =>
  `${text(value?.entity_kind)}\u0000${text(value?.entity_id)}`;

function validCanonicalRefSet(values) {
  return Array.isArray(values)
    && values.every((value) =>
      value && typeof value === 'object' && !Array.isArray(value)
      && text(value.entity_kind) && text(value.entity_id))
    && new Set(values.map(entityRefKey)).size === values.length
    && values.every((value, index) =>
      index === 0 || entityRefKey(values[index - 1]).localeCompare(entityRefKey(value), 'en') < 0);
}

function unionCanonicalRefs(left, right) {
  const byKey = new Map([...left, ...right].map((value) => [
    entityRefKey(value),
    structuredClone(value)
  ]));
  return [...byKey.values()].sort((a, b) =>
    entityRefKey(a).localeCompare(entityRefKey(b), 'en'));
}

export function mergeFormalKnowledgeMemory({
  proposal,
  state_before_fact_refs = [],
  state_before_hypothesis_refs = [],
  state_version_before
} = {}) {
  const failure = (error_code, message) => deepFreeze({
    ok: false,
    error_code,
    errors: [message],
    result: null
  });
  const proposalErrors = validateSpatialV3Contract(
    'knowledge_memory_delta_proposal',
    proposal
  );
  if (proposalErrors.length > 0) {
    return failure(
      proposalErrors[0].code,
      'knowledge delta proposal is not a complete formal causal input'
    );
  }
  if (!validCanonicalRefSet(state_before_fact_refs)
    || !validCanonicalRefSet(state_before_hypothesis_refs)
    || state_before_fact_refs.some((fact) =>
      state_before_hypothesis_refs.some((hypothesis) =>
        entityRefKey(fact) === entityRefKey(hypothesis)))) {
    return failure(
      'temporal_change_set_conflict',
      'sealed knowledge state-before references must be unique, ordered and disjoint'
    );
  }
  const expectedVersion = proposal.expected_state_versions.entries.find(
    ({ entity_ref }) => entityRefKey(entity_ref) === entityRefKey(proposal.owner_ref)
  )?.state_version;
  if (!Number.isInteger(state_version_before)
    || state_version_before < 1
    || expectedVersion !== state_version_before) {
    return failure(
      'activity_precondition_stale',
      'knowledge state version changed before deterministic merge'
    );
  }

  const acceptedFactRefs = unionCanonicalRefs(
    state_before_fact_refs,
    proposal.fact_refs
  );
  const acceptedHypothesisRefs = unionCanonicalRefs(
    state_before_hypothesis_refs,
    proposal.hypothesis_refs
  );
  if (acceptedFactRefs.some((fact) =>
    acceptedHypothesisRefs.some((hypothesis) =>
      entityRefKey(fact) === entityRefKey(hypothesis)))) {
    return failure(
      'temporal_change_set_conflict',
      'knowledge merge cannot classify the same reference as fact and hypothesis'
    );
  }
  const stateChanged = JSON.stringify(acceptedFactRefs) !== JSON.stringify(state_before_fact_refs)
    || JSON.stringify(acceptedHypothesisRefs) !== JSON.stringify(state_before_hypothesis_refs);
  const payload = {
    proposal_id: proposal.proposal_id,
    owner_ref: proposal.owner_ref,
    source_ref: proposal.source_ref,
    state_version_before,
    state_version_after: state_version_before + (stateChanged ? 1 : 0),
    state_changed: stateChanged,
    dependency_pins: proposal.dependency_pins,
    proposal,
    state_before_fact_refs,
    state_before_hypothesis_refs,
    accepted_fact_refs: acceptedFactRefs,
    accepted_hypothesis_refs: acceptedHypothesisRefs
  };
  const result = {
    ...payload,
    result_digest: computeSpatialV3CanonicalDigest(payload)
  };
  const resultErrors = validateSpatialV3Contract(
    'knowledge_memory_merge_result',
    result
  );
  if (resultErrors.length > 0) {
    return failure(
      resultErrors[0].code,
      'knowledge owner produced a non-formal deterministic merge result'
    );
  }
  return deepFreeze({ ok: true, error_code: null, errors: [], result });
}

function visit(value, path, leaks) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((entry, index) => visit(entry, [...path, index], leaks)); return; }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.some((token) => key.toLowerCase() === token.toLowerCase())) leaks.push([...path, key].join('.'));
    visit(child, [...path, key], leaks);
  }
}
function removeForbidden(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const item of value) removeForbidden(item); return; }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.some((token) => key.toLowerCase() === token.toLowerCase())) delete value[key];
    else removeForbidden(value[key]);
  }
}
function text(value) { return String(value ?? '').trim(); }
