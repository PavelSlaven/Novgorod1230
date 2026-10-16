import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTurnAvailableActionSet,
  createTurnCommandRegistry,
  resolveTurnSemanticIntent
} from '../../turn/src/command-registry.js';
import {
  OutputContractModes,
  TurnRuntimeRoles,
  resolveLlmExecutionConfig
} from '../src/provider-config.js';

async function semanticActionSet() {
  const registry = createTurnCommandRegistry([{
    command_id: 'inspect-command',
    option_id: 'inspect_wreck_in_detail',
    label: 'Осмотреть',
    matches: () => false,
    mode: {},
    availability: () => ({
      status: 'available',
      can_attempt: true,
      check_requests: []
    }),
    consequence() {},
    writeTargets() {}
  }]);
  return createTurnAvailableActionSet({
    registry,
    committedState: { state_version: 2 },
    actorId: 'mikula',
    policyPins: []
  });
}

function semanticArgs(actionSet, semanticResolver) {
  return {
    rawText: 'свободная формулировка',
    actionSet,
    semanticResolver,
    stateVersion: 2,
    policyVersion: '1',
    requestId: 'intent-router-contract',
    partyId: 'party-1',
    decisionSecret: 'semantic-secret',
    issuedAt: '2026-07-12T10:00:00.000Z',
    expiresAt: '2026-07-12T10:05:00.000Z',
    decisionNow: () => '2026-07-12T10:01:00.000Z'
  };
}

test('intent_router registry metadata matches @rus/turn semantic resolver caller validation', async () => {
  const { config } = resolveLlmExecutionConfig({
    scope: 'turn_runtime',
    roleId: TurnRuntimeRoles.INTENT_ROUTER,
    env: { LLM_BASE_URL: 'http://127.0.0.1:8000/v1' }
  });
  assert.equal(config.expectedSchema, null);
  assert.equal(config.outputContractMode, OutputContractModes.JSON_OBJECT);
  assert.notEqual(config.expectedSchema, 'turn_intent_route');

  const actionSet = await semanticActionSet();
  const routeShaped = {
    schema: 'turn_intent_route',
    candidate_primary_mode: 'attention'
  };
  await assert.rejects(
    () => resolveTurnSemanticIntent(semanticArgs(actionSet, async () => routeShaped)),
    { code: 'TURN_SEMANTIC_RESULT_INVALID' }
  );
  const resolved = await resolveTurnSemanticIntent(semanticArgs(
    actionSet,
    async () => ({ option_id: 'inspect_wreck_in_detail' })
  ));
  assert.equal(resolved.option_id, 'inspect_wreck_in_detail');
});
