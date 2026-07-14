export const STAGE10_INPUT_SCHEMA = 'start_place_audit_input';
export const STAGE10_OUTPUT_SCHEMA = 'start_place_audit';

export const DEFAULT_STAGE10_AUDIT_POLICY = Object.freeze({
  require_world_base_node: true,
  require_candidate_set_membership: true,
  require_place_template_link: true,
  require_full_parent_chain_for_g4: true,
  require_region_match: true,
  require_year_match: true,
  require_season_match: true,
  require_clock_match: true,
  require_access_edge: true,
  require_player_hard_constraints_match: true,
  require_social_status_compatibility: false,
  require_npc_candidate_support: false,
  require_item_profile_support: false,
  require_g5_readiness: true,
  require_sources: true,
  reject_rejected_or_conflict_records: true,
  require_semantic_llm_audit: false,
  allow_g1_fallback: false,
  allow_g2_fallback: false,
  allow_g3_fallback: true
});

const ALLOWED_REPAIR_STAGES = Object.freeze([
  'start_node_selector',
  'start_candidate_retriever',
  'place_template_retriever',
  'historical_frame_selector'
]);

const REQUIRED_CHECK_KEYS = Object.freeze([
  'world_base_existence',
  'candidate_set_membership',
  'node_chain',
  'region_compatibility',
  'year_compatibility',
  'season_compatibility',
  'clock_compatibility',
  'place_template_compatibility',
  'access_compatibility',
  'player_request_compatibility',
  'social_status_compatibility',
  'npc_support',
  'item_support',
  'g5_readiness',
  'source_trace',
  'downstream_entity_leak_check'
]);

const FORBIDDEN_OUTPUT_KEYS = Object.freeze([
  'new_place',
  'generated_place',
  'generated_place_name',
  'created_location',
  'created_node',
  'g5',
  'g5_scene',
  'g5_anchor',
  'g5_anchor_id',
  'minilocation',
  'minilocation_id',
  'anchor_id',
  'npc',
  'npcs',
  'npc_id',
  'npc_name',
  'item',
  'items',
  'item_id',
  'container_contents',
  'inventory',
  'equipment',
  'visible_scene',
  'intro_prose',
  'start_prose',
  'narrator_prose',
  'party_current_position',
  'current_position',
  'weather_event',
  'quest',
  'hidden_event',
  'hidden_state',
  'secret',
  'owner_id',
  'route',
  'arrival_route'
]);

export function normalizeStage10AuditPolicy(policy = {}) {
  return {
    ...DEFAULT_STAGE10_AUDIT_POLICY,
    ...(policy ?? {}),
    require_world_base_node: policy?.require_world_base_node ?? DEFAULT_STAGE10_AUDIT_POLICY.require_world_base_node,
    require_candidate_set_membership: policy?.require_candidate_set_membership ?? DEFAULT_STAGE10_AUDIT_POLICY.require_candidate_set_membership,
    require_place_template_link: policy?.require_place_template_link ?? DEFAULT_STAGE10_AUDIT_POLICY.require_place_template_link,
    require_full_parent_chain_for_g4: policy?.require_full_parent_chain_for_g4 ?? DEFAULT_STAGE10_AUDIT_POLICY.require_full_parent_chain_for_g4,
    require_access_edge: policy?.require_access_edge ?? DEFAULT_STAGE10_AUDIT_POLICY.require_access_edge,
    require_sources: policy?.require_sources ?? DEFAULT_STAGE10_AUDIT_POLICY.require_sources,
    reject_rejected_or_conflict_records: policy?.reject_rejected_or_conflict_records ?? DEFAULT_STAGE10_AUDIT_POLICY.reject_rejected_or_conflict_records
  };
}

export function buildStage10StartPlaceAuditInputFromPipeline(context, options = {}) {
  return {
    version: 1,
    schema: STAGE10_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? options.normalizedRequest ?? context.requireStageOutput(2, 'normalized request'),
    historical_frame: options.historical_frame ?? options.historicalFrame ?? context.requireStageOutput(3, 'historical frame'),
    regional_context_package: options.regional_context_package ?? options.regionalContextPackage ?? context.requireStageOutput(4, 'regional context package'),
    start_candidate_set: options.start_candidate_set ?? options.startCandidateSet ?? context.requireStageOutput(5, 'start candidate set'),
    candidate_place_template_set: options.candidate_place_template_set ?? options.candidatePlaceTemplateSet ?? context.requireStageOutput(6, 'candidate place template set'),
    npc_candidate_set: options.npc_candidate_set ?? options.npcCandidateSet ?? context.requireStageOutput(7, 'NPC candidate set'),
    item_profile_candidate_set: options.item_profile_candidate_set ?? options.itemProfileCandidateSet ?? context.requireStageOutput(8, 'item profile candidate set'),
    selected_start_node: options.selected_start_node ?? options.selectedStartNode ?? context.requireStageOutput(9, 'selected start node'),
    audit_policy: normalizeStage10AuditPolicy(options.audit_policy ?? options.auditPolicy ?? options.policy ?? {})
  };
}

