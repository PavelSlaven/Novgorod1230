import { createLlmStageAdapter, concern } from '../llm-stage.js';
import { assertGatePassed, createGateResult } from '../gate.js';
import { createFrozenArtifactRecord } from '../lifecycle.js';
import {
  DEFAULT_STAT_POLICY,
  validateNumericStatPolicy,
  validatePositionReferenceConsistency,
  validateVisibleHiddenBoundary
} from '../validators.js';
import {
  buildStage2NormalizationInput,
  STAGE_2_REQUIRED_FIELDS,
  validateStage2NormalizedRequest
} from './stage2-normalization.js';
import { runStage15NpcPlacement as runStage15NpcPlacementIsolated } from './stage15-npc-placement.js';
import { runStage16ItemPlacement as runStage16ItemPlacementIsolated } from './stage16-item-placement.js';
import {
  buildStage18CharacterKnowledgeInput,
  runStage18CharacterKnowledgeMapBlock,
  STAGE18_AUDIT_SCHEMA,
  STAGE18_OUTPUT_SCHEMA,
  STAGE18_PRECHECK_SCHEMA,
  STAGE18_RESULT_SCHEMA,
  STAGE18_WRITE_PLAN_SCHEMA,
  validateProvidedStage18Result
} from './stage18-character-knowledge-map.js';
import {
  buildStage19HiddenStateInput as buildStage19IsolatedInput,
  runStage19HiddenStateBlock,
  STAGE19_AUDIT_SCHEMA,
  STAGE19_OUTPUT_SCHEMA,
  STAGE19_PRECHECK_SCHEMA,
  STAGE19_RESULT_SCHEMA
} from './stage19-hidden-state.js';
import {
  buildStage20VisibleContextInput as buildStage20IsolatedInput,
  runStage20VisibleContextBlock,
  STAGE20_OUTPUT_SCHEMA,
  STAGE20_PRECHECK_SCHEMA,
  STAGE20_RESULT_SCHEMA,
  STAGE20_VISIBILITY_FILTER_SCHEMA,
  validateProvidedStage20Result
} from './stage20-visible-context.js';
import {
  buildStage21VisibleContextAuditInput as buildStage21IsolatedInput,
  runStage21VisibleContextAuditBlock,
  STAGE21_OUTPUT_SCHEMA,
  STAGE21_PRECHECK_SCHEMA,
  STAGE21_RESULT_SCHEMA,
  STAGE21_ROUTE_SCHEMA,
  validateProvidedStage21Result
} from './stage21-visible-context-audit.js';
import {
  buildStage22NarratorInput as buildStage22IsolatedInput,
  buildStage21Approval,
  runStage22NarratorProseBlock,
  runStage22FormatRepairBlock,
  runStage22SemanticRepairBlock,
  STAGE22_APPROVAL_SCHEMA,
  STAGE22_INPUT_SCHEMA,
  STAGE22_OUTPUT_SCHEMA,
  STAGE22_PRECHECK_SCHEMA,
  STAGE22_RESULT_SCHEMA,
  validateNarratorStartingProseOutput,
  validateProvidedStage22Result
} from './stage22-narrator-prose.js';
import {
  buildStage23AuditInput as buildStage23IsolatedInput,
  buildNarratorProseCodePrecheck,
  computeNarratorStartingProseDigest,
  runStage23NarratorProseAuditBlock,
  STAGE23_AUDIT_SCHEMA,
  STAGE23_INPUT_SCHEMA,
  STAGE23_PRECHECK_SCHEMA,
  STAGE23_RESULT_SCHEMA,
  STAGE23_ROUTE_SCHEMA,
  validateNarratorProseAudit,
  validateProvidedStage23Result
} from './stage23-narrator-prose-audit.js';
import {
  STAGE24_RESULT_SCHEMA,
  validateProvidedStage24Result
} from './stage24-party-db-write-plan.js';
import { computeVisibleContextPackageDigest } from './visible-context-digest.js';
import {
  buildStage3HistoricalFrameInput,
  STAGE_3_REQUIRED_FIELDS,
  validateStage3HistoricalFrame
} from './stage3-historical-frame.js';

const DEFINITIONS = Object.freeze({
  2: def(2, 'normalize_request', 'new_game_normalized_request', {
    contractName: 'StartRequestNormalized',
    stageType: 'contract_shaping',
    requiredFields: STAGE_2_REQUIRED_FIELDS,
    validate: validateStage2NormalizedRequest,
    // Stage 2 receives the raw player wish plus a hard normalization policy.
    // It must not do world_base lookup, id mapping, character generation,
    // item/NPC creation or scene writing.
    buildInput: buildStage2NormalizationInput
  }),
  3: def(3, 'historical_frame', 'historical_frame', {
    requiredFields: STAGE_3_REQUIRED_FIELDS,
    stageType: 'semantic_selection',
    validate: validateStage3HistoricalFrame
  }),
  9: def(9, 'start_node_selection', 'selected_start_node', {
    requiredFields: ['selected_candidate_id', 'selected_candidate_place_template_link_id'],
    stageType: 'semantic_selection',
    validate: validateStage9Selection,
    buildInput: (context) => ({
      request_id: context.requestId,
      normalized_request: context.requireStageOutput(2, 'normalized request'),
      historical_frame: context.requireStageOutput(3, 'historical frame'),
      regional_context_package: context.requireStageOutput(4, 'regional context package'),
      start_candidate_set: context.requireStageOutput(5, 'start candidate set'),
      candidate_place_template_set: context.requireStageOutput(6, 'candidate place template set'),
      npc_candidate_set: context.requireStageOutput(7, 'NPC candidate set'),
      item_profile_candidate_set: context.requireStageOutput(8, 'item profile candidate set')
    })
  }),
  10: def(10, 'start_place_audit', 'start_place_audit', {
    audit: true,
    stageType: 'semantic_audit',
    buildInput: withOutputs(2, 3, 4, 5, 6, 7, 8, 9)
  }),
  11: def(11, 'player_character', 'player_character_game_profile', {
    contractName: 'PlayerCharacterStartProfile',
    stageType: 'semantic_generation',
    validate: validatePlayerDossierOutput,
    buildInput: withOutputs(2, 3, 4, 8, 9, 10)
  }),
  12: def(12, 'player_character_audit', 'player_character_audit', {
    audit: true,
    stageType: 'semantic_audit',
    buildInput: withOutputs(2, 3, 4, 8, 9, 10, 11)
  }),
  // Stages 13-14 (G5 materialization/audit) are intentionally not defined here.
  15: def(15, 'npc_placement', 'initial_npc_placement_draft', {
    contractName: 'InitialNpcLayer',
    stageType: 'semantic_generation',
    preDependencyRequirements: [{ frozenArtifact: 'player_seed_contract' }, { stageId: 14 }],
    validate: validateNpcPlacementOutput,
    buildInput: (context) => ({
      request_id: context.requestId,
      validated_player_seed: context.getFrozenArtifactBySchema('player_seed_contract')?.artifact ?? null,
      stage_outputs: Object.fromEntries([3, 7, 9, 11, 13, 14].map((id) => [id, context.requireStageOutput(id)]))
    })
  }),
  16: def(16, 'item_placement', 'initial_item_placement_draft', {
    contractName: 'InitialItemPropertyLayer',
    embeddedAuditFields: ['initial_item_placement_audit'],
    stageType: 'semantic_generation',
    preDependencyRequirements: [{ stageId: 15 }, { frozenArtifact: 'initial_npc_placement_draft' }],
    validate: validateItemPlacementOutput,
    buildInput: withOutputs(3, 8, 9, 11, 13, 14, 15)
  }),
  18: def(18, 'map_knowledge', 'character_knowledge_map', {
    contractName: 'InitialMapKnowledge',
    stageType: 'semantic_generation',
    preDependencyRequirements: [requireApprovedTimeLightAudit]
  }),
  20: def(20, 'visible_context', 'stage20_visible_context_result', {
    contractName: 'G5VisibleStartPackage',
    stageType: 'isolated_semantic_generation',
    preDependencyRequirements: [
      { stageId: 14 }, { stageId: 15 }, { stageId: 16 }, { stageId: 17 }, { stageId: 18 }, { stageId: 19 },
      requireApprovedTimeLightAudit,
      requireApprovedKnowledgeMapAudit
    ]
  }),
  22: def(22, 'narrator_prose', STAGE22_RESULT_SCHEMA, {
    stageType: 'isolated_llm_block',
    isolatedBlock: true,
    preDependencyRequirements: [
      { stageId: 21 },
      { stageId: 20 },
      requireApprovedVisibleContextAudit,
      requireApprovedTemporalVisibleContext
    ]
  }),
  23: def(23, 'narrator_prose_audit', STAGE23_RESULT_SCHEMA, {
    audit: true,
    stageType: 'isolated_llm_block',
    isolatedBlock: true,
    preDependencyRequirements: [{ stageId: 22 }, { stageId: 21 }, { stageId: 20 }]
  }),
  24: def(24, 'party_write_plan', STAGE24_RESULT_SCHEMA, {
    stageType: 'isolated_llm_block',
    isolatedBlock: true,
    preDependencyRequirements: [{ stageId: 23 }, { stageId: 22 }, { stageId: 21 }, { stageId: 20 }]
  })
});

