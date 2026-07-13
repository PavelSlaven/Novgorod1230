export const STAGE22_INPUT_SCHEMA = 'narrator_start_input';
export const STAGE22_OUTPUT_SCHEMA = 'narrator_starting_prose';
export const STAGE22_PRECHECK_SCHEMA = 'narrator_start_code_precheck';
export const STAGE22_RESULT_SCHEMA = 'stage22_narrator_prose_result';

export const STAGE22_ALLOWED_STATUSES = Object.freeze(['drafted', 'blocked', 'requires_repair']);
export const STAGE22_ALLOWED_ACTION_KINDS = Object.freeze(['move', 'inspect', 'ask', 'listen', 'wait', 'take', 'open', 'rest', 'warm_up', 'hide', 'trade', 'other']);
export const STAGE22_ALLOWED_BASES = Object.freeze(['visible', 'audible', 'known', 'inferred']);
export const STAGE22_ALLOWED_RISK_HINTS = Object.freeze(['none', 'low', 'medium', 'high', 'unknown']);
export const STAGE22_ALLOWED_BLOCK_REASONS = Object.freeze(['visible_context_audit_not_passed', 'narrator_input_invalid', 'no_visible_context', 'policy_conflict']);

export const STAGE23_INPUT_SCHEMA = 'narrator_prose_audit_input';
export const STAGE23_PRECHECK_SCHEMA = 'narrator_prose_code_precheck';
export const STAGE23_AUDIT_SCHEMA = 'narrator_prose_audit';
export const STAGE23_ROUTE_SCHEMA = 'narrator_prose_audit_route';
export const STAGE23_RESULT_SCHEMA = 'stage23_narrator_prose_audit_result';
export const STAGE23_UPSTREAM_REPAIR_SCHEMA = 'stage23_upstream_repair_request';
