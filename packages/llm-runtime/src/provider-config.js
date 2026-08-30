import { conversationTurnRoleDefaults } from
  './conversation-role-defaults.js';
import { autonomousTurnRoleDefaults } from
  './autonomous-role-defaults.js';
import { CombatTurnRuntimeRoles, combatTurnRoleDefaults } from
  './combat-role-defaults.js';
import { applyProviderOverrides, normalizeBaseUrl, normalizeRequestUrl, resolveRuntimeProviderOverride } from
  './provider-request.js';

const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

export const LLM_SCOPES = Object.freeze({
  TURN_RUNTIME: 'turn_runtime',
  PORTRAIT_LAB: 'portrait_lab'
});

export const OutputContractModes = Object.freeze({
  PLAIN_TEXT: 'plain_text',
  JSON_OBJECT: 'json_object',
  JSON_OBJECT_WITH_SCHEMA: 'json_object_with_schema',
  JSON_REPAIR: 'json_repair'
});

export const TurnRuntimeRoles = Object.freeze({
  INTENT_ROUTER: 'intent_router',
  TURN_STEP_PLANNER: 'turn_step_planner',
  TURN_STEP_PLANNER_REPAIR: 'turn_step_planner_repair',
  GAMEPLAY_NARRATOR: 'gameplay_narrator',
  GAMEPLAY_NARRATOR_REPAIR: 'gameplay_narrator_format_repair',
  GAMEPLAY_NARRATOR_AUDITOR: 'gameplay_narrator_auditor',
  GAMEPLAY_NARRATOR_SEMANTIC_REPAIR: 'gameplay_narrator_semantic_repair',
  WORLD_PROCESS_STEP: 'world_process_step',
  ORDINARY_MATERIALIZATION: 'ordinary_materialization',
  SPATIAL_SEMANTIC_DESCRIPTOR: 'spatial_semantic_descriptor',
  PLAYER_CONVERSATION_INTERPRETER: 'player_conversation_interpreter',
  PLAYER_CONVERSATION_INTERPRETER_REPAIR:
    'player_conversation_interpreter_format_repair',
  NPC_CONVERSATION_RESPONDER: 'npc_conversation_responder',
  NPC_CONVERSATION_RESPONDER_REPAIR:
    'npc_conversation_responder_format_repair',
  NPC_AUTONOMOUS_DECIDER: 'npc_autonomous_decider',
  NPC_AUTONOMOUS_DECIDER_REPAIR:
    'npc_autonomous_decider_format_repair',
  ...CombatTurnRuntimeRoles
});

export const PortraitLabRoles = Object.freeze({
  SPEC_NORMALIZER: 'portrait_spec_normalizer'
});

const PORTRAIT_ROLE_DEFAULTS = Object.freeze({
  [PortraitLabRoles.SPEC_NORMALIZER]: {
    envPrefix: 'PORTRAIT_SPEC_NORMALIZER', model: 'deepseek-v4-flash', thinking: 'disabled', reasoningEffort: null,
    responseFormat: 'json_object', maxTokens: 1600, temperature: 0, topP: 1, outputContractMode: OutputContractModes.JSON_OBJECT_WITH_SCHEMA,
    expectedSchema: 'portrait_spec_v1', parseJson: true, targetInputTokens: 4000, comfortableInputTokens: 8000,
    hardInputLimitTokens: 16000, reserveOutputTokens: 1600, reserveRepairTokens: 0
  }
});

