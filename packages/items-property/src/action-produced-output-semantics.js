import { deepFreeze } from '@rus/kernel';
import { snapshotActionProducedBoundary as snapshot } from
  './action-produced-transition-boundary.js';
import { validateActionProducedOutputAuthority } from
  './action-produced-output-authority.js';
import { validateActionProducedOutputClass } from
  './action-produced-output-class.js';

const INPUT_KEYS = ['transition_proposal'];
const PROPOSAL_KEYS = [
  'schema', 'version', 'causal_identity', 'context_pin',
  'technical_policy_pin', 'identity_mode', 'origin', 'result_class',
  'source_transitions', 'tool_state_pins', 'results', 'known_waste',
  'qualitative_result'
];
const CAUSAL_KEYS = ['request_id', 'root_turn_id', 'action_ref', 'step_index'];
const CONTEXT_KEYS = [
  'context_ref', 'context_state_version', 'profile_ref', 'profile_version'
];
const TECHNICAL_KEYS = ['policy_ref', 'version', 'max_new_entities'];
const QUALITATIVE_KEYS = [
  'intended_transformation', 'material_extent', 'result_descriptor',
  'output_class'
];
const DESCRIPTOR_KEYS = [
  'display_name', 'physical_description', 'qualitative_facts',
  'inscription_text', 'physical_form', 'source_fact_delta'
];
const RESULT_KEYS = [
  'entity_ref', 'identity_kind', 'source_ref', 'mechanics_snapshot',
  'holder_ref', 'controller_ref', 'physical_facts', 'inscription_text',
  'output_authority'
];
const RESULT_CLASSES = new Set([
  'ordinary_physical_result', 'partial_transformation',
  'nonworking_construction', 'waste', 'written_carrier',
  'no_useful_result'
]);

export function admitActionProducedOutputSemantics(value) {
  const input = snapshot(value);
  if (!exact(input, INPUT_KEYS)) return failed('BOUNDARY_INVALID');
  const proposal = input.transition_proposal;
  if (!validProposal(proposal)) return failed('PROPOSAL_INVALID');
  const outputClass = proposal.qualitative_result.output_class;
  if (!compatible(proposal, outputClass)) {
    return failed('CLASSIFICATION_INCOMPATIBLE');
  }
  return deepFreeze({
    pass: true,
    handoff: {
      schema: 'rus.items.action_produced_output_semantics_handoff.v1',
      status: 'non_authoritative_physical_classification',
      causal_identity: structuredClone(proposal.causal_identity),
      context_pin: structuredClone(proposal.context_pin),
      technical_policy_pin: structuredClone(proposal.technical_policy_pin),
      result_refs: proposal.results.map(({ entity_ref: ref }) => ref),
      output_class: outputClass,
      class_semantics: semantics(proposal, outputClass)
    },
    errors: []
  });
}

export function mergeActionProducedPhysicalFacts({ entity_ref: entityRef,
  action_ref: actionRef, existing = [], physical_description: description,
  physical_facts: facts, removed_fact_refs: removedRefs = [],
  inscription_text: inscription = null }) {
  if (!text(entityRef) || !text(actionRef) || !Array.isArray(existing)
      || !Array.isArray(facts) || !facts.every(text)
      || !Array.isArray(removedRefs) || !removedRefs.every(text)
      || new Set(removedRefs).size !== removedRefs.length
      || !(description === null || text(description))
      || !(inscription === null || text(inscription))) failFacts();
  const output = [];
  const ids = new Set();
  const texts = new Set();
  const removed = new Set(removedRefs);
  for (const [index, value] of existing.entries()) {
    const fact = typeof value === 'string'
      ? { fact_id: `${entityRef}:fact:${index + 1}`, text: value,
          operation_id: null }
      : value;
    if (!text(fact?.fact_id) || !text(fact?.text)
        || !(fact.operation_id === null || text(fact.operation_id))
        || ids.has(fact.fact_id)) failFacts();
    ids.add(fact.fact_id);
    if (removed.has(fact.fact_id)) {
      removed.delete(fact.fact_id);
      continue;
    }
    texts.add(fact.text);
    output.push(structuredClone(fact));
  }
  if (removed.size !== 0) failFacts();
  const added = [...(description === null ? [] : [description]), ...facts];
  for (const [index, factText] of added.entries()) {
    if (texts.has(factText)) continue;
    let factId = `${actionRef}:fact:${index + 1}`;
    if (ids.has(factId)) factId = `${factId}:${output.length + 1}`;
    ids.add(factId);
    texts.add(factText);
    output.push({ fact_id: factId, text: factText, operation_id: actionRef });
  }
  if (inscription !== null && !texts.has(inscription)) {
    let factId = `${actionRef}:inscription`;
    if (ids.has(factId)) factId = `${factId}:${output.length + 1}`;
    output.push({ fact_id: factId, text: inscription,
      operation_id: actionRef });
  }
  return deepFreeze(output);
}

