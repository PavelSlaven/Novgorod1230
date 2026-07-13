import { createGateResult } from '../gate.js';

export const STAGE9_INPUT_SCHEMA = 'start_node_selector_input';
export const STAGE9_OUTPUT_SCHEMA = 'selected_start_node';

export const DEFAULT_STAGE9_SELECTION_POLICY = Object.freeze({
  prefer_g4: true,
  allow_g3_fallback: true,
  allow_g2_fallback: false,
  allow_g1_fallback: false,
  require_candidate_place_template_link: true,
  require_npc_candidate_support: false,
  require_item_profile_support: false,
  prefer_player_request_match: true,
  prefer_low_contradiction_risk: true,
  prefer_g5_ready: true,
  prefer_full_parent_chain: true,
  require_sources: true,
  do_not_create_world_entities: true,
  max_selector_attempts: 3
});

const HARD_INVALID_SELECTION_CODES = new Set([
  'STAGE9_SELECTED_CANDIDATE_NOT_ALLOWED',
  'STAGE9_SELECTED_TEMPLATE_LINK_NOT_ALLOWED',
  'STAGE9_SELECTED_TEMPLATE_LINK_CANDIDATE_MISMATCH',
  'STAGE9_SELECTED_NODE_ID_NOT_FROM_SELECTED_CANDIDATE',
  'STAGE9_SELECTED_PLACE_TEMPLATE_ID_MISMATCH',
  'STAGE9_G1_FALLBACK_FORBIDDEN',
  'STAGE9_G2_FALLBACK_FORBIDDEN',
  'STAGE9_G3_SELECTED_WHEN_VALID_G4_EXISTS',
  'STAGE9_NON_G5_READY_SELECTED_WHEN_G5_READY_EXISTS',
  'STAGE9_FORBIDDEN_WORLD_ENTITY_CREATION'
]);

const FORBIDDEN_KEYS = new Set([
  'new_place', 'generated_place_name', 'created_location', 'location_description',
  'g5_anchor', 'g5_anchor_id', 'minilocation_id', 'anchor_id',
  'npc', 'npcs', 'npc_id', 'npc_name', 'character', 'characters',
  'item', 'items', 'item_id', 'container_contents', 'inventory', 'equipment',
  'visible_scene', 'intro_prose', 'start_prose', 'narrator_prose',
  'quest', 'start_quest', 'hidden_event', 'secret', 'route', 'arrival_route',
  'weather_event', 'current_action', 'owner', 'owner_id'
]);

export function normalizeStage9SelectionPolicy(policy = {}) {
  return {
    ...DEFAULT_STAGE9_SELECTION_POLICY,
    ...(policy && typeof policy === 'object' ? policy : {}),
    do_not_create_world_entities: policy?.do_not_create_world_entities === false ? false : true,
    max_selector_attempts: Math.max(1, Number(policy?.max_selector_attempts ?? DEFAULT_STAGE9_SELECTION_POLICY.max_selector_attempts) || 3)
  };
}

export function buildStage9StartNodeSelectorInputFromPipeline(context, options = {}) {
  return {
    version: 1,
    schema: STAGE9_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? context.requireStageOutput?.(2, 'normalized request') ?? context.getStageOutput?.(2) ?? null,
    historical_frame: options.historical_frame ?? context.requireStageOutput?.(3, 'historical frame') ?? context.getStageOutput?.(3) ?? null,
    regional_context_package: options.regional_context_package ?? context.requireStageOutput?.(4, 'regional context package') ?? context.getStageOutput?.(4) ?? null,
    start_candidate_set: options.start_candidate_set ?? context.requireStageOutput?.(5, 'start candidate set') ?? context.getStageOutput?.(5) ?? null,
    candidate_place_template_set: options.candidate_place_template_set ?? context.requireStageOutput?.(6, 'candidate place template set') ?? context.getStageOutput?.(6) ?? null,
    npc_candidate_set: options.npc_candidate_set ?? context.requireStageOutput?.(7, 'npc candidate set') ?? context.getStageOutput?.(7) ?? null,
    item_profile_candidate_set: options.item_profile_candidate_set ?? context.requireStageOutput?.(8, 'item profile candidate set') ?? context.getStageOutput?.(8) ?? null,
    selection_policy: normalizeStage9SelectionPolicy(options.selection_policy ?? options.selectionPolicy ?? {})
  };
}

