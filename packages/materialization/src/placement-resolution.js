import { MaterializationError } from './core.js';

export function resolveNpcPlacementCandidates(input) {
  const candidates = input.eligible_npc_candidates ?? [];
  const slots = input.g5_scene_graph?.npc_materialization_slots ?? [];
  const selected = selectBySlots(candidates, slots, 'npc', 'npc_candidate_id');
  return selected.map(({ candidate, slot, ordinal }) => normalizeNpc(candidate, slot, ordinal, input));
}

export function resolveItemPlacementCandidates(input, domain) {
  const isItem = domain === 'item';
  const candidates = isItem ? input.eligible_item_profile_candidates ?? [] : input.eligible_container_profile_candidates ?? [];
  const slots = (input.g5_scene_graph?.item_materialization_slots ?? []).filter((slot) => slot.slot_domain === domain);
  const idKey = isItem ? 'item_profile_candidate_id' : 'container_profile_candidate_id';
  return selectBySlots(candidates, slots, domain, idKey).map(({ candidate, slot, ordinal }) => normalizeResource(candidate, slot, ordinal, input, domain));
}

function selectBySlots(candidates, slots, domain, idKey) {
  const normalizedRequired = candidates.filter((candidate) => candidate.status === 'approved' && candidate.required === true).map((candidate, ordinal) => ({ candidate, slot: candidate, ordinal }));
  if (slots.length === 0) return normalizedRequired;
  const byId = new Map(candidates.map((candidate) => [candidate[idKey] ?? candidate.candidate_id ?? candidate.id, candidate]));
  return [...slots].sort(compareSlot).flatMap((slot) => {
    const ids = Array.isArray(slot.candidate_ids) && slot.candidate_ids.length > 0 ? slot.candidate_ids : [...byId.keys()].sort();
    const eligible = ids.map((id) => byId.get(id)).filter(Boolean);
    if (eligible.length === 0 && slot.min_count > 0) throw new MaterializationError('PLACEMENT_RULE_CANDIDATES_EMPTY', `Approved ${domain} slot ${slot.slot_key} has no Stage 7/8 candidate.`);
    return Array.from({ length: slot.min_count }, (_, ordinal) => ({ candidate: eligible[ordinal % eligible.length], slot, ordinal }));
  });
}

function normalizeNpc(candidate, slot, ordinal, input) {
  if (candidate.status === 'approved' && candidate.placement) return { ...structuredClone(candidate), profile_level: normalizeProfileLevel(candidate.profile_level), slot_rule_id: slot.rule_id ?? candidate.slot_rule_id };
  if (candidate.status !== 'approved') throw new MaterializationError('NPC_CANDIDATE_NOT_APPROVED', 'Stage 15 may materialize approved NPC candidates only.');
  const anchor = chooseAnchor(input.eligible_g5_anchors, slot.anchor_slot_key, 'can_hold_npc');
  const archetypeId = candidate.npc_archetype?.npc_archetype_id ?? candidate.npc_archetype_id;
  const socialRoleId = candidate.social_role?.social_role_id ?? candidate.social_role_id;
  const profileLevel = normalizeProfileLevel(candidate.profile_level);
  const profileSetId = candidate.npc_profile_set_id ?? slot.npc_profile_set_id;
  requireText([archetypeId, socialRoleId, profileLevel, profileSetId, slot.rule_id, slot.presence_reason], 'NPC_PROFILE_REFERENCE_INCOMPLETE');
  requireObjects(candidate, ['identity_state', 'visibility_state', 'access_state', 'machine_state', 'knowledge_scope'], 'NPC_PROFILE_STATE_INCOMPLETE');
  requireArrays(candidate, ['traits', 'knowledge_records', 'schedule_records', 'relations', 'source_trace'], 'NPC_PROFILE_STATE_INCOMPLETE');
  return {
    ...structuredClone(candidate), status: 'approved', required: true, slot_rule_id: slot.rule_id,
    npc_profile_set_id: profileSetId, profile_level: profileLevel,
    social_role_id: socialRoleId, occupation_id: candidate.occupation?.occupation_id ?? candidate.occupation_id ?? null,
    npc_archetype_id: archetypeId, key_npc_seed_id: candidate.key_seed?.key_npc_seed_id ?? candidate.key_npc_seed_id ?? null,
    placement: { g5_anchor_id: anchor.anchor_id, g5_minilocation_id: anchor.minilocation_id, parent_g4_node_id: anchor.parent_g4_node_id, presence_reason: slot.presence_reason },
    causal_basis: { causal_basis_type: 'approved_npc_materialization_rule', causal_basis_id: slot.rule_id },
    materialization_ordinal: ordinal
  };
}

