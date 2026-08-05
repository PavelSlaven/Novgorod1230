import { validateConversationContributionPlan,
  validatePlayerConversationInput } from '@rus/npc-runtime';
import { turnFailure } from './errors.js';

const INPUT_KEYS = new Set([
  'playerRequest',
  'initialWorkingState',
  'maxContributionsPerExchange',
  'timeBudget',
  'pendingNpcExecution'
]);
const DEFAULT_EXCHANGE_LIMIT = 8;
const MAX_EXCHANGE_LIMIT = 32;

function fail(code, message, details = {}) {
  throw turnFailure(code, message, details);
}

function plainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plainRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function clone(value, code, message) {
  try {
    return structuredClone(value);
  } catch {
    fail(code, message);
  }
}

export function normalizeConversationExchangeInput(input) {
  if (!plainRecord(input)
      || Object.keys(input).some((key) => !INPUT_KEYS.has(key))
      || !Object.hasOwn(input, 'playerRequest')
      || !Object.hasOwn(input, 'initialWorkingState')
      || !validatePlayerConversationInput(input.playerRequest)) {
    fail(
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'Conversation exchange input must contain an exact formal player request and working state'
    );
  }
  const maxContributionsPerExchange = input.maxContributionsPerExchange
    ?? DEFAULT_EXCHANGE_LIMIT;
  if (!Number.isSafeInteger(maxContributionsPerExchange)
      || maxContributionsPerExchange < 1
      || maxContributionsPerExchange > MAX_EXCHANGE_LIMIT) {
    fail(
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'maxContributionsPerExchange must be a positive safe integer no greater than 32'
    );
  }
  const timeBudget = input.timeBudget;
  const pendingNpcExecution = input.pendingNpcExecution ?? null;
  const exactEndResume = pendingNpcExecution !== null
    && timeBudget?.total_minutes === 0
    && timeBudget?.contribution_slots === 1
    && pendingNpcExecution.remaining_minutes === 0
    && pendingNpcExecution.remaining_exchange_minutes === 0
    && pendingNpcExecution.remaining_responder_refs?.length === 0;
  if (!exactKeys(timeBudget, ['total_minutes', 'contribution_slots'])
      || !Number.isSafeInteger(timeBudget.total_minutes)
      || (timeBudget.total_minutes < 1 && !exactEndResume)
      || !Number.isSafeInteger(timeBudget.contribution_slots)
      || timeBudget.contribution_slots < 1
      || timeBudget.contribution_slots > maxContributionsPerExchange
      || (timeBudget.contribution_slots > timeBudget.total_minutes
        && !exactEndResume)) {
    fail(
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'timeBudget must define one positive whole-exchange budget and bounded contribution slots'
    );
  }
  if (pendingNpcExecution !== null
      && (!exactKeys(pendingNpcExecution, [
        'plan', 'boundary_id', 'contribution_index', 'remaining_minutes',
        'remaining_exchange_minutes', 'remaining_responder_refs',
        'same_time_batch_ref', 'source_decision_trace_ref'
      ])
        || !validateConversationContributionPlan(pendingNpcExecution.plan)
        || typeof pendingNpcExecution.boundary_id !== 'string'
        || pendingNpcExecution.boundary_id.length === 0
        || !Number.isSafeInteger(pendingNpcExecution.contribution_index)
        || pendingNpcExecution.contribution_index < 2
        || !Number.isSafeInteger(pendingNpcExecution.remaining_minutes)
        || pendingNpcExecution.remaining_minutes < 0
        || !Number.isSafeInteger(
          pendingNpcExecution.remaining_exchange_minutes)
        || pendingNpcExecution.remaining_exchange_minutes
          < pendingNpcExecution.remaining_minutes
        || pendingNpcExecution.remaining_exchange_minutes
          !== timeBudget.total_minutes
        || !Array.isArray(pendingNpcExecution.remaining_responder_refs)
        || pendingNpcExecution.remaining_responder_refs.some((reference) =>
          reference?.entity_kind !== 'npc'
            || typeof reference.entity_id !== 'string'
            || reference.entity_id.length === 0)
        || pendingNpcExecution.remaining_responder_refs.length + 1
          !== timeBudget.contribution_slots
        || pendingNpcExecution.same_time_batch_ref?.entity_kind
          !== 'temporal_batch'
        || typeof pendingNpcExecution.same_time_batch_ref?.entity_id
          !== 'string'
        || pendingNpcExecution.same_time_batch_ref.entity_id.length === 0
        || pendingNpcExecution.source_decision_trace_ref?.entity_kind
          !== 'npc_decision_trace'
        || typeof pendingNpcExecution.source_decision_trace_ref?.entity_id
          !== 'string')) {
    fail(
      'TURN_CONVERSATION_PENDING_NPC_EXECUTION_INVALID',
      'Pending NPC execution must contain one exact persisted plan and remaining duration'
    );
  }
  if (!plainRecord(input.initialWorkingState)) {
    fail('TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'initialWorkingState must be a plain cloneable object');
  }
  return {
    playerRequest: clone(input.playerRequest,
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'playerRequest must be cloneable'),
    initialWorkingState: clone(input.initialWorkingState,
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'initialWorkingState must be a plain cloneable object'),
    maxContributionsPerExchange,
    timeBudget: structuredClone(timeBudget),
    pendingNpcExecution: pendingNpcExecution === null ? null
      : clone(pendingNpcExecution,
        'TURN_CONVERSATION_PENDING_NPC_EXECUTION_INVALID',
        'Pending NPC execution must be cloneable')
  };
}
