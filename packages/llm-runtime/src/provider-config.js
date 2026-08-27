import { conversationTurnRoleDefaults } from
  './conversation-role-defaults.js';
import { autonomousTurnRoleDefaults } from
  './autonomous-role-defaults.js';
import { CombatTurnRuntimeRoles, combatTurnRoleDefaults } from
  './combat-role-defaults.js';
import { applyProviderOverrides, normalizeBaseUrl, normalizeRequestUrl, resolveRuntimeProviderOverride } from
  './provider-request.js';
import {
  NEW_GAME_VISIBLE_CONTEXT_ROLE_MAX_TOKENS,
  NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS,
  NewGameTierIds,
  NewGameVisibleContextRoles,
  newGameTierDefaults
} from './new-game-role-defaults.js';
export {NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS, NewGameTierIds, NewGameVisibleContextRoles };

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

export const LLM_SCOPES = Object.freeze({
  LEGACY_WORLD: 'legacy_world',
  TURN_RUNTIME: 'turn_runtime',
  NEW_GAME: 'new_game',
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
  ORCHESTRATOR: 'orchestrator',
  AUDITOR: 'auditor',
  FORMAT_REPAIRER: 'format_repairer',
  TURN_STEP_PLANNER: 'turn_step_planner',
  TURN_STEP_PLANNER_REPAIR: 'turn_step_planner_repair',
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

export const LegacyWorldRoles = Object.freeze({
  HISTORICAL_FRAME_DOSSIER: 'legacy.historical_frame.dossier',
  HISTORICAL_FRAME_AUDIT: 'legacy.historical_frame.audit',
  HISTORICAL_FRAME_SHAPER: 'legacy.historical_frame.shaper',
  HISTORICAL_FRAME_REPAIR: 'legacy.historical_frame.repair',
  SOCIAL_TISSUE_DOSSIER: 'legacy.social_tissue.dossier',
  SOCIAL_TISSUE_AUDIT: 'legacy.social_tissue.audit',
  SOCIAL_TISSUE_SHAPER: 'legacy.social_tissue.shaper',
  SOCIAL_TISSUE_REPAIR: 'legacy.social_tissue.repair',
  PLACE_SEED_DOSSIER: 'legacy.place_seed.dossier',
  PLACE_SEED_AUDIT: 'legacy.place_seed.audit',
  PLACE_SEED_REPAIR: 'legacy.place_seed.repair',
  PLACE_SEED_SHAPER: 'legacy.place_seed.shaper',
  PLAYER_SEED_DOSSIER: 'legacy.player_seed.dossier',
  PLAYER_SEED_AUDIT: 'legacy.player_seed.audit',
  PLAYER_SEED_SHAPER: 'legacy.player_seed.shaper',
  PLAYER_SEED_REPAIR: 'legacy.player_seed.repair',
  MASTER_DOSSIER: 'legacy.master.dossier',
  MASTER_AUDIT: 'legacy.master.audit',
  MASTER_SHAPER: 'legacy.master.shaper',
  MASTER_REPAIR: 'legacy.master.repair',
  VISIBLE_CONTEXT_DOSSIER: 'legacy.visible_context.dossier',
  VISIBLE_CONTEXT_DOSSIER_REPAIR: 'legacy.visible_context.dossier_repair',
  VISIBLE_CONTEXT_AUDIT: 'legacy.visible_context.audit',
  VISIBLE_CONTEXT_SHAPER: 'legacy.visible_context.shaper',
  VISIBLE_CONTEXT_REPAIR: 'legacy.visible_context.repair',
  NARRATOR_DOSSIER: 'legacy.narrator.dossier',
  NARRATOR_AUDIT: 'legacy.narrator.audit',
  NARRATOR_DOSSIER_REPAIR: 'legacy.narrator.dossier_repair',
  NARRATOR_SHAPER: 'legacy.narrator.shaper',
  NARRATOR_REPAIR: 'legacy.narrator.repair',
  ACTOR_PROFILES_DOSSIER: 'legacy.actor_profiles.dossier',
  ACTOR_PROFILES_AUDIT: 'legacy.actor_profiles.audit',
  ACTOR_PROFILES_REPAIR: 'legacy.actor_profiles.repair',
  ACTOR_PROFILES_SHAPER: 'legacy.actor_profiles.shaper',
  LOCATION_PROFILES_DOSSIER: 'legacy.location_profiles.dossier',
  LOCATION_PROFILES_AUDIT: 'legacy.location_profiles.audit',
  LOCATION_PROFILES_REPAIR: 'legacy.location_profiles.repair',
  LOCATION_PROFILES_SHAPER: 'legacy.location_profiles.shaper',
  RISK_AUDIT: 'legacy.risk_audit.shaper',
  MEMORY_JOURNAL: 'legacy.memory_journal.shaper'
});

const NEW_GAME_TIER_DEFAULTS = newGameTierDefaults(OutputContractModes);

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
  [TurnRuntimeRoles.ORCHESTRATOR]: {
    envPrefix: 'TURN_ORCHESTRATOR', model: 'deepseek-v4-pro', thinking: 'enabled', reasoningEffort: 'max',
    responseFormat: 'json_object', maxTokens: 12000, outputContractMode: OutputContractModes.JSON_OBJECT_WITH_SCHEMA, expectedSchema: 'turn_mode_resolution', parseJson: true,
    targetInputTokens: 120000, comfortableInputTokens: 250000, hardInputLimitTokens: 700000, reserveOutputTokens: 12000, reserveRepairTokens: 50000
  },
  [TurnRuntimeRoles.AUDITOR]: {
    envPrefix: 'TURN_AUDITOR',
    model: 'deepseek-v4-pro',
    thinking: 'enabled',
    reasoningEffort: 'high',
    responseFormat: 'json_object',
    maxTokens: 8000,
    outputContractMode: OutputContractModes.JSON_OBJECT_WITH_SCHEMA,
    expectedSchema: 'turn_resolution_audit',
    parseJson: true,
    targetInputTokens: 100000,
    comfortableInputTokens: 220000,
    hardInputLimitTokens: 600000,
    reserveOutputTokens: 8000,
    reserveRepairTokens: 30000
  },
  [TurnRuntimeRoles.FORMAT_REPAIRER]: {
    envPrefix: 'TURN_FORMAT_REPAIR',
    model: 'deepseek-v4-flash',
    thinking: 'disabled',
    reasoningEffort: null,
    responseFormat: 'json_object',
    maxTokens: 4000,
    temperature: 0,
    topP: 1,
    outputContractMode: OutputContractModes.JSON_REPAIR,
    parseJson: true,
    targetInputTokens: 30000,
    comfortableInputTokens: 30000,
    hardInputLimitTokens: 100000,
    reserveOutputTokens: 4000,
    reserveRepairTokens: 4000
  },
  [TurnRuntimeRoles.TURN_STEP_PLANNER]: {
    envPrefix: 'TURN_STEP_PLANNER',
    model: 'deepseek-v4-pro',
    thinking: 'enabled',
    reasoningEffort: 'high',
    responseFormat: 'json_object',
    maxTokens: 8000,
    outputContractMode: OutputContractModes.JSON_OBJECT_WITH_SCHEMA,
    expectedSchema: 'turn_step_plan_v1',
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
    expectedSchema: 'turn_step_plan_v1', parseJson: true, targetInputTokens: 30000, comfortableInputTokens: 30000,
    hardInputLimitTokens: 100000, reserveOutputTokens: 4000, reserveRepairTokens: 4000
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
    outputContractMode: OutputContractModes.JSON_OBJECT_WITH_SCHEMA,
    expectedSchema: 'world_process_step_plan_v1', parseJson: true,
    targetInputTokens: 6000, comfortableInputTokens: 12000,
    hardInputLimitTokens: 30000, reserveOutputTokens: 800,
    reserveRepairTokens: 0
  },
  ...conversationTurnRoleDefaults(OutputContractModes),
  ...autonomousTurnRoleDefaults(OutputContractModes),
  ...combatTurnRoleDefaults(OutputContractModes)
});

