import { deepFreeze } from '@rus/kernel';

export const NARRATION_REQUEST_SCHEMA = 'narration_request';
export const NARRATION_OUTPUT_SCHEMA = 'narration_output';
export const NARRATION_AUDIT_SCHEMA = 'narration_audit';
export const NARRATION_SEMANTIC_REPAIR_SCHEMA = 'narration_semantic_repair';
export const NARRATION_REPAIR_ROUTE_SCHEMA = 'narration_repair_route';
export const NARRATION_FLOW_RESULT_SCHEMA = 'narration_flow_result';

export const NARRATION_SURFACES = deepFreeze(['first_game', 'turn']);
export const NARRATION_REPAIR_ROUTES = deepFreeze([
  'format_repair',
  'semantic_rewrite',
  'upstream_repair',
  'block'
]);
export const NARRATION_RESULT_STATUSES = deepFreeze(['approved', 'repair_required', 'blocked']);