const TURN_ROLE_DEFAULTS = Object.freeze({
  [TurnRuntimeRoles.INTENT_ROUTER]: {
    envPrefix: 'TURN_INTENT_ROUTER', model: 'deepseek-v4-flash', thinking: 'disabled', reasoningEffort: null,
    responseFormat: 'json_object', maxTokens: 2500, outputContractMode: OutputContractModes.JSON_OBJECT_WITH_SCHEMA, expectedSchema: 'turn_intent_route', parseJson: true,
    targetInputTokens: 20000, comfortableInputTokens: 20000, hardInputLimitTokens: 80000, reserveOutputTokens: 2500, reserveRepairTokens: 10000
  },
  [TurnRuntimeRoles.TURN_STEP_PLANNER]: {
    envPrefix: 'TURN_STEP_PLANNER',
    model: 'deepseek-v4-flash',
    thinking: 'disabled',
    reasoningEffort: null,
    responseFormat: 'json_object',
    maxTokens: 8000,
    outputContractMode: OutputContractModes.JSON_OBJECT,
    expectedSchema: null,
    parseJson: true,
    targetInputTokens: 100000,
    comfortableInputTokens: 220000,
    hardInputLimitTokens: 600000,
    reserveOutputTokens: 8000,
    reserveRepairTokens: 30000
  },
  [TurnRuntimeRoles.TURN_STEP_PLANNER_REPAIR]: {
    envPrefix: 'TURN_STEP_PLANNER_REPAIR', model: 'deepseek-v4-flash', thinking: 'disabled', reasoningEffort: null,
    responseFormat: 'json_object', maxTokens: 4000, temperature: 0, topP: 1, outputContractMode: OutputContractModes.JSON_REPAIR,
    expectedSchema: null, parseJson: true, targetInputTokens: 30000, comfortableInputTokens: 30000,
    hardInputLimitTokens: 100000, reserveOutputTokens: 4000, reserveRepairTokens: 4000
  },
  [TurnRuntimeRoles.GAMEPLAY_NARRATOR]: {
    envPrefix: 'TURN_GAMEPLAY_NARRATOR', model: 'deepseek-v4-flash', thinking: 'disabled', reasoningEffort: null,
    responseFormat: 'json_object', maxTokens: 1800, temperature: 0, topP: 1, outputContractMode: OutputContractModes.JSON_OBJECT,
    expectedSchema: null, parseJson: true, targetInputTokens: 12000, comfortableInputTokens: 24000,
    hardInputLimitTokens: 60000, reserveOutputTokens: 1800, reserveRepairTokens: 1800
  },
  [TurnRuntimeRoles.GAMEPLAY_NARRATOR_REPAIR]: {
    envPrefix: 'TURN_GAMEPLAY_NARRATOR_REPAIR', model: 'deepseek-v4-flash', thinking: 'disabled', reasoningEffort: null,
    responseFormat: 'json_object', maxTokens: 1800, temperature: 0, topP: 1, outputContractMode: OutputContractModes.JSON_REPAIR,
    expectedSchema: null, parseJson: true, targetInputTokens: 12000, comfortableInputTokens: 24000,
    hardInputLimitTokens: 60000, reserveOutputTokens: 1800, reserveRepairTokens: 1800
  },
  [TurnRuntimeRoles.GAMEPLAY_NARRATOR_AUDITOR]: {
    envPrefix: 'TURN_GAMEPLAY_NARRATOR_AUDITOR', model: 'deepseek-v4-flash', thinking: 'disabled', reasoningEffort: null,
    responseFormat: 'json_object', maxTokens: 800, temperature: 0, topP: 1, outputContractMode: OutputContractModes.JSON_OBJECT,
    expectedSchema: null, parseJson: true, targetInputTokens: 12000, comfortableInputTokens: 24000,
    hardInputLimitTokens: 60000, reserveOutputTokens: 800, reserveRepairTokens: 0
  },
  [TurnRuntimeRoles.GAMEPLAY_NARRATOR_SEMANTIC_REPAIR]: {
    envPrefix: 'TURN_GAMEPLAY_NARRATOR_SEMANTIC_REPAIR', model: 'deepseek-v4-flash', thinking: 'disabled', reasoningEffort: null,
    responseFormat: 'json_object', maxTokens: 1200, temperature: 0, topP: 1, outputContractMode: OutputContractModes.JSON_OBJECT,
    expectedSchema: null, parseJson: true, targetInputTokens: 12000, comfortableInputTokens: 24000,
    hardInputLimitTokens: 60000, reserveOutputTokens: 1200, reserveRepairTokens: 0
  },
  [TurnRuntimeRoles.ORDINARY_MATERIALIZATION]: {
    envPrefix: 'TURN_ORDINARY_MATERIALIZATION', model: 'deepseek-v4-flash', thinking: 'disabled', reasoningEffort: null,
    responseFormat: 'json_object', maxTokens: 6000, temperature: 0, topP: 1, outputContractMode: OutputContractModes.JSON_OBJECT_WITH_SCHEMA,
    expectedSchema: 'ordinary_materialization_plan_v1', parseJson: true, targetInputTokens: 30000, comfortableInputTokens: 30000,
    hardInputLimitTokens: 100000, reserveOutputTokens: 6000, reserveRepairTokens: 6000
  },
  [TurnRuntimeRoles.SPATIAL_SEMANTIC_DESCRIPTOR]: {
    envPrefix: 'TURN_SPATIAL_SEMANTIC_DESCRIPTOR',model:'deepseek-v4-flash',thinking:'disabled',reasoningEffort:null,
    responseFormat:'json_object',maxTokens:400,temperature:0,topP:1,outputContractMode:OutputContractModes.JSON_OBJECT_WITH_SCHEMA,
    expectedSchema:'rus.s1_spatial_semantic_proposal.v1',parseJson:true,targetInputTokens:4000,comfortableInputTokens:8000,
    hardInputLimitTokens: 30000, reserveOutputTokens: 400, reserveRepairTokens: 0
  },
  [TurnRuntimeRoles.WORLD_PROCESS_STEP]: {
    envPrefix: 'TURN_WORLD_PROCESS_STEP', model: 'deepseek-v4-flash',
    thinking: 'disabled', reasoningEffort: null,
    responseFormat: 'json_object', maxTokens: 800, temperature: 0, topP: 1,
    outputContractMode: OutputContractModes.JSON_OBJECT,
    expectedSchema: null, parseJson: true,
    targetInputTokens: 6000, comfortableInputTokens: 12000,
    hardInputLimitTokens: 30000, reserveOutputTokens: 800,
    reserveRepairTokens: 0
  },
  ...conversationTurnRoleDefaults(OutputContractModes),
  ...autonomousTurnRoleDefaults(OutputContractModes),
  ...combatTurnRoleDefaults(OutputContractModes)
});