export function actionProducedPhysicalFactTexts(values) {
  if (!Array.isArray(values)) return [];
  const result = values.map((value) => typeof value === 'string'
    ? value : value?.text).filter(text);
  return [...new Set(result)];
}

function semantics(proposal, outputClass) {
  if (outputClass === 'weapon_capable') {
    return {
      schema: 'rus.items.action_produced_weapon_capable_semantics.v1',
      domain_owner: 'combat',
      domain_classification_status: 'pending_domain_classification'
    };
  }
  if (outputClass === 'money_like_token') {
    return {
      schema: 'rus.items.action_produced_money_like_token_semantics.v1',
      currency_status: 'not_currency',
      legal_tender_status: 'not_legal_tender',
      official_status: 'not_official'
    };
  }
  if (outputClass === 'written_carrier') {
    return {
      schema: 'rus.items.action_produced_written_carrier_semantics.v1',
      physical_inscriptions: proposal.results.map((result) => ({
        carrier_ref: result.entity_ref,
        inscription_text: result.inscription_text
      }))
    };
  }
  return { schema: 'rus.items.action_produced_ordinary_mundane_semantics.v1' };
}

function validProposal(value) {
  if (!exact(value, PROPOSAL_KEYS)
      || value.schema !== 'rus.items.action_produced_transition_proposal.v1'
      || value.version !== 1
      || !validCausal(value.causal_identity)
      || !validContext(value.context_pin)
      || !validTechnical(value.technical_policy_pin)
      || !['preserve_source', 'independent_outputs'].includes(
        value.identity_mode)
      || value.origin !== null
        && !['direct_partition', 'crafted'].includes(value.origin)
      || !RESULT_CLASSES.has(value.result_class)
      || value.result_class === 'no_useful_result'
      || !Array.isArray(value.source_transitions)
      || !Array.isArray(value.tool_state_pins)
      || !Array.isArray(value.known_waste)
      || !validQualitative(value.qualitative_result, value)
      || !validateActionProducedOutputClass(
        value.qualitative_result.output_class,
        value.result_class, value.identity_mode)
      || !Array.isArray(value.results) || value.results.length === 0
      || !value.results.every(validResult)) return false;
  const refs = value.results.map(({ entity_ref: ref }) => ref);
  if (new Set(refs).size !== refs.length) return false;
  if (value.identity_mode === 'preserve_source') {
    return value.results.length === 1
      && value.results[0].identity_kind === 'preserved_source'
      && value.results[0].entity_ref === value.results[0].source_ref;
  }
  return value.results.every((result) =>
    result.identity_kind === 'independent_output'
      && Array.isArray(result.material_allocations));
}

