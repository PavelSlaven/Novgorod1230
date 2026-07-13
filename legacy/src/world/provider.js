import { getProviderConfig, LegacyWorldRoles, LLM_SCOPES } from './provider-config.js';
import { createScopedChatCompletionClient } from './provider-runtime.js';
import {
  explainActorProfilesValidation,
  explainHistoricalFrameValidation,
  explainHistoricalFrameEnvelope,
  explainLocationProfilesValidation,
  explainMasterNarrativeValidation,
  explainPlaceSeedValidation,
  explainPlayerSeedValidation,
  explainPlayerSeedCompactValidation,
  explainSocialTissueValidation,
  explainRiskAuditValidation,
  explainSemanticAuditValidation,
  explainJsonObjectParse,
  explainPlayerSeedEnvelope,
  PLAYER_SEED_COMPACT_ROOT_KEYS,
  buildPlayerSeedAntiRegressionRules,
  buildPlayerSeedOutputContract,
  buildHistoricalFrameAntiRegressionRules,
  buildHistoricalFrameOutputContract,
  buildPlaceSeedOutputContract,
  buildPlaceSeedAntiRegressionRules,
  buildSocialTissueOutputContract,
  buildSocialTissueAntiRegressionRules,
  buildActorProfilesOutputContract,
  buildActorProfilesAntiRegressionRules,
  buildLocationProfilesOutputContract,
  buildLocationProfilesAntiRegressionRules,
  buildMasterNarrativeOutputContract,
  buildMasterNarrativeAntiRegressionRules,
  buildVisibleContextOutputContract,
  buildVisibleContextAntiRegressionRules,
  getHistoricalFrameCanonicalExample,
  getPlaceSeedCanonicalExample,
  getSocialTissueCanonicalExample,
  getActorProfilesCanonicalExample,
  getLocationProfilesCanonicalExample,
  getMasterNarrativeCanonicalExample,
  getVisibleContextCanonicalExample,
  mergeHistoricalFrameValidationErrors,
  mergePlaceSeedValidationErrors,
  mergeSocialTissueValidationErrors,
  mergeActorProfilesValidationErrors,
  mergeLocationProfilesValidationErrors,
  mergeMasterNarrativeValidationErrors,
  mergeVisibleContextValidationErrors,
  evaluatePlaceSeedCandidate,
  evaluateSocialTissueCandidate,
  evaluateActorProfilesCandidate,
  evaluateLocationProfilesCandidate,
  evaluateMasterNarrativeCandidate,
  evaluateVisibleContextCandidate,
  evaluateSemanticAuditCandidate,
  buildSemanticAuditRepairMessages,
  getPlayerSeedCanonicalExample,
  mergePlayerSeedValidationErrors,
  resolvePlayerSeedDisplayName,
  parseJsonObject,
  validateActorProfiles,
  validateHistoricalFrame,
  validateLocationProfiles,
  validateMasterNarrative,
  validatePlaceSeed,
  explainPlayerSeedItemBlocksValidation,
  validatePlayerSeed,
  validatePlayerSeedCompact,
  validatePlayerSeedItemBlocks,
  validateSocialTissue,
  validateRiskAudit,
  validateSemanticAudit
} from './json-contracts.js';
import { applyNpcProfileDepth, buildNpcProfile, buildPlayerProfile } from './entities.js';
import { normalizeItemList } from './profile-v2.js';
import { loadDesignBundleSync } from './corpus-loader.js';
import {
  buildDeterministicVisiblePackage,
  buildVisibleContextInput,
  stripHiddenForNarrator,
  validateVisibleContextPackage
} from './visibility.js';
import {
  buildNarratorAuditMessages,
  buildNarratorDossierMessages,
  buildNarratorDossierRepairMessages,
  buildNarratorProseRepairMessages,
  buildNarratorShapeMessages,
  buildVisibleContextDossierMessages,
  buildVisibleContextDossierRepairMessages,
  buildVisibleContextShapeMessages
} from './narrator-prompts.js';
import {
  buildDeterministicMemoryJournalUpdate,
  buildMemoryJournalMessages,
  validateMemoryJournalUpdate
} from './memory-journal.js';
import { allowsDeterministicFallback, isProductionSemanticMode } from './semantic-gate.js';
import { buildStructuredShapePromptHeader } from './prompt-headers.js';
import { shouldEnforcePromptGuard, validateAgentPrompt } from './prompt-guard.js';

function promptDesignDocs(task = 'default', frame = {}) {
  return [
    '# Проектная документация',
    loadDesignBundleSync(task, { frame })
  ].join('\n');
}

const REQUEST_TIMEOUT_MS = 30000;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 10000;
const MAX_RETRY_ATTEMPTS = 3;
const MAX_MASTER_RESPONSE_ATTEMPTS = 3;
const MAX_NARRATOR_RESPONSE_ATTEMPTS = 3;
const MAX_VISIBLE_CONTEXT_ATTEMPTS = 3;
const MAX_HISTORICAL_FRAME_ATTEMPTS = 3;
const HISTORICAL_FRAME_SHAPE_MAX_TOKENS = 900;
const MAX_SOCIAL_TISSUE_ATTEMPTS = 3;
const MAX_PLACE_SEED_ATTEMPTS = 3;
const MAX_PLACE_SEED_SHAPE_ATTEMPTS = 3;
const MAX_PLAYER_SEED_ATTEMPTS = 3;
export const PLAYER_SEED_SHAPE_MAX_TOKENS = 3500;
const MAX_ACTOR_PROFILE_ATTEMPTS = 3;
const MAX_LOCATION_PROFILE_ATTEMPTS = 3;
const TECHNICAL_SEMANTIC_AUDIT_PASS_MARKER = 'semantic audit passed: no blocking concerns found';
const PLAYER_SEED_LIST_FIELDS = ['inventory', 'family', 'property', 'memory', 'knowledge', 'fears', 'goals', 'obligations'];
const SEMANTIC_AUDIT_FORMAT_LINE = 'Формат: version=1, schema=semantic_audit, pass: boolean, concerns: string[], evidence: string[].';
const MISSING_APPROVED_FACT_TYPES = new Set(['route', 'npc', 'gate', 'anchor', 'occupant']);
const MODEL_TIER_FLASH = 'flash';
const MODEL_TIER_PRO = 'pro_thinking';
const MODEL_TIER_SENIOR = 'senior_pro_thinking_max';
const PIPELINE_RUNTIME_NEW = 'new_lifecycle';
const PIPELINE_RUNTIME_LEGACY = 'legacy_provider';
const LEGACY_PROVIDER_FORBIDDEN_CODE = 'legacy_path_forbidden_for_new_pipeline';

export function attachDiagnosticJournal(hooks = {}, defaults = {}) {
  const journal = hooks.diagnosticJournal ?? hooks.journal ?? null;
  if (!journal || typeof journal !== 'object') return hooks;

  let lastStage = null;
  const parentOnStage = hooks.onStage;
  const parentOnCall = hooks.onCall;

  const stageContext = (stage = {}) => ({
    phase: stage.phase ?? defaults.phase ?? null,
    label: stage.label ?? defaults.label ?? null,
    attempt: stage.attempt ?? defaults.attempt ?? null,
    maxAttempts: stage.maxAttempts ?? defaults.maxAttempts ?? null,
    provider: stage.provider ?? defaults.provider ?? hooks.provider ?? null,
    model: stage.model ?? defaults.model ?? hooks.model ?? null,
    pipelineRuntime: stage.pipelineRuntime ?? stage.pipeline_runtime ?? defaults.pipelineRuntime ?? hooks.pipelineRuntime ?? hooks.pipeline_runtime ?? PIPELINE_RUNTIME_LEGACY,
    legacyProviderRuntimeUsed: stage.legacyProviderRuntimeUsed
      ?? stage.legacy_provider_runtime_used
      ?? defaults.legacyProviderRuntimeUsed
      ?? hooks.legacyProviderRuntimeUsed
      ?? hooks.legacy_provider_runtime_used
      ?? true
  });

  return {
    ...hooks,
    diagnosticJournal: journal,
    onStage(stage) {
      lastStage = stage;
      this.lastStageLabel = stage?.label ?? null;
      this.lastStagePhase = stage?.phase ?? null;
      parentOnStage?.(stage);
      const recorded = journal.adaptStage(stage, stageContext(stage));
      if (stage && typeof stage === 'object') {
        stage.__diagnosticCallStartRecorded = recorded?.kind === 'llm_call';
      }
    },
    onCall(call = {}) {
      parentOnCall?.(call);
      if (lastStage && lastStage.__diagnosticCallStartRecorded !== true) {
        journal.recordLlmCallStart({
          ...stageContext(lastStage ?? {}),
          message: lastStage?.message ?? 'LLM call started.',
          requestPreview: lastStage?.requestPreview ?? null,
          requestRaw: lastStage?.requestRaw ?? null,
          requestSections: lastStage?.requestSections ?? null,
          responsePreview: null,
          responseRaw: null,
          responseSections: null
        });
        lastStage.__diagnosticCallStartRecorded = true;
      }
      journal.adaptCall(call, {
        ...stageContext(lastStage ?? {}),
        message: lastStage?.message ?? (String(call.status ?? 'ok').toLowerCase() === 'ok' ? 'LLM call completed.' : 'LLM call failed.'),
        requestPreview: lastStage?.requestPreview ?? null,
        requestRaw: lastStage?.requestRaw ?? null,
        requestSections: lastStage?.requestSections ?? null,
        responsePreview: lastStage?.responsePreview ?? null,
        responseRaw: lastStage?.responseRaw ?? null,
        responseSections: lastStage?.responseSections ?? null,
        tokenUsage: call.tokenUsage ?? lastStage?.tokenUsage ?? null
      });
    }
  };
}

function createSafeHooks(hooks = {}) {
  if (!hooks || typeof hooks !== 'object') return {};
  hooks = {
    ...hooks,
    pipelineRuntime: hooks.pipelineRuntime ?? hooks.pipeline_runtime ?? PIPELINE_RUNTIME_LEGACY,
    pipeline_runtime: hooks.pipeline_runtime ?? hooks.pipelineRuntime ?? PIPELINE_RUNTIME_LEGACY,
    legacyProviderRuntimeUsed: hooks.legacyProviderRuntimeUsed ?? hooks.legacy_provider_runtime_used ?? true,
    legacy_provider_runtime_used: hooks.legacy_provider_runtime_used ?? hooks.legacyProviderRuntimeUsed ?? true
  };
  hooks = attachDiagnosticJournal(hooks, {
    pipelineRuntime: hooks.pipelineRuntime,
    legacyProviderRuntimeUsed: hooks.legacyProviderRuntimeUsed
  });
  const onStage = hooks.onStage;
  const onCall = hooks.onCall;
  if (typeof onStage !== 'function' && typeof onCall !== 'function') return hooks;
  return {
    ...hooks,
    onStage: typeof onStage === 'function'
      ? (stage) => {
        try {
          onStage.call(hooks, stage);
        } catch {
          // Телеметрия не должна ломать основной поток.
        }
      }
      : undefined,
    onCall: typeof onCall === 'function'
      ? (call) => {
        try {
          onCall.call(hooks, call);
        } catch {
          // Телеметрия не должна ломать основной поток.
        }
      }
      : undefined
  };
}

function resolvePipelineRuntimeMarker(env = process.env, hooks = {}, source = null) {
  const explicit = source?.pipeline_runtime
    ?? source?.pipelineRuntime
    ?? null;
  if (explicit === PIPELINE_RUNTIME_NEW || explicit === PIPELINE_RUNTIME_LEGACY) return explicit;
  if (env?.NEW_GAME_PIPELINE_ENABLED === true || String(env?.NEW_GAME_PIPELINE_ENABLED ?? '').trim().toLowerCase() === 'true') {
    return PIPELINE_RUNTIME_NEW;
  }
  const hookRuntime = hooks?.pipelineRuntime
    ?? hooks?.pipeline_runtime
    ?? null;
  if (hookRuntime === PIPELINE_RUNTIME_NEW || hookRuntime === PIPELINE_RUNTIME_LEGACY) return hookRuntime;
  return PIPELINE_RUNTIME_LEGACY;
}

function createLegacyProviderForbiddenError(stageName, runtime) {
  const error = new Error(`${LEGACY_PROVIDER_FORBIDDEN_CODE}: ${stageName}`);
  error.code = LEGACY_PROVIDER_FORBIDDEN_CODE;
  error.pipeline_runtime = runtime;
  error.legacy_provider_runtime_used = false;
  return error;
}

function assertLegacyProviderAllowed(stageName, env = process.env, hooks = {}, source = null) {
  const runtime = resolvePipelineRuntimeMarker(env, hooks, source);
  if (runtime === PIPELINE_RUNTIME_NEW) {
    const error = createLegacyProviderForbiddenError(stageName, runtime);
    hooks?.onStage?.({
      phase: 'legacy_provider_guard',
      label: stageName,
      kind: 'error',
      message: error.message,
      pipeline_runtime: runtime,
      legacy_provider_runtime_used: false
    });
    throw error;
  }
  return runtime;
}

function createProviderTelemetry(hooks = {}, config = {}) {
  return {
    get provider() {
      return config.provider ?? null;
    },
    get model() {
      return config.model ?? null;
    },
    get lastStageLabel() {
      return hooks.lastStageLabel ?? null;
    },
    get lastStagePhase() {
      return hooks.lastStagePhase ?? null;
    },
    onCall(call) {
      hooks.onCall?.(call);
    }
  };
}

function normalizeError(error, fallbackMessage = 'ошибка не указана') {
  if (error instanceof Error) return error;
  let message = fallbackMessage;
  if (typeof error === 'string') {
    message = error.trim() || fallbackMessage;
  } else if (error && typeof error === 'object') {
    if (typeof error.message === 'string' && error.message.trim()) {
      message = error.message.trim();
    } else {
      try {
        const json = JSON.stringify(error);
        if (json && json !== '{}') message = json;
      } catch {
        if (typeof error.toString === 'function') {
          const text = String(error.toString()).trim();
          if (text && text !== '[object Object]') message = text;
        }
      }
    }
  }
  const normalized = new Error(message || fallbackMessage);
  if (error !== undefined) normalized.cause = error;
  return normalized;
}

function buildSemanticAuditSystemContent(subject, lines = [], task = 'default') {
  return [
    `Ты проверяешь semantic_audit (semantic audit) для ${subject}.`,
    'Верни только строгий JSON без markdown и без пояснений.',
    'Если pass=true, concerns должен быть пустым массивом, а evidence может быть пустым.',
    'Если audit не проходит, concerns должен содержать конкретную причину, а evidence - конкретное основание и не быть пустым.',
    promptDesignDocs(task),
    ...lines,
    SEMANTIC_AUDIT_FORMAT_LINE
  ].join('\n');
}

function buildVisibleContextAuditMessages(input, dossierText) {
  return [
    {
      role: 'system',
      content: buildSemanticAuditSystemContent('visible_context_package', [
        'Проверь, что dossier не раскрывает скрытые мотивы, будущие события и не добавляет факты.'
      ], 'master_narrative')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_audit',
        kind: 'visible_context_package',
        dossier: dossierText,
        input
      })
    }
  ];
}

export async function generateHistoricalFrame(seed, env = process.env, hooks = {}) {
  hooks = createSafeHooks(hooks);
  assertLegacyProviderAllowed('generateHistoricalFrame', env, hooks, seed);
  const config = getProviderConfig(env);
  if (!config.enabled) {
    throw new Error('DeepSeek API key is required to generate a historical frame.');
  }
  hooks = createSafeHooks(hooks);
  let lastFailureReason = '';

  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  const requestSections = buildHistoricalFrameRequestSections(seed);
  let dossierAttempt = 0;
  let frozenDossierText = '';
  let frozenAudit = null;

  while (dossierAttempt < MAX_HISTORICAL_FRAME_ATTEMPTS && !frozenDossierText) {
    dossierAttempt += 1;
    let dossierText = '';
    let auditText = '';
    const dossierMessages = buildHistoricalFrameDossierMessages(seed);
    const requestPreview = summarizeMessages(dossierMessages);
    try {
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Historical frame dossier',
        message: `Выбираю историческую рамку, попытка ${dossierAttempt}.`,
        requestPreview,
        requestRaw: dossierMessages,
        requestSections,
        attempt: dossierAttempt,
        maxAttempts: MAX_HISTORICAL_FRAME_ATTEMPTS
      });
      const dossierResponse = await client.complete(LegacyWorldRoles.HISTORICAL_FRAME_DOSSIER, {
        model: config.model,
        messages: dossierMessages,
        temperature: 0.35,
        max_tokens: 1200
      });

      dossierText = dossierResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!dossierText) {
        throw new Error('Empty historical frame dossier response');
      }
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Historical frame dossier',
        message: 'Историческая рамка собрана.',
        responsePreview: clipText(dossierText, 1400),
        responseRaw: dossierText,
        responseSections: buildSemanticTextSections('Dossier', dossierText)
      });

      hooks.onStage?.({
        phase: 'semantic_audit',
        label: 'Historical frame audit',
        message: 'Проверяю рамку на историчность и географическую правдоподобность.',
        requestPreview: summarizeMessages(buildHistoricalFrameAuditMessages(seed, dossierText)),
        requestRaw: buildHistoricalFrameAuditMessages(seed, dossierText),
        requestSections: buildHistoricalFrameAuditRequestSections(seed),
        attempt: dossierAttempt
      });
      const auditResponse = await client.complete(LegacyWorldRoles.HISTORICAL_FRAME_AUDIT, {
        model: config.model,
        messages: buildHistoricalFrameAuditMessages(seed, dossierText),
        temperature: 0.15,
        max_tokens: 700
      });

      auditText = auditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      const audit = parseSemanticAuditResponse(auditText);
      if (!audit || audit.pass !== true) {
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор рамки',
          message: `Historical frame audit не прошёл, повтор через ${nextRetryDelay(dossierAttempt)} мс.`,
          requestPreview,
          responsePreview: clipText(auditText || dossierText, 1200),
          requestRaw: dossierMessages,
          responseRaw: auditText || dossierText,
          requestSections,
          responseSections: [
            section('Dossier', splitTextLines(dossierText)),
            section('Audit', audit ? [
              `pass=${audit.pass}`,
              `concerns=${audit.concerns?.slice(0, 3).join(' | ') || 'не предоставлено'}`,
              `evidence=${audit.evidence?.slice(0, 3).join(' | ') || 'не предоставлено'}`
            ] : ['invalid audit'])
          ],
          attempt: dossierAttempt
        });
        await sleep(nextRetryDelay(dossierAttempt));
        continue;
      }

      frozenDossierText = dossierText;
      frozenAudit = audit;
    } catch (error) {
      const normalizedError = normalizeError(error, lastFailureReason || 'Historical frame generation failed.');
      lastFailureReason = normalizedError.message;
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор рамки',
        message: `Генерация исторической рамки не удалась, повтор через ${nextRetryDelay(dossierAttempt)} мс.`,
        requestPreview,
        responsePreview: clipText(auditText || dossierText, 1200),
        requestRaw: dossierMessages,
        responseRaw: auditText || dossierText,
        requestSections,
        responseSections: buildRetryResponseSections(auditText || dossierText),
        attempt: dossierAttempt
      });
      if (dossierAttempt >= MAX_HISTORICAL_FRAME_ATTEMPTS) {
        throwGenerationFailure('historical frame', lastFailureReason);
      }
      await sleep(nextRetryDelay(dossierAttempt));
    }
  }

  if (!frozenDossierText || !frozenAudit) {
    throwGenerationFailure('historical frame', lastFailureReason || 'retry loop exhausted without a frozen dossier');
  }

  hooks.onStage?.({
    phase: 'semantic_freeze',
    label: 'Historical Freeze',
    message: 'Историческая рамка утверждена и заморожена.',
    responsePreview: clipText(frozenDossierText, 1000),
    responseRaw: frozenDossierText,
    responseSections: [
      section('Freeze', [
        'Смысл рамки больше не меняется.',
        'Теперь возможна только упаковка утверждённых фактов в JSON.'
      ])
    ]
  });

  let shapeAttempt = 0;
  let retryInstruction = '';
  let accumulatedValidationErrors = [];
  let previousHistoricalFrame = null;

  while (shapeAttempt < MAX_HISTORICAL_FRAME_ATTEMPTS) {
    shapeAttempt += 1;
    let rawText = '';
    let shapeTokenUsage = null;
    try {
      const shapeMessages = buildHistoricalFrameShapeMessages(
        seed,
        frozenDossierText,
        frozenAudit,
        retryInstruction,
        previousHistoricalFrame
      );
      const shapeRequestSections = buildHistoricalFrameShapeRequestSections(seed, retryInstruction, accumulatedValidationErrors);
      hooks.onStage?.({
        phase: 'semantic_shape',
        label: 'HistoricalDataShaper',
        message: 'Перевожу историческую рамку в строгий JSON.',
        requestPreview: summarizeMessages(shapeMessages),
        requestRaw: shapeMessages,
        requestSections: shapeRequestSections,
        attempt: shapeAttempt,
        maxAttempts: MAX_HISTORICAL_FRAME_ATTEMPTS,
        maxTokens: HISTORICAL_FRAME_SHAPE_MAX_TOKENS,
        schema: 'historical_frame'
      });
      const response = await client.complete(LegacyWorldRoles.HISTORICAL_FRAME_SHAPER, {
        model: config.model,
        messages: shapeMessages,
        temperature: 0.2,
        max_tokens: HISTORICAL_FRAME_SHAPE_MAX_TOKENS
      });

      rawText = response?.choices?.[0]?.message?.content?.trim() ?? '';
      shapeTokenUsage = response?.usage ?? null;
      const truncated = isLlmOutputTruncated(shapeTokenUsage, HISTORICAL_FRAME_SHAPE_MAX_TOKENS);
      const parseResult = explainJsonObjectParse(rawText);
      if (!parseResult.ok) {
        lastFailureReason = buildHistoricalFrameParseFailureMessage(parseResult, truncated);
        retryInstruction = buildHistoricalFrameParseRetryInstruction({ truncated });
        accumulatedValidationErrors = [];
        previousHistoricalFrame = null;
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор рамки',
          message: `${lastFailureReason} ${retryInstruction}`,
          requestPreview: summarizeMessages(shapeMessages),
          responsePreview: clipText(rawText, 1200),
          requestRaw: shapeMessages,
          responseRaw: rawText,
          requestSections: shapeRequestSections,
          responseSections: buildRetryResponseSections(rawText),
          attempt: shapeAttempt,
          maxAttempts: MAX_HISTORICAL_FRAME_ATTEMPTS,
          maxTokens: HISTORICAL_FRAME_SHAPE_MAX_TOKENS,
          tokenUsage: shapeTokenUsage,
          repair: { kind: 'parse_repair', truncated },
          schema: 'historical_frame'
        });
        if (shapeAttempt >= MAX_HISTORICAL_FRAME_ATTEMPTS) {
          throwGenerationFailure('historical frame', lastFailureReason);
        }
        await sleep(nextRetryDelay(shapeAttempt));
        continue;
      }

      const envelope = explainHistoricalFrameEnvelope(parseResult.data);
      if (!envelope.ok) {
        lastFailureReason = envelope.errors.join('; ');
        retryInstruction = buildHistoricalFrameWrongSchemaRetryInstruction(envelope.errors);
        accumulatedValidationErrors = [];
        previousHistoricalFrame = null;
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор рамки',
          message: `${lastFailureReason} ${retryInstruction}`,
          requestPreview: summarizeMessages(shapeMessages),
          responsePreview: clipText(rawText, 1200),
          requestRaw: shapeMessages,
          responseRaw: rawText,
          requestSections: shapeRequestSections,
          responseSections: buildValidationErrorSections('Historical frame schema', { ok: false, errors: envelope.errors }),
          attempt: shapeAttempt,
          maxAttempts: MAX_HISTORICAL_FRAME_ATTEMPTS,
          maxTokens: HISTORICAL_FRAME_SHAPE_MAX_TOKENS,
          tokenUsage: shapeTokenUsage,
          repair: { kind: 'wrong_schema', truncated },
          schema: 'historical_frame'
        });
        if (shapeAttempt >= MAX_HISTORICAL_FRAME_ATTEMPTS) {
          throwGenerationFailure('historical frame', lastFailureReason);
        }
        await sleep(nextRetryDelay(shapeAttempt));
        continue;
      }

      previousHistoricalFrame = parseResult.data;
      const evaluation = evaluateHistoricalFrameCandidate(parseResult.data);
      if (evaluation.ok) {
        const parsed = validateHistoricalFrame(parseResult.data);
        hooks.onStage?.({
          phase: 'llm_response',
          label: 'Рамка готова',
          message: 'HistoricalDataShaper вернул историческую рамку.',
          responsePreview: clipText(rawText, 1400),
          responseRaw: rawText,
          responseSections: buildHistoricalFrameResponseSections(parsed),
          tokenUsage: shapeTokenUsage,
          maxTokens: HISTORICAL_FRAME_SHAPE_MAX_TOKENS,
          schema: 'historical_frame'
        });
        return {
          provider: config.provider,
          usedFallback: false,
          data: parsed
        };
      }

      const validationErrors = describeValidationErrors(evaluation.validation);
      accumulatedValidationErrors = mergeHistoricalFrameValidationErrors(accumulatedValidationErrors, validationErrors);
      lastFailureReason = validationErrors.join('; ') || 'historical frame validation failed';

      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор рамки',
        message: `Историческая рамка не прошла проверку: ${lastFailureReason}. Повторю только упаковку замороженного dossier.`,
        requestPreview: summarizeMessages(shapeMessages),
        responsePreview: clipText(rawText, 1200),
        requestRaw: shapeMessages,
        responseRaw: rawText,
        requestSections: shapeRequestSections,
        responseSections: buildValidationErrorSections('Historical frame validation', evaluation.validation),
        attempt: shapeAttempt,
        maxAttempts: MAX_HISTORICAL_FRAME_ATTEMPTS,
        maxTokens: HISTORICAL_FRAME_SHAPE_MAX_TOKENS,
        tokenUsage: shapeTokenUsage,
        repair: { kind: 'validation_repair', truncated, errorCount: accumulatedValidationErrors.length },
        schema: 'historical_frame'
      });

      const repairMessages = buildHistoricalFrameRepairMessages(
        seed,
        frozenDossierText,
        frozenAudit,
        accumulatedValidationErrors,
        parseResult.data
      );
      hooks.onStage?.({
        phase: 'semantic_repair',
        label: 'Historical frame repair',
        message: 'Исправляю historical_frame целиком по validationErrors и outputContract.',
        requestPreview: summarizeMessages(repairMessages),
        requestSections: buildHistoricalFrameRepairRequestSections(seed, accumulatedValidationErrors),
        attempt: shapeAttempt,
        repair: { kind: 'validation_repair' }
      });
      const repairResponse = await client.complete(LegacyWorldRoles.HISTORICAL_FRAME_REPAIR, {
        model: config.model,
        messages: repairMessages,
        temperature: 0.15,
        max_tokens: HISTORICAL_FRAME_SHAPE_MAX_TOKENS
      });
      const repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      const repairParseResult = explainJsonObjectParse(repairText);
      hooks.onStage?.({
        phase: 'semantic_repair',
        label: 'Historical frame repair',
        message: repairParseResult.ok
          ? 'RepairLLM вернул полный JSON historical_frame.'
          : 'RepairLLM не вернул parseable JSON; повторю shaper с anti-regression.',
        responsePreview: clipText(repairText, 1400),
        responseRaw: repairText,
        responseSections: repairParseResult.ok
          ? buildHistoricalFrameResponseSections(validateHistoricalFrame(repairParseResult.data))
          : buildRetryResponseSections(repairText),
        attempt: shapeAttempt,
        repair: { kind: repairParseResult.ok ? 'full_json_repair' : 'full_json_repair_failed' }
      });

      if (repairParseResult.ok) {
        const repairEnvelope = explainHistoricalFrameEnvelope(repairParseResult.data);
        if (repairEnvelope.ok) {
          previousHistoricalFrame = repairParseResult.data;
          const repairEvaluation = evaluateHistoricalFrameCandidate(repairParseResult.data);
          if (repairEvaluation.ok) {
            const parsed = validateHistoricalFrame(repairParseResult.data);
            hooks.onStage?.({
              phase: 'llm_response',
              label: 'Рамка готова',
              message: 'RepairLLM вернул валидный historical_frame.',
              responsePreview: clipText(repairText, 1400),
              responseRaw: repairText,
              responseSections: buildHistoricalFrameResponseSections(parsed),
              tokenUsage: repairResponse?.usage ?? shapeTokenUsage,
              maxTokens: HISTORICAL_FRAME_SHAPE_MAX_TOKENS,
              schema: 'historical_frame'
            });
            return {
              provider: config.provider,
              usedFallback: false,
              data: parsed
            };
          }
          const repairValidationErrors = describeValidationErrors(repairEvaluation.validation);
          accumulatedValidationErrors = mergeHistoricalFrameValidationErrors(
            accumulatedValidationErrors,
            repairValidationErrors
          );
          lastFailureReason = accumulatedValidationErrors.join('; ') || lastFailureReason;
        }
      }

      retryInstruction = buildHistoricalFrameRetryInstruction(accumulatedValidationErrors);
      if (shapeAttempt >= MAX_HISTORICAL_FRAME_ATTEMPTS) {
        throwGenerationFailure('historical frame', lastFailureReason);
      }
      await sleep(nextRetryDelay(shapeAttempt));
      continue;
    } catch (error) {
      const normalizedError = normalizeError(error, lastFailureReason || 'Historical frame generation failed.');
      lastFailureReason = normalizedError.message;
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор рамки',
        message: `Генерация исторической рамки не удалась, повтор через ${nextRetryDelay(shapeAttempt)} мс.`,
        requestPreview: summarizeMessages(buildHistoricalFrameShapeMessages(seed, frozenDossierText, frozenAudit, retryInstruction, previousHistoricalFrame)),
        responsePreview: clipText(rawText || frozenDossierText, 1200),
        responseRaw: rawText || null,
        requestSections: buildHistoricalFrameShapeRequestSections(seed, retryInstruction, accumulatedValidationErrors),
        responseSections: buildRetryResponseSections(rawText || frozenDossierText),
        attempt: shapeAttempt,
        maxTokens: HISTORICAL_FRAME_SHAPE_MAX_TOKENS,
        tokenUsage: shapeTokenUsage
      });
      if (shapeAttempt >= MAX_HISTORICAL_FRAME_ATTEMPTS) {
        const failureParse = explainJsonObjectParse(rawText || '');
        const failureDetail = failureParse.ok
          ? describeValidationErrors(explainHistoricalFrameValidation(failureParse.data)).join('; ')
          : buildHistoricalFrameParseFailureMessage(failureParse);
        throwGenerationFailure('historical frame', lastFailureReason || failureDetail || 'причина не указана');
      }
      await sleep(nextRetryDelay(shapeAttempt));
      continue;
    }
  }

  throwGenerationFailure('historical frame', lastFailureReason || 'retry loop exhausted without a valid LLM response');
}

export async function generateSocialTissue(world, env = process.env, hooks = {}) {
  hooks = createSafeHooks(hooks);
  assertLegacyProviderAllowed('generateSocialTissue', env, hooks, world);
  const config = getProviderConfig(env);
  if (!config.enabled) {
    throw new Error('DeepSeek API key is required to generate social tissue.');
  }
  hooks = createSafeHooks(hooks);

  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  const requestSections = buildSocialTissueRequestSections(world);
  let attempt = 0;
  let previousAudit = null;
  let lastFailureReason = '';

  while (attempt < MAX_SOCIAL_TISSUE_ATTEMPTS) {
    attempt += 1;
    let dossierText = '';
    let auditText = '';
    let repairText = '';
    let repairAuditText = '';
    let rawText = '';
    const dossierMessages = buildSocialTissueDossierMessages(world, previousAudit);
    const requestPreview = summarizeMessages(dossierMessages);

    try {
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Social tissue dossier',
        message: `Собираю социальную ткань, попытка ${attempt}.`,
        requestPreview,
        requestSections,
        attempt,
        maxAttempts: MAX_SOCIAL_TISSUE_ATTEMPTS
      });
      const dossierResponse = await client.complete(LegacyWorldRoles.SOCIAL_TISSUE_DOSSIER, {
        model: config.model,
        messages: dossierMessages,
        temperature: 0.35,
        max_tokens: 1200
      });
      dossierText = dossierResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!dossierText) throw new Error('Empty social tissue dossier response');
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Social tissue dossier',
        message: 'Социальная ткань собрана.',
        responsePreview: clipText(dossierText, 1400),
        responseSections: buildSemanticTextSections('Dossier', dossierText)
      });

      hooks.onStage?.({
        phase: 'semantic_audit',
        label: 'Social tissue audit',
        message: 'Проверяю социальную ткань на историчность и правдоподобие.',
        requestPreview: summarizeMessages(buildSocialTissueAuditMessages(world, dossierText)),
        requestSections: buildSocialTissueAuditRequestSections(world),
        attempt
      });
      const auditResponse = await client.complete(LegacyWorldRoles.SOCIAL_TISSUE_AUDIT, {
        model: config.model,
        messages: buildSocialTissueAuditMessages(world, dossierText),
        temperature: 0.15,
        max_tokens: 700
      });
      auditText = auditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      let audit = parseSemanticAuditResponse(auditText);
      if (!audit) {
        lastFailureReason = summarizeInvalidSemanticAudit(auditText);
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор ткани',
          message: `Social tissue audit вернул невалидный ответ: ${lastFailureReason}.`,
          requestPreview,
          responsePreview: clipText(auditText || dossierText, 1200),
          requestSections,
          responseSections: buildValidationErrorSections('Semantic audit validation', explainSemanticAuditValidation(parseJsonObject(auditText))),
          attempt
        });
        if (attempt >= MAX_SOCIAL_TISSUE_ATTEMPTS) {
          throwGenerationFailure('social tissue', lastFailureReason);
        }
        await sleep(nextRetryDelay(attempt));
        continue;
      }

      if (audit.pass !== true) {
        lastFailureReason = summarizeSocialTissueAuditFailure(audit);
        previousAudit = audit;
        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Исправление социальной ткани',
          message: 'Прошу точечно исправить dossier по конкретным замечаниям аудита.',
          requestPreview: summarizeMessages(buildSocialTissueRepairMessages(world, dossierText, audit)),
          requestSections: [
            section('Dossier', splitTextLines(dossierText)),
            section('Audit concerns', audit.concerns?.slice(0, 4) ?? []),
            section('Audit evidence', audit.evidence?.slice(0, 4) ?? [])
          ],
          attempt
        });
        const repairResponse = await client.complete(LegacyWorldRoles.SOCIAL_TISSUE_REPAIR, {
          model: config.model,
          messages: buildSocialTissueRepairMessages(world, dossierText, audit),
          temperature: 0.2,
          max_tokens: 800
        });
        repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        if (!repairText) {
          hooks.onStage?.({
            phase: 'llm_retry',
            label: 'Повтор ткани',
            message: `Исправление социальной ткани не вернуло текст: ${lastFailureReason}.`,
            requestPreview,
            responsePreview: clipText(auditText || dossierText, 1200),
            requestSections,
            responseSections: buildSocialTissueAuditResponseSections(audit),
            attempt
          });
          if (attempt >= MAX_SOCIAL_TISSUE_ATTEMPTS) {
          throwGenerationFailure('social tissue', lastFailureReason);
        }
          await sleep(nextRetryDelay(attempt));
          continue;
        }

        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Исправление социальной ткани',
          message: 'Получен исправленный dossier социальной ткани, запускаю повторный аудит.',
          responsePreview: clipText(repairText, 1400),
          responseSections: buildSemanticTextSections('Repaired dossier', repairText),
          attempt
        });

        hooks.onStage?.({
          phase: 'semantic_audit',
          label: 'Social tissue re-audit',
          message: 'Повторно проверяю исправленную социальную ткань.',
          requestPreview: summarizeMessages(buildSocialTissueAuditMessages(world, repairText)),
          requestSections: buildSocialTissueAuditRequestSections(world),
          attempt
        });
        const repairAuditResponse = await client.complete(LegacyWorldRoles.SOCIAL_TISSUE_AUDIT, {
          model: config.model,
          messages: buildSocialTissueAuditMessages(world, repairText),
          temperature: 0.15,
          max_tokens: 700
        });
        repairAuditText = repairAuditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        const repairAudit = parseSemanticAuditResponse(repairAuditText);
        if (!repairAudit) {
          lastFailureReason = summarizeInvalidSemanticAudit(repairAuditText);
          hooks.onStage?.({
            phase: 'llm_retry',
            label: 'Повтор ткани',
            message: `Повторный Social tissue audit вернул невалидный ответ: ${lastFailureReason}.`,
            requestPreview,
            responsePreview: clipText(repairAuditText || repairText, 1200),
            requestSections,
            responseSections: buildValidationErrorSections('Semantic audit validation', explainSemanticAuditValidation(parseJsonObject(repairAuditText))),
            attempt
          });
          if (attempt >= MAX_SOCIAL_TISSUE_ATTEMPTS) {
          throwGenerationFailure('social tissue', lastFailureReason);
        }
          await sleep(nextRetryDelay(attempt));
          continue;
        }
        if (repairAudit.pass !== true) {
          lastFailureReason = summarizeSocialTissueAuditFailure(repairAudit);
          previousAudit = repairAudit;
          hooks.onStage?.({
            phase: 'llm_retry',
            label: 'Повтор ткани',
            message: `Исправленный Social tissue audit не прошёл: ${lastFailureReason}.`,
            requestPreview,
            responsePreview: clipText(repairAuditText || repairText, 1200),
            requestSections,
            responseSections: buildSocialTissueAuditResponseSections(repairAudit),
            attempt
          });
          if (attempt >= MAX_SOCIAL_TISSUE_ATTEMPTS) {
          throwGenerationFailure('social tissue', lastFailureReason);
        }
          await sleep(nextRetryDelay(attempt));
          continue;
        }

        dossierText = repairText;
        audit = repairAudit;
      }

      hooks.onStage?.({
        phase: 'semantic_freeze',
        label: 'Social tissue freeze',
        message: 'Социальная ткань утверждена и заморожена.',
        responsePreview: clipText(dossierText, 1000),
        responseSections: [
          section('Freeze', [
            'Смысл социальной ткани больше не меняется.',
            'Теперь возможна только упаковка утверждённых фактов в JSON.'
          ])
        ]
      });

      let accumulatedValidationErrors = [];
      let retryInstruction = '';
      let previousSocialTissue = null;

      hooks.onStage?.({
        phase: 'semantic_shape',
        label: 'SocialTissueShaper',
        message: retryInstruction ? 'Повторяю social_tissue по validationErrors.' : 'Перевожу социальную ткань в строгий JSON.',
        requestPreview: summarizeMessages(buildSocialTissueShapeMessages(world, dossierText, audit, retryInstruction, previousSocialTissue, accumulatedValidationErrors)),
        requestSections: buildSocialTissueShapeRequestSections(world),
        attempt
      });
      const response = await client.complete(LegacyWorldRoles.SOCIAL_TISSUE_SHAPER, {
        model: config.model,
        messages: buildSocialTissueShapeMessages(world, dossierText, audit, retryInstruction, previousSocialTissue, accumulatedValidationErrors),
        temperature: 0.1,
        max_tokens: 1200
      });

      rawText = response?.choices?.[0]?.message?.content?.trim() ?? '';
      const parsedObject = parseJsonObject(rawText);
      if (!parsedObject) {
        lastFailureReason = 'SocialTissueShaper output is invalid JSON: response was not parseable. Likely copied sourceDossier or trailed into prose.';
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор ткани',
          message: `${lastFailureReason} Return only the requested social_tissue contract. Do not include frame, sourceDossier, audit, contract, notes.`,
          requestPreview,
          responsePreview: clipText(rawText, 1200),
          requestSections,
          responseSections: buildRetryResponseSections(rawText),
          attempt
        });
        if (attempt >= MAX_SOCIAL_TISSUE_ATTEMPTS) {
          throwGenerationFailure('social tissue', lastFailureReason);
        }
        await sleep(nextRetryDelay(attempt));
        continue;
      }

      previousSocialTissue = parsedObject;
      let evaluation = evaluateSocialTissueCandidate(parsedObject);
      if (!evaluation.ok) {
        accumulatedValidationErrors = mergeSocialTissueValidationErrors(
          accumulatedValidationErrors,
          describeValidationErrors(evaluation.validation)
        );
        const repairMessages = buildSocialTissueContractRepairMessages(world, dossierText, audit, accumulatedValidationErrors, parsedObject);
        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Social tissue repair',
          message: 'Исправляю social_tissue целиком по validationErrors.',
          requestPreview: summarizeMessages(repairMessages),
          attempt,
          repair: { kind: 'validation_repair', errorCount: accumulatedValidationErrors.length }
        });
        const repairResponse = await client.complete(LegacyWorldRoles.SOCIAL_TISSUE_REPAIR, {
          model: config.model,
          messages: repairMessages,
          temperature: 0.15,
          max_tokens: 1200
        });
        const repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        const repairObject = parseJsonObject(repairText);
        if (repairObject) {
          previousSocialTissue = repairObject;
          evaluation = evaluateSocialTissueCandidate(repairObject);
        }
      }

      if (evaluation.ok) {
        const normalized = canonicalizeSocialTissueStructure(validateSocialTissue(previousSocialTissue), world.placeSeed);
        hooks.onStage?.({
          phase: 'llm_response',
          label: 'Социальная ткань готова',
          message: 'SocialTissueShaper вернул структуру ткани.',
          responsePreview: clipText(rawText, 1400),
          responseSections: buildSocialTissueResponseSections(normalized)
        });
        return {
          provider: config.provider,
          usedFallback: false,
          data: normalized
        };
      }

      lastFailureReason = mergeSocialTissueValidationErrors(
        accumulatedValidationErrors,
        describeValidationErrors(evaluation.validation)
      ).join('; ') || 'причина не указана';
      retryInstruction = [
        'Fix only listed validationErrors.',
        ...buildSocialTissueAntiRegressionRules().map((rule) => `- ${rule}`),
        `Accumulated errors: ${lastFailureReason}`
      ].join(' ');
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор ткани',
        message: `Социальная ткань не прошла проверку: ${lastFailureReason}.`,
        requestPreview,
        responsePreview: clipText(rawText, 1200),
        requestSections,
        responseSections: buildValidationErrorSections('Social tissue validation', evaluation.validation),
        attempt
      });
      if (attempt >= MAX_SOCIAL_TISSUE_ATTEMPTS) {
        throwGenerationFailure('social tissue', lastFailureReason);
      }
    } catch (error) {
      const normalizedError = normalizeError(error, lastFailureReason || 'Social tissue generation failed.');
      const reason = normalizedError.message;
      lastFailureReason = reason;
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор ткани',
        message: `Генерация социальной ткани не удалась: ${reason}.`,
        requestPreview,
        responsePreview: clipText(rawText || repairAuditText || repairText || auditText || dossierText, 1200),
        requestSections,
        responseSections: buildRetryResponseSections(rawText || repairAuditText || repairText || auditText || dossierText),
        attempt
      });
      if (attempt >= MAX_SOCIAL_TISSUE_ATTEMPTS) {
        throwGenerationFailure('social tissue', reason);
      }
    }

    await sleep(nextRetryDelay(attempt));
  }

  throwGenerationFailure('social tissue', lastFailureReason || 'retry attempts exhausted without a valid LLM response');
}

export async function generatePlaceSeed(world, env = process.env, hooks = {}) {
  hooks = createSafeHooks(hooks);
  assertLegacyProviderAllowed('generatePlaceSeed', env, hooks, world);
  const config = getProviderConfig(env);
  if (!config.enabled) {
    throw new Error('DeepSeek API key is required to generate a place seed.');
  }
  hooks = createSafeHooks(hooks);

  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  const requestSections = buildPlaceSeedRequestSections(world);
  let attempt = 0;
  let previousAudit = null;
  let lastFailureReason = '';
  let frozenDossierText = '';
  let frozenAudit = null;

  while (attempt < MAX_PLACE_SEED_ATTEMPTS) {
    attempt += 1;
    let dossierText = '';
    let auditText = '';
    let repairText = '';
    let repairAuditText = '';
    let lastRawText = '';
    const dossierMessages = buildPlaceSeedDossierMessages(world, previousAudit);
    const requestPreview = summarizeMessages(dossierMessages);

    try {
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Place dossier',
        message: `Собираю смысл места, попытка ${attempt}.`,
        requestPreview,
        requestRaw: dossierMessages,
        requestSections,
        attempt,
        maxAttempts: MAX_PLACE_SEED_ATTEMPTS
      });
      const dossierResponse = await client.complete(LegacyWorldRoles.PLACE_SEED_DOSSIER, {
        model: config.model,
        messages: dossierMessages,
        temperature: 0.4,
        max_tokens: 1400
      });
      dossierText = dossierResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      lastRawText = dossierText;
      if (!dossierText) throw new Error('Empty place seed dossier response');
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Place dossier',
        message: 'Смысл места собран.',
        responsePreview: clipText(dossierText, 1400),
        responseRaw: dossierText,
        responseSections: buildSemanticTextSections('Dossier', dossierText)
      });

      hooks.onStage?.({
        phase: 'semantic_audit',
        label: 'Place audit',
        message: 'Проверяю место на историчность, причинность и географию.',
        requestPreview: summarizeMessages(buildPlaceSeedAuditMessages(world, dossierText)),
        requestRaw: buildPlaceSeedAuditMessages(world, dossierText),
        requestSections: buildPlaceSeedAuditRequestSections(world),
        attempt
      });
      const auditResponse = await client.complete(LegacyWorldRoles.PLACE_SEED_AUDIT, {
        model: config.model,
        messages: buildPlaceSeedAuditMessages(world, dossierText),
        temperature: 0.15,
        max_tokens: 700
      });
      auditText = auditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      lastRawText = auditText;
      let audit = parseSemanticAuditResponse(auditText);
      if (!audit) {
        lastFailureReason = summarizeInvalidSemanticAudit(auditText);
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор места',
          message: `Place audit вернул невалидный ответ: ${lastFailureReason}.`,
          requestPreview,
          responsePreview: clipText(auditText || dossierText, 1200),
          requestRaw: dossierMessages,
          responseRaw: auditText || dossierText,
          requestSections,
          responseSections: buildValidationErrorSections('Semantic audit validation', explainSemanticAuditValidation(parseJsonObject(auditText))),
          attempt
        });
        if (attempt >= MAX_PLACE_SEED_ATTEMPTS) {
          throw new Error(`Unable to generate place seed: ${lastFailureReason}.`);
        }
        await sleep(nextRetryDelay(attempt));
        continue;
      }

      if (audit.pass !== true) {
        lastFailureReason = summarizePlaceAuditFailure(audit);
        previousAudit = audit;
        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Исправление места',
          message: 'Прошу точечно исправить dossier по конкретным замечаниям аудита.',
          requestPreview: summarizeMessages(buildPlaceSeedRepairMessages(world, dossierText, audit)),
          requestRaw: buildPlaceSeedRepairMessages(world, dossierText, audit),
          requestSections: [
            section('Dossier', splitTextLines(dossierText)),
            section('Audit concerns', audit.concerns?.slice(0, 4) ?? []),
            section('Audit evidence', audit.evidence?.slice(0, 4) ?? [])
          ],
          attempt
        });
        const repairResponse = await client.complete(LegacyWorldRoles.PLACE_SEED_REPAIR, {
          model: config.model,
          messages: buildPlaceSeedRepairMessages(world, dossierText, audit),
          temperature: 0.2,
          max_tokens: 700
        });
        repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        lastRawText = repairText;
        if (!repairText) {
          hooks.onStage?.({
            phase: 'llm_retry',
            label: 'Повтор места',
            message: `Исправление места не вернуло текст: ${lastFailureReason}.`,
            requestPreview,
            responsePreview: clipText(auditText || dossierText, 1200),
            requestSections,
            responseSections: buildPlaceAuditResponseSections(audit),
            attempt
          });
          if (attempt >= MAX_PLACE_SEED_ATTEMPTS) {
            throw new Error(`Unable to generate place seed: ${lastFailureReason}.`);
          }
          await sleep(nextRetryDelay(attempt));
          continue;
        }

        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Исправление места',
          message: 'Получен исправленный dossier места, запускаю повторный аудит.',
          responsePreview: clipText(repairText, 1400),
          responseRaw: repairText,
          responseSections: buildSemanticTextSections('Repaired dossier', repairText),
          attempt
        });

        hooks.onStage?.({
          phase: 'semantic_audit',
          label: 'Place re-audit',
          message: 'Повторно проверяю исправленный смысл места.',
          requestPreview: summarizeMessages(buildPlaceSeedAuditMessages(world, repairText)),
          requestRaw: buildPlaceSeedAuditMessages(world, repairText),
          requestSections: buildPlaceSeedAuditRequestSections(world),
          attempt
        });
        const repairAuditResponse = await client.complete(LegacyWorldRoles.PLACE_SEED_AUDIT, {
          model: config.model,
          messages: buildPlaceSeedAuditMessages(world, repairText),
          temperature: 0.15,
          max_tokens: 700
        });
        repairAuditText = repairAuditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        lastRawText = repairAuditText;
        const repairAudit = parseSemanticAuditResponse(repairAuditText);
        if (!repairAudit) {
          lastFailureReason = summarizeInvalidSemanticAudit(repairAuditText);
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор места',
          message: `Повторный Place audit вернул невалидный ответ: ${lastFailureReason}.`,
          requestPreview,
          responsePreview: clipText(repairAuditText || repairText, 1200),
          requestRaw: buildPlaceSeedAuditMessages(world, repairText),
          responseRaw: repairAuditText || repairText,
          requestSections,
          responseSections: buildValidationErrorSections('Semantic audit validation', explainSemanticAuditValidation(parseJsonObject(repairAuditText))),
          attempt
        });
          if (attempt >= MAX_PLACE_SEED_ATTEMPTS) {
            throw new Error(`Unable to generate place seed: ${lastFailureReason}.`);
          }
          await sleep(nextRetryDelay(attempt));
          continue;
        }
        if (repairAudit.pass !== true) {
          lastFailureReason = summarizePlaceAuditFailure(repairAudit);
          previousAudit = repairAudit;
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор места',
          message: `Исправленный Place audit не прошёл: ${lastFailureReason}.`,
          requestPreview,
          responsePreview: clipText(repairAuditText || repairText, 1200),
          requestRaw: buildPlaceSeedRepairMessages(world, dossierText, audit),
          responseRaw: repairAuditText || repairText,
          requestSections,
          responseSections: buildPlaceAuditResponseSections(repairAudit),
          attempt
        });
          if (attempt >= MAX_PLACE_SEED_ATTEMPTS) {
            throw new Error(`Unable to generate place seed: ${lastFailureReason}.`);
          }
          await sleep(nextRetryDelay(attempt));
          continue;
        }

        dossierText = repairText;
        audit = repairAudit;
      }

      frozenDossierText = dossierText;
      frozenAudit = audit;
      hooks.onStage?.({
        phase: 'semantic_freeze',
        label: 'Place freeze',
        message: 'Смысл места утверждён и заморожен.',
        responsePreview: clipText(dossierText, 1000),
        responseRaw: dossierText,
        responseSections: [
          section('Freeze', [
            'Смысл места больше не меняется.',
            'Теперь возможна только упаковка утверждённых фактов в JSON.'
          ])
        ]
      });
      break;
    } catch (error) {
      const normalizedError = normalizeError(error, lastFailureReason || 'Place seed generation failed.');
      const reason = normalizedError.message;
      lastFailureReason = reason;
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор места',
        message: `Генерация места не удалась: ${reason}.`,
        requestPreview,
        responsePreview: clipText(lastRawText || repairAuditText || repairText || auditText || dossierText, 1200),
        requestSections,
        responseSections: buildRetryResponseSections(lastRawText || repairAuditText || repairText || auditText || dossierText),
        attempt
      });
      if (attempt >= MAX_PLACE_SEED_ATTEMPTS) {
        throw new Error(reason.startsWith('Unable to generate place seed:') ? reason : `Unable to generate place seed: ${reason}.`);
      }
    }

    await sleep(nextRetryDelay(attempt));
  }

  if (!frozenDossierText || !frozenAudit) {
    throw new Error(`Unable to generate place seed: ${lastFailureReason || 'retry attempts exhausted without a concrete place seed'}.`);
  }

  const dossierSections = parsePlaceSeedDossierSections(frozenDossierText);
  const fragmentState = {
    purposeOwnership: null,
    livelihoodRoads: null,
    accessHazardsRhythm: null
  };

  const purposeOwnership = await runPlaceSeedFragmentStage({
    client,
    config,
    hooks,
    world,
    dossierSections,
    fragmentState,
    stage: PLACE_SEED_FRAGMENT_STAGES.purposeOwnership
  });
  fragmentState.purposeOwnership = purposeOwnership;

  const livelihoodRoads = await runPlaceSeedFragmentStage({
    client,
    config,
    hooks,
    world,
    dossierSections,
    fragmentState,
    stage: PLACE_SEED_FRAGMENT_STAGES.livelihoodRoads
  });
  fragmentState.livelihoodRoads = livelihoodRoads;

  const accessHazardsRhythm = await runPlaceSeedFragmentStage({
    client,
    config,
    hooks,
    world,
    dossierSections,
    fragmentState,
    stage: PLACE_SEED_FRAGMENT_STAGES.accessHazardsRhythm
  });
  fragmentState.accessHazardsRhythm = accessHazardsRhythm;

  let assembledPlaceSeed = mergePlaceSeedFragments(world, fragmentState);
  let accumulatedValidationErrors = [];
  let repairAttempt = 0;

  while (repairAttempt < MAX_PLACE_SEED_SHAPE_ATTEMPTS) {
    const evaluation = evaluatePlaceSeedCandidate(assembledPlaceSeed);
    if (evaluation.ok) break;

    const validationErrors = describeValidationErrors(evaluation.validation);
    accumulatedValidationErrors = mergePlaceSeedValidationErrors(accumulatedValidationErrors, validationErrors);
    lastFailureReason = accumulatedValidationErrors.join('; ') || 'причина не указана';

    hooks.onStage?.({
      phase: 'semantic_validate',
      label: 'ValidatePlaceSeed',
      message: buildPlaceSeedValidationRetryMessage(evaluation.validation, assembledPlaceSeed),
      responsePreview: clipText(JSON.stringify(assembledPlaceSeed), 1400),
      responseSections: buildValidationErrorSections('Place validation', evaluation.validation)
    });

    const repairMessages = buildPlaceSeedContractRepairMessages(
      world,
      frozenDossierText,
      frozenAudit,
      accumulatedValidationErrors,
      assembledPlaceSeed
    );
    hooks.onStage?.({
      phase: 'semantic_repair',
      label: 'Place repair',
      message: 'Исправляю place_seed целиком по validationErrors и outputContract.',
      requestPreview: summarizeMessages(repairMessages),
      attempt: repairAttempt + 1,
      repair: { kind: 'validation_repair', errorCount: accumulatedValidationErrors.length }
    });
    const repairResponse = await client.complete(LegacyWorldRoles.PLACE_SEED_REPAIR, {
      model: config.model,
      messages: repairMessages,
      temperature: 0.15,
      max_tokens: 1200
    });
    const repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
    const repairParse = explainJsonObjectParse(repairText);
    if (!repairParse.ok) {
      repairAttempt += 1;
      if (repairAttempt >= MAX_PLACE_SEED_SHAPE_ATTEMPTS) {
        throwGenerationFailure('place seed', lastFailureReason);
      }
      continue;
    }
    assembledPlaceSeed = repairParse.data;
    repairAttempt += 1;
  }

  const finalEvaluation = evaluatePlaceSeedCandidate(assembledPlaceSeed);
  if (!finalEvaluation.ok) {
    throwGenerationFailure('place seed', describeValidationErrors(finalEvaluation.validation).join('; ') || lastFailureReason);
  }

  hooks.onStage?.({
    phase: 'semantic_validate',
    label: 'ValidatePlaceSeed',
    message: 'PlaceSeed fragment merge passed final validation.',
    responsePreview: clipText(JSON.stringify(assembledPlaceSeed), 1400),
    responseSections: buildPlaceSeedResponseSections(assembledPlaceSeed)
  });
  hooks.onStage?.({
    phase: 'llm_response',
    label: 'Место готово',
    message: 'Place seed merged from validated fragment outputs.',
    responsePreview: clipText(JSON.stringify(assembledPlaceSeed), 1400),
    responseSections: buildPlaceSeedResponseSections(assembledPlaceSeed)
  });
  return {
    provider: config.provider,
    usedFallback: false,
    data: assembledPlaceSeed
  };
}

export async function generatePlayerSeed(world, env = process.env, hooks = {}) {
  hooks = createSafeHooks(hooks);
  assertLegacyProviderAllowed('generatePlayerSeed', env, hooks, world);
  const config = getProviderConfig(env);
  if (!config.enabled) {
    throw new Error('DeepSeek API key is required to generate a player seed.');
  }
  hooks = createSafeHooks(hooks);

  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  const requestSections = buildPlayerSeedRequestSections(world);
  let dossierAttempt = 0;
  let lastFailureReason = '';
  let previousAudit = null;
  let frozenDossierText = '';
  let frozenAudit = null;

  while (dossierAttempt < MAX_PLAYER_SEED_ATTEMPTS && !frozenDossierText) {
    dossierAttempt += 1;
    let dossierText = '';
    let auditText = '';
    const dossierMessages = buildPlayerSeedDossierMessages(world, previousAudit);
    const requestPreview = summarizeMessages(dossierMessages);
    try {
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Player dossier',
        message: `Собираю смысл игрока, попытка ${dossierAttempt}.`,
        requestPreview,
        requestSections,
        attempt: dossierAttempt,
        maxAttempts: MAX_PLAYER_SEED_ATTEMPTS
      });
      const dossierResponse = await client.complete(LegacyWorldRoles.PLAYER_SEED_DOSSIER, {
        model: config.model,
        messages: dossierMessages,
        temperature: 0.4,
        max_tokens: 1400
      });
      dossierText = dossierResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!dossierText) throw new Error('Empty player seed dossier response');
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Player dossier',
        message: 'Смысл игрока собран.',
        responsePreview: clipText(dossierText, 1400),
        responseSections: buildSemanticTextSections('Dossier', dossierText)
      });

      hooks.onStage?.({
        phase: 'semantic_audit',
        label: 'Player audit',
        message: 'Проверяю игрока на историчность, статус и правдоподобие тела/имущества.',
        requestPreview: summarizeMessages(buildPlayerSeedAuditMessages(world, dossierText)),
        requestSections: buildPlayerSeedAuditRequestSections(world),
        attempt: dossierAttempt
      });
      const auditResponse = await client.complete(LegacyWorldRoles.PLAYER_SEED_AUDIT, {
        model: config.model,
        messages: buildPlayerSeedAuditMessages(world, dossierText),
        temperature: 0.15,
        max_tokens: 700
      });
      auditText = auditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      const audit = applyPlayerSeedAuditGuard(parseSemanticAuditResponse(auditText), dossierText, world);
      if (!audit || audit.pass !== true) {
        previousAudit = audit ?? {
          pass: false,
          concerns: ['player_seed audit missing or invalid'],
          evidence: ['player_seed audit missing or invalid']
        };
        lastFailureReason = summarizePlayerSeedAuditFailure(previousAudit);
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор игрока',
          message: `Player audit не прошёл, повтор через ${nextRetryDelay(dossierAttempt)} мс.`,
          requestPreview,
          responsePreview: clipText(auditText || dossierText, 1200),
          requestSections,
          responseSections: [
            section('Dossier', splitTextLines(dossierText)),
            section('Audit', audit ? [
              `pass=${audit.pass}`,
              `concerns=${audit.concerns?.slice(0, 3).join(' | ') || 'не предоставлено'}`,
              `evidence=${audit.evidence?.slice(0, 3).join(' | ') || 'не предоставлено'}`
            ] : ['invalid audit'])
          ],
          attempt: dossierAttempt
        });
        await sleep(nextRetryDelay(dossierAttempt));
        continue;
      }

      frozenDossierText = dossierText;
      frozenAudit = audit;
    } catch (error) {
      const normalizedError = normalizeError(error, lastFailureReason || 'Player seed generation failed.');
      lastFailureReason = normalizedError.message;
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор игрока',
        message: `Генерация игрока не удалась, повтор через ${nextRetryDelay(dossierAttempt)} мс.`,
        requestPreview,
        responsePreview: clipText(auditText || dossierText, 1200),
        requestSections,
        responseSections: buildRetryResponseSections(auditText || dossierText),
        attempt: dossierAttempt
      });
      if (dossierAttempt >= MAX_PLAYER_SEED_ATTEMPTS) {
        throwGenerationFailure('player seed', lastFailureReason || describeValidationErrors(explainPlayerSeedValidation(normalizePlayerSeedShape(parseJsonObject(auditText || dossierText)))).join('; ') || 'причина не указана');
      }
      await sleep(nextRetryDelay(dossierAttempt));
    }
  }

  if (!frozenDossierText || !frozenAudit) {
    throwGenerationFailure('player seed', lastFailureReason || 'retry loop exhausted without a frozen dossier');
  }

  hooks.onStage?.({
    phase: 'semantic_freeze',
    label: 'Player freeze',
    message: 'Смысл игрока утверждён и заморожен.',
    responsePreview: clipText(frozenDossierText, 1000),
    responseSections: [
      section('Freeze', [
        'Смысл игрока больше не меняется.',
        'Теперь возможна только упаковка утверждённых фактов в JSON.'
      ])
    ]
  });

  let shapeAttempt = 0;
  let retryInstruction = '';
  let compactShape = false;
  let accumulatedValidationErrors = [];
  let previousPlayerSeed = null;

  while (shapeAttempt < MAX_PLAYER_SEED_ATTEMPTS) {
    shapeAttempt += 1;
    let rawText = '';
    let shapeTokenUsage = null;
    try {
      const shapeMessages = buildPlayerSeedShapeMessages(world, frozenDossierText, frozenAudit, retryInstruction, compactShape, previousPlayerSeed);
      const shapeRequestSections = buildPlayerSeedShapeRequestSections(world, retryInstruction, compactShape, accumulatedValidationErrors);
      hooks.onStage?.({
        phase: 'semantic_shape',
        label: 'PlayerSeedShaper',
        message: compactShape
          ? 'Перевожу смысл игрока в компактный JSON.'
          : 'Перевожу смысл игрока в строгий JSON.',
        requestPreview: summarizeMessages(shapeMessages),
        requestRaw: shapeMessages,
        requestSections: shapeRequestSections,
        attempt: shapeAttempt,
        maxAttempts: MAX_PLAYER_SEED_ATTEMPTS,
        maxTokens: PLAYER_SEED_SHAPE_MAX_TOKENS,
        schema: 'player_seed'
      });
      const response = await client.complete(LegacyWorldRoles.PLAYER_SEED_SHAPER, {
        model: config.model,
        messages: shapeMessages,
        temperature: 0.2,
        max_tokens: PLAYER_SEED_SHAPE_MAX_TOKENS
      });

      rawText = response?.choices?.[0]?.message?.content?.trim() ?? '';
      shapeTokenUsage = response?.usage ?? null;
      const truncated = isLlmOutputTruncated(shapeTokenUsage, PLAYER_SEED_SHAPE_MAX_TOKENS);
      const parseResult = explainJsonObjectParse(rawText);
      if (!parseResult.ok) {
        compactShape = compactShape || truncated || shapeAttempt >= 2;
        lastFailureReason = buildPlayerSeedParseFailureMessage(parseResult, truncated);
        retryInstruction = buildPlayerSeedParseRetryInstruction({ truncated, compactShape });
        accumulatedValidationErrors = [];
        previousPlayerSeed = null;
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор игрока',
          message: `${lastFailureReason} ${retryInstruction}`,
          requestPreview: summarizeMessages(shapeMessages),
          responsePreview: clipText(rawText, 1200),
          requestRaw: shapeMessages,
          responseRaw: rawText,
          requestSections: shapeRequestSections,
          responseSections: buildRetryResponseSections(rawText),
          attempt: shapeAttempt,
          maxAttempts: MAX_PLAYER_SEED_ATTEMPTS,
          maxTokens: PLAYER_SEED_SHAPE_MAX_TOKENS,
          tokenUsage: shapeTokenUsage,
          repair: { kind: 'parse_repair', truncated },
          schema: 'player_seed'
        });
        if (shapeAttempt >= MAX_PLAYER_SEED_ATTEMPTS) {
          throwGenerationFailure('player seed', lastFailureReason);
        }
        await sleep(nextRetryDelay(shapeAttempt));
        continue;
      }

      const envelope = explainPlayerSeedEnvelope(parseResult.data);
      if (!envelope.ok) {
        compactShape = compactShape || truncated;
        lastFailureReason = envelope.errors.join('; ');
        retryInstruction = buildPlayerSeedWrongSchemaRetryInstruction(envelope.errors);
        accumulatedValidationErrors = [];
        previousPlayerSeed = null;
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор игрока',
          message: `${lastFailureReason} ${retryInstruction}`,
          requestPreview: summarizeMessages(shapeMessages),
          responsePreview: clipText(rawText, 1200),
          requestRaw: shapeMessages,
          responseRaw: rawText,
          requestSections: shapeRequestSections,
          responseSections: buildValidationErrorSections('Player schema', { ok: false, errors: envelope.errors }),
          attempt: shapeAttempt,
          maxAttempts: MAX_PLAYER_SEED_ATTEMPTS,
          maxTokens: PLAYER_SEED_SHAPE_MAX_TOKENS,
          tokenUsage: shapeTokenUsage,
          repair: { kind: 'wrong_schema', truncated },
          schema: 'player_seed'
        });
        if (shapeAttempt >= MAX_PLAYER_SEED_ATTEMPTS) {
          throwGenerationFailure('player seed', lastFailureReason);
        }
        await sleep(nextRetryDelay(shapeAttempt));
        continue;
      }

      const normalizedObject = normalizePlayerSeedShape(parseResult.data);
      previousPlayerSeed = normalizedObject;
      const evaluation = evaluatePlayerSeedCandidate(normalizedObject, compactShape);
      if (evaluation.ok) {
        const result = normalizedObject;
        const canonicalName = playerSeedInputName(world?.player ?? {});
        if (canonicalName) {
          result.name = canonicalName;
          result.identity ??= {};
          result.identity.name = canonicalName;
          result.identity.display_name = canonicalName;
          result.identity.displayName = canonicalName;
        }
        hooks.onStage?.({
          phase: 'llm_response',
          label: 'Игрок готов',
          message: 'PlayerSeedShaper вернул структуру игрока.',
          responsePreview: clipText(rawText, 1400),
          responseRaw: rawText,
          responseSections: buildPlayerSeedResponseSections(result),
          tokenUsage: shapeTokenUsage,
          maxTokens: PLAYER_SEED_SHAPE_MAX_TOKENS,
          schema: 'player_seed'
        });
        return {
          provider: config.provider,
          usedFallback: false,
          data: result
        };
      }

      const validationErrors = describeValidationErrors(evaluation.validation);
      const itemValidationErrors = describeValidationErrors(evaluation.itemValidation);
      const combinedValidationErrors = mergePlayerSeedValidationErrors(validationErrors, itemValidationErrors);
      accumulatedValidationErrors = mergePlayerSeedValidationErrors(accumulatedValidationErrors, combinedValidationErrors);
      lastFailureReason = combinedValidationErrors.join('; ') || 'причина не указана';
      compactShape = compactShape || truncated;

      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор игрока',
        message: `Игрок не прошёл проверку: ${lastFailureReason}. Повторю только упаковку замороженного dossier.`,
        requestPreview: summarizeMessages(shapeMessages),
        responsePreview: clipText(rawText, 1200),
        requestRaw: shapeMessages,
        responseRaw: rawText,
        requestSections: shapeRequestSections,
        responseSections: buildValidationErrorSections('Player validation', evaluation.validation),
        attempt: shapeAttempt,
        maxAttempts: MAX_PLAYER_SEED_ATTEMPTS,
        maxTokens: PLAYER_SEED_SHAPE_MAX_TOKENS,
        tokenUsage: shapeTokenUsage,
        repair: { kind: 'validation_repair', truncated, errorCount: accumulatedValidationErrors.length },
        schema: 'player_seed'
      });

      const repairMessages = buildPlayerSeedRepairMessages(
        world,
        frozenDossierText,
        frozenAudit,
        accumulatedValidationErrors,
        normalizedObject,
        compactShape
      );
      hooks.onStage?.({
        phase: 'semantic_repair',
        label: 'Player repair',
        message: 'Исправляю player_seed целиком по validationErrors и outputContract.',
        requestPreview: summarizeMessages(repairMessages),
        requestSections: buildPlayerSeedRepairRequestSections(world, accumulatedValidationErrors),
        attempt: shapeAttempt,
        repair: { kind: 'validation_repair' }
      });
      const repairResponse = await client.complete(LegacyWorldRoles.PLAYER_SEED_REPAIR, {
        model: config.model,
        messages: repairMessages,
        temperature: 0.15,
        max_tokens: PLAYER_SEED_SHAPE_MAX_TOKENS
      });
      const repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      const repairParseResult = explainJsonObjectParse(repairText);
      hooks.onStage?.({
        phase: 'semantic_repair',
        label: 'Player repair',
        message: repairParseResult.ok
          ? 'RepairLLM вернул полный JSON player_seed.'
          : 'RepairLLM не вернул parseable JSON; повторю shaper с anti-regression.',
        responsePreview: clipText(repairText, 1400),
        responseRaw: repairText,
        responseSections: repairParseResult.ok
          ? buildPlayerSeedResponseSections(normalizePlayerSeedShape(repairParseResult.data))
          : buildRetryResponseSections(repairText),
        attempt: shapeAttempt,
        repair: { kind: repairParseResult.ok ? 'full_json_repair' : 'full_json_repair_failed' }
      });

      if (repairParseResult.ok) {
        const repairEnvelope = explainPlayerSeedEnvelope(repairParseResult.data);
        if (repairEnvelope.ok) {
          const repairedObject = normalizePlayerSeedShape(repairParseResult.data);
          previousPlayerSeed = repairedObject;
          const repairEvaluation = evaluatePlayerSeedCandidate(repairedObject, compactShape);
          if (repairEvaluation.ok) {
            const result = repairedObject;
            const canonicalName = playerSeedInputName(world?.player ?? {});
            if (canonicalName) {
              result.name = canonicalName;
              result.identity ??= {};
              result.identity.name = canonicalName;
              result.identity.display_name = canonicalName;
              result.identity.displayName = canonicalName;
            }
            hooks.onStage?.({
              phase: 'llm_response',
              label: 'Игрок готов',
              message: 'RepairLLM вернул валидный player_seed.',
              responsePreview: clipText(repairText, 1400),
              responseRaw: repairText,
              responseSections: buildPlayerSeedResponseSections(result),
              tokenUsage: repairResponse?.usage ?? shapeTokenUsage,
              maxTokens: PLAYER_SEED_SHAPE_MAX_TOKENS,
              schema: 'player_seed'
            });
            return {
              provider: config.provider,
              usedFallback: false,
              data: result
            };
          }
          const repairValidationErrors = describeValidationErrors(repairEvaluation.validation);
          const repairItemErrors = describeValidationErrors(repairEvaluation.itemValidation);
          accumulatedValidationErrors = mergePlayerSeedValidationErrors(
            accumulatedValidationErrors,
            mergePlayerSeedValidationErrors(repairValidationErrors, repairItemErrors)
          );
          lastFailureReason = accumulatedValidationErrors.join('; ') || lastFailureReason;
        }
      }

      retryInstruction = buildPlayerSeedRetryInstruction(accumulatedValidationErrors, compactShape);

      if (shapeAttempt >= MAX_PLAYER_SEED_ATTEMPTS) {
        throwGenerationFailure('player seed', lastFailureReason);
      }
      await sleep(nextRetryDelay(shapeAttempt));
      continue;
    } catch (error) {
      const normalizedError = normalizeError(error, lastFailureReason || 'Player seed generation failed.');
      lastFailureReason = normalizedError.message;
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор игрока',
        message: `Генерация игрока не удалась, повтор через ${nextRetryDelay(shapeAttempt)} мс.`,
        requestPreview: summarizeMessages(buildPlayerSeedShapeMessages(world, frozenDossierText, frozenAudit, retryInstruction, compactShape, previousPlayerSeed)),
        responsePreview: clipText(rawText || frozenDossierText, 1200),
        responseRaw: rawText || null,
        requestSections: buildPlayerSeedShapeRequestSections(world, retryInstruction, compactShape, accumulatedValidationErrors),
        responseSections: buildRetryResponseSections(rawText || frozenDossierText),
        attempt: shapeAttempt,
        maxTokens: PLAYER_SEED_SHAPE_MAX_TOKENS,
        tokenUsage: shapeTokenUsage
      });
      if (shapeAttempt >= MAX_PLAYER_SEED_ATTEMPTS) {
        const parseResult = explainJsonObjectParse(rawText || '');
        const failureDetail = parseResult.ok
          ? describeValidationErrors(explainPlayerSeedValidation(normalizePlayerSeedShape(parseResult.data))).join('; ')
          : buildPlayerSeedParseFailureMessage(parseResult);
        throwGenerationFailure('player seed', lastFailureReason || failureDetail || 'причина не указана');
      }
      await sleep(nextRetryDelay(shapeAttempt));
      continue;
    }
  }

  throwGenerationFailure('player seed', lastFailureReason || 'retry loop exhausted without a valid LLM response');
}

export async function generateMasterResponse(frame, localOutcome, env = process.env, hooks = {}) {
  hooks = createSafeHooks(hooks);
  assertLegacyProviderAllowed('generateMasterResponse', env, hooks, frame);
  const config = getProviderConfig(env);
  if (!config.enabled) {
    throw new Error('DeepSeek API key is required. Set DEEPSEEK_API_KEY to run the simulation.');
  }
  hooks = createSafeHooks(hooks);

  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  const dossierMessages = buildMasterDossierMessages(frame, localOutcome);
  const requestPreview = summarizeMessages(dossierMessages);
  const requestSections = buildMasterRequestSections(frame, localOutcome);
  const emitStage = (payload) => {
    try {
      hooks.onStage?.(payload);
    } catch {
      // Telemetry must not abort the simulation.
    }
  };
  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRY_ATTEMPTS) {
    attempt += 1;
    let dossierText = '';
    let auditText = '';
    let rawText = '';
    try {
      emitStage({
        phase: 'semantic_dossier',
        label: 'Semantic dossier',
        message: `Собираю смысловой слой master-хода, попытка ${attempt}.`,
        requestPreview,
        requestSections,
        attempt,
        maxAttempts: Number.isFinite(MAX_RETRY_ATTEMPTS) ? MAX_RETRY_ATTEMPTS : null
      });
      const dossierResponse = await client.complete(LegacyWorldRoles.MASTER_DOSSIER, {
        model: config.model,
        messages: dossierMessages,
        temperature: 0.55,
        max_tokens: 900
      });

      dossierText = dossierResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!dossierText) {
        throw new Error('Empty semantic dossier response');
      }
      emitStage({
        phase: 'semantic_dossier',
        label: 'Semantic dossier',
        message: 'Смысловой слой master-хода собран.',
        responsePreview: clipText(dossierText, 1400),
        responseSections: buildSemanticTextSections('Dossier', dossierText)
      });

      emitStage({
        phase: 'semantic_audit',
        label: 'Semantic audit',
        message: 'Отдельный проверяющий LLM сверяет историчность, причинность и видимость.',
        requestPreview: summarizeMessages(buildMasterAuditMessages(frame, dossierText, localOutcome)),
        requestSections: buildMasterAuditRequestSections(frame, localOutcome),
        attempt
      });
      const auditResponse = await client.complete(LegacyWorldRoles.MASTER_AUDIT, {
        model: config.model,
        messages: buildMasterAuditMessages(frame, dossierText, localOutcome),
        temperature: 0.2,
        max_tokens: 700
      });

      auditText = auditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      const auditObject = parseJsonObject(auditText);
      const audit = normalizeSemanticAuditResponse(auditObject, auditText);
      if (!audit || audit.pass !== true) {
        const auditReason = auditObject
          ? describeValidationErrors(explainSemanticAuditValidation(auditObject)).join('; ') || 'причина не указана'
          : 'Semantic audit output is invalid JSON: response was not parseable.';
        lastError = new Error(auditReason);
        emitStage({
          phase: 'llm_retry',
          label: 'Повтор запроса',
          message: `Semantic audit не прошёл: ${auditReason}. Повтор через ${nextRetryDelay(attempt)} мс.`,
          requestPreview,
          responsePreview: clipText(auditText || dossierText, 1200),
          requestSections,
          responseSections: [
            section('Dossier', splitTextLines(dossierText)),
            section('Audit', audit ? [
              `pass=${audit.pass}`,
              `concerns=${audit.concerns?.slice(0, 3).join(' | ') || 'не предоставлено'}`,
              `evidence=${audit.evidence?.slice(0, 3).join(' | ') || 'не предоставлено'}`
            ] : (auditObject ? describeValidationErrors(explainSemanticAuditValidation(auditObject)) : ['invalid audit']))
          ],
          attempt
        });
        if (attempt < MAX_MASTER_RESPONSE_ATTEMPTS) {
          await sleep(nextRetryDelay(attempt));
        }
        continue;
      }

      emitStage({
        phase: 'semantic_freeze',
        label: 'Semantic Freeze',
        message: 'Смысл утверждён и заморожен до упаковки в JSON.',
        responsePreview: clipText(dossierText, 1000),
        responseSections: [
          section('Freeze', [
            'Смысл больше не меняется.',
            'Теперь возможна только упаковка утверждённых фактов в JSON.'
          ])
        ]
      });

      let accumulatedValidationErrors = [];
      let retryInstruction = '';
      let previousMasterNarrative = null;

      emitStage({
        phase: 'semantic_shape',
        label: 'MasterNarrativeShaper',
        message: retryInstruction ? 'Повторяю master_narrative по validationErrors.' : 'Перевожу утверждённый смысл в строгий JSON.',
        requestPreview: summarizeMessages(buildMasterShapeMessages(frame, dossierText, audit, localOutcome, retryInstruction, previousMasterNarrative, accumulatedValidationErrors)),
        requestSections: buildMasterShapeRequestSections(frame, localOutcome),
        attempt
      });
      const response = await client.complete(LegacyWorldRoles.MASTER_SHAPER, {
        model: config.model,
        messages: buildMasterShapeMessages(frame, dossierText, audit, localOutcome, retryInstruction, previousMasterNarrative, accumulatedValidationErrors),
        temperature: 0.25,
        max_tokens: 700
      });

      rawText = response?.choices?.[0]?.message?.content?.trim() ?? '';
      const parsedObject = parseJsonObject(rawText);
      if (!parsedObject) {
        lastError = new Error('MasterNarrativeShaper output is invalid JSON: response was not parseable.');
        emitStage({
          phase: 'llm_retry',
          label: 'Повтор запроса',
          message: `${lastError.message} Return only master_narrative contract.`,
          requestPreview,
          responsePreview: clipText(rawText || auditText || dossierText, 1200),
          requestSections,
          responseSections: buildRetryResponseSections(rawText || auditText || dossierText),
          attempt
        });
        if (attempt >= MAX_MASTER_RESPONSE_ATTEMPTS) {
          throw new Error(`Unable to generate master response: ${lastError.message}`);
        }
        await sleep(nextRetryDelay(attempt));
        continue;
      }

      previousMasterNarrative = parsedObject;
      let evaluation = evaluateMasterNarrativeCandidate(parsedObject);
      if (!evaluation.ok) {
        accumulatedValidationErrors = mergeMasterNarrativeValidationErrors(
          accumulatedValidationErrors,
          describeValidationErrors(evaluation.validation)
        );
        const repairMessages = buildMasterNarrativeContractRepairMessages(frame, localOutcome, dossierText, audit, accumulatedValidationErrors, parsedObject);
        const repairRequestPreview = summarizeMessages(repairMessages);
        emitStage({
          phase: 'semantic_repair',
          label: 'Master repair',
          message: 'Исправляю master_narrative целиком по validationErrors.',
          requestPreview: repairRequestPreview,
          requestSections: buildMasterNarrativeRepairRequestSections(frame, localOutcome, dossierText, audit, rawText, accumulatedValidationErrors),
          attempt,
          repair: { kind: 'validation_repair', errorCount: accumulatedValidationErrors.length }
        });
        const repairResponse = await client.complete(LegacyWorldRoles.MASTER_REPAIR, {
          model: config.model,
          messages: repairMessages,
          temperature: 0.2,
          max_tokens: 700
        });
        const repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        const repairObject = parseJsonObject(repairText);
        if (repairObject) {
          previousMasterNarrative = repairObject;
          evaluation = evaluateMasterNarrativeCandidate(repairObject);
        }
      }

      if (evaluation.ok) {
        const parsed = validateMasterNarrative(previousMasterNarrative);
        parsed.historical_audit = audit;
        emitStage({
          phase: 'llm_response',
          label: 'Ответ получен',
          message: 'MasterNarrativeShaper вернул структурированный ответ.',
          responsePreview: clipText(rawText, 1200),
          responseSections: buildMasterResponseSections(parsed)
        });
        return {
          provider: config.provider,
          usedFallback: false,
          narrative: parsed
        };
      }

      lastError = new Error(
        mergeMasterNarrativeValidationErrors(
          accumulatedValidationErrors,
          describeValidationErrors(evaluation.validation)
        ).join('; ') || 'master_narrative validation failed'
      );
      retryInstruction = [
        'Fix only listed validationErrors.',
        ...buildMasterNarrativeAntiRegressionRules().map((rule) => `- ${rule}`),
        `Accumulated errors: ${lastError.message}`
      ].join(' ');
      emitStage({
        phase: 'llm_retry',
        label: 'Повтор запроса',
        message: `Master narrative не прошёл проверку: ${lastError.message}.`,
        requestPreview,
        responsePreview: clipText(rawText || auditText || dossierText, 1200),
        requestSections,
        responseSections: buildValidationErrorSections('Master validation', evaluation.validation),
        attempt
      });
      if (attempt >= MAX_MASTER_RESPONSE_ATTEMPTS) {
        throw new Error(`Unable to generate master response: ${lastError.message}`);
      }
      await sleep(nextRetryDelay(attempt));
      continue;
    } catch (error) {
      lastError = normalizeError(error, 'ошибка не указана');
      emitStage({
        phase: 'llm_retry',
        label: 'Повтор запроса',
        message: `Запрос не прошёл: ${lastError.message || 'ошибка не указана'}. Повтор через ${nextRetryDelay(attempt)} мс.`,
        requestPreview,
        responsePreview: clipText(rawText || auditText || dossierText, 1200),
        requestSections,
        responseSections: buildRetryResponseSections(rawText || auditText || dossierText),
        attempt
      });
      if (attempt >= MAX_MASTER_RESPONSE_ATTEMPTS) {
        throw new Error(`Unable to generate master response: ${lastError.message || 'ошибка не указана'}`);
      }
      await sleep(nextRetryDelay(attempt));
    }
  }

  throw new Error(`Unable to generate master response: ${normalizeError(lastError).message || 'ошибка не указана'}.`);
}

export async function generateRiskAudit(frame, env = process.env, hooks = {}) {
  const config = getProviderConfig(env);
  if (!config.enabled) {
    throw new Error('DeepSeek API key is required to generate a risk audit.');
  }
  hooks = createSafeHooks(hooks);

  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  const requestPreview = summarizeMessages(buildRiskAuditMessages(frame));
  const requestSections = buildRiskRequestSections(frame);
  let attempt = 0;

  while (attempt < MAX_RETRY_ATTEMPTS) {
    attempt += 1;
    let rawText = '';
    try {
      hooks.onStage?.({
        phase: 'llm_request',
        label: 'Аудит риска',
        message: `Оцениваю необходимость проверки, попытка ${attempt}.`,
        requestPreview,
        requestSections,
        attempt,
        maxAttempts: Number.isFinite(MAX_RETRY_ATTEMPTS) ? MAX_RETRY_ATTEMPTS : null
      });
      const response = await client.complete(LegacyWorldRoles.RISK_AUDIT, {
        model: config.model,
        messages: buildRiskAuditMessages(frame),
        temperature: 0.2,
        max_tokens: 700
      });

      rawText = response?.choices?.[0]?.message?.content?.trim() ?? '';
      const parsedObject = parseJsonObject(rawText);
      const parsed = validateRiskAudit(parsedObject);
      if (parsed) {
        hooks.onStage?.({
          phase: 'llm_response',
          label: 'Аудит готов',
          message: 'LLM вернула аудит необходимости проверки.',
          responsePreview: clipText(rawText, 1200),
          responseSections: buildRiskResponseSections(parsed)
        });
        return {
          provider: config.provider,
          usedFallback: false,
          data: parsed
        };
      }
      const validation = explainRiskAuditValidation(parsedObject);
      const validationReason = parsedObject
        ? describeValidationErrors(validation).join('; ') || 'причина не указана'
        : 'RiskAudit output is invalid JSON: response was not parseable. Likely copied source envelope or trailed into prose.';
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор аудита',
        message: `Аудит риска не прошёл проверку контракта: ${validationReason}.`,
        requestPreview,
        responsePreview: clipText(rawText, 1200),
        requestSections,
        responseSections: buildValidationErrorSections('Risk validation', validation),
        attempt
      });
    } catch (error) {
      const normalizedError = normalizeError(error, 'Risk audit generation failed.');
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор аудита',
        message: `Аудит риска не удался: ${normalizedError.message}. Повтор через ${nextRetryDelay(attempt)} мс.`,
        requestPreview,
        responsePreview: clipText(rawText, 1200),
        requestSections,
        responseSections: buildRetryResponseSections(rawText),
        attempt
      });
      await sleep(nextRetryDelay(attempt));
      continue;
    }

    hooks.onStage?.({
      phase: 'llm_retry',
      label: 'Повтор аудита',
      message: `Аудит риска не прошёл проверку формата, повтор через ${nextRetryDelay(attempt)} мс.`,
      requestPreview,
      responsePreview: clipText(rawText, 1200),
      requestSections,
      responseSections: buildRetryResponseSections(rawText),
      attempt
    });
    await sleep(nextRetryDelay(attempt));
  }

  throw new Error('Risk audit retry loop exhausted unexpectedly.');
}

export async function repairMasterNarrativeForRecoveryRoute(
  frame,
  localOutcome,
  narrative,
  recoveryRoute,
  env = process.env,
  hooks = {}
) {
  hooks = createSafeHooks(hooks);
  assertLegacyProviderAllowed('repairMasterNarrativeForRecoveryRoute', env, hooks, frame);
  if (!recoveryRoute || recoveryRoute.repair_target_stage !== 'master_narrative') {
    throw new Error('Unsupported recovery route for master_narrative repair.');
  }
  const config = getProviderConfig(env);
  if (!config.enabled) {
    throw createSemanticRecoveryError(
      createSemanticRecoveryRoute({
        ...recoveryRoute,
        class: 'terminal_failure',
        terminal_status: 'needs_manual_review'
      }),
      'LLM provider is required for master_narrative upstream repair.'
    );
  }

  hooks = createSafeHooks(hooks);
  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  const repairHistory = [];

  for (let repairAttemptIndex = 1; repairAttemptIndex <= 2; repairAttemptIndex += 1) {
    const modelTier = getSemanticRepairModelTier(repairAttemptIndex);
    const repairMessages = buildMasterNarrativeUpstreamRepairMessages(
      frame,
      localOutcome,
      narrative,
      recoveryRoute,
      repairHistory
    );
    hooks.onStage?.({
      phase: 'semantic_repair',
      label: 'Master narrative upstream repair',
      message: 'Исправляю master_narrative по recovery route.',
      requestPreview: summarizeMessages(repairMessages),
      attempt: repairAttemptIndex,
      maxAttempts: 2,
      ...buildStageTelemetry('master_narrative', 'semantic_repair', repairAttemptIndex, repairAttemptIndex, modelTier)
    });

    let rawText = '';
    try {
      const repairResponse = await client.complete(LegacyWorldRoles.MASTER_REPAIR, {
        model: config.model,
        messages: repairMessages,
        temperature: repairAttemptIndex >= 2 ? 0.15 : 0.2,
        max_tokens: 900,
        agentType: 'repair'
      });
      rawText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      const parsedObject = parseJsonObject(rawText);
      if (!parsedObject) {
        throw new Error('MasterNarrativeRepairer output is invalid JSON: response was not parseable.');
      }
      const evaluation = evaluateMasterNarrativeCandidate(parsedObject);
      if (!evaluation.ok) {
        throw new Error(describeValidationErrors(evaluation.validation).join('; ') || 'master_narrative validation failed');
      }
      const routeAfterRepair = validateMasterNarrativeAgainstVisibleInputs(frame?.world ?? {}, parsedObject);
      if (routeAfterRepair) {
        throw createSemanticRecoveryError(routeAfterRepair, 'master_narrative still conflicts with approved visible inputs');
      }
      const approvedNarrative = validateMasterNarrative(parsedObject);
      approvedNarrative.historical_audit = narrative?.historical_audit ?? approvedNarrative.historical_audit ?? null;
      hooks.onStage?.({
        phase: 'semantic_repair',
        label: 'Master narrative upstream repair',
        message: 'master_narrative repaired and approved.',
        responsePreview: clipText(rawText, 1200),
        attempt: repairAttemptIndex,
        maxAttempts: 2,
        ...buildStageTelemetry('master_narrative', 'semantic_repair', repairAttemptIndex, repairAttemptIndex, modelTier, 'passed')
      });
      return {
        provider: config.provider,
        usedFallback: false,
        narrative: approvedNarrative,
        recoveryRoute,
        repairHistory
      };
    } catch (error) {
      const normalizedError = normalizeError(error, 'Master narrative upstream repair failed.');
      repairHistory.push({
        attempt: repairAttemptIndex,
        model_tier: modelTier,
        error: normalizedError.message,
        previous_output: rawText || null
      });
      hooks.onStage?.({
        phase: 'semantic_repair',
        label: 'Master narrative upstream repair',
        message: normalizedError.message,
        responsePreview: clipText(rawText, 1200),
        attempt: repairAttemptIndex,
        maxAttempts: 2,
        ...buildStageTelemetry(
          'master_narrative',
          'semantic_repair',
          repairAttemptIndex,
          repairAttemptIndex,
          modelTier,
          repairAttemptIndex >= 2 ? 'needs_manual_review' : 'failed'
        )
      });
      if (repairAttemptIndex >= 2) {
        const terminalRoute = createSemanticRecoveryRoute({
          ...recoveryRoute,
          class: 'terminal_failure',
          terminal_status: 'needs_manual_review'
        });
        throw createSemanticRecoveryError(
          terminalRoute,
          `stage_failed / needs_manual_review: ${normalizedError.message}`
        );
      }
    }
  }

  throw createSemanticRecoveryError(
    createSemanticRecoveryRoute({
      ...recoveryRoute,
      class: 'terminal_failure',
      terminal_status: 'needs_manual_review'
    }),
    'stage_failed / needs_manual_review: master_narrative upstream repair exhausted'
  );
}

function enforceAgentPromptGuard(agentType, messages, telemetry = null) {
  if (!shouldEnforcePromptGuard()) return { ok: true, errors: [] };
  const guard = validateAgentPrompt(agentType, messages);
  telemetry?.onPromptGuard?.(guard);
  if (!guard.ok) {
    throw new Error(`Prompt guard blocked ${agentType}: ${guard.errors.join('; ')}`);
  }
  return guard;
}

export async function generateVisibleContextPackage(world, masterNarrative, env = process.env, hooks = {}) {
  const config = getProviderConfig(env);
  hooks = createSafeHooks(hooks);
  assertLegacyProviderAllowed('generateVisibleContextPackage', env, hooks, world);
  const input = buildVisibleContextInput(world, masterNarrative);
  const initialRecoveryRoute = validateMasterNarrativeAgainstVisibleInputs(input);
  const allowDeterministic = allowsDeterministicFallback(world);
  const deterministicResult = () => ({
    provider: 'deterministic',
    data: stripHiddenForNarrator(buildDeterministicVisiblePackage(world, masterNarrative, env)),
    usedFallback: true
  });

  if (!config.enabled) {
    if (!allowDeterministic) {
      throw new Error('LLM provider is required for visible_context_package in production mode.');
    }
    return deterministicResult();
  }

  if (initialRecoveryRoute) {
    hooks.onStage?.({
      phase: 'consistency_gate',
      label: 'NarrativeVisibleConsistencyGate',
      message: 'master_narrative конфликтует с approved visible inputs.',
      attempt: 1,
      maxAttempts: 1,
      ...toRecoveryTelemetry(initialRecoveryRoute, 0, MODEL_TIER_PRO)
    });
    throw createSemanticRecoveryError(initialRecoveryRoute, 'master_narrative conflicts with approved visible inputs');
  }

  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  let dossierAttempt = 0;
  let lastFailureReason = '';
  let frozenDossierText = '';
  let frozenAudit = null;

  try {
    while (dossierAttempt < MAX_VISIBLE_CONTEXT_ATTEMPTS && !frozenDossierText) {
      dossierAttempt += 1;
      let dossierText = '';
      let auditText = '';
      const dossierMessages = buildVisibleContextDossierMessages(input);
      const requestPreview = summarizeMessages(dossierMessages);

      try {
        hooks.onStage?.({
          phase: 'visible_context_dossier',
          label: 'Visible context',
          message: `Собираю безопасный visible_context_package, попытка ${dossierAttempt}.`,
          requestPreview,
          attempt: dossierAttempt,
          maxAttempts: MAX_VISIBLE_CONTEXT_ATTEMPTS
        });
        const dossierResponse = await client.complete(LegacyWorldRoles.VISIBLE_CONTEXT_DOSSIER, {
          model: config.model,
          messages: dossierMessages,
          temperature: 0.25,
          max_tokens: 900,
          agentType: 'visibility'
        });
        dossierText = dossierResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        if (!dossierText) throw new Error('Empty visible context dossier response');

        const auditMessages = buildVisibleContextAuditMessages(input, dossierText);
        hooks.onStage?.({
          phase: 'semantic_audit',
          label: 'Visible context audit',
          message: 'Проверяю visible_context_package dossier на безопасность.',
          requestPreview: summarizeMessages(auditMessages),
          attempt: dossierAttempt,
          maxAttempts: MAX_VISIBLE_CONTEXT_ATTEMPTS
        });
        const auditResponse = await client.complete(LegacyWorldRoles.VISIBLE_CONTEXT_AUDIT, {
          model: config.model,
          messages: auditMessages,
          temperature: 0.15,
          max_tokens: 500,
          agentType: 'visibility'
        });
        auditText = auditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        let auditEvaluation = evaluateRawSemanticAudit(auditText);
        if (!auditEvaluation.ok) {
          lastFailureReason = describeValidationErrors(auditEvaluation.validation).join('; ')
            || summarizeInvalidNarratorAudit(auditText);
          hooks.onStage?.({
            phase: 'semantic_repair',
            label: 'Semantic audit repair',
            message: `Visible context audit невалиден: ${lastFailureReason}.`,
            requestPreview,
            responsePreview: clipText(auditText, 1200),
            responseSections: buildValidationErrorSections('Semantic audit validation', auditEvaluation.validation),
            attempt: dossierAttempt,
            maxAttempts: MAX_VISIBLE_CONTEXT_ATTEMPTS,
            schema: 'semantic_audit',
            repair: { kind: 'audit_repair' }
          });
          auditEvaluation = await repairNarratorSemanticAudit(client, {
            kind: 'visible_context_package',
            roleId: LegacyWorldRoles.VISIBLE_CONTEXT_REPAIR,
            dossier: dossierText,
            previousAudit: auditEvaluation.parsed,
            auditText,
            validationErrors: describeValidationErrors(auditEvaluation.validation)
          }, hooks, telemetry);
        }

        let audit = auditEvaluation.audit;
        if (!audit) {
          lastFailureReason = describeValidationErrors(auditEvaluation.validation).join('; ')
            || summarizeInvalidNarratorAudit(auditText);
          if (dossierAttempt >= MAX_VISIBLE_CONTEXT_ATTEMPTS) {
            throw new Error(`visible_context_package semantic audit failed: ${lastFailureReason}`);
          }
          await sleep(nextRetryDelay(dossierAttempt));
          continue;
        }

        if (audit.pass !== true) {
          lastFailureReason = audit.concerns?.[0] ?? 'visible context audit rejected dossier';
          hooks.onStage?.({
            phase: 'semantic_repair',
            label: 'Visible context dossier repair',
            message: 'Прошу исправить visible context dossier по concerns аудита.',
            requestPreview: summarizeMessages(buildVisibleContextDossierRepairMessages(input, dossierText, audit)),
            requestSections: [
              section('Dossier', splitTextLines(dossierText)),
              section('Audit concerns', audit.concerns?.slice(0, 4) ?? []),
              section('Audit evidence', audit.evidence?.slice(0, 4) ?? [])
            ],
            attempt: dossierAttempt,
            maxAttempts: MAX_VISIBLE_CONTEXT_ATTEMPTS
          });
          const repairResponse = await client.complete(LegacyWorldRoles.VISIBLE_CONTEXT_DOSSIER_REPAIR, {
            model: config.model,
            messages: buildVisibleContextDossierRepairMessages(input, dossierText, audit),
            temperature: 0.25,
            max_tokens: 900,
            agentType: 'repair'
          });
          const repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
          if (!repairText) {
            if (dossierAttempt >= MAX_VISIBLE_CONTEXT_ATTEMPTS) {
              throw new Error(`visible_context_package semantic audit failed: ${lastFailureReason}`);
            }
            await sleep(nextRetryDelay(dossierAttempt));
            continue;
          }

          hooks.onStage?.({
            phase: 'semantic_audit',
            label: 'Visible context re-audit',
            message: 'Повторно проверяю исправленный visible context dossier.',
            requestPreview: summarizeMessages(buildVisibleContextAuditMessages(input, repairText)),
            attempt: dossierAttempt,
            maxAttempts: MAX_VISIBLE_CONTEXT_ATTEMPTS
          });
          const repairAuditResponse = await client.complete(LegacyWorldRoles.VISIBLE_CONTEXT_AUDIT, {
            model: config.model,
            messages: buildVisibleContextAuditMessages(input, repairText),
            temperature: 0.15,
            max_tokens: 500,
            agentType: 'visibility'
          });
          const repairAuditText = repairAuditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
          let repairAuditEvaluation = evaluateRawSemanticAudit(repairAuditText);
          if (!repairAuditEvaluation.ok) {
            repairAuditEvaluation = await repairNarratorSemanticAudit(client, {
              kind: 'visible_context_package',
              roleId: LegacyWorldRoles.VISIBLE_CONTEXT_REPAIR,
              dossier: repairText,
              previousAudit: repairAuditEvaluation.parsed,
              auditText: repairAuditText,
              validationErrors: describeValidationErrors(repairAuditEvaluation.validation)
            }, hooks, telemetry);
          }
          audit = repairAuditEvaluation.audit;
          if (!audit || audit.pass !== true) {
            lastFailureReason = audit?.concerns?.[0] ?? summarizeInvalidNarratorAudit(repairAuditText);
            if (dossierAttempt >= MAX_VISIBLE_CONTEXT_ATTEMPTS) {
              throw new Error(`visible_context_package semantic audit failed: ${lastFailureReason}`);
            }
            await sleep(nextRetryDelay(dossierAttempt));
            continue;
          }
          dossierText = repairText;
        }

        frozenDossierText = dossierText;
        frozenAudit = audit;
      } catch (error) {
        lastFailureReason = normalizeError(error, 'Visible context dossier generation failed.').message;
        if (dossierAttempt >= MAX_VISIBLE_CONTEXT_ATTEMPTS) {
          throw new Error(`visible_context_package semantic audit failed: ${lastFailureReason}`);
        }
        await sleep(nextRetryDelay(dossierAttempt));
      }
    }

    if (!frozenDossierText || !frozenAudit) {
      throw new Error(`visible_context_package semantic audit failed: ${lastFailureReason || 'retry loop exhausted without approved dossier'}`);
    }

    const dossierText = frozenDossierText;
    const audit = frozenAudit;

    hooks.onStage?.({
      phase: 'visible_context_shape',
      label: 'VisibleContextShaper',
      message: 'Упаковываю утверждённый visible_context_package.',
      requestPreview: summarizeMessages(buildVisibleContextShapeMessages(input, dossierText, audit))
    });
    const shapeResponse = await client.complete(LegacyWorldRoles.VISIBLE_CONTEXT_SHAPER, {
      model: config.model,
      messages: buildVisibleContextShapeMessages(input, dossierText, audit),
      temperature: 0.2,
      max_tokens: 900,
      agentType: 'visibility'
    });
    let rawText = shapeResponse?.choices?.[0]?.message?.content?.trim() ?? '';
    let parsed = parseJsonObject(rawText);
    let accumulatedValidationErrors = [];
    let evaluation = parsed ? evaluateVisibleContextCandidate(parsed) : { ok: false, validation: { ok: false, errors: ['visible_context_package response is invalid JSON'] } };
    const shapeRoute = parsed ? classifyVisibleContextRecoveryRoute(input, parsed, masterNarrative) : null;
    if (shapeRoute) {
      hooks.onStage?.({
        phase: 'shape_validation',
        label: 'Visible context recovery route',
        message: 'Локальный repair visible_context_package запрещён: нужен upstream route.',
        attempt: 1,
        maxAttempts: 1,
        ...toRecoveryTelemetry(shapeRoute, 0, MODEL_TIER_PRO)
      });
      throw createSemanticRecoveryError(shapeRoute, 'visible_context_package requires upstream repair');
    }

    if (!evaluation.ok && parsed) {
      accumulatedValidationErrors = mergeVisibleContextValidationErrors(
        accumulatedValidationErrors,
        describeValidationErrors(evaluation.validation)
      );
      const repairMessages = buildVisibleContextContractRepairMessages(input, dossierText, audit, accumulatedValidationErrors, parsed);
      hooks.onStage?.({
        phase: 'semantic_repair',
        label: 'Visible context repair',
        message: 'Исправляю visible_context_package по validationErrors.',
        requestPreview: summarizeMessages(repairMessages)
      });
      const repairResponse = await client.complete(LegacyWorldRoles.VISIBLE_CONTEXT_REPAIR, {
        model: config.model,
        messages: repairMessages,
        temperature: 0.15,
        max_tokens: 900,
        agentType: 'visibility'
      });
      rawText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? rawText;
      parsed = parseJsonObject(rawText);
      const repairRoute = parsed ? classifyVisibleContextRecoveryRoute(input, parsed, masterNarrative) : null;
      if (repairRoute) {
        hooks.onStage?.({
          phase: 'shape_validation',
          label: 'Visible context recovery route',
          message: 'Repair visible_context_package попытался добавить неутверждённый visible_npc/source_ref.',
          attempt: 1,
          maxAttempts: 1,
          ...toRecoveryTelemetry(repairRoute, 0, MODEL_TIER_PRO)
        });
        throw createSemanticRecoveryError(repairRoute, 'visible_context_package local repair is forbidden for this conflict');
      }
      evaluation = parsed ? evaluateVisibleContextCandidate(parsed) : evaluation;
    }

    const validation = evaluation.ok
      ? { ok: true, errors: [] }
      : { ok: false, errors: describeValidationErrors(evaluation.validation) };
    if (validation.ok) {
      return { provider: config.provider, data: stripHiddenForNarrator(parsed), usedFallback: false };
    }
    throw new Error(`visible_context_package invalid: ${validation.errors.join('; ')}`);
  } catch (error) {
    if (allowDeterministic) {
      return deterministicResult();
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export async function generateMemoryJournalUpdate(context = {}, env = process.env, hooks = {}) {
  const config = getProviderConfig(env);
  hooks = createSafeHooks(hooks);
  const world = context.world ?? null;
  const allowDeterministic = allowsDeterministicFallback(world);
  const deterministicResult = () => {
    const fallback = buildDeterministicMemoryJournalUpdate(context);
    const validation = validateMemoryJournalUpdate(fallback);
    if (!validation.ok) {
      throw new Error(`Memory journal fallback invalid: ${validation.errors.join('; ')}`);
    }
    return { provider: 'deterministic', data: fallback, usedFallback: true };
  };

  if (!config.enabled) {
    if (!allowDeterministic) {
      throw new Error('LLM provider is required for memory_journal_update in production mode.');
    }
    return deterministicResult();
  }

  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  const messages = buildMemoryJournalMessages(context);
  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRY_ATTEMPTS) {
    attempt += 1;
    let rawText = '';
    try {
      hooks.onStage?.({
        phase: 'memory_journal',
        label: 'Memory journal',
        message: `Собираю memory_journal_update, попытка ${attempt}.`,
        requestPreview: summarizeMessages(messages),
        attempt,
        maxAttempts: MAX_RETRY_ATTEMPTS
      });
      const response = await client.complete(LegacyWorldRoles.MEMORY_JOURNAL, {
        model: config.model,
        messages,
        temperature: 0.2,
        max_tokens: 700,
        agentType: 'memory'
      });
      rawText = response?.choices?.[0]?.message?.content?.trim() ?? '';
      const parsed = parseJsonObject(rawText);
      const validation = validateMemoryJournalUpdate(parsed);
      if (validation.ok) {
        return { provider: config.provider, data: parsed, usedFallback: false };
      }
      lastError = new Error(`Memory journal invalid: ${validation.errors.join('; ')}`);
    } catch (error) {
      lastError = normalizeError(error, 'Memory journal generation failed.');
    }
    hooks.onStage?.({
      phase: 'llm_retry',
      label: 'Memory journal',
      message: `${lastError?.message ?? 'Memory journal failed'}. Повтор через ${nextRetryDelay(attempt)} мс.`,
      responsePreview: clipText(rawText, 1200),
      attempt
    });
    await sleep(nextRetryDelay(attempt));
  }

  if (allowDeterministic) {
    return deterministicResult();
  }
  throw lastError ?? new Error('Memory journal retry loop exhausted.');
}

function normalizeVisiblePackageForProse(frame, arg, env = process.env) {
  if (arg?.schema === 'visible_context_package') {
    return stripHiddenForNarrator(arg);
  }
  const world = frame?.world && typeof frame.world === 'object'
    ? {
      ...frame.world,
      clock: frame.world?.time ?? frame.clock ?? null,
      player: frame.world?.player,
      npcs: frame.world?.npcs,
      place: frame.world?.location ?? frame.world?.place,
      microPlace: frame.world?.microPlace,
      scene: frame.world?.scene,
      memory: frame.world?.memory,
      delayedEvents: frame.world?.delayedEvents
    }
    : frame;
  return stripHiddenForNarrator(buildDeterministicVisiblePackage(world, arg ?? {}, env));
}

function evaluateRawSemanticAudit(auditText) {
  const parsed = parseJsonObject(auditText);
  if (!parsed) {
    return {
      ok: false,
      audit: null,
      parsed: null,
      validation: { ok: false, errors: ['semantic audit response is invalid JSON'] }
    };
  }
  const evaluation = evaluateSemanticAuditCandidate(parsed);
  return {
    ok: evaluation.ok,
    audit: evaluation.ok ? validateSemanticAudit(parsed) : null,
    parsed,
    validation: evaluation.validation
  };
}

function explainNarratorProseValidation(proseText, frame) {
  const errors = [];
  const text = String(proseText ?? '').trim();
  if (!text) errors.push('prose: expected non-empty string');
  if (/^[\[{]/.test(text)) errors.push('prose: must not be JSON');
  const clockConflict = findNarratorClockConflict(text, frame);
  if (clockConflict) errors.push(clockConflict.message);
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

async function repairNarratorSemanticAudit(client, context, hooks, telemetry) {
  const repairMessages = buildSemanticAuditRepairMessages(context);
  hooks.onStage?.({
    phase: 'semantic_repair',
    label: 'Semantic audit repair',
    message: 'Исправляю narrator semantic_audit по validationErrors.',
    requestPreview: summarizeMessages(repairMessages),
    schema: 'semantic_audit',
    repair: { kind: 'audit_repair' }
  });
  const repairResponse = await client.complete(context.roleId ?? LegacyWorldRoles.NARRATOR_REPAIR, {
    model: telemetry.model,
    messages: repairMessages,
    temperature: 0.15,
    max_tokens: 700,
    agentType: 'repair'
  });
  const repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
  return evaluateRawSemanticAudit(repairText);
}

export async function generateNarratorProse(frame, visiblePackageOrNarrative, env = process.env, hooks = {}) {
  hooks = createSafeHooks(hooks);
  assertLegacyProviderAllowed('generateNarratorProse', env, hooks, frame);
  const config = getProviderConfig(env);
  if (!config.enabled) {
    throw new Error('DeepSeek API key is required to generate narrator prose.');
  }
  hooks = createSafeHooks(hooks);

  if (isProductionSemanticMode(env) && visiblePackageOrNarrative?.schema !== 'visible_context_package') {
    throw new Error('Narrator prose requires approved visible_context_package in production.');
  }

  const visiblePackage = visiblePackageOrNarrative?.schema === 'visible_context_package'
    ? stripHiddenForNarrator(visiblePackageOrNarrative)
    : normalizeVisiblePackageForProse(frame, visiblePackageOrNarrative, env);
  const packageValidation = validateVisibleContextPackage(visiblePackage);
  if (!packageValidation.ok) {
    throw new Error(`Visible package invalid for narrator: ${packageValidation.errors.join('; ')}`);
  }

  const clock = frame.world?.time ?? frame.time ?? frame.clock ?? null;
  const clockMoment = describeNarratorClockMoment(clock);
  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  const requestSections = buildNarratorRequestSections(frame, visiblePackage);
  let dossierAttempt = 0;
  let lastFailureReason = '';
  let frozenDossierText = '';
  let frozenAudit = null;

  while (dossierAttempt < MAX_NARRATOR_RESPONSE_ATTEMPTS && !frozenDossierText) {
    dossierAttempt += 1;
    let dossierText = '';
    let auditText = '';
    const dossierMessages = buildNarratorDossierMessages(visiblePackage, clock, clockMoment);
    const requestPreview = summarizeMessages(dossierMessages);
    try {
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Narrator dossier',
        message: `Собираю смысловой слой UI-прозы, попытка ${dossierAttempt}.`,
        requestPreview,
        requestSections,
        attempt: dossierAttempt,
        maxAttempts: MAX_NARRATOR_RESPONSE_ATTEMPTS
      });
      const dossierResponse = await client.complete(LegacyWorldRoles.NARRATOR_DOSSIER, {
        model: config.model,
        messages: dossierMessages,
        temperature: 0.35,
        max_tokens: 900,
        agentType: 'prose'
      });
      dossierText = dossierResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!dossierText) throw new Error('Empty narrator dossier response');

      hooks.onStage?.({
        phase: 'semantic_audit',
        label: 'Narrator audit',
        message: 'Проверяю narrator dossier на соответствие visible_context_package.',
        requestPreview: summarizeMessages(buildNarratorAuditMessages(visiblePackage, dossierText, clock, clockMoment)),
        requestSections,
        attempt: dossierAttempt
      });
      const auditResponse = await client.complete(LegacyWorldRoles.NARRATOR_AUDIT, {
        model: config.model,
        messages: buildNarratorAuditMessages(visiblePackage, dossierText, clock, clockMoment),
        temperature: 0.15,
        max_tokens: 700,
        agentType: 'prose'
      });
      auditText = auditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      let auditEvaluation = evaluateRawSemanticAudit(auditText);
      if (!auditEvaluation.ok) {
        lastFailureReason = describeValidationErrors(auditEvaluation.validation).join('; ')
          || summarizeInvalidNarratorAudit(auditText);
        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Semantic audit repair',
          message: `Narrator audit невалиден: ${lastFailureReason}.`,
          requestPreview,
          responsePreview: clipText(auditText, 1200),
          requestSections,
          responseSections: buildValidationErrorSections('Semantic audit validation', auditEvaluation.validation),
          attempt: dossierAttempt,
          schema: 'narrator_audit'
        });
        auditEvaluation = await repairNarratorSemanticAudit(client, {
          kind: 'narrator_audit',
          roleId: LegacyWorldRoles.NARRATOR_REPAIR,
          visiblePackage,
          dossier: dossierText,
          previousAudit: auditEvaluation.parsed,
          auditText,
          validationErrors: describeValidationErrors(auditEvaluation.validation)
        }, hooks, telemetry);
      }

      let audit = auditEvaluation.audit;
      if (!audit) {
        lastFailureReason = describeValidationErrors(auditEvaluation.validation).join('; ')
          || summarizeInvalidNarratorAudit(auditText);
        if (dossierAttempt >= MAX_NARRATOR_RESPONSE_ATTEMPTS) {
          throw new Error(`Unable to generate narrator prose: ${lastFailureReason}`);
        }
        await sleep(nextRetryDelay(dossierAttempt));
        continue;
      }

      if (audit.pass !== true) {
        lastFailureReason = audit.concerns?.[0] ?? 'narrator audit rejected dossier';
        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Narrator dossier repair',
          message: 'Прошу исправить narrator dossier по concerns аудита.',
          requestPreview: summarizeMessages(buildNarratorDossierRepairMessages(visiblePackage, dossierText, audit, clock, clockMoment)),
          requestSections: [
            section('Dossier', splitTextLines(dossierText)),
            section('Audit concerns', audit.concerns?.slice(0, 4) ?? []),
            section('Audit evidence', audit.evidence?.slice(0, 4) ?? [])
          ],
          attempt: dossierAttempt
        });
        const repairResponse = await client.complete(LegacyWorldRoles.NARRATOR_DOSSIER_REPAIR, {
          model: config.model,
          messages: buildNarratorDossierRepairMessages(visiblePackage, dossierText, audit, clock, clockMoment),
          temperature: 0.25,
          max_tokens: 900,
          agentType: 'repair'
        });
        const repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        if (!repairText) {
          if (dossierAttempt >= MAX_NARRATOR_RESPONSE_ATTEMPTS) {
            throw new Error(`Unable to generate narrator prose: ${lastFailureReason}`);
          }
          await sleep(nextRetryDelay(dossierAttempt));
          continue;
        }

        hooks.onStage?.({
          phase: 'semantic_audit',
          label: 'Narrator re-audit',
          message: 'Повторно проверяю исправленный narrator dossier.',
          requestPreview: summarizeMessages(buildNarratorAuditMessages(visiblePackage, repairText, clock, clockMoment)),
          attempt: dossierAttempt
        });
        const repairAuditResponse = await client.complete(LegacyWorldRoles.NARRATOR_AUDIT, {
          model: config.model,
          messages: buildNarratorAuditMessages(visiblePackage, repairText, clock, clockMoment),
          temperature: 0.15,
          max_tokens: 700,
          agentType: 'prose'
        });
        const repairAuditText = repairAuditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        let repairAuditEvaluation = evaluateRawSemanticAudit(repairAuditText);
        if (!repairAuditEvaluation.ok) {
          repairAuditEvaluation = await repairNarratorSemanticAudit(client, {
            kind: 'narrator_audit',
            roleId: LegacyWorldRoles.NARRATOR_REPAIR,
            visiblePackage,
            dossier: repairText,
            previousAudit: repairAuditEvaluation.parsed,
            auditText: repairAuditText,
            validationErrors: describeValidationErrors(repairAuditEvaluation.validation)
          }, hooks, telemetry);
        }
        audit = repairAuditEvaluation.audit;
        if (!audit || audit.pass !== true) {
          lastFailureReason = audit?.concerns?.[0] ?? summarizeInvalidNarratorAudit(repairAuditText);
          if (dossierAttempt >= MAX_NARRATOR_RESPONSE_ATTEMPTS) {
            throw new Error(`Unable to generate narrator prose: ${lastFailureReason}`);
          }
          await sleep(nextRetryDelay(dossierAttempt));
          continue;
        }
        dossierText = repairText;
      }

      frozenDossierText = dossierText;
      frozenAudit = audit;
    } catch (error) {
      lastFailureReason = normalizeError(error, 'Narrator prose generation failed.').message;
      if (dossierAttempt >= MAX_NARRATOR_RESPONSE_ATTEMPTS) {
        throw new Error(`Unable to generate narrator prose: ${lastFailureReason}`);
      }
      await sleep(nextRetryDelay(dossierAttempt));
    }
  }

  if (!frozenDossierText || !frozenAudit) {
    throw new Error(`Unable to generate narrator prose: ${lastFailureReason || 'retry loop exhausted without approved dossier'}`);
  }

  hooks.onStage?.({
    phase: 'semantic_freeze',
    label: 'Narrator freeze',
    message: 'Narrator dossier утверждён и заморожен.',
    responsePreview: clipText(frozenDossierText, 1000)
  });

  const shapeMessages = buildNarratorShapeMessages(visiblePackage, frozenDossierText, frozenAudit, clock, clockMoment);
  enforceAgentPromptGuard('prose', shapeMessages, telemetry);
  hooks.onStage?.({
    phase: 'semantic_shape',
    label: 'Narrator prose',
    message: 'Формирую UI-прозу из visible_context_package.',
    requestPreview: summarizeMessages(shapeMessages),
    requestSections,
    schema: 'narrator_prose'
  });
  const proseResponse = await client.complete(LegacyWorldRoles.NARRATOR_SHAPER, {
    model: config.model,
    messages: shapeMessages,
    temperature: 0.5,
    max_tokens: 900,
    agentType: 'prose'
  });
  let proseText = proseResponse?.choices?.[0]?.message?.content?.trim() ?? '';
  let proseValidation = explainNarratorProseValidation(proseText, frame);
  let proseRepairAttempt = 0;
  let accumulatedProseErrors = [];

  while (!proseValidation.ok && proseRepairAttempt < MAX_NARRATOR_RESPONSE_ATTEMPTS) {
    accumulatedProseErrors = [...new Set([
      ...accumulatedProseErrors,
      ...describeValidationErrors(proseValidation)
    ])];
    const repairMessages = buildNarratorProseRepairMessages(
      visiblePackage,
      frozenDossierText,
      frozenAudit,
      proseText,
      accumulatedProseErrors,
      clock,
      clockMoment
    );
    hooks.onStage?.({
      phase: 'semantic_repair',
      label: 'Narrator prose repair',
      message: `Исправляю narrator prose: ${accumulatedProseErrors.join('; ')}`,
      requestPreview: summarizeMessages(repairMessages),
      requestSections,
      responseSections: buildValidationErrorSections('Narrator prose validation', proseValidation),
      schema: 'narrator_prose',
      repair: { kind: 'prose_repair', errorCount: accumulatedProseErrors.length }
    });
    const proseRepairResponse = await client.complete(LegacyWorldRoles.NARRATOR_REPAIR, {
      model: config.model,
      messages: repairMessages,
      temperature: 0.3,
      max_tokens: 900,
      agentType: 'repair'
    });
    proseText = proseRepairResponse?.choices?.[0]?.message?.content?.trim() ?? proseText;
    proseValidation = explainNarratorProseValidation(proseText, frame);
    proseRepairAttempt += 1;
  }

  if (!proseValidation.ok) {
    throw new Error(`Unable to generate narrator prose: ${accumulatedProseErrors.join('; ') || 'prose validation failed'}`);
  }

  return {
    provider: config.provider,
    usedFallback: false,
    prose: proseText,
    approvedDossier: frozenDossierText
  };
}

export async function generateActorProfiles(world, env = process.env, hooks = {}) {
  hooks = createSafeHooks(hooks);
  assertLegacyProviderAllowed('generateActorProfiles', env, hooks, world);
  const config = getProviderConfig(env);
  if (!config.enabled) {
    throw new Error('DeepSeek API key is required to generate actor profiles.');
  }
  hooks = createSafeHooks(hooks);

  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  const actorContext = buildActorPromptContext(world);
  const dossierRequestSections = buildActorRequestSections(world);
  const auditRequestSections = buildActorAuditRequestSections(world);
  const shapeRequestSections = buildActorShapeRequestSections(world);
  let attempt = 0;
  let previousAudit = null;
  let lastFailureReason = '';
  let semanticRepairAttemptIndex = 0;

  while (attempt < MAX_ACTOR_PROFILE_ATTEMPTS) {
    attempt += 1;
    let dossierText = '';
    let auditText = '';
    let repairText = '';
    let repairAuditText = '';
    let rawText = '';
    const dossierMessages = buildActorDossierMessages(actorContext, previousAudit);
    const dossierRequestPreview = summarizeMessages(dossierMessages);

    try {
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Semantic dossier',
        message: `Собираю локальный смысловой слой акторов для текущей сцены, попытка ${attempt}.`,
        requestPreview: dossierRequestPreview,
        requestSections: dossierRequestSections,
        attempt,
        maxAttempts: MAX_ACTOR_PROFILE_ATTEMPTS,
        ...buildStageTelemetry('actor_profiles', 'semantic_dossier', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO)
      });
      const dossierResponse = await client.complete(LegacyWorldRoles.ACTOR_PROFILES_DOSSIER, {
        model: config.model,
        messages: dossierMessages,
        temperature: 0.25,
        max_tokens: 1200
      });
      dossierText = dossierResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!dossierText) {
        throw new Error('Empty semantic dossier response');
      }
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Semantic dossier',
        message: 'Локальный слой акторов собран и готов к проверке.',
        responsePreview: clipText(dossierText, 1400),
        responseSections: buildSemanticTextSections('Dossier', dossierText)
      });

      hooks.onStage?.({
        phase: 'semantic_audit',
        label: 'Semantic audit',
        message: 'Проверяю только реальные проблемы: противоречия, всеведение, невозможное присутствие и разрыв между видимым и скрытым.',
        requestPreview: summarizeMessages(buildActorAuditMessages(actorContext, dossierText)),
        requestSections: auditRequestSections,
        attempt,
        ...buildStageTelemetry('actor_profiles', 'semantic_audit', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO)
      });
      const auditResponse = await client.complete(LegacyWorldRoles.ACTOR_PROFILES_AUDIT, {
        model: config.model,
        messages: buildActorAuditMessages(actorContext, dossierText),
        temperature: 0.1,
        max_tokens: 700
      });

      auditText = auditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      let audit = parseSemanticAuditResponse(auditText);
      if (!audit) {
        lastFailureReason = summarizeInvalidSemanticAudit(auditText);
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор профилей',
          message: `Actor audit вернул невалидный ответ: ${lastFailureReason}.`,
          requestPreview: dossierRequestPreview,
          responsePreview: clipText(auditText || dossierText, 1400),
          requestSections: dossierRequestSections,
          responseSections: buildValidationErrorSections('Semantic audit validation', explainSemanticAuditValidation(parseJsonObject(auditText))),
          attempt,
          ...buildStageTelemetry('actor_profiles', 'semantic_audit', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO, 'failed')
        });
        if (attempt >= MAX_ACTOR_PROFILE_ATTEMPTS) {
          throwGenerationFailure('actor profiles', lastFailureReason);
        }
        await sleep(nextRetryDelay(attempt));
        continue;
      }

      if (audit.pass !== true) {
        semanticRepairAttemptIndex += 1;
        const repairModelTier = getSemanticRepairModelTier(semanticRepairAttemptIndex);
        lastFailureReason = summarizeActorAuditFailure(audit);
        previousAudit = audit;
        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Исправление профилей',
          message: semanticRepairAttemptIndex >= 2
            ? 'Повторный semantic repair эскалирован до senior reasoning; это последняя попытка исправить actor dossier.'
            : 'Прошу точечно исправить dossier по конкретным замечаниям аудита.',
          requestPreview: summarizeMessages(buildActorRepairMessages(actorContext, dossierText, audit)),
          requestSections: [
            section('Dossier', splitTextLines(dossierText)),
            section('Audit concerns', audit.concerns?.slice(0, 4) ?? []),
            section('Audit evidence', audit.evidence?.slice(0, 4) ?? [])
          ],
          attempt,
          ...buildStageTelemetry('actor_profiles', 'semantic_repair', attempt, semanticRepairAttemptIndex, repairModelTier)
        });
        const repairResponse = await client.complete(LegacyWorldRoles.ACTOR_PROFILES_REPAIR, {
          model: config.model,
          messages: buildActorRepairMessages(actorContext, dossierText, audit),
          temperature: 0.15,
          max_tokens: 700
        });
        repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        if (!repairText) {
          hooks.onStage?.({
            phase: 'llm_retry',
            label: 'Повтор профилей',
            message: `Исправление профилей не вернуло текст: ${lastFailureReason}.`,
            requestPreview: dossierRequestPreview,
            responsePreview: clipText(auditText || dossierText, 1400),
            requestSections: dossierRequestSections,
            responseSections: buildActorAuditResponseSections(audit),
            attempt,
            ...buildStageTelemetry('actor_profiles', 'semantic_repair', attempt, semanticRepairAttemptIndex, repairModelTier, 'failed')
          });
          if (semanticRepairAttemptIndex >= 2) {
            throwGenerationFailure('actor profiles', `stage_failed / needs_manual_review: ${lastFailureReason}`);
          }
          if (attempt >= MAX_ACTOR_PROFILE_ATTEMPTS) {
            throwGenerationFailure('actor profiles', lastFailureReason);
          }
          await sleep(nextRetryDelay(attempt));
          continue;
        }

        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Исправление профилей',
          message: 'Получен исправленный dossier профилей, запускаю повторный аудит.',
          responsePreview: clipText(repairText, 1400),
          responseSections: buildSemanticTextSections('Repaired dossier', repairText),
          attempt,
          ...buildStageTelemetry('actor_profiles', 'semantic_repair', attempt, semanticRepairAttemptIndex, repairModelTier)
        });

        hooks.onStage?.({
          phase: 'semantic_audit',
          label: 'Actor re-audit',
          message: 'Повторно проверяю исправленные профили.',
          requestPreview: summarizeMessages(buildActorAuditMessages(actorContext, repairText)),
          requestSections: auditRequestSections,
          attempt,
          ...buildStageTelemetry('actor_profiles', 'semantic_audit', attempt, semanticRepairAttemptIndex, repairModelTier)
        });
        const repairAuditResponse = await client.complete(LegacyWorldRoles.ACTOR_PROFILES_AUDIT, {
          model: config.model,
          messages: buildActorAuditMessages(actorContext, repairText),
          temperature: 0.1,
          max_tokens: 700
        });
        repairAuditText = repairAuditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        const repairAudit = parseSemanticAuditResponse(repairAuditText);
        if (!repairAudit) {
          lastFailureReason = summarizeInvalidSemanticAudit(repairAuditText);
          hooks.onStage?.({
            phase: 'llm_retry',
            label: 'Повтор профилей',
            message: `Повторный Actor audit вернул невалидный ответ: ${lastFailureReason}.`,
            requestPreview: dossierRequestPreview,
            responsePreview: clipText(repairAuditText || repairText, 1400),
            requestSections: dossierRequestSections,
            responseSections: buildValidationErrorSections('Semantic audit validation', explainSemanticAuditValidation(parseJsonObject(repairAuditText))),
            attempt,
            ...buildStageTelemetry('actor_profiles', 'semantic_audit', attempt, semanticRepairAttemptIndex, repairModelTier, 'failed')
          });
          if (semanticRepairAttemptIndex >= 2) {
            throwGenerationFailure('actor profiles', `stage_failed / needs_manual_review: ${lastFailureReason}`);
          }
          if (attempt >= MAX_ACTOR_PROFILE_ATTEMPTS) {
            throwGenerationFailure('actor profiles', lastFailureReason);
          }
          await sleep(nextRetryDelay(attempt));
          continue;
        }
        if (repairAudit.pass !== true) {
          lastFailureReason = summarizeActorAuditFailure(repairAudit);
          previousAudit = repairAudit;
          hooks.onStage?.({
            phase: 'llm_retry',
            label: 'Повтор профилей',
            message: `Исправленный Actor audit не прошёл: ${lastFailureReason}.`,
            requestPreview: dossierRequestPreview,
            responsePreview: clipText(repairAuditText || repairText, 1400),
            requestSections: dossierRequestSections,
            responseSections: buildActorAuditResponseSections(repairAudit),
            attempt,
            ...buildStageTelemetry('actor_profiles', 'semantic_audit', attempt, semanticRepairAttemptIndex, repairModelTier, 'failed')
          });
          if (semanticRepairAttemptIndex >= 2) {
            throwGenerationFailure('actor profiles', `stage_failed / needs_manual_review: ${lastFailureReason}`);
          }
          if (attempt >= MAX_ACTOR_PROFILE_ATTEMPTS) {
            throwGenerationFailure('actor profiles', lastFailureReason);
          }
          await sleep(nextRetryDelay(attempt));
          continue;
        }

        dossierText = repairText;
        audit = repairAudit;
      }

      hooks.onStage?.({
        phase: 'semantic_freeze',
        label: 'Semantic Freeze',
        message: 'Смысл утверждён и заморожен до упаковки в JSON.',
        responsePreview: clipText(dossierText, 1000),
        responseSections: [
          section('Freeze', [
            'Смысл больше не меняется.',
            'Теперь возможна только упаковка утверждённых фактов в JSON.'
          ])
        ],
        ...buildStageTelemetry('actor_profiles', 'semantic_freeze', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO, 'passed')
      });

      let accumulatedValidationErrors = [];
      let retryInstruction = '';
      let previousActorProfiles = null;

      hooks.onStage?.({
        phase: 'semantic_shape',
        label: 'ActorProfileShaper',
        message: retryInstruction ? 'Повторяю actor_profiles по validationErrors.' : 'Перевожу утверждённый смысл в строгий JSON.',
        requestPreview: summarizeMessages(buildActorShapeMessages(actorContext, dossierText, audit, retryInstruction, previousActorProfiles, accumulatedValidationErrors)),
        requestSections: shapeRequestSections,
        attempt,
        ...buildStageTelemetry('actor_profiles', 'shaper', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO)
      });
      const response = await client.complete(LegacyWorldRoles.ACTOR_PROFILES_SHAPER, {
        model: config.model,
        messages: buildActorShapeMessages(actorContext, dossierText, audit, retryInstruction, previousActorProfiles, accumulatedValidationErrors),
        temperature: 0.1,
        max_tokens: 1800
      });

      rawText = response?.choices?.[0]?.message?.content?.trim() ?? '';
      const parsedObject = parseJsonObject(rawText);
      if (!parsedObject) {
        lastFailureReason = 'ActorProfileShaper output is invalid JSON: response was not parseable. Likely copied sourceDossier or trailed into prose.';
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор профилей',
          message: `${lastFailureReason} Return only the requested actor_profiles contract. Do not include scene, actors, audit, sourceDossier, repairNotes, contract, notes.`,
          requestPreview: dossierRequestPreview,
          responsePreview: clipText(rawText || repairAuditText || repairText || auditText || dossierText, 1400),
          requestSections: dossierRequestSections,
          responseSections: buildRetryResponseSections(rawText || repairAuditText || repairText || auditText || dossierText),
          attempt,
          ...buildStageTelemetry('actor_profiles', 'shape_validation', attempt, semanticRepairAttemptIndex, MODEL_TIER_FLASH, 'failed')
        });
        if (attempt >= MAX_ACTOR_PROFILE_ATTEMPTS) {
          throwGenerationFailure('actor profiles', lastFailureReason);
        }
        await sleep(nextRetryDelay(attempt));
        continue;
      }

      if (isBlockedByMissingApprovedFactOutcome(parsedObject)) {
        lastFailureReason = summarizeMissingApprovedFactOutcome(parsedObject);
        hooks.onStage?.({
          phase: 'shape_validation',
          label: 'Actor profiles blocked',
          message: `ActorProfileShaper остановлен: ${lastFailureReason}.`,
          responsePreview: clipText(rawText, 1400),
          responseSections: buildRetryResponseSections(rawText),
          attempt,
          ...buildStageTelemetry('actor_profiles', 'shape_validation', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO, 'blocked_by_missing_approved_fact')
        });
        throwGenerationFailure('actor profiles', lastFailureReason);
      }

      previousActorProfiles = parsedObject;
      let evaluation = evaluateActorProfilesCandidate(parsedObject);
      if (!evaluation.ok) {
        accumulatedValidationErrors = mergeActorProfilesValidationErrors(
          accumulatedValidationErrors,
          describeValidationErrors(evaluation.validation)
        );
        const repairMessages = buildActorProfilesContractRepairMessages(actorContext, dossierText, audit, accumulatedValidationErrors, parsedObject);
        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Actor profiles repair',
          message: 'Исправляю actor_profiles целиком по validationErrors.',
          requestPreview: summarizeMessages(repairMessages),
          attempt,
          repair: { kind: 'validation_repair', errorCount: accumulatedValidationErrors.length },
          ...buildStageTelemetry('actor_profiles', 'semantic_repair', attempt, semanticRepairAttemptIndex, MODEL_TIER_FLASH)
        });
        const repairResponse = await client.complete(LegacyWorldRoles.ACTOR_PROFILES_REPAIR, {
          model: config.model,
          messages: repairMessages,
          temperature: 0.15,
          max_tokens: 1800
        });
        const repairShapeText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        const repairObject = parseJsonObject(repairShapeText);
        if (isBlockedByMissingApprovedFactOutcome(repairObject)) {
          lastFailureReason = summarizeMissingApprovedFactOutcome(repairObject);
          hooks.onStage?.({
            phase: 'shape_validation',
            label: 'Actor profiles blocked',
            message: `Actor profile repair остановлен: ${lastFailureReason}.`,
            responsePreview: clipText(repairShapeText, 1400),
            responseSections: buildRetryResponseSections(repairShapeText),
            attempt,
            ...buildStageTelemetry('actor_profiles', 'shape_validation', attempt, semanticRepairAttemptIndex, MODEL_TIER_FLASH, 'blocked_by_missing_approved_fact')
          });
          throwGenerationFailure('actor profiles', lastFailureReason);
        }
        if (repairObject) {
          previousActorProfiles = repairObject;
          evaluation = evaluateActorProfilesCandidate(repairObject);
        }
      }

      if (evaluation.ok) {
        const parsed = validateActorProfiles(previousActorProfiles);
        const normalized = normalizeActorProfilesOutput(parsed, world);
        normalized.historical_audit = audit;
        hooks.onStage?.({
          phase: 'llm_response',
          label: 'Профили готовы',
          message: 'ActorProfileShaper вернул структурированные actor-профили.',
          responsePreview: clipText(rawText, 1400),
          responseSections: buildActorResponseSections(normalized),
          ...buildStageTelemetry('actor_profiles', 'shape_validation', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO, 'passed')
        });
        return {
          provider: config.provider,
          usedFallback: false,
          data: normalized
        };
      }

      lastFailureReason = mergeActorProfilesValidationErrors(
        accumulatedValidationErrors,
        describeValidationErrors(evaluation.validation)
      ).join('; ') || 'причина не указана';
      retryInstruction = [
        'Fix only listed validationErrors.',
        ...buildActorProfilesAntiRegressionRules().map((rule) => `- ${rule}`),
        `Accumulated errors: ${lastFailureReason}`
      ].join(' ');
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор профилей',
        message: `Профили не прошли проверку: ${lastFailureReason}.`,
        requestPreview: dossierRequestPreview,
        responsePreview: clipText(rawText || repairAuditText || repairText || auditText || dossierText, 1400),
        requestSections: dossierRequestSections,
        responseSections: buildValidationErrorSections('Actor validation', evaluation.validation),
        attempt,
        ...buildStageTelemetry('actor_profiles', 'shape_validation', attempt, semanticRepairAttemptIndex, MODEL_TIER_FLASH, 'failed')
      });
      if (attempt >= MAX_ACTOR_PROFILE_ATTEMPTS) {
        throwGenerationFailure('actor profiles', lastFailureReason);
      }
    } catch (error) {
      const normalizedError = normalizeError(error, lastFailureReason || 'Actor profile generation failed.');
      lastFailureReason = normalizedError.message;
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор профилей',
        message: `Генерация профилей не удалась: ${lastFailureReason}.`,
        requestPreview: dossierRequestPreview,
        responsePreview: clipText(rawText || repairAuditText || repairText || auditText || dossierText, 1400),
        requestSections: dossierRequestSections,
        responseSections: buildRetryResponseSections(rawText || repairAuditText || repairText || auditText || dossierText),
        attempt,
        ...buildStageTelemetry('actor_profiles', 'semantic_repair', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO, 'failed')
      });
      if (isTerminalStageFailureReason(lastFailureReason)) {
        throwGenerationFailure('actor profiles', lastFailureReason);
      }
      if (attempt >= MAX_ACTOR_PROFILE_ATTEMPTS) {
        throwGenerationFailure('actor profiles', lastFailureReason);
      }
    }

    await sleep(nextRetryDelay(attempt));
  }

  throwGenerationFailure('actor profiles', lastFailureReason || 'retry attempts exhausted without concrete actor profiles');
}

export async function generateLocationProfiles(world, env = process.env, hooks = {}) {
  hooks = createSafeHooks(hooks);
  assertLegacyProviderAllowed('generateLocationProfiles', env, hooks, world);
  const config = getProviderConfig(env);
  if (!config.enabled) {
    throw new Error('DeepSeek API key is required to generate location profiles.');
  }
  hooks = createSafeHooks(hooks);

  const telemetry = createProviderTelemetry(hooks, config);
  const client = createOpenAICompatibleClient(config.baseUrl, config.apiKey, telemetry);
  const context = buildLocationPromptContext(world);
  const dossierRequestSections = buildLocationRequestSections(context);
  const auditRequestSections = buildLocationAuditRequestSections(context);
  const shapeRequestSections = buildLocationShapeRequestSections(context);
  let attempt = 0;
  let previousAudit = null;
  let lastFailureReason = '';
  let semanticRepairAttemptIndex = 0;

  while (attempt < MAX_LOCATION_PROFILE_ATTEMPTS) {
    attempt += 1;
    let dossierText = '';
    let auditText = '';
    let repairText = '';
    let repairAuditText = '';
    let rawText = '';
    const dossierMessages = buildLocationDossierMessages(context, previousAudit);
    const dossierRequestPreview = summarizeMessages(dossierMessages);

    try {
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Semantic dossier',
        message: `Собираю локальный смысловой слой локации для текущей сцены, попытка ${attempt}.`,
        requestPreview: dossierRequestPreview,
        requestSections: dossierRequestSections,
        attempt,
        maxAttempts: MAX_LOCATION_PROFILE_ATTEMPTS,
        ...buildStageTelemetry('location_profiles', 'semantic_dossier', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO)
      });
      const dossierResponse = await client.complete(LegacyWorldRoles.LOCATION_PROFILES_DOSSIER, {
        model: config.model,
        messages: dossierMessages,
        temperature: 0.25,
        max_tokens: 1600
      });
      dossierText = dossierResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!dossierText) {
        throw new Error('Empty semantic dossier response');
      }
      hooks.onStage?.({
        phase: 'semantic_dossier',
        label: 'Semantic dossier',
        message: 'Локальный слой локации собран и готов к проверке.',
        responsePreview: clipText(dossierText, 1400),
        responseSections: buildSemanticTextSections('Dossier', dossierText)
      });

      hooks.onStage?.({
        phase: 'semantic_audit',
        label: 'Semantic audit',
        message: 'Проверяю только реальные ошибки: противоречия, невозможную географию, всеведение и разрыв видимого/скрытого.',
        requestPreview: summarizeMessages(buildLocationAuditMessages(context, dossierText)),
        requestSections: auditRequestSections,
        attempt,
        ...buildStageTelemetry('location_profiles', 'semantic_audit', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO)
      });
      const auditResponse = await client.complete(LegacyWorldRoles.LOCATION_PROFILES_AUDIT, {
        model: config.model,
        messages: buildLocationAuditMessages(context, dossierText),
        temperature: 0.1,
        max_tokens: 700
      });

      auditText = auditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
      let audit = parseSemanticAuditResponse(auditText);
      if (!audit) {
        lastFailureReason = summarizeInvalidSemanticAudit(auditText);
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор локаций',
          message: `Location audit вернул невалидный ответ: ${lastFailureReason}.`,
          requestPreview: dossierRequestPreview,
          responsePreview: clipText(auditText || dossierText, 1400),
          requestSections: dossierRequestSections,
          responseSections: buildValidationErrorSections('Semantic audit validation', explainSemanticAuditValidation(parseJsonObject(auditText))),
          attempt,
          ...buildStageTelemetry('location_profiles', 'semantic_audit', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO, 'failed')
        });
        if (attempt >= MAX_LOCATION_PROFILE_ATTEMPTS) {
          throwGenerationFailure('location profiles', lastFailureReason);
        }
        await sleep(nextRetryDelay(attempt));
        continue;
      }

      if (audit.pass !== true) {
        semanticRepairAttemptIndex += 1;
        const repairModelTier = getSemanticRepairModelTier(semanticRepairAttemptIndex);
        lastFailureReason = summarizeLocationAuditFailure(audit);
        previousAudit = audit;
        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Исправление локаций',
          message: semanticRepairAttemptIndex >= 2
            ? 'Повторный semantic repair эскалирован до senior reasoning; это последняя попытка исправить location dossier.'
            : 'Прошу точечно исправить dossier по конкретным замечаниям аудита.',
          requestPreview: summarizeMessages(buildLocationRepairMessages(context, dossierText, audit)),
          requestSections: [
            section('Dossier', splitTextLines(dossierText)),
            section('Audit concerns', audit.concerns?.slice(0, 4) ?? []),
            section('Audit evidence', audit.evidence?.slice(0, 4) ?? [])
          ],
          attempt,
          ...buildStageTelemetry('location_profiles', 'semantic_repair', attempt, semanticRepairAttemptIndex, repairModelTier)
        });
        const repairResponse = await client.complete(LegacyWorldRoles.LOCATION_PROFILES_REPAIR, {
          model: config.model,
          messages: buildLocationRepairMessages(context, dossierText, audit),
          temperature: 0.15,
          max_tokens: 700
        });
        repairText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        if (!repairText) {
          hooks.onStage?.({
            phase: 'llm_retry',
            label: 'Повтор локаций',
            message: `Исправление локаций не вернуло текст: ${lastFailureReason}.`,
            requestPreview: dossierRequestPreview,
            responsePreview: clipText(auditText || dossierText, 1400),
            requestSections: dossierRequestSections,
            responseSections: buildLocationAuditResponseSections(audit),
            attempt,
            ...buildStageTelemetry('location_profiles', 'semantic_repair', attempt, semanticRepairAttemptIndex, repairModelTier, 'failed')
          });
          if (semanticRepairAttemptIndex >= 2) {
            throwGenerationFailure('location profiles', `stage_failed / needs_manual_review: ${lastFailureReason}`);
          }
          if (attempt >= MAX_LOCATION_PROFILE_ATTEMPTS) {
            throwGenerationFailure('location profiles', lastFailureReason);
          }
          await sleep(nextRetryDelay(attempt));
          continue;
        }

        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Исправление локаций',
          message: 'Получен исправленный dossier локаций, запускаю повторный аудит.',
          responsePreview: clipText(repairText, 1400),
          responseSections: buildSemanticTextSections('Repaired dossier', repairText),
          attempt,
          ...buildStageTelemetry('location_profiles', 'semantic_repair', attempt, semanticRepairAttemptIndex, repairModelTier)
        });

        hooks.onStage?.({
          phase: 'semantic_audit',
          label: 'Location re-audit',
          message: 'Повторно проверяю исправленные локации.',
          requestPreview: summarizeMessages(buildLocationAuditMessages(context, repairText)),
          requestSections: auditRequestSections,
          attempt,
          ...buildStageTelemetry('location_profiles', 'semantic_audit', attempt, semanticRepairAttemptIndex, repairModelTier)
        });
        const repairAuditResponse = await client.complete(LegacyWorldRoles.LOCATION_PROFILES_AUDIT, {
          model: config.model,
          messages: buildLocationAuditMessages(context, repairText),
          temperature: 0.1,
          max_tokens: 700
        });
        repairAuditText = repairAuditResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        const repairAudit = parseSemanticAuditResponse(repairAuditText);
        if (!repairAudit) {
          lastFailureReason = summarizeInvalidSemanticAudit(repairAuditText);
          hooks.onStage?.({
            phase: 'llm_retry',
            label: 'Повтор локаций',
            message: `Повторный Location audit вернул невалидный ответ: ${lastFailureReason}.`,
            requestPreview: dossierRequestPreview,
            responsePreview: clipText(repairAuditText || repairText, 1400),
            requestSections: dossierRequestSections,
            responseSections: buildValidationErrorSections('Semantic audit validation', explainSemanticAuditValidation(parseJsonObject(repairAuditText))),
            attempt,
            ...buildStageTelemetry('location_profiles', 'semantic_audit', attempt, semanticRepairAttemptIndex, repairModelTier, 'failed')
          });
          if (semanticRepairAttemptIndex >= 2) {
            throwGenerationFailure('location profiles', `stage_failed / needs_manual_review: ${lastFailureReason}`);
          }
          if (attempt >= MAX_LOCATION_PROFILE_ATTEMPTS) {
            throwGenerationFailure('location profiles', lastFailureReason);
          }
          await sleep(nextRetryDelay(attempt));
          continue;
        }
        if (repairAudit.pass !== true) {
          lastFailureReason = summarizeLocationAuditFailure(repairAudit);
          previousAudit = repairAudit;
          hooks.onStage?.({
            phase: 'llm_retry',
            label: 'Повтор локаций',
            message: `Исправленный Location audit не прошёл: ${lastFailureReason}.`,
            requestPreview: dossierRequestPreview,
            responsePreview: clipText(repairAuditText || repairText, 1400),
            requestSections: dossierRequestSections,
            responseSections: buildLocationAuditResponseSections(repairAudit),
            attempt,
            ...buildStageTelemetry('location_profiles', 'semantic_audit', attempt, semanticRepairAttemptIndex, repairModelTier, 'failed')
          });
          if (semanticRepairAttemptIndex >= 2) {
            throwGenerationFailure('location profiles', `stage_failed / needs_manual_review: ${lastFailureReason}`);
          }
          if (attempt >= MAX_LOCATION_PROFILE_ATTEMPTS) {
            throwGenerationFailure('location profiles', lastFailureReason);
          }
          await sleep(nextRetryDelay(attempt));
          continue;
        }

        dossierText = repairText;
        audit = repairAudit;
      }

      hooks.onStage?.({
        phase: 'semantic_freeze',
        label: 'Semantic Freeze',
        message: 'Смысл утверждён и заморожен до упаковки в JSON.',
        responsePreview: clipText(dossierText, 1000),
        responseSections: [
          section('Freeze', [
            'Смысл больше не меняется.',
            'Теперь возможна только упаковка утверждённых фактов в JSON.'
          ])
        ],
        ...buildStageTelemetry('location_profiles', 'semantic_freeze', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO, 'passed')
      });

      let accumulatedValidationErrors = [];
      let retryInstruction = '';
      let previousLocationProfiles = null;

      hooks.onStage?.({
        phase: 'semantic_shape',
        label: 'LocationProfileShaper',
        message: retryInstruction ? 'Повторяю location_profiles по validationErrors.' : 'Перевожу утверждённый смысл в строгий JSON.',
        requestPreview: summarizeMessages(buildLocationShapeMessages(context, dossierText, audit, retryInstruction, previousLocationProfiles, accumulatedValidationErrors)),
        requestSections: shapeRequestSections,
        attempt,
        ...buildStageTelemetry('location_profiles', 'shaper', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO)
      });
      const response = await client.complete(LegacyWorldRoles.LOCATION_PROFILES_SHAPER, {
        model: config.model,
        messages: buildLocationShapeMessages(context, dossierText, audit, retryInstruction, previousLocationProfiles, accumulatedValidationErrors),
        temperature: 0.1,
        max_tokens: 2000
      });

      rawText = response?.choices?.[0]?.message?.content?.trim() ?? '';
      const parsedObject = parseJsonObject(rawText);
      if (!parsedObject) {
        lastFailureReason = 'LocationProfileShaper output is invalid JSON: response was not parseable. Likely copied sourceDossier or trailed into prose.';
        hooks.onStage?.({
          phase: 'llm_retry',
          label: 'Повтор локаций',
          message: `${lastFailureReason} Return only the requested location_profiles contract. Do not include current, neighbors, audit, sourceDossier, repairNotes, contract, notes.`,
          requestPreview: dossierRequestPreview,
          responsePreview: clipText(rawText || repairAuditText || repairText || auditText || dossierText, 1400),
          requestSections: dossierRequestSections,
          responseSections: buildRetryResponseSections(rawText || repairAuditText || repairText || auditText || dossierText),
          attempt,
          ...buildStageTelemetry('location_profiles', 'shape_validation', attempt, semanticRepairAttemptIndex, MODEL_TIER_FLASH, 'failed')
        });
        if (attempt >= MAX_LOCATION_PROFILE_ATTEMPTS) {
          throwGenerationFailure('location profiles', lastFailureReason);
        }
        await sleep(nextRetryDelay(attempt));
        continue;
      }

      if (isBlockedByMissingApprovedFactOutcome(parsedObject)) {
        lastFailureReason = summarizeMissingApprovedFactOutcome(parsedObject);
        hooks.onStage?.({
          phase: 'shape_validation',
          label: 'Location profiles blocked',
          message: `LocationProfileShaper остановлен: ${lastFailureReason}.`,
          responsePreview: clipText(rawText, 1400),
          responseSections: buildRetryResponseSections(rawText),
          attempt,
          ...buildStageTelemetry('location_profiles', 'shape_validation', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO, 'blocked_by_missing_approved_fact')
        });
        throwGenerationFailure('location profiles', lastFailureReason);
      }

      previousLocationProfiles = parsedObject;
      let evaluation = evaluateLocationProfilesCandidate(parsedObject);
      if (!evaluation.ok) {
        accumulatedValidationErrors = mergeLocationProfilesValidationErrors(
          accumulatedValidationErrors,
          describeValidationErrors(evaluation.validation)
        );
        const repairMessages = buildLocationProfilesContractRepairMessages(context, dossierText, audit, accumulatedValidationErrors, parsedObject);
        hooks.onStage?.({
          phase: 'semantic_repair',
          label: 'Location profiles repair',
          message: 'Исправляю location_profiles целиком по validationErrors.',
          requestPreview: summarizeMessages(repairMessages),
          attempt,
          repair: { kind: 'validation_repair', errorCount: accumulatedValidationErrors.length },
          ...buildStageTelemetry('location_profiles', 'semantic_repair', attempt, semanticRepairAttemptIndex, MODEL_TIER_FLASH)
        });
        const repairResponse = await client.complete(LegacyWorldRoles.LOCATION_PROFILES_REPAIR, {
          model: config.model,
          messages: repairMessages,
          temperature: 0.15,
          max_tokens: 2000
        });
        const repairShapeText = repairResponse?.choices?.[0]?.message?.content?.trim() ?? '';
        const repairObject = parseJsonObject(repairShapeText);
        if (isBlockedByMissingApprovedFactOutcome(repairObject)) {
          lastFailureReason = summarizeMissingApprovedFactOutcome(repairObject);
          hooks.onStage?.({
            phase: 'shape_validation',
            label: 'Location profiles blocked',
            message: `Location profile repair остановлен: ${lastFailureReason}.`,
            responsePreview: clipText(repairShapeText, 1400),
            responseSections: buildRetryResponseSections(repairShapeText),
            attempt,
            ...buildStageTelemetry('location_profiles', 'shape_validation', attempt, semanticRepairAttemptIndex, MODEL_TIER_FLASH, 'blocked_by_missing_approved_fact')
          });
          throwGenerationFailure('location profiles', lastFailureReason);
        }
        if (repairObject) {
          previousLocationProfiles = repairObject;
          evaluation = evaluateLocationProfilesCandidate(repairObject);
        }
      }

      if (evaluation.ok) {
        const parsed = validateLocationProfiles(previousLocationProfiles);
        parsed.historical_audit = audit;
        hooks.onStage?.({
          phase: 'llm_response',
          label: 'Локации готовы',
          message: 'LocationProfileShaper вернул профили мест и периодов.',
          responsePreview: clipText(rawText, 1400),
          responseSections: buildLocationResponseSections(parsed),
          ...buildStageTelemetry('location_profiles', 'shape_validation', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO, 'passed')
        });
        return {
          provider: config.provider,
          usedFallback: false,
          data: parsed
        };
      }

      lastFailureReason = mergeLocationProfilesValidationErrors(
        accumulatedValidationErrors,
        describeValidationErrors(evaluation.validation)
      ).join('; ') || 'причина не указана';
      retryInstruction = [
        'Fix only listed validationErrors.',
        ...buildLocationProfilesAntiRegressionRules().map((rule) => `- ${rule}`),
        `Accumulated errors: ${lastFailureReason}`
      ].join(' ');
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор локаций',
        message: `Профили мест не прошли проверку: ${lastFailureReason}.`,
        requestPreview: dossierRequestPreview,
        responsePreview: clipText(rawText || repairAuditText || repairText || auditText || dossierText, 1400),
        requestSections: dossierRequestSections,
        responseSections: buildValidationErrorSections('Location validation', evaluation.validation),
        attempt,
        ...buildStageTelemetry('location_profiles', 'shape_validation', attempt, semanticRepairAttemptIndex, MODEL_TIER_FLASH, 'failed')
      });
      if (attempt >= MAX_LOCATION_PROFILE_ATTEMPTS) {
        throwGenerationFailure('location profiles', lastFailureReason);
      }
    } catch (error) {
      const normalizedError = normalizeError(error, lastFailureReason || 'Location profile generation failed.');
      lastFailureReason = normalizedError.message;
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор локаций',
        message: `Генерация локаций не удалась: ${lastFailureReason}.`,
        requestPreview: dossierRequestPreview,
        responsePreview: clipText(rawText || repairAuditText || repairText || auditText || dossierText, 1400),
        requestSections: dossierRequestSections,
        responseSections: buildRetryResponseSections(rawText || repairAuditText || repairText || auditText || dossierText),
        attempt,
        ...buildStageTelemetry('location_profiles', 'semantic_repair', attempt, semanticRepairAttemptIndex, MODEL_TIER_PRO, 'failed')
      });
      if (isTerminalStageFailureReason(lastFailureReason)) {
        throwGenerationFailure('location profiles', lastFailureReason);
      }
      if (attempt >= MAX_LOCATION_PROFILE_ATTEMPTS) {
        throwGenerationFailure('location profiles', lastFailureReason);
      }
    }

    await sleep(nextRetryDelay(attempt));
  }

  throwGenerationFailure('location profiles', lastFailureReason || 'retry attempts exhausted without concrete location profiles');
}


function createOpenAICompatibleClient(baseUrl, apiKey, telemetry = null) {
  const client = createScopedChatCompletionClient({
    scope: LLM_SCOPES.LEGACY_WORLD,
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: apiKey,
      DEEPSEEK_BASE_URL: baseUrl,
      ...(telemetry?.model ? { DEEPSEEK_MODEL: telemetry.model } : {})
    },
    telemetry: wrapLegacyTelemetry(telemetry)
  });
  return {
    ...client,
    async complete(roleId, payload) {
      return client.chat.completions.create(payload, { roleId });
    }
  };
}

function wrapLegacyTelemetry(telemetry = null) {
  if (!telemetry || typeof telemetry !== 'object') return telemetry;
  return {
    ...telemetry,
    onCall(call = {}) {
      telemetry.onCall?.({
        ...call,
        roleId: call.roleId ?? null,
        scope: call.scope ?? LLM_SCOPES.LEGACY_WORLD
      });
    }
  };
}


function buildHistoricalFrameDossierMessages(seed) {
  return [
    {
      role: 'system',
      content: [
        '# Роль',
        'Ты выбираешь историческую рамку для старта XIII-вековой RPG.',
        '# Задача',
        'Подбери только рамку, а не сцену, NPC или художественную прозу.',
        '# Доступные источники',
        'Используй startText, playerName, regionHint, yearHint и каталог регионов как ограничение.',
        '# Проектная документация',
        loadDesignBundleSync('historical_frame'),
        '# Уже установленные факты партии',
        'Сохраняй историческую правдоподобность, географическую привязку и фазовую логику давления.',
        '# Видимый контекст',
        'Выбирай регион, год, сезон, тип поселения, давление и конфликт среды.',
        '# Скрытая информация',
        'Не придумывай лишней конкретики и не раскрывай события будущего как известный факт.',
        '# Ограничения',
        'Нельзя писать сцену, метафоры, атмосферу или NPC. Примерная дата лучше внезапного события. Давление должно быть понятно как фаза или последствия.',
        '# Формат ответа',
        'Верни сухой обычный текст с годом, регионом, сезоном, типом поселения, давлением и конфликтом.',
        '# Критерии успеха',
        'Ответ должен быть исторично и географически правдоподобным, без художественной прозы.',
        ''
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        'Pipeline stage: historical_frame',
        `Подсказка ввода: ${clipText(seed?.startText ?? 'не предоставлено', 220)}`,
        `Имя игрока: ${clipText(seed?.playerName ?? 'не предоставлено', 120)}`,
        `Запрошенная подсказка региона: ${clipText(normalizeHistoricalPromptText(seed?.regionHint ?? 'не предоставлено'), 160)}`,
        `Запрошенная подсказка года: ${Number.isInteger(seed?.yearHint) ? seed.yearHint : 'не предоставлено'}`,
        `Подсказки каталога: ${(Array.isArray(seed?.regionCatalog) ? seed.regionCatalog.slice(0, 6).map((item) => `${item.name} (${item.macroZone ?? 'zone?'})`).join(' | ') : 'не предоставлено')}`,
        'Выбери исторически правдоподобную рамку и объясни её сухими фактами, а не сценической прозой.'
      ].join('\n')
    }
  ];
}

function buildHistoricalFrameAuditMessages(seed, dossierText) {
  return [
    {
      role: 'system',
      content: buildSemanticAuditSystemContent('historical_frame', [
        'Проверь, что выбранная рамка исторична, географически правдоподобна и не противоречит сезону, региону и типу поселения.',
        'Если есть сомнения, pass должен быть false.'
      ], 'historical_frame')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_audit',
        kind: 'historical_frame',
        dossier: dossierText,
        seed: {
          startText: seed?.startText ?? null,
          playerName: seed?.playerName ?? null,
          regionHint: seed?.regionHint ?? null,
          yearHint: Number.isInteger(seed?.yearHint) ? seed.yearHint : null
        }
      })
    }
  ];
}

function evaluateHistoricalFrameCandidate(data) {
  const validation = explainHistoricalFrameValidation(data);
  const parsed = validateHistoricalFrame(data);
  return {
    ok: Boolean(parsed),
    validation
  };
}

function buildHistoricalFrameRepairMessages(seed, dossierText, audit, validationErrors = [], previousHistoricalFrame = null) {
  const outputContract = buildHistoricalFrameOutputContract();
  const canonicalExample = getHistoricalFrameCanonicalExample();
  return [
    {
      role: 'system',
      content: [
        'Ты HistoricalFrameRepairer для исторической RPG XIII века.',
        'Верни полный исправленный JSON object historical_frame.',
        'Не объясняй.',
        'Не возвращай repair note.',
        'Не возвращай markdown.',
        'Исправь все validationErrors одновременно.',
        'Поля, которых нет в validationErrors, сохрани без смысловых изменений.',
        'Если ошибка "expected string, got array", объедини массив в одну компактную строку.',
        'regionHint не должен содержать settlementType.',
        'settlementType может содержать "сельское поселение".',
        'Типы берутся только из outputContract.',
        'Сохраняй frozen dossier и audit; не добавляй новых фактов.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'historical_frame_repair',
        kind: 'historical_frame',
        seed: {
          startText: seed?.startText ?? null,
          playerName: seed?.playerName ?? null,
          regionHint: seed?.regionHint ?? null,
          yearHint: Number.isInteger(seed?.yearHint) ? seed.yearHint : null
        },
        dossier: dossierText,
        audit,
        previousHistoricalFrame,
        validationErrors: Array.isArray(validationErrors) ? validationErrors : [],
        outputContract,
        canonicalExample
      })
    }
  ];
}

function buildHistoricalFrameRepairRequestSections(seed, validationErrors = []) {
  return [
    section('Контекст', [
      `Подсказка: ${clipText(seed?.startText ?? 'не предоставлено', 160)}`,
      `Регион: ${clipText(seed?.regionHint ?? 'не предоставлено', 120)}`
    ]),
    section('Validation', Array.isArray(validationErrors) ? validationErrors : []),
    section('Фриз', [
      'Досье уже заморожено.',
      'RepairLLM возвращает полный JSON historical_frame.'
    ])
  ];
}

function buildHistoricalFrameRetryInstruction(validationErrors = []) {
  const items = Array.isArray(validationErrors) ? validationErrors.filter(Boolean) : [];
  const parts = [
    'Fix only the listed validation errors.',
    'Keep the frozen dossier and every valid field unchanged.',
    'Do not regress fields that were already valid in previousHistoricalFrame.',
    'schema must be exactly "historical_frame" and version must be 1.',
    'Return the full historical_frame object with only contract-level corrections.',
    'Before return, verify anti-regression checks:'
  ];
  parts.push(...buildHistoricalFrameAntiRegressionRules().map((rule) => `- ${rule}`));
  if (items.length) {
    parts.push(`All accumulated validationErrors (${items.length}): ${items.join(' | ')}`);
  }
  return parts.join(' ');
}

function buildHistoricalFrameParseFailureMessage(parseResult, truncated = false) {
  const base = parseResult.kind === 'json_not_object'
    ? `HistoricalDataShaper output is not a JSON object: ${parseResult.error}`
    : 'HistoricalDataShaper output is invalid JSON: response was not parseable. Likely copied sourceDossier or trailed into prose.';
  if (truncated) {
    return `${base} Output likely truncated at maxTokens=${HISTORICAL_FRAME_SHAPE_MAX_TOKENS}.`;
  }
  return base;
}

function buildHistoricalFrameParseRetryInstruction({ truncated = false } = {}) {
  const parts = [
    'Return the same historical_frame object again as strict JSON only.',
    'No markdown, no prose, no schema drift.',
    'schema must be exactly "historical_frame" and version must be 1.',
    'Do not echo seed, sourceDossier, audit, contract, notes, or explanation.'
  ];
  if (truncated) {
    parts.push(`Previous output hit maxTokens=${HISTORICAL_FRAME_SHAPE_MAX_TOKENS}; shorten string fields.`);
  }
  return parts.join(' ');
}

function buildHistoricalFrameWrongSchemaRetryInstruction(errors = []) {
  const parts = [
    'schema must be exactly "historical_frame" and version must be 1.',
    'Return only the historical_frame contract object.',
    'Do not return semantic_audit or other schemas.'
  ];
  if (errors.length) {
    parts.push(`Schema errors: ${errors.slice(0, 2).join(' | ')}`);
  }
  return parts.join(' ');
}

function buildHistoricalFrameShapeMessages(seed, dossierText, audit, retryInstruction = '', previousHistoricalFrame = null) {
  const outputContract = buildHistoricalFrameOutputContract();
  const canonicalExample = getHistoricalFrameCanonicalExample();
  return [
    {
      role: 'system',
      content: [
        '# Роль',
        'Ты — HistoricalDataShaper. Ты не генератор прозы. Ты JSON contract compiler.',
        'Твоя задача — преобразовать sourceDossier в объект historical_frame, строго соответствующий outputContract.',
        'ВАЖНО:',
        '- allowedRootKeys задаёт только разрешённые имена полей, но не типы.',
        '- Типы берутся только из outputContract.',
        '- Не создавай массивы, если outputContract.fields[field].type !== "array".',
        '- pressure и conflict — всегда string; если sourceDossier содержит несколько пунктов, объедини их в одну компактную строку.',
        '- regionHint — каталожная подсказка региона; никогда не копируй туда settlementType.',
        '- settlementType — тип поселения; может содержать "сельское поселение".',
        '- regionName — точное имя из world_regions catalog.',
        '# Формат ответа',
        'Верни только строгий JSON object historical_frame без markdown и без пояснений.',
        'schema must be exactly "historical_frame", version must be 1.',
        'Если есть retryInstruction, следуй ему буквально.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        seed: {
          startText: seed?.startText ?? null,
          playerName: seed?.playerName ?? null,
          regionHint: seed?.regionHint ?? null,
          yearHint: Number.isInteger(seed?.yearHint) ? seed.yearHint : null
        },
        sourceDossier: dossierText,
        audit,
        retryInstruction: retryInstruction || null,
        previousHistoricalFrame,
        outputContract,
        canonicalExample,
        outputRules: {
          allowedRootKeys: outputContract.allowedRootKeys,
          forbiddenRootKeys: ['seed', 'sourceDossier', 'audit', 'contract', 'notes', 'raw', 'explanation'],
          schema: 'historical_frame',
          version: 1
        }
      })
    }
  ];
}

function buildHistoricalFrameRequestSections(seed) {
  return [
    section('Вход', [
      `Подсказка: ${clipText(seed?.startText ?? 'не предоставлено', 180)}`,
      `Игрок: ${clipText(seed?.playerName ?? 'не предоставлено', 120)}`,
      `Регион: ${clipText(seed?.regionHint ?? 'не предоставлено', 120)}`,
      `Год: ${Number.isInteger(seed?.yearHint) ? seed.yearHint : 'не предоставлено'}`
    ]),
    section('Каталог', Array.isArray(seed?.regionCatalog)
      ? seed.regionCatalog.slice(0, 6).map((item) => `${item.name ?? 'region'} · ${item.macroZone ?? 'zone?'}`)
      : ['не предоставлено'])
  ];
}

function buildHistoricalFrameAuditRequestSections(seed) {
  return [
    section('Ограничения', [
      `Подсказка: ${clipText(seed?.startText ?? 'не предоставлено', 180)}`,
      `Регион: ${clipText(seed?.regionHint ?? 'не предоставлено', 120)}`,
      `Год: ${Number.isInteger(seed?.yearHint) ? seed.yearHint : 'не предоставлено'}`
    ]),
    section('Каталог', Array.isArray(seed?.regionCatalog)
      ? seed.regionCatalog.slice(0, 4).map((item) => item.name ?? 'region')
      : ['не предоставлено'])
  ];
}

function buildHistoricalFrameShapeRequestSections(seed, retryInstruction = '', validationErrors = []) {
  const sections = [
    section('Schema', [
      'historical_frame',
      'year / season / regionName / regionHint',
      'settlementType / pressure / conflict / startTextHint'
    ]),
    section('Context', [
      `Подсказка: ${clipText(seed?.startText ?? 'не предоставлено', 160)}`,
      `Регион: ${clipText(seed?.regionHint ?? 'не предоставлено', 120)}`,
      `Год: ${Number.isInteger(seed?.yearHint) ? seed.yearHint : 'не предоставлено'}`
    ]),
    section('Contract', ['outputContract с типами полей передаётся в shaper payload.'])
  ];
  if (retryInstruction || validationErrors.length) {
    sections.push(section('Retry', [
      retryInstruction ? clipText(retryInstruction, 220) : 'нет',
      ...(validationErrors.length ? validationErrors.slice(0, 4) : [])
    ]));
  }
  return sections;
}

function buildHistoricalFrameResponseSections(parsed) {
  if (!parsed) return [];
  return [
    section('Рамка', [
      `year=${parsed.year}`,
      `season=${parsed.season}`,
      `region=${parsed.regionName}`,
      `settlement=${parsed.settlementType}`,
      `pressure=${parsed.pressure}`,
      `conflict=${parsed.conflict}`
    ]),
    section('Подсказка', [
      parsed.startTextHint ?? 'не предоставлено'
    ])
  ];
}

function parseHistoricalFrameResponse(text) {
  return validateHistoricalFrame(parseJsonObject(text));
}

function normalizeHistoricalPromptText(text) {
  return String(text ?? '')
    .replace(/\bмассов(ый|ые|ого)\s+поток\s+беженц[а-яё]*\b/giu, 'отдельные путники и гонцы')
    .replace(/\bпринимающ(?:ая|ий|ее|ие)?\s+беженц[а-яё]*\b/giu, 'дающая приют отдельным путникам')
    .replace(/\bбеженц[а-яё]*\b/giu, 'отдельные путники')
    .replace(/\bраскол\b/giu, 'разлад')
    .trim();
}

function normalizePlaceSeedFrame(world) {
  return {
    region: world.historicalFrame?.regionName ?? world.region?.name ?? null,
    year: world.historicalFrame?.year ?? world.history?.year ?? null,
    season: world.historicalFrame?.season ?? world.history?.season ?? null,
    historicalPack: {
      id: world.historical?.packId ?? null,
      year: world.historical?.year ?? null,
      regionHint: normalizeHistoricalPromptText(world.historical?.regionHint ?? null)
    }
  };
}

function parsePlaceSeedDossierSections(text) {
  const sectionKeys = ['PURPOSE', 'OWNERSHIP', 'LIVELIHOOD', 'ROADS', 'ACCESS_RULES', 'HAZARDS', 'RHYTHM'];
  const sections = Object.fromEntries(sectionKeys.map((key) => [key, []]));
  let currentKey = null;

  for (const rawLine of String(text ?? '').split(/\r?\n/gu)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^(?:#{1,3}\s*)?(PURPOSE|OWNERSHIP|LIVELIHOOD|ROADS|ACCESS_RULES|ACCESS RULES|HAZARDS|RHYTHM)\s*:?\s*$/iu);
    if (heading) {
      currentKey = heading[1].replace(/\s+/g, '_').toUpperCase();
      continue;
    }

    if (!currentKey) continue;
    const value = line.replace(/^[-*]\s*/u, '').replace(/^\d+[.)]\s*/u, '');
    if (value) sections[currentKey].push(value);
  }

  return sections;
}

const PLACE_SEED_FRAGMENT_STAGES = {
  purposeOwnership: {
    key: 'purposeOwnership',
    label: 'ShapePurposeOwnership',
    shaperLabel: 'PlaceSeedPurposeOwnershipShaper',
    allowedKeys: ['placeName', 'placeKind', 'purpose', 'formalOwner', 'actualManager', 'dependentGroups'],
    expectedKinds: {
      placeName: 'string',
      placeKind: 'string',
      purpose: 'string',
      formalOwner: 'string',
      actualManager: 'string',
      dependentGroups: 'array'
    },
    maxTokens: 360,
    retryPath: 'root.purpose',
    sectionFocus: ['PURPOSE', 'OWNERSHIP']
  },
  livelihoodRoads: {
    key: 'livelihoodRoads',
    label: 'ShapeLivelihoodRoads',
    shaperLabel: 'PlaceSeedLivelihoodRoadsShaper',
    allowedKeys: ['livelihood', 'roads'],
    expectedKinds: {
      livelihood: 'array',
      roads: 'array'
    },
    maxTokens: 360,
    retryPath: 'root.roads[1]',
    sectionFocus: ['LIVELIHOOD', 'ROADS']
  },
  accessHazardsRhythm: {
    key: 'accessHazardsRhythm',
    label: 'ShapeAccessHazardsRhythm',
    shaperLabel: 'PlaceSeedAccessHazardsRhythmShaper',
    allowedKeys: ['accessRules', 'hazards', 'rhythm'],
    expectedKinds: {
      accessRules: 'array',
      hazards: 'array',
      rhythm: 'string'
    },
    maxTokens: 420,
    retryPath: 'root.dossierSections.RHYTHM[1]',
    sectionFocus: ['ACCESS_RULES', 'HAZARDS', 'RHYTHM']
  }
};

function buildPlaceSeedShapeInput(world, dossierSections, fragmentState = {}, validationErrors = [], stage) {
  const sourceSections = {
    PURPOSE: dossierSections.PURPOSE ?? [],
    OWNERSHIP: dossierSections.OWNERSHIP ?? [],
    LIVELIHOOD: dossierSections.LIVELIHOOD ?? [],
    ROADS: dossierSections.ROADS ?? [],
    ACCESS_RULES: dossierSections.ACCESS_RULES ?? [],
    HAZARDS: dossierSections.HAZARDS ?? [],
    RHYTHM: dossierSections.RHYTHM ?? []
  };
  return {
    stage: stage.label,
    frame: normalizePlaceSeedFrame(world),
    sourceSections,
    fragmentState: {
      purposeOwnership: fragmentState.purposeOwnership ?? null,
      livelihoodRoads: fragmentState.livelihoodRoads ?? null,
      accessHazardsRhythm: fragmentState.accessHazardsRhythm ?? null
    },
    retryInstruction: fragmentState.retryInstruction ?? null,
    validationErrors: Array.isArray(validationErrors) ? validationErrors.slice(0, 8) : [],
    outputRules: {
      allowedRootKeys: stage.allowedKeys,
      forbiddenRootKeys: ['frame', 'sourceSections', 'fragmentState', 'validationErrors', 'audit', 'dossierSections', 'notes', 'raw', 'explanation'],
      maxArrayItems: 2,
      maxStringsPerArray: 2,
      rhythmFormat: 'single compact string; join any RHYTHM source lines into one sentence'
    }
  };
}

function buildPlaceSeedDossierMessages(world, previousAudit = null) {
  return [
    {
      role: 'system',
      content: [
        'Ты LLM для стартового места исторической RPG XIII века.',
        promptDesignDocs('place_seed'),
        'Твоя задача - отдельно описать само место через фиксированные секции: PURPOSE, OWNERSHIP, LIVELIHOOD, ROADS, ACCESS_RULES, HAZARDS, RHYTHM.',
        'В ownership-части удерживай три разные роли: formalOwner, actualManager и dependentGroups. Не своди их в одно поле.',
        'Не пиши социальную ткань целиком и не пиши сцену персонажа.',
        'Жёстко держи выбранную историческую рамку: год, сезон и регион из входного контекста важнее любых фоновых пакетов.',
        'Не импортируй дороги, события, правителей, битвы и риски из другого года или региона.',
        'Если sourceSections.RHYTHM приходит несколькими строками, собери его в одну компактную строку. rhythm должен быть одним предложением, а не массивом.',
        'Верни только сухой dossier с этими секциями и короткими пунктами внутри каждой секции. Без вступления, без выводов, без лишних заголовков и без художественной прозы.',
        'Не добавляй никаких секций кроме PURPOSE, OWNERSHIP, LIVELIHOOD, ROADS, ACCESS_RULES, HAZARDS, RHYTHM.',
        'После проверки этот смысл будет упакован в JSON другим агентом.'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        'Pipeline stage: place_seed',
        `Историческая рамка: ${world.historicalFrame?.regionName ?? world.region?.name ?? 'не предоставлено'} / ${world.historicalFrame?.year ?? world.history?.year ?? 'не указано'} / ${world.historicalFrame?.season ?? world.history?.season ?? 'не указано'}`,
        `Исторический пакет: ${world.historical?.packId ?? 'не предоставлено'} / ${world.historical?.year ?? 'не указано'} / ${normalizeHistoricalPromptText(world.historical?.regionHint ?? 'не предоставлено')}`,
        `Каркас места: ${world.place?.name ?? 'не предоставлено'} (${world.place?.kind ?? 'не указано'})`,
        `Региональное давление: ${normalizeHistoricalPromptText((world.region?.tensions ?? []).slice(0, 4).join(' | ') || 'не предоставлено')}`,
        `Известные дороги: ${(world.historical?.roadRoutes ?? []).slice(0, 4).map((item) => item.route ?? item).join(' | ') || 'не предоставлено'}`,
        previousAudit ? `Замечания прошлого аудита для исправления: ${summarizePlaceAuditFailure(previousAudit)}` : 'Замечания прошлого аудита: отсутствуют',
        'Опиши только назначение места, структуру владения, способы пропитания, дороги, правила доступа, опасности и повседневный ритм.'
      ].join('\n')
    }
  ];
}

function buildPlaceSeedAuditMessages(world, dossierText) {
  return [
    {
      role: 'system',
      content: buildSemanticAuditSystemContent('place_seed', [
        'Проверь настоящие ошибки: несовместимый год или регион, чужие дороги и события, невозможную географию, нарушение причинности и лишнюю всеведущую конкретику.',
        'Неполнота, историческая неопределённость и нехватка второстепенной конкретики не должны валить pass.',
        'Если проблема только в недосказанности, pass должен быть true, а замечание нужно пометить как uncertainty или soft concern.',
        'Если dossier протаскивает данные из другого исторического пакета, pass должен быть false.'
      ], 'place_seed')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_audit',
        kind: 'place_seed',
        dossier: dossierText,
        world: {
          region: world.historicalFrame?.regionName ?? world.region?.name ?? null,
          place: world.place?.name ?? null,
          year: world.historicalFrame?.year ?? world.history?.year ?? null,
          season: world.historicalFrame?.season ?? world.history?.season ?? null,
          historicalPack: {
            id: world.historical?.packId ?? null,
            year: world.historical?.year ?? null,
            regionHint: world.historical?.regionHint ?? null
          },
          roads: Array.isArray(world.historical?.roadRoutes) ? world.historical.roadRoutes.slice(0, 4).map((item) => item.route ?? item) : []
        }
      })
    }
  ];
}

function buildPlaceSeedRepairMessages(world, dossierText, audit) {
  return [
    {
      role: 'system',
      content: [
        'Ты SemanticDossierRepairer для place_seed исторической RPG XIII века.',
        'Верни только исправленный связный dossier без JSON, markdown и списков.',
        'Твоя задача - точечно исправить dossier по конкретным замечаниям аудита, не переписывая смысл с нуля.',
        'Сохрани purpose, formalOwner, actualManager, dependentGroups, livelihood, roads, access rules, hazards и rhythm, если они не противоречат аудиту.',
        'Жёстко держи год, сезон и регион из входного контекста.',
        'Удали или замени дороги, события и риски, если они пришли из несовместимого исторического пакета.',
        'Не добавляй ничего сверх того, что нужно, чтобы снять audit concerns.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_dossier_repair',
        kind: 'place_seed',
        frame: {
          region: world.historicalFrame?.regionName ?? world.region?.name ?? null,
          year: world.historicalFrame?.year ?? world.history?.year ?? null,
          season: world.historicalFrame?.season ?? world.history?.season ?? null,
          historicalPack: {
            id: world.historical?.packId ?? null,
            year: world.historical?.year ?? null,
            regionHint: world.historical?.regionHint ?? null
          }
        },
        place: {
          name: world.place?.name ?? null,
          kind: world.place?.kind ?? null
        },
        dossier: dossierText,
        audit
      })
    }
  ];
}

function buildPlaceSeedContractRepairMessages(world, dossierText, audit, validationErrors = [], previousPlaceSeed = null) {
  const outputContract = buildPlaceSeedOutputContract();
  const canonicalExample = getPlaceSeedCanonicalExample();
  return [
    {
      role: 'system',
      content: [
        'Ты PlaceSeedRepairer для исторической RPG XIII века.',
        'Верни полный исправленный JSON object place_seed.',
        'Исправь все validationErrors одновременно.',
        'Типы берутся только из outputContract.',
        'Не придумывай placeName/placeKind если их нет во frozen dossier.',
        'Anti-regression:',
        ...buildPlaceSeedAntiRegressionRules().map((rule) => `- ${rule}`)
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'place_seed_repair',
        dossier: dossierText,
        audit,
        previousPlaceSeed,
        validationErrors,
        outputContract,
        canonicalExample
      })
    }
  ];
}

function buildPlaceSeedShapeMessages(world, dossierSections, fragmentState = {}, validationErrors = [], stage = PLACE_SEED_FRAGMENT_STAGES.purposeOwnership) {
  const outputContract = buildPlaceSeedOutputContract();
  const canonicalExample = getPlaceSeedCanonicalExample();
  return [
    {
      role: 'system',
      content: [
        '# Роль',
        `Ты — ${stage.shaperLabel} для исторической RPG XIII века.`,
        '# Задача',
        `Верни только фрагмент JSON для ${stage.label}, не перезапуская весь place seed.`,
        '# outputContract',
        JSON.stringify(outputContract),
        '# canonicalExample',
        JSON.stringify(canonicalExample),
        '# Доступные источники',
        'Используй sourceSections и fragmentState как сырьё для фрагмента.',
        '# Уже установленные факты партии',
        'Сохраняй выбранный год, регион и сезон как ограничение; не подтягивай чужой history pack.',
        '# Видимый контекст',
        'Разделяй ownership на formalOwner, actualManager и dependentGroups. Не складывай их в одно поле.',
        '# Скрытая информация',
        'Не копируй sourceSections целиком и не возвращай frame, audit, dossierSections, notes, raw или explanation.',
        '# Ограничения',
        `Разрешённые root-ключи: ${stage.allowedKeys.join(', ')}. Если sourceSections.RHYTHM содержит несколько строк, rhythm в JSON должен быть одной компактной строкой. Слей строки в одно предложение. Если в input есть retryInstruction, следуй ему буквально.`,
        '# Anti-regression',
        buildPlaceSeedAntiRegressionRules().map((rule) => `- ${rule}`).join('\n'),
        '# Формат ответа',
        'Верни только строгий JSON object без markdown и без пояснений.',
        '# Критерии успеха',
        'Ответ должен быть маленьким, структурным и без новых фактов.',
        ''
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify(buildPlaceSeedShapeInput(world, dossierSections, fragmentState, validationErrors, stage))
    }
  ];
}

function buildPlaceSeedRequestSections(world) {
  return [
    section('Рамка', [
      `Регион: ${world.historicalFrame?.regionName ?? world.region?.name ?? 'не предоставлено'}`,
      `Год: ${world.historicalFrame?.year ?? world.history?.year ?? 'не указано'}`,
      `Сезон: ${world.historicalFrame?.season ?? world.history?.season ?? 'не указано'}`,
      `Пакет: ${world.historical?.packId ?? 'не предоставлено'} / ${world.historical?.year ?? 'не указано'}`,
      `Подсказка региона: ${normalizeHistoricalPromptText(world.historical?.regionHint ?? 'не предоставлено')}`
    ]),
    section('Место', [
      `Место: ${world.place?.name ?? 'не предоставлено'}`,
      `Kind: ${world.place?.kind ?? 'не предоставлено'}`,
      `Place seed formalOwner: ${world.placeSeed?.formalOwner ?? 'не предоставлено'}`,
      `Place seed actualManager: ${world.placeSeed?.actualManager ?? 'не предоставлено'}`
    ])
  ];
}

function buildPlaceSeedAuditRequestSections(world) {
  return [
    section('Ограничения', [
      `Регион: ${world.historicalFrame?.regionName ?? world.region?.name ?? 'не предоставлено'}`,
      `Год: ${world.historicalFrame?.year ?? world.history?.year ?? 'не указано'}`,
      `Пакет: ${world.historical?.packId ?? 'не предоставлено'} / ${world.historical?.year ?? 'не указано'}`,
      `Дороги: ${(world.historical?.roadRoutes ?? []).slice(0, 3).map((item) => item.route ?? item).join(' | ') || 'не предоставлено'}`
    ]),
    section('Место', [
      `Место: ${world.place?.name ?? 'не предоставлено'}`,
      `Давление: ${normalizeHistoricalPromptText((world.region?.tensions ?? []).slice(0, 3).join(' | ') || 'не предоставлено')}`
    ])
  ];
}

function buildPlaceSeedShapeRequestSections(dossierSections, stage, fragmentState = {}) {
  return [
    section('Stage', [
      stage.label,
      `Allowed root keys: ${stage.allowedKeys.join(', ')}`,
      `Max tokens: ${stage.maxTokens}`
    ]),
    section('Source sections', [
      `PURPOSE=${(dossierSections.PURPOSE ?? []).length}`,
      `OWNERSHIP=${(dossierSections.OWNERSHIP ?? []).length}`,
      `LIVELIHOOD=${(dossierSections.LIVELIHOOD ?? []).length}`,
      `ROADS=${(dossierSections.ROADS ?? []).length}`,
      `ACCESS_RULES=${(dossierSections.ACCESS_RULES ?? []).length}`,
      `HAZARDS=${(dossierSections.HAZARDS ?? []).length}`,
      `RHYTHM=${(dossierSections.RHYTHM ?? []).length}`,
      'RHYTHM must collapse to one compact string',
      `Retry hint: ${fragmentState.retryInstruction ?? 'не предоставлено'}`
    ])
  ];
}

function buildPlaceSeedResponseSections(parsed) {
  if (!parsed) return [];
  return [
    section('Место', [
      `name=${parsed.placeName ?? 'не предоставлено'}`,
      `kind=${parsed.placeKind ?? 'не предоставлено'}`,
      `purpose=${parsed.purpose ?? 'не предоставлено'}`,
      `formalOwner=${parsed.formalOwner ?? 'не предоставлено'}`,
      `actualManager=${parsed.actualManager ?? 'не предоставлено'}`,
      `dependentGroups=${Array.isArray(parsed.dependentGroups) ? parsed.dependentGroups.join(' | ') : 'не предоставлено'}`,
      `rhythm=${parsed.rhythm ?? 'не предоставлено'}`
    ]),
    section('Дороги', Array.isArray(parsed.roads) ? parsed.roads.slice(0, 4) : []),
    section('Риски', Array.isArray(parsed.hazards) ? parsed.hazards.slice(0, 4) : [])
  ];
}

function mergePlaceSeedFragments(world, fragmentState = {}) {
  const purposeOwnership = fragmentState.purposeOwnership ?? {};
  const livelihoodRoads = fragmentState.livelihoodRoads ?? {};
  const accessHazardsRhythm = fragmentState.accessHazardsRhythm ?? {};
  return {
    version: 1,
    schema: 'place_seed',
    placeName: purposeOwnership.placeName ?? world.place?.name ?? world.historicalFrame?.regionName ?? null,
    placeKind: purposeOwnership.placeKind ?? world.place?.kind ?? null,
    purpose: purposeOwnership.purpose ?? '',
    formalOwner: purposeOwnership.formalOwner ?? '',
    actualManager: purposeOwnership.actualManager ?? '',
    dependentGroups: Array.isArray(purposeOwnership.dependentGroups) ? purposeOwnership.dependentGroups.slice(0, 4) : [],
    livelihood: Array.isArray(livelihoodRoads.livelihood) ? livelihoodRoads.livelihood.slice(0, 2) : [],
    roads: Array.isArray(livelihoodRoads.roads) ? livelihoodRoads.roads.slice(0, 2) : [],
    accessRules: Array.isArray(accessHazardsRhythm.accessRules) ? accessHazardsRhythm.accessRules.slice(0, 2) : [],
    hazards: Array.isArray(accessHazardsRhythm.hazards) ? accessHazardsRhythm.hazards.slice(0, 2) : [],
    rhythm: accessHazardsRhythm.rhythm ?? ''
  };
}

function validatePlaceSeedFragment(data, stage) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push(`root: expected object, got ${describePlaceSeedValueKind(data)}`);
    return errors;
  }

  for (const key of stage.allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      errors.push(`root.${key}: expected ${stage.expectedKinds[key] ?? 'value'}, got missing`);
      continue;
    }
    const value = data[key];
    const kind = stage.expectedKinds[key];
    if (kind === 'string') {
      if (typeof value !== 'string') {
        errors.push(`root.${key}: expected string, got ${describePlaceSeedValueKind(value)}`);
      }
      continue;
    }
    if (kind === 'array') {
      if (!Array.isArray(value)) {
        errors.push(`root.${key}: expected array, got ${describePlaceSeedValueKind(value)}`);
        continue;
      }
      if (value.some((item) => typeof item !== 'string')) {
        errors.push(`root.${key}: expected array of strings, got mixed values`);
      }
    }
  }

  for (const key of Object.keys(data)) {
    if (!stage.allowedKeys.includes(key)) {
      errors.push(`root.${key}: unexpected field`);
    }
  }

  return errors;
}

function describePlaceSeedValueKind(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'missing';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function buildPlaceSeedParseFailureMessage(stage) {
  return `PlaceSeedShaper output is invalid JSON: truncated after ${stage.retryPath}. Likely output limit or copied source envelope.`;
}

function buildPlaceSeedFragmentRetryMessage(stage, validationErrors = [], parsedObject = null) {
  if (!parsedObject) {
    return [
      buildPlaceSeedParseFailureMessage(stage),
      'Previous output copied forbidden key dossierSections and was truncated.',
      'Return only the requested fragment.',
      'Do not include frame, sourceSections, dossierSections, validationErrors, audit, notes.'
    ].join(' ');
  }

  const details = Array.isArray(validationErrors) && validationErrors.length > 0 ? validationErrors.join('; ') : 'причина не указана';
  return [
    `Forbidden root key: dossierSections.`,
    details,
    'Return only the requested fragment.',
    'Do not include frame, dossierSections, validationErrors, audit, notes.'
  ].join(' ');
}

function buildPlaceSeedValidationRetryMessage(validation, data) {
  const errors = describeValidationErrors(validation);
  const forbidden = errors.filter((error) => /unexpected field/i.test(error));
  const missing = errors.filter((error) => /expected .*got missing/i.test(error));
  const parts = [];
  if (forbidden.length) {
    parts.push(`Forbidden root key: ${forbidden[0].replace(/^root\./, '').replace(/:.*$/, '')}.`);
  }
  if (missing.length) {
    parts.push(missing.join(' '));
  }
  if (!parts.length) {
    parts.push('PlaceSeed validation failed.');
  }
  parts.push('Return only the target place_seed contract.');
  parts.push('Do not include sourceSections, dossierSections, validationErrors, audit, notes.');
  return parts.join(' ');
}

async function runPlaceSeedFragmentStage({ client, config, hooks, world, dossierSections, fragmentState, stage }) {
  let attempt = 0;
  let lastFailureReason = '';
  let retryInstruction = '';
  let currentValidationErrors = [];

  while (attempt < MAX_PLACE_SEED_SHAPE_ATTEMPTS) {
    attempt += 1;
    let rawText = '';
    const requestSections = buildPlaceSeedShapeRequestSections(dossierSections, stage, { ...fragmentState, retryInstruction });
    const messages = buildPlaceSeedShapeMessages(world, dossierSections, { ...fragmentState, retryInstruction }, currentValidationErrors, stage);
    hooks.onStage?.({
      phase: 'semantic_shape',
      label: stage.label,
      message: attempt === 1
        ? `Собираю фрагмент ${stage.label}.`
        : `Повторяю ${stage.label} по замечаниям валидатора.`,
      requestPreview: summarizeMessages(messages),
      requestRaw: messages,
      requestSections,
      attempt,
      maxAttempts: MAX_PLACE_SEED_SHAPE_ATTEMPTS
    });

    const response = await client.complete(LegacyWorldRoles.PLACE_SEED_SHAPER, {
      model: config.model,
      messages,
      temperature: 0.12,
      max_tokens: stage.maxTokens
    });

    rawText = response?.choices?.[0]?.message?.content?.trim() ?? '';
    const parsedObject = parseJsonObject(rawText);
    if (!parsedObject) {
      lastFailureReason = buildPlaceSeedParseFailureMessage(stage);
      currentValidationErrors = [];
      retryInstruction = [
        buildPlaceSeedParseFailureMessage(stage),
        'Previous output copied forbidden key dossierSections and was truncated.',
        'Return only the requested fragment.',
        'Do not include frame, sourceSections, dossierSections, validationErrors, audit, notes.'
      ].join(' ');
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор места',
        message: `${lastFailureReason} ${retryInstruction}`,
        requestPreview: summarizeMessages(messages),
        responsePreview: clipText(rawText, 1200),
        requestRaw: messages,
        responseRaw: rawText,
        requestSections,
        responseSections: buildRetryResponseSections(rawText),
        attempt,
        maxAttempts: MAX_PLACE_SEED_SHAPE_ATTEMPTS
      });
      if (attempt >= MAX_PLACE_SEED_SHAPE_ATTEMPTS) {
        throwGenerationFailure('place seed', lastFailureReason);
      }
      await sleep(nextRetryDelay(attempt));
      continue;
    }

    const validationErrors = validatePlaceSeedFragment(parsedObject, stage);
    if (validationErrors.length) {
      lastFailureReason = validationErrors.join('; ') || 'причина не указана';
      currentValidationErrors = validationErrors;
      retryInstruction = buildPlaceSeedFragmentRetryMessage(stage, validationErrors, parsedObject);
      hooks.onStage?.({
        phase: 'llm_retry',
        label: 'Повтор места',
        message: retryInstruction,
        requestPreview: summarizeMessages(messages),
        responsePreview: clipText(rawText, 1200),
        requestRaw: messages,
        responseRaw: rawText,
        requestSections,
        responseSections: buildValidationErrorSections('Place fragment validation', { ok: false, errors: validationErrors }),
        attempt,
        maxAttempts: MAX_PLACE_SEED_SHAPE_ATTEMPTS
      });
      if (attempt >= MAX_PLACE_SEED_SHAPE_ATTEMPTS) {
        throwGenerationFailure('place seed', lastFailureReason);
      }
      await sleep(nextRetryDelay(attempt));
      continue;
    }

    hooks.onStage?.({
      phase: 'llm_response',
      label: stage.shaperLabel,
      message: `${stage.shaperLabel} вернул фрагмент места.`,
      responsePreview: clipText(rawText, 1400),
      responseRaw: rawText,
      responseSections: buildSemanticTextSections(stage.label, rawText)
    });
    return parsedObject;
  }

  throwGenerationFailure('place seed', lastFailureReason || 'retry attempts exhausted without a concrete place seed fragment');
}


function buildPlaceAuditResponseSections(audit) {
  return [
    section('Audit', [
      `pass=${audit?.pass}`,
      `concerns=${audit?.concerns?.slice(0, 4).join(' | ') || 'не предоставлено'}`,
      `evidence=${audit?.evidence?.slice(0, 4).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function summarizePlaceAuditFailure(audit) {
  const concerns = Array.isArray(audit?.concerns) ? audit.concerns.filter(Boolean) : [];
  const evidence = Array.isArray(audit?.evidence) ? audit.evidence.filter(Boolean) : [];
  const parts = [];
  if (concerns.length) parts.push(concerns.slice(0, 3).join('; '));
  if (evidence.length) parts.push(`evidence: ${evidence.slice(0, 2).join('; ')}`);
  return parts.length > 0 ? parts.join(' | ') : 'semantic audit rejected the place seed';
}

function summarizeInvalidSemanticAudit(text) {
  const parsed = parseJsonObject(text);
  if (!parsed) return 'semantic audit response was not valid JSON';
  return describeValidationErrors(explainSemanticAuditValidation(parsed)).join('; ') || 'semantic audit response violated semantic_audit contract';
}

function parsePlaceSeedResponse(text) {
  return validatePlaceSeed(parseJsonObject(text));
}

function buildPlayerSeedDossierMessages(world, previousAudit = null) {
  const player = world.player ?? {};
  const playerName = playerSeedPromptName(player);
  const startText = promptTextValue(player.startText ?? world.historicalFrame?.startTextHint);
  return [
    {
      role: 'system',
      content: [
        'Ты LLM для создания персонажа игрока в исторической RPG XIII века.',
        promptDesignDocs('player_seed'),
        'Твоя задача - отдельно описать происхождение, статус, тело, одежду, имущество, память, уязвимость и причину оказаться именно здесь.',
        'Ориентируйся на канонические блоки результата: identity, body, attributes, skills/skill_bonuses, knowledge_map, memory_profile, goals_profile, items, property_and_access, relations, position и start_scene.',
        'Внутри блоков можно использовать snake_case или camelCase, но значения должны оставаться компактными и исторически правдоподобными.',
        'Для значимых предметов в items заполняй как минимум label, type, material, condition, weight, placement, access, visibility, discoverability, legal_status, plausibility, value, risk и marks; у контейнеров добавляй contents, если внутри уже есть определённое содержимое.',
        'Не пиши за NPC и не строи сцену места: нужен только сам игрок как историчный человек.',
        'Это стартовый seed, а не полноценная биография: держи профиль компактным, без семейной саги, детальных дат, длинной цепочки событий, скрытых конфликтов или готовой новеллы.',
        'Если имя игрока уже задано во входе, сохрани его как каноническое имя и не переименовывай персонажа.',
        'Если пользователь оставил поле пустым, воспринимай это как отсутствие предпочтения, а не как команду выбрать что-то случайно.',
        'Inventory - только то, что физически при нём; имущество вне рук и вне доступа должно идти в property, family или obligations, а не в inventory.',
        'Если стартовое описание подсказывает занятие или умение, укажи occupation и короткий список skills; если это не указано, так и скажи.',
        previousAudit ? `Замечания прошлого аудита для исправления: ${summarizePlayerSeedAuditFailure(previousAudit)}` : 'Замечания прошлого аудита: отсутствуют',
        'Верни только сухой структурный dossier обычным текстом: происхождение, статус, тело, одежда, имущество, память, уязвимость и причина быть здесь. Без сцены, метафор, атмосферы и художественной прозы.',
        'После проверки этот смысл будет упакован в JSON другим агентом.'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        'Pipeline stage: player_seed',
        `Имя игрока: ${playerName}`,
        `Стартовый текст: ${clipText(startText, 220)}`,
        `Историческая рамка: ${world.historicalFrame?.regionName ?? world.region?.name ?? 'не предоставлено'} / ${world.historicalFrame?.year ?? world.history?.year ?? 'не указано'} / ${world.historicalFrame?.season ?? world.history?.season ?? 'не указано'}`,
        `Место: ${world.place?.name ?? 'не предоставлено'} (${world.place?.kind ?? 'не указано'})`,
        `Социальная ткань: ${world.socialTissue?.powerStructure ?? 'не предоставлено'}`,
        'Опиши игрока как исторически правдоподобного человека со статусом, телом, имуществом, памятью, уязвимостью и причиной находиться здесь.',
        'Если добавляешь canonical body blocks, укажи description, visible_marks, clothing, health, satiety, vigor и active_conditions.',
        'Если добавляешь canonical inventory blocks, держи carried_items отдельно от property_not_carried, borrowed_items и foreign_items_with_character.',
        'Не придумывай полную биографию. Сохраняй стартовый масштаб и не добавляй конкретные события, смерти, учреждения, реликвии или тайную историю без прямого основания во входе.'
      ].join('\n')
    }
  ];
}

function buildPlayerSeedAuditMessages(world, dossierText) {
  const playerName = playerSeedInputName(world.player ?? {});
  return [
    {
      role: 'system',
      content: buildSemanticAuditSystemContent('player_seed', [
        'Проверь историчность, телесную правдоподобность, социальный статус и отсутствие лишней всеведущей биографии.',
        'Это стартовый seed, а не полноценная биография: если dossier уходит в длинную личную хронику, содержит много дат, имён событий, религиозных учреждений или реликвий, pass должен быть false.',
        'Если имя игрока уже задано во входе, dossier не должен его переименовывать или заменять случайным новым именем.',
        'Если есть сомнения, pass должен быть false.'
      ], 'player_seed')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_audit',
        kind: 'player_seed',
        player: {
          name: playerName
        },
        dossier: dossierText,
        world: {
          region: world.region?.name ?? null,
          place: world.place?.name ?? null,
          year: world.historicalFrame?.year ?? world.history?.year ?? null,
          season: world.historicalFrame?.season ?? world.history?.season ?? null
        }
      })
    }
  ];
}

function evaluatePlayerSeedCandidate(normalizedObject, compactShape = false) {
  const validationTarget = buildCanonicalPlayerSeedValidationTarget(normalizedObject);
  const validation = compactShape
    ? explainPlayerSeedCompactValidation(normalizedObject)
    : explainPlayerSeedValidation(validationTarget);
  const itemValidation = explainPlayerSeedItemBlocksValidation(normalizedObject);
  const parsed = compactShape
    ? validatePlayerSeedCompact(normalizedObject)
    : validatePlayerSeed(validationTarget);
  const itemsParsed = validatePlayerSeedItemBlocks(normalizedObject);
  return {
    ok: Boolean(parsed && itemsParsed),
    validation,
    itemValidation,
    validationTarget
  };
}

function buildPlayerSeedRepairMessages(world, dossierText, audit, validationErrors = [], previousPlayerSeed = null, compactShape = false) {
  const outputContract = buildPlayerSeedOutputContract({ compact: compactShape });
  const canonicalExample = getPlayerSeedCanonicalExample({ compact: compactShape });
  return [
    {
      role: 'system',
      content: [
        'Ты PlayerSeedRepairer для исторической RPG XIII века.',
        'Верни полный исправленный JSON object player_seed.',
        'Не объясняй.',
        'Не возвращай repair note.',
        'Не возвращай markdown.',
        'Исправь все validationErrors одновременно.',
        'Поля, которых нет в validationErrors, сохрани без смысловых изменений.',
        'Если ошибка "expected object, got array", преобразуй массив в object согласно outputContract.',
        'Если ошибка "expected string, got object", сверни объект в короткую строку без потери важных чисел.',
        'skills — legacy display adapter. May be string[] if contract says so.',
        'skill_bonuses — canonical mechanical data. Must be object. Never array.',
        'Типы и вложенная структура берутся только из outputContract.',
        'Сохраняй frozen dossier и audit; не добавляй новых фактов.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'player_seed_repair',
        kind: 'player_seed',
        dossier: dossierText,
        audit,
        previousPlayerSeed,
        validationErrors: Array.isArray(validationErrors) ? validationErrors : [],
        outputContract,
        canonicalExample
      })
    }
  ];
}

function buildPlayerSeedRepairRequestSections(world, validationErrors = []) {
  return [
    section('Игрок', [
      `Имя: ${playerSeedPromptName(world.player ?? {})}`,
      `Старт: ${clipText(promptTextValue(world.historicalFrame?.startTextHint ?? world.player?.startText), 160)}`
    ]),
    section('Validation', Array.isArray(validationErrors) ? validationErrors : []),
    section('Фриз', [
      'Досье уже заморожено.',
      'RepairLLM возвращает полный JSON player_seed.'
    ])
  ];
}

function buildPlayerSeedRetryInstruction(validationErrors = [], compactShape = false) {
  const items = Array.isArray(validationErrors) ? validationErrors.filter(Boolean) : [];
  const parts = [
    'Fix only the listed validation errors.',
    'Keep the frozen dossier and every valid field unchanged.',
    'Do not regress fields that were already valid in previousPlayerSeed.',
    'schema must be exactly "player_seed" and version must be 1.',
    'Return the full player_seed object with only contract-level corrections.',
    'Before return, verify anti-regression checks:'
  ];
  parts.push(...buildPlayerSeedAntiRegressionRules().map((rule) => `- ${rule}`));
  if (items.length) {
    parts.push(`All accumulated validationErrors (${items.length}): ${items.join(' | ')}`);
  }
  if (compactShape) {
    parts.push(`Compact shape only: ${PLAYER_SEED_COMPACT_ROOT_KEYS.filter((key) => key !== 'version' && key !== 'schema').join(', ')}.`);
  }
  return parts.join(' ');
}

function isLlmOutputTruncated(tokenUsage, maxTokens) {
  const completion = Number(tokenUsage?.completion_tokens);
  const limit = Number(maxTokens);
  return Number.isFinite(completion) && Number.isFinite(limit) && limit > 0 && completion >= limit;
}

function buildPlayerSeedParseFailureMessage(parseResult, truncated = false) {
  const base = parseResult.kind === 'json_not_object'
    ? `PlayerSeedShaper output is not a JSON object: ${parseResult.error}`
    : 'PlayerSeedShaper output is invalid JSON: response was not parseable. Likely copied sourceDossier or trailed into prose.';
  if (truncated) {
    return `${base} Output likely truncated at maxTokens=${PLAYER_SEED_SHAPE_MAX_TOKENS}; increase maxTokens or use compact shape.`;
  }
  return base;
}

function buildPlayerSeedParseRetryInstruction({ truncated = false, compactShape = false } = {}) {
  const parts = [
    'Return the same player_seed object again as strict JSON only.',
    'No markdown, no prose, no schema drift.',
    'schema must be exactly "player_seed" and version must be 1.',
    'Do not echo sourceDossier, audit, contract, notes, or explanation.'
  ];
  if (truncated) {
    parts.push(`Previous output hit maxTokens=${PLAYER_SEED_SHAPE_MAX_TOKENS}; shorten arrays and omit optional profile blocks.`);
  }
  if (compactShape) {
    parts.push(`Compact shape only: ${PLAYER_SEED_COMPACT_ROOT_KEYS.filter((key) => key !== 'version' && key !== 'schema').join(', ')}.`);
  }
  return parts.join(' ');
}

function buildPlayerSeedWrongSchemaRetryInstruction(errors = []) {
  const parts = [
    'schema must be exactly "player_seed" and version must be 1.',
    'Return only the player_seed contract object.',
    'Do not return semantic_audit, player_seed_v1, or other schemas.'
  ];
  if (errors.length) {
    parts.push(`Schema errors: ${errors.slice(0, 2).join(' | ')}`);
  }
  return parts.join(' ');
}

function buildPlayerSeedShapeMessages(world, dossierText, audit, retryInstruction = '', compactShape = false, previousPlayerSeed = null) {
  const playerName = playerSeedInputName(world.player ?? {});
  const outputContract = buildPlayerSeedOutputContract({ compact: compactShape });
  const canonicalExample = getPlayerSeedCanonicalExample({ compact: compactShape });
  return [
    {
      role: 'system',
      content: [
        '# Роль',
        'Ты — PlayerSeedShaper. Ты не генератор прозы. Ты JSON contract compiler.',
        'Твоя задача — преобразовать sourceDossier в объект player_seed, строго соответствующий outputContract.',
        'ВАЖНО:',
        '- allowedRootKeys задаёт только разрешённые имена полей, но не типы.',
        '- Типы и вложенная структура берутся только из outputContract.',
        '- Если sourceDossier содержит список, а outputContract требует object, ты обязан разложить список по ключам object.',
        '- Никогда не возвращай массив для поля, у которого type = object.',
        '- Никогда не возвращай строку для поля, у которого type = object.',
        '- Legacy-поля могут быть массивами только если outputContract явно разрешает array.',
        '- Canonical-поля всегда важнее legacy-полей.',
        '- skills — legacy display adapter. May be string[] if contract says so.',
        '- skill_bonuses — canonical mechanical data. Must be object. Never array.',
        '- Если пользователь оставил поле пустым, воспринимай это как отсутствие предпочтения, а не как команду выбрать что-то случайно.',
        'Canonical blocks остаются source of truth: identity, body, states, attributes, skill_bonuses, knowledge_map, memory_profile, goals_profile, items, property_and_access, relations, position и start_scene.',
        'Legacy compatibility fields допустимы только как derived adapters.',
        '# Формат ответа',
        'Верни только строгий JSON object player_seed без markdown и без пояснений.',
        'schema must be exactly "player_seed", version must be 1.',
        compactShape
          ? `Компактный режим: верни только ${PLAYER_SEED_COMPACT_ROOT_KEYS.join(', ')}.`
          : null
      ].filter(Boolean).join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        playerName,
        sourceDossier: dossierText,
        audit,
        retryInstruction,
        previousPlayerSeed,
        outputContract,
        canonicalExample,
        outputRules: {
          allowedRootKeys: outputContract.allowedRootKeys,
          forbiddenRootKeys: ['sourceDossier', 'audit', 'contract', 'notes', 'raw', 'explanation'],
          maxArrayItems: 2,
          maxStringsPerArray: 2,
          schema: 'player_seed',
          version: 1
        }
      })
    }
  ];
}

function buildPlayerSeedRequestSections(world) {
  const playerName = playerSeedPromptName(world.player ?? {});
  const startText = promptTextValue(world.historicalFrame?.startTextHint ?? world.player?.startText);
  const currentPosition = world.current_position ?? world.player?.position ?? null;
  return [
    section('Игрок', [
      `Имя: ${playerName}`,
      `Старт: ${clipText(startText, 160)}`,
      'Пустые поля ввода означают отсутствие предпочтения, а не случайный выбор.'
    ]),
    section('Рамка', [
      `Регион: ${world.historicalFrame?.regionName ?? world.region?.name ?? 'не предоставлено'}`,
      `Год: ${world.historicalFrame?.year ?? world.history?.year ?? 'не указано'}`,
      `Сезон: ${world.historicalFrame?.season ?? world.history?.season ?? 'не указано'}`
    ]),
    section('Место', [
      `Место: ${world.place?.name ?? 'не предоставлено'}`,
      `Kind: ${world.place?.kind ?? 'не предоставлено'}`
    ]),
    section('Позиция', [
      `current_position: ${currentPosition ? `${currentPosition.region_id ?? 'null'} / ${currentPosition.place_id ?? 'null'} / ${currentPosition.location_id ?? 'null'} / ${currentPosition.minilocation_id ?? 'null'}` : 'не предоставлено'}`,
      `anchor: ${currentPosition?.anchor_id ?? 'не предоставлено'}`,
      `route: ${currentPosition?.last_route_id ?? 'не предоставлено'}`
    ])
  ];
}

function buildPlayerSeedShapeRequestSections(world, retryInstruction = '', compactShape = false, validationErrors = []) {
  const sections = buildPlayerSeedRequestSections(world);
  if (compactShape) {
    sections.push(section('Shape', ['Компактный player_seed: только обязательные блоки.']));
  }
  sections.push(section('Contract', ['outputContract с типами полей передаётся в shaper payload.']));
  if (retryInstruction || validationErrors.length) {
    sections.push(section('Retry', [
      retryInstruction ? clipText(retryInstruction, 160) : 'retry instruction отсутствует',
      validationErrors.length ? `accumulated errors: ${validationErrors.length}` : 'validation errors отсутствуют'
    ]));
  }
  return sections;
}

function promptTextValue(value, fallback = 'не предоставлено') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function promptValueOrNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function playerSeedInputName(player = {}) {
  const text = String(player.name ?? '').trim();
  if (!text || text === 'безымянный человек') return null;
  return text;
}

function playerSeedPromptName(player = {}) {
  return promptTextValue(playerSeedInputName(player));
}

function buildPlayerSeedAuditRequestSections(world) {
  return [
    section('Ограничения', [
      `Регион: ${world.region?.name ?? 'не предоставлено'}`,
      `Социальная ткань: ${world.socialTissue?.powerStructure ?? 'не предоставлено'}`
    ]),
    section('Место', [
      `Место: ${world.place?.name ?? 'не предоставлено'}`,
      `Давление: ${(world.region?.tensions ?? []).slice(0, 3).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function buildPlayerSeedResponseSections(parsed) {
  if (!parsed) return [];
  const identity = parsed.identity && typeof parsed.identity === 'object' ? parsed.identity : null;
  const body = parsed.body && typeof parsed.body === 'object' ? parsed.body : null;
  const attributes = parsed.attributes && typeof parsed.attributes === 'object' ? parsed.attributes : null;
  const skillBonuses = parsed.skill_bonuses && typeof parsed.skill_bonuses === 'object' ? parsed.skill_bonuses : null;
  const knowledgeMap = parsed.knowledge_map && typeof parsed.knowledge_map === 'object' ? parsed.knowledge_map : null;
  const memoryProfile = parsed.memory_profile && typeof parsed.memory_profile === 'object' ? parsed.memory_profile : null;
  const goalsProfile = parsed.goals_profile && typeof parsed.goals_profile === 'object' ? parsed.goals_profile : null;
  const propertyAndAccess = parsed.property_and_access && typeof parsed.property_and_access === 'object' ? parsed.property_and_access : null;
  const position = parsed.position && typeof parsed.position === 'object'
    ? parsed.position
    : (parsed.current_position && typeof parsed.current_position === 'object' ? parsed.current_position : null);
  return [
    section('Игрок', [
      `name=${parsed.name ?? 'не предоставлено'}`,
      `status=${parsed.status ?? 'не предоставлено'}`,
      `socialClass=${parsed.socialClass ?? 'не предоставлено'}`,
      `reasonHere=${parsed.reasonHere ?? 'не предоставлено'}`,
      `occupation=${parsed.occupation ?? 'не предоставлено'}`
    ]),
    ...(identity ? [section('Identity', [
      `age_range=${identity.age_range ?? 'не предоставлено'}`,
      `origin=${identity.origin ?? 'не предоставлено'}`,
      `social_status=${identity.social_status ?? 'не предоставлено'}`
    ])] : []),
    ...(body ? [section('Body', [
      `description=${body.description ?? 'не предоставлено'}`,
      `visible_marks=${Array.isArray(body.visible_marks) ? body.visible_marks.slice(0, 3).join(', ') : 'не предоставлено'}`,
      `health=${body.health ?? 'не предоставлено'}`,
      `satiety=${body.satiety ?? 'не предоставлено'}`,
      `vigor=${body.vigor ?? 'не предоставлено'}`,
      `active_conditions=${Array.isArray(body.active_conditions) ? body.active_conditions.slice(0, 3).join(', ') : 'не предоставлено'}`
    ])] : []),
    ...(attributes ? [section('Attributes', [
      `strength=${attributes.strength ?? 'не предоставлено'}`,
      `agility=${attributes.agility ?? 'не предоставлено'}`,
      `endurance=${attributes.endurance ?? 'не предоставлено'}`,
      `reason=${attributes.reason ?? 'не предоставлено'}`,
      `attention=${attributes.attention ?? 'не предоставлено'}`,
      `influence=${attributes.influence ?? 'не предоставлено'}`
    ])] : []),
    ...(skillBonuses ? [section('Skill bonuses', [
      `athletics=${skillBonuses.athletics ?? 'не предоставлено'}`,
      `stealth=${skillBonuses.stealth ?? 'не предоставлено'}`,
      `melee=${skillBonuses.melee ?? 'не предоставлено'}`,
      `ranged=${skillBonuses.ranged ?? 'не предоставлено'}`
    ])] : []),
    section('Тело', [
      `body=${parsed.bodyState ?? 'не предоставлено'}`,
      `health=${parsed.health ?? 'не предоставлено'}`,
      `satiety=${parsed.satiety ?? 'не предоставлено'}`,
      `vigor=${parsed.vigor ?? 'не предоставлено'}`,
      `language=${parsed.language ?? 'не предоставлено'}`,
      `literacy=${parsed.literacy ?? 'не предоставлено'}`
    ]),
    ...(position ? [section('Позиция', [
      `region_id=${position.region_id ?? 'не предоставлено'}`,
      `place_id=${position.place_id ?? 'не предоставлено'}`,
      `location_id=${position.location_id ?? 'не предоставлено'}`,
      `minilocation_id=${position.minilocation_id ?? 'не предоставлено'}`
    ])] : []),
    ...(knowledgeMap ? [section('Knowledge map', [
      `known_facts=${Array.isArray(knowledgeMap.known_facts) ? knowledgeMap.known_facts.slice(0, 3).join(', ') : 'не предоставлено'}`,
      `known_places=${Array.isArray(knowledgeMap.known_places) ? knowledgeMap.known_places.slice(0, 3).join(', ') : 'не предоставлено'}`,
      `known_routes=${Array.isArray(knowledgeMap.known_routes) ? knowledgeMap.known_routes.slice(0, 3).join(', ') : 'не предоставлено'}`
    ])] : []),
    ...(memoryProfile ? [section('Memory profile', [
      `key_memories=${Array.isArray(memoryProfile.key_memories) ? memoryProfile.key_memories.slice(0, 3).join(', ') : 'не предоставлено'}`,
      `debts=${Array.isArray(memoryProfile.debts) ? memoryProfile.debts.slice(0, 3).join(', ') : 'не предоставлено'}`,
      `obligations=${Array.isArray(memoryProfile.obligations) ? memoryProfile.obligations.slice(0, 3).join(', ') : 'не предоставлено'}`
    ])] : []),
    ...(goalsProfile ? [section('Goals profile', [
      `immediate_need=${goalsProfile.immediate_need ?? goalsProfile.immediateNeed ?? 'не предоставлено'}`,
      `long_term_desire=${goalsProfile.long_term_desire ?? goalsProfile.longTermDesire ?? 'не предоставлено'}`,
      `reason_to_act=${goalsProfile.reason_to_act ?? goalsProfile.reasonToAct ?? 'не предоставлено'}`,
      `consequence_of_inaction=${goalsProfile.consequence_of_inaction ?? goalsProfile.consequenceOfInaction ?? 'не предоставлено'}`
    ])] : []),
    ...(propertyAndAccess ? [section('Property & access', [
      `property_not_carried=${Array.isArray(propertyAndAccess.property_not_carried) ? propertyAndAccess.property_not_carried.slice(0, 3).join(', ') : 'не предоставлено'}`,
      `borrowed_items=${Array.isArray(propertyAndAccess.borrowed_items) ? propertyAndAccess.borrowed_items.slice(0, 3).join(', ') : 'не предоставлено'}`,
      `foreign_items_with_character=${Array.isArray(propertyAndAccess.foreign_items_with_character) ? propertyAndAccess.foreign_items_with_character.slice(0, 3).join(', ') : 'не предоставлено'}`,
      `accessible_resources=${Array.isArray(propertyAndAccess.accessible_resources) ? propertyAndAccess.accessible_resources.slice(0, 3).join(', ') : 'не предоставлено'}`
    ])] : []),
    ...(parsed.start_scene && typeof parsed.start_scene === 'object' ? [section('Start scene', [
      `reason_here=${parsed.start_scene.reason_here ?? parsed.start_scene.reasonHere ?? 'не предоставлено'}`,
      `visible_situation=${parsed.start_scene.visible_situation ?? parsed.start_scene.visibleSituation ?? 'не предоставлено'}`,
      `immediate_tension=${parsed.start_scene.immediate_tension ?? parsed.start_scene.immediateTension ?? 'не предоставлено'}`,
      `nearby_people=${Array.isArray(parsed.start_scene.nearby_people ?? parsed.start_scene.nearbyPeople) ? (parsed.start_scene.nearby_people ?? parsed.start_scene.nearbyPeople).slice(0, 4).join(', ') : 'не предоставлено'}`
    ])] : []),
    section('Canonical items', [
      `carried_items=${Array.isArray(parsed.items?.carried_items) ? parsed.items.carried_items.slice(0, 4).map((item) => seedItemLabel(item)).join(', ') : 'не предоставлено'}`,
      `property_not_carried=${Array.isArray(parsed.items?.property_not_carried) ? parsed.items.property_not_carried.slice(0, 4).map((item) => seedItemLabel(item)).join(', ') : 'не предоставлено'}`,
      `total_weight=${parsed.items?.total_weight ?? 'не предоставлено'}`,
      `load_category=${parsed.items?.load_category ?? 'не предоставлено'}`,
      'item_fields=label, type, material, condition, weight, placement, access, visibility, discoverability, legal_status, plausibility, value, risk, marks, contents'
    ]),
    section('Имущество', Array.isArray(parsed.inventory) ? parsed.inventory.slice(0, 4) : []),
    section('Навыки', Array.isArray(parsed.skills) ? parsed.skills.slice(0, 4) : [])
  ];
}

function parsePlayerSeedResponse(text) {
  const parsed = normalizePlayerSeedShape(parseJsonObject(text));
  if (!validatePlayerSeed(buildCanonicalPlayerSeedValidationTarget(parsed))) return null;
  return validatePlayerSeedItemBlocks(parsed);
}

function applyPlayerSeedAuditGuard(audit, dossierText, world) {
  if (!audit || typeof audit !== 'object') return audit;

  const concern = detectPlayerSeedOverreach(dossierText, world);
  if (!concern) return audit;

  const concerns = Array.isArray(audit.concerns) ? audit.concerns.slice() : [];
  const evidence = Array.isArray(audit.evidence) ? audit.evidence.slice() : [];
  if (!concerns.some((item) => String(item).toLowerCase().includes('биограф') || String(item).toLowerCase().includes('over'))) {
    concerns.unshift(concern.message);
  }
  if (!evidence.includes(concern.evidence)) {
    evidence.unshift(concern.evidence);
  }

  return {
    ...audit,
    pass: false,
    concerns,
    evidence
  };
}

function detectPlayerSeedOverreach(dossierText, world) {
  const text = String(dossierText ?? '');
  const lower = text.toLowerCase();
  const patterns = [
    /\b1[0-9]{3}\b/u,
    /чёрн(?:ая|ой)\s+смерть/u,
    /черн(?:ая|ой)\s+смерть/u,
    /\bголод(?:а)?\s+1[0-9]{3}\b/u,
    /\bпосадник\b/u,
    /\bзмеевик\b/u,
    /\bмонастыр/u,
    /\bхутынск/u,
    /\bрусск(?:ая|ой)\s+правд/u,
    /\bумер(?:ла|ло|ли)?\b/u,
    /\bпостриг(?:ся|лась|ся)\b/u
  ];
  const matches = patterns.filter((pattern) => pattern.test(lower));
  const lineCount = splitTextLines(text).length;
  if (matches.length >= 2 || lineCount >= 8) {
    return {
      message: 'player_seed содержит слишком насыщенную биографию для стартового профиля',
      evidence: matches.length
        ? `Обнаружены специфические маркеры: ${matches.slice(0, 4).map((pattern) => pattern.source).join(' | ')}`
        : `Слишком много строк в dossier: ${lineCount}`
    };
  }

  const sourceHints = [
    String(world?.player?.startText ?? ''),
    String(world?.historicalFrame?.startTextHint ?? ''),
    String(world?.place?.name ?? ''),
    String(world?.place?.kind ?? '')
  ].join(' ').toLowerCase();
  const markerWords = ['черная смерть', 'чёрная смерть', 'голод 1252', 'голод 1262', 'посадник', 'змеевик', 'монастыр', 'русская правда'];
  const hasSpecificMarker = markerWords.some((item) => lower.includes(item));
  const sourceHasMarker = markerWords.some((item) => sourceHints.includes(item));
  if (hasSpecificMarker && !sourceHasMarker) {
    return {
      message: 'player_seed содержит исторические детали, не подтверждённые seed-входом',
      evidence: 'Детальная биография не опирается на исходный start text'
    };
  }

  return null;
}

function summarizePlayerSeedAuditFailure(audit) {
  const concerns = Array.isArray(audit?.concerns) ? audit.concerns.filter(Boolean) : [];
  const evidence = Array.isArray(audit?.evidence) ? audit.evidence.filter(Boolean) : [];
  const parts = [];
  if (concerns.length) parts.push(concerns.slice(0, 3).join('; '));
  if (evidence.length) parts.push(`evidence: ${evidence.slice(0, 2).join('; ')}`);
  return parts.length > 0 ? parts.join(' | ') : 'semantic audit rejected the player seed';
}

function normalizePlayerSeedShape(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }

  const normalized = { ...data };
  normalized.identity = normalizePlayerSeedIdentityBlock(data.identity);
  normalized.items = normalizePlayerSeedItemsBlock(data.items, data);
  normalized.property_and_access = normalizePlayerSeedPropertyAccessBlock(data.property_and_access, data, normalized.items);
  normalized.body = normalizePlayerSeedVitalsBlock(data.body);
  normalized.states = normalizePlayerSeedVitalsBlock(data.states);
  const position = normalizePlayerSeedPositionBlock(data.position ?? data.current_position);
  normalized.position = position;
  normalized.current_position = normalizePlayerSeedPositionBlock(data.current_position ?? data.position ?? position);
  if (data.attributes !== undefined) {
    normalized.attributes = normalizePlayerSeedNumericMap(data.attributes);
  }
  if (data.skill_bonuses !== undefined) {
    normalized.skill_bonuses = normalizePlayerSeedNumericMap(data.skill_bonuses);
  }
  for (const key of PLAYER_SEED_LIST_FIELDS) {
    if (key === 'inventory') {
      normalized.inventory = derivePlayerSeedInventory(data, normalized.items);
      continue;
    }
    if (key === 'property') {
      normalized.property = derivePlayerSeedProperty(data, normalized.items, normalized.property_and_access);
      continue;
    }
    normalized[key] = normalizePlayerSeedListValue(data[key]);
  }
  hydratePlayerSeedCompatibilityFields(normalized);
  return normalized;
}

function buildCanonicalPlayerSeedValidationTarget(seed) {
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
    return seed;
  }
  const target = { ...seed };
  delete target.inventory;
  delete target.property;
  return target;
}

function normalizePlayerSeedIdentityBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return block;
  }

  return {
    ...block,
    given_name: block.given_name ?? block.givenName ?? null,
    givenName: block.givenName ?? block.given_name ?? null,
    nickname: block.nickname ?? null,
    display_name: block.display_name ?? block.displayName ?? null,
    displayName: block.displayName ?? block.display_name ?? null,
    age_range: block.age_range ?? block.ageRange ?? null,
    ageRange: block.ageRange ?? block.age_range ?? null,
    social_status: block.social_status ?? block.socialStatus ?? null,
    socialStatus: block.socialStatus ?? block.social_status ?? null,
    occupation_or_role: block.occupation_or_role ?? block.occupationOrRole ?? null,
    occupationOrRole: block.occupationOrRole ?? block.occupation_or_role ?? null,
    visible_status: block.visible_status ?? block.visibleStatus ?? null,
    visibleStatus: block.visibleStatus ?? block.visible_status ?? null,
    true_status: block.true_status ?? block.trueStatus ?? null,
    trueStatus: block.trueStatus ?? block.true_status ?? null,
    reason_here: block.reason_here ?? block.reasonHere ?? null,
    reasonHere: block.reasonHere ?? block.reason_here ?? null
  };
}

function hydratePlayerSeedCompatibilityFields(seed) {
  if (!seed || typeof seed !== 'object') return seed;

  const identity = seed.identity && typeof seed.identity === 'object' ? seed.identity : {};
  const body = seed.body && typeof seed.body === 'object' ? seed.body : {};
  const states = seed.states && typeof seed.states === 'object' ? seed.states : {};
  const skillBonuses = seed.skill_bonuses && typeof seed.skill_bonuses === 'object' ? seed.skill_bonuses : {};

  seed.name = resolvePlayerSeedDisplayName(identity, seed.name);
  seed.role = preferPlayerSeedText(seed.role, identity.occupation_or_role, identity.occupationOrRole);
  seed.status = preferPlayerSeedText(seed.status, identity.visible_status, identity.visibleStatus, identity.social_status, identity.socialStatus);
  seed.socialClass = preferPlayerSeedText(seed.socialClass, identity.social_status, identity.socialStatus);
  seed.ageRange = preferPlayerSeedText(seed.ageRange, identity.age_range, identity.ageRange);
  seed.origin = preferPlayerSeedText(seed.origin, identity.origin);
  seed.visibleStatus = preferPlayerSeedText(seed.visibleStatus, identity.visible_status, identity.visibleStatus, identity.social_status, identity.socialStatus);
  seed.trueStatus = preferPlayerSeedText(seed.trueStatus, identity.true_status, identity.trueStatus);
  seed.reasonHere = preferPlayerSeedText(seed.reasonHere, identity.reason_here, identity.reasonHere);
  seed.occupation = preferPlayerSeedText(seed.occupation, identity.occupation_or_role, identity.occupationOrRole);
  seed.bodyState = preferPlayerSeedText(seed.bodyState, body.description, body.bodyState, body.body_state);
  seed.language = preferPlayerSeedText(seed.language, body.language);
  seed.literacy = preferPlayerSeedText(seed.literacy, body.literacy);
  seed.clothing = preferPlayerSeedText(seed.clothing, body.clothing);
  seed.skills = Array.isArray(seed.skills) && seed.skills.length > 0 ? seed.skills : deriveSkillLabelsFromBonuses(skillBonuses);

  const health = normalizePlayerSeedNumericValue(states.health, body.health);
  const satiety = normalizePlayerSeedNumericValue(states.satiety, body.satiety);
  const vigor = normalizePlayerSeedNumericValue(states.vigor, body.vigor);
  if (health !== null || satiety !== null || vigor !== null) {
    seed.states = {
      ...states,
      ...(health !== null ? { health } : {}),
      ...(satiety !== null ? { satiety } : {}),
      ...(vigor !== null ? { vigor } : {})
    };
    seed.body = {
      ...body,
      ...(health !== null ? { health } : {}),
      ...(satiety !== null ? { satiety } : {}),
      ...(vigor !== null ? { vigor } : {})
    };
  }

  seed.body = {
    ...seed.body,
    description: preferPlayerSeedText(seed.body?.description, seed.bodyState),
    clothing: preferPlayerSeedText(seed.body?.clothing, seed.clothing),
    visible_marks: Array.isArray(seed.body?.visible_marks) ? seed.body.visible_marks.slice() : normalizePlayerSeedListValue(seed.body?.visibleMarks),
    active_conditions: Array.isArray(seed.body?.active_conditions) ? seed.body.active_conditions.slice() : normalizePlayerSeedListValue(seed.body?.activeConditions)
  };

  const displayName = resolvePlayerSeedDisplayName(identity, seed.name);
  seed.identity = {
    ...identity,
    given_name: identity.given_name ?? identity.givenName ?? null,
    givenName: identity.givenName ?? identity.given_name ?? null,
    nickname: identity.nickname ?? null,
    display_name: displayName,
    displayName,
    name: displayName,
    age_range: preferPlayerSeedText(identity.age_range, seed.ageRange),
    ageRange: preferPlayerSeedText(identity.ageRange, seed.ageRange),
    origin: preferPlayerSeedText(identity.origin, seed.origin),
    social_status: preferPlayerSeedText(identity.social_status, seed.socialClass),
    socialStatus: preferPlayerSeedText(identity.socialStatus, seed.socialClass),
    occupation_or_role: preferPlayerSeedText(identity.occupation_or_role, seed.occupation ?? seed.role),
    occupationOrRole: preferPlayerSeedText(identity.occupationOrRole, seed.occupation ?? seed.role),
    visible_status: preferPlayerSeedText(identity.visible_status, seed.visibleStatus ?? seed.status),
    visibleStatus: preferPlayerSeedText(identity.visibleStatus, seed.visibleStatus ?? seed.status),
    true_status: preferPlayerSeedText(identity.true_status, seed.trueStatus),
    trueStatus: preferPlayerSeedText(identity.trueStatus, seed.trueStatus),
    reason_here: preferPlayerSeedText(identity.reason_here, seed.reasonHere),
    reasonHere: preferPlayerSeedText(identity.reasonHere, seed.reasonHere)
  };

  return seed;
}

function preferPlayerSeedText(current, ...candidates) {
  const currentText = String(current ?? '').trim();
  if (currentText) return current;
  for (const candidate of candidates) {
    const text = String(candidate ?? '').trim();
    if (text) return candidate;
  }
  return current;
}

function normalizePlayerSeedNumericValue(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function deriveSkillLabelsFromBonuses(skillBonuses = {}) {
  if (!skillBonuses || typeof skillBonuses !== 'object' || Array.isArray(skillBonuses)) return [];
  return Object.entries(skillBonuses)
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) !== 0)
    .map(([key]) => key);
}

function normalizePlayerSeedPositionBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return block;
  }
  return {
    region_id: normalizePlayerSeedPositionValue(block.region_id ?? block.regionId),
    place_id: normalizePlayerSeedPositionValue(block.place_id ?? block.placeId),
    location_id: normalizePlayerSeedPositionValue(block.location_id ?? block.locationId),
    minilocation_id: normalizePlayerSeedPositionValue(block.minilocation_id ?? block.minilocationId),
    anchor_id: normalizePlayerSeedPositionValue(block.anchor_id ?? block.anchorId),
    last_route_id: normalizePlayerSeedPositionValue(block.last_route_id ?? block.lastRouteId)
  };
}

function normalizePlayerSeedVitalsBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return block;
  }

  const normalized = { ...block };
  for (const key of ['health', 'satiety', 'vigor']) {
    const value = normalized[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'number' && Number.isFinite(value)) continue;
    if (typeof value === 'string') {
      const parsed = Number(value.trim().replace(',', '.'));
      if (Number.isFinite(parsed)) {
        normalized[key] = parsed;
      }
    }
  }
  return normalized;
}

function normalizePlayerSeedPositionValue(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizePlayerSeedNumericMap(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    return block;
  }

  const normalized = { ...block };
  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === 'number' && Number.isFinite(value)) continue;
    if (typeof value !== 'string') continue;
    const parsed = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) {
      normalized[key] = parsed;
    }
  }
  return normalized;
}

function normalizePlayerSeedListValue(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizePlayerSeedListValue(item)).filter(Boolean).slice(0, 8);
  }

  const text = String(value).trim();
  if (!text) return [];

  const splitByNewline = text.split(/\r?\n+/u).map((item) => item.trim()).filter(Boolean);
  if (splitByNewline.length > 1) {
    return splitByNewline.slice(0, 8);
  }

  if (/[;•]/u.test(text)) {
    return text.split(/[;•]+/u).map((item) => item.trim()).filter(Boolean).slice(0, 8);
  }

  if (text.includes(',') && !/[.!?៖:]/u.test(text)) {
    const parts = text.split(',').map((item) => item.trim()).filter(Boolean);
    if (parts.length > 1) {
      return parts.slice(0, 8);
    }
  }

  return [text];
}

function normalizePlayerSeedItemsBlock(items, source = {}) {
  const ownerId = source.identity?.id ?? source.position?.actor_id ?? 'player';
  const hasCanonicalItems = items && typeof items === 'object' && !Array.isArray(items);
  if (!hasCanonicalItems) {
    const legacyInventoryLabels = normalizePlayerSeedListValue(source.inventory);
    const legacyPropertyLabels = normalizePlayerSeedListValue(source.property);
    const carried_items = normalizeItemList(legacyInventoryLabels, {
      ownerId,
      holderId: ownerId,
      placement: 'carried'
    });
    const property_not_carried = normalizeItemList(legacyPropertyLabels, {
      ownerId,
      holderId: null,
      placement: 'property'
    });
    return {
      carried_items,
      equipment: [],
      weapons: [],
      armor: [],
      property_not_carried,
      borrowed_items: [],
      foreign_items_with_character: []
    };
  }

  return {
    ...items,
    carried_items: normalizeItemList(items.carried_items, {
      ownerId,
      holderId: ownerId,
      placement: 'carried'
    }),
    equipment: normalizeItemList(items.equipment, {
      ownerId,
      holderId: ownerId,
      placement: 'carried'
    }),
    weapons: normalizeItemList(items.weapons, {
      ownerId,
      holderId: ownerId,
      placement: 'carried'
    }),
    armor: normalizeItemList(items.armor, {
      ownerId,
      holderId: ownerId,
      placement: 'carried'
    }),
    property_not_carried: normalizeItemList(items.property_not_carried, {
      ownerId,
      holderId: null,
      placement: 'property'
    }),
    borrowed_items: normalizeItemList(items.borrowed_items, {
      ownerId: null,
      holderId: ownerId,
      placement: 'borrowed'
    }),
    foreign_items_with_character: normalizeItemList(items.foreign_items_with_character, {
      ownerId: null,
      holderId: ownerId,
      placement: 'held_for_others'
    })
  };
}

function normalizePlayerSeedPropertyAccessBlock(propertyAndAccess, source = {}, normalizedItems = null) {
  const ownerId = source.identity?.id ?? source.position?.actor_id ?? 'player';
  const hasCanonicalPropertyAccess = propertyAndAccess && typeof propertyAndAccess === 'object' && !Array.isArray(propertyAndAccess);
  const base = hasCanonicalPropertyAccess ? propertyAndAccess : {};
  const canonicalProperty = Array.isArray(normalizedItems?.property_not_carried) ? normalizedItems.property_not_carried : [];

  return {
    ...base,
    property_not_carried: normalizePlayerSeedListValue(base.property_not_carried?.length ? base.property_not_carried : canonicalProperty.map((item) => item.label ?? item.name ?? item.title ?? item.id ?? '')),
    borrowed_items: normalizePlayerSeedListValue(base.borrowed_items),
    foreign_items_with_character: normalizePlayerSeedListValue(base.foreign_items_with_character),
    accessible_resources: normalizePlayerSeedListValue(base.accessible_resources),
    owner_id: base.owner_id ?? ownerId,
    holder_id: base.holder_id ?? ownerId
  };
}

function derivePlayerSeedInventory(source = {}, normalizedItems = null) {
  if (Array.isArray(normalizedItems?.carried_items) && normalizedItems.carried_items.length > 0) {
    return normalizedItems.carried_items.map((item) => seedItemLabel(item)).filter(Boolean);
  }
  return normalizePlayerSeedListValue(source.inventory);
}

function derivePlayerSeedProperty(source = {}, normalizedItems = null, normalizedPropertyAccess = null) {
  const propertyFromItems = Array.isArray(normalizedItems?.property_not_carried) ? normalizedItems.property_not_carried : [];
  if (propertyFromItems.length > 0) {
    return propertyFromItems.map((item) => seedItemLabel(item)).filter(Boolean);
  }
  const propertyFromAccess = Array.isArray(normalizedPropertyAccess?.property_not_carried) ? normalizedPropertyAccess.property_not_carried : [];
  if (propertyFromAccess.length > 0) {
    return propertyFromAccess.slice();
  }
  return normalizePlayerSeedListValue(source.property);
}

function seedItemLabel(item) {
  if (!item || typeof item !== 'object') return String(item ?? '').trim();
  return String(item.label ?? item.name ?? item.title ?? item.id ?? '').trim();
}

function buildSocialTissueDossierMessages(world, previousAudit = null) {
  return [
    {
      role: 'system',
      content: [
        'Ты LLM для социальной ткани исторической RPG XIII века.',
        promptDesignDocs('social_tissue'),
        'Твоя задача - описать только конкретную социальную структуру: семьи, власть, зависимых людей, ремёсла, торговлю, слухи, напряжения, ритм и ограничения доступа.',
        'Пиши сухо и предметно: факты, связи, обязанности, причины. Без художественной сцены, метафор, эмоций и атмосферной прозы.',
        'Не придумывай лишних NPC: нужны социальные роли, домохозяйства и группы, а не драматические персонажи.',
        'Если в месте есть двор, корчма или торговый двор, не смешивай formalOwner, actualManager и dependentGroups: назови их раздельно, если это не один и тот же человек или группа.',
        'Если place_seed уже зафиксировал formalOwner, treat that value as fixed: do not reassign it in social_tissue.',
        'Social_tissue may elaborate who manages the place and who depends on it, but the formal owner must stay the same unless the audit explicitly contradicts place_seed.',
        'Жёстко держи выбранную историческую рамку: год, сезон и регион из входного контекста важнее любых фоновых пакетов.',
        'Не импортируй дороги, события, правителей, битвы и риски из другого года или региона.',
        'Верни только компактный структурный dossier обычным текстом без JSON, markdown и списков.',
        'После проверки этот смысл будет упакован в JSON другим агентом.'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        'Pipeline stage: social_tissue',
        `Историческая рамка: ${world.historicalFrame?.regionName ?? world.region?.name ?? 'не предоставлено'} / ${world.historicalFrame?.year ?? world.history?.year ?? 'не указано'} / ${world.historicalFrame?.season ?? world.history?.season ?? 'не указано'}`,
        `Исторический пакет: ${world.historical?.packId ?? 'не предоставлено'} / ${world.historical?.year ?? 'не указано'} / ${world.historical?.regionHint ?? 'не предоставлено'}`,
        `Место: ${world.place?.name ?? 'не предоставлено'} (${world.place?.kind ?? 'не указано'})`,
        `Place seed formalOwner: ${world.placeSeed?.formalOwner ?? 'не предоставлено'}`,
        `Place seed actualManager: ${world.placeSeed?.actualManager ?? 'не предоставлено'}`,
        `Place seed dependentGroups: ${(world.placeSeed?.dependentGroups ?? []).slice(0, 4).join(' | ') || 'не предоставлено'}`,
        `Place seed access: ${(world.placeSeed?.accessRules ?? []).slice(0, 3).join(' | ') || 'не предоставлено'}`,
        `Региональное резюме: ${world.historical?.regionalContext?.current?.name ?? 'не предоставлено'}`,
        `Ограничения мира: ${(world.historical?.behavioralRules ?? []).slice(0, 4).join(' | ') || 'не предоставлено'}`,
        `Видимое давление места: ${(world.scene?.pressure ?? []).slice(0, 4).join(' | ') || 'не предоставлено'}`,
        previousAudit ? `Замечания прошлого аудита для исправления: ${summarizeSocialTissueAuditFailure(previousAudit)}` : 'Замечания прошлого аудита: отсутствуют',
        'Опиши только конкретные семьи и группы, формального владельца, фактического управляющего, зависимые группы, торговлю, хождение слухов, напряжения, обязательства, ритм и правила доступа.'
      ].join('\n')
    }
  ];
}

function buildSocialTissueAuditMessages(world, dossierText) {
  return [
    {
      role: 'system',
      content: buildSemanticAuditSystemContent('social_tissue', [
        'Проверь настоящие ошибки: несовместимый год или регион, чужие события и дороги, невозможную социальную структуру, нарушение причинности и лишнюю всеведущую конкретику.',
        'Если social_tissue расходится с place_seed по formalOwner, actualManager или dependentGroups, это структурная ошибка, а не просто стилистика.',
        'Неполнота, историческая неопределённость и нехватка второстепенной конкретики не должны валить pass.',
        'Если проблема только в недосказанности, pass должен быть true, а замечание нужно пометить как uncertainty или soft concern.',
        'Если dossier протаскивает данные из другого исторического пакета, pass должен быть false.'
      ], 'social_tissue')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_audit',
        kind: 'social_tissue',
        dossier: dossierText,
        world: {
          region: world.historicalFrame?.regionName ?? world.region?.name ?? null,
          place: world.place?.name ?? null,
          year: world.historicalFrame?.year ?? world.history?.year ?? null,
          season: world.historicalFrame?.season ?? world.history?.season ?? null,
          historicalPack: {
            id: world.historical?.packId ?? null,
            year: world.historical?.year ?? null,
            regionHint: world.historical?.regionHint ?? null
          },
          placeSeed: {
            formalOwner: world.placeSeed?.formalOwner ?? null,
            actualManager: world.placeSeed?.actualManager ?? null,
            dependentGroups: Array.isArray(world.placeSeed?.dependentGroups) ? world.placeSeed.dependentGroups.slice(0, 4) : []
          },
          knownPower: Array.isArray(world.region?.politics) ? world.region.politics.slice(0, 4) : [],
          knownEconomy: Array.isArray(world.region?.economy) ? world.region.economy.slice(0, 4) : [],
          knownTensions: Array.isArray(world.region?.tensions) ? world.region.tensions.slice(0, 4) : []
        }
      })
    }
  ];
}

function buildSocialTissueRepairMessages(world, dossierText, audit) {
  return [
    {
      role: 'system',
      content: [
        'Ты SemanticDossierRepairer для social_tissue исторической RPG XIII века.',
        'Верни только исправленный компактный dossier без JSON, markdown и списков.',
        'Твоя задача - точечно исправить dossier по конкретным замечаниям аудита, не переписывая смысл с нуля.',
        'Сохрани families, formalOwner, actualManager, dependentGroups, trade, rumors, tensions, obligations, rhythm и access rules, если они не противоречат аудиту.',
        'Если place_seed уже дал formalOwner, не переучреждай право собственности: оставь formalOwner fixed, а меняй только actualManager и dependentGroups при необходимости.',
        'Жёстко держи год, сезон и регион из входного контекста.',
        'Удали или замени социальные связи, события, дороги и риски, если они пришли из несовместимого исторического пакета.',
        'Не добавляй художественную сцену и не создавай новых NPC сверх необходимого для снятия audit concerns.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_dossier_repair',
        kind: 'social_tissue',
        frame: {
          region: world.historicalFrame?.regionName ?? world.region?.name ?? null,
          year: world.historicalFrame?.year ?? world.history?.year ?? null,
          season: world.historicalFrame?.season ?? world.history?.season ?? null,
          historicalPack: {
            id: world.historical?.packId ?? null,
            year: world.historical?.year ?? null,
            regionHint: world.historical?.regionHint ?? null
          }
        },
        place: {
          name: world.place?.name ?? null,
          kind: world.place?.kind ?? null
        },
        dossier: dossierText,
        audit
      })
    }
  ];
}

function buildSocialTissueShapeMessages(world, dossierText, audit, retryInstruction = '', previousSocialTissue = null, validationErrors = []) {
  const outputContract = buildSocialTissueOutputContract();
  const canonicalExample = getSocialTissueCanonicalExample();
  return [
    {
      role: 'system',
      content: buildStructuredShapePromptHeader({
        role: 'Ты — SocialTissueShaper для исторической RPG XIII века.',
        task: 'Собери новый объект social_tissue из утверждённого смысла.',
        sources: 'Используй frame, placeSeed, audit и dossierText как ограничение.',
        facts: 'Не придумывай новых людей или событий и не меняй смысл.',
        visible: 'Разделяй formalOwner, actualManager, dependentGroups, families, trade, rumors, tensions, obligations, accessRules и rhythm.',
        hidden: 'Не тащи скрытые связи и не копируй sourceDossier целиком.',
        constraints: 'JSON object only; sourceDossier нельзя возвращать как root-ключ; год, регион и сезон фиксированы входом.',
        format: 'Формат ответа: строгий JSON без markdown и без пояснений.',
        criteria: 'Данные должны быть компактными и пригодными для дальнейшей упаковки.',
        extra: [
          'Типы и вложенная структура берутся только из outputContract.',
          'Каждое поле families, dependentGroups, trade, rumors, tensions, obligations, accessRules — массив строк string[].',
          'Запрещены объекты с visibility/source в массивах фактов.',
          'Поля formalOwner, actualManager и rhythm обязаны быть строками.',
          'Запрещённые root-keys: frame, sourceDossier, audit, contract, notes, raw, explanation.',
          'Сохраняй выбранный год, регион и сезон как ограничение; не подтягивай чужой history pack.',
          'Если есть retryInstruction, следуй ему буквально.',
          ...buildSocialTissueAntiRegressionRules().map((rule) => `- ${rule}`)
        ]
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        frame: {
          region: world.historicalFrame?.regionName ?? world.region?.name ?? null,
          year: world.historicalFrame?.year ?? world.history?.year ?? null,
          season: world.historicalFrame?.season ?? world.history?.season ?? null,
          historicalPack: {
            id: world.historical?.packId ?? null,
            year: world.historical?.year ?? null,
            regionHint: world.historical?.regionHint ?? null
          }
        },
        placeSeed: {
          placeName: world.placeSeed?.placeName ?? null,
          placeKind: world.placeSeed?.placeKind ?? null,
          formalOwner: world.placeSeed?.formalOwner ?? null,
          actualManager: world.placeSeed?.actualManager ?? null,
          dependentGroups: Array.isArray(world.placeSeed?.dependentGroups) ? world.placeSeed.dependentGroups.slice(0, 4) : [],
          accessRules: Array.isArray(world.placeSeed?.accessRules) ? world.placeSeed.accessRules.slice(0, 4) : [],
          hazards: Array.isArray(world.placeSeed?.hazards) ? world.placeSeed.hazards.slice(0, 4) : []
        },
        audit,
        sourceDossier: dossierText,
        retryInstruction,
        previousSocialTissue,
        validationErrors,
        outputContract,
        canonicalExample,
        outputRules: {
          allowedRootKeys: outputContract.allowedRootKeys,
          forbiddenRootKeys: ['frame', 'sourceDossier', 'audit', 'contract', 'notes', 'raw', 'explanation'],
          schema: 'social_tissue',
          version: 1
        }
      })
    }
  ];
}

function buildSocialTissueContractRepairMessages(world, dossierText, audit, validationErrors = [], previousSocialTissue = null) {
  const outputContract = buildSocialTissueOutputContract();
  const canonicalExample = getSocialTissueCanonicalExample();
  return [
    {
      role: 'system',
      content: [
        'Ты SocialTissueRepairer для исторической RPG XIII века.',
        'Верни полный исправленный JSON object social_tissue.',
        'Исправь все validationErrors одновременно.',
        'Массивы фактов — только string[].',
        ...buildSocialTissueAntiRegressionRules().map((rule) => `- ${rule}`)
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'social_tissue_repair',
        dossier: dossierText,
        audit,
        previousSocialTissue,
        validationErrors,
        outputContract,
        canonicalExample
      })
    }
  ];
}

function buildVisibleContextContractRepairMessages(input, dossierText, audit, validationErrors = [], previousPackage = null) {
  const outputContract = buildVisibleContextOutputContract();
  const canonicalExample = getVisibleContextCanonicalExample();
  return [
    {
      role: 'system',
      content: [
        'Ты VisibleContextRepairer для visible_context_package исторической RPG XIII века.',
        'Верни полный исправленный JSON object visible_context_package.',
        'Исправь все validationErrors одновременно.',
        'Только видимый слой; без hidden, audit, dossier, state_delta.',
        ...buildVisibleContextAntiRegressionRules().map((rule) => `- ${rule}`)
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'visible_context_package_repair',
        dossier: dossierText,
        audit,
        input,
        previousPackage,
        validationErrors,
        outputContract,
        canonicalExample
      })
    }
  ];
}

function buildSocialTissueRequestSections(world) {
  return [
    section('Рамка', [
      `Регион: ${world.historicalFrame?.regionName ?? world.region?.name ?? 'не предоставлено'}`,
      `Год: ${world.historicalFrame?.year ?? world.history?.year ?? 'не указано'}`,
      `Сезон: ${world.historicalFrame?.season ?? world.history?.season ?? 'не указано'}`
    ]),
    section('Место', [
      `Место: ${world.place?.name ?? 'не предоставлено'}`,
      `Kind: ${world.place?.kind ?? 'не предоставлено'}`,
      `Formal owner: ${world.placeSeed?.formalOwner ?? 'не предоставлено'}`,
      `Actual manager: ${world.placeSeed?.actualManager ?? 'не предоставлено'}`,
      `Dependent groups: ${(world.placeSeed?.dependentGroups ?? []).slice(0, 4).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function buildSocialTissueAuditRequestSections(world) {
  return [
    section('Ограничения', [
      `Регион: ${world.region?.name ?? 'не предоставлено'}`,
      `Право: ${(world.historical?.behavioralRules ?? []).slice(0, 3).join(' | ') || 'не предоставлено'}`
    ]),
    section('Место', [
      `Место: ${world.place?.name ?? 'не предоставлено'}`,
      `Давление: ${(world.scene?.pressure ?? []).slice(0, 3).join(' | ') || 'не предоставлено'}`,
      `Place seed formalOwner: ${world.placeSeed?.formalOwner ?? 'не предоставлено'}`,
      `Place seed actualManager: ${world.placeSeed?.actualManager ?? 'не предоставлено'}`,
      `Place seed dependentGroups: ${(world.placeSeed?.dependentGroups ?? []).slice(0, 4).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function buildSocialTissueShapeRequestSections(world) {
  return [
    section('Schema', [
      'social_tissue',
      'families / formalOwner / actualManager / dependentGroups',
      'trade / rumors / tensions / obligations / rhythm / accessRules'
    ]),
    section('Context', [
      `Место: ${world.place?.name ?? 'не предоставлено'}`,
      `Регион: ${world.region?.name ?? 'не предоставлено'}`,
      `Формальный владелец seed места: ${world.placeSeed?.formalOwner ?? 'не предоставлено'}`,
      `Фактический управляющий seed места: ${world.placeSeed?.actualManager ?? 'не предоставлено'}`,
      `Зависимые группы seed места: ${(world.placeSeed?.dependentGroups ?? []).slice(0, 4).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function buildSocialTissueResponseSections(parsed) {
  if (!parsed) return [];
  return [
    section('Ткань', [
      `formalOwner=${parsed.formalOwner ?? 'не предоставлено'}`,
      `actualManager=${parsed.actualManager ?? 'не предоставлено'}`,
      `dependentGroups=${Array.isArray(parsed.dependentGroups) ? parsed.dependentGroups.join(' | ') : 'не предоставлено'}`,
      `rhythm=${parsed.rhythm ?? 'не предоставлено'}`
    ]),
    section('Семьи', Array.isArray(parsed.families) ? parsed.families.slice(0, 4) : []),
    section('Торговля', Array.isArray(parsed.trade) ? parsed.trade.slice(0, 4) : []),
    section('Слухи', Array.isArray(parsed.rumors) ? parsed.rumors.slice(0, 4) : [])
  ];
}

function buildSocialTissueAuditResponseSections(audit) {
  return [
    section('Audit', [
      `pass=${audit?.pass}`,
      `concerns=${audit?.concerns?.slice(0, 4).join(' | ') || 'не предоставлено'}`,
      `evidence=${audit?.evidence?.slice(0, 4).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function summarizeSocialTissueAuditFailure(audit) {
  const concerns = Array.isArray(audit?.concerns) ? audit.concerns.filter(Boolean) : [];
  const evidence = Array.isArray(audit?.evidence) ? audit.evidence.filter(Boolean) : [];
  const parts = [];
  if (concerns.length) parts.push(concerns.slice(0, 3).join('; '));
  if (evidence.length) parts.push(`evidence: ${evidence.slice(0, 2).join('; ')}`);
  return parts.length > 0 ? parts.join(' | ') : 'semantic audit rejected the social tissue';
}

function parseSocialTissueResponse(text) {
  return validateSocialTissue(parseJsonObject(text));
}

function summarizeOwnershipStructure(formalOwner, actualManager, dependentGroups = []) {
  const parts = [];
  if (formalOwner) parts.push(`formal owner: ${formalOwner}`);
  if (actualManager) parts.push(`actual manager: ${actualManager}`);
  if (Array.isArray(dependentGroups) && dependentGroups.length) {
    parts.push(`dependent groups: ${dependentGroups.join(', ')}`);
  }
  return parts.length ? parts.join('; ') : null;
}

function canonicalizeSocialTissueStructure(data, placeSeed = null) {
  if (!data || typeof data !== 'object') return data;
  const formalOwner = String(placeSeed?.formalOwner ?? data.formalOwner ?? data.ownership ?? '').trim();
  const actualManager = String(placeSeed?.actualManager ?? data.actualManager ?? '').trim();
  const dependentGroups = Array.isArray(placeSeed?.dependentGroups)
    ? placeSeed.dependentGroups.slice()
    : (Array.isArray(data.dependentGroups) ? data.dependentGroups.slice() : (Array.isArray(data.dependents) ? data.dependents.slice() : []));
  return {
    ...data,
    formalOwner: formalOwner || null,
    actualManager: actualManager || null,
    dependentGroups,
    powerStructure: summarizeOwnershipStructure(formalOwner || null, actualManager || null, dependentGroups),
    dependents: dependentGroups.slice()
  };
}

function summarizeKnowledgeBubbleForPrompt(knowledge) {
  if (!knowledge || typeof knowledge !== 'object') return 'не предоставлено';
  const parts = [];
  if (knowledge.fact?.location?.name) parts.push(`факт=${knowledge.fact.location.name}`);
  if (Array.isArray(knowledge.perception?.visibleTraces) && knowledge.perception.visibleTraces.length) {
    parts.push(`видимое=${knowledge.perception.visibleTraces.length}`);
  }
  if (Array.isArray(knowledge.player?.memory) && knowledge.player.memory.length) {
    parts.push(`память=${knowledge.player.memory.length}`);
  }
  if (Array.isArray(knowledge.testimony) && knowledge.testimony.length) {
    parts.push(`свидетели=${knowledge.testimony.length}`);
  }
  if (Array.isArray(knowledge.rumor) && knowledge.rumor.length) {
    parts.push(`слухи=${knowledge.rumor.length}`);
  }
  return parts.length ? parts.join('; ') : 'пусто';
}

function summarizeSourceLogForPrompt(sourceLog) {
  if (!Array.isArray(sourceLog) || sourceLog.length === 0) return 'не предоставлено';
  const parts = [];
  for (const entry of sourceLog.slice(0, 4)) {
    if (!entry || typeof entry !== 'object') continue;
    const status = String(entry.status ?? 'неизвестно').trim();
    const sourceCount = Array.isArray(entry.sources) ? entry.sources.length : 0;
    const usedInCount = Array.isArray(entry.usedIn) ? entry.usedIn.length : 0;
    parts.push(`${status}${sourceCount ? `; sources=${sourceCount}` : ''}${usedInCount ? `; usedIn=${usedInCount}` : ''}`);
  }
  return parts.length ? parts.join(' | ') : 'пусто';
}

function buildMasterDossierMessages(frame, localOutcome) {
  return [
    {
      role: 'system',
      content: [
        '# Роль',
        'Ты — ведущий игры исторической RPG XIII века.',
        '# Задача',
        'Сделай сухой semantic dossier по текущему ходу и не смешивай его с художественной прозой.',
        '# Доступные источники',
        'Используй только уже установленные факты партии, видимый контекст, историческую рамку и краткую карту знания.',
        promptDesignDocs('master_narrative'),
        '# Уже установленные факты партии',
        'Не отменяй сохранённые факты, ограничения, последствия и ранее подтверждённые события.',
        '# Знания персонажа',
        'Ориентируйся на то, что персонаж знает, видел, слышал или может безопасно предполагать.',
        '# Видимый контекст',
        'Показывай только наблюдаемое, слышимое, телесно ощущаемое и социально видимое.',
        '# Скрытая информация',
        'Скрытые мотивы, будущие события и внутренние флаги не раскрывай.',
        '# Ограничения',
        'Без JSON, без markdown-таблиц, без художественной прозы, без лишней уверенности и без hidden truth as visible fact.',
        '# Формат ответа',
        'Связный сухой разбор в прозе, без списков и без технических артефактов.',
        '# Критерии успеха',
        'Текст должен описывать только видимый смысл хода, его причины, последствия, социальный результат и допустимую неопределённость.'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `Pipeline stage: semantic_dossier`,
        'Write a dry semantic dossier only: visible facts, causes, consequences, constraints. No literary scene prose.',
        'Do not output JSON, code blocks, markdown tables, literary flourishes, or bullet lists unless they are necessary for clarity.',
        'Describe only the утверждённый смысл of the visible master step: scene, visible pressures, social consequences, and likely outcome.',
        'Do not present hidden truth as visible fact.',
        'Do not invent convenient certainty where the world is uncertain.',
        'The result will later be checked and then shaped into JSON by another agent.',
        `Ввод игрока: ${frame.input}`,
        `Текущий интент: ${frame.intent.type}`,
        `Локация мира: ${frame.world.location.name}`,
        `Социальное состояние: trace=${frame.world.social.trace ?? 'не предоставлено'}, suspicion=${frame.world.social.suspicion}`,
        frame.historical.regionalContext?.current
          ? `Сводка региона: ${frame.historical.regionalContext.current.name}; landscape=${frame.historical.regionalContext.current.landscape?.[0] ?? 'не предоставлено'}; economy=${frame.historical.regionalContext.current.economy?.[0] ?? 'не предоставлено'}; power=${frame.historical.regionalContext.current.power?.[0] ?? 'не предоставлено'}`
          : 'Сводка региона: отсутствует',
        `Ограничения: ${joinList(frame.constraints)}`,
        `Риски: ${joinList(frame.risks)}`,
        `Возможные эффекты: ${joinList(frame.possibleEffects)}`,
        `Реконструкция пути: ${frame.world.travel?.routeReconstruction?.summary ?? 'не предоставлено'}`,
        `Архив путей: ${joinList((frame.world.travel?.routeArchive ?? []).map((item) => item.summary))}`,
        `Журнал источников: ${summarizeSourceLogForPrompt(frame.historical?.sourceLog)}`,
        `Медицинский контекст: ${joinList(frame.world.medical?.context)}`,
        frame.riskAudit
          ? `Аудит риска: required=${frame.riskAudit.required}, reason=${frame.riskAudit.reason}, factors=${joinList(frame.riskAudit.factors)}`
          : 'Аудит риска: в ожидании.',
        `Карта знания: ${summarizeKnowledgeBubbleForPrompt(frame.world.knowledge)}`,
        `Детерминированная проверка: ${frame.check?.required ? `d20=${frame.check.roll ?? 'pending'}, modifier=${frame.check.modifier}, DC=${frame.check.dc}, degree=${frame.check.degree}.` : 'не требуется.'}`,
        `Локальный итог, уже вычисленный миром: ${localOutcome}`,
        'Dossier должен звучать как разбор живого наблюдателя: что происходит, что видно и каков вероятный социальный результат.'
      ].join('\n')
    }
  ];
}

function buildMasterAuditMessages(frame, dossierText, localOutcome) {
  return [
    {
      role: 'system',
      content: buildSemanticAuditSystemContent('master-хода исторической RPG XIII века', [
        'Проверь историчность, причинность, видимость, право, статус, физику и отсутствие всеведущей информации.',
        'Если игрок назвал роль или должность, а не точное имя, допускай местного носителя этой роли или ближайший социальный прокси, если это правдоподобно.',
        'Отсутствие точного имени в сцене само по себе не делает ход невалидным, если мир честно отвечает через присутствующих людей или через отказ с последствиями.',
        'Если есть сомнения, pass должен быть false.'
      ], 'master_narrative')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_audit',
        kind: 'master',
        input: frame.input,
        intent: frame.intent?.type,
        localOutcome,
        dossier: dossierText,
        world: {
          era: frame.historical?.era,
          year: frame.historical?.year,
          season: frame.historical?.season,
          region: frame.historical?.regionHint,
          location: frame.world?.location?.name,
          socialTrace: frame.world?.social?.trace,
          witnesses: frame.world?.social?.witnesses ?? []
        }
      })
    }
  ];
}

function buildMasterShapeMessages(frame, dossierText, audit, localOutcome, retryInstruction = '', previousMasterNarrative = null, validationErrors = []) {
  const outputContract = buildMasterNarrativeOutputContract();
  const canonicalExample = getMasterNarrativeCanonicalExample();
  return [
    {
      role: 'system',
      content: buildStructuredShapePromptHeader({
        role: 'Ты — MasterNarrativeShaper для master-хода исторической RPG XIII века.',
        task: 'Собери новый объект master_narrative из утверждённого смысла.',
        sources: 'Опирайся на sourceDossier, audit и localOutcome как на входные данные, но не добавляй historical_audit: он уже утверждён внешней проверкой.',
        facts: 'Если named target отсутствует, можно описать честный социальный proxy, местного старшего или отказ в ответе, но не ломай контракт. Если сведений нет, заполни их явным отсутствием сведений.',
        visible: 'Сохраняй только видимый, локальный и причинно связанный смысл сцены.',
        hidden: 'Не придумывай новые факты и не раскрывай лишнее из audit или sourceDossier.',
        constraints: 'Типы и вложенная структура берутся только из outputContract. state_delta не вводит неутверждённых npc id или фактов без одобрения frame/social layer.',
        format: 'Верни только строгий JSON object без markdown, без пояснений и без prose.',
        criteria: 'Ответ остаётся причинно связным, локальным и согласованным с утверждённым dossier.',
        extra: [
          'visible_details и npc_reactions — string[] only.',
          'state_delta: patch only approved handles; no new npc ids without frame approval.',
          'Запрещённые root-ключи: input, intent, localOutcome, audit, sourceDossier, contract, notes, raw, explanation.',
          'Если есть retryInstruction, следуй ему буквально.',
          ...buildMasterNarrativeAntiRegressionRules().map((rule) => `- ${rule}`)
        ]
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        sourceDossier: dossierText,
        input: frame.input,
        intent: frame.intent?.type,
        localOutcome,
        audit,
        retryInstruction,
        previousMasterNarrative,
        validationErrors,
        outputContract,
        canonicalExample,
        outputRules: {
          allowedRootKeys: outputContract.allowedRootKeys,
          forbiddenRootKeys: ['input', 'intent', 'localOutcome', 'audit', 'sourceDossier', 'contract', 'notes', 'raw', 'explanation'],
          schema: 'master_narrative',
          version: 1
        }
      })
    }
  ];
}

function buildMasterNarrativeContractRepairMessages(frame, localOutcome, dossierText, audit, validationErrors = [], previousMasterNarrative = null) {
  const outputContract = buildMasterNarrativeOutputContract();
  const canonicalExample = getMasterNarrativeCanonicalExample();
  return [
    {
      role: 'system',
      content: [
        'Ты MasterNarrativeRepairer для master-хода исторической RPG XIII века.',
        'Верни полный исправленный JSON object master_narrative.',
        'Исправь все validationErrors одновременно.',
        'Не перезапускай dossier/audit; сохраняй утверждённый смысл.',
        'state_delta не вводит неутверждённых npc id или фактов без одобрения frame/social layer.',
        ...buildMasterNarrativeAntiRegressionRules().map((rule) => `- ${rule}`)
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'master_narrative_repair',
        input: frame.input,
        intent: frame.intent?.type,
        localOutcome,
        dossier: dossierText,
        audit,
        previousMasterNarrative,
        validationErrors,
        outputContract,
        canonicalExample
      })
    }
  ];
}

function buildMasterNarrativeUpstreamRepairMessages(
  frame,
  localOutcome,
  previousMasterNarrative,
  recoveryRoute,
  repairHistory = []
) {
  const outputContract = buildMasterNarrativeOutputContract();
  const canonicalExample = getMasterNarrativeCanonicalExample();
  return [
    {
      role: 'system',
      content: [
        'Ты MasterNarrativeRecoveryRepairer для исторической RPG XIII века.',
        'Верни полный исправленный JSON object master_narrative.',
        'Исправь только upstream-конфликт. Не создавай нового NPC из prose.',
        'master_narrative text is never a source of truth for NPC creation.',
        'Если видимый NPC не approved, убери или обобщи npc_reactions и next_pressure без создания нового source.',
        'npc_reaction_refs допустимы только для already approved actor_ref.',
        'Не добавляй новые gate, route, anchor, occupant, npc identity.',
        'Если нужен несуществующий approved fact, не выдумывай его.',
        ...buildMasterNarrativeAntiRegressionRules().map((rule) => `- ${rule}`)
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'master_narrative_upstream_repair',
        input: frame?.input ?? null,
        intent: frame?.intent?.type ?? null,
        localOutcome,
        previousMasterNarrative,
        recoveryRoute,
        repairHistory,
        forbiddenChanges: [
          'do not add npc_reactions for unapproved actors',
          'do not create new NPC identity from prose',
          'do not create gate/route/anchor/occupant absent from approved input'
        ],
        outputContract,
        canonicalExample
      })
    }
  ];
}

function buildRiskAuditMessages(frame) {
  return [
    {
      role: 'system',
      content: buildStructuredShapePromptHeader({
        role: 'Ты проводишь предварительный аудит риска для исторической RPG XIII века.',
        task: 'Реши, нужна ли вообще проверка, и объясни почему с точки зрения историчности, физики, видимости, права, статуса, свидетелей и причинности.',
        sources: 'Опирайся на input, intent, контекст мира, ограничения, риски и возможные эффекты.',
        facts: 'Не рассчитывай d20 и не меняй результат: только оцени, требуется ли проверка, и какие факторы на неё влияют.',
        visible: 'Если ситуация слишком бытовая или очевидная, required может быть false. Если есть риск, давление закона, конфликт, скрытое действие, видимые свидетели, дорожная неопределённость или физическая неопределённость, required обычно true.',
        hidden: 'Не выдумывай дополнительных фактов и не подменяй оценку общими рассуждениями.',
        constraints: 'Если не хватает информации, предпочитай conservative true. Верни только строгий JSON без markdown и без пояснений.',
        format: 'Формат: version=1, schema=risk_audit, required (boolean), reason (string), factors (array of strings), complexity (string), visibility (string).',
        criteria: 'Ответ должен быть консервативным, объяснимым и полезным для дальнейшего выбора геймплейной проверки.'
      })
    },
    {
      role: 'user',
      content: [
        `version: 1`,
        `schema: risk_audit`,
        `Ввод игрока: ${frame.input}`,
        `Текущий интент: ${frame.intent.type}`,
        `Локация мира: ${frame.world.location.name}`,
        `Социальное состояние: trace=${frame.world.social.trace ?? 'не предоставлено'}, suspicion=${frame.world.social.suspicion}`,
        frame.historical.regionalContext?.current
          ? `Сводка региона: ${frame.historical.regionalContext.current.name}; landscape=${frame.historical.regionalContext.current.landscape?.[0] ?? 'не предоставлено'}; economy=${frame.historical.regionalContext.current.economy?.[0] ?? 'не предоставлено'}; power=${frame.historical.regionalContext.current.power?.[0] ?? 'не предоставлено'}`
          : 'Сводка региона: отсутствует',
        `Ограничения: ${joinList(frame.constraints)}`,
        `Риски: ${joinList(frame.risks)}`,
        `Возможные эффекты: ${joinList(frame.possibleEffects)}`,
        `Исторический контекст: ${frame.historical.era}, ${frame.historical.year}, ${frame.historical.regionHint}`,
        `Правовой контекст: ${joinList(frame.legal.rules)}`,
        `Контекст локации: ${frame.world.location.kind}`,
        `Свидетели: ${joinList(frame.world.social.witnesses, ', ')}`,
        `Микроместо: ${frame.world.microPlace?.name ?? 'не предоставлено'} (${frame.world.microPlace?.kind ?? 'не предоставлено'})`,
        `Реконструкция пути: ${frame.world.travel?.routeReconstruction?.summary ?? 'не предоставлено'}`,
        `Медицинский контекст: ${joinList(frame.world.medical?.context)}`,
        'Верни только строгий JSON.'
      ].join('\n')
    }
  ];
}

function buildActorPromptContext(world) {
  const location = world.locations?.[world.current_position?.location_id ?? ''] ?? world.place ?? null;
  const microLocation = world.microPlace ?? null;
  const visibleNames = new Set();
  if (Array.isArray(location?.occupants)) {
    for (const name of location.occupants) {
      if (name) visibleNames.add(String(name));
    }
  }
  if (Array.isArray(microLocation?.occupants)) {
    for (const name of microLocation.occupants) {
      if (name) visibleNames.add(String(name));
    }
  }

  const actors = (world.npcs ?? [])
    .filter((npc) => isActorRelevantToScene(npc, location, visibleNames))
    .slice(0, 6)
    .map((npc) => summarizeActorForPrompt(npc));

  return {
    history: {
      era: world.history?.era ?? null,
      year: world.history?.year ?? null,
      season: world.history?.season ?? null,
      regionHint: world.history?.regionHint ?? null
    },
    region: {
      name: world.region?.name ?? null
    },
    socialTissue: {
      powerStructure: world.socialTissue?.powerStructure ?? null
    },
    scene: {
      location: summarizeLocationForPrompt(location),
      microLocation: summarizeMicroLocationForPrompt(microLocation),
      pressure: Array.isArray(world.scene?.pressure) ? world.scene.pressure.slice(0, 4) : [],
      weather: world.scene?.weather ?? null,
      light: world.scene?.light ?? null,
      attention: world.scene?.attention ?? null,
      sightlines: Array.isArray(world.microPlace?.visibleObjects) ? world.microPlace.visibleObjects.slice(0, 4) : [],
      exits: Array.isArray(location?.exits) ? location.exits.slice(0, 4).map((item) => item.label ?? item.name ?? item.direction ?? item) : []
    },
    player: summarizePlayerForPrompt(world.player ?? {}),
    actors,
    anchors: buildActorAnchors(world, location, microLocation, actors),
    uncertainty: buildActorUncertaintyNotes(world, location, microLocation, actors)
  };
}

function summarizeLocationForPrompt(location) {
  if (!location) {
    return {
      id: 'не указано',
      name: 'не указанное место',
      kind: 'не указано',
      purpose: null,
      ownership: null,
      accessRules: [],
      occupants: [],
      exits: [],
      hazards: [],
      rhythm: null
    };
  }

  return {
    id: location.id ?? 'не указано',
    name: location.name ?? 'не указанное место',
    kind: location.kind ?? 'не указано',
    purpose: location.profile?.purpose ?? location.purpose ?? null,
    ownership: location.profile?.ownership ?? location.ownership ?? null,
    accessRules: Array.isArray(location.profile?.accessRules)
      ? location.profile.accessRules.slice(0, 4)
      : (location.accessRules ?? []),
    occupants: Array.isArray(location.occupants) ? location.occupants.slice(0, 6) : [],
    exits: Array.isArray(location.exits) ? location.exits.slice(0, 4).map((item) => item.label ?? item.name ?? item.direction ?? item) : [],
    hazards: Array.isArray(location.profile?.hazards) ? location.profile.hazards.slice(0, 4) : (location.hazards ?? []),
    rhythm: location.profile?.rhythm ?? location.rhythm ?? null
  };
}

function summarizeMicroLocationForPrompt(microLocation) {
  if (!microLocation) {
    return {
      id: 'не указано',
      name: 'не указанная микролокация',
      kind: 'не указано',
      occupants: []
    };
  }

  return {
    id: microLocation.id ?? 'не указано',
    name: microLocation.name ?? 'не указанная микролокация',
    kind: microLocation.kind ?? 'не указано',
    occupants: Array.isArray(microLocation.occupants) ? microLocation.occupants.slice(0, 6) : []
  };
}

function summarizePlayerForPrompt(player) {
  const inventory = player?.items?.carried_items ?? [];
  const property = player?.items?.property_not_carried ?? [];
  return {
    id: player.id ?? 'player',
    name: player.name ?? 'player',
    role: player.role ?? 'не указано',
    status: player.status ?? 'не указано',
    socialClass: player.socialClass ?? 'не указано',
    occupation: player.occupation ?? null,
    reasonHere: player.reasonHere ?? null,
    visibleStatus: player.visibleStatus ?? null,
    trueStatus: player.trueStatus ?? null,
    family: Array.isArray(player.family) ? player.family.slice(0, 3) : [],
    property: Array.isArray(property) ? property.slice(0, 3) : [],
    inventory: Array.isArray(inventory) ? inventory.slice(0, 5) : [],
    skills: Array.isArray(player.skills) ? player.skills.slice(0, 4) : [],
    memory: Array.isArray(player.memory) ? player.memory.slice(0, 3) : [],
    knowledge: Array.isArray(player.knowledge) ? player.knowledge.slice(0, 3) : [],
    fears: Array.isArray(player.fears) ? player.fears.slice(0, 3) : [],
    goals: Array.isArray(player.goals) ? player.goals.slice(0, 3) : [],
    obligations: Array.isArray(player.obligations) ? player.obligations.slice(0, 3) : []
  };
}

function summarizeActorForPrompt(npc) {
  const visibleNpc = applyNpcProfileDepth(npc ?? {}, npc?.profileLevel ?? npc?.actorProfile?.profileLevel ?? null);
  return {
    profileLevel: visibleNpc.profileLevel ?? null,
    id: visibleNpc.id ?? null,
    name: visibleNpc.name ?? 'npc',
    role: visibleNpc.role ?? 'не указано',
    status: visibleNpc.status ?? 'не указано',
    occupation: visibleNpc.occupation ?? null,
    locationId: visibleNpc.locationId ?? visibleNpc.homeLocation ?? null,
    homeLocation: visibleNpc.homeLocation ?? null,
    reasonHere: visibleNpc.reasonHere ?? null,
    visibleStatus: visibleNpc.visibleStatus ?? null,
    trueStatus: visibleNpc.trueStatus ?? null,
    mood: visibleNpc.mood ?? null,
    visibleMarks: Array.isArray(visibleNpc.visibleMarks) ? visibleNpc.visibleMarks.slice(0, 3) : [],
    activeConditions: Array.isArray(visibleNpc.activeConditions) ? visibleNpc.activeConditions.slice(0, 3) : [],
    dutyTo: visibleNpc.dutyTo ?? null,
    answerableTo: visibleNpc.answerableTo ?? null,
    currentActivity: visibleNpc.currentActivity ?? null,
    availabilityWindow: visibleNpc.availabilityWindow ?? null,
    movementWindow: visibleNpc.movementWindow ?? null,
    routine: Array.isArray(visibleNpc.routine) ? visibleNpc.routine.slice(0, 3) : [],
    family: Array.isArray(visibleNpc.family) ? visibleNpc.family.slice(0, 3) : [],
    property: Array.isArray(visibleNpc.property) ? visibleNpc.property.slice(0, 3) : [],
    inventory: Array.isArray(visibleNpc.inventory) ? visibleNpc.inventory.slice(0, 4) : [],
    skills: Array.isArray(visibleNpc.skills) ? visibleNpc.skills.slice(0, 4) : [],
    knowledgeSeen: Array.isArray(visibleNpc.knowledgeSeen) ? visibleNpc.knowledgeSeen.slice(0, 3) : [],
    knowledgeHeard: Array.isArray(visibleNpc.knowledgeHeard) ? visibleNpc.knowledgeHeard.slice(0, 3) : [],
    knowledgeHidden: Array.isArray(visibleNpc.knowledgeHidden) ? visibleNpc.knowledgeHidden.slice(0, 2) : [],
    obligations: Array.isArray(visibleNpc.obligations) ? visibleNpc.obligations.slice(0, 3) : [],
    goals: Array.isArray(visibleNpc.goals) ? visibleNpc.goals.slice(0, 3) : [],
    fears: Array.isArray(visibleNpc.fears) ? visibleNpc.fears.slice(0, 3) : []
  };
}

function buildActorAnchors(world, location, microLocation, actors) {
  const anchors = [];
  if (location?.name) anchors.push(`Локация: ${location.name}`);
  if (microLocation?.name) anchors.push(`Микролокация: ${microLocation.name}`);
  if (world.scene?.weather) anchors.push(`Погода: ${world.scene.weather}`);
  if (world.scene?.light) anchors.push(`Свет: ${world.scene.light}`);
  if (Array.isArray(world.scene?.pressure) && world.scene.pressure.length > 0) {
    anchors.push(`Давление: ${world.scene.pressure.slice(0, 3).join(' | ')}`);
  }
  if (Array.isArray(actors) && actors.length > 0) {
    anchors.push(`Люди в сцене: ${actors.slice(0, 4).map((item) => item.name).join(' | ')}`);
  }
  return anchors;
}

function buildActorUncertaintyNotes(world, location, microLocation, actors) {
  const notes = [];
  if (!location?.occupants?.length) notes.push('Не все второстепенные люди перечислены явно.');
  if (!microLocation?.name) notes.push('Точная микролокация может быть не названа.');
  if ((actors?.length ?? 0) < (location?.occupants?.length ?? 0)) {
    notes.push('В контексте показаны только люди, важные для текущей сцены.');
  }
  if (!world.scene?.pressure?.length) notes.push('Давление сцены может быть описано неполно.');
  return notes;
}

function isActorRelevantToScene(npc, location, visibleNames) {
  if (!npc) return false;
  const npcLocationId = npc.locationId ?? npc.homeLocation ?? null;
  if (location?.id && npcLocationId && npcLocationId === location.id) return true;
  if (location?.occupants && visibleNames.has(String(npc.name ?? ''))) return true;
  return false;
}

function buildActorAuditResponseSections(audit) {
  return [
    section('Audit', [
      `pass=${audit?.pass}`,
      `concerns=${audit?.concerns?.slice(0, 4).join(' | ') || 'не предоставлено'}`,
      `evidence=${audit?.evidence?.slice(0, 4).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function buildLocationAuditResponseSections(audit) {
  return [
    section('Audit', [
      `pass=${audit?.pass}`,
      `concerns=${audit?.concerns?.slice(0, 4).join(' | ') || 'не предоставлено'}`,
      `evidence=${audit?.evidence?.slice(0, 4).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function summarizeActorAuditFailure(audit) {
  const concerns = Array.isArray(audit?.concerns) ? audit.concerns.filter(Boolean) : [];
  const evidence = Array.isArray(audit?.evidence) ? audit.evidence.filter(Boolean) : [];
  const parts = [];
  if (concerns.length) parts.push(concerns.slice(0, 3).join('; '));
  if (evidence.length) parts.push(`evidence: ${evidence.slice(0, 2).join('; ')}`);
  return parts.length > 0 ? parts.join(' | ') : 'audit rejected the profile';
}

function buildLocationPromptContext(world) {
  const currentLocation = world.locations?.[world.current_position?.location_id ?? ''] ?? world.place ?? null;
  const relatedLocations = Array.isArray(currentLocation?.exits)
    ? currentLocation.exits
        .slice(0, 4)
        .map((exit) => world.locations?.[exit?.to])
        .filter(Boolean)
        .map((location) => summarizeLocationForPrompt(location))
    : [];

  return {
    frame: {
      era: world.history?.era ?? null,
      year: world.history?.year ?? null,
      season: world.history?.season ?? null,
      regionName: world.historicalFrame?.regionName ?? world.region?.name ?? null
    },
    current: summarizeLocationForPrompt(currentLocation),
    neighbors: relatedLocations,
    uncertainty: buildLocationUncertaintyNotes(currentLocation, relatedLocations, world)
  };
}

function buildLocationUncertaintyNotes(currentLocation, relatedLocations, world) {
  const notes = [];
  if (!currentLocation?.name) notes.push('Точная текущая локация может быть названа не полностью.');
  if (!Array.isArray(currentLocation?.occupants) || currentLocation.occupants.length === 0) {
    notes.push('Второстепенные люди могут быть перечислены неполно.');
  }
  if ((relatedLocations?.length ?? 0) === 0) {
    notes.push('Связанные точки могут быть скрыты или не названы явно.');
  }
  if (!world.historicalFrame?.regionName && !world.region?.name) {
    notes.push('Региональная привязка может быть исторически неопределённой.');
  }
  return notes;
}

function summarizeLocationAuditFailure(audit) {
  const concerns = Array.isArray(audit?.concerns) ? audit.concerns.filter(Boolean) : [];
  const evidence = Array.isArray(audit?.evidence) ? audit.evidence.filter(Boolean) : [];
  const parts = [];
  if (concerns.length) parts.push(concerns.slice(0, 3).join('; '));
  if (evidence.length) parts.push(`evidence: ${evidence.slice(0, 2).join('; ')}`);
  return parts.length > 0 ? parts.join(' | ') : 'audit rejected the location profile';
}

function buildActorDossierMessages(context, previousAudit = null) {
  return [
    {
      role: 'system',
      content: [
        'Ты создаёшь semantic dossier для actor-профилей исторической RPG XIII века.',
        promptDesignDocs('actor_profiles'),
        'Верни только сухой структурный dossier обычным текстом: факты, причины, связи, ограничения. Без художественной сцены, метафор, атмосферы и внутренней прозы.',
        'Не возвращай JSON на этом этапе, но держи текст компактным и пригодным для последующей упаковки в JSON.',
        'Контекст должен быть локальным: только люди, которые реально присутствуют в сцене, и только то, что важно для их текущего положения.',
        'Сохраняй факты, ограничения, семейные связи, имущество, обязанности, тело, память, знания, страхи, цели, видимые признаки тела и текущую деятельность.',
        'Для каждого NPC явно указывай profileLevel как background, scene или key; не выводи уровень из роли, статуса или имени.',
        'Для background NPC достаточно кратко указать роль, текущее занятие, видимый признак, настроение, отношение к порядку сцены, способность заметить действие игрока и примерное окно доступности.',
        'Для scene NPC добавь имя/прозвище, роль и статус, причину быть здесь, текущее действие, отношение к игроку, знания, ближайшую цель, страх или ограничение, ресурсы, реакции, границы доступности и релевантные навыки.',
        'Для key NPC добавь долговременную память, связи, мотив, ограничение, доступ к ресурсам, тело и последствия, но не раздувай профиль до энциклопедии.',
        'Inventory - только carried items; house, boat, horse, trade stock, debt or family ties that are not physically carried belong in property, kinship or obligations.',
        'Если сведений нет, это тоже факт: явно обозначай отсутствие сведений, неопределённость или неполноту данных.',
        'Не подмешивай весь регион и не расписывай мир целиком.',
        'Не заявляй финальную JSON-схему и не притворяйся готовым actor_profiles.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'actor_semantic_dossier',
        stage: 'scene_actor_context',
        target_contract: 'actor_profiles',
        scene: context.scene,
        player: context.player,
        actors: context.actors,
        anchors: context.anchors,
        uncertainty: context.uncertainty,
        previousAudit: previousAudit ? { concerns: previousAudit.concerns ?? [], evidence: previousAudit.evidence ?? [] } : null
      })
    }
  ];
}

function buildActorAuditMessages(context, dossierText) {
  return [
    {
      role: 'system',
      content: buildSemanticAuditSystemContent('actor-профилей исторической RPG XIII века', [
        'Проверь только настоящие ошибки: всеведение, противоречия, невозможное присутствие, отсутствие причины быть здесь, разрыв между видимым и скрытым.',
        'Неполнота, историческая неопределённость и отсутствие второстепенной конкретики не должны валить pass.',
        'Если чего-то не хватает, помечай это как uncertainty или soft concern, но не делай из этого провал.',
        'Если проблема только в неполноте, pass должен быть true.'
      ], 'actor_profiles')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_audit',
        kind: 'actor',
        dossier: dossierText,
        world: {
          era: context.history?.era ?? null,
          year: context.history?.year ?? null,
          season: context.history?.season ?? null,
          region: context.region?.name ?? null,
          location: context.scene?.location?.name ?? null,
          microLocation: context.scene?.microLocation?.name ?? null,
          socialTissue: context.socialTissue?.powerStructure ?? null,
          player: context.player?.name ?? null,
          actors: context.actors?.map((item) => item.name) ?? [],
          anchors: context.anchors ?? [],
          uncertainty: context.uncertainty ?? []
        }
      })
    }
  ];
}

function buildActorRepairMessages(context, dossierText, audit) {
  return [
    {
      role: 'system',
      content: [
        'Ты SemanticDossierRepairer для actor-профилей исторической RPG XIII века.',
        'Верни только сухую точечную правку обычным текстом без JSON, markdown и списков.',
        'Твоя задача - дать только конкретную правку по замечаниям аудита, а не художественную перепись dossier.',
        'Сохраняй историчность, причинность, ограничения и уже утверждённый смысл.',
        'Не добавляй ничего сверх того, что нужно, чтобы снять audit concerns.',
        'Не создавай новый NPC, новую identity, route, gate, anchor или occupant вне approved actor candidates, NPC seeds и уже размещённых NPC.',
        'Если для правки не хватает approved NPC fact, верни blocked_by_missing_approved_fact вместо выдумывания нового персонажа.',
        'Пиши коротко: одна-четыре строки, только те места, которые нужно поправить.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_dossier_repair',
        kind: 'actor',
        scene: context.scene,
        dossier: dossierText,
        audit,
        actors: context.actors,
        anchors: context.anchors
      })
    }
  ];
}

function buildActorShapeMessages(context, dossierText, audit, retryInstruction = '', previousActorProfiles = null, validationErrors = []) {
  const outputContract = buildActorProfilesOutputContract();
  const canonicalExample = getActorProfilesCanonicalExample();
  return [
    {
      role: 'system',
      content: buildStructuredShapePromptHeader({
        role: 'Ты — ActorProfileShaper для actor-профилей исторической RPG XIII века.',
        task: 'Собери новый объект actor_profiles из утверждённого смысла.',
        sources: 'Используй sourceDossier, audit, history, region и socialTissue как ограничение.',
        facts: 'Не придумывай новых фактов, NPC или смысла.',
        visible: 'Формируй player и npcs так, чтобы profileLevel был явным, а carried items не смешивались с имуществом.',
        hidden: 'Не тащи скрытые мотивы, внутренние флаги и сырьё целиком.',
        constraints: 'Типы и вложенная структура берутся только из outputContract. profileLevel нельзя угадывать из role или status.',
        format: 'Формат ответа: строгий JSON без markdown и без пояснений.',
        criteria: 'NPC и player должны оставаться компактными и пригодными для игры.',
        extra: [
          'Если не хватает approved NPC candidate / seed / placed NPC, верни только blocked_by_missing_approved_fact JSON outcome.',
          'Нельзя создавать новую NPC identity вне approved actor candidates, NPC seeds и already placed NPCs.',
          'Каждый NPC обязан сохранять или явно задавать profileLevel как background, scene или key.',
          'Inventory — только carried items; house, boat, horse, trade stock belong in property, kinship or obligations.',
          'Запрещённые root-ключи: sourceDossier, repairNotes, audit, contract, notes, raw, explanation.',
          'Если есть retryInstruction, следуй ему буквально.',
          ...buildActorProfilesAntiRegressionRules().map((rule) => `- ${rule}`)
        ]
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'actor_profiles',
        kind: 'actor_profiles',
        sourceDossier: dossierText,
        history: {
          era: context.history?.era ?? null,
          year: context.history?.year ?? null,
          season: context.history?.season ?? null,
          region: context.region?.name ?? null,
          regionHint: context.history?.regionHint ?? null
        },
        region: context.region ?? null,
        socialTissue: context.socialTissue ?? null,
        audit,
        retryInstruction,
        previousActorProfiles,
        validationErrors,
        outputContract,
        canonicalExample,
        outputRules: {
          allowedRootKeys: outputContract.allowedRootKeys,
          forbiddenRootKeys: ['sourceDossier', 'repairNotes', 'audit', 'contract', 'notes', 'raw', 'explanation'],
          schema: 'actor_profiles',
          version: 1
        }
      })
    }
  ];
}

function buildActorProfilesContractRepairMessages(context, dossierText, audit, validationErrors = [], previousActorProfiles = null) {
  const outputContract = buildActorProfilesOutputContract();
  const canonicalExample = getActorProfilesCanonicalExample();
  return [
    {
      role: 'system',
      content: [
        'Ты ActorProfileRepairer для actor_profiles исторической RPG XIII века.',
        'Верни полный исправленный JSON object actor_profiles.',
        'Исправь все validationErrors одновременно.',
        'Не создавай новый NPC, новую identity, route, gate, anchor или occupant вне approved actor candidates, NPC seeds и already placed NPCs.',
        'Если данных не хватает, верни только blocked_by_missing_approved_fact JSON outcome.',
        ...buildActorProfilesAntiRegressionRules().map((rule) => `- ${rule}`)
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'actor_profiles_repair',
        dossier: dossierText,
        audit,
        history: context.history ?? null,
        region: context.region ?? null,
        socialTissue: context.socialTissue ?? null,
        previousActorProfiles,
        validationErrors,
        outputContract,
        canonicalExample
      })
    }
  ];
}

function buildLocationDossierMessages(context, previousAudit = null) {
  return [
    {
      role: 'system',
      content: [
        'Ты создаёшь semantic dossier для профилей исторических локаций XIII века.',
        promptDesignDocs('location_profiles'),
        'Верни только сухой структурный dossier обычным текстом: факты, функции места, связи, ограничения, риски. Без художественной сцены, метафор, атмосферы и внутренней прозы.',
        'Не возвращай JSON на этом этапе, но держи текст компактным и пригодным для последующей упаковки в JSON.',
        'Нужно описать только текущую локацию и её непосредственные связи, а не весь мир целиком.',
        'Покажи смысл места, владельцев, маршруты, доступ, ритм, опасности, память и следы жизни.',
        'Если сведений нет, это тоже факт: явно обозначай отсутствие сведений, неопределённость или неполноту данных.',
        'Не придумывай ничего, что не следует из входного контекста.',
        'Не заявляй финальную JSON-схему и не притворяйся готовым location_profiles.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'location_semantic_dossier',
        target_contract: 'location_profiles',
        current: context.current,
        neighbors: context.neighbors,
        frame: context.frame,
        uncertainty: context.uncertainty,
        previousAudit: previousAudit ? { concerns: previousAudit.concerns ?? [], evidence: previousAudit.evidence ?? [] } : null
      })
    }
  ];
}

function buildLocationAuditMessages(context, dossierText) {
  return [
    {
      role: 'system',
      content: buildSemanticAuditSystemContent('локаций исторической RPG XIII века', [
        'Проверь только настоящие ошибки: всеведение, противоречия, невозможную географию, отсутствие причины быть здесь и нарушение видимого/скрытого.',
        'Неполнота, историческая неопределённость и нехватка второстепенной конкретики не должны валить pass.',
        'Если проблема только в недосказанности, pass должен быть true, а замечание нужно пометить как uncertainty.'
      ], 'location_profiles')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_audit',
        kind: 'location',
        dossier: dossierText,
        world: {
          location: context.current?.name ?? null,
          neighbors: (context.neighbors ?? []).map((item) => item.name),
          frame: context.frame
        }
      })
    }
  ];
}

function buildLocationRepairMessages(context, dossierText, audit) {
  return [
    {
      role: 'system',
      content: [
        'Ты SemanticDossierRepairer для локаций исторической RPG XIII века.',
        'Верни только сухую точечную правку обычным текстом без JSON, markdown и списков.',
        'Твоя задача - дать только конкретную правку по замечаниям аудита, а не художественную перепись dossier.',
        'Сохраняй историчность, причинность, ограничения и уже утверждённый смысл.',
        'Не добавляй ничего сверх того, что нужно, чтобы снять audit concerns.',
        'Не создавай новый route, gate, anchor, occupant или новую локацию вне approved current/neighbors/graph.',
        'Можно уточнять access, visibility или state только уже approved gate/route/occupant.',
        'Если для правки не хватает approved fact, верни blocked_by_missing_approved_fact вместо выдумывания связи.',
        'Пиши коротко: одна-четыре строки, только те места, которые нужно поправить.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_dossier_repair',
        kind: 'location',
        current: context.current,
        neighbors: context.neighbors,
        dossier: dossierText,
        audit
      })
    }
  ];
}

function buildLocationShapeMessages(context, dossierText, audit, retryInstruction = '', previousLocationProfiles = null, validationErrors = []) {
  const outputContract = buildLocationProfilesOutputContract();
  const canonicalExample = getLocationProfilesCanonicalExample();
  return [
    {
      role: 'system',
      content: buildStructuredShapePromptHeader({
        role: 'Ты — LocationProfileShaper для локаций исторической RPG XIII века.',
        task: 'Собери новый объект location_profiles из утверждённого смысла.',
        sources: 'Используй sourceDossier, audit, current, neighbors и frame как ограничение.',
        facts: 'Не придумывай новые факты, локации или смысл dossiers.',
        visible: 'Опиши только текущую локацию, её связи, доступ, ритм, опасности, память и следы жизни.',
        hidden: 'Не тащи скрытую карту, внутренние флаги и sourceDossier целиком.',
        constraints: 'Типы и вложенная структура берутся только из outputContract. Если сведений нет, используй uncertainty вместо всеведения.',
        format: 'Формат ответа: строгий JSON без markdown и без пояснений.',
        criteria: 'Локации должны быть компактными и пригодными для последующей игры.',
        extra: [
          'Если не хватает approved route / gate / anchor / occupant, верни только blocked_by_missing_approved_fact JSON outcome.',
          'Можно уточнять access, visibility или state только уже approved gate, route или occupant.',
          'Нельзя создавать новый gate, route, anchor, occupant или location, если его нет в approved input.',
          'locations[] items must include id.',
          'Не добавляй historical_audit: его уже утвердила внешняя проверка.',
          'Запрещённые root-ключи: sourceDossier, repairNotes, audit, contract, notes, raw, explanation.',
          'Если есть retryInstruction, следуй ему буквально.',
          ...buildLocationProfilesAntiRegressionRules().map((rule) => `- ${rule}`)
        ]
      })
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'location_profiles',
        kind: 'location_profiles',
        sourceDossier: dossierText,
        current: context.current ?? null,
        neighbors: context.neighbors ?? null,
        frame: context.frame ?? null,
        audit,
        retryInstruction,
        previousLocationProfiles,
        validationErrors,
        outputContract,
        canonicalExample,
        outputRules: {
          allowedRootKeys: outputContract.allowedRootKeys,
          forbiddenRootKeys: ['sourceDossier', 'repairNotes', 'audit', 'contract', 'notes', 'raw', 'explanation'],
          schema: 'location_profiles',
          version: 1
        }
      })
    }
  ];
}

function buildLocationProfilesContractRepairMessages(context, dossierText, audit, validationErrors = [], previousLocationProfiles = null) {
  const outputContract = buildLocationProfilesOutputContract();
  const canonicalExample = getLocationProfilesCanonicalExample();
  return [
    {
      role: 'system',
      content: [
        'Ты LocationProfileRepairer для location_profiles исторической RPG XIII века.',
        'Верни полный исправленный JSON object location_profiles.',
        'Исправь все validationErrors одновременно.',
        'Не создавай новый route, gate, anchor, occupant или новую локацию вне approved current/neighbors/graph.',
        'Можно уточнять access, visibility или state только уже approved gate, route или occupant.',
        'Если данных не хватает, верни только blocked_by_missing_approved_fact JSON outcome.',
        ...buildLocationProfilesAntiRegressionRules().map((rule) => `- ${rule}`)
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'location_profiles_repair',
        dossier: dossierText,
        audit,
        current: context.current ?? null,
        neighbors: context.neighbors ?? null,
        previousLocationProfiles,
        validationErrors,
        outputContract,
        canonicalExample
      })
    }
  ];
}

function buildNarratorRequestSections(frame, visiblePackage) {
  const clock = frame.world?.time ?? frame.time ?? frame.clock ?? null;
  return [
    section('Время', [
      `Clock: ${formatNarratorClock(frame)}`,
      `Moment: ${describeNarratorClockMoment(clock) || 'не указано'}`,
      'Время суток должно оставаться согласованным с clock'
    ]),
    section('Сцена', [
      `Место: ${frame.world?.location?.name ?? 'не предоставлено'}`,
      `Интент: ${frame.intent?.type ?? 'не указано'}`,
      `Проверка: ${frame.check?.required ? 'да' : 'нет'}`
    ]),
    section('Видимый пакет', [
      `scene: ${clipText(visiblePackage?.visible_scene ?? 'не предоставлено', 180)}`,
      `changes: ${(visiblePackage?.visible_changes ?? []).slice(0, 3).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function buildNarratorAuditRequestSections(frame, narrative) {
  const clock = frame.world?.time ?? frame.time ?? frame.clock ?? null;
  return [
    section('Ограничения', [
      `Clock: ${formatNarratorClock(frame)}`,
      `Moment: ${describeNarratorClockMoment(clock) || 'не указано'}`,
      `Год: ${frame.historical?.year ?? 'не указано'}`,
      `Место: ${frame.world?.location?.name ?? 'не предоставлено'}`,
      `Свидетели: ${(frame.world?.social?.witnesses?.length ? frame.world.social.witnesses : ['не предоставлено']).join(', ')}`
    ]),
    section('Утверждённое', [
      `scene: ${clipText(narrative?.scene ?? 'не предоставлено', 180)}`,
      `consequence: ${clipText(narrative?.consequence ?? 'не предоставлено', 180)}`,
      `next_pressure: ${clipText(narrative?.next_pressure ?? 'не предоставлено', 180)}`
    ])
  ];
}

function buildNarratorShapeRequestSections(frame, narrative) {
  const clock = frame.world?.time ?? frame.time ?? frame.clock ?? null;
  return [
    section('Формат', [
      'Plain prose only',
      'No JSON',
      'No hidden facts',
      'No extra certainty'
    ]),
    section('Время', [
      `Clock: ${formatNarratorClock(frame)}`,
      `Moment: ${describeNarratorClockMoment(clock) || 'не указано'}`,
      'Не меняй время суток без явного перехода в сцене'
    ]),
    section('Сцена', [
      `Место: ${frame.world?.location?.name ?? 'не предоставлено'}`,
      `Микролокация: ${frame.world?.microPlace?.name ?? 'не предоставлено'}`,
      `Свет: ${frame.world?.light ?? frame.world?.scene?.light ?? 'не предоставлено'}`
    ]),
    section('Видимое', [
      ...(Array.isArray(narrative?.visible_details) ? narrative.visible_details.slice(0, 4) : []),
      ...(Array.isArray(narrative?.npc_reactions) ? narrative.npc_reactions.slice(0, 4) : [])
    ])
  ];
}

function sanitizeNarratorNarrative(narrative = {}) {
  if (!narrative || typeof narrative !== 'object') return {};
  return {
    scene: narrative.scene ?? '',
    consequence: narrative.consequence ?? '',
    visible_details: Array.isArray(narrative.visible_details) ? narrative.visible_details.slice(0, 6) : [],
    npc_reactions: Array.isArray(narrative.npc_reactions) ? narrative.npc_reactions.slice(0, 6) : [],
    next_pressure: narrative.next_pressure ?? ''
  };
}

function normalizeSemanticAuditResponse(parsed, rawText = '', options = {}) {
  if (!parsed || typeof parsed !== 'object') return null;
  const concerns = Array.isArray(parsed.concerns)
    ? parsed.concerns.filter((item) => typeof item === 'string' && item.trim())
    : [];
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence.filter((item) => typeof item === 'string' && item.trim())
    : [];
  const allowFallbackEvidence = options.allowFallbackEvidence ?? true;
  const normalized = {
    ...parsed,
    concerns,
    evidence: evidence.length > 0
      ? evidence
      : (parsed.pass === true && allowFallbackEvidence ? buildSemanticAuditFallbackEvidence(rawText) : [])
  };
  return validateSemanticAudit(normalized);
}

export function parseSemanticAuditResponse(text) {
  return normalizeSemanticAuditResponse(parseJsonObject(text), text);
}

function parseNarratorAuditResponse(text) {
  return normalizeSemanticAuditResponse(parseJsonObject(text), text);
}

async function safeReadText(response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return 'unable to read error body';
  }
}

function parseRiskAuditResponse(text) {
  return validateRiskAudit(parseJsonObject(text));
}

function summarizeMasterNarrativeRepairFailure(text) {
  const parsed = parseJsonObject(text);
  if (!parsed) return 'master_narrative repair response is invalid JSON';
  return describeValidationErrors(explainMasterNarrativeValidation(parsed)).join('; ') || 'master_narrative repair response violated the contract';
}

function buildMasterNarrativeRepairMessages(frame, localOutcome, dossierText, audit, rawText, validationErrors = []) {
  return buildMasterNarrativeContractRepairMessages(frame, localOutcome, dossierText, audit, validationErrors, parseJsonObject(rawText));
}

function buildMasterNarrativeRepairRequestSections(frame, localOutcome, dossierText, audit, rawText, validationErrors = []) {
  return [
    section('Вход', [
      `Команда: ${clipText(frame.input, 180)}`,
      `Интент: ${frame.intent?.type ?? 'не указано'}`,
      `Локальный исход: ${clipText(localOutcome, 220)}`
    ]),
    section('Заморозка', [
      'Dossier уже утверждён.',
      'Audit уже утверждён.',
      'Перезапуск генерации запрещён.'
    ]),
    section('Validation', Array.isArray(validationErrors) ? validationErrors.slice(0, 4) : []),
    section('Raw', splitTextLines(rawText || dossierText, 4)),
    section('Аудит', [
      `pass=${audit?.pass}`,
      `concerns=${audit?.concerns?.slice(0, 3).join(' | ') || 'не предоставлено'}`,
      `evidence=${audit?.evidence?.slice(0, 3).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function buildNarratorProseRepairRequestSections(frame, narrative, proseText, conflictReason) {
  const clock = frame.world?.time ?? frame.time ?? frame.clock ?? null;
  return [
    section('Время', [
      `Clock: ${formatNarratorClock(frame)}`,
      `Moment: ${describeNarratorClockMoment(clock) || 'не указано'}`
    ]),
    section('Проблема', [
      conflictReason || 'конфликт не указан',
      'Исправь только конфликт времени, не переписывая всю сцену.'
    ]),
    section('Утверждённое', [
      `scene: ${clipText(narrative?.scene ?? 'не предоставлено', 180)}`,
      `consequence: ${clipText(narrative?.consequence ?? 'не предоставлено', 180)}`,
      `next_pressure: ${clipText(narrative?.next_pressure ?? 'не предоставлено', 180)}`
    ]),
    section('Сырой текст', splitTextLines(proseText, 4))
  ];
}

function buildSemanticAuditFallbackEvidence(rawText) {
  void rawText;
  // Technical parser marker only. This is not world evidence and not a historical/game fact.
  return [TECHNICAL_SEMANTIC_AUDIT_PASS_MARKER];
}

function getSemanticRepairModelTier(repairAttemptIndex) {
  return repairAttemptIndex >= 2 ? MODEL_TIER_SENIOR : MODEL_TIER_PRO;
}

function buildStageTelemetry(stage, phase, attemptIndex, repairAttemptIndex = 0, modelTier = MODEL_TIER_PRO, terminalStatus = null) {
  return {
    stage,
    phase,
    attempt_index: attemptIndex,
    repair_attempt_index: repairAttemptIndex,
    model_tier: modelTier,
    terminal_status: terminalStatus
  };
}

export function createSemanticRecoveryRoute({
  class: routeClass,
  current_stage,
  repair_target_stage,
  reason_code,
  offending_field = null,
  offending_value = null,
  missing_fact_type = null,
  missing_fact_id = null,
  allowed_routes = [],
  forbidden_local_fix = null,
  rerun_from_stage = repair_target_stage,
  terminal_status = null
} = {}) {
  return {
    schema: 'semantic_recovery_route',
    class: routeClass,
    current_stage,
    repair_target_stage,
    reason_code,
    offending_field,
    offending_value,
    missing_fact_type,
    missing_fact_id,
    allowed_routes: Array.isArray(allowed_routes) ? allowed_routes.slice() : [],
    forbidden_local_fix,
    rerun_from_stage,
    terminal_status
  };
}

function createSemanticRecoveryError(route, message = 'semantic recovery route required') {
  const error = new Error(message);
  error.semanticRecoveryRoute = route;
  error.recovery_class = route?.class ?? null;
  error.repair_target_stage = route?.repair_target_stage ?? null;
  error.rerun_from_stage = route?.rerun_from_stage ?? null;
  error.forbidden_local_fix = route?.forbidden_local_fix ?? null;
  error.terminal_status = route?.terminal_status ?? null;
  return error;
}

function toRecoveryTelemetry(route, repairAttemptIndex = 0, modelTier = MODEL_TIER_PRO) {
  return {
    recovery_class: route?.class ?? null,
    repair_target_stage: route?.repair_target_stage ?? null,
    rerun_from_stage: route?.rerun_from_stage ?? null,
    forbidden_local_fix: route?.forbidden_local_fix ?? null,
    repair_attempt_index: repairAttemptIndex,
    model_tier: modelTier,
    terminal_status: route?.terminal_status ?? null
  };
}

function buildApprovedVisibleActorRefs(input = {}) {
  const refs = new Set();
  for (const item of Array.isArray(input?.visibleNpcs) ? input.visibleNpcs : []) {
    for (const value of [item?.source_ref, item?.actor_ref]) {
      const text = typeof value === 'string' ? value.trim() : '';
      if (text) refs.add(text);
    }
  }
  return refs;
}

function hasApprovedVisibleNpcCandidates(input = {}) {
  return buildApprovedVisibleActorRefs(input).size > 0;
}

function looksLikeConcreteVisibleActorReaction(text) {
  const normalized = String(text ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (/люди/u.test(normalized) && !/человек/u.test(normalized)) return false;
  return /(человек|мужчина|женщина|хозяин|работник|сторож|перевозчик|конюх|дворник|староста|приказчик|служка|парень|девка|гость)/u.test(normalized);
}

function buildMasterNarrativeUnapprovedVisibleNpcRoute(reactionText, options = {}) {
  const allowMaterialization = options.allowMaterialization === true;
  return createSemanticRecoveryRoute({
    class: allowMaterialization ? 'missing_approved_fact' : 'upstream_repair',
    current_stage: 'visible_context_package',
    repair_target_stage: allowMaterialization ? 'npc_materialization' : 'master_narrative',
    reason_code: 'MASTER_NARRATIVE_UNAPPROVED_VISIBLE_NPC',
    offending_field: 'npc_reactions',
    offending_value: reactionText ?? null,
    missing_fact_type: allowMaterialization ? 'npc' : null,
    missing_fact_id: null,
    allowed_routes: allowMaterialization
      ? ['return_to_npc_materialization_if_candidate_exists']
      : ['repair_master_narrative_remove_or_generalize_unapproved_npc'],
    forbidden_local_fix: 'do not add visible_npc or source_ref inside visible_context_package',
    rerun_from_stage: allowMaterialization ? 'npc_materialization' : 'master_narrative',
    terminal_status: null
  });
}

export function validateMasterNarrativeAgainstVisibleInputs(worldOrInput, masterNarrative = null) {
  const input = worldOrInput?.visibleNpcs && worldOrInput?.narrative
    ? worldOrInput
    : buildVisibleContextInput(worldOrInput, masterNarrative ?? {});
  const narrative = input?.narrative ?? sanitizeNarratorNarrative(masterNarrative ?? {});
  const approvedRefs = buildApprovedVisibleActorRefs(input);
  const reactionRefs = Array.isArray(narrative?.npc_reaction_refs) ? narrative.npc_reaction_refs : [];

  for (const ref of reactionRefs) {
    if (!ref || typeof ref !== 'object') continue;
    const reactionText = typeof ref.reaction_text === 'string' ? ref.reaction_text.trim() : '';
    const actorRef = typeof ref.actor_ref === 'string' ? ref.actor_ref.trim() : '';
    if (ref.approved !== true || !actorRef || !approvedRefs.has(actorRef)) {
      return buildMasterNarrativeUnapprovedVisibleNpcRoute(reactionText || actorRef || null, {
        allowMaterialization: hasApprovedVisibleNpcCandidates(input)
      });
    }
  }

  if (approvedRefs.size === 0) {
    const reaction = (Array.isArray(narrative?.npc_reactions) ? narrative.npc_reactions : [])
      .find((item) => looksLikeConcreteVisibleActorReaction(item));
    if (reaction) {
      return buildMasterNarrativeUnapprovedVisibleNpcRoute(reaction, {
        allowMaterialization: false
      });
    }
  }

  return null;
}

function classifyVisibleContextRecoveryRoute(input, candidatePackage, masterNarrative = {}) {
  const visibleNpc = Array.isArray(candidatePackage?.visible_npc) ? candidatePackage.visible_npc : [];
  if (visibleNpc.length < 1) return null;
  const approvedRefs = buildApprovedVisibleActorRefs(input);
  const invalidItem = visibleNpc.find((item) => {
    const ref = typeof item?.source_ref === 'string' ? item.source_ref.trim() : '';
    return !ref || !approvedRefs.has(ref);
  });
  if (!invalidItem) return null;

  const route = validateMasterNarrativeAgainstVisibleInputs(input, masterNarrative);
  if (route) return route;

  return createSemanticRecoveryRoute({
    class: approvedRefs.size > 0 ? 'missing_approved_fact' : 'upstream_repair',
    current_stage: 'visible_context_package',
    repair_target_stage: approvedRefs.size > 0 ? 'npc_materialization' : 'master_narrative',
    reason_code: 'VISIBLE_CONTEXT_UNAPPROVED_VISIBLE_NPC',
    offending_field: 'visible_npc',
    offending_value: invalidItem?.name_or_label ?? invalidItem?.name ?? invalidItem?.label ?? null,
    missing_fact_type: approvedRefs.size > 0 ? 'npc' : null,
    missing_fact_id: null,
    allowed_routes: approvedRefs.size > 0
      ? ['return_to_npc_materialization_if_candidate_exists']
      : ['repair_master_narrative_remove_or_generalize_unapproved_npc'],
    forbidden_local_fix: 'do not add visible_npc or source_ref inside visible_context_package',
    rerun_from_stage: approvedRefs.size > 0 ? 'npc_materialization' : 'master_narrative',
    terminal_status: null
  });
}

function isBlockedByMissingApprovedFactOutcome(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.status !== 'blocked_by_missing_approved_fact') return false;
  if (!MISSING_APPROVED_FACT_TYPES.has(value.missing_fact_type)) return false;
  const missingFactIdOk = value.missing_fact_id == null || typeof value.missing_fact_id === 'string';
  return missingFactIdOk
    && typeof value.missing_fact_description === 'string'
    && value.missing_fact_description.trim().length > 0
    && typeof value.allowed_next_step === 'string'
    && value.allowed_next_step.trim().length > 0;
}

function summarizeMissingApprovedFactOutcome(outcome) {
  const idSuffix = outcome?.missing_fact_id ? ` (${outcome.missing_fact_id})` : '';
  return `blocked_by_missing_approved_fact: ${outcome?.missing_fact_type ?? 'unknown'}${idSuffix} - ${outcome?.missing_fact_description ?? 'approved fact is missing'} -> ${outcome?.allowed_next_step ?? 'return_to_candidate_selection_or_materialization_stage'}`;
}

function isTerminalStageFailureReason(reason) {
  if (typeof reason !== 'string') return false;
  const normalized = reason.trim();
  return normalized.includes('stage_failed / needs_manual_review:')
    || normalized.includes('blocked_by_missing_approved_fact:');
}

function formatNarratorClock(frame) {
  const clock = frame?.world?.time ?? frame?.time ?? frame?.clock ?? null;
  if (!clock || typeof clock !== 'object') return 'не указано';
  const day = Number.isFinite(clock.day) ? `День ${clock.day}` : 'День ?';
  const hour = Number.isFinite(clock.hour) ? String(clock.hour).padStart(2, '0') : '??';
  const minute = Number.isFinite(clock.minute) ? String(clock.minute).padStart(2, '0') : '??';
  const moment = describeNarratorClockMoment(clock);
  return moment ? `${day} • ${moment} • ${hour}:${minute}` : `${day} • ${hour}:${minute}`;
}

function describeNarratorClockMoment(clock) {
  if (!clock || typeof clock !== 'object') return '';
  const hour = Number(clock.hour);
  const minute = Number(clock.minute);
  if (!Number.isFinite(hour)) return '';
  const value = hour + (Number.isFinite(minute) ? minute / 60 : 0);
  if (value < 4) return 'глубокая ночь';
  if (value < 7) return 'предрассвет';
  if (value < 10) return 'утро';
  if (value < 12) return 'перед полуднем';
  if (value < 15) return 'полдень';
  if (value < 18) return 'день';
  if (value < 21) return 'вечер';
  return 'ночь';
}

function findNarratorClockConflict(proseText, frame) {
  const clock = frame?.world?.time ?? frame?.time ?? frame?.clock ?? null;
  if (!clock || typeof clock !== 'object') return null;
  const hour = Number(clock.hour);
  if (!Number.isFinite(hour)) return null;

  const text = String(proseText ?? '').toLowerCase();
  const bucket = hour < 5 ? 'night'
    : hour < 11 ? 'morning'
    : hour < 17 ? 'day'
    : hour < 22 ? 'evening'
    : 'night';
  const conflicts = [];

  if (bucket === 'morning' && /вечер|ноч|сумерк|закат|под вечер|к вечеру|после полудня/.test(text)) conflicts.push('вечер/ночь');
  if (bucket === 'day' && /ноч|сумерк|закат|под вечер|к вечеру|рассвет|утрен/.test(text)) conflicts.push('не день');
  if (bucket === 'evening' && /утр|рассвет|день|полдень/.test(text)) conflicts.push('не вечер');
  if (bucket === 'night' && /утр|рассвет|дн[ею]|полдень|полудн|вечер/.test(text)) conflicts.push('не ночь');

  if (conflicts.length === 0) return null;
  return {
    bucket,
    conflicts,
    message: `Narrator prose conflicts with world.clock (${formatNarratorClock(frame)}): ${conflicts.join(', ')}.`
  };
}

function summarizeInvalidNarratorAudit(text) {
  const parsed = parseJsonObject(text);
  if (!parsed) return 'narrator audit response was not valid JSON';
  return describeValidationErrors(explainSemanticAuditValidation(parsed)).join('; ') || 'narrator audit response violated semantic_audit contract';
}

function parseActorProfileResponse(text) {
  return validateActorProfiles(parseJsonObject(text));
}

function parseLocationProfileResponse(text) {
  return validateLocationProfiles(parseJsonObject(text));
}

export function describeValidationErrors(validation) {
  if (!validation || typeof validation !== 'object') return ['invalid response'];
  if (validation.ok) return [];
  return Array.isArray(validation.errors) && validation.errors.length ? validation.errors : ['invalid response'];
}

function isHistoricalAuditPassed(audit) {
  if (!audit) return false;
  return audit.pass === true;
}

function isActorProfileAuditPassed(audit) {
  if (!audit) return false;
  return audit.pass === true;
}

function isLocationProfileAuditPassed(audit) {
  if (!audit) return false;
  return audit.pass === true;
}


function throwGenerationFailure(kind, reason) {
  const message = String(reason || 'retry attempts exhausted without a valid LLM response');
  const prefix = `Unable to generate ${kind}:`;
  throw new Error(message.startsWith(prefix) ? message : `${prefix} ${message}.`);
}

function nextRetryDelay(attempt) {
  return Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * attempt);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeMessages(messages) {
  return messages
    .slice(0, 3)
    .map((message) => {
      const role = message?.role ?? 'message';
      const content = Array.isArray(message?.content)
        ? message.content.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ')
        : String(message?.content ?? '');
      return `${role}: ${clipText(content, 420)}`;
    })
    .join('\n');
}

function clipText(text, limit = 200) {
  const value = String(text ?? '').trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function splitTextLines(text, limit = 6) {
  return String(text ?? '')
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function section(title, lines = []) {
  return {
    title,
    lines: Array.isArray(lines) ? lines.filter(Boolean).map((item) => String(item)) : []
  };
}

function joinList(value, separator = ' | ', fallback = 'не предоставлено') {
  return Array.isArray(value) && value.length > 0 ? value.join(separator) : fallback;
}

function buildMasterAuditRequestSections(frame, localOutcome) {
  return [
    section('Вход', [
      `Команда: ${clipText(frame.input, 180)}`,
      `Интент: ${frame.intent?.type ?? 'не указано'}`,
      `Локальный исход: ${clipText(localOutcome, 220)}`
    ]),
    section('Контекст', [
      `Место: ${frame.world?.location?.name ?? 'не предоставлено'}`,
      `Микролокация: ${frame.world?.microPlace?.name ?? 'не предоставлено'}`,
      `Свидетели: ${joinList(frame.world?.social?.witnesses, ', ')}`
    ]),
    section('История', [
      `Регион: ${frame.historical?.regionalContext?.current?.name ?? 'не предоставлено'}`,
      `Эпоха: ${frame.historical?.era ?? 'не указано'}`,
      `Год: ${frame.historical?.year ?? 'не указано'}`
    ])
  ];
}

function buildMasterShapeRequestSections(frame, localOutcome) {
  return [
    section('Вход', [
      `Команда: ${clipText(frame.input, 180)}`,
      `Интент: ${frame.intent?.type ?? 'не указано'}`,
      `Локальный исход: ${clipText(localOutcome, 220)}`
    ]),
    section('Схема', [
      'scene',
      'consequence',
      'visible_details[]',
      'npc_reactions[]',
      'next_pressure',
      'state_delta?',
      'state_delta.item_changes[] -> перенос/взятие/сброс/передача предметов'
    ]),
    section('Контекст', [
      `Место: ${frame.world?.location?.name ?? 'не предоставлено'}`,
      `Социальный след: ${frame.world?.social?.trace ?? 'не предоставлено'}`
    ])
  ];
}

function buildSemanticTextSections(title, text) {
  return [
    section(title, splitTextLines(text))
  ];
}

function buildActorAuditRequestSections(world) {
  return [
    section('Мир', [
      `Эпоха: ${world.history?.era ?? 'не указано'}`,
      `Год: ${world.history?.year ?? 'не указано'}`,
      `Сезон: ${world.history?.season ?? 'не указано'}`,
      `Подсказка региона: ${world.history?.regionHint ?? 'не предоставлено'}`
    ]),
    section('Регион', [
      `Регион: ${world.region?.name ?? 'не предоставлено'}`,
      `Место: ${world.place?.name ?? 'не предоставлено'}`,
      `Социальная ткань: ${world.socialTissue?.powerStructure ?? 'не предоставлено'}`
    ])
  ];
}

function buildActorShapeRequestSections(world) {
  return [
    section('Schema', [
      'player + npcs[]',
      'actorProfile facts',
      'family / property / inventory / duties',
      'knowledge split and current routine'
    ]),
    section('Контекст', [
      `Эпоха: ${world.history?.era ?? 'не указано'}`,
      `Год: ${world.history?.year ?? 'не указано'}`,
      `Сезон: ${world.history?.season ?? 'не указано'}`,
      `Регион: ${world.region?.name ?? 'не предоставлено'}`,
      `Место: ${world.place?.name ?? 'не предоставлено'}`,
      `Социальная ткань: ${world.socialTissue?.powerStructure ?? 'не предоставлено'}`
    ])
  ];
}

function buildLocationAuditRequestSections(context) {
  return [
    section('World', [
      `Era: ${context.frame?.era ?? 'не указано'}`,
      `Year: ${context.frame?.year ?? 'не указано'}`,
      `Season: ${context.frame?.season ?? 'не указано'}`
    ]),
    section('Region', [
      `Region: ${context.frame?.regionName ?? 'не предоставлено'}`,
      `Current location: ${context.current?.name ?? 'не предоставлено'}`
    ])
  ];
}

function buildLocationShapeRequestSections(context) {
  return [
    section('Schema', [
      'locations[]',
      'historical_calendar + party_history',
      'purpose / owners / routes / access / memory'
    ]),
    section('Context', [
      `Region: ${context.frame?.regionName ?? 'не предоставлено'}`,
      `Season: ${context.frame?.season ?? 'не указано'}`,
      `Uncertainty: ${context.uncertainty?.slice(0, 3).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function buildMasterRequestSections(frame, localOutcome) {
  return [
    section('Вход', [
      `Команда: ${clipText(frame.input, 180)}`,
      `Интент: ${frame.intent?.type ?? 'не указано'}`,
      `Локальный исход: ${clipText(localOutcome, 220)}`
    ]),
    section('Контекст', [
      `Локация: ${frame.world?.location?.name ?? 'не предоставлено'}`,
      `Погода/сцена: ${frame.world?.location?.kind ?? 'не предоставлено'}`,
      `Состояние следа: ${frame.world?.social?.trace ?? 'не предоставлено'}`
    ]),
    section('Регион', [
      frame.historical?.regionalContext?.current?.name
        ? `Регион: ${frame.historical.regionalContext.current.name}`
        : 'Регион: отсутствует',
      `Пейзаж: ${frame.historical?.regionalContext?.current?.landscape?.[0] ?? 'не предоставлено'}`,
      `Экономика: ${frame.historical?.regionalContext?.current?.economy?.[0] ?? 'не предоставлено'}`,
      `Власть: ${frame.historical?.regionalContext?.current?.power?.[0] ?? 'не предоставлено'}`
    ]),
    section('Ограничения', [
      `Право: ${frame.legal?.rules?.join(' | ') || 'не предоставлено'}`,
      `Ограничения: ${frame.constraints?.join(' | ') || 'не предоставлено'}`,
      `Риски: ${frame.risks?.join(' | ') || 'не предоставлено'}`
    ]),
    section('Память и путь', [
      `Реконструкция: ${frame.world?.travel?.routeReconstruction?.summary ?? 'не предоставлено'}`,
      `Архив путей: ${(frame.world?.travel?.routeArchive ?? []).slice(0, 2).map((item) => item.summary).join(' | ') || 'не предоставлено'}`,
      `Медицина: ${frame.world?.medical?.context?.slice(0, 2).join(' | ') || 'не предоставлено'}`
    ]),
    section('Проверка', [
      frame.check?.required
        ? `d20=${frame.check.roll ?? 'pending'} DC=${frame.check.dc} mod=${frame.check.modifier} deg=${frame.check.degree}`
        : 'Проверка не нужна'
    ])
  ];
}

function buildRiskRequestSections(frame) {
  return [
    section('Вход', [
      `Команда: ${clipText(frame.input, 180)}`,
      `Интент: ${frame.intent?.type ?? 'не указано'}`
    ]),
    section('Контекст', [
      `Локация: ${frame.world?.location?.name ?? 'не предоставлено'}`,
      `Микролокация: ${frame.world?.microPlace?.name ?? 'не предоставлено'}`,
      `Свидетели: ${(frame.world?.social?.witnesses?.length ? frame.world.social.witnesses : ['не предоставлено']).join(', ')}`
    ]),
    section('История и право', [
      `Регион: ${frame.historical?.regionalContext?.current?.name ?? 'не предоставлено'}`,
      `Период: ${frame.historical?.era ?? 'не указано'}, ${frame.historical?.year ?? 'не указано'}`,
      `Право: ${frame.legal?.rules?.join(' | ') || 'не предоставлено'}`
    ]),
    section('Риск', [
      `Constraints: ${frame.constraints?.join(' | ') || 'не предоставлено'}`,
      `Risks: ${frame.risks?.join(' | ') || 'не предоставлено'}`,
      `Effects: ${frame.possibleEffects?.join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function buildActorRequestSections(world) {
  const context = buildActorPromptContext(world);
  const player = context.player ?? {};
  const npcs = context.actors ?? [];
  return [
    section('История', [
      `Эпоха: ${world.history?.era ?? 'не указано'}`,
      `Год: ${world.history?.year ?? 'не указано'}`,
      `Сезон: ${world.history?.season ?? 'не указано'}`,
      `Регион: ${world.history?.regionHint ?? 'не предоставлено'}`
    ]),
    section('Регион', [
      `Регион: ${world.region?.name ?? 'не предоставлено'}`,
      `Социальная ткань: ${world.socialTissue?.powerStructure ?? 'не предоставлено'}`
    ]),
    section('Герой', [
      `Имя: ${player.name ?? 'player'}`,
      `Роль: ${player.role ?? 'не указано'}`,
      `Статус: ${player.status ?? 'не указано'}`,
      `Происх.: ${player.socialClass ?? 'не указано'}`
    ]),
    section('Сцена', npcs.map((npc) => `${npc.name ?? 'npc'} · ${npc.role ?? 'не указано'} · ${npc.locationId ?? 'не предоставлено'}`)),
    section('Якоря', [
      `Локация: ${context.scene?.location?.name ?? 'не предоставлено'}`,
      `Микролокация: ${context.scene?.microLocation?.name ?? 'не предоставлено'}`,
      `Неизвестность: ${joinList(context.uncertainty)}`
    ]),
    section('Контекст места', [
      `Место: ${context.scene?.location?.name ?? 'не предоставлено'}`,
      `Тип: ${context.scene?.location?.kind ?? 'не предоставлено'}`,
      `Переходы: ${(context.scene?.location?.exits ?? []).slice(0, 3).map((item) => item.label ?? item.name ?? item.direction ?? item).join(' | ') || 'не предоставлено'}`
    ])
  ];
}

function buildLocationRequestSections(context) {
  return [
    section('Календарь', [
      `Эпоха: ${context.frame?.era ?? 'не указано'}`,
      `Год: ${context.frame?.year ?? 'не указано'}`,
      `Сезон: ${context.frame?.season ?? 'не указано'}`
    ]),
    section('Регион', [
      `Регион: ${context.frame?.regionName ?? 'не предоставлено'}`,
      `Текущая локация: ${context.current?.name ?? 'не предоставлено'}`,
      `Соседние точки: ${joinList((context.neighbors ?? []).map((item) => item.name))}`
    ]),
    section('Партия', [
      `Uncertainty: ${Array.isArray(context.uncertainty) ? context.uncertainty.slice(0, 3).join(' | ') : 'не предоставлено'}`,
      `Локальные владельцы: ${context.current?.ownership ?? 'не предоставлено'}`,
      `Доступ: ${Array.isArray(context.current?.accessRules) ? context.current.accessRules.slice(0, 3).join(' | ') : 'не предоставлено'}`
    ]),
    section('Места', [
      `${context.current?.name ?? 'location'} · ${context.current?.kind ?? 'не указано'} · ${context.current?.purpose ?? 'purpose?'}`,
      ...(context.neighbors ?? []).slice(0, 3).map((location) => `${location.name ?? 'location'} · ${location.kind ?? 'не указано'} · ${location.purpose ?? 'purpose?'}`)
    ])
  ];
}

function buildMasterResponseSections(parsed) {
  if (!parsed) return [];
  return [
    section('Сцена', [
      parsed.scene,
      parsed.consequence,
      parsed.next_pressure
    ]),
    section('Видимое', Array.isArray(parsed.visible_details) ? parsed.visible_details.slice(0, 5) : []),
    section('NPC', Array.isArray(parsed.npc_reactions) ? parsed.npc_reactions.slice(0, 5) : []),
    section('Предметы', Array.isArray(parsed.state_delta?.item_changes) ? parsed.state_delta.item_changes.slice(0, 5).map((item) => (typeof item === 'string' ? item : JSON.stringify(item))) : []),
    section('Аудит', parsed.historical_audit ? [
      `pass=${parsed.historical_audit.pass}`,
      `concerns=${parsed.historical_audit.concerns?.slice(0, 3).join(' | ') || 'не предоставлено'}`,
      `evidence=${parsed.historical_audit.evidence?.slice(0, 3).join(' | ') || 'не предоставлено'}`
    ] : [])
  ];
}

function buildRiskResponseSections(parsed) {
  if (!parsed) return [];
  return [
    section('Вердикт', [
      `required=${parsed.required}`,
      `reason=${parsed.reason}`,
      `complexity=${parsed.complexity}`,
      `visibility=${parsed.visibility}`
    ]),
    section('Факторы', Array.isArray(parsed.factors) ? parsed.factors.slice(0, 6) : [])
  ];
}

function buildActorResponseSections(parsed) {
  if (!parsed) return [];
  const sections = [];
  if (parsed.player) {
    sections.push(section('Герой', summarizeProfileNode(parsed.player)));
  }
  if (Array.isArray(parsed.npcs)) {
    sections.push(section('NPC', parsed.npcs.slice(0, 4).map((npc, index) => {
      const title = npc?.name ?? `npc-${index + 1}`;
      const role = npc?.role ?? 'не указано';
      const level = npc?.profileLevel ?? 'не указано';
      const pos = npc?.actorProfile?.identity?.worldPosition ?? npc?.worldPosition ?? 'не указано';
      return `${title} · ${level} · ${role} · ${pos}`;
    })));
  }
  if (parsed.historical_audit) {
    sections.push(section('Аудит', [
      `pass=${parsed.historical_audit.pass}`,
      `concerns=${parsed.historical_audit.concerns?.slice(0, 3).join(' | ') || 'не предоставлено'}`
    ]));
  }
  return sections;
}

function buildLocationResponseSections(parsed) {
  if (!parsed) return [];
  const locations = Array.isArray(parsed.locations) ? parsed.locations : [];
  return [
    section('Локации', locations.slice(0, 4).map((location, index) => {
      const label = location?.name ?? `location-${index + 1}`;
      const kind = location?.kind ?? 'не указано';
      const purpose = location?.purpose ?? 'purpose?';
      return `${label} · ${kind} · ${purpose}`;
    })),
    section('Текущие периоды', locations.slice(0, 3).map((location) => {
      const period = location?.currentPeriod?.label ?? location?.currentPeriod ?? 'no-period';
      return `${location?.name ?? 'location'}: ${period}`;
    })),
    parsed.historical_audit
      ? section('Аудит', [
          `pass=${parsed.historical_audit.pass}`,
          `concerns=${parsed.historical_audit.concerns?.slice(0, 3).join(' | ') || 'не предоставлено'}`
        ])
      : section('Аудит', [])
  ];
}

function buildRetryResponseSections(rawText) {
  const text = clipText(rawText || 'Ответ отсутствует', 420);
  return [
    section('Сырой ответ', [text])
  ];
}

function buildValidationErrorSections(title, validation) {
  return [
    section(title, describeValidationErrors(validation))
  ];
}

function normalizeActorProfilesOutput(data, world) {
  const currentPlayer = isRecord(world?.player) ? world.player : {};
  const inputPlayer = isRecord(data?.player) ? data.player : {};
  const currentPosition = world?.current_position ?? world?.player?.position ?? null;
  const canonicalName = String(currentPlayer.name ?? inputPlayer.name ?? '').trim();
  const player = buildPlayerProfile({
    ...currentPlayer,
    ...inputPlayer,
    ...(canonicalName ? { name: canonicalName } : {}),
    current_position: currentPlayer.current_position ?? currentPosition,
    position: currentPlayer.position ?? currentPosition
  });
  const currentLocationId = world?.current_position?.location_id ?? null;
  const currentNpcs = Array.isArray(world?.npcs) ? world.npcs : [];
  const inputNpcs = Array.isArray(data?.npcs) && data.npcs.length > 0 ? data.npcs : currentNpcs;

  const npcs = currentNpcs.length > 0
    ? currentNpcs.map((baseNpc, index) => {
      const generatedNpc = inputNpcs.find((item) => isRecord(item) && item.id && item.id === baseNpc.id) ?? inputNpcs[index] ?? baseNpc;
      const profileLevel = isRecord(generatedNpc)
        ? (generatedNpc.profileLevel ?? baseNpc.profileLevel ?? baseNpc.actorProfile?.profileLevel ?? null)
        : (baseNpc.profileLevel ?? baseNpc.actorProfile?.profileLevel ?? null);
      return buildNpcProfile({
        ...baseNpc,
        ...(isRecord(generatedNpc) ? generatedNpc : {}),
        profileLevel,
        current_position: baseNpc.current_position ?? currentPosition,
        position: baseNpc.position ?? currentPosition,
        ...(baseNpc.id && !(generatedNpc && typeof generatedNpc === 'object' && !Array.isArray(generatedNpc) && generatedNpc.id) ? { id: baseNpc.id } : {})
      }, currentLocationId, index, player, currentPosition);
    })
    : inputNpcs.map((generatedNpc, index) => buildNpcProfile(isRecord(generatedNpc) ? generatedNpc : {}, currentLocationId, index, player, currentPosition));

  return {
    version: 1,
    schema: 'actor_profiles',
    player,
    npcs
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function summarizeProfileNode(node) {
  if (!node || typeof node !== 'object') return ['не указано'];
  return [
    `name=${node.name ?? 'не указано'}`,
    `status=${node.status ?? 'не указано'}`,
    `role=${node.role ?? 'не указано'}`,
    `worldPosition=${node.actorProfile?.identity?.worldPosition ?? node.worldPosition ?? 'не указано'}`
  ];
}

export { buildNarratorShapeMessages, buildNarratorDossierMessages } from './narrator-prompts.js';
export { buildProsePromptHeader, buildStructuredShapePromptHeader, buildRepairPromptHeader } from './prompt-headers.js';
export { buildVisibleContextInput, buildDeterministicVisiblePackage, validateVisibleContextPackage, stripHiddenForNarrator } from './visibility.js';
export { validateAgentPrompt, shouldEnforcePromptGuard } from './prompt-guard.js';
