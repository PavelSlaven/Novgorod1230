import { collectByKeys } from '../references/reference-index.js';
import { addMapSet, array, firstText, issue, text } from '../shared/utils.js';
import { validateKnownRecordRef, validateTypedTarget } from './validation-helpers.js';
export function validateDiscoveryRules(output, refs, factRegistry, consequenceIds, concerns) {
  for (const [i, rule] of array(output.discovery_rules).entries()) {
    const path = `discovery_rules[${i}]`;
    for (const [j, id] of array(rule?.hidden_fact_ids).entries()) if (!factRegistry.has(id)) concerns.push(issue('HIDDEN_STATE_NO_DISCOVERY_RULE', 'Discovery rule references unknown hidden fact.', `${path}.hidden_fact_ids[${j}]`, null, id));
    if (rule?.requirements?.required_anchor_id) validateRef(rule.requirements.required_anchor_id, refs.anchorIds, 'HIDDEN_STATE_ANCHOR_REF_NOT_FOUND', `${path}.requirements.required_anchor_id`, concerns);
    if (rule?.requirements?.required_tool_item_id) validateRef(rule.requirements.required_tool_item_id, refs.itemIds, 'HIDDEN_STATE_ITEM_REF_NOT_FOUND', `${path}.requirements.required_tool_item_id`, concerns);
    if (rule?.requirements?.required_npc_id) validateRef(rule.requirements.required_npc_id, refs.npcIds, 'HIDDEN_STATE_NPC_REF_NOT_FOUND', `${path}.requirements.required_npc_id`, concerns);
    for (const [j, id] of array(rule?.result_if_failure?.consequence_hook_ids).entries()) if (!consequenceIds.has(id)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_TARGET', 'Discovery rule references unknown consequence hook.', `${path}.result_if_failure.consequence_hook_ids[${j}]`, null, id));
  }
}

export function validateRevealConditions(output, factRegistry, concerns) {
  for (const [i, condition] of array(output.reveal_conditions).entries()) {
    const path = `reveal_conditions[${i}]`;
    if (!factRegistry.has(condition?.hidden_fact_id)) concerns.push(issue('HIDDEN_STATE_NO_REVEAL_CONDITION', 'Reveal condition references unknown hidden fact.', `${path}.hidden_fact_id`, null, condition?.hidden_fact_id));
    if (!text(condition?.condition_type)) concerns.push(issue('HIDDEN_STATE_NO_REVEAL_CONDITION', 'Reveal condition requires condition_type.', `${path}.condition_type`));
  }
}

export function validateConsequenceHooks(output, refs, concerns) {
  for (const [i, hook] of array(output.consequence_hooks).entries()) {
    const path = `consequence_hooks[${i}]`;
    if (array(hook?.trigger_conditions).length === 0) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_TARGET', 'Consequence hook requires trigger_conditions.', `${path}.trigger_conditions`));
    if (!text(hook?.effect_scope)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_EFFECT', 'Consequence hook requires effect_scope.', `${path}.effect_scope`));
    if (!text(hook?.effect_summary_for_system)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_EFFECT', 'Consequence hook requires effect_summary_for_system.', `${path}.effect_summary_for_system`));
    for (const [j, write] of array(hook?.writes).entries()) {
      if (!text(write?.table) || !['insert', 'update'].includes(write?.operation) || !text(write?.record_ref)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_EFFECT', 'Consequence write requires table, operation and record_ref.', `${path}.writes[${j}]`));
    }
    validateKnownRecordRef(hook, refs, path, concerns);
  }
}

export function validateFactDisclosureLinks(factRegistry, revealIds, discoveryIds, output, concerns) {
  const revealByFact = new Map();
  for (const condition of array(output.reveal_conditions)) addMapSet(revealByFact, condition?.hidden_fact_id, condition?.reveal_condition_id);
  const discoveryByFact = new Map();
  for (const rule of array(output.discovery_rules)) for (const id of array(rule?.hidden_fact_ids)) addMapSet(discoveryByFact, id, rule?.discovery_rule_id);

  for (const [id, fact] of factRegistry.entries()) {
    const ownReveal = array(fact.value?.reveal_condition_ids);
    const ownDiscovery = array(fact.value?.discovery_rule_ids);
    for (const [i, ref] of ownReveal.entries()) if (!revealIds.has(ref)) concerns.push(issue('HIDDEN_STATE_NO_REVEAL_CONDITION', 'Hidden fact references unknown reveal condition.', `${fact.path}.reveal_condition_ids[${i}]`, null, ref));
    for (const [i, ref] of ownDiscovery.entries()) if (!discoveryIds.has(ref)) concerns.push(issue('HIDDEN_STATE_NO_DISCOVERY_RULE', 'Hidden fact references unknown discovery rule.', `${fact.path}.discovery_rule_ids[${i}]`, null, ref));
    const implicitEventRule = fact.kind === 'future_event'
      && fact.value?.event_visibility?.must_not_reveal_until_triggered === true
      && text(fact.value?.trigger?.trigger_type);
    const systemOnly = fact.value?.system_only === true && text(fact.value?.system_only_reason ?? fact.value?.reason);
    const hasReveal = ownReveal.length > 0 || (revealByFact.get(id)?.size ?? 0) > 0;
    const hasDiscovery = ownDiscovery.length > 0 || (discoveryByFact.get(id)?.size ?? 0) > 0;
    if (!hasReveal && !hasDiscovery && !systemOnly && !implicitEventRule) {
      concerns.push(issue('HIDDEN_STATE_NO_REVEAL_CONDITION', 'Hidden fact requires reveal/discovery or system_only reason.', fact.path, null, id));
      if (fact.value?.system_only === true && !text(fact.value?.system_only_reason ?? fact.value?.reason)) concerns.push(issue('HIDDEN_STATE_NO_SYSTEM_ONLY_REASON', 'system_only hidden fact requires a reason.', fact.path));
    }
  }
}

export function validateConsequenceReferences(output, consequenceIds, concerns) {
  for (const arrayName of ['hidden_npc_state', 'hidden_access_state', 'hidden_property_state', 'hidden_container_state', 'hidden_item_state', 'hidden_risk_state', 'hidden_social_state']) {
    for (const [i, item] of array(output[arrayName]).entries()) {
      const ids = array(item?.consequence_hook_ids ?? item?.consequence_hooks);
      for (const [j, id] of ids.entries()) if (!consequenceIds.has(id)) concerns.push(issue('HIDDEN_STATE_CONSEQUENCE_WITHOUT_TARGET', 'Hidden fact references unknown consequence hook.', `${arrayName}[${i}].consequence_hook_ids[${j}]`, null, id));
    }
  }
}

export function validateForbiddenCoverage(output, factRegistry, concerns) {
  const covered = new Set();
  for (const rule of array(output.forbidden_output_rules)) for (const id of array(rule?.hidden_fact_ids)) covered.add(id);
  for (const [id, fact] of factRegistry.entries()) {
    if (!['npc_private_motive', 'closed_container', 'future_event', 'true_ownership', 'hidden_risk'].includes(fact.kind)) continue;
    if (!covered.has(id)) concerns.push(issue('HIDDEN_STATE_FORBIDDEN_OUTPUT_RULE_MISSING', `Sensitive hidden fact ${id} is not covered by forbidden_output_rules.`, fact.path));
  }
}

export function validateKnowledgeBoundary(output, input, concerns) {
  const forbiddenIds = new Set();
  collectByKeys(input?.character_knowledge_map?.forbidden_knowledge, forbiddenIds, ['hidden_fact_id', 'fact_id', 'target_id', 'item_instance_id', 'container_instance_id', 'npc_instance_id']);
  for (const state of array(output.hidden_property_state)) {
    const targetId = state?.property_target?.target_id;
    if (forbiddenIds.has(targetId) && state?.ownership_truth?.known_to_character === true) concerns.push(issue('HIDDEN_STATE_CHARACTER_KNOWLEDGE_CONFLICT', 'Ownership marked known despite forbidden knowledge.', 'hidden_property_state.ownership_truth.known_to_character', false, true));
  }
  for (const state of array(output.hidden_item_state)) {
    const known = new Set(array(state?.known_layers?.known_to_character));
    const unknown = new Set(array(state?.known_layers?.unknown_to_character));
    for (const fact of known) if (unknown.has(fact)) concerns.push(issue('HIDDEN_STATE_CHARACTER_KNOWLEDGE_CONFLICT', 'Item fact cannot be both known and unknown.', 'hidden_item_state.known_layers'));
  }
}

export function validatePropertyBindings(output, refs, concerns) {
  for (const [i, state] of array(output.hidden_property_state).entries()) {
    const targetId = state?.property_target?.target_id;
    const binding = refs.propertyBindingByTarget.get(targetId);
    if (!binding) continue;
    const truth = state?.ownership_truth ?? {};
    for (const [outputKey, inputKeys] of Object.entries({
      owner_id: ['owner_id', 'owner_ref'],
      holder_id: ['holder_id', 'holder_ref'],
      controller_id: ['controller_id', 'controller_ref']
    })) {
      const expected = firstText(binding, inputKeys);
      const actual = truth[outputKey];
      if (expected && actual && expected !== actual) concerns.push(issue('HIDDEN_STATE_PROPERTY_CONFLICT', `${outputKey} conflicts with approved item/property binding.`, `hidden_property_state[${i}].ownership_truth.${outputKey}`, expected, actual));
    }
  }
}

export function validateEmptyLimited(output, input, concerns) {
  if (output.hidden_state_status !== 'empty_limited') return;
  const nonEmpty = [
    'hidden_npc_state', 'hidden_access_state', 'hidden_property_state', 'hidden_container_state', 'hidden_item_state',
    'hidden_risk_state', 'hidden_event_state', 'hidden_social_state', 'hidden_route_state', 'hidden_environment_state',
    'discovery_rules', 'reveal_conditions', 'consequence_hooks', 'forbidden_output_rules'
  ].filter((key) => array(output[key]).length > 0);
  if (nonEmpty.length > 0) concerns.push(issue('HIDDEN_STATE_EMPTY_LIMITED_INVALID', `empty_limited cannot contain hidden facts: ${nonEmpty.join(', ')}.`, 'hidden_state_status'));
  const sceneOrKeyNpc = array(input?.initial_npc_placement?.npc_instances ?? input?.initial_npc_placement?.placements)
    .some((npc) => ['scene', 'key'].includes(npc?.npc_profile_level ?? npc?.profile_level));
  const containers = array(input?.initial_item_placement?.container_instances ?? input?.initial_item_placement?.containers);
  if (sceneOrKeyNpc || containers.length > 0) concerns.push(issue('HIDDEN_STATE_EMPTY_LIMITED_INVALID', 'empty_limited is not allowed when scene/key NPCs or containers exist.', 'hidden_state_status'));
}