function validCausal(value) {
  return exact(value, CAUSAL_KEYS) && text(value.request_id)
    && text(value.root_turn_id) && text(value.action_ref)
    && Number.isSafeInteger(value.step_index)
    && value.step_index >= 1 && value.step_index <= 8;
}
function validContext(value) {
  return exact(value, CONTEXT_KEYS) && CONTEXT_KEYS.every((key) =>
    text(value[key]));
}
function validTechnical(value) {
  return exact(value, TECHNICAL_KEYS) && text(value.policy_ref)
    && value.version === 1 && Number.isSafeInteger(value.max_new_entities)
    && value.max_new_entities >= 1 && value.max_new_entities <= 8;
}
function validQualitative(value, proposal) {
  return exact(value, QUALITATIVE_KEYS)
    && text(value.intended_transformation)
    && (proposal.identity_mode === 'preserve_source'
      ? proposal.source_transitions.length > 1
        ? ['minor', 'half', 'major', 'whole'].includes(value.material_extent)
        : value.material_extent === null
      : proposal.identity_mode !== 'independent_outputs'
      ? value.material_extent === null
      : proposal.result_class === 'partial_transformation'
        ? ['minor', 'half', 'major'].includes(value.material_extent)
        : value.material_extent === 'whole')
    && exact(value.result_descriptor, descriptorKeys(value.result_descriptor))
    && nullableText(value.result_descriptor.display_name)
    && nullableText(value.result_descriptor.physical_description)
    && (value.result_descriptor.physical_form === null
      || ['compact', 'regular', 'long', 'bulky'].includes(
        value.result_descriptor.physical_form))
    && textArray(value.result_descriptor.qualitative_facts)
    && (!Object.hasOwn(value.result_descriptor,
      'removed_physical_fact_refs')
      || textArray(value.result_descriptor.removed_physical_fact_refs)
        && (proposal.identity_mode === 'preserve_source'
          || value.result_descriptor.removed_physical_fact_refs.length === 0))
    && nullableText(value.result_descriptor.inscription_text)
    && validSourceFactDelta(value.result_descriptor.source_fact_delta,
      proposal.identity_mode === 'independent_outputs'
        && proposal.result_class === 'partial_transformation')
    && !(proposal.identity_mode === 'independent_outputs'
      && proposal.result_class === 'partial_transformation'
      && proposal.source_transitions.length !== 1);
}
function validSourceFactDelta(value, required) {
  if (value === null) return !required;
  return required && exact(value, [
    'physical_description', 'qualitative_facts',
    'removed_physical_fact_refs', 'physical_form'
  ]) && nullableText(value.physical_description)
    && textArray(value.qualitative_facts)
    && textArray(value.removed_physical_fact_refs)
    && ['compact', 'regular', 'long', 'bulky'].includes(value.physical_form)
    && (value.physical_description !== null
      || value.qualitative_facts.length > 0
      || value.removed_physical_fact_refs.length > 0);
}
function descriptorKeys(value) {
  const keys = [...DESCRIPTOR_KEYS];
  if (value != null && Object.hasOwn(value, 'removed_physical_fact_refs')) {
    keys.push('removed_physical_fact_refs');
  }
  return keys;
}
function validResult(value) {
  const keys = value?.identity_kind === 'independent_output'
    ? [...RESULT_KEYS, 'material_allocations'] : RESULT_KEYS;
  return exact(value, keys) && text(value.entity_ref)
    && ['preserved_source', 'independent_output'].includes(value.identity_kind)
    && text(value.source_ref) && record(value.mechanics_snapshot)
    && nullableText(value.holder_ref) && nullableText(value.controller_ref)
    && textArray(value.physical_facts)
    && nullableText(value.inscription_text)
    && validateActionProducedOutputAuthority(value.output_authority,
      value.identity_kind);
}
function compatible(proposal, outputClass) {
  const descriptor = proposal.qualitative_result.result_descriptor;
  if (outputClass === 'written_carrier') {
    return proposal.result_class === 'written_carrier'
      && proposal.identity_mode === 'preserve_source'
      && text(descriptor.inscription_text)
      && proposal.results.every((result) =>
        result.inscription_text === descriptor.inscription_text);
  }
  if (outputClass === 'money_like_token'
      && proposal.results.some((result) =>
        result.output_authority.mode !== 'new_non_authoritative')) {
    return false;
  }
  return proposal.result_class !== 'written_carrier'
    && descriptor.inscription_text === null
    && proposal.results.every((result) => result.inscription_text === null);
}
function textArray(value) {
  return Array.isArray(value) && value.every(text)
    && new Set(value).size === value.length;
}
function nullableText(value) { return value === null || text(value); }
function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function exact(value, keys) {
  return record(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function record(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
function failed(suffix) {
  const code = `ITEM_ACTION_PRODUCED_OUTPUT_${suffix}`;
  return deepFreeze({ pass: false, handoff: null, errors: [{ code,
    category: 'data_gap', retryable: false, message: code, details: {} }] });
}
function failFacts() {
  throw Object.assign(new TypeError('ITEM_ACTION_PRODUCED_FACTS_INVALID'),
    { code: 'ITEM_ACTION_PRODUCED_FACTS_INVALID' });
}