export function validateStage9StartNodeSelectorInput(input) {
  const concerns = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    concerns.push(concern('STAGE9_INPUT_NOT_OBJECT', 'Stage 9 input must be an object.'));
  }
  if (input?.version !== 1) concerns.push(concern('STAGE9_INPUT_VERSION_INVALID', 'Stage 9 input.version must be 1.', { field: 'version' }));
  if (input?.schema !== STAGE9_INPUT_SCHEMA) concerns.push(concern('STAGE9_INPUT_SCHEMA_MISMATCH', 'Stage 9 input.schema must be start_node_selector_input.', { field: 'schema' }));
  if (!nonEmpty(input?.request_id)) concerns.push(concern('STAGE9_INPUT_MISSING_REQUEST_ID', 'Stage 9 input.request_id is required.', { field: 'request_id' }));
  requireSchema(concerns, input?.normalized_request, 'new_game_normalized_request', 'normalized_request', 'STAGE9_INPUT_INVALID_NORMALIZED_REQUEST');
  requireHistoricalFrame(concerns, input?.historical_frame);
  requireSchema(concerns, input?.regional_context_package, 'regional_context_package', 'regional_context_package', 'STAGE9_INPUT_INVALID_REGIONAL_CONTEXT_PACKAGE');
  requireReadySet(concerns, input?.start_candidate_set, 'start_candidate_set', 'candidates', 'downstream_constraints.must_choose_from_candidate_ids', 'STAGE9_INPUT_INVALID_START_CANDIDATE_SET', 'STAGE9_INPUT_START_CANDIDATE_SET_NOT_READY');
  requireReadySet(concerns, input?.candidate_place_template_set, 'candidate_place_template_set', 'candidate_template_links', 'downstream_constraints.must_choose_candidate_template_link_id', 'STAGE9_INPUT_INVALID_CANDIDATE_PLACE_TEMPLATE_SET', 'STAGE9_INPUT_CANDIDATE_PLACE_TEMPLATE_SET_NOT_READY');
  requireReadySet(concerns, input?.npc_candidate_set, 'npc_candidate_set', 'npc_candidates', null, 'STAGE9_INPUT_INVALID_NPC_CANDIDATE_SET', 'STAGE9_INPUT_NPC_CANDIDATE_SET_NOT_READY');
  requireReadySet(concerns, input?.item_profile_candidate_set, 'item_profile_candidate_set', 'item_profile_candidates', null, 'STAGE9_INPUT_INVALID_ITEM_PROFILE_CANDIDATE_SET', 'STAGE9_INPUT_ITEM_PROFILE_CANDIDATE_SET_NOT_READY');
  validateSelectionPolicy(concerns, input?.selection_policy);
  return {
    pass: concerns.length === 0,
    concerns,
    evidence: [{ kind: 'stage9_input_contract', schema: STAGE9_INPUT_SCHEMA }]
  };
}

export async function runStage9StartNodeSelector(input, deps = {}) {
  const normalizedInput = {
    ...(input ?? {}),
    selection_policy: normalizeStage9SelectionPolicy(input?.selection_policy ?? {})
  };
  const inputGate = validateStage9StartNodeSelectorInput(normalizedInput);
  if (!inputGate.pass) {
    const gate = createStage9Gate(null, normalizedInput, inputGate);
    return buildStage9ManagedPipelineResult({ input: normalizedInput, output: null, gate, repairType: 'invalid_start_node_selector_input' });
  }

  const executor = deps.executor ?? deps.llmStageExecutor ?? null;
  if (typeof executor !== 'function') {
    const gate = createStage9Gate(null, normalizedInput, {
      pass: false,
      concerns: [concern('STAGE9_EXECUTOR_MISSING', 'Stage 9 requires an explicit LLM executor.')],
      evidence: [{ kind: 'stage9_executor_gate' }]
    });
    return buildStage9ManagedPipelineResult({ input: normalizedInput, output: null, gate, repairType: 'start_node_selection_format_repair' });
  }

  const maxAttempts = Math.max(1, Number(normalizedInput.selection_policy.max_selector_attempts ?? 3) || 3);
  let lastOutput = null;
  let lastGate = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const stage = buildStageMeta(attempt, maxAttempts);
    const raw = await executor({ input: normalizedInput, stage });
    const output = normalizeExecutorOutput(raw);
    lastOutput = output;
    const gate = await validateSelectedStartNode(output, normalizedInput, { ...deps, attempt_index: attempt });
    lastGate = gate;
    if (gate.pass === true && output?.selection_status === 'selected') {
      return {
        stage_id: 9,
        stage_slug: 'start_node_selection',
        schema: 'stage_result',
        status: 'ready',
        output,
        gate,
        repair_request: null,
        attempts_used: attempt
      };
    }
  }

  const hardInvalid = (lastGate?.concerns ?? []).some((item) => HARD_INVALID_SELECTION_CODES.has(item.code));
  return buildStage9ManagedPipelineResult({
    input: normalizedInput,
    output: lastOutput,
    gate: lastGate ?? createStage9Gate(lastOutput, normalizedInput, {
      pass: false,
      concerns: [concern('STAGE9_SELECTION_FAILED', 'Stage 9 selection failed.')],
      evidence: []
    }),
    repairType: hardInvalid ? 'invalid_start_node_selection' : 'start_node_selection_format_repair',
    status: hardInvalid ? 'blocked' : 'requires_repair',
    technicalRetryExhausted: true
  });
}

