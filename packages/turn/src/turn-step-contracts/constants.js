export const ADAPTATIONS = [
  'literal', 'reality_limited', 'make_believe'
];
export const RESOLUTIONS = [
  'direct', 'generic_check', 'domain_request', 'clarification_required'
];
export const GOAL_RESULTS = [
  'pending', 'achieved', 'partially_achieved', 'not_achieved'
];
export const DURATION_CLASSES = [
  'moment', 'brief', 'short', 'extended'
];
export const EFFORTS = [
  'none', 'light', 'moderate', 'heavy', 'extreme'
];
export const DIFFICULTIES = [
  'trivial', 'ordinary', 'risky', 'dangerous', 'limit',
  'nearly_impossible'
];
export const OUTCOME_BANDS = [
  'clean_success', 'success', 'success_with_cost',
  'failure_with_consequence', 'severe_failure'
];
export const DIRECT_OPS = new Set([
  'create_entity', 'move_entity', 'change_entity_facts',
  'set_entity_mechanics', 'retire_entity', 'apply_body_event'
]);
export const DOMAIN_OPS = new Set([
  'request_discovery', 'request_container_access', 'request_movement',
  'request_item_use', 'request_activity', 'emit_interaction', 'request_combat'
]);
