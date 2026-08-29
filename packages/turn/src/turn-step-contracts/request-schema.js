import { deepFreeze } from '@rus/kernel';

const textSchema = { type: 'string', minLength: 1 };
const refSchema = { type: 'string', minLength: 1 };

function strictObject(required, properties) {
  return { type: 'object', additionalProperties: false, required, properties };
}

const jsonDataDefinitions = {
  json_object: {
    type: 'object',
    additionalProperties: { $ref: '#/$defs/json_data' }
  },
  json_data: {
    anyOf: [
      { type: 'null' },
      { type: 'boolean' },
      { type: 'number' },
      { type: 'string' },
      { type: 'array', items: { $ref: '#/$defs/json_data' } },
      { $ref: '#/$defs/json_object' }
    ]
  }
};

export const TURN_STEP_REQUEST_V1_SCHEMA = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:rus:turn:turn_step_request_v1',
  ...strictObject([
    'schema', 'request_id', 'root_turn_id', 'committed_state_version',
    'working_revision', 'step_index', 'max_internal_steps',
    'root_player_action', 'remaining_intent', 'completed_steps', 'actor',
    'player_safe_state'
  ], {
    schema: { const: 'turn_step_request_v1' },
    request_id: textSchema,
    root_turn_id: textSchema,
    committed_state_version: { type: 'integer', minimum: 0 },
    working_revision: { type: 'integer', minimum: 0 },
    step_index: { type: 'integer', minimum: 1, maximum: 8 },
    max_internal_steps: { const: 8 },
    root_player_action: textSchema,
    remaining_intent: textSchema,
    completed_steps: {
      type: 'array',
      maxItems: 7,
      items: { $ref: '#/$defs/completed_step' }
    },
    actor: { $ref: '#/$defs/json_object' },
    player_safe_state: { $ref: '#/$defs/json_object' },
    available_domain_operations: {
      type: 'array', items: { $ref: '#/$defs/json_object' }
    },
    prepared_followup_candidates: {
      type: 'array', items: { $ref: '#/$defs/prepared_followup_candidate' }
    }
  }),
  $defs: {
    ...jsonDataDefinitions,
    completed_step: strictObject(['step_index', 'summary'], {
      step_index: { type: 'integer', minimum: 1, maximum: 7 },
      summary: textSchema
    }),
    prepared_followup_candidate: strictObject([
      'prepared_followup_ref', 'precursor_operation', 'operation'
    ], {
      prepared_followup_ref: refSchema,
      precursor_operation: { $ref: '#/$defs/json_object' },
      operation: { $ref: '#/$defs/json_object' }
    })
  }
});
