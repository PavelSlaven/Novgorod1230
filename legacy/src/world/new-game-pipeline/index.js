import { getNewGameKnowledgeHiddenRoleDescriptor } from '@rus/llm-runtime';
import { createNewGamePipelineContext } from './context.js';
import { getNewGameStageMatrix, getNewGameStageMatrixEntry, NEW_GAME_CRITICAL_STAGE_IDS, NEW_GAME_MODEL_TIERS, NEW_GAME_REPAIR_ESCALATION_POLICY } from './llm-matrix.js';
import { getNewGameStageRegistry } from './registry.js';
import { runCommitGate } from './commit/commit-gate.js';
import {
  buildApprovedPipelineManifest,
  buildStage24Approval,
  buildStage24Input,
  runStage24PartyDbWritePlanBlock,
  STAGE24_RESULT_SCHEMA,
  validateProvidedStage24Result,
  validateStage24ToStage25Handoff
} from './stages/stage24-party-db-write-plan.js';
import {
  checkPartyCommitIdempotency,
  executeApprovedAtomicTransaction,
  executeDryRunTransaction,
  readCommittedPartyState
} from './commit/party-transaction.js';
import {
  buildStage25Approval,
  buildStage25CommitInput,
  runStage25PartyCommitBlock,
  STAGE25_RESULT_SCHEMA,
  validateProvidedStage25Result,
  validateStage25ToStage26Handoff
} from './stages/stage25-party-commit.js';
import {
  buildStage26Input,
  runStage26FirstGameScreenBlock,
  STAGE26_RESULT_SCHEMA,
  validateProvidedStage26Result,
  validateStage26ToStage27Handoff
} from './stages/stage26-first-game-screen.js';
import { createFirstScreenDeliveryAttempt } from './delivery/first-screen-delivery.js';
import { runNewGameRetrievalStages4To8 } from './stages/code-stages.js';
import { runNewGameG5Stages13To14, runStage14G5Audit } from './stages/g5-stages.js';
import { retrieveWeatherState, validateWeatherState } from './retrievers/weather-state.js';
import {
  buildStage17TimeLightInput,
  emptyDraftVisibleContextPackage,
  runStage17TimeLightGateBlock,
  STAGE17_AUDIT_SCHEMA,
  STAGE17_ROUTE_SCHEMA,
  validateStage17TimeLightAudit,
  validateStage17TimeLightInput,
  validateStage17TimeLightRoute
} from './stages/stage17-time-light-gate.js';
import {
  buildCharacterKnowledgeAuditInput,
  buildCharacterKnowledgeCodePrecheck,
  buildCharacterKnowledgeWriteProjection,
  buildStage18CharacterKnowledgeInput,
  buildStage18ReferenceIndex,
  DEFAULT_STAGE18_KNOWLEDGE_POLICY,
  normalizeStage18KnowledgePolicy,
  runStage18CharacterKnowledgeMapBlock,
  STAGE18_AUDIT_SCHEMA,
  STAGE18_INPUT_SCHEMA,
  STAGE18_OUTPUT_SCHEMA,
  STAGE18_PRECHECK_SCHEMA,
  STAGE18_RESULT_SCHEMA,
  STAGE18_WRITE_PLAN_SCHEMA,
  validateCharacterKnowledgeAudit,
  validateCharacterKnowledgeMap,
  validateCharacterKnowledgeWriteProjection,
  validateStage18Input,
  validateProvidedStage18Result
} from './stages/stage18-character-knowledge-map.js';
import {
  buildStage20ReferenceIndex,
  buildStage20VisibilityFilter,
  buildStage20VisibleContextInput,
  buildVisibleContextBuilderRoleInput,
  buildVisibleContextCodePrecheck,
  DEFAULT_STAGE20_VISIBLE_CONTEXT_POLICY,
  normalizeStage20VisibleContextPolicy,
  runStage20VisibleContextBlock,
  STAGE20_INPUT_SCHEMA,
  STAGE20_OUTPUT_SCHEMA,
  STAGE20_PRECHECK_SCHEMA,
  STAGE20_RESULT_SCHEMA,
  STAGE20_VISIBILITY_FILTER_SCHEMA,
  validateStage20CommitPermission,
  validateStage20Input,
  validateVisibleContextPackage,
  validateProvidedStage20Result
} from './stages/stage20-visible-context.js';
import {
  STAGE21_RESULT_SCHEMA,
  STAGE21_ROUTE_SCHEMA,
  returnStageNumber,
  validateProvidedStage21Result
} from './stages/stage21-visible-context-audit.js';
import {
  buildStage23RepairSignature,
  buildStage23UpstreamRepairRequest,
  STAGE23_RESULT_SCHEMA,
  validateProvidedStage23Result
} from './stages/stage23-narrator-prose-audit.js';
import {
  getNewGameLlmStageDefinition,
  runStage10StartPlaceAudit,
  runStage11PlayerCharacter,
  runStage12PlayerCharacterAudit,
  runStage15NpcPlacement,
  runStage16ItemPlacement,
  runStage18MapKnowledge,
  runStage19HiddenState,
  runStage20VisibleContext,
  runStage21VisibleContextAudit,
  runStage22NarratorProse,
  repairStage22NarratorProse,
  repairStage22NarratorProseFormat,
  runStage23NarratorProseAudit,
  runStage2NormalizeRequest,
  runStage3HistoricalFrame,
  runStage9StartNodeSelection
} from './stages/llm-stages.js';
import { getNewGameLlmTierConfig, getNewGameLlmTierConfigs, LLM_SCOPES } from '../provider-config.js';
import { executeRoleLlmCall } from '../provider-runtime.js';
import { createGateResult } from './gate.js';
import { runLlmStageGate } from './llm-stage.js';
import {
  buildStage5StartCandidatesInput,
  validateStartCandidateSet
} from './stages/stage5-start-candidates.js';
import { validateCandidatePlaceTemplateSet } from './retrievers/place-templates.js';
import { validateNpcCandidateSet } from './retrievers/npc-candidates.js';
import { buildStage6CandidatePlaceTemplatesInput } from './stages/stage6-candidate-place-templates.js';
import { buildStage7NpcCandidatesInput } from './stages/stage7-npc-candidates.js';
import { buildStage3HistoricalFrameInput } from './stages/stage3-historical-frame.js';
import { validateRegionalContextPackage } from './retrievers/regional-context.js';
import {
  composeApprovedStartPosition,
  composeValidatedPlayerSeed,
  extractValidatedG5PositionRefs,
  extractValidatedStartSceneRefs
} from './composition.js';
import { createFrozenArtifactRecord, createLifecycleFailure } from './lifecycle.js';