export const NEW_GAME_LLM_STAGE_IDS = Object.freeze(Object.keys(DEFINITIONS).map(Number));

export function getNewGameLlmStageDefinition(stageId) {
  return DEFINITIONS[Number(stageId)] ?? null;
}

export function rejectProvidedStage24Output() {
  return validateProvidedStage24Result();
}

export async function runNewGameLlmStage(context, stageId, options = {}) {
  const definition = getNewGameLlmStageDefinition(stageId);
  if (!definition) {
    throw new Error(`No new-game LLM adapter for stage ${stageId}.`);
  }
  if (definition.isolatedBlock === true) {
    throw new Error(`Stage ${stageId} is an isolated block and cannot run through createLlmStageAdapter.`);
  }
  return createLlmStageAdapter(definition)(context, options);
}

export async function runStage2NormalizeRequest(context, options = {}) {
  return runNewGameLlmStage(context, 2, options);
}

export async function runStage3HistoricalFrame(context, options = {}) {
  const input = options.input ?? await buildStage3HistoricalFrameInput(context, options);
  return runNewGameLlmStage(context, 3, { ...options, input });
}

export async function runStage9StartNodeSelection(context, options = {}) {
  return runNewGameLlmStage(context, 9, options);
}

export async function runStage10StartPlaceAudit(context, options = {}) {
  return runNewGameLlmStage(context, 10, options);
}

export async function runStage11PlayerCharacter(context, options = {}) {
  return runNewGameLlmStage(context, 11, options);
}

export async function runStage12PlayerCharacterAudit(context, options = {}) {
  return runNewGameLlmStage(context, 12, options);
}

export async function runStage15NpcPlacement(context, options = {}) {
  return runStage15NpcPlacementIsolated(context, options);
}

export async function runStage16ItemPlacement(context, options = {}) {
  return runStage16ItemPlacementIsolated(context, options);
}

export async function runStage18MapKnowledge(context, options = {}) {
  const provided = options.providedMap
    ?? options.providedOutput
    ?? options.stageOutputs?.[18]
    ?? options.stageOutputs?.map_knowledge
    ?? options.stageOutputs?.character_knowledge_map
    ?? null;
  if (provided) validateProvidedStage18Result();

  const input = options.input?.schema === 'character_knowledge_map_input'
    ? options.input
    : buildStage18InputFromContext(context, options);
  const executor = options.executor ?? options.llmStageExecutor;
  if (typeof executor !== 'function') throw new Error('Stage 18 requires an explicit role executor.');

  const roleCall = (role, modelTier) => async (roleInput) => executor({
    input: roleInput,
    stage: {
      id: 18,
      slug: 'map_knowledge',
      role,
      model_tier: modelTier,
      output_schema: role === 'CharacterKnowledgeMapAuditor'
        || (role === 'CharacterKnowledgeMapFormatRepairer' && roleInput?.target === STAGE18_AUDIT_SCHEMA)
        ? STAGE18_AUDIT_SCHEMA
        : STAGE18_OUTPUT_SCHEMA,
      spec_file: '18.txt'
    }
  });

  let result;
  try {
    result = await runStage18CharacterKnowledgeMapBlock({
      input,
      build: options.build ?? options.characterKnowledgeMapBuilder ?? roleCall('CharacterKnowledgeMapBuilder', 'tier_2_standard'),
      audit: options.audit ?? options.characterKnowledgeMapAuditor ?? roleCall('CharacterKnowledgeMapAuditor', 'tier_2_standard'),
      formatRepair: options.formatRepair ?? options.characterKnowledgeMapFormatRepairer ?? roleCall('CharacterKnowledgeMapFormatRepairer', 'tier_1_fast'),
      semanticRepair: options.semanticRepair ?? options.characterKnowledgeMapSemanticRepairer ?? roleCall('CharacterKnowledgeMapSemanticRepairer', 'tier_2_standard'),
      seniorRepair: options.seniorRepair ?? options.characterKnowledgeMapSeniorRepairer ?? roleCall('CharacterKnowledgeMapSeniorRepairer', 'tier_3_senior')
    });
  } catch (error) {
    recordIsolatedStageFailure(context, 18, 'map_knowledge', 'isolated_semantic_generation', input, error);
    throw error;
  }

  commitStage18Artifacts(context, result, input);
  return result.character_knowledge_map;
}

export async function runStage19HiddenState(context, options = {}) {
  const provided = options.providedOutput
    ?? options.stageOutputs?.[19]
    ?? options.stageOutputs?.hidden_state
    ?? options.stageOutputs?.full_hidden_scene_state
    ?? null;
  if (provided) {
    throw new Error('Provided Stage 19 output is forbidden in production, development and tests. Stub the role executor instead.');
  }

  const input = options.input?.schema === 'hidden_state_builder_input'
    ? options.input
    : buildStage19HiddenStateInput(context, options);
  const executor = options.executor ?? options.llmStageExecutor;
  if (typeof executor !== 'function') throw new Error('Stage 19 requires an explicit role executor.');

  const roleCall = (role, modelTier) => async (roleInput) => executor({
    input: roleInput,
    stage: {
      id: 19,
      slug: 'hidden_state',
      role,
      model_tier: modelTier,
      output_schema: role === 'FullHiddenStateAuditor'
        || (role === 'FullHiddenStateFormatRepairer' && roleInput?.target === STAGE19_AUDIT_SCHEMA)
        ? STAGE19_AUDIT_SCHEMA
        : STAGE19_OUTPUT_SCHEMA,
      spec_file: '19.txt'
    }
  });

  const result = await runStage19HiddenStateBlock({
    input,
    build: options.build ?? options.hiddenStateBuilder ?? roleCall('FullHiddenStateBuilder', 'tier_2_standard'),
    audit: options.audit ?? options.hiddenStateAuditor ?? roleCall('FullHiddenStateAuditor', 'tier_2_standard'),
    formatRepair: options.formatRepair ?? options.hiddenStateFormatRepairer ?? roleCall('FullHiddenStateFormatRepairer', 'tier_1_fast'),
    semanticRepair: options.semanticRepair ?? options.hiddenStateSemanticRepairer ?? roleCall('FullHiddenStateSemanticRepairer', 'tier_2_standard'),
    seniorRepair: options.seniorRepair ?? options.hiddenStateSeniorRepairer ?? roleCall('FullHiddenStateSeniorRepairer', 'tier_3_senior')
  });

  commitStage19Artifacts(context, result, input);
  return result;
}

export function buildStage18InputFromContext(context, options = {}) {
  const historicalFrame = context.requireStageOutput(3, 'historical frame');
  const regionalContextPackage = context.requireStageOutput(4, 'regional context package');
  const selectedStartNode = context.requireStageOutput(9, 'selected start node');
  const playerCharacter = context.requireStageOutput(11, 'player character');
  const g5SceneGraph = context.requireStageOutput(13, 'g5 scene graph');
  const currentPosition = buildPreCommitCurrentPosition(g5SceneGraph);
  const weatherState = options.weatherState
    ?? options.weather_state
    ?? context.getFrozenArtifactBySchema('weather_state')?.artifact
    ?? null;
  return buildStage18CharacterKnowledgeInput({
    request_id: context.requestId,
    historical_frame: historicalFrame,
    weather_state: weatherState,
    selected_start_node: selectedStartNode,
    start_place_audit: context.requireStageOutput(10, 'start place audit'),
    player_character: playerCharacter,
    player_character_audit: context.requireStageOutput(12, 'player character audit'),
    current_position: currentPosition,
    g5_scene_graph: g5SceneGraph,
    g5_scene_audit: context.requireStageOutput(14, 'G5 scene audit'),
    initial_npc_placement: context.requireStageOutput(15, 'initial NPC placement'),
    npc_placement_audit: context.requireStageOutput(1502, 'initial NPC placement audit'),
    initial_item_placement: context.requireStageOutput(16, 'initial item placement'),
    item_placement_audit: context.requireStageOutput(1602, 'initial item placement audit'),
    time_light_consistency_audit: context.requireStageOutput(17, 'time/light consistency audit'),
    regional_context_package: regionalContextPackage,
    world_base_route_snapshot: options.worldBaseRouteSnapshot
      ?? options.world_base_route_snapshot
      ?? null,
    knowledge_policy: options.knowledgePolicy
      ?? options.knowledge_policy
      ?? options.policies?.knowledge_policy
      ?? options.policies?.character_knowledge
      ?? {}
  });
}