export async function runStage9StartNodeSelection(context, input = null, deps = {}) {
  const stageInput = input?.schema === STAGE9_INPUT_SCHEMA
    ? input
    : buildStage9StartNodeSelectorInputFromPipeline(context, {
        ...(input ?? {}),
        selection_policy: input?.selection_policy ?? deps.selection_policy ?? deps.selectionPolicy ?? {}
      });
  const result = await runStage9StartNodeSelector(stageInput, deps);
  context.setGateResult?.(9, result.gate);
  if (result.output) context.setStageOutput?.(9, result.output);
  context.setStageResult?.(9, result);
  context.note?.(9, {
    label: 'start_node_selection',
    message: result.status === 'ready' ? 'start_node_selection ready' : `start_node_selection ${result.status}`,
    responseRaw: { gate: result.gate, repair_request: result.repair_request }
  });
  return result.status === 'ready' ? result.output : result;
}

export async function validateSelectedStartNode(output, input = {}, deps = {}) {
  const concerns = [];
  const evidence = [{ kind: 'stage9_selected_start_node_gate', schema: STAGE9_OUTPUT_SCHEMA }];

  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    concerns.push(concern('STAGE9_OUTPUT_NOT_OBJECT', 'Stage 9 output must be an object.'));
    return createStage9Gate(output, input, { pass: false, concerns, evidence });
  }
  if (output.selected_candidate_id !== undefined || output.selected_candidate_place_template_link_id !== undefined) {
    concerns.push(concern('STAGE9_LEGACY_FLAT_OUTPUT_FORBIDDEN', 'Stage 9 output must use selected.selected_candidate_id and selected.selected_candidate_place_template_link_id.'));
  }
  if (output.version !== 1) concerns.push(concern('STAGE9_OUTPUT_VERSION_INVALID', 'selected_start_node.version must be 1.', { field: 'version' }));
  if (output.schema !== STAGE9_OUTPUT_SCHEMA) concerns.push(concern('STAGE9_OUTPUT_SCHEMA_MISMATCH', 'selected_start_node.schema is required.', { field: 'schema' }));
  if (output.request_id !== input.request_id) concerns.push(concern('STAGE9_REQUEST_ID_MISMATCH', 'selected_start_node.request_id must match input.request_id.', { field: 'request_id' }));
  if (!['selected', 'blocked', 'requires_repair'].includes(output.selection_status)) concerns.push(concern('STAGE9_SELECTION_STATUS_INVALID', 'selection_status must be selected, blocked, or requires_repair.', { field: 'selection_status' }));

  const forbiddenPaths = findForbiddenPaths(output);
  for (const path of forbiddenPaths) {
    concerns.push(concern('STAGE9_FORBIDDEN_WORLD_ENTITY_CREATION', `Stage 9 output contains forbidden world/entity field: ${path}.`, { field: path }));
  }

  if (output.selection_status !== 'selected') {
    if (!output.audit || typeof output.audit !== 'object') concerns.push(concern('STAGE9_AUDIT_MISSING', 'Non-selected Stage 9 output must include audit.'));
    return createStage9Gate(output, input, { pass: concerns.length === 0 && output.selection_status !== 'requires_repair', concerns, evidence });
  }

  const selected = output.selected;
  if (!selected || typeof selected !== 'object' || Array.isArray(selected)) {
    concerns.push(concern('STAGE9_SELECTED_BLOCK_MISSING', 'selected_start_node.selected is required.', { field: 'selected' }));
    return createStage9Gate(output, input, { pass: false, concerns, evidence });
  }

  const candidateId = selected.selected_candidate_id;
  const linkId = selected.selected_candidate_place_template_link_id;
  const selectedScale = selected.selected_scale_level;
  const selectedNodeId = selected.selected_node_id;
  const selectedPlaceTemplateId = selected.selected_place_template_id;

  if (!nonEmpty(candidateId)) concerns.push(concern('STAGE9_SELECTED_CANDIDATE_ID_MISSING', 'selected.selected_candidate_id is required.', { field: 'selected.selected_candidate_id' }));
  if (!nonEmpty(linkId)) concerns.push(concern('STAGE9_SELECTED_TEMPLATE_LINK_ID_MISSING', 'selected.selected_candidate_place_template_link_id is required.', { field: 'selected.selected_candidate_place_template_link_id' }));
  if (!['G1', 'G2', 'G3', 'G4'].includes(selectedScale)) concerns.push(concern('STAGE9_SELECTED_SCALE_INVALID', 'selected.selected_scale_level must be G1, G2, G3, or G4.', { field: 'selected.selected_scale_level' }));
  if (!nonEmpty(selectedNodeId)) concerns.push(concern('STAGE9_SELECTED_NODE_ID_MISSING', 'selected.selected_node_id is required.', { field: 'selected.selected_node_id' }));
  if (!nonEmpty(selectedPlaceTemplateId)) concerns.push(concern('STAGE9_SELECTED_PLACE_TEMPLATE_ID_MISSING', 'selected.selected_place_template_id is required.', { field: 'selected.selected_place_template_id' }));

  const candidates = input.start_candidate_set?.candidates ?? [];
  const links = input.candidate_place_template_set?.candidate_template_links ?? [];
  const allowedCandidateIds = new Set(readAllowedCandidateIds(input));
  const allowedLinkIds = new Set(readAllowedTemplateLinkIds(input));
  const candidate = candidates.find((item) => candidateIdOf(item) === candidateId);
  const link = links.find((item) => linkIdOf(item) === linkId);

  if (!allowedCandidateIds.has(candidateId)) concerns.push(concern('STAGE9_SELECTED_CANDIDATE_NOT_ALLOWED', 'selected candidate must be from start_candidate_set downstream allowed IDs.', { selected_candidate_id: candidateId }));
  if (!allowedLinkIds.has(linkId)) concerns.push(concern('STAGE9_SELECTED_TEMPLATE_LINK_NOT_ALLOWED', 'selected template link must be from candidate_place_template_set downstream allowed link IDs.', { selected_candidate_place_template_link_id: linkId }));
  if (!candidate) concerns.push(concern('STAGE9_SELECTED_CANDIDATE_NOT_FOUND', 'selected candidate is not present in start_candidate_set.candidates.', { selected_candidate_id: candidateId }));
  if (!link) concerns.push(concern('STAGE9_SELECTED_TEMPLATE_LINK_NOT_FOUND', 'selected place template link is not present in candidate_place_template_set.candidate_template_links.', { selected_candidate_place_template_link_id: linkId }));
  if (link && candidateIdOfLink(link) !== candidateId) concerns.push(concern('STAGE9_SELECTED_TEMPLATE_LINK_CANDIDATE_MISMATCH', 'selected candidate_place_template_link_id must belong to selected_candidate_id.', { selected_candidate_id: candidateId, link_candidate_id: candidateIdOfLink(link) }));
  if (link && selectedPlaceTemplateId !== placeTemplateIdOfLink(link)) concerns.push(concern('STAGE9_SELECTED_PLACE_TEMPLATE_ID_MISMATCH', 'selected.selected_place_template_id must match selected link place_template_id.', { selected_place_template_id: selectedPlaceTemplateId, link_place_template_id: placeTemplateIdOfLink(link) }));
  if (candidate) {
    const knownNodeIds = knownCandidateNodeIds(candidate);
    if (!knownNodeIds.has(selectedNodeId)) concerns.push(concern('STAGE9_SELECTED_NODE_ID_NOT_FROM_SELECTED_CANDIDATE', 'selected.selected_node_id must match a read-only node id from the selected candidate.', { selected_node_id: selectedNodeId, known_node_ids: [...knownNodeIds] }));
    validateScalePolicy(concerns, selectedScale, candidate, link, input);
    validateNodeChain(concerns, output.selected_node_chain, selectedScale, candidate, link);
  }

  validateNpcItemSupport(concerns, evidence, output, input, selectedPlaceTemplateId, linkId, candidateId);
  if (!output.selection_reasoning || typeof output.selection_reasoning !== 'object') concerns.push(concern('STAGE9_SELECTION_REASONING_MISSING', 'selection_reasoning is required.', { field: 'selection_reasoning' }));
  if (!output.downstream_constraints || typeof output.downstream_constraints !== 'object') concerns.push(concern('STAGE9_DOWNSTREAM_CONSTRAINTS_MISSING', 'downstream_constraints is required.', { field: 'downstream_constraints' }));
  if (!Array.isArray(output.source_trace)) concerns.push(concern('STAGE9_SOURCE_TRACE_MISSING', 'source_trace must be an array.', { field: 'source_trace' }));
  if (!output.audit || typeof output.audit !== 'object') concerns.push(concern('STAGE9_AUDIT_MISSING', 'audit is required.', { field: 'audit' }));
  if (output.audit?.pass !== true) concerns.push(concern('STAGE9_AUDIT_NOT_PASSING', 'audit.pass must be true for a selected start node.', { field: 'audit.pass' }));

  if (input.selection_policy?.require_sources === true) {
    const sourceConcerns = await verifyStage9SourceRecords({ output, candidate, link, deps });
    concerns.push(...sourceConcerns);
  }

  return createStage9Gate(output, input, { pass: concerns.length === 0, concerns, evidence });
}