export { createNewGamePipelineContext } from './context.js';
export { auditPartyDbWritePlan, runCommitGate, validatePartyDbWritePlan } from './commit/commit-gate.js';
export {
  checkPartyCommitIdempotency,
  executeApprovedAtomicTransaction,
  executeAtomicPartyWritePlan,
  executeDryRunTransaction,
  readCommittedPartyState,
  validateExecutableWritePlan
} from './commit/party-transaction.js';
export {
  buildStage25Approval,
  buildStage25CommitInput,
  runStage25PartyCommitBlock,
  validateStage25ToStage26Handoff
} from './stages/stage25-party-commit.js';
export {
  buildApprovedPipelineManifest,
  buildStage24Approval,
  buildStage24Input,
  runStage24PartyDbWritePlanBlock,
  validateStage24ToStage25Handoff
} from './stages/stage24-party-db-write-plan.js';
export { assertGatePassed, createGateResult, runCodeGate, runStartCandidateSetGate } from './gate.js';
export {
  getNewGameStageMatrix,
  getNewGameStageMatrixEntry,
  NEW_GAME_CRITICAL_STAGE_IDS,
  NEW_GAME_MODEL_TIERS,
  NEW_GAME_REPAIR_ESCALATION_POLICY
} from './llm-matrix.js';
export { createLlmStageAdapter, createLlmStageStub, runLlmStageGate } from './llm-stage.js';
export {
  isG5RuntimeEnabled,
  loadG5ContractSchema,
  loadG5ToolMetadata,
  runG5AuditAdapter,
  runG5MaterializationAdapter,
  validateRequiredContractFields
} from './g5-runtime.js';
export { getNewGamePhaseId, getNewGameStage, getNewGameStageRegistry, NEW_GAME_STAGE_COUNT } from './registry.js';
export { getNewGameLlmTierConfig, getNewGameLlmTierConfigs } from '../provider-config.js';
export { executeRoleLlmCall } from '../provider-runtime.js';
export {
  createFrozenArtifactRecord,
  createLifecycleFailure,
  deriveMutableScope,
  evaluateAntiRegression,
  evaluateDependencyGate,
  PRIMARY_STAGE_TYPES
} from './lifecycle.js';
export {
  DEFAULT_STAT_POLICY,
  diffForbiddenPathChanges,
  flattenObjectPaths,
  validateNumericStatPolicy,
  validatePositionReferenceConsistency,
  validateVisibleHiddenBoundary
} from './validators.js';
export {
  composeApprovedStartPosition,
  composeValidatedPlayerSeed,
  extractValidatedG5PositionRefs,
  extractValidatedStartSceneRefs
} from './composition.js';
export {
  DEFAULT_LOAD_POLICY,
  normalizeLoadPolicy
} from './retrievers/common.js';
export {
  retrieveRegionalContextPackage,
  validateRegionalContextPackage
} from './retrievers/regional-context.js';
export { retrieveStartCandidates } from './retrievers/start-candidates.js';
export { retrieveWeatherState, validateWeatherState } from './retrievers/weather-state.js';
export {
  buildNormalizedVisibilityConstraints,
  buildStage17SemanticAuditInput,
  buildStage17TimeLightCodePrecheck,
  buildStage17TimeLightInput,
  emptyDraftVisibleContextPackage,
  normalizeStage17TimeLightPolicy,
  runStage17TimeLightGateBlock,
  validateStage17TimeLightAudit,
  validateStage17TimeLightInput,
  validateStage17TimeLightRoute
} from './stages/stage17-time-light-gate.js';
export {
  buildCharacterKnowledgeAuditInput,
  buildCharacterKnowledgeCodePrecheck,
  buildCharacterKnowledgeWriteProjection,
  buildStage18CharacterKnowledgeInput,
  buildStage18ReferenceIndex,
  DEFAULT_STAGE18_KNOWLEDGE_POLICY,
  normalizeStage18KnowledgePolicy,
  runStage18CharacterKnowledgeMapBlock,
  STAGE18_AUDIT_SCHEMA,
  STAGE18_INPUT_SCHEMA,
  STAGE18_OUTPUT_SCHEMA,
  STAGE18_PRECHECK_SCHEMA,
  STAGE18_RESULT_SCHEMA,
  STAGE18_WRITE_PLAN_SCHEMA,
  validateCharacterKnowledgeAudit,
  validateCharacterKnowledgeMap,
  validateCharacterKnowledgeWriteProjection,
  validateStage18Input,
  validateProvidedStage18Result
} from './stages/stage18-character-knowledge-map.js';
export {
  buildStage20ReferenceIndex,
  buildStage20VisibilityFilter,
  buildStage20VisibleContextInput,
  buildVisibleContextBuilderRoleInput,
  buildVisibleContextCodePrecheck,
  DEFAULT_STAGE20_VISIBLE_CONTEXT_POLICY,
  normalizeStage20VisibleContextPolicy,
  runStage20VisibleContextBlock,
  STAGE20_INPUT_SCHEMA,
  STAGE20_OUTPUT_SCHEMA,
  STAGE20_PRECHECK_SCHEMA,
  STAGE20_RESULT_SCHEMA,
  STAGE20_VISIBILITY_FILTER_SCHEMA,
  validateStage20CommitPermission,
  validateStage20Input,
  validateVisibleContextPackage,
  validateProvidedStage20Result
} from './stages/stage20-visible-context.js';
export {
  buildStage21AuditCodePrecheck,
  buildStage21ReferenceIndex,
  buildStage21VisibleContextAuditInput,
  DEFAULT_STAGE21_AUDIT_POLICY,
  normalizeStage21AuditPolicy,
  returnStageNumber,
  runStage21VisibleContextAuditBlock,
  STAGE21_ALLOWED_CONCERN_CODES,
  STAGE21_ALLOWED_REPAIR_KINDS,
  STAGE21_ALLOWED_RETURN_STAGES,
  STAGE21_ALLOWED_SEVERITIES,
  STAGE21_INPUT_SCHEMA,
  STAGE21_OUTPUT_SCHEMA,
  STAGE21_PRECHECK_SCHEMA,
  STAGE21_REQUIRED_CHECKS,
  STAGE21_RESULT_SCHEMA,
  STAGE21_ROUTE_SCHEMA,
  validateProvidedStage21Result,
  validateStage21Input,
  validateStage21RepairRoute,
  validateVisibleContextAuditOutput
} from './stages/stage21-visible-context-audit.js';
export {
  buildNarratorStartCodePrecheck,
  buildStage21Approval,
  buildStage22NarratorInput,
  buildStage22ReferenceIndex,
  DEFAULT_STAGE22_NARRATOR_POLICY,
  normalizeStage22NarratorPolicy,
  runStage22NarratorProseBlock,
  runStage22FormatRepairBlock,
  runStage22SemanticRepairBlock,
  STAGE22_ALLOWED_ACTION_KINDS,
  STAGE22_ALLOWED_BASES,
  STAGE22_ALLOWED_BLOCK_REASONS,
  STAGE22_ALLOWED_RISK_HINTS,
  STAGE22_ALLOWED_STATUSES,
  STAGE22_APPROVAL_SCHEMA,
  STAGE22_INPUT_SCHEMA,
  STAGE22_OUTPUT_SCHEMA,
  STAGE22_PRECHECK_SCHEMA,
  STAGE22_RESULT_SCHEMA,
  validateNarratorStartingProseOutput,
  validateProvidedStage22Result,
  validateStage22Input
} from './stages/stage22-narrator-prose.js';
export {
  buildNarratorProseCodePrecheck,
  buildStage23AuditInput,
  buildStage23RepairSignature,
  buildStage23UpstreamRepairRequest,
  computeNarratorStartingProseDigest,
  DEFAULT_STAGE23_AUDIT_POLICY,
  normalizeStage23AuditPolicy,
  runStage23NarratorProseAuditBlock,
  STAGE23_AUDIT_SCHEMA,
  STAGE23_CONCERN_CODES,
  STAGE23_INPUT_SCHEMA,
  STAGE23_PRECHECK_SCHEMA,
  STAGE23_RESULT_SCHEMA,
  STAGE23_ROUTE_SCHEMA,
  STAGE23_ROUTES,
  STAGE23_SEVERITIES,
  STAGE23_UPSTREAM_REPAIR_SCHEMA,
  validateNarratorProseAudit,
  validateStage23CommitHandoff,
  validateProvidedStage23Result,
  validateStage23AuditInput,
  validateStage23RepairRoute
} from './stages/stage23-narrator-prose-audit.js';
export { canonicalJson, computeVisibleContextPackageDigest } from './stages/visible-context-digest.js';
export {
  buildFullHiddenStateAuditInput,
  buildFullHiddenStateCodePrecheck,
  buildStage19HiddenStateInput as buildIsolatedStage19HiddenStateInput,
  buildStage19ReferenceIndex,
  classifyStage19Failure,
  DEFAULT_STAGE19_HIDDEN_STATE_POLICY,
  emptyWorldBaseRouteSnapshot,
  normalizeStage19HiddenStatePolicy,
  runStage19HiddenStateBlock,
  STAGE19_AUDIT_SCHEMA,
  STAGE19_INPUT_SCHEMA,
  STAGE19_OUTPUT_SCHEMA,
  STAGE19_PRECHECK_SCHEMA,
  STAGE19_RESULT_SCHEMA,
  validateFullHiddenSceneState,
  validateFullHiddenStateAudit,
  validateStage19CommitPermission,
  validateStage19Input
} from './stages/stage19-hidden-state.js';
export {
  retrieveCandidatePlaceTemplates,
  validateCandidatePlaceTemplateSet
} from './retrievers/place-templates.js';
export {
  retrieveNpcCandidates,
  validateNpcCandidateSet
} from './retrievers/npc-candidates.js';
export {
  runNewGameRetrievalStages4To8,
  runStage4RegionalContext,
  runStage8ItemProfileCandidates
} from './stages/code-stages.js';
export {
  runNewGameG5Stages13To14,
  runStage13G5Materialization,
  runStage14G5Audit
} from './stages/g5-stages.js';
export {
  buildStage2NormalizationInput,
  buildStage2NormalizationPolicy,
  normalizeStage2ClientDefaults,
  normalizeStage2UiFields,
  STAGE_2_REQUIRED_FIELDS,
  validateStage2NormalizedRequest
} from './stages/stage2-normalization.js';
export {
  buildStage5StartCandidatesInput,
  runStage5StartCandidates,
  validateStartCandidateSet
} from './stages/stage5-start-candidates.js';
export {
  buildStage6CandidatePlaceTemplatesInput,
  runStage6CandidatePlaceTemplates,
  validateCandidatePlaceTemplateSetGate
} from './stages/stage6-candidate-place-templates.js';
export {
  buildStage7NpcCandidatesInput,
  runStage7NpcCandidates,
  validateNpcCandidateSetGate
} from './stages/stage7-npc-candidates.js';
export {
  buildStage3BoundaryPolicy,
  buildStage3HistoricalFrameInput,
  buildStage3SelectionPolicy,
  defaultTimeOfDayPolicies,
  normalizeStage3CandidateSet,
  retrieveHistoricalFrameCandidates,
  STAGE_3_REQUIRED_FIELDS,
  validateStage3HistoricalFrame
} from './stages/stage3-historical-frame.js';
export {
  getNewGameLlmStageDefinition,
  NEW_GAME_LLM_STAGE_IDS,
  runNewGameLlmStage,
  runStage2NormalizeRequest,
  runStage3HistoricalFrame,
  runStage9StartNodeSelection,
  runStage10StartPlaceAudit,
  runStage11PlayerCharacter,
  runStage12PlayerCharacterAudit,
  runStage15NpcPlacement,
  runStage16ItemPlacement,
  runStage18MapKnowledge,
  runStage19HiddenState,
  runStage20VisibleContext,
  runStage21VisibleContextAudit,
  runStage22NarratorProse,
  repairStage22NarratorProseFormat,
  runStage23NarratorProseAudit
} from './stages/llm-stages.js';
export {
  buildFirstGameScreen,
  buildFirstScreenCodePrecheck,
  buildStage26Approval,
  buildStage26Input,
  computeStage26Digest,
  findForbiddenFirstScreenFields,
  runStage26FirstGameScreenBlock,
  validateFirstGameScreen,
  validateProvidedStage26Result,
  validateStage26Input,
  validateStage26ToStage27Handoff
} from './screens/first-game-screen.js';
export {
  acknowledgeFirstScreenDelivery,
  buildFirstScreenDeliveryAck,
  buildStage27FirstTurnInput,
  createFirstScreenDeliveryAttempt,
  markFirstScreenDeliverySent,
  validateDeliveryAcknowledgement,
  validateDeliveryAttempt,
  validateStage26ToStage27IntentHandoff
} from './delivery/first-screen-delivery.js';
export { acknowledgeFirstScreenDelivery as acknowledgeOpeningDelivery } from './delivery/first-screen-delivery.js';
export { buildFinalWorldStartBundle };

export function createUnifiedNewGameLlmStageExecutor({ env = process.env, buildMessages } = {}) {
  if (typeof buildMessages !== 'function') {
    throw new Error('createUnifiedNewGameLlmStageExecutor requires buildMessages(stageContext).');
  }
  return async function unifiedNewGameLlmStageExecutor(stageContext = {}) {
    const tierId = getNewGameStageMatrixEntry(stageContext.stage?.id)?.model_tier ?? null;
    const messages = await buildMessages(stageContext);
    const result = await executeRoleLlmCall({
      scope: LLM_SCOPES.NEW_GAME,
      tierId,
      env,
      messages
    });
    if (result.status !== 'ok') {
      throw new Error(`New-game LLM stage ${stageContext.stage?.id ?? '?'} failed: ${result.error?.message ?? result.status}`);
    }
    return result.parsed_json ?? result.raw_text;
  };
}

