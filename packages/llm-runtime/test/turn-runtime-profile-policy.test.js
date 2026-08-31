import assert from 'node:assert/strict';
import test from 'node:test';

import * as llmRuntime from '../src/index.js';
import { LLM_SCOPES, TurnRuntimeRoles, resolveLlmExecutionConfig } from '../src/provider-config.js';

const env = { DEEPSEEK_API_KEY: 'test-key' };
const customProvider = {
  compatibility: 'openai_compatible',
  baseUrl: 'http://127.0.0.1:8000/v1',
  model: 'local-model'
};

test('all production turn roles use Flash no-reasoning defaults and bounded timeouts', () => {
  for (const roleId of Object.values(TurnRuntimeRoles)) {
    const { config } = resolveLlmExecutionConfig({ scope: 'turn_runtime', roleId, env });
    assert.equal(config.model, 'deepseek-v4-flash', roleId);
    assert.deepEqual(config.thinking, { type: 'disabled' }, roleId);
    assert.equal(config.reasoningEffort, null, roleId);
    assert.equal(config.requestTimeoutMs, roleId.includes('repair') ? 6000 : 10000, roleId);
  }
});

test('custom provider keeps its model instead of turn default model', () => {
  const { config } = resolveLlmExecutionConfig({
    scope: 'turn_runtime', roleId: TurnRuntimeRoles.TURN_STEP_PLANNER,
    env, runtimeProviderOverride: customProvider
  });
  assert.equal(config.model, 'local-model');
  assert.equal(config.provider, 'openai_compatible');
});

test('semantic-choice roles do not require public DTO schemas from models', () => {
  for (const roleId of [TurnRuntimeRoles.TURN_STEP_PLANNER,
    TurnRuntimeRoles.TURN_STEP_PLANNER_REPAIR,
    TurnRuntimeRoles.NPC_AUTONOMOUS_DECIDER,
    TurnRuntimeRoles.NPC_AUTONOMOUS_DECIDER_REPAIR,
    TurnRuntimeRoles.NPC_COMBAT_DECIDER,
    TurnRuntimeRoles.NPC_COMBAT_DECIDER_REPAIR,
    TurnRuntimeRoles.WORLD_PROCESS_STEP,
    TurnRuntimeRoles.PLAYER_CONVERSATION_INTERPRETER,
    TurnRuntimeRoles.PLAYER_CONVERSATION_INTERPRETER_REPAIR,
    TurnRuntimeRoles.NPC_CONVERSATION_RESPONDER,
    TurnRuntimeRoles.NPC_CONVERSATION_RESPONDER_REPAIR,
    TurnRuntimeRoles.GAMEPLAY_NARRATOR,
    TurnRuntimeRoles.GAMEPLAY_NARRATOR_REPAIR,
    TurnRuntimeRoles.GAMEPLAY_NARRATOR_AUDITOR,
    TurnRuntimeRoles.GAMEPLAY_NARRATOR_SEMANTIC_REPAIR]) {
    const { config } = resolveLlmExecutionConfig({
      scope: 'turn_runtime', roleId, env
    });
    assert.equal(config.expectedSchema, null, roleId);
  }
});

test('public runtime policy excludes retired legacy and new-game LLM families', () => {
  assert.deepEqual(Object.values(LLM_SCOPES).sort(), ['portrait_lab', 'turn_runtime']);
  assert.equal('LegacyWorldRoles' in llmRuntime, false);
  assert.equal('NewGameVisibleContextRoles' in llmRuntime, false);
  assert.equal('NewGameKnowledgeHiddenRoles' in llmRuntime, false);
  assert.equal('NewGameG5PlacementRoles' in llmRuntime, false);
  for (const retiredRole of ['orchestrator', 'auditor', 'format_repairer']) {
    assert.equal(Object.values(TurnRuntimeRoles).includes(retiredRole), false);
  }
  assert.equal(resolveLlmExecutionConfig({
    scope: 'legacy_world', roleId: 'legacy.narrator.dossier', env
  }).reason, 'provider_disabled');
  assert.equal(resolveLlmExecutionConfig({
    scope: 'new_game', tierId: 'tier_1_fast', env
  }).reason, 'provider_disabled');
});