export function buildStage9ManagedPipelineResult({ input = null, output = null, gate, repairType = 'start_node_selection_format_repair', status = 'requires_repair', technicalRetryExhausted = false } = {}) {
  return {
    schema: 'stage_result',
    stage_id: 9,
    stage_slug: 'start_node_selection',
    status,
    output,
    gate,
    repair_request: {
      repair_type: repairType,
      semantic_repair_allowed: false,
      technical_retry_allowed: true,
      technical_retry_exhausted: Boolean(technicalRetryExhausted),
      llm_allowed: true,
      llm_mode: 'thinking',
      can_create_world_entities: false,
      can_change_candidate_sets: false,
      can_change_world_base: false,
      can_change_historical_frame: false,
      allowed_operation: 'choose_existing_candidate_and_link_only'
    },
    input_summary: {
      request_id: input?.request_id ?? null,
      candidate_count: input?.start_candidate_set?.candidates?.length ?? 0,
      link_count: input?.candidate_place_template_set?.candidate_template_links?.length ?? 0
    }
  };
}

function createStage9Gate(output, input, validation) {
  return createGateResult({
    stageId: 9,
    stageSlug: 'start_node_selection',
    gateKind: 'selected_start_node_gate',
    pass: validation.pass,
    concerns: validation.concerns ?? [],
    evidence: validation.evidence ?? []
  });
}

