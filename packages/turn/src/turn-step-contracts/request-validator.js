import {
  add,
  constant,
  integer,
  jsonProjection,
  requiredText,
  result,
  strict
} from './validation.js';

export function validateTurnStepRequest(value) {
  const errors = [];
  if (!strict(value, '$', [
    'schema', 'request_id', 'root_turn_id', 'committed_state_version',
    'working_revision', 'step_index', 'max_internal_steps',
    'root_player_action', 'remaining_intent', 'completed_steps', 'actor',
    'player_safe_state'
  ], errors)) return result(errors);
  constant(value.schema, 'turn_step_request_v1', '$.schema', errors);
  requiredText(value.request_id, '$.request_id', errors);
  requiredText(value.root_turn_id, '$.root_turn_id', errors);
  integer(value.committed_state_version, 0,
    '$.committed_state_version', errors);
  integer(value.working_revision, 0, '$.working_revision', errors);
  integer(value.step_index, 1, '$.step_index', errors);
  constant(value.max_internal_steps, 8, '$.max_internal_steps', errors);
  requiredText(value.root_player_action, '$.root_player_action', errors);
  requiredText(value.remaining_intent, '$.remaining_intent', errors);
  if (!Array.isArray(value.completed_steps)) {
    add(errors, '$.completed_steps', 'type', 'must be an array');
  } else {
    value.completed_steps.forEach((step, index) => {
      const path = `$.completed_steps[${index}]`;
      if (!strict(step, path, ['step_index', 'summary'], errors)) return;
      integer(step.step_index, 1, `${path}.step_index`, errors);
      requiredText(step.summary, `${path}.summary`, errors);
      if (step.step_index !== index + 1) {
        add(errors, `${path}.step_index`, 'sequence',
          'must be consecutive from 1');
      }
    });
  }
  jsonProjection(value.actor, '$.actor', errors);
  jsonProjection(value.player_safe_state, '$.player_safe_state', errors);
  if (Number.isInteger(value.step_index) && value.step_index > 8) {
    add(errors, '$.step_index', 'maximum', 'must be <= 8');
  }
  if (Array.isArray(value.completed_steps)
      && Number.isInteger(value.step_index)
      && value.completed_steps.length !== value.step_index - 1) {
    add(errors, '$.completed_steps', 'lineage',
      'length must equal step_index - 1');
  }
  if (Array.isArray(value.completed_steps)
      && Number.isInteger(value.working_revision)
      && value.working_revision !== value.completed_steps.length) {
    add(errors, '$.working_revision', 'lineage',
      'must equal completed_steps length');
  }
  return result(errors);
}
