import { publicList, referenceCandidatesForType, resolveRecordRef } from '../references/reference-index.js';
import { computeStage26Digest } from '../shared/digest.js';
import { issue, requirePublicText, requireText, stage26Error } from '../shared/issues.js';
import { array, isObject, optionalPublicText, publicTextList, safeClone, text, withoutNullish } from '../shared/utils.js';

export function buildPositionPanel(publicState, committed) {
  return {
    public_position_label: requirePublicText(publicState.public_position_label, 'committed_public_read_model.public_position_label'),
    position_ref: safeClone(publicState.current_position_ref),
    committed_position_digest: computeStage26Digest(committed.current_position),
    technical_position_hidden: true,
    debug_position: null
  };
}

export function buildTimePanel(publicState, committed) {
  return {
    public_time_label: requirePublicText(publicState.public_time_label, 'committed_public_read_model.public_time_label'),
    public_light_label: requirePublicText(publicState.public_light_label, 'committed_public_read_model.public_light_label'),
    public_weather_label: optionalPublicText(publicState.public_weather_label),
    clock_ref: safeClone(publicState.current_clock_ref),
    committed_clock_digest: computeStage26Digest(committed.current_clock)
  };
}

export function buildCharacterPanel(publicState) {
  return {
    public_character_label: optionalPublicText(publicState.public_character_label) ?? 'Ты',
    body_state_summary: publicTextList(publicState.public_body_state_summary ?? publicState.body_state_summary),
    inventory_summary: publicTextList(publicState.public_inventory_summary ?? publicState.inventory_summary),
    warning_badges: publicTextList(publicState.public_warning_badges ?? publicState.warning_badges)
  };
}

export function buildAttentionPanel(publicState) {
  return {
    visible_npcs: buildAttentionItems(publicList(publicState, 'npcs'), 'visible_npc'),
    visible_items: buildAttentionItems(publicList(publicState, 'items'), 'visible_item'),
    visible_containers: buildAttentionItems(publicList(publicState, 'containers'), 'visible_container'),
    visible_exits: buildAttentionItems(publicList(publicState, 'exits'), 'visible_exit'),
    audible_or_sensory_cues: buildAttentionItems(publicList(publicState, 'cues'), 'sensory_cue'),
    known_context_hints: buildAttentionItems(publicList(publicState, 'context_hints'), 'known_context_hint')
  };
}

export function buildAttentionItems(items, targetType) {
  return array(items).map((item, index) => {
    const sourceRef = resolveRecordRef(item, referenceCandidatesForType(targetType));
    return withoutNullish({
      attention_target_id: text(item.attention_target_id) || sourceRef,
      source_ref: sourceRef,
      label: requirePublicText(item.label ?? item.public_label ?? item.text, `${targetType}[${index}].label`),
      target_type: text(item.target_type) || targetType,
      attention_mode: optionalPublicText(item.attention_mode ?? item.mode),
      risk_hint: optionalPublicText(item.risk_hint),
      certainty: optionalPublicText(item.certainty),
      must_not_reveal_hidden_truth: true
    });
  });
}

export function buildApprovedActions(options) {
  return array(options).map((option, index) => ({
    option_id: requireText(option?.option_id, `action_options[${index}].option_id`),
    label: requirePublicText(option?.label, `action_options[${index}].label`),
    action_kind: requireText(option?.action_kind, `action_options[${index}].action_kind`),
    basis: requireText(option?.basis, `action_options[${index}].basis`),
    risk_hint: requireText(option?.risk_hint, `action_options[${index}].risk_hint`),
    target_ref: safeClone(option?.target_ref ?? null),
    basis_refs: safeClone(option?.basis_refs ?? []),
    requires_resolution_pipeline: true,
    must_not_reveal_hidden_truth: option?.must_not_reveal_hidden_truth === true,
    promises_outcome: option?.promises_outcome === true || option?.outcome_guaranteed === true
  }));
}

export function buildMapPanel(publicState) {
  const map = publicState.public_visible_map ?? publicState.known_map ?? {};
  return {
    enabled: true,
    map_mode: 'character_known_only',
    known_current_node: buildMapNode(map.known_current_node ?? publicState.known_current_node),
    known_nearby_nodes: array(map.known_nearby_nodes ?? publicState.known_nearby_nodes).map(buildMapNode),
    unknown_exits: array(map.unknown_exits ?? publicState.unknown_exits).map(buildUnknownExit),
    must_not_show_hidden_nodes: true
  };
}

export function buildMapNode(item = {}) {
  return withoutNullish({
    node_ref: resolveRecordRef(item, ['node_ref', 'node_id', 'anchor_id', 'source_ref', 'id']),
    label: requirePublicText(item.label ?? item.public_label, 'map node label'),
    certainty: optionalPublicText(item.certainty)
  });
}

export function buildUnknownExit(item = {}) {
  return withoutNullish({
    exit_ref: resolveRecordRef(item, ['exit_ref', 'exit_id', 'anchor_id', 'route_id', 'source_ref', 'id']),
    label: requirePublicText(item.label ?? item.public_label, 'unknown exit label'),
    certainty: optionalPublicText(item.certainty),
    destination_unknown: item.destination_unknown !== false,
    exact_destination: item.exact_destination ?? item.destination_ref ?? item.destination_id ?? null
  });
}

export function resolveCommittedDeliveryState(committed, publicState) {
  const messageId = text(committed.player_output_ref?.narrator_output_id);
  if (!messageId) throw stage26Error('projection', [issue('FIRST_SCREEN_DELIVERY_ID_MISSING', 'Committed message ID is required.', 'party_start_committed.player_output_ref.narrator_output_id', 'delivery_block')]);
  const ack = isObject(publicState.delivery_state) ? publicState.delivery_state : {};
  const presented = committed.player_output_ref?.opening_scene_presented === true || committed.party_state?.opening_scene_presented === true;
  if (presented && (!text(ack.client_ack_id) || text(ack.message_id) !== messageId)) {
    throw stage26Error('projection', [issue('FIRST_SCREEN_OPENING_PRESENTED_WITHOUT_ACK', 'opening_scene_presented requires matching committed client acknowledgement.', 'committed_public_read_model.delivery_state', 'delivery_block')]);
  }
  return withoutNullish({
    message_id: messageId,
    opening_scene_presented: presented,
    awaiting_client_ack: !presented,
    shown_at: presented ? ack.shown_at : null,
    client_ack_id: presented ? ack.client_ack_id : null
  });
}