function buildStageMeta(attemptIndex, maxAttempts) {
  return {
    id: 9,
    slug: 'start_node_selection',
    type: 'semantic_selection',
    output_schema: STAGE9_OUTPUT_SCHEMA,
    input_schema: STAGE9_INPUT_SCHEMA,
    spec_file: '9.txt',
    thinking_required: true,
    attempt_index: attemptIndex,
    max_attempts: maxAttempts,
    semantic_repair_allowed: false,
    prompt_contract: {
      return_schema: STAGE9_OUTPUT_SCHEMA,
      use_nested_selected_block: true,
      choose_only_from_allowed_ids: true,
      forbidden_world_entity_creation: true
    }
  };
}

function normalizeExecutorOutput(raw) {
  const value = raw?.output ?? raw?.parsed_json ?? raw;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return {
        version: 1,
        schema: STAGE9_OUTPUT_SCHEMA,
        selection_status: 'requires_repair',
        raw_response: value,
        audit: {
          pass: false,
          concerns: [{ code: 'STAGE9_INVALID_JSON', message: error.message }],
          evidence: []
        }
      };
    }
  }
  return value;
}

function requireSchema(concerns, value, schema, field, code) {
  if (!value || typeof value !== 'object' || value.schema !== schema) {
    concerns.push(concern(code, `${field}.schema must be ${schema}.`, { field }));
  }
}

function requireHistoricalFrame(concerns, frame) {
  requireSchema(concerns, frame, 'historical_frame', 'historical_frame', 'STAGE9_INPUT_INVALID_HISTORICAL_FRAME');
  if (!frame) return;
  if (!nonEmpty(frame.region?.region_id)) concerns.push(concern('STAGE9_INPUT_HISTORICAL_FRAME_REGION_MISSING', 'historical_frame.region.region_id is required.'));
  if (!Number.isFinite(Number(frame.year?.value))) concerns.push(concern('STAGE9_INPUT_HISTORICAL_FRAME_YEAR_MISSING', 'historical_frame.year.value is required.'));
  if (!nonEmpty(frame.calendar?.season)) concerns.push(concern('STAGE9_INPUT_HISTORICAL_FRAME_SEASON_MISSING', 'historical_frame.calendar.season is required.'));
  for (const field of ['day', 'hour', 'minute', 'time_of_day', 'light_profile']) {
    if (frame.clock?.[field] === undefined || frame.clock?.[field] === null || frame.clock?.[field] === '') concerns.push(concern('STAGE9_INPUT_HISTORICAL_FRAME_CLOCK_MISSING', `historical_frame.clock.${field} is required.`, { field: `historical_frame.clock.${field}` }));
  }
}

