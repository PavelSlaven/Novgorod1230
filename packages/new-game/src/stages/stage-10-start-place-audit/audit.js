import { chooseRepairRoute, validateAccessCompatibility, validateClockCompatibility, validateDownstreamEntityLeak, validateG5Readiness, validateNodeChain, validatePlayerRequestCompatibility, validateRegionCompatibility, validateSeasonCompatibility, validateSocialStatusCompatibility, validateSupport, validateYearCompatibility } from './checks.js';
import { REQUIRED_CHECK_KEYS, STAGE10_OUTPUT_SCHEMA } from './constants.js';
import { checkRequiredRelations, queryAccessEdges, queryGraphNodes, queryPlaceTemplate, queryRegionPlaceTemplate, validateSources } from './database.js';
import { normalizeStage10AuditPolicy, validateStage10StartPlaceAuditInput } from './input.js';
import { block, candidateIdOf, candidateNodeIds, chainIds, check, emptyChecks, frameFrom, isAllowedRepairRoute, knownCandidateNodeIds, linkCandidateIdOf, linkIdOf, linkPlaceTemplateIdOf, route, sanitizeRepairRoute, selectedStartShape, unique } from './shared.js';

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

export function finalizeAudit({ input, selectedStart, checks, concerns, evidence, repairRoute, mustPreserve, mustResolveLater }) {
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

export function emptyAudit(input, repairRoute) {
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