export function buildStage19HiddenStateInput(context, options = {}) {
  const knowledgeAudit = context.requireStageOutput(1802, 'character knowledge map audit');
  if (knowledgeAudit?.pass !== true || knowledgeAudit?.commit_permission?.can_continue_to_hidden_state !== true) {
    throw new Error('Stage 19 requires a passing Stage 18 audit with hidden-state permission.');
  }
  const timeLightAudit = context.requireStageOutput(17, 'time/light consistency audit');
  if (timeLightAudit?.pass !== true || timeLightAudit?.commit_permission?.can_continue_to_visible_context !== true) {
    throw new Error('Stage 19 requires a passing Stage 17 audit with visible-context permission.');
  }
  const stage18InputSnapshot = context.getLifecycleState?.(18)?.input_snapshot ?? null;
  return buildStage19IsolatedInput({
    request_id: context.requestId,
    historical_frame: context.requireStageOutput(3, 'historical frame'),
    weather_state: options.weatherState
      ?? options.weather_state
      ?? context.getFrozenArtifactBySchema('weather_state')?.artifact
      ?? timeLightAudit?.authoritative_frame?.weather_state
      ?? null,
    selected_start_node: context.requireStageOutput(9, 'selected start node'),
    player_character: context.requireStageOutput(11, 'player character'),
    g5_scene_graph: context.requireStageOutput(13, 'g5 scene graph'),
    g5_scene_audit: context.requireStageOutput(14, 'G5 scene audit'),
    initial_npc_placement: context.requireStageOutput(15, 'initial NPC placement'),
    npc_placement_audit: context.requireStageOutput(1502, 'initial NPC placement audit'),
    initial_item_placement: context.requireStageOutput(16, 'initial item placement'),
    item_placement_audit: context.requireStageOutput(1602, 'initial item placement audit'),
    time_light_consistency_audit: timeLightAudit,
    character_knowledge_map: context.requireStageOutput(18, 'character knowledge map'),
    character_knowledge_map_audit: knowledgeAudit,
    regional_context_package: context.requireStageOutput(4, 'regional context package'),
    world_base_route_snapshot: options.worldBaseRouteSnapshot
      ?? options.world_base_route_snapshot
      ?? stage18InputSnapshot?.world_base_route_snapshot
      ?? null,
    hidden_state_policy: options.hiddenStatePolicy
      ?? options.hidden_state_policy
      ?? options.policies?.hidden_state_policy
      ?? options.policies?.hidden_state
      ?? {}
  });
}

export function commitStage19Artifacts(context, result, input) {
  const pass = result?.schema === STAGE19_RESULT_SCHEMA
    && result?.pass === true
    && result?.full_hidden_scene_state?.schema === STAGE19_OUTPUT_SCHEMA
    && result?.full_hidden_state_code_precheck?.schema === STAGE19_PRECHECK_SCHEMA
    && result?.full_hidden_state_code_precheck?.pass === true
    && result?.full_hidden_state_audit?.schema === STAGE19_AUDIT_SCHEMA
    && result?.full_hidden_state_audit?.pass === true
    && result?.commit_permission?.can_continue_to_visible_context === true;
  const concerns = pass
    ? []
    : [
        ...(result?.full_hidden_state_code_precheck?.concerns ?? []),
        ...(result?.full_hidden_state_audit?.concerns ?? []),
        ...((result?.commit_permission?.reasons ?? []).map((reason) => ({ code: 'HIDDEN_STATE_COMMIT_DENIED', message: reason, field: 'commit_permission' })))
      ];
  const gate = createGateResult({
    stageId: 19,
    stageSlug: 'hidden_state',
    gateKind: 'full_hidden_state_commit_gate',
    pass,
    concerns,
    evidence: [
      ...(result?.full_hidden_state_code_precheck?.evidence ?? []),
      ...(result?.full_hidden_state_audit?.evidence ?? [])
    ]
  });
  context.setGateResult(19, gate);
  assertGatePassed(gate);
  context.setStageOutput(19, result);
  context.setStageOutput(1901, result.full_hidden_state_code_precheck);
  context.setStageOutput(1902, result.full_hidden_state_audit);
  context.setStageOutput(1904, result);
  context.setLifecycleState(19, {
    stage_id: 19,
    stage_slug: 'hidden_state',
    stage_type: 'isolated_semantic_generation',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result.full_hidden_scene_state),
    structural_validation: structuredClone(result.full_hidden_state_code_precheck),
    semantic_audit_report: structuredClone(result.full_hidden_state_audit),
    repair_history: structuredClone(result.repair_history ?? []),
    diagnostics: structuredClone(result.diagnostics ?? {}),
    pre_dependency_gate: createGateResult({
      stageId: 19,
      stageSlug: 'hidden_state',
      gateKind: 'pre_dependency_gate',
      pass: true
    }),
    post_dependency_gate: gate,
    terminal_status: 'passed',
    failed_gate: null,
    final_blocked_reason: null
  });
  freezeStage19(context, 19, 'hidden_state_result', result, 'passed', 'passed');
  freezeStage19(context, 1901, 'hidden_state_code_precheck', result.full_hidden_state_code_precheck, 'passed', 'not_required');
  freezeStage19(context, 1902, 'hidden_state_audit', result.full_hidden_state_audit, 'passed', 'passed');
  freezeStage19(context, 1903, 'full_hidden_scene_state', result.full_hidden_scene_state, 'passed', 'passed');
  context.note?.(19, {
    label: 'hidden_state',
    message: 'full hidden scene state ready',
    responseRaw: { gate, repair_history: result.repair_history ?? [] }
  });
}

function freezeStage19(context, stageId, stageSlug, artifact, validationStatus, auditStatus) {
  context.freezeArtifact(createFrozenArtifactRecord({
    artifact,
    stageId,
    stageSlug,
    schema: artifact.schema,
    version: artifact.version ?? 1,
    producedBy: 'stage19_isolated_block',
    validationStatus,
    auditStatus,
    dependencyStatus: 'passed'
  }));
}

export function commitStage18Artifacts(context, result, input) {
  const pass = result?.pass === true
    && result?.schema === STAGE18_RESULT_SCHEMA
    && result?.code_precheck?.schema === STAGE18_PRECHECK_SCHEMA
    && result?.code_precheck?.pass === true
    && result?.character_knowledge_map_audit?.schema === STAGE18_AUDIT_SCHEMA
    && result?.character_knowledge_map_audit?.pass === true
    && result?.character_knowledge_map_audit?.commit_permission?.can_commit_character_knowledge === true
    && result?.character_knowledge_map_audit?.commit_permission?.can_continue_to_hidden_state === true
    && result?.write_plan?.schema === STAGE18_WRITE_PLAN_SCHEMA
    && result?.commit_permission === true;
  const concerns = pass
    ? []
    : [
        ...(result?.code_precheck?.concerns ?? []),
        ...(result?.character_knowledge_map_audit?.concerns ?? [])
      ];
  const gate = createGateResult({
    stageId: 18,
    stageSlug: 'map_knowledge',
    gateKind: 'character_knowledge_map_commit_gate',
    pass,
    concerns,
    evidence: [
      ...(result?.code_precheck?.evidence ?? []),
      ...(result?.character_knowledge_map_audit?.evidence ?? [])
    ]
  });
  context.setGateResult(18, gate);
  assertGatePassed(gate);
  context.setStageOutput(18, result.character_knowledge_map);
  context.setStageOutput(1801, result.code_precheck);
  context.setStageOutput(1802, result.character_knowledge_map_audit);
  context.setStageOutput(1803, result.write_plan);
  context.setStageOutput(1804, result);
  context.setLifecycleState(18, {
    stage_id: 18,
    stage_slug: 'map_knowledge',
    stage_type: 'isolated_semantic_generation',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result.character_knowledge_map),
    structural_validation: structuredClone(result.code_precheck),
    semantic_audit_report: structuredClone(result.character_knowledge_map_audit),
    write_plan: structuredClone(result.write_plan),
    repair_history: structuredClone(result.repair_history ?? []),
    pre_dependency_gate: createGateResult({
      stageId: 18,
      stageSlug: 'map_knowledge',
      gateKind: 'pre_dependency_gate',
      pass: true
    }),
    post_dependency_gate: gate,
    terminal_status: 'passed',
    failed_gate: null,
    final_blocked_reason: null
  });
  freezeStage18(context, 18, 'map_knowledge', result.character_knowledge_map, 'passed', 'passed');
  freezeStage18(context, 1801, 'map_knowledge_code_precheck', result.code_precheck, 'passed', 'not_required');
  freezeStage18(context, 1802, 'map_knowledge_audit', result.character_knowledge_map_audit, 'passed', 'passed');
  freezeStage18(context, 1803, 'map_knowledge_write_plan', result.write_plan, 'passed', 'passed');
  context.note?.(18, {
    label: 'map_knowledge',
    message: 'character knowledge map ready',
    responseRaw: { gate, repair_history: result.repair_history ?? [] }
  });
}

function freezeStage18(context, stageId, stageSlug, artifact, validationStatus, auditStatus) {
  context.freezeArtifact(createFrozenArtifactRecord({
    artifact,
    stageId,
    stageSlug,
    schema: artifact.schema,
    version: artifact.version ?? 1,
    producedBy: 'stage18_isolated_block',
    validationStatus,
    auditStatus,
    dependencyStatus: 'passed'
  }));
}