function requireReadySet(concerns, value, schema, arrayField, downstreamPath, invalidCode, notReadyCode) {
  if (!value || typeof value !== 'object' || value.schema !== schema) {
    concerns.push(concern(invalidCode, `Expected ${schema}.`, { field: schema }));
    return;
  }
  if (value.selection_status !== 'ready') concerns.push(concern(notReadyCode, `${schema}.selection_status must be ready.`, { field: `${schema}.selection_status` }));
  if (!Array.isArray(value[arrayField])) concerns.push(concern(invalidCode, `${schema}.${arrayField} must be an array.`, { field: `${schema}.${arrayField}` }));
  if (downstreamPath) {
    const downstreamIds = readPath(value, downstreamPath) ?? readPath(value, downstreamPath.replace('must_choose_candidate_template_link_id', 'must_choose_from_candidate_template_link_ids'));
    if (!Array.isArray(downstreamIds) || downstreamIds.length === 0) concerns.push(concern(invalidCode, `${schema}.${downstreamPath} must be a non-empty array.`, { field: `${schema}.${downstreamPath}` }));
  }
}

function validateSelectionPolicy(concerns, policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    concerns.push(concern('STAGE9_INPUT_INVALID_SELECTION_POLICY', 'selection_policy must be an object.'));
    return;
  }
  for (const key of [
    'prefer_g4', 'allow_g3_fallback', 'allow_g2_fallback', 'allow_g1_fallback',
    'require_candidate_place_template_link', 'require_npc_candidate_support', 'require_item_profile_support',
    'prefer_player_request_match', 'prefer_low_contradiction_risk', 'prefer_g5_ready',
    'prefer_full_parent_chain', 'require_sources', 'do_not_create_world_entities'
  ]) {
    if (typeof policy[key] !== 'boolean') concerns.push(concern('STAGE9_INPUT_INVALID_SELECTION_POLICY', `selection_policy.${key} must be boolean.`, { field: `selection_policy.${key}` }));
  }
  if (policy.do_not_create_world_entities !== true) concerns.push(concern('STAGE9_INPUT_WORLD_ENTITY_CREATION_NOT_FORBIDDEN', 'selection_policy.do_not_create_world_entities must be true.'));
}

function validateScalePolicy(concerns, selectedScale, candidate, link, input) {
  const policy = input.selection_policy ?? DEFAULT_STAGE9_SELECTION_POLICY;
  if (selectedScale === 'G1' && policy.allow_g1_fallback !== true) concerns.push(concern('STAGE9_G1_FALLBACK_FORBIDDEN', 'G1 cannot be selected when allow_g1_fallback=false.'));
  if (selectedScale === 'G2' && policy.allow_g2_fallback !== true) concerns.push(concern('STAGE9_G2_FALLBACK_FORBIDDEN', 'G2 cannot be selected when allow_g2_fallback=false.'));
  if (selectedScale === 'G3' && policy.prefer_g4 === true && allowedCandidates(input).some((item) => scaleOfCandidate(item) === 'G4')) concerns.push(concern('STAGE9_G3_SELECTED_WHEN_VALID_G4_EXISTS', 'G3 cannot be selected when prefer_g4=true and an allowed G4 candidate exists.'));
  if (policy.prefer_g5_ready === true && allowedCandidateLinks(input).some(({ candidate: c, link: l }) => isG5Ready(c) || isG5Ready(l)) && !(isG5Ready(candidate) || isG5Ready(link))) concerns.push(concern('STAGE9_NON_G5_READY_SELECTED_WHEN_G5_READY_EXISTS', 'Non-G5-ready candidate cannot be selected when prefer_g5_ready=true and an allowed G5-ready candidate/link exists.'));
}

function validateNodeChain(concerns, chain, selectedScale, candidate, link) {
  if (!chain || typeof chain !== 'object' || Array.isArray(chain)) {
    concerns.push(concern('STAGE9_SELECTED_NODE_CHAIN_MISSING', 'selected_node_chain is required.'));
    return;
  }
  const required = selectedScale === 'G4' ? ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']
    : selectedScale === 'G3' ? ['g1_node_id', 'g2_node_id', 'g3_node_id']
      : selectedScale === 'G2' ? ['g1_node_id', 'g2_node_id']
        : ['g1_node_id'];
  for (const key of required) {
    if (!nonEmpty(chain[key])) concerns.push(concern('STAGE9_SELECTED_NODE_CHAIN_INCOMPLETE', `selected_node_chain.${key} is required for ${selectedScale}.`, { field: `selected_node_chain.${key}` }));
  }
  if (selectedScale === 'G3' && chain.g4_node_id !== null) concerns.push(concern('STAGE9_SELECTED_NODE_CHAIN_INVALID_FOR_SCALE', 'G3 selection requires selected_node_chain.g4_node_id=null.'));
  if (selectedScale === 'G2' && (chain.g3_node_id !== null || chain.g4_node_id !== null)) concerns.push(concern('STAGE9_SELECTED_NODE_CHAIN_INVALID_FOR_SCALE', 'G2 selection requires selected_node_chain.g3_node_id=null and g4_node_id=null.'));
  const expected = candidateChain(candidate, link);
  for (const key of ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']) {
    if (expected[key] && chain[key] !== expected[key]) concerns.push(concern('STAGE9_SELECTED_NODE_CHAIN_MISMATCH', `selected_node_chain.${key} must match selected candidate chain.`, { field: `selected_node_chain.${key}`, expected: expected[key], actual: chain[key] }));
  }
}

