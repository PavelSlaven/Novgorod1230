import { targetRefValue } from '../references/reference-index.js';
import { computeStage26Digest, sameJson } from '../shared/digest.js';
import { issue } from '../shared/issues.js';
import { array, text } from '../shared/utils.js';

export function validatePositionPanel(panel, input, concerns) {
  if (!text(panel?.public_position_label) || !sameJson(panel?.position_ref, input.party_start_committed?.current_position) || panel?.committed_position_digest !== computeStage26Digest(input.party_start_committed?.current_position)) concerns.push(issue('FIRST_SCREEN_POSITION_MISMATCH', 'Position panel is not bound to committed position.', 'screen.position_panel', 'hard_block'));
}

export function validateTimePanel(panel, input, concerns) {
  if (!text(panel?.public_time_label) || !sameJson(panel?.clock_ref, input.party_start_committed?.current_clock) || panel?.committed_clock_digest !== computeStage26Digest(input.party_start_committed?.current_clock)) concerns.push(issue('FIRST_SCREEN_TIME_PANEL_CLOCK_CONFLICT', 'Time panel is not bound to committed clock.', 'screen.time_panel', 'hard_block'));
  if (!text(panel?.public_light_label)) concerns.push(issue('FIRST_SCREEN_LIGHT_PANEL_CONFLICT', 'Public light label is required.', 'screen.time_panel.public_light_label', 'hard_block'));
  if (input.committed_public_read_model?.public_weather_label != null && panel?.public_weather_label !== input.committed_public_read_model.public_weather_label) concerns.push(issue('FIRST_SCREEN_WEATHER_PANEL_CONFLICT', 'Weather label differs from committed public read model.', 'screen.time_panel.public_weather_label', 'hard_block'));
}

export function validateAttentionPanel(panel, index, concerns) {
  const groups = [
    ['visible_npcs', index.visibleNpcRefs], ['visible_items', index.visibleItemRefs],
    ['visible_containers', index.visibleContainerRefs], ['visible_exits', index.visibleExitRefs],
    ['audible_or_sensory_cues', index.visibleCueRefs], ['known_context_hints', index.attentionTargetRefs]
  ];
  for (const [key, allowed] of groups) {
    for (const [position, item] of array(panel?.[key]).entries()) {
      if (!text(item?.source_ref) || (!allowed.has(item.source_ref) && !(key === 'known_context_hints' && index.approvedNarratorUsedRefs.has(item.source_ref)))) concerns.push(issue('FIRST_SCREEN_ATTENTION_REF_NOT_FOUND', `Attention ref is not approved: ${item?.source_ref ?? 'missing'}.`, `screen.attention_panel.${key}[${position}].source_ref`, 'upstream_block'));
      if (!text(item?.label) || item?.must_not_reveal_hidden_truth !== true) concerns.push(issue('FIRST_SCREEN_HIDDEN_STATE_LEAK', 'Attention item safety contract is invalid.', `screen.attention_panel.${key}[${position}]`, 'repairable'));
    }
  }
}

export function validateActionPanel(panel, input, index, concerns) {
  const approved = new Map(array(input.approved_narrator_output?.action_options).map((item) => [item.option_id, item]));
  const seen = new Set();
  for (const [position, action] of array(panel?.suggested_actions).entries()) {
    const source = approved.get(action?.option_id);
    if (!source) concerns.push(issue('FIRST_SCREEN_ACTION_OPTION_NOT_APPROVED', `Action option is not approved: ${action?.option_id ?? 'missing'}.`, `screen.action_panel.suggested_actions[${position}].option_id`, 'upstream_block'));
    if (seen.has(action?.option_id)) concerns.push(issue('FIRST_SCREEN_ACTION_OPTION_NOT_APPROVED', 'Duplicate action option ID.', `screen.action_panel.suggested_actions[${position}].option_id`, 'hard_block'));
    seen.add(action?.option_id);
    if (source && (action.action_kind !== source.action_kind || !sameJson(action.target_ref, source.target_ref))) concerns.push(issue('FIRST_SCREEN_ACTION_CREATED_TARGET', 'Action kind or target differs from approved option.', `screen.action_panel.suggested_actions[${position}]`, 'hard_block'));
    const target = targetRefValue(action?.target_ref);
    if (target && !index.actionTargetRefs.has(target)) concerns.push(issue('FIRST_SCREEN_ACTION_REF_NOT_FOUND', `Action target is not committed/visible: ${target}.`, `screen.action_panel.suggested_actions[${position}].target_ref`, 'upstream_block'));
    if (action?.promises_outcome === true || action?.requires_resolution_pipeline !== true) concerns.push(issue('FIRST_SCREEN_ACTION_PROMISES_OUTCOME', 'Suggested action promises an outcome instead of an intent.', `screen.action_panel.suggested_actions[${position}]`, 'repairable'));
    if (action?.must_not_reveal_hidden_truth !== true) concerns.push(issue('FIRST_SCREEN_ACTION_USES_HIDDEN_TRUTH', 'Suggested action lacks hidden-truth guard.', `screen.action_panel.suggested_actions[${position}]`, 'repairable'));
  }
}

