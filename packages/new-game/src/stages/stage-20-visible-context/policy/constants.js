import { STAGE20_INPUT_SCHEMA, STAGE20_OUTPUT_SCHEMA, STAGE20_VISIBILITY_FILTER_SCHEMA, STAGE20_PRECHECK_SCHEMA, STAGE20_RESULT_SCHEMA } from '@rus/contracts';
import { isObject } from '../../../visible-context/shared.js';

export { STAGE20_INPUT_SCHEMA, STAGE20_OUTPUT_SCHEMA, STAGE20_VISIBILITY_FILTER_SCHEMA, STAGE20_PRECHECK_SCHEMA, STAGE20_RESULT_SCHEMA };

export const DEFAULT_STAGE20_VISIBLE_CONTEXT_POLICY = Object.freeze({
  require_current_position_match: true,
  require_time_light_consistency: true,
  require_character_knowledge_boundary: true,
  require_hidden_state_filter: true,
  require_reveal_conditions: true,
  require_source_trace: true,
  allow_visible_hints_from_hidden_state: true,
  allow_reasonable_character_inference: true,
  reject_hidden_truth_leak: true,
  reject_private_motives: true,
  reject_closed_container_contents: true,
  reject_future_events: true,
  reject_unknown_exact_routes: true,
  reject_unseen_items: true,
  reject_raw_json_output_to_narrator: true,
  do_not_create_new_world_facts: true,
  do_not_change_clock: true,
  do_not_change_scene_state: true
});

export function normalizeStage20VisibleContextPolicy(policy = {}) {
  return Object.freeze({
    ...DEFAULT_STAGE20_VISIBLE_CONTEXT_POLICY,
    ...(isObject(policy) ? policy : {})
  });
}