export async function runStage20VisibleContext(context, options = {}) {
  const provided = options.providedOutput
    ?? options.stageOutputs?.[20]
    ?? options.stageOutputs?.visible_context
    ?? options.stageOutputs?.visible_context_package
    ?? null;
  if (provided) validateProvidedStage20Result();
  const input = options.input?.schema === 'visible_context_builder_input'
    ? options.input
    : buildStage20VisibleContextInputFromContext(context, options);
  const executor = options.executor ?? options.llmStageExecutor;
  if (typeof executor !== 'function') throw new Error('Stage 20 requires an explicit role executor.');
  const roleCall = (role, modelTier) => async (roleInput) => executor({
    input: roleInput,
    stage: {
      id: 20,
      slug: 'visible_context',
      role,
      model_tier: modelTier,
      output_schema: STAGE20_OUTPUT_SCHEMA,
      spec_file: '20.txt'
    }
  });
  let result;
  try {
    result = await runStage20VisibleContextBlock({
      input,
      build: options.build ?? options.visibleContextBuilder ?? roleCall('VisibleContextBuilder', 'tier_2_standard'),
      formatRepair: options.formatRepair ?? options.visibleContextFormatRepairer ?? roleCall('VisibleContextFormatRepairer', 'tier_1_fast'),
      semanticRepair: options.semanticRepair ?? options.visibleContextSemanticRepairer ?? roleCall('VisibleContextSemanticRepairer', 'tier_2_standard'),
      seniorRepair: options.seniorRepair ?? options.visibleContextSeniorRepairer ?? roleCall('SeniorVisibleContextSemanticRepairer', 'tier_3_senior'),
      repairRequest: options.repairRequest ?? options.stage21RepairRequest ?? null
    });
  } catch (error) {
    recordIsolatedStageFailure(context, 20, 'visible_context', 'isolated_semantic_generation', input, error);
    throw error;
  }
  commitStage20Artifacts(context, result, input);
  return result;
}

export async function runStage21VisibleContextAudit(context, options = {}) {
  const provided = options.providedOutput
    ?? options.stageOutputs?.[21]
    ?? options.stageOutputs?.visible_context_audit
    ?? null;
  if (provided) validateProvidedStage21Result();
  const input = options.input?.schema === 'visible_context_audit_input'
    ? options.input
    : buildStage21VisibleContextAuditInput(context);
  const executor = options.executor ?? options.llmStageExecutor;
  if (typeof executor !== 'function') throw new Error('Stage 21 requires an explicit role executor.');
  const roleConfigs = {
    VisibleContextSemanticAuditor: { provider: 'deepseek', model: 'deepseek-v4-pro', thinking: { type: 'enabled' }, reasoning_effort: 'high', response_format: { type: 'json_object' }, max_tokens: 10000 },
    VisibleContextAuditFormatRepairer: { provider: 'deepseek', model: 'deepseek-v4-flash', thinking: { type: 'disabled' }, reasoning_effort: 'low', response_format: { type: 'json_object' }, max_tokens: 6000 },
    SeniorVisibleContextSemanticAuditor: { provider: 'deepseek', model: 'deepseek-v4-pro', thinking: { type: 'enabled' }, reasoning_effort: 'high', response_format: { type: 'json_object' }, max_tokens: 12000 },
    VisibleContextAuditRouter: { provider: 'deepseek', model: 'deepseek-v4-pro', thinking: { type: 'enabled' }, reasoning_effort: 'high', response_format: { type: 'json_object' }, max_tokens: 8000 }
  };
  const roleCall = (role, modelTier, outputSchema) => async (roleInput) => executor({
    input: roleInput,
    stage: {
      id: 21,
      slug: 'visible_context_audit',
      role,
      model_tier: modelTier,
      output_schema: outputSchema,
      spec_file: '21.txt',
      ...structuredClone(roleConfigs[role] ?? {})
    }
  });
  let result;
  try {
    result = await runStage21VisibleContextAuditBlock({
      input,
      auditor: options.auditor ?? options.visibleContextSemanticAuditor ?? roleCall('VisibleContextSemanticAuditor', 'tier_2_standard', STAGE21_OUTPUT_SCHEMA),
      formatRepairer: options.formatRepairer ?? options.visibleContextAuditFormatRepairer ?? roleCall('VisibleContextAuditFormatRepairer', 'tier_1_fast', STAGE21_OUTPUT_SCHEMA),
      seniorAuditor: options.seniorAuditor ?? options.visibleContextSeniorAuditor ?? roleCall('SeniorVisibleContextSemanticAuditor', 'tier_3_senior', STAGE21_OUTPUT_SCHEMA),
      auditRouter: options.auditRouter ?? options.visibleContextAuditRouter ?? roleCall('VisibleContextAuditRouter', 'tier_2_standard', STAGE21_ROUTE_SCHEMA)
    });
  } catch (error) {
    recordIsolatedStageFailure(context, 21, 'visible_context_audit', 'isolated_llm_audit_block', input, error);
    throw error;
  }
  commitStage21Artifacts(context, result, input);
  return result;
}

export async function runStage22NarratorProse(context, options = {}) {
  const provided = options.providedOutput
    ?? options.stageOutputs?.[22]
    ?? options.stageOutputs?.narrator_prose
    ?? options.stageOutputs?.narrator_starting_prose
    ?? null;
  if (provided) validateProvidedStage22Result();
  if (options.input != null) throw new Error('Stage 22 input override is forbidden. Build input from approved Stage 20 and Stage 21 results.');
  const input = buildStage22NarratorInputFromContext(context, options);
  const executor = options.executor ?? options.llmStageExecutor;
  if (typeof executor !== 'function') throw new Error('Stage 22 requires an explicit narrator role executor.');
  const roleConfigs = {
    NarratorStartingProseWriter: { provider: 'deepseek', model: 'deepseek-v4-pro', thinking: { type: 'enabled' }, reasoning_effort: 'high', response_format: { type: 'json_object' }, max_tokens: 5000 },
    NarratorProseFormatRepairer: { provider: 'deepseek', model: 'deepseek-v4-flash', thinking: { type: 'disabled' }, reasoning_effort: 'low', response_format: { type: 'json_object' }, max_tokens: 5000 },
    SeniorNarratorStartingProseWriter: { provider: 'deepseek', model: 'deepseek-v4-pro', thinking: { type: 'enabled' }, reasoning_effort: 'high', response_format: { type: 'json_object' }, max_tokens: 7000 }
  };
  const roleCall = (role, modelTier) => async (roleInput) => executor({
    input: roleInput,
    stage: {
      id: 22,
      slug: 'narrator_prose',
      role,
      model_tier: modelTier,
      output_schema: STAGE22_OUTPUT_SCHEMA,
      spec_file: '22.txt',
      ...structuredClone(roleConfigs[role] ?? {})
    }
  });
  let result;
  try {
    result = await runStage22NarratorProseBlock({
      input,
      writer: options.writer ?? options.narratorStartingProseWriter ?? roleCall('NarratorStartingProseWriter', 'tier_2_standard'),
      formatRepairer: options.formatRepairer ?? options.narratorProseFormatRepairer ?? roleCall('NarratorProseFormatRepairer', 'tier_1_fast'),
      seniorWriter: options.seniorWriter ?? options.seniorNarratorStartingProseWriter ?? roleCall('SeniorNarratorStartingProseWriter', 'tier_3_senior')
    });
  } catch (error) {
    recordIsolatedStageFailure(context, 22, 'narrator_prose', 'isolated_llm_block', input, error);
    throw error;
  }
  commitStage22Artifacts(context, result, input);
  return result;
}

export async function repairStage22NarratorProseFormat(context, { failedResult, proseAudit, ...options } = {}) {
  if (options.input != null) throw new Error('Stage 22 format repair input override is forbidden.');
  const input = buildStage22NarratorInputFromContext(context, options);
  const executor = options.executor ?? options.llmStageExecutor;
  const direct = options.formatRepairer ?? options.narratorProseFormatRepairer;
  if (typeof direct !== 'function' && typeof executor !== 'function') throw new Error('Stage 22 format repair requires an explicit format repair executor.');
  const formatRepairer = direct ?? (async (roleInput) => executor({
    input: roleInput,
    stage: {
      id: 22,
      slug: 'narrator_prose',
      role: 'NarratorProseFormatRepairer',
      model_tier: 'tier_1_fast',
      output_schema: STAGE22_OUTPUT_SCHEMA,
      spec_file: '22.txt',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
      max_tokens: 5000
    }
  }));
  let result;
  try {
    result = await runStage22FormatRepairBlock({ input, failedResult, proseAudit, formatRepairer });
  } catch (error) {
    recordIsolatedStageFailure(context, 22, 'narrator_prose', 'isolated_llm_block', input, error);
    throw error;
  }
  commitStage22Artifacts(context, result, input);
  return result;
}