export async function runNewGamePipeline(options = {}) {
  if (options.enableNewGamePipeline !== true) {
    throw new Error('26-step new-game pipeline is opt-in only: pass enableNewGamePipeline=true.');
  }

  const context = createNewGamePipelineContext(options);
  context.setStageOutput(1, {
    version: 1,
    schema: 'new_game_player_request',
    request_id: context.requestId,
    start_text: context.startText,
    player_name: context.playerName
  });

  context.setGateResult(1, createGateResult({
    stageId: 1,
    stageSlug: 'player_request',
    pass: true,
    evidence: [{ kind: 'raw_player_request_captured' }]
  }));

  const normalizedRequest = await runRequiredLlmStage(
    context,
    2,
    options,
    () => runStage2NormalizeRequest(context, {
      executor: selectStageExecutor(options, 2, 'normalize_request')
    })
  );
  const historicalFrame = await runRequiredLlmStage(
    context,
    3,
    options,
    () => runStage3HistoricalFrame(context, {
      executor: selectStageExecutor(options, 3, 'historical_frame'),
      queryable: options.queryable ?? null,
      env: context.env,
      availableCandidates: options.historicalFrameCandidateSet ?? options.stage3CandidateSet ?? null,
      selectionPolicy: options.policies?.historical_frame_selection_policy ?? options.historicalFrameSelectionPolicy ?? {},
      candidatePolicy: options.policies?.historical_frame_candidate_policy ?? options.historicalFrameCandidatePolicy ?? {}
    })
  );
  if (!historicalFrame) {
    throw new Error('historicalFrame is required unless enableLlmStageAdapters=true with llmStageExecutor.');
  }

  const providedStage4 = options.stageOutputs?.[4]
    ?? options.stageOutputs?.regional_context
    ?? options.stageOutputs?.regional_context_package
    ?? null;
  if (providedStage4) {
    if (context.env?.NODE_ENV === 'production' && options.allowProvidedStageOutputs !== true) {
      throw new Error('Provided stage 4 output is disabled in production unless allowProvidedStageOutputs=true.');
    }
    await commitProvidedStageOutput(context, 4, 'regional_context', providedStage4, {}, {
      ...options,
      normalizedRequest,
      historicalFrame,
      loadPolicy: options.policies?.load_policy ?? {}
    });
  }

  const providedStage5 = options.stageOutputs?.[5]
    ?? options.stageOutputs?.start_candidates
    ?? options.stageOutputs?.start_candidate_set
    ?? null;
  if (providedStage5) {
    if (context.env?.NODE_ENV === 'production' && options.allowProvidedStageOutputs !== true) {
      throw new Error('Provided stage 5 output is disabled in production unless allowProvidedStageOutputs=true.');
    }
    await commitProvidedStageOutput(context, 5, 'start_candidates', providedStage5, {}, {
      ...options,
      normalizedRequest,
      historicalFrame,
      regionalContextPackage: context.getStageOutput(4) ?? null,
      candidatePolicy: options.policies?.candidate_policy ?? {}
    });
  }

  const providedStage6 = options.stageOutputs?.[6]
    ?? options.stageOutputs?.candidate_place_templates
    ?? options.stageOutputs?.candidate_place_template_set
    ?? null;
  if (providedStage6) {
    if (context.env?.NODE_ENV === 'production' && options.allowProvidedStageOutputs !== true) {
      throw new Error('Provided stage 6 output is disabled in production unless allowProvidedStageOutputs=true.');
    }
    await commitProvidedStageOutput(context, 6, 'candidate_place_templates', providedStage6, {}, {
      ...options,
      normalizedRequest,
      historicalFrame,
      regionalContextPackage: context.getStageOutput(4) ?? null,
      startCandidateSet: context.getStageOutput(5) ?? null,
      templatePolicy: options.policies?.template_policy ?? {}
    });
  }

  const providedStage7 = options.stageOutputs?.[7]
    ?? options.stageOutputs?.npc_candidates
    ?? options.stageOutputs?.npc_candidate_set
    ?? null;
  if (providedStage7) {
    if (context.env?.NODE_ENV === 'production' && options.allowProvidedStageOutputs !== true) {
      throw new Error('Provided stage 7 output is disabled in production unless allowProvidedStageOutputs=true.');
    }
    await commitProvidedStageOutput(context, 7, 'npc_candidates', providedStage7, {}, {
      ...options,
      normalizedRequest,
      historicalFrame,
      regionalContextPackage: context.getStageOutput(4) ?? null,
      startCandidateSet: context.getStageOutput(5) ?? null,
      candidatePlaceTemplateSet: context.getStageOutput(6) ?? null,
      npcCandidatePolicy: options.policies?.npc_candidate_policy ?? {}
    });
  }

  const retrievalOutputs = await runNewGameRetrievalStages4To8(context, {
    normalizedRequest,
    historicalFrame,
    queryable: options.queryable ?? null,
    env: context.env,
    policies: options.policies ?? {}
  });

  const selectedStartNode = await runRequiredLlmStage(
    context,
    9,
    options,
    () => runStage9StartNodeSelection(context, {
      executor: selectStageExecutor(options, 9, 'start_node_selection')
    })
  );

  const startPlaceAuditFixture = options.stageOutputs?.[10] ?? options.stageOutputs?.start_place_audit ?? null;
  const startPlaceAudit = startPlaceAuditFixture
    ? await commitProvidedStageOutput(context, 10, 'start_place_audit', startPlaceAuditFixture)
    : await runOptionalAuditStage(context, 10, 'start_place_audit', options, () => (
      runStage10StartPlaceAudit(context, {
        executor: selectStageExecutor(options, 10, 'start_place_audit')
      })
    ), buildDefaultStartPlaceAudit(context, selectedStartNode));

  const playerCharacter = await runRequiredLlmStage(
    context,
    11,
    options,
    () => runStage11PlayerCharacter(context, {
      executor: selectStageExecutor(options, 11, 'player_character')
    })
  );
  const playerCharacterAudit = await runRequiredLlmStage(
    context,
    12,
    options,
    () => runStage12PlayerCharacterAudit(context, {
      executor: selectStageExecutor(options, 12, 'player_character_audit')
    })
  );

  const weatherState = await retrieveWeatherState({
    version: 1,
    schema: 'weather_state_retriever_input',
    request_id: context.requestId,
    historical_frame: historicalFrame,
    regional_context_package: retrievalOutputs.regional_context_package,
    selected_start_node: selectedStartNode
  }, {
    provided: options.weatherState
      ?? options.weather_state
      ?? options.stageOutputs?.weather_state
      ?? null,
    resolver: options.weatherStateRetriever
      ?? options.retrievers?.weather_state_retriever
      ?? options.retrievers?.weather_state
      ?? null
  });
  context.freezeArtifact(createFrozenArtifactRecord({
    artifact: weatherState,
    stageId: 1690,
    stageSlug: 'weather_state_retriever',
    schema: weatherState.schema,
    version: weatherState.version ?? 1,
    producedBy: 'weather_state_retriever',
    validationStatus: 'passed',
    auditStatus: weatherState.audit?.pass === true ? 'passed' : 'not_required',
    dependencyStatus: 'passed'
  }));

  let g5Outputs = await runNewGameG5Stages13To14(context, {
    normalizedRequest,
    historicalFrame,
    weatherState,
    regionalContextPackage: retrievalOutputs.regional_context_package,
    selectedStartNode,
    startPlaceAudit,
    playerCharacter,
    playerCharacterAudit,
    npcCandidateSet: retrievalOutputs.npc_candidate_set,
    itemProfileCandidateSet: retrievalOutputs.item_profile_candidate_set,
    allowedG5TemplateSet: options.allowedG5TemplateSet ?? { allowed_g5_templates: [] },
    policies: options.policies?.g5 ?? {},
    stageOutputs: options.stageOutputs ?? {},
    allowProvidedStageOutputs: options.allowProvidedStageOutputs === true
  }, {
    enableG5Runtime: true,
    materialize: selectRequiredCallback(options, 'g5Materialize', 13, 'g5_materialization'),
    audit: selectRequiredCallback(options, 'g5Audit', 14, 'g5_audit'),
    env: context.env
  });

  composeAndFreezeApprovedStartPosition(context, {
    historicalFrame,
    selectedStartNode,
    g5SceneGraphDraft: g5Outputs.g5_scene_graph_draft
  });
  const validatedPlayerSeed = composeAndFreezeValidatedPlayerSeed(context, {
    selectedStartNode,
    playerCharacter
  });

  let npcPlacement = await runRequiredLlmStage(
    context,
    15,
    options,
    () => runStage15NpcPlacement(context, {
      executor: selectStageExecutor(options, 15, 'npc_placement')
    })
  );
  let itemPlacement = await runRequiredLlmStage(
    context,
    16,
    options,
    () => runStage16ItemPlacement(context, {
      executor: selectStageExecutor(options, 16, 'item_placement')
    })
  );



  const timeLightInput = buildStage17TimeLightInput({
    request_id: context.requestId,
    historical_frame: historicalFrame,
    weather_state: weatherState,
    selected_start_node: selectedStartNode,
    player_character: playerCharacter,
    g5_scene_graph: g5Outputs.g5_scene_graph_draft,
    g5_scene_audit: context.getStageOutput(14),
    initial_npc_placement: npcPlacement,
    npc_placement_audit: context.getStageOutput(1502),
    initial_item_placement: itemPlacement,
    item_placement_audit: context.getStageOutput(1602),
    draft_visible_context_package: emptyDraftVisibleContextPackage(),
    time_light_policy: options.policies?.time_light_policy
      ?? options.policies?.time_light
      ?? options.timeLightPolicy
      ?? {}
  });

  const timeLightFixture = options.stageOutputs?.[17]
    ?? options.stageOutputs?.time_light_consistency_audit
    ?? options.timeLightAudit
    ?? null;
  if (timeLightFixture && context.env?.NODE_ENV === 'production' && options.allowProvidedStageOutputs !== true) {
    throw new Error('Provided stage 17 output is disabled in production unless allowProvidedStageOutputs=true.');
  }
  const timeLightExecutor = timeLightFixture
    ? null
    : selectStageExecutor(options, 17, 'time_light_gate');
  const timeLightRoleCall = (role) => async (roleInput) => {
    if (role === 'TimeLightSemanticAuditor' && timeLightFixture) return structuredClone(timeLightFixture);
    const direct = role === 'TimeLightSemanticAuditor'
      ? options.timeLightSemanticAuditor
      : role === 'TimeLightAuditFormatRepairer'
        ? options.timeLightAuditFormatRepairer
        : role === 'TimeLightAuditRouter'
          ? options.timeLightAuditRouter
          : null;
    const executor = direct ?? timeLightExecutor;
    if (typeof executor !== 'function') {
      if (role === 'TimeLightAuditRouter') {
        return {
          version: 1,
          schema: STAGE17_ROUTE_SCHEMA,
          route: 'blocked',
          reason_code: 'TIME_LIGHT_ROUTER_UNAVAILABLE',
          evidence: [{ kind: 'code_router_fallback' }]
        };
      }
      throw new Error(`Stage 17 requires ${role}.`);
    }
    const descriptor = getNewGameKnowledgeHiddenRoleDescriptor(role);
    return executor({
      context,
      input: roleInput,
      stage: {
        id: 17,
        slug: 'time_light_gate',
        ...descriptor,
        output_schema: role === 'TimeLightAuditRouter' ? STAGE17_ROUTE_SCHEMA : STAGE17_AUDIT_SCHEMA,
        spec_file: '17.txt'
      }
    });
  };

  let timeLightResult;
  try {
    timeLightResult = await runStage17TimeLightGateBlock({
      input: timeLightInput,
      audit: timeLightRoleCall('TimeLightSemanticAuditor'),
      formatRepair: timeLightRoleCall('TimeLightAuditFormatRepairer'),
      router: timeLightRoleCall('TimeLightAuditRouter')
    });
  } catch (error) {
    recordStage17Failure(context, error, timeLightInput);
    throw error;
  }
  let timeLightAudit = commitStage17Success(context, timeLightResult, timeLightInput);
  if (timeLightAudit.pass !== true
    || timeLightAudit.commit_permission?.can_continue_to_visible_context !== true
    || timeLightAudit.commit_permission?.can_continue_to_narrator !== false) {
    throw new Error('Stage 17 did not grant the exact downstream permissions required by the pipeline.');
  }

  let knowledgeMap = await runRequiredLlmStage(
    context,
    18,
    options,
    () => runStage18MapKnowledge(context, {
      executor: selectStageExecutor(options, 18, 'map_knowledge'),
      weatherState,
      worldBaseRouteSnapshot: options.worldBaseRouteSnapshot ?? options.world_base_route_snapshot ?? null,
      policies: options.policies ?? {},
      characterKnowledgeMapBuilder: options.characterKnowledgeMapBuilder,
      characterKnowledgeMapAuditor: options.characterKnowledgeMapAuditor,
      characterKnowledgeMapFormatRepairer: options.characterKnowledgeMapFormatRepairer,
      characterKnowledgeMapSemanticRepairer: options.characterKnowledgeMapSemanticRepairer,
      characterKnowledgeMapSeniorRepairer: options.characterKnowledgeMapSeniorRepairer
    })
  );
  let hiddenState = await runRequiredLlmStage(
    context,
    19,
    options,
    () => runStage19HiddenState(context, {
      executor: selectStageExecutor(options, 19, 'hidden_state'),
      weatherState,
      worldBaseRouteSnapshot: options.worldBaseRouteSnapshot ?? options.world_base_route_snapshot ?? null,
      hiddenStatePolicy: options.policies?.hidden_state_policy ?? options.policies?.hidden_state ?? {},
      hiddenStateBuilder: options.hiddenStateBuilder,
      hiddenStateAuditor: options.hiddenStateAuditor,
      hiddenStateFormatRepairer: options.hiddenStateFormatRepairer,
      hiddenStateSemanticRepairer: options.hiddenStateSemanticRepairer,
      hiddenStateSeniorRepairer: options.hiddenStateSeniorRepairer
    })
  );
  let visibleContextResult = await runRequiredLlmStage(
    context,
    20,
    options,
    () => runStage20VisibleContext(context, {
      executor: selectStageExecutor(options, 20, 'visible_context'),
      weatherState,
      policies: options.policies ?? {},
      visibleContextBuilder: options.visibleContextBuilder,
      visibleContextFormatRepairer: options.visibleContextFormatRepairer,
      visibleContextSemanticRepairer: options.visibleContextSemanticRepairer,
      visibleContextSeniorRepairer: options.visibleContextSeniorRepairer
    })
  );
  let visibleContext = visibleContextResult.visible_context_package;
  if (options.stageOutputs?.[21] || options.stageOutputs?.visible_context_audit) validateProvidedStage21Result();
  let stage21Result = await runStage21VisibleContextAudit(context, {
    executor: selectStageExecutor(options, 21, 'visible_context_audit'),
    visibleContextSemanticAuditor: options.visibleContextSemanticAuditor,
    visibleContextAuditFormatRepairer: options.visibleContextAuditFormatRepairer,
    visibleContextSeniorAuditor: options.visibleContextSeniorAuditor,
    visibleContextAuditRouter: options.visibleContextAuditRouter
  });

  const stage21RepairSignatures = new Set();
  for (let repairCycle = 0; stage21Result?.pass !== true && repairCycle < 3; repairCycle += 1) {
    const route = stage21Result?.repair_route;
    const targetStage = returnStageNumber(route);
    if (!targetStage) throw new Error('Stage 21 failed without a valid repair target.');
    const signature = `${route.return_to_stage}|${route.repair_kind}|${(route.concern_codes ?? []).join(',')}`;
    if (stage21RepairSignatures.has(signature)) throw new Error(`Stage 21 repeated the same repair route: ${signature}`);
    stage21RepairSignatures.add(signature);

    const repaired = await rerunStage21RepairRoute(context, {
      targetStage,
      route,
      failedStage20Result: visibleContextResult,
      failedStage21Result: stage21Result,
      normalizedRequest,
      historicalFrame,
      weatherState,
      retrievalOutputs,
      selectedStartNode,
      startPlaceAudit,
      playerCharacter,
      playerCharacterAudit,
      g5Outputs,
      npcPlacement,
      itemPlacement,
      timeLightAudit,
      knowledgeMap,
      hiddenState,
      options
    });
    ({ g5Outputs, npcPlacement, itemPlacement, timeLightAudit, knowledgeMap, hiddenState, visibleContextResult, stage21Result } = repaired);
    visibleContext = visibleContextResult.visible_context_package;
  }
  if (stage21Result?.pass !== true) throw new Error('Stage 21 repair escalation exhausted.');
  let visibleContextAudit = stage21Result.visible_context_audit;
  if (options.stageOutputs?.[22] || options.stageOutputs?.narrator_prose || options.stageOutputs?.narrator_starting_prose) {
    throw new Error('Provided Stage 22 output is forbidden. Stub Stage 22 role executors instead.');
  }
  if (options.stageOutputs?.[23] || options.stageOutputs?.narrator_prose_audit) {
    throw new Error('Provided Stage 23 audit output is forbidden. Stub the Stage 23 auditor executor instead.');
  }
  if (options.stageOutputs?.[24] || options.stageOutputs?.party_write_plan || options.stageOutputs?.party_db_write_plan || options.stageOutputs?.party_db_write_plan_audit) {
    validateProvidedStage24Result();
  }
  if (options.stageOutputs?.[25] || options.stageOutputs?.party_start_committed || options.stageOutputs?.stage25_party_start_commit_result) {
    validateProvidedStage25Result();
  }
  for (const forbiddenKey of ['partyStartCommitted', 'partyStateAfterCommit', 'currentPositionAfterCommit', 'narratorOutputId', 'partyPublicState', 'commitGateResult', 'transactionResult', 'postcommitResult']) {
    if (options[forbiddenKey] != null) validateProvidedStage25Result();
  }
  if (options.stageOutputs?.[26] || options.stageOutputs?.first_game_screen || options.stageOutputs?.stage26_first_game_screen_result) {
    validateProvidedStage26Result();
  }
  for (const forbiddenKey of ['firstGameScreen', 'firstGameScreenInput', 'stage26Result', 'stage26Audit', 'stage26SafetyAudit', 'stage26ActionAudit']) {
    if (options[forbiddenKey] != null) validateProvidedStage26Result();
  }

  let narratorProseResult = await runRequiredLlmStage(
    context,
    22,
    options,
    () => runStage22NarratorProse(context, {
      executor: selectStageExecutor(options, 22, 'narrator_prose'),
      narratorPolicy: options.narratorPolicy ?? options.policies?.narrator_policy ?? options.policies?.narrator,
      narratorStartingProseWriter: options.narratorStartingProseWriter,
      narratorProseFormatRepairer: options.narratorProseFormatRepairer,
      seniorNarratorStartingProseWriter: options.seniorNarratorStartingProseWriter
    })
  );

  const stage23RepairSignatures = new Set();
  let narratorProseAuditResult = null;
  let stage23RepairCycles = 0;
  while (true) {
    narratorProseAuditResult = await runStage23NarratorProseAudit(context, {
      executor: selectStageExecutor(options, 23, 'narrator_prose_audit'),
      auditPolicy: options.policies?.narrator_prose_audit ?? options.narratorProseAuditPolicy,
      narratorProseSemanticAuditor: options.narratorProseSemanticAuditor,
      narratorProseAuditFormatRepairer: options.narratorProseAuditFormatRepairer,
      seniorNarratorProseSemanticAuditor: options.seniorNarratorProseSemanticAuditor,
      narratorProseAuditRouter: options.narratorProseAuditRouter
    });
    if (narratorProseAuditResult?.pass === true) break;
    if (stage23RepairCycles >= 3) throw new Error('Stage 23 narrator prose audit repair escalation exhausted.');

    const failedAudit = narratorProseAuditResult?.narrator_prose_audit;
    const routeName = narratorProseAuditResult?.repair_route?.return_to_stage;
    const signature = buildStage23RepairSignature(narratorProseAuditResult);
    if (!failedAudit || failedAudit.schema !== 'narrator_prose_audit' || failedAudit.pass !== false || !routeName) {
      throw new Error('Stage 23 returned an invalid repair-required result bundle.');
    }
    if (stage23RepairSignatures.has(signature)) throw new Error('Stage 23 repeated the same repair signature.');
    stage23RepairSignatures.add(signature);
    stage23RepairCycles += 1;

    if (routeName === 'blocked') throw new Error('Stage 23 router returned a blocked route.');
    if (routeName === 'narrator_prose_format_repair') {
      context.clearFromStage(22);
      narratorProseResult = await repairStage22NarratorProseFormat(context, {
        failedResult: narratorProseResult,
        proseAudit: failedAudit,
        executor: selectStageExecutor(options, 22, 'narrator_prose'),
        narratorPolicy: options.narratorPolicy ?? options.policies?.narrator_policy ?? options.policies?.narrator,
        narratorProseFormatRepairer: options.narratorProseFormatRepairer
      });
      continue;
    }
    if (routeName === 'narrator_prose_semantic_repair') {
      context.clearFromStage(22);
      narratorProseResult = await repairStage22NarratorProse(context, {
        failedResult: narratorProseResult,
        proseAudit: failedAudit,
        executor: selectStageExecutor(options, 22, 'narrator_prose'),
        narratorPolicy: options.narratorPolicy ?? options.policies?.narrator_policy ?? options.policies?.narrator,
        narratorProseSemanticRepairer: options.narratorProseSemanticRepairer,
        narratorProseFormatRepairer: options.narratorProseFormatRepairer,
        seniorNarratorProseSemanticRepairer: options.seniorNarratorProseSemanticRepairer
      });
      continue;
    }

    const upstreamRoute = mapStage23RouteToUpstreamTarget(narratorProseAuditResult);
    if (!upstreamRoute) throw new Error(`Unsupported Stage 23 upstream route: ${routeName}`);
    const upstreamRepairRequest = buildStage23UpstreamRepairRequest(narratorProseAuditResult, upstreamRoute.targetStage);
    const repaired = await rerunStage21RepairRoute(context, {
      targetStage: upstreamRoute.targetStage,
      route: upstreamRoute.route,
      upstreamRepairRequest,
      failedStage20Result: visibleContextResult,
      failedStage21Result: stage21Result,
      normalizedRequest,
      historicalFrame,
      weatherState,
      retrievalOutputs,
      selectedStartNode,
      startPlaceAudit,
      playerCharacter,
      playerCharacterAudit,
      g5Outputs,
      npcPlacement,
      itemPlacement,
      timeLightAudit,
      knowledgeMap,
      hiddenState,
      options
    });
    ({ g5Outputs, npcPlacement, itemPlacement, timeLightAudit, knowledgeMap, hiddenState, visibleContextResult, stage21Result } = repaired);
    visibleContext = visibleContextResult.visible_context_package;
    visibleContextAudit = stage21Result.visible_context_audit;
    context.clearFromStage(22);
    narratorProseResult = await runStage22NarratorProse(context, {
      executor: selectStageExecutor(options, 22, 'narrator_prose'),
      narratorPolicy: options.narratorPolicy ?? options.policies?.narrator_policy ?? options.policies?.narrator,
      narratorStartingProseWriter: options.narratorStartingProseWriter,
      narratorProseFormatRepairer: options.narratorProseFormatRepairer,
      seniorNarratorStartingProseWriter: options.seniorNarratorStartingProseWriter
    });
  }
  const narratorProseAudit = narratorProseAuditResult.narrator_prose_audit;
  const narratorProse = narratorProseResult.narrator_starting_prose;

  const partyId = requirePartyId(options);
  const playerCharacterId = requirePlayerCharacterId(playerCharacter, options);
  const partyDatabaseSchema = requirePartyDatabaseSchema(options);
  const worldBaseReferenceSnapshot = requireWorldBaseReferenceSnapshot(options);
  const approvedPipelineOutputs = buildStage24ApprovedPipelineOutputs(context);
  const approvedPipelineManifest = buildApprovedPipelineManifest({
    request_id: context.requestId,
    artifacts: approvedPipelineOutputs
  });
  const stage24Input = buildStage24Input({
    request_id: context.requestId,
    party_creation_context: {
      party_id: partyId,
      player_character_id: playerCharacterId,
      campaign_id: options.campaignId ?? null,
      created_at: options.createdAt ?? new Date().toISOString(),
      schema_version: partyDatabaseSchema.schema_version,
      idempotency_key: options.idempotencyKey ?? `new-game:${context.requestId}:${partyId}`
    },
    approved_pipeline_outputs: approvedPipelineOutputs,
    approved_pipeline_manifest: approvedPipelineManifest,
    party_database_schema: partyDatabaseSchema,
    world_base_reference_snapshot: worldBaseReferenceSnapshot,
    additional_write_policy: options.additionalWritePolicy ?? options.writePolicy ?? {}
  });
  const stage24Output = await runStage24PartyDbWritePlanBlock({
    input: stage24Input,
    builder: selectRequiredCallback(options, 'stage24Builder', 24, 'party_write_plan'),
    planFormatRepairer: selectRequiredCallback(options, 'stage24PlanFormatRepairer', 24, 'party_write_plan'),
    auditor: selectRequiredCallback(options, 'stage24Auditor', 24, 'party_write_plan'),
    auditFormatRepairer: selectRequiredCallback(options, 'stage24AuditFormatRepairer', 24, 'party_write_plan'),
    router: selectRequiredCallback(options, 'stage24Router', 24, 'party_write_plan'),
    semanticRepairer: selectRequiredCallback(options, 'stage24SemanticRepairer', 24, 'party_write_plan'),
    seniorSemanticRepairer: selectRequiredCallback(options, 'stage24SeniorSemanticRepairer', 24, 'party_write_plan'),
    seniorBuilder: selectRequiredCallback(options, 'stage24SeniorBuilder', 24, 'party_write_plan'),
    seniorAuditor: selectRequiredCallback(options, 'stage24SeniorAuditor', 24, 'party_write_plan'),
    maxRepairCycles: options.stage24MaxRepairCycles ?? 3
  });
  commitStage24Result(context, stage24Output, stage24Input);

  const stage25Input = buildStage25CommitInput({
    request_id: context.requestId,
    party_creation_context: {
      ...structuredClone(stage24Input.party_creation_context),
      request_id: context.requestId,
      payload_hash: options.commitPayloadHash ?? options.partyCreationContext?.payload_hash ?? null
    },
    stage24_result: stage24Output,
    party_database_schema: partyDatabaseSchema,
    world_base_reference_snapshot: worldBaseReferenceSnapshot,
    approved_pipeline_manifest: approvedPipelineManifest,
    additional_commit_policy: options.additionalCommitPolicy ?? options.commitPolicy ?? {}
  });
  const stage25Result = await runStage25PartyCommitBlock({
    input: stage25Input,
    physicalPlanAdapter: options.stage25PhysicalPlanAdapter,
    idempotencyChecker: options.commitIdempotencyChecker ?? ((payload) => checkPartyCommitIdempotency(payload, {
      client: options.commitClient,
      pool: options.commitPool,
      env: context.env,
      lookupIdempotency: options.lookupCommitIdempotency
    })),
    dryRunExecutor: options.commitDryRun ?? ((payload) => executeDryRunTransaction(payload, {
      client: options.commitClient,
      pool: options.commitPool,
      env: context.env,
      executeRecord: options.commitExecuteRecord,
      evaluatePostcondition: options.commitPostconditionEvaluator
    })),
    transactionExecutor: options.commitTransactionExecutor ?? ((payload) => executeApprovedAtomicTransaction(payload, {
      client: options.commitClient,
      pool: options.commitPool,
      env: context.env,
      executeRecord: options.commitExecuteRecord,
      evaluatePostcondition: options.commitPostconditionEvaluator
    })),
    postcommitReader: options.commitPostcommitReader ?? ((payload) => readCommittedPartyState(payload, {
      client: options.commitClient,
      pool: options.commitPool,
      env: context.env,
      readback: options.commitReadback
    }))
  });
  context.setStageOutput(25, stage25Result);
  context.setGateResult(25, createGateResult({
    stageId: 25,
    stageSlug: 'party_commit',
    gateKind: 'atomic_commit_and_postcommit',
    pass: stage25Result.pass === true,
    concerns: stage25Result.concerns ?? [],
    evidence: stage25Result.postcommit_validation?.evidence ?? stage25Result.evidence ?? []
  }));
  context.setLifecycleState(25, {
    stage_id: 25,
    stage_slug: 'party_commit',
    stage_type: 'isolated_code_block',
    input_snapshot: structuredClone(stage25Input),
    parsed_output: structuredClone(stage25Result),
    terminal_status: stage25Result.pass === true ? 'passed' : 'stage_failed',
    failed_gate: stage25Result.pass === true ? null : stage25Result.failed_phase,
    final_blocked_reason: stage25Result.pass === true ? null : (stage25Result.concerns ?? []).map((item) => item.message ?? item.code).join('; ')
  });
  context.freezeArtifact(createFrozenArtifactRecord({
    artifact: stage25Result,
    stageId: 25,
    stageSlug: 'party_commit',
    schema: STAGE25_RESULT_SCHEMA,
    version: 1,
    producedBy: 'stage25_isolated_code_block',
    validationStatus: stage25Result.pass === true ? 'passed' : 'failed',
    auditStatus: 'not_required',
    dependencyStatus: stage25Result.pass === true ? 'passed' : 'failed'
  }));
  if (stage25Result.pass !== true) {
    throw new Error(`New-game Stage 25 failed at ${stage25Result.failed_phase}: ${(stage25Result.concerns ?? []).map((item) => item.message ?? item.code).join('; ')}`);
  }
  const stage25HandoffConcerns = validateStage25ToStage26Handoff(stage25Result);
  if (stage25HandoffConcerns.length > 0) {
    throw new Error(`Stage 25 to Stage 26 handoff failed: ${stage25HandoffConcerns.map((item) => item.code).join(',')}`);
  }
  const stage26Input = buildStage26Input({
    request_id: context.requestId,
    stage25_result: stage25Result,
    approved_narrator_output: narratorProse,
    stage23_result: narratorProseAuditResult,
    approved_visible_context: visibleContext,
    stage21_result: stage21Result,
    screen_policy: options.screenPolicy ?? options.policies?.screen_policy ?? {}
  });
  const stage26Result = await runStage26FirstGameScreenBlock({
    input: stage26Input,
    safetyAuditor: selectRequiredCallback(options, 'stage26SafetyAuditor', 26, 'first_game_screen'),
    actionLabelAuditor: selectRequiredCallback(options, 'stage26ActionLabelAuditor', 26, 'first_game_screen'),
    formatRepairer: selectOptionalCallback(options, 'stage26FormatRepairer', 26, 'first_game_screen'),
    semanticRepairer: selectOptionalCallback(options, 'stage26SemanticRepairer', 26, 'first_game_screen'),
    seniorRepairer: selectOptionalCallback(options, 'stage26SeniorRepairer', 26, 'first_game_screen'),
    maxRepairCycles: options.stage26MaxRepairCycles ?? 2
  });
  context.setStageOutput(26, stage26Result);
  context.setGateResult(26, createGateResult({
    stageId: 26,
    stageSlug: 'first_game_screen',
    gateKind: 'isolated_screen_projection_and_safety_audit',
    pass: stage26Result.pass === true,
    concerns: stage26Result.concerns ?? [],
    evidence: stage26Result.first_screen_code_validation?.evidence ?? stage26Result.evidence ?? []
  }));
  context.setLifecycleState(26, {
    stage_id: 26,
    stage_slug: 'first_game_screen',
    stage_type: 'isolated_code_and_audit_block',
    input_snapshot: structuredClone(stage26Input),
    parsed_output: structuredClone(stage26Result),
    terminal_status: stage26Result.pass === true ? 'passed' : 'stage_failed',
    failed_gate: stage26Result.pass === true ? null : stage26Result.failed_phase,
    final_blocked_reason: stage26Result.pass === true ? null : (stage26Result.concerns ?? []).map((item) => item.message ?? item.code).join('; ')
  });
  context.freezeArtifact(createFrozenArtifactRecord({
    artifact: stage26Result,
    stageId: 26,
    stageSlug: 'first_game_screen',
    schema: STAGE26_RESULT_SCHEMA,
    version: 1,
    producedBy: 'stage26_isolated_code_and_audit_block',
    validationStatus: stage26Result.pass === true ? 'passed' : 'failed',
    auditStatus: stage26Result.pass === true ? 'passed' : 'failed',
    dependencyStatus: stage26Result.pass === true ? 'passed' : 'failed'
  }));
  if (stage26Result.pass !== true) {
    throw new Error(`New-game Stage 26 failed at ${stage26Result.failed_phase}: ${(stage26Result.concerns ?? []).map((item) => item.message ?? item.code).join('; ')}`);
  }
  const stage26HandoffConcerns = validateStage26ToStage27Handoff(stage26Result);
  if (stage26HandoffConcerns.length > 0) {
    throw new Error(`Stage 26 handoff failed: ${stage26HandoffConcerns.map((item) => item.code).join(',')}`);
  }
  const firstGameScreen = stage26Result.first_game_screen;
  const firstScreenDeliveryAttempt = createFirstScreenDeliveryAttempt({ stage26_result: stage26Result });
  const partyStartCommitted = stage25Result.party_start_committed;

  return {
    version: 1,
    schema: 'new_game_pipeline_result',
    request_id: context.requestId,
    pipeline_runtime: 'new_lifecycle',
    legacy_provider_runtime_used: false,
    status: 'committed_ready_for_player',
    stage_registry: getNewGameStageRegistry(),
    stage_matrix: getNewGameStageMatrix(),
    llm_tier_configs: getNewGameLlmTierConfigs(context.env),
    stage_outputs: context.snapshot().outputs,
    validated_player_seed: validatedPlayerSeed,
    final_world_start_bundle: buildFinalWorldStartBundle(context, stage24Output),
    stage25Result,
    stage25_result: stage25Result,
    partyStartCommitted,
    party_start_committed: partyStartCommitted,
    stage26Result,
    stage26_result: stage26Result,
    firstGameScreen,
    first_game_screen: firstGameScreen,
    firstScreenDeliveryAttempt,
    first_screen_delivery_attempt: firstScreenDeliveryAttempt,
    snapshot: context.snapshot()
  };
}