export function validateMapPanel(panel, input, index, concerns) {
  if (panel?.map_mode !== 'character_known_only') concerns.push(issue('FIRST_SCREEN_MAP_REF_NOT_KNOWN', 'Map mode must be character_known_only.', 'screen.map_panel.map_mode', 'hard_block'));
  if (panel?.must_not_show_hidden_nodes !== true) concerns.push(issue('FIRST_SCREEN_HIDDEN_STATE_LEAK', 'Map hidden-node guard is missing.', 'screen.map_panel.must_not_show_hidden_nodes', 'hard_block'));
  const current = panel?.known_current_node;
  if (!text(current?.node_ref) || !index.knownNodeRefs.has(current.node_ref)) concerns.push(issue('FIRST_SCREEN_MAP_REF_NOT_KNOWN', 'Current map node is not in committed knowledge.', 'screen.map_panel.known_current_node.node_ref', 'upstream_block'));
  for (const [position, node] of array(panel?.known_nearby_nodes).entries()) if (!text(node?.node_ref) || !index.knownNodeRefs.has(node.node_ref)) concerns.push(issue('FIRST_SCREEN_MAP_REF_NOT_KNOWN', 'Nearby map node is not in committed knowledge.', `screen.map_panel.known_nearby_nodes[${position}].node_ref`, 'upstream_block'));
  for (const [position, exit] of array(panel?.unknown_exits).entries()) {
    if (!text(exit?.exit_ref) || (!index.visibleExitRefs.has(exit.exit_ref) && !index.knownRouteRefs.has(exit.exit_ref))) concerns.push(issue('FIRST_SCREEN_MAP_REF_NOT_KNOWN', 'Unknown exit ref is not committed/known.', `screen.map_panel.unknown_exits[${position}].exit_ref`, 'upstream_block'));
    if (exit?.destination_unknown !== true || exit?.exact_destination != null) concerns.push(issue('FIRST_SCREEN_UNKNOWN_ROUTE_DESTINATION_LEAK', 'Unknown exit exposes exact destination.', `screen.map_panel.unknown_exits[${position}]`, 'repairable'));
  }
  const positionAnchor = text(input.party_start_committed?.current_position?.anchor_id);
  if (positionAnchor && current?.node_ref !== positionAnchor && !index.knownNodeRefs.has(positionAnchor)) concerns.push(issue('FIRST_SCREEN_POSITION_MISMATCH', 'Map current node is not bound to committed position anchor.', 'screen.map_panel.known_current_node', 'hard_block'));
}

export function validateDeliveryState(delivery, input, concerns) {
  const expected = text(input.party_start_committed?.player_output_ref?.narrator_output_id);
  if (!text(delivery?.message_id) || delivery.message_id !== expected) concerns.push(issue('FIRST_SCREEN_DELIVERY_ID_MISSING', 'Delivery message ID must equal committed narrator output ID.', 'screen.delivery_state.message_id', 'delivery_block'));
  if (delivery?.opening_scene_presented === true && (!text(delivery?.client_ack_id) || delivery.awaiting_client_ack !== false)) concerns.push(issue('FIRST_SCREEN_OPENING_PRESENTED_WITHOUT_ACK', 'Opening scene cannot be marked presented without ACK.', 'screen.delivery_state', 'delivery_block'));
  if (delivery?.opening_scene_presented !== true && delivery?.awaiting_client_ack !== true) concerns.push(issue('FIRST_SCREEN_OPENING_PRESENTED_WITHOUT_ACK', 'Unpresented screen must await client ACK.', 'screen.delivery_state.awaiting_client_ack', 'delivery_block'));
}