export function validateStage10StartPlaceAuditInput(input = {}) {
  const concerns = [];
  if (input?.version !== 1) concerns.push(block('STAGE10_INPUT_VERSION_INVALID', 'Stage 10 input.version must be 1.'));
  if (input?.schema !== STAGE10_INPUT_SCHEMA) concerns.push(block('STAGE10_INPUT_SCHEMA_MISMATCH', `Stage 10 input.schema must be ${STAGE10_INPUT_SCHEMA}.`));
  if (!isNonEmptyString(input?.request_id)) concerns.push(block('STAGE10_INPUT_MISSING_REQUEST_ID', 'Stage 10 request_id is required.'));
  requireSchema(concerns, input?.normalized_request, 'new_game_normalized_request', 'STAGE10_INPUT_INVALID_NORMALIZED_REQUEST');
  requireSchema(concerns, input?.historical_frame, 'historical_frame', 'STAGE10_INPUT_INVALID_HISTORICAL_FRAME');
  requireSchema(concerns, input?.regional_context_package, 'regional_context_package', 'STAGE10_INPUT_INVALID_REGIONAL_CONTEXT_PACKAGE');
  requireSchema(concerns, input?.start_candidate_set, 'start_candidate_set', 'STAGE10_INPUT_INVALID_START_CANDIDATE_SET');
  requireSchema(concerns, input?.candidate_place_template_set, 'candidate_place_template_set', 'STAGE10_INPUT_INVALID_CANDIDATE_PLACE_TEMPLATE_SET');
  requireSchema(concerns, input?.npc_candidate_set, 'npc_candidate_set', 'STAGE10_INPUT_INVALID_NPC_CANDIDATE_SET');
  requireSchema(concerns, input?.item_profile_candidate_set, 'item_profile_candidate_set', 'STAGE10_INPUT_INVALID_ITEM_PROFILE_CANDIDATE_SET');
  requireSchema(concerns, input?.selected_start_node, 'selected_start_node', 'STAGE10_INPUT_INVALID_SELECTED_START_NODE');

  requireReady(concerns, input?.start_candidate_set, 'STAGE10_INPUT_START_CANDIDATE_SET_NOT_READY');
  requireReady(concerns, input?.candidate_place_template_set, 'STAGE10_INPUT_CANDIDATE_PLACE_TEMPLATE_SET_NOT_READY');
  requireReady(concerns, input?.npc_candidate_set, 'STAGE10_INPUT_NPC_CANDIDATE_SET_NOT_READY');
  requireReady(concerns, input?.item_profile_candidate_set, 'STAGE10_INPUT_ITEM_PROFILE_CANDIDATE_SET_NOT_READY');

  if (input?.selected_start_node?.selection_status !== 'selected') {
    concerns.push(block('STAGE10_INPUT_SELECTED_START_NODE_NOT_SELECTED', 'Stage 10 requires selected_start_node.selection_status=selected.'));
  }
  if (input?.selected_start_node?.audit?.pass !== true) {
    concerns.push(block('STAGE10_INPUT_SELECTED_START_NODE_AUDIT_NOT_PASSED', 'Stage 10 requires selected_start_node.audit.pass=true.'));
  }
  const selected = input?.selected_start_node?.selected;
  if (!selected || typeof selected !== 'object') concerns.push(block('STAGE10_INPUT_SELECTED_BLOCK_MISSING', 'selected_start_node.selected is required.'));
  const frame = frameFrom(input?.historical_frame);
  if (!frame.region_id) concerns.push(block('STAGE10_INPUT_REGION_MISSING', 'historical_frame.region.region_id is required.'));
  if (!Number.isFinite(Number(frame.year))) concerns.push(block('STAGE10_INPUT_YEAR_MISSING', 'historical_frame.year.value is required.'));
  if (!frame.season) concerns.push(block('STAGE10_INPUT_SEASON_MISSING', 'historical_frame.calendar.season is required.'));
  if (!input?.historical_frame?.clock) concerns.push(block('STAGE10_INPUT_CLOCK_MISSING', 'historical_frame.clock is required.'));
  if (!input?.audit_policy || typeof input.audit_policy !== 'object') concerns.push(block('STAGE10_INPUT_AUDIT_POLICY_MISSING', 'audit_policy is required.'));
  return {
    pass: concerns.length === 0,
    concerns,
    evidence: [{ kind: 'stage10_input_contract', pass: concerns.length === 0 }]
  };
}

