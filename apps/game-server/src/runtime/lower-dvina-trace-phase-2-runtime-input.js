import { serverError } from '../errors.js';

export function createStateVersionRevalidator({
  repository,
  partyId,
  idempotencyKey
}) {
  return async function revalidateStateVersion() {
    const current = await repository.loadPhase2State(partyId, {
      presentationIdempotencyKey: idempotencyKey
    });
    return current.party_state?.state_version;
  };
}

export async function executeTraceTurnWithAutonomousRetry(executeAttempt) {
  try {
    return await executeAttempt();
  } catch (error) {
    if (error?.code !== 'TRACE_PHASE_7_AUTONOMOUS_RETRY_REQUIRED') {
      throw error;
    }
  }
  return executeAttempt();
}

export function validateConversationDependencies({
  scenarioDefinitionRevision,
  playerConversationModel,
  npcSemanticModel
}) {
  if (![14, 15, 16, 17].includes(scenarioDefinitionRevision)) return;
  if (typeof playerConversationModel !== 'function'
      || typeof npcSemanticModel !== 'function') {
    throw serverError(
      'TRACE_M2_CONVERSATION_DEPENDENCY_MISSING',
      'The active semantic revision requires its player and NPC models.',
      { status: 503 }
    );
  }
}

export function validatePhase2RuntimeDependencies({
  repository,
  semanticResolver,
  narrator,
  randomSourceFactory,
  decisionSecret
}) {
  const repositoryMethods = [
    'loadPhase2State',
    'commitPhase2Turn',
    'loadPhase2VisibleContext',
    'persistPhase2Screen',
    'loadPhase2Replay'
  ];
  if (!repository
      || repositoryMethods.some(
        (name) => typeof repository[name] !== 'function'
      )) {
    throw new TypeError('Lower Dvina Phase 2 repository ports are required.');
  }
  if (typeof semanticResolver !== 'function'
      || typeof narrator?.run !== 'function'
      || typeof randomSourceFactory !== 'function'
      || !String(decisionSecret ?? '').trim()) {
    throw serverError(
      'TRACE_PHASE_2_DEPENDENCY_MISSING',
      'Phase 2 requires semantic, narration, RNG and bounded-decision ports.',
      { status: 503 }
    );
  }
}

export function requiredTraceTurnText(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw serverError(
      code,
      'Required trace turn identity is missing.',
      { status: 400 }
    );
  }
  return normalized;
}