function mapStage23RouteToUpstreamTarget(stage23Result) {
  const route = stage23Result?.repair_route;
  const mapping = {
    visible_context_semantic_repair: { targetStage: 20, return_to_stage: 'stage20_visible_context' },
    visible_context_audit: { targetStage: 20, return_to_stage: 'stage20_visible_context' },
    time_light_semantic_repair: { targetStage: 17, return_to_stage: 'stage17_time_light' },
    character_knowledge_map_semantic_repair: { targetStage: 18, return_to_stage: 'stage18_character_knowledge' },
    full_hidden_state_semantic_repair: { targetStage: 19, return_to_stage: 'stage19_hidden_state' }
  };
  const selected = mapping[route?.return_to_stage];
  if (!selected) return null;
  const allowedMutablePaths = selected.targetStage === 20
    ? [
        'frame', 'position', 'narrator_scope', 'visible_scene_facts', 'visible_anchors', 'visible_exits',
        'visible_npcs', 'visible_items', 'visible_containers', 'visible_risks', 'audible_context',
        'smell_context', 'touch_body_context', 'weather_light_context', 'known_context', 'rumor_context',
        'uncertain_context', 'available_actions_context', 'visible_scene_dossier', 'source_trace'
      ]
    : [];
  return {
    targetStage: selected.targetStage,
    route: {
      version: 1,
      schema: STAGE21_ROUTE_SCHEMA,
      return_to_stage: selected.return_to_stage,
      repair_kind: route.repair_kind,
      concern_codes: structuredClone(route.supporting_concern_codes ?? []),
      evidence_refs: (stage23Result?.narrator_prose_audit?.evidence ?? []).map((_, index) => index),
      allowed_mutable_paths: allowedMutablePaths,
      forbidden_mutable_paths: ['version', 'schema', 'request_id'],
      requires_reaudit_from_stage: 21
    }
  };
}