export async function runStage10StartPlaceAuditGate(input = {}, deps = {}) {
  const policy = normalizeStage10AuditPolicy(input?.audit_policy);
  const selectedStartNode = input?.selected_start_node;
  const selected = selectedStartNode?.selected ?? {};
  const selectedStart = selectedStartShape(selected);
  const checks = emptyChecks();
  const concerns = [];
  const evidence = [];
  const mustResolveLater = [];
  const mustPreserve = [
    'selected_candidate_id',
    'selected_candidate_place_template_link_id',
    'selected_node_id',
    'selected_scale_level',
    'selected_place_template_id',
    'selected_node_chain',
    'historical_frame.region_id',
    'historical_frame.year',
    'historical_frame.season',
    'historical_frame.clock'
  ];

  const inputValidation = validateStage10StartPlaceAuditInput(input);
  if (!inputValidation.pass) {
    for (const item of inputValidation.concerns) concerns.push(item);
    checks.world_base_existence = check('fail', inputValidation.concerns, inputValidation.evidence);
    return finalizeAudit({ input, selectedStart: null, checks, concerns, evidence: inputValidation.evidence, repairRoute: route('start_node_selector', 'start_place_audit_input_invalid'), mustPreserve, mustResolveLater });
  }

  const db = deps.queryable ?? deps.db ?? null;
  if (!db || typeof db.query !== 'function') {
    const c = block('START_PLACE_QUERYABLE_MISSING', 'Stage 10 requires a queryable world_base connection.');
    concerns.push(c);
    checks.world_base_existence = check('fail', [c], [{ kind: 'queryable_missing' }]);
    return finalizeAudit({ input, selectedStart: null, checks, concerns, evidence, repairRoute: route('start_candidate_retriever', 'world_base_queryable_missing'), mustPreserve, mustResolveLater });
  }

  const requiredRelations = await checkRequiredRelations(db);
  if (!requiredRelations.pass) {
    for (const item of requiredRelations.concerns) concerns.push(item);
    checks.world_base_existence = check('fail', requiredRelations.concerns, requiredRelations.evidence);
    return finalizeAudit({ input, selectedStart: null, checks, concerns, evidence: requiredRelations.evidence, repairRoute: route('start_candidate_retriever', 'world_base_required_table_missing'), mustPreserve, mustResolveLater });
  }

  const frame = frameFrom(input.historical_frame);
  const startCandidateSet = input.start_candidate_set;
  const templateSet = input.candidate_place_template_set;
  const selectedCandidateId = selected.selected_candidate_id;
  const selectedLinkId = selected.selected_candidate_place_template_link_id;
  const selectedNodeId = selected.selected_node_id;
  const selectedPlaceTemplateId = selected.selected_place_template_id;
  const selectedScale = selected.selected_scale_level;

  const candidates = Array.isArray(startCandidateSet.candidates) ? startCandidateSet.candidates : [];
  const links = Array.isArray(templateSet.candidate_template_links) ? templateSet.candidate_template_links : [];
  const candidate = candidates.find((item) => candidateIdOf(item) === selectedCandidateId) ?? null;
  const allowedCandidateIds = new Set(startCandidateSet.downstream_constraints?.must_choose_from_candidate_ids ?? candidates.map(candidateIdOf).filter(Boolean));
  const selectedLink = links.find((item) => linkIdOf(item) === selectedLinkId) ?? null;
  const allowedLinkIds = new Set(templateSet.downstream_constraints?.must_choose_candidate_template_link_id ?? links.map(linkIdOf).filter(Boolean));

  const membershipConcerns = [];
  if (!candidate) membershipConcerns.push(block('START_PLACE_CANDIDATE_NOT_IN_SET', 'selected_candidate_id is not present in start_candidate_set.candidates.'));
  if (!allowedCandidateIds.has(selectedCandidateId)) membershipConcerns.push(block('START_PLACE_CANDIDATE_NOT_ALLOWED', 'selected_candidate_id is not in downstream allowed start candidate IDs.'));
  checks.candidate_set_membership = check(membershipConcerns.length === 0 ? 'pass' : 'fail', membershipConcerns, [{ selected_candidate_id: selectedCandidateId }]);
  concerns.push(...membershipConcerns);

  const linkConcerns = [];
  if (!selectedLink) linkConcerns.push(block('START_PLACE_TEMPLATE_LINK_NOT_FOUND', 'selected_candidate_place_template_link_id is not present in candidate_place_template_set.candidate_template_links.'));
  if (!allowedLinkIds.has(selectedLinkId)) linkConcerns.push(block('START_PLACE_TEMPLATE_LINK_NOT_ALLOWED', 'selected_candidate_place_template_link_id is not in downstream allowed template links.'));
  if (selectedLink && linkCandidateIdOf(selectedLink) !== selectedCandidateId) linkConcerns.push(block('START_PLACE_TEMPLATE_LINK_CANDIDATE_MISMATCH', 'Selected template link belongs to another candidate.'));
  if (selectedLink && linkPlaceTemplateIdOf(selectedLink) !== selectedPlaceTemplateId) linkConcerns.push(block('START_PLACE_TEMPLATE_ID_MISMATCH', 'selected_place_template_id does not match selected template link.'));
  checks.place_template_compatibility = check(linkConcerns.length === 0 ? 'pass' : 'fail', linkConcerns, [{ selected_link_id: selectedLinkId, selected_place_template_id: selectedPlaceTemplateId }]);
  concerns.push(...linkConcerns);

  const nodeRows = await queryGraphNodes(db, unique([selectedNodeId, ...chainIds(input.selected_start_node?.selected_node_chain), ...candidateNodeIds(candidate)]));
  const nodeById = new Map(nodeRows.flatMap((row) => [[String(row.id), row], [String(row.node_id ?? row.id), row]]));
  const selectedNode = nodeById.get(String(selectedNodeId)) ?? null;
  const existenceConcerns = [];
  if (!selectedNode) existenceConcerns.push(block('START_PLACE_NODE_NOT_FOUND', 'selected_node_id was not found in world_base.graph_nodes.'));
  checks.world_base_existence = check(existenceConcerns.length === 0 ? 'pass' : 'fail', existenceConcerns, [{ selected_node_id: selectedNodeId }]);
  concerns.push(...existenceConcerns);

  const nodeIdConcerns = [];
  if (candidate && !knownCandidateNodeIds(candidate).has(selectedNodeId)) {
    nodeIdConcerns.push(block('START_PLACE_SELECTED_NODE_ID_NOT_FROM_CANDIDATE', 'selected_node_id does not match the selected candidate read-only node IDs.'));
  }
  concerns.push(...nodeIdConcerns);
  if (nodeIdConcerns.length > 0) {
    checks.world_base_existence.concerns.push(...nodeIdConcerns);
    checks.world_base_existence.status = 'fail';
  }

  const placeRows = await queryPlaceTemplate(db, selectedPlaceTemplateId);
  const regionPlaceRows = await queryRegionPlaceTemplate(db, frame.region_id, selectedPlaceTemplateId);
  const templateConcerns = [];
  const placeTemplate = placeRows[0] ?? null;
  const regionPlaceTemplate = regionPlaceRows[0] ?? null;
  if (!placeTemplate) templateConcerns.push(block('START_PLACE_TEMPLATE_NOT_FOUND', 'selected_place_template_id was not found in world_base.place_templates.'));
  if (!regionPlaceTemplate) templateConcerns.push(block('START_PLACE_TEMPLATE_NOT_ALLOWED_IN_REGION', 'selected_place_template_id is not allowed by world_base.region_place_templates for the selected region.'));
  if (templateConcerns.length > 0) {
    concerns.push(...templateConcerns);
    checks.place_template_compatibility.status = 'fail';
    checks.place_template_compatibility.concerns.push(...templateConcerns);
  }

  const chainCheck = validateNodeChain({ selectedScale, selectedNodeChain: input.selected_start_node?.selected_node_chain, selectedNode, nodeById, policy });
  checks.node_chain = chainCheck;
  concerns.push(...chainCheck.concerns);
  if ((selectedScale === 'G3' || selectedScale === 'G2') && chainCheck.status === 'pass') mustResolveLater.push(`refine_${selectedScale.toLowerCase()}_fallback_to_g4_g5`);

  const regionCheck = validateRegionCompatibility({ selectedNode, nodeById, selectedNodeChain: input.selected_start_node?.selected_node_chain, frame, candidate, selectedLink });
  checks.region_compatibility = regionCheck;
  concerns.push(...regionCheck.concerns);

  const yearCheck = validateYearCompatibility({ frame, rows: [selectedNode, placeTemplate, regionPlaceTemplate, selectedLink, candidate].filter(Boolean), policy });
  checks.year_compatibility = yearCheck;
  concerns.push(...yearCheck.concerns);

  const seasonCheck = validateSeasonCompatibility({ frame, rows: [selectedNode, placeTemplate, regionPlaceTemplate, selectedLink, candidate].filter(Boolean), policy });
  checks.season_compatibility = seasonCheck;
  concerns.push(...seasonCheck.concerns);

  const clockCheck = validateClockCompatibility({ frame, rows: [selectedNode, placeTemplate, regionPlaceTemplate, selectedLink, candidate].filter(Boolean), policy });
  checks.clock_compatibility = clockCheck;
  concerns.push(...clockCheck.concerns);

  const edgeRows = await queryAccessEdges(db, selectedNodeId, requiredRelations.edge_table);
  const accessCheck = validateAccessCompatibility({ edgeRows, rows: [selectedNode, placeTemplate, regionPlaceTemplate, selectedLink, candidate].filter(Boolean), policy });
  checks.access_compatibility = accessCheck;
  concerns.push(...accessCheck.concerns);

  const playerCheck = validatePlayerRequestCompatibility({ normalizedRequest: input.normalized_request, candidate, selectedLink });
  checks.player_request_compatibility = playerCheck;
  concerns.push(...playerCheck.concerns);

  const socialCheck = validateSocialStatusCompatibility({ normalizedRequest: input.normalized_request, policy });
  checks.social_status_compatibility = socialCheck;
  concerns.push(...socialCheck.concerns);
  if (socialCheck.status === 'warning') mustResolveLater.push('explain_player_presence_reason_if_socially_unexpected');

  const npcCheck = validateSupport({
    kind: 'npc',
    required: policy.require_npc_candidate_support === true,
    hasSupport: Array.isArray(input.npc_candidate_set?.npc_candidates) && input.npc_candidate_set.npc_candidates.length > 0,
    requiredCode: 'START_PLACE_NPC_SUPPORT_REQUIRED_MISSING',
    warningCode: 'START_PLACE_NPC_SUPPORT_WEAK'
  });
  checks.npc_support = npcCheck;
  concerns.push(...npcCheck.concerns);

  const itemCheck = validateSupport({
    kind: 'item',
    required: policy.require_item_profile_support === true,
    hasSupport: Array.isArray(input.item_profile_candidate_set?.item_profile_candidates) && input.item_profile_candidate_set.item_profile_candidates.length > 0,
    requiredCode: 'START_PLACE_ITEM_SUPPORT_REQUIRED_MISSING',
    warningCode: 'START_PLACE_ITEM_SUPPORT_WEAK'
  });
  checks.item_support = itemCheck;
  concerns.push(...itemCheck.concerns);

  const g5Check = validateG5Readiness({ candidate, selectedLink, placeTemplate, regionPlaceTemplate, policy });
  checks.g5_readiness = g5Check;
  concerns.push(...g5Check.concerns);
  if (g5Check.status === 'fail') mustResolveLater.push('select_or_materialize_g5_ready_start_node');

  const leakCheck = validateDownstreamEntityLeak(selectedStartNode);
  checks.downstream_entity_leak_check = leakCheck;
  concerns.push(...leakCheck.concerns);

  const sourceRows = [selectedStartNode, candidate, selectedLink, selectedNode, ...nodeRows, placeTemplate, regionPlaceTemplate, ...edgeRows].filter(Boolean);
  const sourceCheck = await validateSources(db, sourceRows, policy);
  checks.source_trace = sourceCheck;
  concerns.push(...sourceCheck.concerns);

  const finalEvidence = [
    ...evidence,
    { kind: 'world_base_required_tables', edge_table: requiredRelations.edge_table },
    { kind: 'selected_node', selected_node_id: selectedNodeId, found: !!selectedNode },
    { kind: 'selected_candidate', selected_candidate_id: selectedCandidateId, found: !!candidate },
    { kind: 'selected_template_link', selected_link_id: selectedLinkId, found: !!selectedLink },
    { kind: 'selected_place_template', selected_place_template_id: selectedPlaceTemplateId, found: !!placeTemplate, region_allowed: !!regionPlaceTemplate }
  ];

  return finalizeAudit({
    input,
    selectedStart,
    checks,
    concerns,
    evidence: finalEvidence,
    repairRoute: chooseRepairRoute(concerns),
    mustPreserve,
    mustResolveLater: unique(mustResolveLater)
  });
}