function normalizeResource(candidate, slot, ordinal, input, domain) {
  if (candidate.status === 'approved' && candidate.placement) return { ...structuredClone(candidate), slot_rule_id: slot.rule_id ?? candidate.slot_rule_id };
  if (candidate.status !== 'approved') throw new MaterializationError(`${domain.toUpperCase()}_CANDIDATE_NOT_APPROVED`, `Stage 16 may materialize approved ${domain} candidates only.`);
  const item = domain === 'item';
  const anchor = chooseAnchor(item ? input.eligible_g5_item_anchors : input.eligible_g5_container_anchors, slot.anchor_slot_key, item ? 'can_hold_item' : 'can_hold_container');
  const candidateId = candidate[item ? 'item_profile_candidate_id' : 'container_profile_candidate_id'];
  const templateId = candidate[item ? 'item_template_id' : 'container_template_id'];
  const profileId = candidate[item ? 'item_profile_id' : 'container_profile_id'];
  const categoryId = candidate[item ? 'item_category_id' : 'container_category_id'];
  const quantity = slot.quantity ?? candidate.quantity;
  requireText([candidateId, templateId, profileId, categoryId, candidate.condition_state, candidate.legal_status, slot.causal_basis_type, slot.rule_id], `${domain.toUpperCase()}_PROFILE_REFERENCE_INCOMPLETE`);
  if (!Number.isInteger(quantity) || quantity <= 0) throw new MaterializationError(`${domain.toUpperCase()}_PROFILE_STATE_INCOMPLETE`, `${domain} quantity must come from an approved profile or slot rule.`);
  requireObjects(candidate, ['property_state', 'visibility_state', 'access_state', 'risk_state', 'physical_state'], `${domain.toUpperCase()}_PROFILE_STATE_INCOMPLETE`);
  requireArrays(candidate, ['source_trace'], `${domain.toUpperCase()}_PROFILE_STATE_INCOMPLETE`);
  if (!item) requireObjects(candidate, ['content_state'], 'CONTAINER_PROFILE_STATE_INCOMPLETE');
  const placement = { g5_anchor_id: anchor.anchor_id, parent_g4_node_id: anchor.parent_g4_node_id, causal_basis_type: slot.causal_basis_type, causal_basis_id: slot.rule_id };
  const shared = {
    ...structuredClone(candidate), status: 'approved', required: true, slot_rule_id: slot.rule_id, quantity,
    placement,
    causal_basis: { causal_basis_type: placement.causal_basis_type, causal_basis_id: slot.rule_id },
    materialization_ordinal: ordinal
  };
  if (item) return { ...shared, item_profile_id: profileId, item_template_id: templateId, item_category_id: categoryId };
  return { ...shared, container_profile_id: profileId, container_template_id: templateId, container_category_id: categoryId };
}

function chooseAnchor(anchors = [], slotKey, capability) {
  const eligible = anchors.filter((anchor) => anchor?.supports?.[capability] === true && (!slotKey || anchor.slot_key === slotKey)).sort((left, right) => String(left.anchor_id).localeCompare(String(right.anchor_id)));
  if (eligible.length === 0) throw new MaterializationError('PLACEMENT_RULE_ANCHOR_UNRESOLVED', `No approved anchor satisfies ${capability} for slot ${slotKey ?? '<any>'}.`);
  return eligible[0];
}

function visibilityFromAnchor(anchor) {
  const visibility = anchor.visibility?.visibility_default ?? anchor.visibility?.visibility ?? 'hidden';
  return { visibility, visible_to_player: visibility === 'visible', visible_to_player_now: visibility === 'visible', hidden_from_player: visibility !== 'visible' };
}
function normalizeProfileLevel(value) { return value === 'key_seed' ? 'key' : value; }
function compareSlot(left, right) { return String(left.slot_key).localeCompare(String(right.slot_key)) || String(left.rule_id).localeCompare(String(right.rule_id)); }
function requireText(values, code) { if (values.some((value) => typeof value !== 'string' || !value.trim())) throw new MaterializationError(code, 'Approved profile/rule reference is incomplete; materialization is blocked instead of inventing a value.'); }
function requireObjects(value, fields, code) { if (fields.some((field) => !value?.[field] || typeof value[field] !== 'object' || Array.isArray(value[field]))) throw new MaterializationError(code, 'Approved semantic state is incomplete; materialization is blocked instead of inventing a value.'); }
function requireArrays(value, fields, code) { if (fields.some((field) => !Array.isArray(value?.[field]))) throw new MaterializationError(code, 'Approved semantic arrays are incomplete; materialization is blocked instead of inventing a value.'); }
