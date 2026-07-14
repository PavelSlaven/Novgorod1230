import { DEFAULT_STAGE9_SELECTION_POLICY, STAGE9_OUTPUT_SCHEMA } from './constants.js';
import { createStage9Gate } from './gate.js';
import { allowedCandidateLinks, allowedCandidates, candidateChain, candidateIdOf, candidateIdOfLink, collectSourceIds, concern, findForbiddenPaths, hasItemSupport, hasNpcSupport, isG5Ready, knownCandidateNodeIds, linkIdOf, nonEmpty, placeTemplateIdOfLink, readAllowedCandidateIds, readAllowedTemplateLinkIds, scaleOfCandidate } from './shared.js';

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

export function validateScalePolicy(concerns, selectedScale, candidate, link, input) {
  const policy = input.selection_policy ?? DEFAULT_STAGE9_SELECTION_POLICY;
  if (selectedScale === 'G1' && policy.allow_g1_fallback !== true) concerns.push(concern('STAGE9_G1_FALLBACK_FORBIDDEN', 'G1 cannot be selected when allow_g1_fallback=false.'));
  if (selectedScale === 'G2' && policy.allow_g2_fallback !== true) concerns.push(concern('STAGE9_G2_FALLBACK_FORBIDDEN', 'G2 cannot be selected when allow_g2_fallback=false.'));
  if (selectedScale === 'G3' && policy.prefer_g4 === true && allowedCandidates(input).some((item) => scaleOfCandidate(item) === 'G4')) concerns.push(concern('STAGE9_G3_SELECTED_WHEN_VALID_G4_EXISTS', 'G3 cannot be selected when prefer_g4=true and an allowed G4 candidate exists.'));
  if (policy.prefer_g5_ready === true && allowedCandidateLinks(input).some(({ candidate: c, link: l }) => isG5Ready(c) || isG5Ready(l)) && !(isG5Ready(candidate) || isG5Ready(link))) concerns.push(concern('STAGE9_NON_G5_READY_SELECTED_WHEN_G5_READY_EXISTS', 'Non-G5-ready candidate cannot be selected when prefer_g5_ready=true and an allowed G5-ready candidate/link exists.'));
}

export function validateNodeChain(concerns, chain, selectedScale, candidate, link) {
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

export function validateNpcItemSupport(concerns, evidence, output, input, placeTemplateId, linkId, candidateId) {
  const npcSupported = hasNpcSupport(input.npc_candidate_set, placeTemplateId, linkId, candidateId);
  const itemSupported = hasItemSupport(input.item_profile_candidate_set, placeTemplateId, linkId);
  if (input.selection_policy?.require_npc_candidate_support === true && !npcSupported) concerns.push(concern('STAGE9_REQUIRED_NPC_SUPPORT_MISSING', 'selection_policy requires NPC candidate support for selected start.'));
  if (input.selection_policy?.require_item_profile_support === true && !itemSupported) concerns.push(concern('STAGE9_REQUIRED_ITEM_PROFILE_SUPPORT_MISSING', 'selection_policy requires item profile support for selected start.'));
  if (!npcSupported) evidence.push({ kind: 'stage9_warning', code: 'STAGE9_NPC_SUPPORT_NOT_REQUIRED_BUT_WEAK' });
  if (!itemSupported) evidence.push({ kind: 'stage9_warning', code: 'STAGE9_ITEM_SUPPORT_NOT_REQUIRED_BUT_WEAK' });
}

export async function verifyStage9SourceRecords({ output, candidate, link, deps }) {
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