export function validateStartPlaceAuditOutput(output = {}, input = {}) {
  const concerns = [];
  if (output?.version !== 1) concerns.push(block('STAGE10_OUTPUT_VERSION_INVALID', 'start_place_audit.version must be 1.'));
  if (output?.schema !== STAGE10_OUTPUT_SCHEMA) concerns.push(block('STAGE10_OUTPUT_SCHEMA_MISMATCH', `start_place_audit.schema must be ${STAGE10_OUTPUT_SCHEMA}.`));
  if (output?.request_id !== input?.request_id) concerns.push(block('STAGE10_OUTPUT_REQUEST_ID_MISMATCH', 'start_place_audit.request_id must match input.request_id.'));
  if (typeof output?.pass !== 'boolean') concerns.push(block('STAGE10_OUTPUT_PASS_INVALID', 'start_place_audit.pass must be boolean.'));
  if (output?.pass === true && (!output.selected_start || typeof output.selected_start !== 'object')) concerns.push(block('STAGE10_OUTPUT_SELECTED_START_MISSING', 'selected_start is required when pass=true.'));
  if (output?.pass === false && output.selected_start !== null) concerns.push(block('STAGE10_OUTPUT_FAIL_SELECTED_START_NOT_NULL', 'selected_start must be null when pass=false.'));
  if (!output?.checks || typeof output.checks !== 'object') concerns.push(block('STAGE10_OUTPUT_CHECKS_MISSING', 'checks object is required.'));
  for (const key of REQUIRED_CHECK_KEYS) {
    if (!output?.checks?.[key]) concerns.push(block('STAGE10_OUTPUT_CHECK_MISSING', `checks.${key} is required.`));
  }
  if (!Array.isArray(output?.concerns)) concerns.push(block('STAGE10_OUTPUT_CONCERNS_INVALID', 'concerns must be an array.'));
  if (!Array.isArray(output?.evidence)) concerns.push(block('STAGE10_OUTPUT_EVIDENCE_INVALID', 'evidence must be an array.'));
  if (output?.pass === false && !isAllowedRepairRoute(output?.repair_route)) concerns.push(block('STAGE10_OUTPUT_REPAIR_ROUTE_INVALID', 'Failed start_place_audit requires an allowed repair_route.return_to_stage.'));
  const leak = validateDownstreamEntityLeak(output);
  concerns.push(...leak.concerns);
  return { pass: concerns.length === 0, concerns, evidence: [{ kind: 'start_place_audit_output_contract', pass: concerns.length === 0 }] };
}

export function buildStage10ManagedPipelineResult({ input, output, gate } = {}) {
  const audit = output ?? emptyAudit(input, route('start_node_selector', 'start_place_audit_failed'));
  return {
    version: 1,
    schema: 'stage_result',
    stage_id: 10,
    stage_slug: 'start_place_audit',
    status: 'blocked',
    blocked_at_stage: 10,
    output: audit,
    gate: gate ?? { pass: false, concerns: audit.concerns ?? [], evidence: audit.evidence ?? [] },
    repair_route: audit.repair_route ?? route('start_node_selector', 'start_place_audit_failed'),
    repair_request: {
      repair_type: audit.repair_route?.repair_kind ?? 'start_place_audit_failed',
      return_to_stage: audit.repair_route?.return_to_stage ?? 'start_node_selector',
      semantic_repair_allowed: false,
      llm_allowed: true,
      llm_mode: 'thinking',
      can_create_world_entities: false,
      can_change_selected_start: false,
      can_change_candidate_sets: false,
      can_write_party_position: false
    }
  };
}