export async function repairStage22NarratorProse(context, { failedResult, proseAudit, ...options } = {}) {
  if (options.input != null) throw new Error('Stage 22 repair input override is forbidden.');
  const input = buildStage22NarratorInputFromContext(context, options);
  const executor = options.executor ?? options.llmStageExecutor;
  if (typeof executor !== 'function') throw new Error('Stage 22 semantic repair requires an explicit role executor.');
  const roleConfigs = {
    NarratorProseSemanticRepairer: { provider: 'deepseek', model: 'deepseek-v4-pro', thinking: { type: 'enabled' }, reasoning_effort: 'high', response_format: { type: 'json_object' }, max_tokens: 6000 },
    NarratorProseFormatRepairer: { provider: 'deepseek', model: 'deepseek-v4-flash', thinking: { type: 'disabled' }, reasoning_effort: 'low', response_format: { type: 'json_object' }, max_tokens: 5000 },
    SeniorNarratorProseSemanticRepairer: { provider: 'deepseek', model: 'deepseek-v4-pro', thinking: { type: 'enabled' }, reasoning_effort: 'high', response_format: { type: 'json_object' }, max_tokens: 8000 }
  };
  const roleCall = (role, modelTier) => async (roleInput) => executor({
    input: roleInput,
    stage: {
      id: 22,
      slug: 'narrator_prose',
      role,
      model_tier: modelTier,
      output_schema: STAGE22_OUTPUT_SCHEMA,
      spec_file: '22.txt',
      ...structuredClone(roleConfigs[role] ?? {})
    }
  });
  let result;
  try {
    result = await runStage22SemanticRepairBlock({
      input,
      failedResult,
      proseAudit,
      semanticRepairer: options.semanticRepairer ?? options.narratorProseSemanticRepairer ?? roleCall('NarratorProseSemanticRepairer', 'tier_2_standard'),
      formatRepairer: options.formatRepairer ?? options.narratorProseFormatRepairer ?? roleCall('NarratorProseFormatRepairer', 'tier_1_fast'),
      seniorRepairer: options.seniorRepairer ?? options.seniorNarratorProseSemanticRepairer ?? roleCall('SeniorNarratorProseSemanticRepairer', 'tier_3_senior')
    });
  } catch (error) {
    recordIsolatedStageFailure(context, 22, 'narrator_prose', 'isolated_llm_block', input, error);
    throw error;
  }
  commitStage22Artifacts(context, result, input);
  return result;
}

export async function runStage23NarratorProseAudit(context, options = {}) {
  if (options.input != null) throw new Error('Stage 23 input override is forbidden. Build input from approved Stage 20-22 results.');
  const input = buildStage23NarratorProseAuditInput(context, options);
  const executor = options.executor ?? options.llmStageExecutor;
  if (typeof executor !== 'function') throw new Error('Stage 23 requires an explicit role executor.');
  const roleConfigs = {
    NarratorProseSemanticAuditor: { provider: 'deepseek', model: 'deepseek-v4-pro', thinking: { type: 'enabled' }, reasoning_effort: 'high', response_format: { type: 'json_object' }, max_tokens: 7000 },
    NarratorProseAuditFormatRepairer: { provider: 'deepseek', model: 'deepseek-v4-flash', thinking: { type: 'disabled' }, reasoning_effort: 'low', response_format: { type: 'json_object' }, max_tokens: 5000 },
    SeniorNarratorProseSemanticAuditor: { provider: 'deepseek', model: 'deepseek-v4-pro', thinking: { type: 'enabled' }, reasoning_effort: 'high', response_format: { type: 'json_object' }, max_tokens: 9000 },
    NarratorProseAuditRouter: { provider: 'deepseek', model: 'deepseek-v4-pro', thinking: { type: 'enabled' }, reasoning_effort: 'high', response_format: { type: 'json_object' }, max_tokens: 3000 }
  };
  const roleCall = (role, modelTier, outputSchema) => async (roleInput) => executor({
    input: roleInput,
    stage: {
      id: 23,
      slug: 'narrator_prose_audit',
      role,
      model_tier: modelTier,
      output_schema: outputSchema,
      spec_file: '23.txt',
      ...structuredClone(roleConfigs[role] ?? {})
    }
  });
  let result;
  try {
    result = await runStage23NarratorProseAuditBlock({
      input,
      auditor: options.narratorProseSemanticAuditor ?? roleCall('NarratorProseSemanticAuditor', 'tier_2_standard', STAGE23_AUDIT_SCHEMA),
      formatRepairer: options.narratorProseAuditFormatRepairer ?? roleCall('NarratorProseAuditFormatRepairer', 'tier_1_fast', STAGE23_AUDIT_SCHEMA),
      seniorAuditor: options.seniorNarratorProseSemanticAuditor ?? roleCall('SeniorNarratorProseSemanticAuditor', 'tier_3_senior', STAGE23_AUDIT_SCHEMA),
      router: options.narratorProseAuditRouter ?? roleCall('NarratorProseAuditRouter', 'tier_2_standard', STAGE23_ROUTE_SCHEMA)
    });
  } catch (error) {
    recordIsolatedStageFailure(context, 23, 'narrator_prose_audit', 'isolated_llm_block', input, error);
    throw error;
  }
  commitStage23Artifacts(context, result, input);
  return result;
}

function recordIsolatedStageFailure(context, stageId, stageSlug, stageType, input, error) {
  const concerns = Array.isArray(error?.concerns) && error.concerns.length > 0
    ? error.concerns
    : [{ code: error?.code ?? 'ISOLATED_STAGE_FAILED', severity: 'hard_block', message: error?.message ?? String(error), field: error?.failedGate ?? 'root' }];
  const gate = createGateResult({
    stageId,
    stageSlug,
    gateKind: error?.failedGate ?? 'isolated_stage_failure',
    pass: false,
    concerns,
    evidence: []
  });
  context.setGateResult?.(stageId, gate);
  context.setLifecycleState?.(stageId, {
    stage_id: stageId,
    stage_slug: stageSlug,
    stage_type: stageType,
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(error?.character_knowledge_map ?? error?.visible_context_package ?? error?.failed_output ?? null),
    structural_validation: structuredClone(error?.code_precheck ?? error?.visible_context_code_precheck ?? error?.narrator_start_code_precheck ?? error?.narrator_prose_code_precheck ?? null),
    repair_history: structuredClone(error?.repair_history ?? []),
    post_dependency_gate: gate,
    terminal_status: error?.terminal === false ? 'retryable_failure' : 'stage_failed',
    failed_gate: error?.failedGate ?? 'isolated_stage_failure',
    final_blocked_reason: error?.message ?? String(error)
  });
  context.note?.(stageId, {
    label: stageSlug,
    message: error?.message ?? String(error),
    responseRaw: { concerns, failed_gate: error?.failedGate ?? null }
  });
}

function def(stageId, stageSlug, outputSchema, overrides = {}) {
  return Object.freeze({
    stageId,
    stageSlug,
    outputSchema,
    contractName: overrides.contractName ?? null,
    requiredFields: Object.freeze(overrides.requiredFields ?? []),
    embeddedAuditFields: Object.freeze(overrides.embeddedAuditFields ?? []),
    audit: overrides.audit === true,
    buildInput: overrides.buildInput ?? null,
    validate: overrides.validate ?? null,
    stageType: overrides.stageType ?? null,
    preDependencyRequirements: Object.freeze(overrides.preDependencyRequirements ?? []),
    postDependencyRequirements: Object.freeze(overrides.postDependencyRequirements ?? []),
    mutableScopeDefaults: Object.freeze(overrides.mutableScopeDefaults ?? { allowed: [], forbidden: [] }),
    statPolicy: overrides.statPolicy ?? null,
    isolatedBlock: overrides.isolatedBlock === true
  });
}

function withOutputs(...stageIds) {
  return (context) => ({
    request_id: context.requestId,
    stage_outputs: Object.fromEntries(stageIds.map((id) => [id, context.requireStageOutput(id)]))
  });
}

function validateStage9Selection(output, input) {
  const candidateIds = new Set((input.start_candidate_set?.candidates ?? []).map((item) => item.candidate_id ?? item.id).filter(Boolean));
  const linkIds = new Set((input.candidate_place_template_set?.candidate_template_links ?? []).map((item) => (
    item.candidate_place_template_link_id ?? item.link_id ?? item.id
  )).filter(Boolean));
  const concerns = [];

  if (!candidateIds.has(output?.selected_candidate_id)) {
    concerns.push(concern(
      'NEW_GAME_STAGE_9_UNKNOWN_CANDIDATE',
      'selected_candidate_id must exist in start_candidate_set.',
      { field: 'selected_candidate_id' }
    ));
  }
  if (!linkIds.has(output?.selected_candidate_place_template_link_id)) {
    concerns.push(concern(
      'NEW_GAME_STAGE_9_UNKNOWN_PLACE_TEMPLATE_LINK',
      'selected_candidate_place_template_link_id must exist in candidate_place_template_set.',
      { field: 'selected_candidate_place_template_link_id' }
    ));
  }

  return concerns;
}

function validatePlayerDossierOutput(output) {
  const concerns = [];
  concerns.push(...validateNumericStatPolicy(output?.attributes, {
    path: 'root.attributes',
    policy: output.stat_policy ?? DEFAULT_STAT_POLICY,
    justificationPaths: ['attribute_justifications']
  }));
  return concerns;
}

