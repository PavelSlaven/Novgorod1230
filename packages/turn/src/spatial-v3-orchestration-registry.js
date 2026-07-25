import { clone, fail, freeze, record, sealed, text } from './spatial-v3-orchestration-core.js';

export const SPATIAL_V3_COMMAND_KINDS = Object.freeze([
  'path_query', 'prepare_target', 'resolve_frontier', 'activate_plan',
  'immediate_action', 'timed_activity', 'timed_traversal',
  'journey_command',
  'resume_plan', 'replan', 'recover_journey',
  'board_carrier', 'disembark_carrier', 'load_carrier', 'change_cohort'
]);
const COMMANDS = new Set(SPATIAL_V3_COMMAND_KINDS);

export function createSpatialV3CommandRegistry(handlers = {}) {
  if (!record(handlers) || Object.keys(handlers).some((key) => !COMMANDS.has(key)) ||
    SPATIAL_V3_COMMAND_KINDS.some((kind) => typeof handlers[kind] !== 'function')) {
    throw new TypeError('P21 registry requires exactly one handler for every known v3 command kind.');
  }
  return freeze({
    command_kinds: [...SPATIAL_V3_COMMAND_KINDS],
    async dispatch(command) {
      const allowed = new Set(['party_id', 'command_id', 'command_kind', 'idempotency_key', 'command_payload', 'canonical_digest']);
      if (!record(command) || Object.keys(command).some((key) => !allowed.has(key)) || !text(command.party_id) || !text(command.command_id) || !text(command.idempotency_key) || !COMMANDS.has(command.command_kind) || !sealed(command) ||
        (command.command_payload != null && !sealed(command.command_payload))) {
        return fail('route_plan_version_pin_missing', command?.party_id, { stage: 'command_registry' });
      }
      const result = await handlers[command.command_kind](freeze(clone(command)));
      if (!record(result) || typeof result.ok !== 'boolean') return fail('generated_schema_mismatch', command.party_id, { stage: 'command_registry', command_kind: command.command_kind });
      return freeze(clone(result));
    }
  });
}