export async function runStage10StartPlaceAudit(context, input = null, deps = {}) {
  const stageInput = input?.schema === STAGE10_INPUT_SCHEMA
    ? input
    : buildStage10StartPlaceAuditInputFromPipeline(context, input ?? {});
  let audit = await runStage10StartPlaceAuditGate(stageInput, deps);
  if (audit.pass === true && stageInput.audit_policy?.require_semantic_llm_audit === true) {
    if (typeof deps.semanticExecutor !== 'function') {
      audit = finalizeAudit({
        input: stageInput,
        selectedStart: null,
        checks: audit.checks,
        concerns: [...(audit.concerns ?? []), block('START_PLACE_SEMANTIC_AUDITOR_UNAVAILABLE', 'Semantic LLM audit is required by policy but no semantic auditor executor is available.')],
        evidence: [...(audit.evidence ?? []), { kind: 'semantic_llm_audit', status: 'unavailable' }],
        repairRoute: route('start_node_selector', 'semantic_audit_unavailable'),
        mustPreserve: audit.downstream_constraints?.must_preserve ?? [],
        mustResolveLater: audit.downstream_constraints?.must_resolve_later ?? []
      });
    } else {
      const semanticAudit = await deps.semanticExecutor({ input: stageInput, precheck: audit });
      if (semanticAudit?.pass === false) {
        audit = finalizeAudit({
          input: stageInput,
          selectedStart: null,
          checks: audit.checks,
          concerns: [...(audit.concerns ?? []), ...(semanticAudit.concerns ?? [block('START_PLACE_SEMANTIC_AUDIT_FAILED', 'Semantic auditor rejected the selected start place.')])],
          evidence: [...(audit.evidence ?? []), ...(semanticAudit.evidence ?? [{ kind: 'semantic_llm_audit', status: 'failed' }])],
          repairRoute: sanitizeRepairRoute(semanticAudit.repair_route ?? route('start_node_selector', 'semantic_audit_failed')),
          mustPreserve: audit.downstream_constraints?.must_preserve ?? [],
          mustResolveLater: audit.downstream_constraints?.must_resolve_later ?? []
        });
      }
    }
  }
  const gate = {
    stage_id: 10,
    stage_slug: 'start_place_audit',
    gate_kind: 'start_place_audit_gate',
    pass: audit.pass === true && !hasHardBlock(audit),
    concerns: audit.concerns ?? [],
    evidence: audit.evidence ?? []
  };
  context.setStageOutput?.(10, audit);
  context.setGateResult?.(10, gate);
  context.setLifecycleState?.(10, {
    stage_id: 10,
    stage_slug: 'start_place_audit',
    stage_type: 'code_first_audit',
    parsed_output: safeClone(audit),
    structural_validation: gate,
    pre_dependency_gate: gate,
    post_dependency_gate: gate,
    terminal_status: gate.pass ? 'passed' : 'blocked',
    failed_gate: gate.pass ? null : 'start_place_audit_gate',
    final_blocked_reason: gate.pass ? null : (audit.concerns ?? []).map((item) => item.message ?? item.code).join('; ')
  });
  if (!gate.pass) return buildStage10ManagedPipelineResult({ input: stageInput, output: audit, gate });
  context.freezeArtifact?.({
    artifact: audit,
    stage_id: 10,
    stageId: 10,
    stage_slug: 'start_place_audit',
    stageSlug: 'start_place_audit',
    schema: STAGE10_OUTPUT_SCHEMA,
    version: 1,
    produced_by: 'stage10_start_place_audit_gate',
    producedBy: 'stage10_start_place_audit_gate',
    validation_status: 'passed',
    validationStatus: 'passed',
    audit_status: 'passed',
    auditStatus: 'passed',
    dependency_status: 'passed',
    dependencyStatus: 'passed'
  });
  return audit;
}

function finalizeAudit({ input, selectedStart, checks, concerns, evidence, repairRoute, mustPreserve, mustResolveLater }) {
  const normalizedChecks = { ...emptyChecks(), ...(checks ?? {}) };
  const hardBlocks = (concerns ?? []).filter((item) => item?.severity === 'hard_block');
  const pass = hardBlocks.length === 0;
  const output = {
    version: 1,
    schema: STAGE10_OUTPUT_SCHEMA,
    request_id: input?.request_id ?? null,
    pass,
    selected_start: pass ? selectedStart : null,
    checks: normalizedChecks,
    concerns: concerns ?? [],
    evidence: evidence ?? [],
    repair_route: pass ? null : sanitizeRepairRoute(repairRoute ?? chooseRepairRoute(concerns)),
    downstream_constraints: {
      must_preserve: mustPreserve ?? [],
      must_not_create_yet: [
        'player_character',
        'g5_scene',
        'npc',
        'item',
        'visible_scene',
        'intro_prose',
        'party_current_position'
      ],
      must_resolve_later: mustResolveLater ?? []
    }
  };
  const outputValidation = validateStartPlaceAuditOutput(output, input);
  if (!outputValidation.pass) {
    output.pass = false;
    output.selected_start = null;
    output.concerns = [...(output.concerns ?? []), ...outputValidation.concerns];
    output.evidence = [...(output.evidence ?? []), ...outputValidation.evidence];
    output.repair_route = output.repair_route ?? route('start_node_selector', 'start_place_audit_output_invalid');
  }
  return output;
}

function emptyAudit(input, repairRoute) {
  return finalizeAudit({
    input,
    selectedStart: null,
    checks: emptyChecks(),
    concerns: [block('START_PLACE_AUDIT_FAILED', 'Start place audit failed.')],
    evidence: [],
    repairRoute,
    mustPreserve: [],
    mustResolveLater: []
  });
}

async function checkRequiredRelations(db) {
  const evidence = [];
  const concerns = [];
  const required = ['world_base.graph_nodes', 'world_base.place_templates', 'world_base.region_place_templates', 'world_base.source_records'];
  for (const relation of required) {
    const ok = await relationExists(db, relation);
    evidence.push({ kind: 'required_relation', relation, exists: ok });
    if (!ok) concerns.push(block('START_PLACE_REQUIRED_TABLE_MISSING', `Required world_base table is missing: ${relation}.`));
  }
  let edgeTable = null;
  if (await relationExists(db, 'world_base.graph_edges')) edgeTable = 'world_base.graph_edges';
  else if (await relationExists(db, 'world_base.access_edges')) edgeTable = 'world_base.access_edges';
  evidence.push({ kind: 'required_relation_alternative', relation: 'world_base.graph_edges OR world_base.access_edges', exists: !!edgeTable, selected_relation: edgeTable });
  if (!edgeTable) concerns.push(block('START_PLACE_REQUIRED_TABLE_MISSING', 'Required world_base edge table is missing: world_base.graph_edges OR world_base.access_edges.'));
  return { pass: concerns.length === 0, concerns, evidence, edge_table: edgeTable };
}

async function relationExists(db, relation) {
  try {
    await db.query(`SELECT 1 FROM ${relation} LIMIT 1`, []);
    return true;
  } catch (error) {
    if (isMissingRelation(error)) return false;
    return true;
  }
}

async function queryGraphNodes(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const { rows } = await db.query(`
    SELECT *
    FROM world_base.graph_nodes
    WHERE id = ANY($1::text[]) OR node_id = ANY($1::text[])
  `, [ids]);
  return rows ?? [];
}

async function queryPlaceTemplate(db, id) {
  if (!id) return [];
  const { rows } = await db.query(`
    SELECT *
    FROM world_base.place_templates
    WHERE id = $1 OR place_template_id = $1
    LIMIT 1
  `, [id]);
  return rows ?? [];
}

async function queryRegionPlaceTemplate(db, regionId, templateId) {
  if (!regionId || !templateId) return [];
  const { rows } = await db.query(`
    SELECT *
    FROM world_base.region_place_templates
    WHERE region_id = $1
      AND (place_template_id = $2 OR template_id = $2)
    LIMIT 1
  `, [regionId, templateId]);
  return rows ?? [];
}

async function queryAccessEdges(db, nodeId, edgeTable) {
  if (!nodeId || !edgeTable) return [];
  const sql = edgeTable.endsWith('access_edges')
    ? `SELECT * FROM world_base.access_edges WHERE node_id = $1 OR source_node_id = $1 OR target_node_id = $1 OR from_node_id = $1 OR to_node_id = $1 LIMIT 20`
    : `SELECT * FROM world_base.graph_edges WHERE source_node_id = $1 OR target_node_id = $1 OR from_node_id = $1 OR to_node_id = $1 LIMIT 20`;
  const { rows } = await db.query(sql, [nodeId]);
  return rows ?? [];
}