function validateNpcPlacementOutput(output) {
  const concerns = validatePositionReferenceConsistency(output, {
    visibleActorPaths: ['visible_npcs', 'npcs', 'actors'],
    requiredPaths: []
  });
  concerns.push(...validateVisibleHiddenBoundary(output, {
    visiblePaths: ['visible_npcs', 'npcs', 'actors']
  }));
  return concerns;
}

function validateItemPlacementOutput(output) {
  const concerns = validatePositionReferenceConsistency(output, {
    visibleItemPaths: ['visible_items', 'inventory_links', 'property_links']
  });
  concerns.push(...validateVisibleHiddenBoundary(output, {
    visiblePaths: ['visible_items', 'inventory_links', 'property_links']
  }));
  return concerns;
}

function requireApprovedTimeLightAudit({ context }) {
  const audit = context.getStageOutput(17);
  if (audit?.pass === true
    && audit?.commit_permission?.can_continue_to_visible_context === true
    && audit?.commit_permission?.can_continue_to_narrator === false) {
    return { pass: true, evidence: 'approved time_light_consistency_audit present' };
  }
  return { pass: false, dependency: 'time_light_consistency_audit', field: 'root.time_light_consistency_audit.commit_permission', message: 'Stage 17 must pass and allow visible context before downstream stages can start.' };
}

function requireApprovedKnowledgeMapAudit({ context }) {
  const audit = context.getStageOutput(1802);
  if (audit?.pass === true
    && audit?.commit_permission?.can_continue_to_hidden_state === true
    && context.getStageOutput(18)?.schema === STAGE18_OUTPUT_SCHEMA) {
    return { pass: true, evidence: 'approved character_knowledge_map_audit present' };
  }
  return { pass: false, dependency: 'character_knowledge_map_audit', field: 'root.character_knowledge_map_audit.commit_permission.can_continue_to_hidden_state', message: 'Stage 18 must pass its independent audit before Stage 19 can start.' };
}

function requireApprovedTemporalVisibleContext({ context }) {
  const bundle = context.getStageOutput(20);
  const visible = bundle?.visible_context_package;
  if (bundle?.schema === STAGE20_RESULT_SCHEMA
    && bundle?.visible_context_code_precheck?.pass === true
    && visible?.schema === STAGE20_OUTPUT_SCHEMA
    && bundle?.visible_context_package_digest === computeVisibleContextPackageDigest(visible)
    && visible?.frame?.clock) {
    return { pass: true, evidence: 'approved Stage 20 visible-context candidate present' };
  }
  return { pass: false, dependency: 'stage20_visible_context_result', field: 'root.visible_context_package.frame', message: 'Stage 20 must produce a prechecked visible_context_package before narrator prose.' };
}

function requireApprovedVisibleContextAudit({ context }) {
  const result = context.getStageOutput(21);
  const audit = result?.visible_context_audit;
  const stage20 = context.getStageOutput(20);
  const digest = stage20?.visible_context_package_digest;
  if (result?.schema === STAGE21_RESULT_SCHEMA
    && result?.pass === true
    && result?.audit_code_precheck?.pass === true
    && audit?.schema === STAGE21_OUTPUT_SCHEMA
    && audit?.pass === true
    && audit?.repair_route === null
    && result?.visible_context_package_digest === digest
    && audit?.visible_context_package_digest === digest
    && result?.commit_permission?.can_send_to_narrator === true
    && result?.commit_permission?.can_write_visible_context_snapshot === true
    && result?.commit_permission?.can_generate_player_facing_prose === true) {
    return { pass: true, evidence: 'approved Stage 21 result bundle and matching package digest present' };
  }
  return { pass: false, dependency: 'stage21_visible_context_audit_result', field: 'root.stage21_visible_context_audit_result.commit_permission.can_send_to_narrator', message: 'Stage 21 must independently approve the exact Stage 20 package before narrator prose.' };
}

export function buildStage20VisibleContextInputFromContext(context, options = {}) {
  const historicalFrame = context.requireStageOutput(3, 'historical frame');
  const selectedStartNode = context.requireStageOutput(9, 'selected start node');
  const g5SceneGraph = context.requireStageOutput(13, 'g5 scene graph');
  const timeLightAudit = context.requireStageOutput(17, 'time/light consistency audit');
  const hiddenBundle = context.requireStageOutput(19, 'Stage 19 hidden-state result bundle');
  if (hiddenBundle?.schema !== STAGE19_RESULT_SCHEMA || hiddenBundle?.commit_permission?.can_continue_to_visible_context !== true) throw new Error('Stage 20 requires an approved Stage 19 result bundle.');
  return buildStage20IsolatedInput({
    request_id: context.requestId,
    historical_frame: historicalFrame,
    weather_state: options.weatherState ?? options.weather_state ?? context.getFrozenArtifactBySchema('weather_state')?.artifact ?? timeLightAudit?.authoritative_frame?.weather_state ?? null,
    selected_start_node: selectedStartNode,
    player_character: context.requireStageOutput(11, 'player character'),
    current_position: buildPreCommitCurrentPosition(g5SceneGraph),
    g5_scene_graph: g5SceneGraph,
    g5_scene_audit: context.requireStageOutput(14, 'G5 scene audit'),
    initial_npc_placement: context.requireStageOutput(15, 'initial NPC placement'),
    npc_placement_audit: context.requireStageOutput(1502, 'initial NPC placement audit'),
    initial_item_placement: context.requireStageOutput(16, 'initial item placement'),
    item_placement_audit: context.requireStageOutput(1602, 'initial item placement audit'),
    time_light_consistency_audit: timeLightAudit,
    character_knowledge_map: context.requireStageOutput(18, 'character knowledge map'),
    character_knowledge_map_audit: context.requireStageOutput(1802, 'character knowledge map audit'),
    full_hidden_scene_state: hiddenBundle.full_hidden_scene_state,
    full_hidden_state_audit: hiddenBundle.full_hidden_state_audit,
    visible_context_policy: options.visibleContextPolicy ?? options.visible_context_policy ?? options.policies?.visible_context_policy ?? options.policies?.visible_context ?? {}
  });
}

export function commitStage20Artifacts(context, result, input) {
  const actualDigest = computeVisibleContextPackageDigest(result?.visible_context_package);
  const pass = result?.schema === STAGE20_RESULT_SCHEMA
    && result?.pass === true
    && result?.visible_context_package?.schema === STAGE20_OUTPUT_SCHEMA
    && result?.visible_context_package_digest === actualDigest
    && result?.visibility_filter?.schema === STAGE20_VISIBILITY_FILTER_SCHEMA
    && result?.visible_context_code_precheck?.schema === STAGE20_PRECHECK_SCHEMA
    && result?.visible_context_code_precheck?.pass === true
    && result?.commit_permission?.can_continue_to_visible_context_audit === true
    && result?.commit_permission?.can_send_to_narrator === false;
  const concerns = pass ? [] : [
    ...(result?.visible_context_code_precheck?.concerns ?? []),
    ...((result?.commit_permission?.reasons ?? []).map((reason) => ({ code: 'VISIBLE_CONTEXT_COMMIT_DENIED', message: reason, field: 'commit_permission' })))
  ];
  const gate = createGateResult({ stageId: 20, stageSlug: 'visible_context', gateKind: 'visible_context_candidate_gate', pass, concerns, evidence: result?.visible_context_code_precheck?.evidence ?? [] });
  context.setGateResult(20, gate);
  assertGatePassed(gate);
  context.setStageOutput(20, result);
  context.setStageOutput(2001, result.visibility_filter);
  context.setStageOutput(2002, result.visible_context_code_precheck);
  context.setStageOutput(2003, result.visible_context_package);
  context.setStageOutput(2004, {
    version: 1,
    schema: 'visible_context_package_digest',
    request_id: result.request_id,
    digest: result.visible_context_package_digest
  });
  context.setLifecycleState(20, {
    stage_id: 20,
    stage_slug: 'visible_context',
    stage_type: 'isolated_semantic_generation',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result.visible_context_package),
    structural_validation: structuredClone(result.visible_context_code_precheck),
    visibility_filter: structuredClone(result.visibility_filter),
    repair_history: structuredClone(result.repair_history ?? []),
    diagnostics: structuredClone(result.diagnostics ?? {}),
    post_dependency_gate: gate,
    terminal_status: 'passed',
    failed_gate: null,
    final_blocked_reason: null
  });
  for (const [stageId, slug, artifact] of [
    [20, 'visible_context_result', result],
    [2001, 'visible_context_visibility_filter', result.visibility_filter],
    [2002, 'visible_context_code_precheck', result.visible_context_code_precheck],
    [2003, 'visible_context_package_candidate', result.visible_context_package],
    [2004, 'visible_context_package_digest', { version: 1, schema: 'visible_context_package_digest', request_id: result.request_id, digest: result.visible_context_package_digest }]
  ]) context.freezeArtifact(createFrozenArtifactRecord({ artifact, stageId, stageSlug: slug, schema: artifact.schema, version: artifact.version ?? 1, producedBy: 'stage20_isolated_block', validationStatus: 'passed', auditStatus: 'not_required', dependencyStatus: 'passed' }));
  context.note?.(20, { label: 'visible_context', message: 'visible context candidate ready for Stage 21 audit', responseRaw: { gate, repair_history: result.repair_history ?? [] } });
}

