import { computeStage26Digest } from '../shared/digest.js';
import { deepFreeze, safeClone } from '../shared/utils.js';

export function buildFormatRepairRoleInput({ artifactKind, artifact, issues, input, screen = null }) {
  return deepFreeze({
    version: 1,
    schema: 'first_screen_format_repair_request',
    request_id: input.request_id,
    artifact_kind: artifactKind,
    artifact: safeClone(artifact),
    format_issues: safeClone(issues),
    first_game_screen_digest: screen ? computeStage26Digest(screen) : null,
    constraints: {
      change_format_only: true,
      preserve_player_visible_text: true,
      preserve_refs: true,
      preserve_party_and_transaction_binding: true,
      do_not_add_world_facts: true
    }
  });
}

export function buildSemanticRepairRoleInput({ input, screen, safetyAudit, actionAudit, route, senior }) {
  return deepFreeze({
    version: 1,
    schema: senior ? 'senior_first_screen_semantic_repair_request' : 'first_screen_semantic_repair_request',
    request_id: input.request_id,
    first_game_screen: safeClone(screen),
    safety_audit: safeClone(safetyAudit),
    action_label_audit: safeClone(actionAudit),
    repair_route: safeClone(route),
    allowed_mutable_paths: [
      'position_panel.public_position_label', 'time_panel.public_time_label', 'time_panel.public_light_label',
      'time_panel.public_weather_label', 'character_panel.public_character_label', 'character_panel.body_state_summary',
      'character_panel.inventory_summary', 'character_panel.warning_badges', 'attention_panel.*.label',
      'attention_panel.*.risk_hint', 'action_panel.suggested_actions.*.label',
      'action_panel.suggested_actions.*.risk_hint', 'map_panel.*.label'
    ],
    forbidden_mutable_paths: [
      'request_id', 'party_id', 'turn_number', 'main_prose', 'position_panel.position_ref',
      'time_panel.clock_ref', 'attention_panel.*.source_ref', 'action_panel.suggested_actions.*.option_id',
      'action_panel.suggested_actions.*.action_kind', 'action_panel.suggested_actions.*.target_ref',
      'map_panel.*.*_ref', 'delivery_state', 'provenance'
    ],
    approved_narrator_output: safeClone(input.approved_narrator_output),
    committed_public_read_model: safeClone(input.committed_public_read_model),
    approved_visible_context: safeClone(input.approved_visible_context)
  });
}