async function validateSources(db, rows, policy) {
  const sourceIds = unique(rows.flatMap((row) => collectSourceIds(row)));
  if (policy.require_sources !== true) return check('pass', [], [{ kind: 'source_trace_not_required' }]);
  if (sourceIds.length === 0) return check('fail', [block('START_PLACE_SOURCE_TRACE_MISSING', 'No source IDs were found for selected start place audit inputs.')], []);
  let sourceRows = [];
  try {
    const result = await db.query(`
      SELECT source_id, status, confidence
      FROM world_base.source_records
      WHERE source_id = ANY($1::text[])
    `, [sourceIds]);
    sourceRows = result.rows ?? [];
  } catch (error) {
    const result = await db.query(`
      SELECT id AS source_id, status, confidence
      FROM world_base.source_records
      WHERE id = ANY($1::text[])
    `, [sourceIds]);
    sourceRows = result.rows ?? [];
  }
  const byId = new Map(sourceRows.map((row) => [String(row.source_id ?? row.id), row]));
  const concerns = [];
  for (const id of sourceIds) {
    const row = byId.get(String(id));
    if (!row) concerns.push(block('START_PLACE_SOURCE_ID_NOT_FOUND', `Source ID was not found in world_base.source_records: ${id}.`));
    const status = String(row?.status ?? '').toLowerCase();
    if (policy.reject_rejected_or_conflict_records === true && ['rejected', 'conflict'].includes(status)) {
      concerns.push(block(status === 'conflict' ? 'START_PLACE_SOURCE_RECORD_CONFLICT' : 'START_PLACE_SOURCE_RECORD_REJECTED', `Source record ${id} has forbidden status ${status}.`));
    }
  }
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'source_records_checked', source_ids: sourceIds }]);
}

function validateNodeChain({ selectedScale, selectedNodeChain = {}, selectedNode, nodeById, policy }) {
  const concerns = [];
  const chain = selectedNodeChain ?? {};
  if (selectedScale === 'G1' && policy.allow_g1_fallback !== true) concerns.push(block('START_PLACE_G1_FINAL_NOT_ALLOWED', 'G1 is not allowed as final start place.'));
  if (selectedScale === 'G2' && policy.allow_g2_fallback !== true) concerns.push(block('START_PLACE_G2_FALLBACK_NOT_ALLOWED', 'G2 fallback is not allowed by audit policy.'));
  if (selectedScale === 'G3' && policy.allow_g3_fallback !== true) concerns.push(block('START_PLACE_G3_FALLBACK_NOT_ALLOWED', 'G3 fallback is not allowed by audit policy.'));
  const required = selectedScale === 'G4' ? ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']
    : selectedScale === 'G3' ? ['g1_node_id', 'g2_node_id', 'g3_node_id']
      : selectedScale === 'G2' ? ['g1_node_id', 'g2_node_id']
        : selectedScale === 'G1' ? ['g1_node_id'] : [];
  for (const key of required) {
    if (!chain[key]) concerns.push(block('START_PLACE_PARENT_CHAIN_MISSING', `selected_node_chain.${key} is required for ${selectedScale}.`));
  }
  if (selectedScale === 'G3' && chain.g4_node_id != null) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'G3 fallback must have g4_node_id=null.'));
  if (selectedScale === 'G2' && (chain.g3_node_id != null || chain.g4_node_id != null)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'G2 fallback must have g3_node_id=null and g4_node_id=null.'));
  const g1 = nodeById.get(String(chain.g1_node_id));
  const g2 = nodeById.get(String(chain.g2_node_id));
  const g3 = nodeById.get(String(chain.g3_node_id));
  const g4 = nodeById.get(String(chain.g4_node_id));
  if (selectedScale === 'G4' && selectedNode && g4 && idOf(selectedNode) !== idOf(g4)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'selected_node_id must match selected_node_chain.g4_node_id for G4.'));
  if (selectedScale === 'G3' && selectedNode && g3 && idOf(selectedNode) !== idOf(g3)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'selected_node_id must match selected_node_chain.g3_node_id for G3.'));
  if (selectedScale === 'G2' && selectedNode && g2 && idOf(selectedNode) !== idOf(g2)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'selected_node_id must match selected_node_chain.g2_node_id for G2.'));
  if (g4 && g3 && parentIdOf(g4) !== idOf(g3)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'G4 parent_node_id must equal G3 id.'));
  if (g3 && g2 && parentIdOf(g3) !== idOf(g2)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'G3 parent_node_id must equal G2 id.'));
  if (g2 && g1 && parentIdOf(g2) !== idOf(g1)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'G2 parent_node_id must equal G1 id.'));
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'node_chain', selected_scale_level: selectedScale, selected_node_chain: chain }]);
}

function validateRegionCompatibility({ selectedNode, nodeById, selectedNodeChain = {}, frame, candidate, selectedLink }) {
  const concerns = [];
  const rows = [selectedNode, candidate, selectedLink, ...chainIds(selectedNodeChain).map((id) => nodeById.get(String(id))).filter(Boolean)];
  for (const row of rows) {
    const regionId = row?.region_id ?? row?.regionId ?? null;
    if (regionId && frame.region_id && regionId !== frame.region_id) concerns.push(block('START_PLACE_REGION_MISMATCH', `Selected start row belongs to ${regionId}, expected ${frame.region_id}.`));
  }
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'region_compatibility', region_id: frame.region_id }]);
}

function validateYearCompatibility({ frame, rows }) {
  const concerns = [];
  const year = Number(frame.year);
  for (const row of rows) {
    const start = firstNumber(row, ['period_start_year', 'start_year', 'valid_from_year', 'year_start']);
    const end = firstNumber(row, ['period_end_year', 'end_year', 'valid_to_year', 'year_end']);
    if (Number.isFinite(start) && year < start) concerns.push(block('START_PLACE_YEAR_OUT_OF_RANGE', `Selected start is valid from ${start}, requested ${year}.`));
    if (Number.isFinite(end) && year > end) concerns.push(block('START_PLACE_YEAR_OUT_OF_RANGE', `Selected start is valid until ${end}, requested ${year}.`));
  }
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'year_compatibility', year }]);
}

function validateSeasonCompatibility({ frame, rows }) {
  const concerns = [];
  const warnings = [];
  for (const row of rows) {
    const allowed = normalizeArray(row?.allowed_seasons ?? row?.season_profile?.allowed_seasons);
    const forbidden = normalizeArray(row?.forbidden_seasons ?? row?.season_profile?.forbidden_seasons);
    const restricted = isRestrictedSeasonClockRow(row);
    if (allowed.length > 0 && !allowed.includes(frame.season)) concerns.push(block('START_PLACE_SEASON_INCOMPATIBLE', `Season ${frame.season} is not allowed.`));
    if (forbidden.includes(frame.season)) concerns.push(block('START_PLACE_SEASON_INCOMPATIBLE', `Season ${frame.season} is forbidden.`));
    if (restricted && allowed.length === 0 && forbidden.length === 0) warnings.push(warn('START_PLACE_SEASON_CLOCK_EVIDENCE_MISSING', 'Restricted/seasonal place has no explicit season evidence.'));
  }
  return check(concerns.length > 0 ? 'fail' : warnings.length > 0 ? 'warning' : 'pass', [...concerns, ...warnings], [{ kind: 'season_compatibility', season: frame.season }]);
}