function validateNpcItemSupport(concerns, evidence, output, input, placeTemplateId, linkId, candidateId) {
  const npcSupported = hasNpcSupport(input.npc_candidate_set, placeTemplateId, linkId, candidateId);
  const itemSupported = hasItemSupport(input.item_profile_candidate_set, placeTemplateId, linkId);
  if (input.selection_policy?.require_npc_candidate_support === true && !npcSupported) concerns.push(concern('STAGE9_REQUIRED_NPC_SUPPORT_MISSING', 'selection_policy requires NPC candidate support for selected start.'));
  if (input.selection_policy?.require_item_profile_support === true && !itemSupported) concerns.push(concern('STAGE9_REQUIRED_ITEM_PROFILE_SUPPORT_MISSING', 'selection_policy requires item profile support for selected start.'));
  if (!npcSupported) evidence.push({ kind: 'stage9_warning', code: 'STAGE9_NPC_SUPPORT_NOT_REQUIRED_BUT_WEAK' });
  if (!itemSupported) evidence.push({ kind: 'stage9_warning', code: 'STAGE9_ITEM_SUPPORT_NOT_REQUIRED_BUT_WEAK' });
}

async function verifyStage9SourceRecords({ output, candidate, link, deps }) {
  const concerns = [];
  const ids = collectSourceIds([output.source_trace, output.audit?.evidence, candidate?.source_trace, candidate?.sources, link?.source_trace, link?.sources]);
  if (ids.length === 0) {
    concerns.push(concern('STAGE9_SOURCE_TRACE_MISSING', 'Stage 9 selected output and selected candidate/link must have source_trace when require_sources=true.'));
    return concerns;
  }
  const db = deps.queryable ?? deps.db ?? null;
  if (!db || typeof db.query !== 'function') {
    concerns.push(concern('STAGE9_SOURCE_RECORD_VERIFIER_MISSING', 'Stage 9 requires queryable world_base.source_records verification.'));
    return concerns;
  }
  let rows = [];
  try {
    ({ rows = [] } = await db.query('SELECT source_id, status, confidence FROM world_base.source_records WHERE source_id = ANY($1)', [ids]));
  } catch (_) {
    try {
      ({ rows = [] } = await db.query('SELECT id AS source_id, status, confidence FROM world_base.source_records WHERE id = ANY($1)', [ids]));
    } catch (error) {
      concerns.push(concern('STAGE9_SOURCE_RECORD_QUERY_FAILED', `Could not query world_base.source_records: ${error.message}`));
      return concerns;
    }
  }
  const byId = new Map(rows.map((row) => [String(row.source_id ?? row.id), row]));
  for (const id of ids) {
    const row = byId.get(String(id));
    if (!row) {
      concerns.push(concern('STAGE9_SOURCE_ID_NOT_FOUND_IN_SOURCE_RECORDS', `source_id ${id} was not found in world_base.source_records.`, { source_id: id }));
      continue;
    }
    const status = String(row.status ?? '').toLowerCase();
    if (status === 'rejected') concerns.push(concern('STAGE9_SOURCE_RECORD_REJECTED', `source_id ${id} is rejected.`, { source_id: id }));
    if (status === 'conflict' || status === 'conflicted') concerns.push(concern('STAGE9_SOURCE_RECORD_CONFLICT', `source_id ${id} is in conflict.`, { source_id: id }));
  }
  return concerns;
}

function readAllowedCandidateIds(input) {
  return input.start_candidate_set?.downstream_constraints?.must_choose_from_candidate_ids ?? [];
}

function readAllowedTemplateLinkIds(input) {
  return input.candidate_place_template_set?.downstream_constraints?.must_choose_candidate_template_link_id
    ?? input.candidate_place_template_set?.downstream_constraints?.must_choose_from_candidate_template_link_ids
    ?? [];
}

function allowedCandidates(input) {
  const allowed = new Set(readAllowedCandidateIds(input));
  return (input.start_candidate_set?.candidates ?? []).filter((item) => allowed.has(candidateIdOf(item)));
}