const LEGACY_WORLD_ROLE_DEFAULTS = Object.freeze({
  [LegacyWorldRoles.HISTORICAL_FRAME_DOSSIER]: legacyTextRole('LEGACY_HISTORICAL_FRAME_DOSSIER'),
  [LegacyWorldRoles.HISTORICAL_FRAME_AUDIT]: legacyAuditRole('LEGACY_HISTORICAL_FRAME_AUDIT'),
  [LegacyWorldRoles.HISTORICAL_FRAME_SHAPER]: legacySchemaRole('LEGACY_HISTORICAL_FRAME_SHAPER', 'historical_frame'),
  [LegacyWorldRoles.HISTORICAL_FRAME_REPAIR]: legacyRepairRole('LEGACY_HISTORICAL_FRAME_REPAIR', 'historical_frame'),
  [LegacyWorldRoles.SOCIAL_TISSUE_DOSSIER]: legacyTextRole('LEGACY_SOCIAL_TISSUE_DOSSIER'),
  [LegacyWorldRoles.SOCIAL_TISSUE_AUDIT]: legacyAuditRole('LEGACY_SOCIAL_TISSUE_AUDIT'),
  [LegacyWorldRoles.SOCIAL_TISSUE_SHAPER]: legacySchemaRole('LEGACY_SOCIAL_TISSUE_SHAPER', 'social_tissue'),
  [LegacyWorldRoles.SOCIAL_TISSUE_REPAIR]: legacyRepairRole('LEGACY_SOCIAL_TISSUE_REPAIR', 'social_tissue'),
  [LegacyWorldRoles.PLACE_SEED_DOSSIER]: legacyTextRole('LEGACY_PLACE_SEED_DOSSIER'),
  [LegacyWorldRoles.PLACE_SEED_AUDIT]: legacyAuditRole('LEGACY_PLACE_SEED_AUDIT'),
  [LegacyWorldRoles.PLACE_SEED_REPAIR]: legacyTextRole('LEGACY_PLACE_SEED_REPAIR'),
  [LegacyWorldRoles.PLACE_SEED_SHAPER]: legacyRepairRole('LEGACY_PLACE_SEED_SHAPER', 'place_seed'),
  [LegacyWorldRoles.PLAYER_SEED_DOSSIER]: legacyTextRole('LEGACY_PLAYER_SEED_DOSSIER'),
  [LegacyWorldRoles.PLAYER_SEED_AUDIT]: legacyAuditRole('LEGACY_PLAYER_SEED_AUDIT'),
  [LegacyWorldRoles.PLAYER_SEED_SHAPER]: legacySchemaRole('LEGACY_PLAYER_SEED_SHAPER', 'player_seed'),
  [LegacyWorldRoles.PLAYER_SEED_REPAIR]: legacyRepairRole('LEGACY_PLAYER_SEED_REPAIR', 'player_seed'),
  [LegacyWorldRoles.MASTER_DOSSIER]: legacyTextRole('LEGACY_MASTER_DOSSIER'),
  [LegacyWorldRoles.MASTER_AUDIT]: legacyAuditRole('LEGACY_MASTER_AUDIT'),
  [LegacyWorldRoles.MASTER_SHAPER]: legacySchemaRole('LEGACY_MASTER_SHAPER', 'master_narrative'),
  [LegacyWorldRoles.MASTER_REPAIR]: legacyRepairRole('LEGACY_MASTER_REPAIR', 'master_narrative'),
  [LegacyWorldRoles.VISIBLE_CONTEXT_DOSSIER]: legacyTextRole('LEGACY_VISIBLE_CONTEXT_DOSSIER'),
  [LegacyWorldRoles.VISIBLE_CONTEXT_DOSSIER_REPAIR]: legacyTextRole('LEGACY_VISIBLE_CONTEXT_DOSSIER_REPAIR'),
  [LegacyWorldRoles.VISIBLE_CONTEXT_AUDIT]: legacyAuditRole('LEGACY_VISIBLE_CONTEXT_AUDIT'),
  [LegacyWorldRoles.VISIBLE_CONTEXT_SHAPER]: legacySchemaRole('LEGACY_VISIBLE_CONTEXT_SHAPER', 'visible_context_package'),
  [LegacyWorldRoles.VISIBLE_CONTEXT_REPAIR]: legacyRepairRole('LEGACY_VISIBLE_CONTEXT_REPAIR', 'visible_context_package'),
  [LegacyWorldRoles.NARRATOR_DOSSIER]: legacySchemaRole(
    'LEGACY_NARRATOR_DOSSIER',
    'narration_output'
  ),
  [LegacyWorldRoles.NARRATOR_AUDIT]: legacyAuditRole('LEGACY_NARRATOR_AUDIT'),
  [LegacyWorldRoles.NARRATOR_DOSSIER_REPAIR]: legacyRepairRole(
    'LEGACY_NARRATOR_DOSSIER_REPAIR',
    'narration_output'
  ),
  [LegacyWorldRoles.NARRATOR_SHAPER]: legacyTextRole('LEGACY_NARRATOR_SHAPER'),
  [LegacyWorldRoles.NARRATOR_REPAIR]: legacyRepairRole(
    'LEGACY_NARRATOR_REPAIR',
    'narration_output'
  ),
  [LegacyWorldRoles.ACTOR_PROFILES_DOSSIER]: legacyTextRole('LEGACY_ACTOR_PROFILES_DOSSIER'),
  [LegacyWorldRoles.ACTOR_PROFILES_AUDIT]: legacyAuditRole('LEGACY_ACTOR_PROFILES_AUDIT'),
  [LegacyWorldRoles.ACTOR_PROFILES_REPAIR]: legacyTextRole('LEGACY_ACTOR_PROFILES_REPAIR'),
  [LegacyWorldRoles.ACTOR_PROFILES_SHAPER]: legacySchemaRole('LEGACY_ACTOR_PROFILES_SHAPER', 'actor_profiles'),
  [LegacyWorldRoles.LOCATION_PROFILES_DOSSIER]: legacyTextRole('LEGACY_LOCATION_PROFILES_DOSSIER'),
  [LegacyWorldRoles.LOCATION_PROFILES_AUDIT]: legacyAuditRole('LEGACY_LOCATION_PROFILES_AUDIT'),
  [LegacyWorldRoles.LOCATION_PROFILES_REPAIR]: legacyTextRole('LEGACY_LOCATION_PROFILES_REPAIR'),
  [LegacyWorldRoles.LOCATION_PROFILES_SHAPER]: legacySchemaRole('LEGACY_LOCATION_PROFILES_SHAPER', 'location_profiles'),
  [LegacyWorldRoles.RISK_AUDIT]: legacySchemaRole('LEGACY_RISK_AUDIT', 'risk_audit'),
  [LegacyWorldRoles.MEMORY_JOURNAL]: legacySchemaRole('LEGACY_MEMORY_JOURNAL', 'memory_journal_update')
});