function validateClockCompatibility({ frame, rows }) {
  const concerns = [];
  const warnings = [];
  const tod = frame.clock?.time_of_day;
  const light = frame.clock?.light_profile;
  for (const row of rows) {
    const allowedTod = normalizeArray(row?.allowed_time_of_day ?? row?.access_rhythm?.allowed_time_of_day);
    const forbiddenTod = normalizeArray(row?.forbidden_time_of_day ?? row?.access_rhythm?.forbidden_time_of_day);
    const requiredLight = normalizeArray(row?.light_profile_required ?? row?.required_light_profiles);
    const restricted = isRestrictedSeasonClockRow(row);
    if (allowedTod.length > 0 && !allowedTod.includes(tod)) concerns.push(block('START_PLACE_CLOCK_INCOMPATIBLE', `time_of_day ${tod} is not allowed.`));
    if (forbiddenTod.includes(tod)) concerns.push(block('START_PLACE_CLOCK_INCOMPATIBLE', `time_of_day ${tod} is forbidden.`));
    if (requiredLight.length > 0 && !requiredLight.includes(light)) concerns.push(block('START_PLACE_LIGHT_PROFILE_INCOMPATIBLE', `light_profile ${light} is not allowed.`));
    if (restricted && allowedTod.length === 0 && forbiddenTod.length === 0 && requiredLight.length === 0) warnings.push(warn('START_PLACE_SEASON_CLOCK_EVIDENCE_MISSING', 'Restricted/night-sensitive place has no explicit clock/light evidence.'));
  }
  return check(concerns.length > 0 ? 'fail' : warnings.length > 0 ? 'warning' : 'pass', [...concerns, ...warnings], [{ kind: 'clock_compatibility', clock: frame.clock }]);
}

function validateAccessCompatibility({ edgeRows, rows, policy }) {
  const concerns = [];
  const isolatedAllowed = rows.some(allowsIsolatedStart);
  if (policy.require_access_edge === true && edgeRows.length === 0 && !isolatedAllowed) {
    concerns.push(block('START_PLACE_ACCESS_EDGE_MISSING', 'Selected node has no valid access edge and no explicit isolated/no-access start rule.'));
  }
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'access_edges', count: edgeRows.length, isolated_allowed: isolatedAllowed }]);
}

function validatePlayerRequestCompatibility({ normalizedRequest, candidate, selectedLink }) {
  const violations = [
    ...normalizeArray(candidate?.hard_constraint_violations),
    ...normalizeArray(selectedLink?.hard_constraint_violations)
  ];
  if (violations.length > 0) return check('fail', [block('START_PLACE_PLAYER_HARD_CONSTRAINT_MISMATCH', 'Selected start violates player hard constraints.')], [{ kind: 'player_hard_constraint_violations', violations }]);
  const requestMatch = candidate?.request_match ?? selectedLink?.request_match ?? normalizedRequest?.request_match ?? null;
  if (['weak', 'low', 'mismatch'].includes(String(requestMatch).toLowerCase())) {
    return check('warning', [warn('START_PLACE_PLAYER_SOFT_PREFERENCE_WEAK_MATCH', 'Selected start weakly matches player soft preferences.')], [{ kind: 'player_request_match', request_match: requestMatch }]);
  }
  return check('pass', [], [{ kind: 'player_request_compatibility', request_match: requestMatch ?? 'neutral' }]);
}

function validateSocialStatusCompatibility({ normalizedRequest, policy }) {
  const socialRequest = normalizedRequest?.social_status ?? normalizedRequest?.character?.social_status ?? normalizedRequest?.player_character?.social_status ?? null;
  if (!socialRequest) return check('pass', [], [{ kind: 'social_status_compatibility', status: 'not_requested' }]);
  if (policy.require_social_status_compatibility === true) return check('fail', [block('START_PLACE_SOCIAL_STATUS_COMPATIBILITY_REQUIRED', 'Social status compatibility is required but must be resolved by a later reason-aware stage.')], [{ kind: 'social_status_request', social_status: socialRequest }]);
  return check('warning', [warn('START_PLACE_SOCIAL_STATUS_REASON_REQUIRED_LATER', 'Player may be in an unexpected place; later stages must create an approved reason without changing Stage 10 place audit.')], [{ kind: 'social_status_request', social_status: socialRequest }]);
}

function validateSupport({ kind, required, hasSupport, requiredCode, warningCode }) {
  if (hasSupport) return check('pass', [], [{ kind: `${kind}_support`, has_support: true }]);
  if (required) return check('fail', [block(requiredCode, `${kind} support is required but missing.`)], [{ kind: `${kind}_support`, has_support: false }]);
  return check('warning', [warn(warningCode, `${kind} support is weak or missing but policy does not require it.`)], [{ kind: `${kind}_support`, has_support: false }]);
}

function validateG5Readiness({ candidate, selectedLink, placeTemplate, regionPlaceTemplate, policy }) {
  const ready = [candidate, selectedLink, placeTemplate, regionPlaceTemplate].some(isG5Ready);
  if (ready || policy.require_g5_readiness !== true) return check(ready ? 'pass' : 'warning', ready ? [] : [warn('START_PLACE_G5_READINESS_WEAK', 'G5 readiness is not proven but not required by policy.')], [{ kind: 'g5_readiness', ready }]);
  return check('fail', [block('START_PLACE_G5_READINESS_MISSING', 'G5 readiness is required but missing for selected start.')], [{ kind: 'g5_readiness', ready: false }]);
}

function validateDownstreamEntityLeak(value) {
  const concerns = [];
  scanForbidden(value, '$', concerns);
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'downstream_entity_leak_scan', forbidden_keys: FORBIDDEN_OUTPUT_KEYS }]);
}

function scanForbidden(value, path, concerns) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForbidden(entry, `${path}[${index}]`, concerns));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_OUTPUT_KEYS.includes(key)) concerns.push(block('START_PLACE_DOWNSTREAM_ENTITY_LEAK', `Forbidden downstream entity field at ${path}.${key}.`));
    scanForbidden(nested, `${path}.${key}`, concerns);
  }
}

function chooseRepairRoute(concerns = []) {
  const codes = new Set((concerns ?? []).map((item) => item.code));
  if (codes.has('START_PLACE_REGION_MISMATCH') || codes.has('START_PLACE_YEAR_OUT_OF_RANGE')) return route('historical_frame_selector', 'selected_start_historical_frame_mismatch');
  if ([...codes].some((code) => code.includes('TEMPLATE'))) return route('place_template_retriever', 'selected_start_place_template_invalid');
  if (codes.has('START_PLACE_NODE_NOT_FOUND') || codes.has('START_PLACE_PARENT_CHAIN_BROKEN') || codes.has('START_PLACE_ACCESS_EDGE_MISSING')) return route('start_candidate_retriever', 'selected_start_candidate_invalid');
  return route('start_node_selector', 'selected_start_node_reselect_required');
}

