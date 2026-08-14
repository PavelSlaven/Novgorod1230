import { TURN_STEP_PLAN_V1_SCHEMA } from '@rus/turn';

export const TURN_STEP_PLAN_SCHEMA_PROMPT = JSON.stringify(
  TURN_STEP_PLAN_V1_SCHEMA
);

export const NARRATION_OUTPUT_CONTRACT_PROMPT = [
  'Return exactly one JSON object with only these keys: version, schema,',
  'output_id, prose, action_options, used_references, self_check.',
  'version must be 1; schema must be "narration_output"; output_id and',
  'prose must be non-empty strings; action_options and used_references must',
  'be arrays; self_check must be an object.'
].join(' ');

export const NARRATION_AUDIT_CONTRACT_PROMPT = [
  'Return exactly one compact JSON object with only these keys: version,',
  'schema, pass, concerns, evidence. version must be 1; schema must be',
  '"narration_audit"; pass must be boolean; concerns and evidence must be',
  'arrays. When pass is true, concerns must be empty and evidence non-empty.',
  'When pass is false, concerns must be non-empty. Keep evidence concise;',
  'never echo the full request or draft.'
].join(' ');