async function rerunStage21RepairRoute(context, state) {
  const {
    targetStage,
    route,
    failedStage20Result,
    failedStage21Result,
    upstreamRepairRequest,
    normalizedRequest,
    historicalFrame,
    weatherState,
    retrievalOutputs,
    selectedStartNode,
    startPlaceAudit,
    playerCharacter,
    playerCharacterAudit,
    options
  } = state;
  let {
    g5Outputs,
    npcPlacement,
    itemPlacement,
    timeLightAudit,
    knowledgeMap,
    hiddenState
  } = state;

  context.clearFromStage(targetStage);

  if (targetStage <= 13) {
    g5Outputs = await runNewGameG5Stages13To14(context, {
      normalizedRequest,
      historicalFrame,
      weatherState,
      regionalContextPackage: retrievalOutputs.regional_context_package,
      selectedStartNode,
      startPlaceAudit,
      playerCharacter,
      playerCharacterAudit,
      npcCandidateSet: retrievalOutputs.npc_candidate_set,
      itemProfileCandidateSet: retrievalOutputs.item_profile_candidate_set,
      allowedG5TemplateSet: options.allowedG5TemplateSet ?? { allowed_g5_templates: [] },
      policies: options.policies?.g5 ?? {},
      stageOutputs: {},
      allowProvidedStageOutputs: false
    }, {
      enableG5Runtime: true,
      materialize: selectRequiredCallback(options, 'g5Materialize', 13, 'g5_materialization'),
      audit: selectRequiredCallback(options, 'g5Audit', 14, 'g5_audit'),
      env: context.env
    });
  } else if (targetStage === 14) {
    const g5Audit = await runStage14G5Audit(context, {
      historical_frame: historicalFrame,
      selected_start_node: selectedStartNode,
      start_place_audit: startPlaceAudit,
      player_character: playerCharacter,
      player_character_audit: playerCharacterAudit,
      allowed_g5_template_set: options.allowedG5TemplateSet ?? { allowed_g5_templates: [] },
      g5_scene_graph_draft: g5Outputs.g5_scene_graph_draft,
      g5_scene_code_precheck: g5Outputs.g5_scene_code_precheck ?? context.getStageOutput(1301),
      npc_candidate_set: retrievalOutputs.npc_candidate_set,
      item_profile_candidate_set: retrievalOutputs.item_profile_candidate_set,
      audit_policy: options.policies?.g5?.audit_policy ?? {}
    }, {
      enableG5Runtime: true,
      audit: selectRequiredCallback(options, 'g5Audit', 14, 'g5_audit'),
      env: context.env,
      stageOutputs: {},
      allowProvidedStageOutputs: false
    });
    g5Outputs = { ...g5Outputs, g5_scene_audit: g5Audit };
  }

  if (targetStage <= 14) {
    composeAndFreezeApprovedStartPosition(context, {
      historicalFrame,
      selectedStartNode,
      g5SceneGraphDraft: g5Outputs.g5_scene_graph_draft
    });
    composeAndFreezeValidatedPlayerSeed(context, {
      selectedStartNode,
      playerCharacter
    });
  }

  if (targetStage <= 15) {
    npcPlacement = await runStage15NpcPlacement(context, {
      executor: selectStageExecutor(options, 15, 'npc_placement')
    });
  }
  if (targetStage <= 16) {
    itemPlacement = await runStage16ItemPlacement(context, {
      executor: selectStageExecutor(options, 16, 'item_placement')
    });
  }
  if (targetStage <= 17) {
    timeLightAudit = await runStage17ForStage21Repair(context, {
      historicalFrame,
      weatherState,
      selectedStartNode,
      playerCharacter,
      g5Outputs,
      npcPlacement,
      itemPlacement,
      options
    });
  }
  if (targetStage <= 18) {
    knowledgeMap = await runStage18MapKnowledge(context, {
      executor: selectStageExecutor(options, 18, 'map_knowledge'),
      weatherState,
      worldBaseRouteSnapshot: options.worldBaseRouteSnapshot ?? options.world_base_route_snapshot ?? null,
      policies: options.policies ?? {},
      characterKnowledgeMapBuilder: options.characterKnowledgeMapBuilder,
      characterKnowledgeMapAuditor: options.characterKnowledgeMapAuditor,
      characterKnowledgeMapFormatRepairer: options.characterKnowledgeMapFormatRepairer,
      characterKnowledgeMapSemanticRepairer: options.characterKnowledgeMapSemanticRepairer,
      characterKnowledgeMapSeniorRepairer: options.characterKnowledgeMapSeniorRepairer
    });
  }
  if (targetStage <= 19) {
    hiddenState = await runStage19HiddenState(context, {
      executor: selectStageExecutor(options, 19, 'hidden_state'),
      weatherState,
      worldBaseRouteSnapshot: options.worldBaseRouteSnapshot ?? options.world_base_route_snapshot ?? null,
      hiddenStatePolicy: options.policies?.hidden_state_policy ?? options.policies?.hidden_state ?? {},
      hiddenStateBuilder: options.hiddenStateBuilder,
      hiddenStateAuditor: options.hiddenStateAuditor,
      hiddenStateFormatRepairer: options.hiddenStateFormatRepairer,
      hiddenStateSemanticRepairer: options.hiddenStateSemanticRepairer,
      hiddenStateSeniorRepairer: options.hiddenStateSeniorRepairer
    });
  }

  const repairRequest = targetStage === 20
    ? {
        failed_visible_context_package: failedStage20Result.visible_context_package,
        visible_context_code_precheck: failedStage20Result.visible_context_code_precheck,
        semantic_audit: upstreamRepairRequest ?? failedStage21Result?.visible_context_audit,
        repair_route: upstreamRepairRequest?.repair_route ?? route,
        stage21_visible_context_audit: upstreamRepairRequest ? null : failedStage21Result?.visible_context_audit,
        stage21_repair_route: upstreamRepairRequest ? null : route,
        previous_repair_history: failedStage20Result.repair_history ?? []
      }
    : null;

  const visibleContextResult = await runStage20VisibleContext(context, {
    executor: selectStageExecutor(options, 20, 'visible_context'),
    weatherState,
    policies: options.policies ?? {},
    visibleContextBuilder: options.visibleContextBuilder,
    visibleContextFormatRepairer: options.visibleContextFormatRepairer,
    visibleContextSemanticRepairer: options.visibleContextSemanticRepairer,
    visibleContextSeniorRepairer: options.visibleContextSeniorRepairer,
    repairRequest
  });

  const stage21Result = await runStage21VisibleContextAudit(context, {
    executor: selectStageExecutor(options, 21, 'visible_context_audit'),
    visibleContextSemanticAuditor: options.visibleContextSemanticAuditor,
    visibleContextAuditFormatRepairer: options.visibleContextAuditFormatRepairer,
    visibleContextSeniorAuditor: options.visibleContextSeniorAuditor,
    visibleContextAuditRouter: options.visibleContextAuditRouter
  });

  return {
    g5Outputs,
    npcPlacement,
    itemPlacement,
    timeLightAudit,
    knowledgeMap,
    hiddenState,
    visibleContextResult,
    stage21Result
  };
}