function route(returnToStage, repairKind) {
  return sanitizeRepairRoute({ return_to_stage: returnToStage, repair_kind: repairKind });
}

function sanitizeRepairRoute(repairRoute) {
  const returnToStage = ALLOWED_REPAIR_STAGES.includes(repairRoute?.return_to_stage)
    ? repairRoute.return_to_stage
    : 'start_node_selector';
  return {
    return_to_stage: returnToStage,
    repair_kind: repairRoute?.repair_kind ?? 'start_place_audit_failed'
  };
}

function isAllowedRepairRoute(repairRoute) {
  return !!repairRoute && ALLOWED_REPAIR_STAGES.includes(repairRoute.return_to_stage) && isNonEmptyString(repairRoute.repair_kind);
}

function check(status, concerns = [], evidence = []) {
  return { status, pass: status !== 'fail', concerns, evidence };
}

function emptyChecks() {
  return Object.fromEntries(REQUIRED_CHECK_KEYS.map((key) => [key, check('pending', [], [])]));
}

function selectedStartShape(selected = {}) {
  return {
    selected_candidate_id: selected.selected_candidate_id ?? null,
    selected_candidate_place_template_link_id: selected.selected_candidate_place_template_link_id ?? null,
    selected_node_id: selected.selected_node_id ?? null,
    selected_scale_level: selected.selected_scale_level ?? null,
    selected_place_template_id: selected.selected_place_template_id ?? null
  };
}

function requireSchema(concerns, value, schema, code) {
  if (!value || value.schema !== schema) concerns.push(block(code, `Expected schema ${schema}.`));
}

function requireReady(concerns, value, code) {
  if (value?.selection_status !== 'ready') concerns.push(block(code, `Expected selection_status=ready for ${value?.schema ?? 'upstream output'}.`));
}

function block(code, message, extra = {}) {
  return { code, severity: 'hard_block', message, ...extra };
}

function warn(code, message, extra = {}) {
  return { code, severity: 'warning', message, ...extra };
}

function frameFrom(historicalFrame = {}) {
  return {
    region_id: historicalFrame.region?.region_id ?? historicalFrame.region_id ?? historicalFrame.regionId ?? null,
    year: historicalFrame.year?.value ?? historicalFrame.year ?? null,
    season: historicalFrame.calendar?.season ?? historicalFrame.season ?? null,
    clock: historicalFrame.clock ?? {}
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function candidateIdOf(candidate) {
  return candidate?.candidate_id ?? candidate?.id ?? candidate?.start_candidate_id ?? null;
}

function linkIdOf(link) {
  return link?.candidate_place_template_link_id ?? link?.template_link_id ?? link?.link_id ?? link?.id ?? null;
}

function linkCandidateIdOf(link) {
  return link?.candidate_id ?? link?.start_candidate_id ?? link?.selected_candidate_id ?? null;
}

function linkPlaceTemplateIdOf(link) {
  return link?.place_template_id ?? link?.template_id ?? link?.selected_place_template_id ?? null;
}

function knownCandidateNodeIds(candidate = {}) {
  return new Set(candidateNodeIds(candidate));
}

function candidateNodeIds(candidate = {}) {
  return unique([
    candidate?.canonical_node?.node_id,
    candidate?.canonical_node?.id,
    candidate?.node_id,
    candidate?.graph_node_id,
    candidate?.start_node_id,
    candidate?.selected_node_id,
    candidate?.location_node_id,
    candidate?.g4_node_id,
    candidate?.g3_node_id,
    candidate?.g2_node_id,
    candidate?.g1_node_id,
    ...(candidate?.node_chain ? chainIds(candidate.node_chain) : []),
    ...(candidate?.parent_chain ? chainIds(candidate.parent_chain) : [])
  ]);
}

function chainIds(chain = {}) {
  return unique([chain.g1_node_id, chain.g2_node_id, chain.g3_node_id, chain.g4_node_id]);
}

function idOf(row = {}) {
  return row?.id ?? row?.node_id ?? null;
}

function parentIdOf(row = {}) {
  return row?.parent_node_id ?? row?.parent_id ?? null;
}

function firstNumber(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry != null).map(String);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function isRestrictedSeasonClockRow(row = {}) {
  const text = JSON.stringify({
    type: row?.place_kind ?? row?.node_type ?? row?.access_rule ?? row?.limits ?? row?.seasonal_rule ?? row?.risk_level ?? row?.restriction_level ?? null
  }).toLowerCase();
  return ['restricted', 'seasonal', 'night', 'access', 'permission', 'controlled', 'flood', 'winter'].some((needle) => text.includes(needle));
}

function allowsIsolatedStart(row = {}) {
  const value = row?.allow_isolated_start ?? row?.isolated_start_allowed ?? row?.no_access_start_allowed ?? row?.access_rule ?? row?.limits ?? null;
  if (value === true) return true;
  return typeof value === 'string' && /isolated|no-access|no_access|без доступа|изолирован/i.test(value);
}

function isG5Ready(row = {}) {
  return row?.g5_ready === true || row?.g5_readiness === true || row?.g5_readiness?.ready === true || row?.can_materialize_g5 === true;
}

function collectSourceIds(value, seen = new Set()) {
  const ids = [];
  if (value == null) return ids;
  if (typeof value === 'string') return [];
  if (typeof value !== 'object') return ids;
  if (seen.has(value)) return ids;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) ids.push(...collectSourceIds(entry, seen));
    return ids;
  }
  for (const key of ['source_id', 'sourceId']) {
    if (isNonEmptyString(value[key])) ids.push(value[key]);
  }
  for (const key of ['sources', 'source_ids', 'sourceIds']) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      for (const entry of nested) {
        if (isNonEmptyString(entry)) ids.push(entry);
        else ids.push(...collectSourceIds(entry, seen));
      }
    } else if (isNonEmptyString(nested)) {
      ids.push(nested);
    }
  }
  for (const key of ['source_trace', 'evidence']) ids.push(...collectSourceIds(value[key], seen));
  return ids;
}

function unique(values) {
  return [...new Set((values ?? []).filter((value) => value != null && String(value).trim().length > 0).map(String))];
}

function hasHardBlock(audit) {
  return (audit?.concerns ?? []).some((item) => item?.severity === 'hard_block')
    || Object.values(audit?.checks ?? {}).some((item) => item?.status === 'fail');
}

function isMissingRelation(error) {
  const code = error?.code;
  const message = String(error?.message ?? '').toLowerCase();
  return code === '42P01' || message.includes('does not exist') || message.includes('not found') || message.includes('no such table') || message.includes('unsupported sql');
}

function safeClone(value) {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}