export function buildStage21VisibleContextAuditInput(context) {
  const stage20 = context.requireStageOutput(20, 'Stage 20 visible-context result');
  if (stage20?.schema !== STAGE20_RESULT_SCHEMA
    || stage20?.commit_permission?.can_continue_to_visible_context_audit !== true
    || stage20?.visible_context_code_precheck?.pass !== true
    || !stage20?.visible_context_package_digest) {
    throw new Error('Stage 21 requires an approved Stage 20 result bundle with package digest.');
  }
  return buildStage21IsolatedInput({
    request_id: context.requestId,
    historical_frame: stage20.input_snapshot?.historical_frame ?? null,
    weather_state: stage20.input_snapshot?.weather_state ?? null,
    current_position: stage20.input_snapshot?.current_position ?? null,
    g5_scene_graph: stage20.input_snapshot?.g5_scene_graph ?? null,
    g5_scene_audit: stage20.input_snapshot?.g5_scene_audit ?? null,
    initial_npc_placement: stage20.input_snapshot?.initial_npc_placement ?? null,
    npc_placement_audit: stage20.input_snapshot?.npc_placement_audit ?? null,
    initial_item_placement: stage20.input_snapshot?.initial_item_placement ?? null,
    item_placement_audit: stage20.input_snapshot?.item_placement_audit ?? null,
    time_light_consistency_audit: stage20.input_snapshot?.time_light_consistency_audit ?? null,
    character_knowledge_map: stage20.input_snapshot?.character_knowledge_map ?? null,
    character_knowledge_map_audit: stage20.input_snapshot?.character_knowledge_map_audit ?? null,
    full_hidden_scene_state: stage20.input_snapshot?.full_hidden_scene_state ?? null,
    full_hidden_state_audit: stage20.input_snapshot?.full_hidden_state_audit ?? null,
    visible_context_package: stage20.visible_context_package,
    visible_context_package_digest: stage20.visible_context_package_digest,
    visible_context_code_precheck: stage20.visible_context_code_precheck,
    visible_context_audit_policy: {}
  });
}

export function commitStage21Artifacts(context, result, input) {
  const audit = result?.visible_context_audit;
  const pass = result?.schema === STAGE21_RESULT_SCHEMA
    && result?.pass === true
    && result?.audit_code_precheck?.schema === STAGE21_PRECHECK_SCHEMA
    && result?.audit_code_precheck?.pass === true
    && audit?.schema === STAGE21_OUTPUT_SCHEMA
    && audit?.pass === true
    && result?.visible_context_package_digest === input?.visible_context_package_digest
    && audit?.visible_context_package_digest === input?.visible_context_package_digest
    && result?.commit_permission?.can_send_to_narrator === true
    && result?.commit_permission?.can_write_visible_context_snapshot === true
    && result?.commit_permission?.can_generate_player_facing_prose === true;
  const concerns = pass
    ? []
    : [
        ...(result?.audit_code_precheck?.concerns ?? []),
        ...(audit?.concerns ?? []),
        ...((result?.repair_route && audit?.pass === false)
          ? [{ code: 'VISIBLE_CONTEXT_AUDIT_REPAIR_REQUIRED', message: 'Stage 21 returned a validated repair route.', field: 'repair_route' }]
          : [])
      ];
  const gate = createGateResult({
    stageId: 21,
    stageSlug: 'visible_context_audit',
    gateKind: 'visible_context_independent_audit_gate',
    pass,
    concerns,
    evidence: [
      ...(result?.audit_code_precheck?.evidence ?? []),
      ...(audit?.evidence ?? [])
    ]
  });
  context.setGateResult(21, gate);
  context.setStageOutput(21, result);
  context.setStageOutput(2101, result?.audit_code_precheck ?? null);
  context.setStageOutput(2102, audit ?? null);
  if (result?.repair_route) context.setStageOutput(2103, result.repair_route);
  context.setLifecycleState(21, {
    stage_id: 21,
    stage_slug: 'visible_context_audit',
    stage_type: 'isolated_llm_audit_block',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result),
    structural_validation: structuredClone(result?.audit_code_precheck ?? null),
    semantic_audit_report: structuredClone(audit ?? null),
    recovery_route: structuredClone(result?.repair_route ?? null),
    repair_history: structuredClone(result?.audit_history ?? []),
    post_dependency_gate: gate,
    terminal_status: pass ? 'passed' : 'repair_required',
    failed_gate: pass ? null : gate.gate_kind,
    final_blocked_reason: pass ? null : concerns.map((item) => item.message ?? item.code).join('; ')
  });
  if (pass) {
    for (const [stageId, stageSlug, artifact, auditStatus] of [
      [21, 'visible_context_audit_result', result, 'passed'],
      [2101, 'visible_context_audit_code_precheck', result.audit_code_precheck, 'not_required'],
      [2102, 'visible_context_audit', audit, 'passed']
    ]) {
      context.freezeArtifact(createFrozenArtifactRecord({
        artifact,
        stageId,
        stageSlug,
        schema: artifact.schema,
        version: artifact.version ?? 1,
        producedBy: 'stage21_isolated_block',
        validationStatus: 'passed',
        auditStatus,
        dependencyStatus: 'passed'
      }));
    }
  }
  context.note?.(21, {
    label: 'visible_context_audit',
    message: pass ? 'visible context approved for narrator' : 'visible context repair required',
    responseRaw: { gate, repair_route: result?.repair_route ?? null, audit_history: result?.audit_history ?? [] }
  });
  return result;
}

export function commitStage22Artifacts(context, result, input) {
  const prose = result?.narrator_starting_prose;
  const validationConcerns = validateNarratorStartingProseOutput(
    prose,
    input,
    result?.narrator_start_code_precheck
  );
  const pass = result?.schema === STAGE22_RESULT_SCHEMA
    && result?.pass === true
    && result?.visible_context_package_digest === input?.visible_context_package_digest
    && result?.narrator_start_code_precheck?.schema === STAGE22_PRECHECK_SCHEMA
    && result?.narrator_start_code_precheck?.pass === true
    && prose?.schema === STAGE22_OUTPUT_SCHEMA
    && prose?.prose_status === 'drafted'
    && result?.handoff_permission?.can_send_to_prose_audit === true
    && validationConcerns.length === 0;
  const concerns = [
    ...(result?.narrator_start_code_precheck?.concerns ?? []),
    ...validationConcerns,
    ...(!pass && validationConcerns.length === 0 ? [{ code: 'NARRATOR_PROSE_HANDOFF_DENIED', message: 'Stage 22 result does not permit handoff to Stage 23.', field: 'handoff_permission' }] : [])
  ];
  const gate = createGateResult({
    stageId: 22,
    stageSlug: 'narrator_prose',
    gateKind: 'narrator_start_isolated_gate',
    pass,
    concerns,
    evidence: result?.narrator_start_code_precheck?.evidence ?? []
  });
  context.setGateResult(22, gate);
  context.setStageOutput(22, result);
  context.setStageOutput(2201, result?.narrator_start_code_precheck ?? null);
  context.setStageOutput(2202, prose ?? null);
  context.setLifecycleState(22, {
    stage_id: 22,
    stage_slug: 'narrator_prose',
    stage_type: 'isolated_llm_block',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result),
    structural_validation: structuredClone(result?.narrator_start_code_precheck ?? null),
    repair_history: structuredClone(result?.generation_history ?? []),
    post_dependency_gate: gate,
    terminal_status: pass ? 'passed' : 'stage_failed',
    failed_gate: pass ? null : gate.gate_kind,
    final_blocked_reason: pass ? null : concerns.map((item) => item.message ?? item.code).join('; ')
  });
  if (pass) {
    for (const [stageId, stageSlug, artifact] of [
      [22, 'stage22_narrator_prose_result', result],
      [2201, 'narrator_start_code_precheck', result.narrator_start_code_precheck],
      [2202, 'narrator_starting_prose_draft', prose]
    ]) context.freezeArtifact(createFrozenArtifactRecord({
      artifact,
      stageId,
      stageSlug,
      schema: artifact.schema,
      version: artifact.version ?? 1,
      producedBy: 'stage22_isolated_block',
      validationStatus: 'passed',
      auditStatus: 'not_required',
      dependencyStatus: 'passed'
    }));
  }
  context.note?.(22, {
    label: 'narrator_prose',
    message: pass ? 'narrator prose draft ready for Stage 23 audit' : 'narrator prose draft blocked',
    responseRaw: { gate, generation_history: result?.generation_history ?? [] }
  });
  if (!pass) {
    const error = new Error('Stage 22 narrator prose result failed the isolated handoff gate.');
    error.name = 'Stage22NarratorProseCommitError';
    error.lifecycle = { stage_id: 22, stage_slug: 'narrator_prose', stage_type: 'isolated_llm_block', failed_gate: gate.gate_kind, concerns, terminal: true };
    throw error;
  }
  return result;
}