const SCOPE_DEFAULTS = Object.freeze({
  [LLM_SCOPES.TURN_RUNTIME]: { api: 'chat.completions' },
  [LLM_SCOPES.PORTRAIT_LAB]: { api: 'chat.completions' }
});

export function getProviderConfig(env = process.env) {
  const apiKey = env.DEEPSEEK_API_KEY?.trim() ?? '';
  if (!apiKey) {
    return {
      enabled: false,
      provider: 'not_configured',
      model: null,
      baseUrl: null
    };
  }

  return {
    enabled: true,
    provider: 'deepseek',
    apiKey,
    baseUrl: normalizeBaseUrl(env.DEEPSEEK_BASE_URL),
    model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL
  };
}

export function resolveLlmExecutionConfig({ scope, roleId = null, tierId = null,
  env = process.env, overrides = null, runtimeProviderOverride = null } = {}) {
  const shared = getProviderConfig(env);
  const scopeKey = String(scope ?? '').trim();
  const scopeDefaults = SCOPE_DEFAULTS[scopeKey];
  if (!scopeDefaults) {
    return disabledResolution('provider_disabled', scopeKey, roleId, tierId);
  }

  let defaults = null;
  if (scopeKey === LLM_SCOPES.TURN_RUNTIME) {
    defaults = TURN_ROLE_DEFAULTS[String(roleId ?? '').trim()];
    if (!defaults) return disabledResolution('unknown_role', scopeKey, roleId, tierId);
  } else if (scopeKey === LLM_SCOPES.PORTRAIT_LAB) {
    defaults = PORTRAIT_ROLE_DEFAULTS[String(roleId ?? '').trim()];
    if (!defaults) return disabledResolution('unknown_role', scopeKey, roleId, tierId);
  }

  const runtimeProvider = resolveRuntimeProviderOverride(runtimeProviderOverride);
  if (!runtimeProvider.ok) {
    return disabledResolution('invalid_provider_config', scopeKey, roleId, tierId);
  }
  const provider = runtimeProvider.config;

  const config = {
    enabled: provider ? true : shared.enabled,
    scope: scopeKey,
    role_id: roleId ?? null,
    tier_id: tierId ?? null,
    provider: provider?.provider ?? (shared.enabled ? shared.provider : 'deepseek'),
    compatibility: provider?.compatibility ?? 'deepseek',
    apiKey: provider?.apiKey ?? (shared.enabled ? shared.apiKey : null),
    baseUrl: provider?.baseUrl ?? (shared.enabled ? shared.baseUrl : normalizeBaseUrl(env.DEEPSEEK_BASE_URL)),
    requestUrl: provider?.requestUrl ?? normalizeRequestUrl(shared.enabled ? shared.baseUrl : normalizeBaseUrl(env.DEEPSEEK_BASE_URL)),
    requestTimeoutMs: provider?.requestTimeoutMs ?? readPositiveInt(env[`${defaults.envPrefix}_REQUEST_TIMEOUT_MS`]) ?? readPositiveInt(env.DEEPSEEK_REQUEST_TIMEOUT_MS) ?? (scopeKey !== LLM_SCOPES.TURN_RUNTIME ? 120000 : String(roleId).includes('repair') ? 6000 : 10000),
    api: scopeDefaults.api,
    model: provider?.model ?? readRoleModel(defaults, env, shared.model),
    thinking: defaults.thinking ? { type: readText(env[`${defaults.envPrefix}_THINKING`]) || defaults.thinking } : undefined,
    reasoningEffort: defaults.reasoningEffort ? (readText(env[`${defaults.envPrefix}_REASONING_EFFORT`]) || defaults.reasoningEffort) : null,
    responseFormat: defaults.responseFormat
      ? { type: readText(env[`${defaults.envPrefix}_RESPONSE_FORMAT`]) || defaults.responseFormat }
      : undefined,
    maxTokens: readPositiveInt(env[`${defaults.envPrefix}_MAX_TOKENS`]) ?? defaults.maxTokens,
    temperature: readNumber(env[`${defaults.envPrefix}_TEMPERATURE`]) ?? defaults.temperature ?? null,
    topP: readNumber(env[`${defaults.envPrefix}_TOP_P`]) ?? defaults.topP ?? null,
    contextBudget: buildContextBudget({
      ...defaults,
      targetInputTokens: readPositiveInt(env[`${defaults.envPrefix}_TARGET_INPUT_TOKENS`]) ?? defaults.targetInputTokens,
      comfortableInputTokens: readPositiveInt(env[`${defaults.envPrefix}_COMFORTABLE_INPUT_TOKENS`]) ?? defaults.comfortableInputTokens,
      hardInputLimitTokens: readPositiveInt(env[`${defaults.envPrefix}_HARD_INPUT_LIMIT_TOKENS`]) ?? defaults.hardInputLimitTokens,
      reserveOutputTokens: readPositiveInt(env[`${defaults.envPrefix}_RESERVE_OUTPUT_TOKENS`]) ?? defaults.reserveOutputTokens,
      reserveRepairTokens: readPositiveInt(env[`${defaults.envPrefix}_RESERVE_REPAIR_TOKENS`]) ?? defaults.reserveRepairTokens
    }),
    outputContractMode: defaults.outputContractMode,
    expectedSchema: defaults.expectedSchema ?? null,
    parseJson: defaults.parseJson === true
  };

  applyProviderOverrides(config, overrides);
  applyRuntimeSafetyNormalization(config);

  if (!config.enabled) {
    return {
      enabled: false,
      reason: 'missing_api_key',
      scope: scopeKey,
      role_id: roleId ?? null,
      tier_id: tierId ?? null
    };
  }

  return { enabled: true, config };
}

