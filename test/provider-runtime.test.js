import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNewGameLlmTierConfig,
  getTurnRoleConfig,
  LLM_SCOPES,
  LegacyWorldRoles,
  OutputContractModes,
  resolveLlmExecutionConfig
} from '../src/world/provider-config.js';
import { executeRoleLlmCall } from '../src/world/provider-runtime.js';
import {
  TurnRuntimeRoles,
  resolveLlmExecutionConfig as resolvePackageLlmExecutionConfig
} from '@rus/llm-runtime';

test('turn step planner roles expose exact JSON planning and repair contracts', () => {
  assert.equal(TurnRuntimeRoles.TURN_STEP_PLANNER, 'turn_step_planner');
  assert.equal(
    TurnRuntimeRoles.TURN_STEP_PLANNER_REPAIR,
    'turn_step_planner_repair'
  );

  const env = { DEEPSEEK_API_KEY: 'test-key' };
  const planner = resolvePackageLlmExecutionConfig({
    scope: 'turn_runtime',
    roleId: TurnRuntimeRoles.TURN_STEP_PLANNER,
    env
  });
  const repair = resolvePackageLlmExecutionConfig({
    scope: 'turn_runtime',
    roleId: TurnRuntimeRoles.TURN_STEP_PLANNER_REPAIR,
    env
  });
  const prefixedModels = {
    ...env,
    TURN_STEP_PLANNER_MODEL: 'planner-model',
    TURN_STEP_PLANNER_REPAIR_MODEL: 'repair-model'
  };

  assert.equal(planner.enabled, true);
  assert.equal(planner.config.model, 'deepseek-v4-pro');
  assert.deepEqual(planner.config.thinking, { type: 'enabled' });
  assert.equal(planner.config.reasoningEffort, 'high');
  assert.deepEqual(planner.config.responseFormat, { type: 'json_object' });
  assert.equal(planner.config.maxTokens, 8000);
  assert.equal(
    planner.config.outputContractMode,
    'json_object_with_schema'
  );
  assert.equal(planner.config.expectedSchema, 'turn_step_plan_v1');
  assert.equal(planner.config.parseJson, true);
  assert.deepEqual(planner.config.contextBudget, {
    targetInputTokens: 100000,
    comfortableInputTokens: 220000,
    hardInputLimitTokens: 600000,
    reserveOutputTokens: 8000,
    reserveRepairTokens: 30000
  });

  assert.equal(repair.enabled, true);
  assert.equal(repair.config.model, 'deepseek-v4-flash');
  assert.deepEqual(repair.config.thinking, { type: 'disabled' });
  assert.equal(repair.config.reasoningEffort, null);
  assert.equal(repair.config.maxTokens, 4000);
  assert.equal(
    repair.config.outputContractMode,
    'json_repair'
  );
  assert.equal(repair.config.expectedSchema, 'turn_step_plan_v1');
  assert.deepEqual(repair.config.responseFormat, { type: 'json_object' });
  assert.equal(repair.config.temperature, 0);
  assert.equal(repair.config.topP, 1);
  assert.equal(repair.config.parseJson, true);
  assert.deepEqual(repair.config.contextBudget, {
    targetInputTokens: 30000,
    comfortableInputTokens: 30000,
    hardInputLimitTokens: 100000,
    reserveOutputTokens: 4000,
    reserveRepairTokens: 4000
  });
  assert.equal(resolvePackageLlmExecutionConfig({
    scope: 'turn_runtime',
    roleId: TurnRuntimeRoles.TURN_STEP_PLANNER,
    env: prefixedModels
  }).config.model, 'planner-model');
  assert.equal(resolvePackageLlmExecutionConfig({
    scope: 'turn_runtime',
    roleId: TurnRuntimeRoles.TURN_STEP_PLANNER_REPAIR,
    env: prefixedModels
  }).config.model, 'repair-model');
});

test('resolveLlmExecutionConfig applies shared scope role defaults and safe overrides in order', () => {
  const result = resolveLlmExecutionConfig({
    scope: LLM_SCOPES.TURN_RUNTIME,
    roleId: 'intent_router',
    env: {
      DEEPSEEK_API_KEY: 'test-key',
      TURN_INTENT_ROUTER_MODEL: 'router-model',
      TURN_INTENT_ROUTER_MAX_TOKENS: '2500'
    },
    overrides: {
      maxTokens: 1111,
      temperature: 0.2,
      model: 'must-be-ignored'
    }
  });

  assert.equal(result.enabled, true);
  assert.equal(result.config.model, 'router-model');
  assert.equal(result.config.maxTokens, 1111);
  assert.equal(result.config.temperature, 0.2);
  assert.equal(result.config.outputContractMode, OutputContractModes.JSON_OBJECT_WITH_SCHEMA);
  assert.equal(result.config.parseJson, true);
});

test('resolveLlmExecutionConfig returns typed disabled result for unknown role and missing key', () => {
  const unknownRole = resolveLlmExecutionConfig({
    scope: LLM_SCOPES.LEGACY_WORLD,
    roleId: 'legacy.unknown.role',
    env: { DEEPSEEK_API_KEY: 'x' }
  });
  const missingKey = resolveLlmExecutionConfig({
    scope: LLM_SCOPES.NEW_GAME,
    tierId: 'tier_2_standard',
    env: {}
  });

  assert.equal(unknownRole.enabled, false);
  assert.equal(unknownRole.reason, 'unknown_role');
  assert.equal(missingKey.enabled, false);
  assert.equal(missingKey.reason, 'missing_api_key');
});

test('role configs keep output contract mode boundaries', () => {
  const legacyDossier = resolveLlmExecutionConfig({
    scope: LLM_SCOPES.LEGACY_WORLD,
    roleId: LegacyWorldRoles.VISIBLE_CONTEXT_DOSSIER,
    env: { DEEPSEEK_API_KEY: 'x' }
  });
  const legacyAudit = resolveLlmExecutionConfig({
    scope: LLM_SCOPES.LEGACY_WORLD,
    roleId: LegacyWorldRoles.VISIBLE_CONTEXT_AUDIT,
    env: { DEEPSEEK_API_KEY: 'x' }
  });
  const turnRole = getTurnRoleConfig('orchestrator', { DEEPSEEK_API_KEY: 'x' });
  const newGameTier = getNewGameLlmTierConfig('tier_2_standard', { DEEPSEEK_API_KEY: 'x' });

  assert.equal(legacyDossier.config.outputContractMode, OutputContractModes.PLAIN_TEXT);
  assert.equal(legacyDossier.config.parseJson, false);
  assert.equal(legacyAudit.config.outputContractMode, OutputContractModes.JSON_OBJECT_WITH_SCHEMA);
  assert.equal(legacyAudit.config.parseJson, true);
  assert.equal(turnRole.outputContractMode, OutputContractModes.JSON_OBJECT_WITH_SCHEMA);
  assert.equal(newGameTier.outputContractMode, OutputContractModes.JSON_OBJECT);
});

test('executeRoleLlmCall does not treat disabled provider as successful result', async () => {
  const result = await executeRoleLlmCall({
    scope: LLM_SCOPES.TURN_RUNTIME,
    roleId: 'intent_router',
    env: {},
    messages: []
  });

  assert.equal(result.status, 'provider_disabled');
  assert.equal(result.raw_text, '');
  assert.equal(result.error.code, 'missing_api_key');
});