function allowedCandidateLinks(input) {
  const candidates = new Map((input.start_candidate_set?.candidates ?? []).map((item) => [candidateIdOf(item), item]));
  const allowed = new Set(readAllowedTemplateLinkIds(input));
  return (input.candidate_place_template_set?.candidate_template_links ?? [])
    .filter((link) => allowed.has(linkIdOf(link)))
    .map((link) => ({ link, candidate: candidates.get(candidateIdOfLink(link)) }))
    .filter((item) => item.candidate);
}

function candidateIdOf(candidate) {
  return candidate?.candidate_id ?? candidate?.start_candidate_id ?? candidate?.id ?? candidate?.selected_candidate_id ?? null;
}

function linkIdOf(link) {
  return link?.candidate_place_template_link_id ?? link?.link_id ?? link?.id ?? link?.candidate_template_link_id ?? null;
}

function candidateIdOfLink(link) {
  return link?.candidate_id ?? link?.start_candidate_id ?? link?.selected_candidate_id ?? null;
}

function placeTemplateIdOfLink(link) {
  return link?.place_template_id ?? link?.selected_place_template_id ?? link?.template_id ?? null;
}

function scaleOfCandidate(candidate) {
  return String(candidate?.scale_level ?? candidate?.selected_scale_level ?? candidate?.canonical_node?.scale_level ?? candidate?.node?.scale_level ?? '').toUpperCase();
}

function knownCandidateNodeIds(candidate) {
  return new Set([
    candidate?.canonical_node?.node_id,
    candidate?.canonical_node?.id,
    candidate?.node?.node_id,
    candidate?.node?.id,
    candidate?.node_id,
    candidate?.graph_node_id,
    candidate?.start_node_id,
    candidate?.selected_node_id,
    candidate?.location_node_id,
    candidate?.g4_node_id,
    candidate?.g3_node_id,
    candidate?.g2_node_id,
    candidate?.g1_node_id
  ].filter(nonEmpty));
}

function candidateChain(candidate, link) {
  const source = link?.node_chain ?? candidate?.node_chain ?? candidate?.parent_chain ?? {};
  return {
    g1_node_id: source.g1_node_id ?? candidate?.g1_node_id ?? null,
    g2_node_id: source.g2_node_id ?? candidate?.g2_node_id ?? null,
    g3_node_id: source.g3_node_id ?? candidate?.g3_node_id ?? null,
    g4_node_id: source.g4_node_id ?? candidate?.g4_node_id ?? null
  };
}

function isG5Ready(value) {
  return value?.g5_ready === true || value?.is_g5_ready === true || value?.g5_readiness === 'ready' || value?.g5_status === 'ready';
}

function hasNpcSupport(npcCandidateSet, placeTemplateId, linkId, candidateId) {
  return (npcCandidateSet?.npc_candidates ?? []).some((npc) => {
    const links = npc.allowed_candidate_place_template_link_ids ?? npc.allowed_place_template_link_ids ?? [];
    const places = npc.allowed_place_template_ids ?? [];
    const candidates = npc.allowed_start_candidate_ids ?? npc.start_candidate_ids ?? [];
    return links.includes(linkId) || places.includes(placeTemplateId) || candidates.includes(candidateId);
  });
}

function hasItemSupport(itemCandidateSet, placeTemplateId, linkId) {
  return (itemCandidateSet?.item_profile_candidates ?? []).some((item) => {
    const links = item.allowed_candidate_place_template_link_ids ?? item.allowed_place_template_link_ids ?? [];
    const places = item.allowed_place_template_ids ?? [];
    return links.includes(linkId) || places.includes(placeTemplateId);
  });
}

function findForbiddenPaths(value, path = '$', hits = []) {
  if (!value || typeof value !== 'object') return hits;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenPaths(item, `${path}[${index}]`, hits));
    return hits;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(key)) hits.push(nextPath);
    findForbiddenPaths(nested, nextPath, hits);
  }
  return hits;
}

function collectSourceIds(values) {
  const ids = new Set();
  const visit = (value) => {
    if (value == null) return;
    if (typeof value === 'string') {
      if (value.trim()) ids.add(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === 'object') {
      for (const key of ['source_id', 'sourceId', 'id']) {
        if (typeof value[key] === 'string' && value[key].trim()) ids.add(value[key].trim());
      }
      if (value.source_ref?.id) ids.add(String(value.source_ref.id));
      if (value.source?.id) ids.add(String(value.source.id));
      for (const nestedKey of ['source_trace', 'sources', 'evidence']) visit(value[nestedKey]);
    }
  };
  for (const value of values) visit(value);
  return [...ids];
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readPath(value, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}

function concern(code, message, extra = {}) {
  return { code, message, ...extra };
}