async function runStage17ForStage21Repair(context, {
  historicalFrame,
  weatherState,
  selectedStartNode,
  playerCharacter,
  g5Outputs,
  npcPlacement,
  itemPlacement,
  options
}) {
  const input = buildStage17TimeLightInput({
    request_id: context.requestId,
    historical_frame: historicalFrame,
    weather_state: weatherState,
    selected_start_node: selectedStartNode,
    player_character: playerCharacter,
    g5_scene_graph: g5Outputs.g5_scene_graph_draft,
    g5_scene_audit: context.getStageOutput(14),
    initial_npc_placement: npcPlacement,
    npc_placement_audit: context.getStageOutput(1502),
    initial_item_placement: itemPlacement,
    item_placement_audit: context.getStageOutput(1602),
    draft_visible_context_package: emptyDraftVisibleContextPackage(),
    time_light_policy: options.policies?.time_light_policy
      ?? options.policies?.time_light
      ?? options.timeLightPolicy
      ?? {}
  });
  const baseExecutor = selectStageExecutor(options, 17, 'time_light_gate');
  const roleCall = (role) => async (roleInput) => {
    const direct = role === 'TimeLightSemanticAuditor'
      ? options.timeLightSemanticAuditor
      : role === 'TimeLightAuditFormatRepairer'
        ? options.timeLightAuditFormatRepairer
        : role === 'TimeLightAuditRouter'
          ? options.timeLightAuditRouter
          : null;
    const executor = direct ?? baseExecutor;
    if (typeof executor !== 'function') throw new Error(`Stage 17 repair requires ${role}.`);
    const descriptor = getNewGameKnowledgeHiddenRoleDescriptor(role);
    return executor({
      context,
      input: roleInput,
      stage: {
        id: 17,
        slug: 'time_light_gate',
        ...descriptor,
        output_schema: role === 'TimeLightAuditRouter' ? STAGE17_ROUTE_SCHEMA : STAGE17_AUDIT_SCHEMA,
        spec_file: '17.txt'
      }
    });
  };
  let result;
  try {
    result = await runStage17TimeLightGateBlock({
      input,
      audit: roleCall('TimeLightSemanticAuditor'),
      formatRepair: roleCall('TimeLightAuditFormatRepairer'),
      router: roleCall('TimeLightAuditRouter')
    });
  } catch (error) {
    recordStage17Failure(context, error, input);
    throw error;
  }
  return commitStage17Success(context, result, input);
}

async function runRequiredLlmStage(context, stageId, options, runner) {
  const existing = context.getStageOutput(stageId)
    ?? options.stageOutputs?.[stageId]
    ?? options.stageOutputs?.[getNewGameStageMatrixEntry(stageId)?.slug];
  if (existing) {
    if ([18, 19, 20, 21, 22, 23, 24].includes(Number(stageId))) {
      throw new Error('Provided Stage ' + stageId + ' output is forbidden. Stub the stage role executor instead.');
    }
    // Stage 2 fixtures are useful for tests, but they must pass the same
    // normalizer gate as an LLM answer. In production they are disabled unless
    // explicitly allowed, because a provided normalized request can otherwise
    // bypass the player-intent contract and inject world facts before stage 3.
    if ((stageId === 2 || stageId === 3) && context.env?.NODE_ENV === 'production' && options.allowProvidedStageOutputs !== true) {
      throw new Error(`Provided stage ${stageId} output is disabled in production unless allowProvidedStageOutputs=true.`);
    }
    return await commitProvidedStageOutput(context, stageId, getNewGameStageMatrixEntry(stageId)?.slug, existing, {}, options);
  }
  const maxAttempts = 3;
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await runner();
    } catch (error) {
      const route = error?.semanticRecoveryRoute ?? null;
      const lifecycleState = context.getLifecycleState(stageId);
      if (error?.lifecycle) {
        context.setLifecycleState(stageId, {
          ...(context.getLifecycleState(stageId) ?? {}),
          terminal_status: error.lifecycle.terminal_status ?? 'stage_failed',
          failed_gate: error.lifecycle.failed_gate ?? lifecycleState?.failed_gate ?? null,
          final_blocked_reason: error.message
        });
      }
      if (!route || route.terminal_status) throw error;
      const signature = buildLifecycleErrorSignature(error, route);
      const repairHistory = context.getRepairHistory(stageId);
      const previousAttempt = repairHistory.at(-1) ?? null;
      const repeatedErrorSignature = previousAttempt?.error_signature === signature;
      const nextModelTier = repeatedErrorSignature || attempt >= 2 ? 'tier_3_senior' : 'tier_2_standard';
      const repeatedSeniorFailure = repeatedErrorSignature && String(previousAttempt?.model_tier ?? '').includes('senior');
      if (lifecycleState?.parsed_output) {
        context.setRepairBaseline(stageId, {
          artifact: structuredClone(lifecycleState.parsed_output),
          mutable_scope: structuredClone(lifecycleState.mutable_scope ?? {
            allowed_mutable_paths: [],
            forbidden_mutable_paths: []
          }),
          failed_gate: lifecycleState.failed_gate ?? error?.lifecycle?.failed_gate ?? null,
          stage_type: lifecycleState.stage_type ?? null
        });
      }
      context.addRepairAttempt(stageId, {
        attempt_index: attempt,
        route,
        error_signature: signature,
        error: error?.message ?? String(error),
        repeated_error_signature: repeatedErrorSignature,
        model_tier: nextModelTier
      });
      context.setStageMeta(stageId, {
        attempt_index: attempt,
        repair_attempt_index: context.getRepairHistory(stageId).length,
        model_tier: nextModelTier,
        terminal_status: attempt >= maxAttempts || repeatedSeniorFailure ? 'needs_manual_review' : 'retrying',
        recovery_route: route
      });
      if (repeatedSeniorFailure) {
        context.setLifecycleState(stageId, {
          ...(context.getLifecycleState(stageId) ?? {}),
          terminal_status: 'needs_manual_review',
          failed_gate: error.lifecycle?.failed_gate ?? lifecycleState?.failed_gate ?? null,
          final_blocked_reason: `repeated_error_signature:${signature}`
        });
        throw error;
      }
      context.clearFromStage(Number(route.rerun_from_stage ?? stageId));
      if (attempt >= maxAttempts) throw error;
    }
  }
  throw new Error(`New-game stage ${stageId} retry loop exhausted.`);
}

function buildLifecycleErrorSignature(error, route) {
  const concern = error?.lifecycle?.concerns?.[0] ?? null;
  const errorClass = route?.reason_code ?? concern?.code ?? 'UNKNOWN_ERROR';
  const sourcePath = route?.offending_field ?? concern?.field ?? 'root';
  const concernCode = concern?.code ?? 'UNKNOWN_CONCERN';
  return `${errorClass}|${sourcePath}|${concernCode}`;
}

async function runOptionalAuditStage(context, stageId, slug, options, runner, fallbackOutput) {
  const executor = pickStageHandler(options.stageExecutors, stageId, slug)
    ?? pickStageHandler(options.llmStageExecutors, stageId, slug)
    ?? null;
  if (executor) {
    return runner();
  }
  return await commitProvidedStageOutput(context, stageId, slug, fallbackOutput, {
    evidenceKind: 'code_first_optional_audit'
  }, options);
}

function selectStageExecutor(options, stageId, slug, required = true) {
  const direct = pickStageHandler(options.stageExecutors, stageId, slug)
    ?? pickStageHandler(options.llmStageExecutors, stageId, slug)
    ?? options.llmStageExecutor
    ?? null;
  if (!direct && required) {
    throw new Error(`New-game LLM stage ${stageId} (${slug}) requires an explicit executor.`);
  }
  return direct;
}

function selectRequiredCallback(options, optionName, stageId, slug) {
  const callback = options[optionName] ?? pickStageHandler(options.stageExecutors, stageId, slug);
  if (typeof callback !== 'function') {
    throw new Error(`New-game stage ${stageId} (${slug}) requires callback ${optionName}.`);
  }
  return callback;
}

function selectOptionalCallback(options, optionName, stageId, slug) {
  const callback = options[optionName] ?? pickStageHandler(options.stageExecutors, stageId, slug);
  return typeof callback === 'function' ? callback : null;
}

function pickStageHandler(map, stageId, slug) {
  if (!map || typeof map !== 'object') return null;
  return map[stageId] ?? map[String(stageId)] ?? map[slug] ?? null;
}