const SCOPE_DEFAULTS = Object.freeze({
  [LLM_SCOPES.LEGACY_WORLD]: { api: 'chat.completions' },
  [LLM_SCOPES.TURN_RUNTIME]: { api: 'chat.completions' },
  [LLM_SCOPES.NEW_GAME]: { api: 'chat.completions' },
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
  if (scopeKey === LLM_SCOPES.LEGACY_WORLD) {
    defaults = LEGACY_WORLD_ROLE_DEFAULTS[String(roleId ?? '').trim()];
    if (!defaults) return disabledResolution('unknown_role', scopeKey, roleId, tierId);
  } else if (scopeKey === LLM_SCOPES.TURN_RUNTIME) {
    defaults = TURN_ROLE_DEFAULTS[String(roleId ?? '').trim()];
    if (!defaults) return disabledResolution('unknown_role', scopeKey, roleId, tierId);
  } else if (scopeKey === LLM_SCOPES.NEW_GAME) {
    defaults = NEW_GAME_TIER_DEFAULTS[String(tierId ?? '').trim()];
    if (!defaults) return disabledResolution('unknown_tier', scopeKey, roleId, tierId);
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
    requestTimeoutMs: provider?.requestTimeoutMs ?? readPositiveInt(env[`${defaults.envPrefix}_REQUEST_TIMEOUT_MS`]) ?? readPositiveInt(env.DEEPSEEK_REQUEST_TIMEOUT_MS) ?? 120000,
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

export function getTurnRoleConfig(role, env = process.env) {
  const result = resolveLlmExecutionConfig({
    scope: LLM_SCOPES.TURN_RUNTIME,
    roleId: role,
    env
  });
  if (!result.enabled && result.reason === 'unknown_role') {
    throw new Error(`Unsupported turn role config: ${String(role ?? '').trim() || '<empty>'}`);
  }
  return mapResolvedConfig(result, { role });
}

export function getTurnLlmRoleConfigs(env = process.env) {
  return Object.fromEntries(Object.keys(TURN_ROLE_DEFAULTS).map((role) => [role, getTurnRoleConfig(role, env)]));
}

export function getNewGameLlmTierConfig(tier, env = process.env) {
  const result = resolveLlmExecutionConfig({
    scope: LLM_SCOPES.NEW_GAME,
    tierId: tier,
    env
  });
  if (!result.enabled && result.reason === 'unknown_tier') {
    throw new Error(`Unsupported new-game LLM tier config: ${String(tier ?? '').trim() || '<empty>'}`);
  }
  return mapResolvedConfig(result, { tier });
}

export function getNewGameLlmTierConfigs(env = process.env) {
  return Object.fromEntries(Object.keys(NEW_GAME_TIER_DEFAULTS).map((tier) => [tier, getNewGameLlmTierConfig(tier, env)]));
}

export function getNewGameVisibleContextRoleDescriptor(role, env = process.env) {
  const roleId = String(role ?? '').trim();
  const tierId = NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS[roleId];
  if (!tierId) throw new Error(`Unsupported visible-context LLM role: ${roleId || '<empty>'}`);
  const tierConfig = getNewGameLlmTierConfig(tierId, env);
  return Object.freeze({
    role: roleId,
    model_tier: tierId,
    provider: 'deepseek',
    model: tierConfig.model,
    thinking: tierConfig.thinking,
    reasoning_effort: tierConfig.reasoningEffort,
    response_format: tierConfig.responseFormat,
    max_tokens: NEW_GAME_VISIBLE_CONTEXT_ROLE_MAX_TOKENS[roleId] ?? tierConfig.maxTokens
  });
}

function mapResolvedConfig(result, extra = {}) {
  if (!result.enabled) {
    const defaults = extra.role ? TURN_ROLE_DEFAULTS[extra.role] : NEW_GAME_TIER_DEFAULTS[extra.tier];
    return {
      enabled: false,
      provider: 'not_configured',
      apiKey: null,
      baseUrl: null,
      role: extra.role ?? null,
      tier: extra.tier ?? null,
      model: defaults?.model ?? DEFAULT_DEEPSEEK_MODEL,
      api: 'chat.completions',
      thinking: defaults?.thinking ? { type: defaults.thinking } : undefined,
      reasoningEffort: defaults?.reasoningEffort ?? null,
      responseFormat: defaults?.responseFormat ? { type: defaults.responseFormat } : undefined,
      maxTokens: defaults?.maxTokens ?? null,
      temperature: defaults?.temperature ?? null,
      topP: defaults?.topP ?? null,
      contextBudget: buildContextBudget(defaults ?? {}),
      outputContractMode: defaults?.outputContractMode ?? OutputContractModes.PLAIN_TEXT,
      expectedSchema: defaults?.expectedSchema ?? null,
      parseJson: defaults?.parseJson === true
    };
  }

  const config = result.config;
  return {
    enabled: true,
    provider: config.provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    role: extra.role ?? config.role_id ?? null,
    tier: extra.tier ?? config.tier_id ?? null,
    scope: config.scope,
    model: config.model,
    api: config.api,
    thinking: config.thinking,
    reasoningEffort: config.reasoningEffort,
    responseFormat: config.responseFormat,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    topP: config.topP,
    contextBudget: config.contextBudget,
    outputContractMode: config.outputContractMode,
    expectedSchema: config.expectedSchema,
    parseJson: config.parseJson
  };
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

function legacyTextRole(envPrefix) {
  return {
    envPrefix,
    model: DEFAULT_DEEPSEEK_MODEL,
    maxTokens: 1200,
    outputContractMode: OutputContractModes.PLAIN_TEXT,
    parseJson: false,
    targetInputTokens: 60000,
    comfortableInputTokens: 120000,
    hardInputLimitTokens: 250000,
    reserveOutputTokens: 2000,
    reserveRepairTokens: 12000
  };
}

function legacyAuditRole(envPrefix) {
  return {
    envPrefix,
    model: DEFAULT_DEEPSEEK_MODEL,
    responseFormat: 'json_object',
    maxTokens: 700,
    outputContractMode: OutputContractModes.JSON_OBJECT_WITH_SCHEMA,
    expectedSchema: 'semantic_audit',
    parseJson: true,
    targetInputTokens: 60000,
    comfortableInputTokens: 120000,
    hardInputLimitTokens: 250000,
    reserveOutputTokens: 2000,
    reserveRepairTokens: 12000
  };
}

function legacySchemaRole(envPrefix, expectedSchema) {
  return {
    envPrefix,
    model: DEFAULT_DEEPSEEK_MODEL,
    responseFormat: 'json_object',
    maxTokens: 1800,
    outputContractMode: OutputContractModes.JSON_OBJECT_WITH_SCHEMA,
    expectedSchema,
    parseJson: true,
    targetInputTokens: 60000,
    comfortableInputTokens: 120000,
    hardInputLimitTokens: 250000,
    reserveOutputTokens: 2000,
    reserveRepairTokens: 12000
  };
}

function legacyRepairRole(envPrefix, expectedSchema) {
  return {
    envPrefix,
    model: DEFAULT_DEEPSEEK_MODEL,
    responseFormat: 'json_object',
    maxTokens: 1800,
    outputContractMode: OutputContractModes.JSON_REPAIR,
    expectedSchema,
    parseJson: true,
    targetInputTokens: 60000,
    comfortableInputTokens: 120000,
    hardInputLimitTokens: 250000,
    reserveOutputTokens: 2000,
    reserveRepairTokens: 12000
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