export function buildStage22NarratorInputFromContext(context, options = {}) {
  const stage20 = context.requireStageOutput(20, 'Stage 20 visible-context result');
  const stage21 = context.requireStageOutput(21, 'Stage 21 visible-context audit result');
  const audit = stage21?.visible_context_audit;
  const actualDigest = computeVisibleContextPackageDigest(stage20?.visible_context_package);
  if (stage20?.schema !== STAGE20_RESULT_SCHEMA
    || stage21?.schema !== STAGE21_RESULT_SCHEMA
    || stage21?.pass !== true
    || stage21?.audit_code_precheck?.pass !== true
    || audit?.schema !== STAGE21_OUTPUT_SCHEMA
    || audit?.pass !== true
    || audit?.repair_route !== null
    || stage20?.visible_context_package_digest !== actualDigest
    || stage21?.visible_context_package_digest !== actualDigest
    || audit?.visible_context_package_digest !== actualDigest
    || stage21?.commit_permission?.can_send_to_narrator !== true
    || stage21?.commit_permission?.can_write_visible_context_snapshot !== true
    || stage21?.commit_permission?.can_generate_player_facing_prose !== true) {
    throw new Error('Stage 22 requires the exact Stage 20 package approved by the complete Stage 21 result bundle.');
  }
  return buildStage22IsolatedInput({
    request_id: context.requestId,
    visible_context_package: stage20.visible_context_package,
    visible_context_package_digest: actualDigest,
    visible_context_approval: buildStage21Approval(stage21),
    narrator_policy: options.narratorPolicy ?? options.narrator_policy ?? options.policies?.narrator_policy ?? options.policies?.narrator ?? {}
  });
}

export function buildStage23NarratorProseAuditInput(context, options = {}) {
  const stage20 = context.requireStageOutput(20, 'Stage 20 visible-context result');
  const stage21 = context.requireStageOutput(21, 'Stage 21 visible-context audit result');
  const stage22 = context.requireStageOutput(22, 'Stage 22 narrator prose result');
  const packageDigest = computeVisibleContextPackageDigest(stage20?.visible_context_package);
  const proseDigest = computeNarratorStartingProseDigest(stage22?.narrator_starting_prose);
  const audit = stage21?.visible_context_audit;
  if (stage21?.schema !== STAGE21_RESULT_SCHEMA
    || stage21?.pass !== true
    || stage21?.audit_code_precheck?.pass !== true
    || audit?.schema !== STAGE21_OUTPUT_SCHEMA
    || audit?.pass !== true
    || audit?.repair_route !== null
    || stage22?.schema !== STAGE22_RESULT_SCHEMA
    || stage22?.pass !== true
    || stage22?.narrator_start_code_precheck?.schema !== STAGE22_PRECHECK_SCHEMA
    || stage22?.narrator_start_code_precheck?.pass !== true
    || stage22?.narrator_starting_prose?.schema !== STAGE22_OUTPUT_SCHEMA
    || stage22?.handoff_permission?.can_send_to_prose_audit !== true
    || stage20?.visible_context_package_digest !== packageDigest
    || stage21?.visible_context_package_digest !== packageDigest
    || audit?.visible_context_package_digest !== packageDigest
    || stage22?.visible_context_package_digest !== packageDigest
    || stage21?.commit_permission?.can_send_to_narrator !== true
    || stage21?.commit_permission?.can_write_visible_context_snapshot !== true
    || stage21?.commit_permission?.can_generate_player_facing_prose !== true) {
    throw new Error('Stage 23 requires the exact approved Stage 20 package, complete Stage 21 approval, and current Stage 22 draft.');
  }
  return buildStage23IsolatedInput({
    request_id: context.requestId,
    visible_context_package: stage20.visible_context_package,
    visible_context_package_digest: packageDigest,
    visible_context_approval: buildStage21Approval(stage21),
    narrator_starting_prose: stage22.narrator_starting_prose,
    narrator_starting_prose_digest: proseDigest,
    audit_policy: options.auditPolicy ?? options.audit_policy ?? options.policies?.narrator_prose_audit ?? {}
  });
}

export function commitStage23Artifacts(context, result, input) {
  const audit = result?.narrator_prose_audit;
  const validationConcerns = validateNarratorProseAudit(audit, input);
  const structurallyValid = result?.schema === STAGE23_RESULT_SCHEMA
    && result?.request_id === input?.request_id
    && result?.visible_context_package_digest === input?.visible_context_package_digest
    && result?.narrator_starting_prose_digest === input?.narrator_starting_prose_digest
    && result?.narrator_prose_code_precheck?.schema === STAGE23_PRECHECK_SCHEMA
    && result?.narrator_prose_code_precheck?.pass === true
    && audit?.schema === STAGE23_AUDIT_SCHEMA
    && validationConcerns.length === 0;
  const pass = structurallyValid
    && result?.pass === true
    && audit?.pass === true
    && result?.repair_route == null
    && result?.commit_permission?.can_show_to_player === true
    && result?.commit_permission?.can_write_player_visible_message === true
    && result?.commit_permission?.can_mark_opening_scene_presented === true;
  const concerns = [
    ...(result?.narrator_prose_code_precheck?.concerns ?? []),
    ...validationConcerns,
    ...(audit?.concerns ?? []),
    ...(!structurallyValid && validationConcerns.length === 0 ? [{ code: 'STAGE23_RESULT_INVALID', message: 'Stage 23 result bundle is structurally invalid.', field: 'root' }] : [])
  ];
  const gate = createGateResult({
    stageId: 23,
    stageSlug: 'narrator_prose_audit',
    gateKind: 'narrator_prose_independent_audit_gate',
    pass,
    concerns,
    evidence: [...(result?.narrator_prose_code_precheck?.evidence ?? []), ...(audit?.evidence ?? [])]
  });
  context.setGateResult(23, gate);
  context.setStageOutput(23, result);
  context.setStageOutput(2301, result?.narrator_prose_code_precheck ?? null);
  context.setStageOutput(2302, audit ?? null);
  if (result?.repair_route) context.setStageOutput(2303, result.repair_route);
  context.setLifecycleState(23, {
    stage_id: 23,
    stage_slug: 'narrator_prose_audit',
    stage_type: 'isolated_llm_block',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result),
    structural_validation: structuredClone(result?.narrator_prose_code_precheck ?? null),
    semantic_audit_report: structuredClone(audit ?? null),
    recovery_route: structuredClone(result?.repair_route ?? null),
    repair_history: structuredClone(result?.audit_history ?? []),
    post_dependency_gate: gate,
    terminal_status: pass ? 'passed' : (structurallyValid ? 'repair_required' : 'stage_failed'),
    failed_gate: pass ? null : gate.gate_kind,
    final_blocked_reason: pass ? null : concerns.map((item) => item.message ?? item.code).join('; ')
  });
  if (pass) {
    for (const [stageId, stageSlug, artifact, auditStatus] of [
      [23, 'stage23_narrator_prose_audit_result', result, 'passed'],
      [2301, 'narrator_prose_code_precheck', result.narrator_prose_code_precheck, 'not_required'],
      [2302, 'narrator_prose_audit', audit, 'passed']
    ]) context.freezeArtifact(createFrozenArtifactRecord({
      artifact, stageId, stageSlug, schema: artifact.schema, version: artifact.version ?? 1,
      producedBy: 'stage23_isolated_block', validationStatus: 'passed', auditStatus, dependencyStatus: 'passed'
    }));
  }
  context.note?.(23, {
    label: 'narrator_prose_audit',
    message: pass ? 'narrator prose approved for player output' : 'narrator prose repair required',
    responseRaw: { gate, repair_route: result?.repair_route ?? null, audit_history: result?.audit_history ?? [] }
  });
  return result;
}

function buildPreCommitCurrentPosition(g5SceneGraph) {
  const start = g5SceneGraph?.player_start_position ?? {};
  const parent = g5SceneGraph?.parent_location ?? {};
  return {
    region_id: start.region_id ?? parent.region_id ?? null,
    place_id: start.place_id ?? parent.place_id ?? null,
    location_id: start.location_id ?? start.g4_node_id ?? parent.location_id ?? parent.g4_node_id ?? null,
    g1_node_id: start.g1_node_id ?? parent.g1_node_id ?? null,
    g2_node_id: start.g2_node_id ?? parent.g2_node_id ?? null,
    g3_node_id: start.g3_node_id ?? parent.g3_node_id ?? null,
    g4_node_id: start.g4_node_id ?? start.location_id ?? parent.g4_node_id ?? parent.location_id ?? null,
    minilocation_id: start.minilocation_id ?? start.g5_minilocation_id ?? null,
    anchor_id: start.anchor_id ?? start.g5_anchor_id ?? null,
    last_route_id: null
  };
}