function buildDefaultStartPlaceAudit(context, selectedStartNode) {
  return {
    version: 1,
    schema: 'start_place_audit',
    request_id: context.requestId,
    pass: true,
    selected_candidate_id: selectedStartNode?.selected_candidate_id ?? null,
    concerns: [],
    evidence: ['code-first compatibility audit accepted selected start node']
  };
}

async function commitProvidedStageOutput(context, stageId, slug, output, { evidenceKind = 'provided_fixture_output' } = {}, pipelineOptions = {}) {
  if (Number(stageId) === 17) {
    throw new Error('Stage 17 provided outputs must pass through the specialized time/light block.');
  }
  if (Number(stageId) === 19) {
    throw new Error('Provided Stage 19 output is forbidden. Stub the Stage 19 role executor instead.');
  }
  const stageMeta = getNewGameStageMatrixEntry(stageId) ?? {};
  const definition = (stageId === 2 || stageId === 3) ? getNewGameLlmStageDefinition(stageId) : null;
  let providedInput = {};
  if (stageId === 2) {
    providedInput = definition?.buildInput?.(context) ?? {};
  } else if (stageId === 3) {
    providedInput = await buildStage3HistoricalFrameInput(context, {
      queryable: pipelineOptions.queryable ?? null,
      env: context.env,
      availableCandidates: pipelineOptions.historicalFrameCandidateSet ?? pipelineOptions.stage3CandidateSet ?? context.historicalFrameCandidateSet ?? null,
      selectionPolicy: pipelineOptions.policies?.historical_frame_selection_policy ?? pipelineOptions.historicalFrameSelectionPolicy ?? context.historicalFrameSelectionPolicy ?? {},
      candidatePolicy: pipelineOptions.policies?.historical_frame_candidate_policy ?? pipelineOptions.historicalFrameCandidatePolicy ?? context.historicalFrameCandidatePolicy ?? {}
    });
  } else if (stageId === 4) {
    providedInput = {
      normalized_request: pipelineOptions.normalizedRequest ?? context.getStageOutput(2) ?? null,
      historical_frame: pipelineOptions.historicalFrame ?? context.getStageOutput(3) ?? null,
      load_policy: pipelineOptions.loadPolicy ?? pipelineOptions.policies?.load_policy ?? {}
    };
  } else if (stageId === 5) {
    providedInput = buildStage5StartCandidatesInput(context, {
      normalizedRequest: pipelineOptions.normalizedRequest,
      historicalFrame: pipelineOptions.historicalFrame,
      regionalContextPackage: pipelineOptions.regionalContextPackage,
      candidatePolicy: pipelineOptions.candidatePolicy ?? pipelineOptions.policies?.candidate_policy ?? {}
    });
  } else if (stageId === 6) {
    providedInput = buildStage6CandidatePlaceTemplatesInput(context, {
      normalizedRequest: pipelineOptions.normalizedRequest,
      historicalFrame: pipelineOptions.historicalFrame,
      regionalContextPackage: pipelineOptions.regionalContextPackage,
      startCandidateSet: pipelineOptions.startCandidateSet,
      templatePolicy: pipelineOptions.templatePolicy ?? pipelineOptions.policies?.template_policy ?? {}
    });
  } else if (stageId === 7) {
    providedInput = buildStage7NpcCandidatesInput(context, {
      normalizedRequest: pipelineOptions.normalizedRequest,
      historicalFrame: pipelineOptions.historicalFrame,
      regionalContextPackage: pipelineOptions.regionalContextPackage,
      startCandidateSet: pipelineOptions.startCandidateSet,
      candidatePlaceTemplateSet: pipelineOptions.candidatePlaceTemplateSet,
      npcCandidatePolicy: pipelineOptions.npcCandidatePolicy ?? pipelineOptions.policies?.npc_candidate_policy ?? {}
    });
  }
  const gate = definition
    ? runLlmStageGate(definition, output, providedInput, 'provided_fixture_validation')
    : stageId === 4
      ? (() => {
          const validation = validateRegionalContextPackage(output, {
            historicalFrame: providedInput.historical_frame,
            loadPolicy: providedInput.load_policy
          });
          return createGateResult({
            stageId,
            stageSlug: slug,
            gateKind: 'regional_context_validation',
            pass: validation.pass,
            concerns: validation.concerns,
            evidence: validation.evidence
          });
        })()
      : stageId === 5
        ? (() => {
            const validation = validateStartCandidateSet(output, {
              policy: providedInput.candidate_policy ?? {}
            });
            return createGateResult({
              stageId,
              stageSlug: slug,
              gateKind: 'start_candidate_set_commit_gate',
              pass: validation.pass,
              concerns: validation.concerns,
              evidence: validation.evidence
            });
          })()
        : stageId === 6
          ? (() => {
              const validation = validateCandidatePlaceTemplateSet(output, providedInput);
              return createGateResult({
                stageId,
                stageSlug: slug,
                gateKind: 'candidate_place_template_contract_validation',
                pass: validation.pass,
                concerns: validation.concerns,
                evidence: validation.evidence
              });
            })()
          : stageId === 7
            ? (() => {
                const validation = validateNpcCandidateSet(output, {
                  policy: providedInput.npc_candidate_policy ?? {}
                });
                return createGateResult({
                  stageId,
                  stageSlug: slug,
                  gateKind: 'npc_candidate_set_gate',
                  pass: validation.pass,
                  concerns: validation.concerns,
                  evidence: validation.evidence
                });
              })()
      : createGateResult({
        stageId,
        stageSlug: slug,
        pass: output?.pass !== false,
        concerns: output?.pass === false ? (output.concerns ?? [{ code: 'PROVIDED_STAGE_OUTPUT_FAILED', message: `${slug} fixture failed.` }]) : [],
        evidence: [{ kind: evidenceKind }]
      });
  context.setStageOutput(stageId, output);
  context.setGateResult(stageId, gate);
  context.setLifecycleState(stageId, {
    stage_id: stageId,
    stage_slug: slug,
    stage_type: stageMeta.stage_type ?? 'contract_shaping',
    parsed_output: structuredClone(output),
    structural_validation: gate,
    pre_dependency_gate: gate,
    post_dependency_gate: gate,
    repair_history: context.getRepairHistory(stageId),
    terminal_status: gate.pass === false ? 'stage_failed' : 'passed',
    failed_gate: gate.pass === false ? gate.gate_kind : null,
    final_blocked_reason: gate.pass === false
      ? (gate.concerns ?? []).map((item) => item.message ?? item.code).join('; ')
      : null
  });
  if (!gate.pass) {
    const failure = createLifecycleFailure({
      stageId,
      stageSlug: slug,
      stageType: stageMeta.stage_type ?? 'contract_shaping',
      failedGate: gate.gate_kind ?? 'provided_fixture_validation',
      concerns: gate.concerns ?? [],
      repairHistory: context.getRepairHistory(stageId)
    });
    throw failure;
  }
  if (output?.schema) {
    context.freezeArtifact(createFrozenArtifactRecord({
      artifact: output,
      stageId,
      stageSlug: slug,
      schema: output.schema,
      version: output.version ?? 1,
      producedBy: 'provided_stage_output',
      validationStatus: gate.pass === false ? 'failed' : 'passed',
      auditStatus: stageMeta.stage_type === 'semantic_audit'
        ? (output?.pass === true ? 'passed' : 'failed')
        : 'not_required',
      dependencyStatus: gate.pass === false ? 'failed' : 'passed'
    }));
  }
  return output;
}

function commitStage17Success(context, result, input) {
  const pass = result?.pass === true
    && result?.code_precheck?.pass === true
    && result?.audit?.pass === true
    && result?.audit?.commit_permission?.can_continue_to_visible_context === true
    && result?.audit?.commit_permission?.can_continue_to_narrator === false;
  const gate = createGateResult({
    stageId: 17,
    stageSlug: 'time_light_gate',
    gateKind: 'time_light_commit_gate',
    pass,
    concerns: pass ? [] : (result?.audit?.concerns ?? result?.code_precheck?.concerns ?? []),
    evidence: [
      ...(result?.code_precheck?.evidence ?? []),
      ...(result?.audit?.evidence ?? [])
    ]
  });
  context.setGateResult(17, gate);
  if (gate.pass !== true) throw new Error('Stage 17 commit gate failed.');
  context.setStageOutput(17, result.audit);
  context.setStageOutput(1701, result.code_precheck);
  const visibilitySnapshot = {
    version: 1,
    schema: 'normalized_visibility_constraints_snapshot',
    request_id: input.request_id,
    normalized_visibility_constraints: structuredClone(result.audit.normalized_visibility_constraints)
  };
  context.setStageOutput(1703, visibilitySnapshot);
  context.setLifecycleState(17, {
    stage_id: 17,
    stage_slug: 'time_light_gate',
    stage_type: 'code_first_semantic_audit',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result.audit),
    structural_validation: structuredClone(result.code_precheck),
    semantic_audit_report: structuredClone(result.audit),
    post_dependency_gate: gate,
    terminal_status: 'passed',
    failed_gate: null,
    final_blocked_reason: null
  });
  for (const [stageId, stageSlug, artifact, auditStatus] of [
    [17, 'time_light_consistency_audit', result.audit, 'passed'],
    [1701, 'time_light_code_precheck', result.code_precheck, 'not_required'],
    [1703, 'normalized_visibility_constraints_snapshot', visibilitySnapshot, 'not_required']
  ]) {
    context.freezeArtifact(createFrozenArtifactRecord({
      artifact,
      stageId,
      stageSlug,
      schema: artifact.schema,
      version: artifact.version ?? 1,
      producedBy: stageSlug,
      validationStatus: 'passed',
      auditStatus,
      dependencyStatus: 'passed'
    }));
  }
  context.note(17, {
    label: 'time_light_gate',
    message: 'time/light consistency approved',
    responseRaw: { gate }
  });
  return result.audit;
}

function recordStage17Failure(context, error, input) {
  const precheck = error?.lifecycle?.code_precheck ?? null;
  const audit = error?.lifecycle?.audit ?? null;
  const route = error?.semanticRecoveryRoute?.route ?? error?.semanticRecoveryRoute ?? null;
  if (precheck) context.setStageOutput(1701, precheck);
  if (route?.schema === STAGE17_ROUTE_SCHEMA) context.setStageOutput(1702, route);
  const concerns = error?.lifecycle?.concerns ?? precheck?.concerns ?? audit?.concerns ?? [{ code: 'TIME_LIGHT_FAILED', message: error?.message ?? 'Stage 17 failed.' }];
  const gate = createGateResult({
    stageId: 17,
    stageSlug: 'time_light_gate',
    gateKind: 'time_light_commit_gate',
    pass: false,
    concerns,
    evidence: [
      ...(precheck?.evidence ?? []),
      ...(audit?.evidence ?? [])
    ]
  });
  context.setGateResult(17, gate);
  context.setLifecycleState(17, {
    stage_id: 17,
    stage_slug: 'time_light_gate',
    stage_type: 'code_first_semantic_audit',
    input_snapshot: structuredClone(input),
    structural_validation: precheck ? structuredClone(precheck) : null,
    semantic_audit_report: audit ? structuredClone(audit) : null,
    semantic_concerns: structuredClone(concerns),
    recovery_route: route ? structuredClone(route) : null,
    terminal_status: 'stage_failed',
    failed_gate: error?.lifecycle?.failed_gate ?? 'time_light_gate',
    final_blocked_reason: error?.message ?? 'Stage 17 failed.'
  });
}