function disabledResolution(reason, scope, roleId, tierId) {
  return {
    enabled: false,
    reason,
    scope,
    role_id: roleId ?? null,
    tier_id: tierId ?? null
  };
}

function readRoleModel(defaults, env, sharedModel) {
  const roleModel = readText(env[`${defaults.envPrefix}_MODEL`]);
  if (roleModel) return roleModel;
  if (defaults.model && defaults.model !== DEFAULT_DEEPSEEK_MODEL) return defaults.model;
  return sharedModel ?? defaults.model ?? DEFAULT_DEEPSEEK_MODEL;
}

function applyRuntimeSafetyNormalization(config) {
  if (config.outputContractMode === OutputContractModes.PLAIN_TEXT) {
    config.parseJson = false;
    delete config.responseFormat;
    return;
  }
  config.parseJson = true;
  config.responseFormat = { type: 'json_object' };
}

function buildContextBudget(defaults) {
  if (!defaults || typeof defaults !== 'object') return null;
  return {
    targetInputTokens: defaults.targetInputTokens ?? null,
    comfortableInputTokens: defaults.comfortableInputTokens ?? null,
    hardInputLimitTokens: defaults.hardInputLimitTokens ?? null,
    reserveOutputTokens: defaults.reserveOutputTokens ?? null,
    reserveRepairTokens: defaults.reserveRepairTokens ?? null
  };
}

function readText(value) { return String(value ?? '').trim(); }

function readPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function readNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
