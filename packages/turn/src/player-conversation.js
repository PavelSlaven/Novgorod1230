import { deepFreeze } from '@rus/kernel';
import {
  validatePlayerConversationContributionPlan,
  validatePlayerConversationInput
} from '@rus/npc-runtime';
import { turnFailure } from './errors.js';

function immutableClone(value) {
  return deepFreeze(structuredClone(value));
}

function fail(code, message, details = {}) {
  throw turnFailure(code, message, details);
}

function causeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function repairContext(rawPlan) {
  let originalOutput = null;
  try {
    originalOutput = structuredClone(rawPlan);
  } catch {
    // A non-cloneable response is structurally invalid and is represented as null.
  }
  return immutableClone({
    original_output: originalOutput,
    validation_errors: [{
      code: 'conversation_contribution_schema_invalid',
      path: '$',
      message: 'Response must match player_conversation_contribution_plan_v1 exactly.'
    }]
  });
}

export async function requestPlayerConversationContribution({
  request,
  conversationModel,
  revalidateStateVersion
} = {}) {
  if (!validatePlayerConversationInput(request)) {
    fail(
      'TURN_CONVERSATION_REQUEST_INVALID',
      'request must match player_conversation_input_v1 exactly'
    );
  }
  if (typeof conversationModel !== 'function') {
    fail(
      'TURN_CONVERSATION_MODEL_MISSING',
      'conversationModel must be a function'
    );
  }
  if (typeof revalidateStateVersion !== 'function') {
    fail(
      'TURN_CONVERSATION_STATE_REVALIDATOR_MISSING',
      'revalidateStateVersion must be a function'
    );
  }

  const safeRequest = immutableClone(request);
  let rawPlan;
  try {
    rawPlan = await conversationModel(safeRequest, immutableClone({ repair: null }));
  } catch (error) {
    throw turnFailure(
      'TURN_CONVERSATION_MODEL_FAILED',
      'Player conversation model request failed',
      { cause: causeMessage(error) }
    );
  }

  if (!validatePlayerConversationContributionPlan(rawPlan, safeRequest)) {
    try {
      rawPlan = await conversationModel(safeRequest, immutableClone({
        repair: repairContext(rawPlan)
      }));
    } catch (error) {
      throw turnFailure(
        'TURN_CONVERSATION_MODEL_FAILED',
        'Player conversation format repair request failed',
        { cause: causeMessage(error) }
      );
    }
    if (!validatePlayerConversationContributionPlan(rawPlan, safeRequest)) {
      fail(
        'TURN_CONVERSATION_PLAN_INVALID',
        'Conversation model response and its format repair must match the request'
      );
    }
  }
  const plan = immutableClone(rawPlan);

  let currentStateVersion;
  try {
    currentStateVersion = await revalidateStateVersion(immutableClone({
      request_id: safeRequest.request_id,
      conversation_id: safeRequest.conversation_id,
      expected_state_version: safeRequest.state_version
    }));
  } catch (error) {
    throw turnFailure(
      'TURN_CONVERSATION_STATE_REVALIDATION_FAILED',
      'Conversation state version could not be revalidated after planning',
      { cause: causeMessage(error) }
    );
  }

  if (!Number.isSafeInteger(currentStateVersion) || currentStateVersion < 1) {
    fail(
      'TURN_CONVERSATION_STATE_REVALIDATION_INVALID',
      'revalidateStateVersion must return a positive safe integer'
    );
  }
  if (currentStateVersion !== safeRequest.state_version) {
    fail(
      'TURN_CONVERSATION_STATE_STALE',
      'Player conversation plan was produced from a stale state version',
      {
        expected_state_version: safeRequest.state_version,
        current_state_version: currentStateVersion
      }
    );
  }

  return immutableClone({ status: 'planned', plan });
}