function buildStage24ApprovedPipelineOutputs(context) {
  const stage18 = context.getStageOutput(18);
  const stage19 = context.getStageOutput(19);
  const stage20 = context.getStageOutput(20);
  const stage21 = context.getStageOutput(21);
  const stage22 = context.getStageOutput(22);
  const stage23 = context.getStageOutput(23);
  return {
    historical_frame: structuredClone(context.getStageOutput(3)),
    weather_state: structuredClone(context.getFrozenArtifactBySchema('weather_state')?.artifact ?? context.getStageOutput(17)?.authoritative_frame?.weather_state),
    selected_start_node: structuredClone(context.getStageOutput(9)),
    start_place_audit: structuredClone(context.getStageOutput(10)),
    player_character: structuredClone(context.getStageOutput(11)),
    player_character_audit: structuredClone(context.getStageOutput(12)),
    g5_scene_graph: structuredClone(context.getStageOutput(13)),
    g5_scene_audit: structuredClone(context.getStageOutput(14)),
    initial_npc_placement: structuredClone(context.getStageOutput(15)),
    npc_placement_audit: structuredClone(context.getStageOutput(1502)),
    initial_item_placement: structuredClone(context.getStageOutput(16)),
    item_placement_audit: structuredClone(context.getStageOutput(1602)),
    time_light_consistency_audit: structuredClone(context.getStageOutput(17)),
    character_knowledge_map: structuredClone(stage18?.character_knowledge_map ?? stage18),
    character_knowledge_map_audit: structuredClone(stage18?.character_knowledge_map_audit ?? context.getStageOutput(1802)),
    character_knowledge_write_projection: structuredClone(stage18?.write_plan ?? context.getStageOutput(1803)),
    full_hidden_scene_state: structuredClone(stage19?.full_hidden_scene_state),
    full_hidden_state_audit: structuredClone(stage19?.full_hidden_state_audit ?? context.getStageOutput(1902)),
    visible_context_package: structuredClone(stage20?.visible_context_package),
    visible_context_audit_approval: buildStage24AuditApproval(stage21, 21, stage20?.visible_context_package_digest),
    narrator_starting_prose: structuredClone(stage22?.narrator_starting_prose),
    narrator_prose_audit_approval: buildStage24AuditApproval(stage23, 23, stage23?.narrator_starting_prose_digest)
  };
}

function buildStage24AuditApproval(result, stageId, artifactDigest) {
  const audit = result?.visible_context_audit ?? result?.narrator_prose_audit ?? result;
  return {
    version: 1,
    schema: 'pipeline_stage_approval',
    stage_id: stageId,
    request_id: result?.request_id ?? audit?.request_id ?? null,
    pass: result?.pass === true && audit?.pass === true,
    artifact_digest: artifactDigest ?? null,
    commit_permission: structuredClone(result?.commit_permission ?? audit?.commit_permission ?? {})
  };
}

function commitStage24Result(context, result, input) {
  if (result?.schema !== STAGE24_RESULT_SCHEMA || result?.pass !== true) throw new Error('Stage 24 did not return an approved result bundle.');
  context.setStageOutput(24, structuredClone(result));
  context.setStageOutput(2401, structuredClone(result.party_db_write_plan_code_precheck));
  context.setStageOutput(2402, structuredClone(result.party_db_write_plan));
  context.setStageOutput(2403, structuredClone(result.party_db_write_plan_audit));
  context.setGateResult(24, createGateResult({
    stageId: 24,
    stageSlug: 'party_write_plan',
    gateKind: 'isolated_party_write_plan_gate',
    pass: true,
    concerns: [],
    evidence: [
      ...(result.party_db_write_plan_code_precheck?.evidence ?? []),
      ...(result.party_db_write_plan_audit?.evidence ?? [])
    ]
  }));
  context.setLifecycleState(24, {
    stage_id: 24,
    stage_slug: 'party_write_plan',
    stage_type: 'isolated_llm_block',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result),
    structural_validation: structuredClone(result.party_db_write_plan_code_precheck),
    semantic_audit_report: structuredClone(result.party_db_write_plan_audit),
    repair_history: structuredClone(result.repair_history ?? []),
    terminal_status: 'passed'
  });
  for (const [stageId, stageSlug, artifact, auditStatus] of [
    [24, 'party_write_plan_result', result, 'passed'],
    [2401, 'party_write_plan_code_precheck', result.party_db_write_plan_code_precheck, 'not_required'],
    [2402, 'party_db_write_plan', result.party_db_write_plan, 'passed'],
    [2403, 'party_db_write_plan_audit', result.party_db_write_plan_audit, 'passed']
  ]) {
    context.freezeArtifact(createFrozenArtifactRecord({
      artifact,
      stageId,
      stageSlug,
      schema: artifact.schema,
      version: artifact.version ?? 1,
      producedBy: 'stage24_isolated_block',
      validationStatus: 'passed',
      auditStatus,
      dependencyStatus: 'passed'
    }));
  }
}

function composeAndFreezeApprovedStartPosition(context, {
  historicalFrame,
  selectedStartNode,
  g5SceneGraphDraft
} = {}) {
  const result = composeApprovedStartPosition({
    validatedG5PositionRefs: extractValidatedG5PositionRefs(g5SceneGraphDraft),
    validatedStartSceneRefs: extractValidatedStartSceneRefs(selectedStartNode, historicalFrame),
    requestId: context.requestId
  });
  if (!result.pass) {
    const concerns = result.concerns ?? [{ code: 'START_POSITION_CONTRACT_ERROR', message: 'approved_start_position composition failed.' }];
    const failure = createLifecycleFailure({
      stageId: 1400,
      stageSlug: 'approved_start_position',
      stageType: 'contract_shaping',
      failedGate: 'dependency_consistency',
      concerns,
      repairHistory: []
    });
    context.setLifecycleState(1400, {
      stage_id: 1400,
      stage_slug: 'approved_start_position',
      stage_type: 'contract_shaping',
      semantic_concerns: concerns,
      terminal_status: 'stage_failed',
      failed_gate: 'dependency_consistency',
      final_blocked_reason: failure.message,
      missing_dependency_references: concerns.map((item) => item.field).filter(Boolean)
    });
    throw failure;
  }
  context.setStageOutput(1400, result.artifact);
  context.freezeArtifact(createFrozenArtifactRecord({
    artifact: result.artifact,
    artifactId: `approved_start_position:${context.requestId}`,
    stageId: 1400,
    stageSlug: 'approved_start_position',
    schema: 'approved_start_position',
    version: 1,
    producedBy: 'deterministic_composition',
    validationStatus: 'passed',
    auditStatus: 'passed',
    dependencyStatus: 'passed'
  }));
  context.setLifecycleState(1400, {
    stage_id: 1400,
    stage_slug: 'approved_start_position',
    stage_type: 'contract_shaping',
    parsed_output: structuredClone(result.artifact),
    structural_validation: createGateResult({
      stageId: 1400,
      stageSlug: 'approved_start_position',
      gateKind: 'dependency_consistency',
      pass: true,
      concerns: [],
      evidence: ['approved start position composed from fully approved spatial chain']
    }),
    terminal_status: 'passed'
  });
  return result.artifact;
}

function composeAndFreezeValidatedPlayerSeed(context, {
  selectedStartNode,
  playerCharacter
} = {}) {
  const approvedStartPosition = context.getFrozenArtifactBySchema('approved_start_position')?.artifact ?? null;
  const result = composeValidatedPlayerSeed({
    approvedPlayerDossier: playerCharacter,
    approvedStartPosition,
    validatedStartSceneRefs: extractValidatedStartSceneRefs(selectedStartNode, context.getStageOutput(3)),
    requestId: context.requestId,
    statPolicy: playerCharacter?.stat_policy ?? null
  });
  if (!result.pass) {
    const concerns = result.concerns ?? [{ code: 'PLAYER_SEED_COMPOSITION_FAILED', message: 'validated_player_seed composition failed.' }];
    const failedGate = concerns.some((item) => item.code === 'PLAYER_POSITION_MISMATCH')
      ? 'contract_violation'
      : 'dependency_consistency';
    const failure = createLifecycleFailure({
      stageId: 1401,
      stageSlug: 'validated_player_seed',
      stageType: 'contract_shaping',
      failedGate,
      concerns,
      repairHistory: []
    });
    context.setLifecycleState(1401, {
      stage_id: 1401,
      stage_slug: 'validated_player_seed',
      stage_type: 'contract_shaping',
      semantic_concerns: concerns,
      terminal_status: 'stage_failed',
      failed_gate: failedGate,
      final_blocked_reason: failure.message,
      missing_dependency_references: concerns.map((item) => item.field).filter(Boolean)
    });
    throw failure;
  }
  context.setStageOutput(1401, result.artifact);
  context.freezeArtifact(createFrozenArtifactRecord({
    artifact: result.artifact,
    artifactId: `validated_player_seed:${context.requestId}`,
    stageId: 1401,
    stageSlug: 'validated_player_seed',
    schema: 'player_seed_contract',
    version: 1,
    producedBy: 'deterministic_composition',
    validationStatus: 'passed',
    auditStatus: 'not_required',
    dependencyStatus: 'passed'
  }));
  context.setLifecycleState(1401, {
    stage_id: 1401,
    stage_slug: 'validated_player_seed',
    stage_type: 'contract_shaping',
    parsed_output: structuredClone(result.artifact),
    structural_validation: createGateResult({
      stageId: 1401,
      stageSlug: 'validated_player_seed',
      gateKind: 'dependency_consistency',
      pass: true,
      concerns: [],
      evidence: ['deterministic composition from approved dossier and validated refs']
    }),
    terminal_status: 'passed'
  });
  return result.artifact;
}

function buildFinalWorldStartBundle(context, stage24Output = null) {
  const snapshot = context.snapshot();
  return {
    version: 1,
    schema: 'final_world_start_bundle',
    request_id: context.requestId,
    pipeline_runtime: 'new_lifecycle',
    artifacts: {
      player_seed: context.getFrozenArtifactBySchema('player_seed_contract')?.artifact ?? null,
      g5_scene: context.getFrozenArtifactBySchema('g5_scene_graph_draft')?.artifact ?? context.getStageOutput(13),
      actor_profiles: context.getStageOutput(15) ?? null,
      items: context.getStageOutput(16) ?? null,
      hidden_state: context.getStageOutput(19)?.full_hidden_scene_state ?? null,
      hidden_state_result: context.getStageOutput(19) ?? null,
      visible_context: context.getStageOutput(20)?.visible_context_package ?? null,
      visible_context_package_digest: context.getStageOutput(20)?.visible_context_package_digest ?? null,
      visible_context_result: context.getStageOutput(20) ?? null,
      visible_context_audit: context.getStageOutput(21)?.visible_context_audit ?? null,
      visible_context_audit_result: context.getStageOutput(21) ?? null,
      narrator_prose: context.getStageOutput(22)?.narrator_starting_prose ?? null,
      narrator_prose_result: context.getStageOutput(22) ?? null,
      save_plan: stage24Output?.party_db_write_plan ?? context.getStageOutput(24)?.party_db_write_plan ?? null
    },
    frozen_artifact_refs: context.listFrozenArtifacts().map((item) => ({
      artifact_id: item.artifact_id,
      schema: item.schema,
      stage_id: item.stage_id,
      hash: item.hash
    })),
    diagnostics: snapshot.diagnostics,
    lifecycle_summary: snapshot.lifecycle
  };
}

function requirePartyId(options = {}) {
  const value = options.partyId ?? options.partyCreationContext?.party_id ?? null;
  if (!value) throw new Error('Stage 24 requires an explicitly allocated partyId before plan generation.');
  return value;
}

function requirePlayerCharacterId(playerCharacter, options = {}) {
  const value = options.playerCharacterId
    ?? options.partyCreationContext?.player_character_id
    ?? playerCharacter?.player_character_id
    ?? playerCharacter?.character_id
    ?? playerCharacter?.id
    ?? null;
  if (!value) throw new Error('Stage 24 requires approved player_character_id; fallback IDs are forbidden.');
  return value;
}

function requirePartyDatabaseSchema(options = {}) {
  const value = options.partyDatabaseSchema ?? null;
  if (!value || !Array.isArray(value.tables) || value.tables.length === 0) throw new Error('Stage 24 requires a complete partyDatabaseSchema snapshot; empty fallback is forbidden.');
  return structuredClone(value);
}

function requireWorldBaseReferenceSnapshot(options = {}) {
  const value = options.worldBaseReferenceSnapshot ?? null;
  if (!value) throw new Error('Stage 24 requires worldBaseReferenceSnapshot.');
  return structuredClone(value);
}

