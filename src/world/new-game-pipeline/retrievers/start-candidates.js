import {
  frameFromHistoricalFrame,
  getAllowedStatuses,
  getRetrieverQueryable,
  groupCount,
  makeAudit,
  sourceTrace
} from './common.js';

const START_SCALES = Object.freeze(['G1', 'G2', 'G3', 'G4']);
const SCALE_ORDER = Object.freeze(['G1', 'G2', 'G3', 'G4']);
const REJECTED_STATUSES = Object.freeze(['rejected', 'conflict']);
const SELECTION_STATUSES = Object.freeze(['ready', 'empty', 'blocked', 'requires_repair']);

const DEFAULT_CANDIDATE_POLICY = Object.freeze({
  target_candidate_count_min: 12,
  target_candidate_count_max: 80,
  include_g1: true,
  include_g2: true,
  include_g3: true,
  include_g4: true,
  prefer_g4_for_start: true,
  allow_g3_if_no_g4: true,
  allow_g2_if_no_g3: false,
  allow_g1_only_as_context: true,
  require_full_parent_chain: true,
  require_at_least_one_access_edge: true,
  require_place_template_match: true,
  require_region_rule_match: true,
  require_time_compatibility: true,
  require_season_compatibility: true,
  require_sources: true,
  reject_rejected_or_conflict_records: true,
  allow_usable_with_caution: true,
  allow_unverified_g5_readiness: true,
  max_candidate_pool_size: null
});

export async function retrieveStartCandidates(input = {}, deps = {}) {
  const requestId = input.request_id ?? input.requestId ?? null;
  const policy = normalizeCandidatePolicy(input.candidate_policy);
  const frame = frameFromHistoricalFrame(input.historical_frame);
  const inputConcerns = validateStageInput(input, frame);

  if (!frame.region_id) {
    return emptyCandidateSet({
      requestId,
      frame,
      status: 'blocked',
      concerns: inputConcerns.length > 0 ? inputConcerns : [concern('START_CANDIDATE_REGION_MISSING', 'historical_frame.region.region_id is required.')],
      evidence: [{ kind: 'start_candidate_input_gate', pass: false }]
    });
  }

  if (deps.queryable == null) {
    const error = new Error('START_CANDIDATE_QUERYABLE_MISSING');
    error.code = 'START_CANDIDATE_QUERYABLE_MISSING';
    throw error;
  }

  const db = getRetrieverQueryable(deps);
  const statuses = getAllowedStatuses(policy);
  const includedScales = includedScaleLevels(policy);
  const poolLimit = candidatePoolLimit(policy);

  const initialNodes = await queryCandidateNodes(db, frame.region_id, statuses, includedScales, poolLimit);
  const ancestorNodes = await queryAncestorNodes(db, initialNodes, statuses);
  const allNodes = uniqueById([...initialNodes, ...ancestorNodes]);
  const nodeById = new Map(allNodes.map((node) => [node.id, node]));
  const candidateNodeIds = new Set(initialNodes.map((node) => node.id));

  const [edges, ruleIndex] = await Promise.all([
    queryEdgesForNodeIds(db, allNodes.map((node) => node.id), statuses),
    queryRegionalRuleIndex(db, frame.region_id, statuses, input.regional_context_package)
  ]);

  const edgesByNode = indexEdgesByNode(edges);
  const routeTemplatesById = new Map(ruleIndex.route_templates.map((row) => [row.id, row]));
  const rawCandidates = [];
  const rejectedCandidates = [];

  for (const node of initialNodes) {
    if (!candidateNodeIds.has(node.id)) continue;
    const evaluation = evaluateCandidate({
      node,
      nodeById,
      edgesByNode,
      routeTemplatesById,
      frame,
      policy,
      ruleIndex,
      normalizedRequest: input.normalized_request,
      regionalContextPackage: input.regional_context_package
    });

    if (evaluation.candidate_status === 'rejected') {
      rejectedCandidates.push(toRejectedCandidate(evaluation));
    } else {
      rawCandidates.push(evaluation);
    }
  }

  const startableCandidateIds = chooseStartableCandidateIds(rawCandidates, policy);
  const candidates = rawCandidates
    .map((candidate) => finalizeCandidateStartUse(candidate, startableCandidateIds))
    .filter((candidate) => candidate.candidate_status !== 'rejected')
    .sort(compareCandidates)
    .slice(0, policy.target_candidate_count_max);

  const allowedStartCandidates = candidates.filter((candidate) => candidate.start_use?.can_start_here === true);
  const scaleCounts = groupCount(candidates, 'scale_level');
  const fallbackScale = fallbackScaleUsed(allowedStartCandidates, policy);
  const outputConcerns = [...inputConcerns];

  if (initialNodes.length === 0) {
    outputConcerns.push(concern('NO_ALLOWED_START_CANDIDATES', 'No G1-G4 graph nodes were found for the selected region and policy.'));
  } else if (allowedStartCandidates.length === 0) {
    outputConcerns.push(concern('NO_ALLOWED_START_CANDIDATES', 'No candidate passed the hard startability gates.'));
  }

  const selectionStatus = allowedStartCandidates.length > 0
    ? 'ready'
    : initialNodes.length > 0
      ? 'blocked'
      : 'empty';

  return {
    version: 1,
    schema: 'start_candidate_set',
    request_id: requestId,
    selection_status: selectionStatus,
    frame,
    candidate_summary: {
      total_candidates: candidates.length,
      g1_count: scaleCounts.G1 ?? 0,
      g2_count: scaleCounts.G2 ?? 0,
      g3_count: scaleCounts.G3 ?? 0,
      g4_count: scaleCounts.G4 ?? 0,
      preferred_scale: 'G4',
      fallback_scale_used: fallbackScale,
      startable_candidate_count: allowedStartCandidates.length,
      rejected_candidate_count: rejectedCandidates.length
    },
    candidates,
    rejected_candidates: rejectedCandidates,
    candidate_groups: buildCandidateGroups(candidates),
    downstream_constraints: {
      must_choose_from_candidate_ids: allowedStartCandidates.map((candidate) => candidate.candidate_id),
      must_preserve: [
        'candidate_id',
        'node_chain',
        'canonical_node.node_id',
        'canonical_node.scale_level',
        'template_links',
        'compatibility',
        'access',
        'score',
        'source_trace'
      ],
      must_not_create_yet: ['G5', 'NPC', 'item', 'narrator_prose', 'selected_start_node_id', 'visible_scene', 'intro_prose'],
      must_resolve_later: ['final_start_node', 'final_place_template', 'G5_scene_anchors', 'NPC_placement', 'item_placement']
    },
    source_trace: [
      ...sourceTrace('graph_nodes', allNodes),
      ...sourceTrace('graph_edges', edges),
      ...sourceTrace('region_place_templates', ruleIndex.place_template_rows),
      ...sourceTrace('region_landscape_templates', ruleIndex.landscape_rows),
      ...sourceTrace('region_water_body_templates', ruleIndex.water_rows),
      ...sourceTrace('region_land_use_templates', ruleIndex.land_use_rows),
      ...sourceTrace('route_templates', ruleIndex.route_templates)
    ],
    audit: makeAudit(outputConcerns.length === 0 && selectionStatus === 'ready', outputConcerns, [
      { kind: 'world_base_graph_read', scales: includedScales, node_count: initialNodes.length, edge_count: edges.length },
      { kind: 'start_candidate_hard_filtering', rejected_candidate_count: rejectedCandidates.length },
      { kind: 'start_candidate_policy', policy }
    ])
  };
}

function validateStageInput(input, frame) {
  const concerns = [];
  if (input.normalized_request && input.normalized_request.schema && input.normalized_request.schema !== 'new_game_normalized_request') {
    concerns.push(concern('START_CANDIDATE_NORMALIZED_REQUEST_SCHEMA_MISMATCH', 'normalized_request.schema must be new_game_normalized_request.'));
  }
  if (input.historical_frame?.schema && input.historical_frame.schema !== 'historical_frame') {
    concerns.push(concern('START_CANDIDATE_HISTORICAL_FRAME_SCHEMA_MISMATCH', 'historical_frame.schema must be historical_frame.'));
  }
  if (!frame.region_id) concerns.push(concern('START_CANDIDATE_REGION_MISSING', 'historical_frame.region.region_id is required.'));
  if (frame.year == null) concerns.push(concern('START_CANDIDATE_YEAR_MISSING', 'historical_frame.year.value is required.'));
  if (!frame.season) concerns.push(concern('START_CANDIDATE_SEASON_MISSING', 'historical_frame.calendar.season is required.'));
  if (!frame.clock?.time_of_day) concerns.push(concern('START_CANDIDATE_TIME_OF_DAY_MISSING', 'historical_frame.clock.time_of_day is required.'));
  if (!frame.clock?.light_profile) concerns.push(concern('START_CANDIDATE_LIGHT_PROFILE_MISSING', 'historical_frame.clock.light_profile is required.'));
  if (input.regional_context_package?.schema && input.regional_context_package.schema !== 'regional_context_package') {
    concerns.push(concern('START_CANDIDATE_REGIONAL_CONTEXT_SCHEMA_MISMATCH', 'regional_context_package.schema must be regional_context_package.'));
  }
  if (input.historical_frame?.audit && input.historical_frame.audit.pass !== true) {
    concerns.push(concern('START_CANDIDATE_HISTORICAL_FRAME_AUDIT_FAILED', 'historical_frame.audit.pass must be true before candidate retrieval.'));
  }
  if (input.regional_context_package?.audit && input.regional_context_package.audit.pass !== true) {
    concerns.push(concern('START_CANDIDATE_REGIONAL_CONTEXT_AUDIT_FAILED', 'regional_context_package.audit.pass must be true before candidate retrieval.'));
  }
  return concerns;
}

function normalizeCandidatePolicy(policy = {}) {
  const merged = { ...DEFAULT_CANDIDATE_POLICY, ...(policy ?? {}) };
  merged.target_candidate_count_min = clampInteger(merged.target_candidate_count_min, 1, 500, 12);
  merged.target_candidate_count_max = clampInteger(merged.target_candidate_count_max, merged.target_candidate_count_min, 500, 80);
  return merged;
}

function includedScaleLevels(policy) {
  return START_SCALES.filter((scale) => policy[`include_${scale.toLowerCase()}`] !== false);
}

function candidatePoolLimit(policy) {
  const explicit = Number(policy.max_candidate_pool_size);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(explicit, policy.target_candidate_count_max);
  return Math.max(policy.target_candidate_count_max * 6, policy.target_candidate_count_min * 4, 120);
}

async function queryCandidateNodes(db, regionId, statuses, scales, limit) {
  const { rows } = await db.query(`
    SELECT id, slug, title, node_type, scale_level, parent_node_id, region_id, place_id,
           primary_landscape_template_id, primary_water_body_template_id,
           land_use_template_ids, place_template_id,
           terrain_profile, water_profile, road_profile, settlement_density,
           dominant_content, known_landmarks, canonical_corridors,
           is_known_to_player_default, is_known_to_character_default,
           historical_status, summary, status, confidence, sources, game_use, limits, audit_notes
    FROM world_base.graph_nodes
    WHERE region_id = $1
      AND scale_level = ANY($2::text[])
      AND status = ANY($3::text[])
    ORDER BY CASE scale_level WHEN 'G4' THEN 4 WHEN 'G3' THEN 3 WHEN 'G2' THEN 2 WHEN 'G1' THEN 1 ELSE 0 END DESC,
             title, id
    LIMIT $4
  `, [regionId, scales, statuses, limit]);
  return rows;
}

async function queryAncestorNodes(db, nodes, statuses) {
  const ancestors = [];
  const fetched = new Set(nodes.map((node) => node.id));
  let parentIds = unique(nodes.map((node) => node.parent_node_id).filter(Boolean).filter((id) => !fetched.has(id)));

  while (parentIds.length > 0) {
    const { rows } = await db.query(`
      SELECT id, slug, title, node_type, scale_level, parent_node_id, region_id, place_id,
             primary_landscape_template_id, primary_water_body_template_id,
             land_use_template_ids, place_template_id,
             terrain_profile, water_profile, road_profile, settlement_density,
             dominant_content, known_landmarks, canonical_corridors,
             is_known_to_player_default, is_known_to_character_default,
             historical_status, summary, status, confidence, sources, game_use, limits, audit_notes
      FROM world_base.graph_nodes
      WHERE id = ANY($1::text[])
        AND status = ANY($2::text[])
    `, [parentIds, statuses]);

    if (rows.length === 0) break;
    ancestors.push(...rows);
    for (const row of rows) fetched.add(row.id);
    parentIds = unique(rows.map((row) => row.parent_node_id).filter(Boolean).filter((id) => !fetched.has(id)));
  }

  return ancestors;
}

async function queryEdgesForNodeIds(db, nodeIds, statuses) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return [];
  const { rows } = await db.query(`
    SELECT id, from_node_id, to_node_id, reverse_edge_id, scale_level, edge_type,
           base_gu, base_distance_km, base_time_minutes, base_time_hours, base_time_days,
           route_template_id, landscape_template_id, water_body_template_id,
           terrain_type, route_surface, seasonal_rule, access_rule, risk_level,
           known_to_commoners, known_to_traders, known_to_elites, known_to_clergy,
           known_to_character_default, requires_guide, requires_boat, requires_horse,
           requires_sled, requires_permission, requires_orientation_check,
           orientation_difficulty, movement_risk_profile, failure_consequences,
           historical_status, status, confidence, sources, audit_notes
    FROM world_base.graph_edges
    WHERE status = ANY($2::text[])
      AND (from_node_id = ANY($1::text[]) OR to_node_id = ANY($1::text[]))
  `, [nodeIds, statuses]);
  return rows;
}

async function queryRegionalRuleIndex(db, regionId, statuses, regionalContextPackage = {}) {
  const [placeTemplateRows, landscapeRows, waterRows, landUseRows, routeTemplates] = await Promise.all([
    optionalMany(db, `
      SELECT rpt.id AS region_place_template_id, rpt.region_id, rpt.place_template_id,
             rpt.allowed_scale_levels, rpt.allowed_node_types, rpt.generation_weight,
             rpt.status, rpt.confidence, rpt.sources,
             pt.title, pt.place_kind, pt.default_node_type, pt.typical_scale_level,
             pt.compatible_landscape_template_ids, pt.compatible_water_body_template_ids,
             pt.compatible_route_template_ids, pt.compatible_land_use_template_ids,
             pt.game_use, pt.limits
      FROM world_base.region_place_templates rpt
      JOIN world_base.place_templates pt ON pt.id = rpt.place_template_id
      WHERE rpt.region_id = $1
        AND rpt.is_allowed = true
        AND rpt.status = ANY($2::text[])
        AND pt.status = ANY($2::text[])
    `, [regionId, statuses]),
    optionalMany(db, `
      SELECT id, region_id, landscape_template_id, allowed_scale_levels, allowed_node_types,
             regional_limits, status, confidence, sources
      FROM world_base.region_landscape_templates
      WHERE region_id = $1
        AND is_allowed = true
        AND status = ANY($2::text[])
    `, [regionId, statuses]),
    optionalMany(db, `
      SELECT id, region_id, water_body_template_id, allowed_scale_levels, allowed_node_types,
             regional_limits, status, confidence, sources
      FROM world_base.region_water_body_templates
      WHERE region_id = $1
        AND is_allowed = true
        AND status = ANY($2::text[])
    `, [regionId, statuses]),
    optionalMany(db, `
      SELECT id, region_id, land_use_template_id, allowed_scale_levels, allowed_node_types,
             regional_limits, status, confidence, sources
      FROM world_base.region_land_use_templates
      WHERE region_id = $1
        AND is_allowed = true
        AND status = ANY($2::text[])
    `, [regionId, statuses]),
    optionalMany(db, `
      SELECT id, slug, title, route_kind, default_edge_type, seasonal_availability,
             default_access_rule, default_risk_level, status, confidence, sources
      FROM world_base.route_templates
      WHERE status = ANY($1::text[])
    `, [statuses])
  ]);

  const contextPlaceTemplateIds = asArray(regionalContextPackage?.downstream_context_index?.place_template_ids);
  const placeTemplateIds = new Set([
    ...placeTemplateRows.map((row) => row.place_template_id).filter(Boolean),
    ...contextPlaceTemplateIds.filter(Boolean)
  ]);

  return {
    place_template_rows: placeTemplateRows,
    place_template_ids: placeTemplateIds,
    place_template_by_id: new Map(placeTemplateRows.map((row) => [row.place_template_id, row])),
    landscape_rows: landscapeRows,
    landscape_template_ids: new Set(landscapeRows.map((row) => row.landscape_template_id).filter(Boolean)),
    water_rows: waterRows,
    water_body_template_ids: new Set(waterRows.map((row) => row.water_body_template_id).filter(Boolean)),
    land_use_rows: landUseRows,
    land_use_template_ids: new Set(landUseRows.map((row) => row.land_use_template_id).filter(Boolean)),
    route_templates: routeTemplates,
    route_template_ids: new Set(routeTemplates.map((row) => row.id).filter(Boolean)),
    g5_ready_index: buildG5ReadinessIndex(regionalContextPackage)
  };
}

async function optionalMany(db, sql, params) {
  try {
    const { rows } = await db.query(sql, params);
    return rows ?? [];
  } catch (error) {
    if (isOptionalRelationError(error)) return [];
    throw error;
  }
}

function isOptionalRelationError(error) {
  const code = error?.code;
  const message = String(error?.message ?? '').toLowerCase();
  return code === '42P01' || code === '42703' || message.includes('does not exist') || message.includes('missing from-clause') || message.includes('unsupported sql');
}

function evaluateCandidate({ node, nodeById, edgesByNode, routeTemplatesById, frame, policy, ruleIndex, normalizedRequest }) {
  const candidateId = `start_candidate_${safeId(node.id)}`;
  const nodeChain = buildNodeChain(node, nodeById);
  const canonicalNode = {
    node_id: node.id,
    scale_level: node.scale_level,
    node_type: node.node_type,
    title: node.title,
    slug: node.slug ?? null,
    parent_node_id: node.parent_node_id ?? null,
    region_id: node.region_id
  };
  const nearbyEdges = edgesByNode.get(node.id) ?? [];
  const entryEdges = nearbyEdges.filter((edge) => edge.to_node_id === node.id).map((edge) => edge.id);
  const exitEdges = nearbyEdges.filter((edge) => edge.from_node_id === node.id).map((edge) => edge.id);
  const routeTemplateIdsNearby = unique(nearbyEdges.map((edge) => edge.route_template_id).filter(Boolean));
  const inheritedPlaceTemplateId = resolvePlaceTemplateId(node, nodeChain, nodeById);
  const inheritedLandscapeTemplateId = resolveInheritedField(node, nodeChain, nodeById, 'primary_landscape_template_id');
  const inheritedWaterTemplateId = resolveInheritedField(node, nodeChain, nodeById, 'primary_water_body_template_id');
  const landUseTemplateIds = unique([
    ...asArray(node.land_use_template_ids),
    ...asArray(resolveInheritedField(node, nodeChain, nodeById, 'land_use_template_ids'))
  ]);

  const access = {
    has_entry_edge: entryEdges.length > 0,
    has_exit_edge: exitEdges.length > 0,
    entry_edge_ids: entryEdges,
    exit_edge_ids: exitEdges,
    known_by_default: parseBooleanish(node.is_known_to_character_default) || nearbyEdges.some((edge) => parseBooleanish(edge.known_to_character_default)),
    access_notes: accessNotes(nearbyEdges),
    warnings: []
  };

  const contextTags = buildContextTags(node, nearbyEdges, inheritedPlaceTemplateId, routeTemplatesById);
  const compatibility = {
    region_match: node.region_id === frame.region_id,
    year_match: true,
    season_match: checkSeasonCompatibility(frame.season, node, nearbyEdges, routeTemplatesById),
    clock_match: checkClockCompatibility(frame.clock, node, nearbyEdges),
    place_rule_match: checkPlaceRuleMatch(node, inheritedPlaceTemplateId, ruleIndex),
    access_rule_match: checkAccessRuleMatch(nearbyEdges),
    route_rule_match: checkRouteRuleMatch(routeTemplateIdsNearby, ruleIndex),
    player_request_match: matchPlayerRequest(normalizedRequest, node, inheritedPlaceTemplateId, contextTags),
    g5_ready: checkG5Readiness(node, inheritedPlaceTemplateId, ruleIndex, policy)
  };

  const source = buildCandidateSourceTrace(node, nearbyEdges, ruleIndex, inheritedPlaceTemplateId);
  const hardRejections = collectHardRejections({
    node,
    nodeChain,
    source,
    inheritedPlaceTemplateId,
    inheritedLandscapeTemplateId,
    inheritedWaterTemplateId,
    landUseTemplateIds,
    routeTemplateIdsNearby,
    nearbyEdges,
    compatibility,
    policy,
    ruleIndex,
    normalizedRequest
  });

  const score = scoreCandidate({
    node,
    nodeChain,
    nearbyEdges,
    source,
    compatibility,
    inheritedPlaceTemplateId,
    policy
  });
  const candidateStatus = hardRejections.length > 0 ? 'rejected' : score.value >= 50 ? 'allowed' : 'weak';
  const whyAllowed = candidateStatus === 'rejected' ? [] : buildWhyAllowed({ node, nodeChain, nearbyEdges, compatibility, inheritedPlaceTemplateId });

  if (!compatibility.g5_ready) access.warnings.push('G5 readiness is not confirmed for this G4 candidate.');
  if (score.score_penalties.length > 0) access.warnings.push(...score.score_penalties);

  return {
    candidate_id: candidateId,
    candidate_status: candidateStatus,
    scale_level: node.scale_level,
    node_id: node.id,
    title: node.title,
    node_type: node.node_type,
    parent_node_id: node.parent_node_id ?? null,
    parent_chain: chainToLegacyArray(nodeChain, nodeById),
    place_template_id: inheritedPlaceTemplateId,
    landscape_template_id: inheritedLandscapeTemplateId,
    land_use_template_ids: landUseTemplateIds,
    access_edge_ids: unique([...entryEdges, ...exitEdges]),
    source_ref: { table: 'world_base.graph_nodes', id: node.id },
    score,
    node_chain: nodeChain,
    canonical_node: canonicalNode,
    context_tags: contextTags,
    template_links: {
      place_template_id: inheritedPlaceTemplateId,
      landscape_template_id: inheritedLandscapeTemplateId,
      water_body_template_id: inheritedWaterTemplateId,
      land_use_template_ids: landUseTemplateIds,
      route_template_ids_nearby: routeTemplateIdsNearby,
      g5_template_group_ids_possible: g5TemplateGroupIds(node, inheritedPlaceTemplateId, ruleIndex)
    },
    compatibility,
    access,
    start_use: {
      can_start_here: false,
      start_risk_level: contextTags.risk_level,
      requires_later_resolution: candidateStatus === 'weak' ? ['candidate_has_weak_score_or_incomplete_context'] : [],
      why_candidate_is_allowed: whyAllowed
    },
    why_allowed: whyAllowed,
    why_rejected: hardRejections,
    source_trace: source
  };
}

function collectHardRejections({
  node,
  nodeChain,
  source,
  inheritedPlaceTemplateId,
  inheritedLandscapeTemplateId,
  inheritedWaterTemplateId,
  landUseTemplateIds,
  routeTemplateIdsNearby,
  nearbyEdges,
  compatibility,
  policy,
  ruleIndex,
  normalizedRequest
}) {
  const rejections = [];
  if (!node?.id) rejections.push(rejection('START_CANDIDATE_NODE_NOT_FOUND', 'Candidate has no canonical graph node id.'));
  if (node.region_id && compatibility.region_match !== true) rejections.push(rejection('START_CANDIDATE_REGION_MISMATCH', 'Candidate region does not match historical_frame region.'));
  if (policy.reject_rejected_or_conflict_records && REJECTED_STATUSES.includes(node.status)) rejections.push(rejection('START_CANDIDATE_REJECTED_RECORD_USED', `Candidate node status is ${node.status}.`));
  if (policy.require_full_parent_chain && !hasRequiredParentChain(node.scale_level, nodeChain)) rejections.push(rejection('START_CANDIDATE_BROKEN_PARENT_CHAIN', `Candidate ${node.id} has incomplete ${node.scale_level} parent chain.`));
  if (policy.require_sources && source.length === 0) rejections.push(rejection('START_CANDIDATE_SOURCE_MISSING', 'Candidate has no source trace.'));
  if (policy.require_sources && source.every((item) => asArray(item.source_ids).length === 0)) rejections.push(rejection('START_CANDIDATE_SOURCE_MISSING', 'Candidate source trace has no source ids.'));
  if (policy.require_place_template_match && !inheritedPlaceTemplateId && ['G3', 'G4'].includes(node.scale_level)) rejections.push(rejection('START_CANDIDATE_PLACE_TEMPLATE_NOT_ALLOWED', 'G3/G4 candidate has no place_template_id and cannot inherit one.'));
  if (policy.require_place_template_match && inheritedPlaceTemplateId && ruleIndex.place_template_ids.size > 0 && !ruleIndex.place_template_ids.has(inheritedPlaceTemplateId)) rejections.push(rejection('START_CANDIDATE_PLACE_TEMPLATE_NOT_ALLOWED', `place_template_id ${inheritedPlaceTemplateId} is not allowed in the region.`));
  if (policy.require_region_rule_match && inheritedLandscapeTemplateId && ruleIndex.landscape_template_ids.size > 0 && !ruleIndex.landscape_template_ids.has(inheritedLandscapeTemplateId)) rejections.push(rejection('START_CANDIDATE_LANDSCAPE_NOT_ALLOWED', `landscape_template_id ${inheritedLandscapeTemplateId} is not allowed in the region.`));
  if (policy.require_region_rule_match && inheritedWaterTemplateId && ruleIndex.water_body_template_ids.size > 0 && !ruleIndex.water_body_template_ids.has(inheritedWaterTemplateId)) rejections.push(rejection('START_CANDIDATE_WATER_TEMPLATE_NOT_ALLOWED', `water_body_template_id ${inheritedWaterTemplateId} is not allowed in the region.`));
  if (policy.require_region_rule_match && ruleIndex.land_use_template_ids.size > 0) {
    for (const landUseId of landUseTemplateIds) {
      if (!ruleIndex.land_use_template_ids.has(landUseId)) rejections.push(rejection('START_CANDIDATE_LAND_USE_NOT_ALLOWED', `land_use_template_id ${landUseId} is not allowed in the region.`));
    }
  }
  if (ruleIndex.route_template_ids.size > 0) {
    for (const routeTemplateId of routeTemplateIdsNearby) {
      if (!ruleIndex.route_template_ids.has(routeTemplateId)) rejections.push(rejection('START_CANDIDATE_ROUTE_TEMPLATE_NOT_ALLOWED', `route_template_id ${routeTemplateId} is not approved.`));
    }
  }
  if (policy.require_at_least_one_access_edge && nearbyEdges.length === 0 && node.scale_level !== 'G1') rejections.push(rejection('START_CANDIDATE_NO_ACCESS_EDGE', 'Candidate has no entry or exit graph edge.'));
  if (policy.require_time_compatibility && compatibility.clock_match !== true) rejections.push(rejection('START_CANDIDATE_CLOCK_CONFLICT', 'Candidate access rules conflict with historical_frame.clock.'));
  if (policy.require_season_compatibility && compatibility.season_match !== true) rejections.push(rejection('START_CANDIDATE_SEASON_CONFLICT', 'Candidate seasonal rules conflict with historical_frame.calendar.season.'));
  if (compatibility.player_request_match === 'conflict') rejections.push(rejection('START_CANDIDATE_PLAYER_HARD_CONSTRAINT_CONFLICT', 'Candidate conflicts with normalized_request hard constraints or forbidden content.'));
  if (node.scale_level === 'G4' && policy.prefer_g4_for_start && compatibility.g5_ready !== true && policy.allow_unverified_g5_readiness !== true) rejections.push(rejection('START_CANDIDATE_G5_NOT_READY', 'G5 materialization readiness is not confirmed for this G4 candidate.'));
  return rejections;
}

function scoreCandidate({ node, nodeChain, nearbyEdges, source, compatibility, inheritedPlaceTemplateId }) {
  const reasons = [];
  const penalties = [];
  let value = 40;

  if (compatibility.player_request_match === 'exact') { value += 15; reasons.push('Player request matches candidate metadata exactly.'); }
  else if (compatibility.player_request_match === 'partial') { value += 10; reasons.push('Player request partially matches candidate metadata.'); }
  else if (compatibility.player_request_match === 'neutral') { value += 5; reasons.push('Player request does not constrain the start place.'); }
  else if (compatibility.player_request_match === 'weak') { value -= 5; penalties.push('Candidate weakly matches player request.'); }

  if (hasRequiredParentChain(node.scale_level, nodeChain)) { value += 15; reasons.push('Candidate has required G1-G4 parent chain for its scale.'); }
  else { value -= 20; penalties.push('Candidate has incomplete parent chain.'); }

  if (nearbyEdges.length > 0) { value += 15; reasons.push('Candidate has valid access edges.'); }
  else if (node.scale_level !== 'G1') { value -= 20; penalties.push('Candidate has no access edge.'); }

  if (inheritedPlaceTemplateId || ['G1', 'G2'].includes(node.scale_level)) { value += 10; reasons.push('Candidate has compatible or non-required place template context.'); }
  else { value -= 10; penalties.push('Candidate has no place template.'); }

  if (compatibility.season_match) { value += 5; reasons.push('Candidate matches selected season.'); }
  else { value -= 15; penalties.push('Candidate conflicts with selected season.'); }

  if (compatibility.clock_match) { value += 5; reasons.push('Candidate matches selected clock/light context.'); }
  else { value -= 15; penalties.push('Candidate conflicts with selected clock/light context.'); }

  if (node.scale_level === 'G4') {
    if (compatibility.g5_ready) { value += 10; reasons.push('G5 materialization rules are available or allowed for later resolution.'); }
    else { value -= 20; penalties.push('G5 readiness is missing.'); }
  }

  if (source.every((item) => item.status === 'usable_with_caution')) { value -= 5; penalties.push('Candidate relies only on usable_with_caution sources.'); }
  if (asArray(node.sources).length === 0) { value -= 5; penalties.push('Candidate node has no source ids.'); }

  value = Math.max(0, Math.min(100, value));
  return { value, band: scoreBand(value), score_reasons: reasons, score_penalties: penalties };
}

function chooseStartableCandidateIds(candidates, policy) {
  const valid = candidates.filter((candidate) => candidate.candidate_status === 'allowed' || candidate.candidate_status === 'weak');
  const g4 = valid.filter((candidate) => candidate.scale_level === 'G4');
  if (policy.prefer_g4_for_start && g4.length > 0) return new Set(g4.map((candidate) => candidate.candidate_id));

  const g3 = valid.filter((candidate) => candidate.scale_level === 'G3');
  if ((policy.allow_g3_if_no_g4 || !policy.prefer_g4_for_start) && g3.length > 0) return new Set(g3.map((candidate) => candidate.candidate_id));

  const g2 = valid.filter((candidate) => candidate.scale_level === 'G2');
  if (policy.allow_g2_if_no_g3 && g2.length > 0) return new Set(g2.map((candidate) => candidate.candidate_id));

  const g1 = valid.filter((candidate) => candidate.scale_level === 'G1');
  if (!policy.allow_g1_only_as_context && g1.length > 0) return new Set(g1.map((candidate) => candidate.candidate_id));

  return new Set();
}

function finalizeCandidateStartUse(candidate, startableCandidateIds) {
  const canStart = startableCandidateIds.has(candidate.candidate_id);
  return {
    ...candidate,
    candidate_status: canStart && candidate.candidate_status === 'weak' ? 'weak' : candidate.candidate_status,
    start_use: {
      ...candidate.start_use,
      can_start_here: canStart,
      requires_later_resolution: canStart
        ? candidate.start_use.requires_later_resolution
        : unique([...candidate.start_use.requires_later_resolution, 'not_in_current_policy_startable_scale']),
      why_candidate_is_allowed: canStart
        ? candidate.start_use.why_candidate_is_allowed
        : unique([...candidate.start_use.why_candidate_is_allowed, 'Candidate is retained as context/fallback, but current policy does not allow choosing it as the exact start.'])
    }
  };
}

function fallbackScaleUsed(startableCandidates, policy) {
  if (startableCandidates.length === 0) return null;
  const scales = new Set(startableCandidates.map((candidate) => candidate.scale_level));
  if (policy.prefer_g4_for_start && !scales.has('G4')) return ['G3', 'G2', 'G1'].find((scale) => scales.has(scale)) ?? null;
  return null;
}

function buildNodeChain(node, nodeById) {
  const chain = { g1_node_id: null, g2_node_id: null, g3_node_id: null, g4_node_id: null };
  let current = node;
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const key = scaleKey(current.scale_level);
    if (key) chain[key] = current.id;
    current = current.parent_node_id ? nodeById.get(current.parent_node_id) : null;
  }
  return chain;
}


function chainToLegacyArray(nodeChain, nodeById) {
  return ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']
    .map((key) => nodeById.get(nodeChain[key]))
    .filter(Boolean)
    .map((node) => ({ node_id: node.id, scale_level: node.scale_level, node_type: node.node_type, title: node.title }));
}

function hasRequiredParentChain(scaleLevel, nodeChain) {
  if (scaleLevel === 'G1') return Boolean(nodeChain.g1_node_id);
  if (scaleLevel === 'G2') return Boolean(nodeChain.g1_node_id && nodeChain.g2_node_id);
  if (scaleLevel === 'G3') return Boolean(nodeChain.g1_node_id && nodeChain.g2_node_id && nodeChain.g3_node_id);
  if (scaleLevel === 'G4') return Boolean(nodeChain.g1_node_id && nodeChain.g2_node_id && nodeChain.g3_node_id && nodeChain.g4_node_id);
  return false;
}

function resolvePlaceTemplateId(node, nodeChain, nodeById) {
  if (node.place_template_id) return node.place_template_id;
  for (const key of ['g3_node_id', 'g2_node_id', 'g1_node_id']) {
    const parent = nodeById.get(nodeChain[key]);
    if (parent?.place_template_id) return parent.place_template_id;
  }
  return null;
}

function resolveInheritedField(node, nodeChain, nodeById, field) {
  if (node[field] != null && (!Array.isArray(node[field]) || node[field].length > 0)) return node[field];
  for (const key of ['g3_node_id', 'g2_node_id', 'g1_node_id']) {
    const parent = nodeById.get(nodeChain[key]);
    if (parent?.[field] != null && (!Array.isArray(parent[field]) || parent[field].length > 0)) return parent[field];
  }
  return null;
}

function checkPlaceRuleMatch(node, placeTemplateId, ruleIndex) {
  if (!placeTemplateId) return ['G1', 'G2'].includes(node.scale_level);
  if (ruleIndex.place_template_ids.size > 0 && !ruleIndex.place_template_ids.has(placeTemplateId)) return false;
  const row = ruleIndex.place_template_by_id.get(placeTemplateId);
  if (!row) return true;
  if (asArray(row.allowed_scale_levels).length > 0 && !asArray(row.allowed_scale_levels).includes(node.scale_level)) return false;
  if (asArray(row.allowed_node_types).length > 0 && !asArray(row.allowed_node_types).includes(node.node_type)) return false;
  if (row.typical_scale_level && row.typical_scale_level !== node.scale_level) return false;
  if (row.default_node_type && row.default_node_type !== node.node_type) return false;
  return true;
}

function checkRouteRuleMatch(routeTemplateIdsNearby, ruleIndex) {
  if (routeTemplateIdsNearby.length === 0) return true;
  if (ruleIndex.route_template_ids.size === 0) return true;
  return routeTemplateIdsNearby.every((routeTemplateId) => ruleIndex.route_template_ids.has(routeTemplateId));
}

function checkSeasonCompatibility(season, node, edges, routeTemplatesById) {
  if (!season) return false;
  const haystack = [node.seasonal_rule, node.game_use, node.limits, ...edges.flatMap((edge) => [edge.seasonal_rule, edge.access_rule, routeTemplatesById.get(edge.route_template_id)?.seasonal_availability])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return !textConflictsWithSeason(haystack, season);
}

function checkClockCompatibility(clock = {}, node, edges) {
  const timeOfDay = String(clock.time_of_day ?? '').toLowerCase();
  const light = String(clock.light_profile ?? '').toLowerCase();
  if (!timeOfDay || !light) return false;
  const haystack = [node.access_rule, node.game_use, node.limits, ...edges.flatMap((edge) => [edge.access_rule, edge.seasonal_rule])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return true;
  if ((timeOfDay.includes('night') || light === 'dark') && containsAny(haystack, ['day_only', 'day only', 'только днем', 'только днём', 'светлое время'])) return false;
  if ((timeOfDay === 'day' || light === 'daylight') && containsAny(haystack, ['night_only', 'night only', 'только ночью'])) return false;
  return true;
}

function checkAccessRuleMatch(edges) {
  if (edges.length === 0) return false;
  return !edges.every((edge) => containsAny(String(edge.access_rule ?? '').toLowerCase(), ['blocked', 'closed', 'forbidden', 'impossible', 'закрыт', 'запрещ', 'невозмож']));
}

function checkG5Readiness(node, placeTemplateId, ruleIndex, policy) {
  if (node.scale_level !== 'G4') return true;
  const ids = g5TemplateGroupIds(node, placeTemplateId, ruleIndex);
  if (ids.length > 0) return true;
  return policy.allow_unverified_g5_readiness === true;
}

function g5TemplateGroupIds(node, placeTemplateId, ruleIndex) {
  const index = ruleIndex.g5_ready_index;
  const ids = [];
  for (const key of [node.node_type, placeTemplateId, node.place_template_id, node.id].filter(Boolean)) {
    if (index.has(key)) ids.push(...index.get(key));
  }
  return unique(ids);
}

function buildG5ReadinessIndex(regionalContextPackage = {}) {
  const index = new Map();
  const direct = regionalContextPackage?.g5_context?.g4_type_to_allowed_anchor_rules;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    for (const [key, value] of Object.entries(direct)) index.set(key, asArray(value).map((item) => String(item)));
  }
  for (const pack of asArray(regionalContextPackage?.g5_context?.context_packs)) {
    const keys = unique([
      ...asArray(pack.g4_type_ids),
      ...asArray(pack.place_template_ids),
      pack.g4_type_id,
      pack.place_template_id,
      pack.id
    ].filter(Boolean));
    if (keys.length === 0 && pack.id) keys.push('__generic_g5_context__');
    for (const key of keys) {
      const existing = index.get(key) ?? [];
      index.set(key, unique([...existing, pack.id].filter(Boolean)));
    }
  }
  return index;
}

function matchPlayerRequest(normalizedRequest = {}, node, placeTemplateId, tags) {
  const hardText = flattenText([
    normalizedRequest?.hard_constraints,
    normalizedRequest?.forbidden_content,
    normalizedRequest?.forbidden_constraints,
    normalizedRequest?.must_not
  ]).join(' ').toLowerCase();
  const candidateText = flattenText([node.title, node.node_type, node.summary, node.dominant_content, node.terrain_profile, node.water_profile, node.road_profile, placeTemplateId, tags]).join(' ').toLowerCase();
  if (hardText && conflictsWithForbiddenText(hardText, candidateText)) return 'conflict';

  const requestText = flattenText([
    normalizedRequest?.start_place_request,
    normalizedRequest?.place_request,
    normalizedRequest?.tone_request,
    normalizedRequest?.difficulty_request,
    normalizedRequest?.soft_preferences,
    normalizedRequest?.core_intent,
    normalizedRequest?.requested_status,
    normalizedRequest?.requested_occupation
  ]).join(' ').toLowerCase();

  if (!requestText || containsAny(requestText, ['random', 'случайн', 'любой', 'неважно'])) return 'neutral';
  const exactNeedles = [node.node_type, placeTemplateId, tags.environment, tags.social_environment].filter(Boolean).map((value) => String(value).toLowerCase());
  if (exactNeedles.some((needle) => needle && requestText.includes(needle))) return 'exact';
  if (tokenOverlap(requestText, candidateText) >= 2) return 'partial';
  return 'weak';
}

function conflictsWithForbiddenText(forbiddenText, candidateText) {
  const pairs = [
    [['город', 'urban', 'city'], ['urban', 'city', 'город', 'посад', 'торг']],
    [['лес', 'wild', 'wilderness'], ['forest', 'лес', 'wild', 'wilderness']],
    [['дорог', 'road', 'route'], ['road', 'path', 'route', 'дорог', 'путь', 'тропа']],
    [['вода', 'река', 'озеро', 'water'], ['water', 'river', 'lake', 'река', 'озеро', 'брод', 'переправа']]
  ];
  return pairs.some(([forbiddenNeedles, candidateNeedles]) => forbiddenNeedles.some((needle) => forbiddenText.includes(needle)) && candidateNeedles.some((needle) => candidateText.includes(needle)));
}

function buildContextTags(node, edges, placeTemplateId, routeTemplatesById) {
  const text = flattenText([node.title, node.node_type, node.summary, node.dominant_content, node.terrain_profile, node.water_profile, node.road_profile, placeTemplateId, edges.map((edge) => edge.edge_type)]).join(' ').toLowerCase();
  const routeKinds = edges.map((edge) => routeTemplatesById.get(edge.route_template_id)?.route_kind).filter(Boolean).join(' ').toLowerCase();
  const environment = containsAny(text, ['city', 'urban', 'город', 'посад', 'торг', 'street']) ? 'urban'
    : containsAny(text, ['village', 'rural', 'field', 'паш', 'деревн', 'село', 'погост']) ? 'rural'
      : containsAny(text, ['road', 'path', 'route', 'дорог', 'тропа', 'путь', 'зимник']) ? 'road'
        : containsAny(text, ['water', 'river', 'lake', 'река', 'озеро', 'брод', 'переправа']) ? 'water'
          : containsAny(text, ['forest', 'wild', 'болото', 'лес', 'пустош', 'wilderness']) ? 'wild'
            : containsAny(text, ['mixed', 'смеш']) ? 'mixed'
              : 'unknown';
  const socialEnvironment = containsAny(text, ['house', 'household', 'двор', 'изба', 'усадь']) ? 'household'
    : containsAny(text, ['trade', 'market', 'торг', 'куп', 'пристан']) ? 'trade'
      : containsAny(text, ['church', 'monastery', 'церк', 'монаст', 'погост']) ? 'religious'
        : containsAny(text, ['guard', 'fort', 'gate', 'страж', 'креп', 'ворота']) ? 'military'
          : containsAny(`${text} ${routeKinds}`, ['road', 'path', 'route', 'дорог', 'путь', 'зимник']) ? 'travel'
            : containsAny(text, ['work', 'labor', 'ремес', 'работ', 'паш']) ? 'labor'
              : environment === 'wild' ? 'wilderness'
                : 'unknown';
  const risk = strongestRisk(edges.map((edge) => edge.risk_level).filter(Boolean));
  return { environment, social_environment: socialEnvironment, risk_level: risk, start_tone_fit: toneFit(environment, socialEnvironment, risk) };
}

function buildCandidateSourceTrace(node, edges, ruleIndex, placeTemplateId) {
  const trace = [];
  trace.push({
    record_id: node.id,
    table: 'world_base.graph_nodes',
    source_ids: asArray(node.sources),
    supports: ['canonical_node', 'node_chain', 'template_links'],
    status: node.status ?? null,
    confidence: node.confidence ?? null
  });
  for (const edge of edges) {
    trace.push({
      record_id: edge.id,
      table: 'world_base.graph_edges',
      source_ids: asArray(edge.sources),
      supports: ['access', 'route_context'],
      status: edge.status ?? null,
      confidence: edge.confidence ?? null
    });
  }
  const placeTemplateRow = placeTemplateId ? ruleIndex.place_template_by_id.get(placeTemplateId) : null;
  if (placeTemplateRow) {
    trace.push({
      record_id: placeTemplateRow.region_place_template_id,
      table: 'world_base.region_place_templates',
      source_ids: asArray(placeTemplateRow.sources),
      supports: ['place_rule_match'],
      status: placeTemplateRow.status ?? null,
      confidence: placeTemplateRow.confidence ?? null
    });
  }
  return trace.filter((item) => item.record_id);
}

function buildWhyAllowed({ node, nodeChain, nearbyEdges, compatibility, inheritedPlaceTemplateId }) {
  const reasons = ['Candidate exists in canonical world_base.graph_nodes.'];
  if (hasRequiredParentChain(node.scale_level, nodeChain)) reasons.push('Candidate has the required parent chain for its scale.');
  if (nearbyEdges.length > 0) reasons.push('Candidate has at least one entry or exit edge.');
  if (inheritedPlaceTemplateId) reasons.push('Candidate has a region-compatible place template.');
  if (compatibility.season_match) reasons.push('Candidate is season-compatible.');
  if (compatibility.clock_match) reasons.push('Candidate is clock/light-compatible.');
  if (compatibility.g5_ready) reasons.push('Candidate can be checked for later G5 materialization without creating G5 now.');
  return reasons;
}

function buildCandidateGroups(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    addGroup(groups, `scale:${candidate.scale_level}`, `${candidate.scale_level} candidates`, [candidate.scale_level], candidate.candidate_id);
    if (candidate.template_links.place_template_id) addGroup(groups, `place_template:${candidate.template_links.place_template_id}`, `Place template ${candidate.template_links.place_template_id}`, [candidate.template_links.place_template_id], candidate.candidate_id);
    addGroup(groups, `environment:${candidate.context_tags.environment}`, `${candidate.context_tags.environment} starts`, [candidate.context_tags.environment], candidate.candidate_id);
    addGroup(groups, `risk:${candidate.context_tags.risk_level}`, `${candidate.context_tags.risk_level} risk starts`, [candidate.context_tags.risk_level], candidate.candidate_id);
    addGroup(groups, `social:${candidate.context_tags.social_environment}`, `${candidate.context_tags.social_environment} starts`, [candidate.context_tags.social_environment], candidate.candidate_id);
    if (candidate.template_links.route_template_ids_nearby.length > 0 || candidate.context_tags.environment === 'road') addGroup(groups, 'route_accessible', 'Route-accessible starts', ['route_accessible'], candidate.candidate_id);
  }
  return [...groups.entries()].map(([groupId, group]) => ({ group_id: groupId, ...group, candidate_ids: [...group.candidate_ids] }));
}

function addGroup(groups, groupId, title, groupTags, candidateId) {
  if (!groups.has(groupId)) groups.set(groupId, { title, group_tags: groupTags, candidate_ids: new Set() });
  groups.get(groupId).candidate_ids.add(candidateId);
}

function toRejectedCandidate(candidate) {
  const first = candidate.why_rejected[0] ?? rejection('START_CANDIDATE_REJECTED', 'Candidate rejected.');
  return {
    candidate_id: candidate.candidate_id,
    node_id: candidate.canonical_node?.node_id ?? candidate.node_id ?? null,
    scale_level: candidate.canonical_node?.scale_level ?? candidate.scale_level ?? null,
    rejection_code: first.rejection_code,
    rejection_reason: first.rejection_reason,
    evidence: candidate.why_rejected.flatMap((item) => item.evidence ?? []),
    all_rejections: candidate.why_rejected,
    source_trace: candidate.source_trace ?? []
  };
}

function emptyCandidateSet({ requestId, frame, status, concerns, evidence }) {
  return {
    version: 1,
    schema: 'start_candidate_set',
    request_id: requestId,
    selection_status: SELECTION_STATUSES.includes(status) ? status : 'blocked',
    frame,
    candidate_summary: {
      total_candidates: 0,
      g1_count: 0,
      g2_count: 0,
      g3_count: 0,
      g4_count: 0,
      preferred_scale: 'G4',
      fallback_scale_used: null,
      startable_candidate_count: 0,
      rejected_candidate_count: 0
    },
    candidates: [],
    rejected_candidates: [],
    candidate_groups: [],
    downstream_constraints: {
      must_choose_from_candidate_ids: [],
      must_preserve: [],
      must_not_create_yet: ['G5', 'NPC', 'item', 'narrator_prose', 'selected_start_node_id'],
      must_resolve_later: []
    },
    source_trace: [],
    audit: makeAudit(false, concerns, evidence)
  };
}

function indexEdgesByNode(edges) {
  const map = new Map();
  for (const edge of edges) {
    push(map, edge.from_node_id, edge);
    push(map, edge.to_node_id, edge);
  }
  return map;
}

function accessNotes(edges) {
  return edges.map((edge) => ({
    edge_id: edge.id,
    edge_type: edge.edge_type,
    access_rule: edge.access_rule ?? null,
    seasonal_rule: edge.seasonal_rule ?? null,
    risk_level: edge.risk_level ?? null
  }));
}

function textConflictsWithSeason(text, season) {
  const normalized = String(text ?? '').toLowerCase();
  if (!normalized) return false;
  const seasonMap = {
    spring: ['winter_only', 'autumn_only', 'только зимой', 'только осенью'],
    summer: ['winter_only', 'spring_only', 'только зимой', 'только весной'],
    autumn: ['winter_only', 'summer_only', 'только зимой', 'только летом'],
    winter: ['summer_only', 'spring_only', 'autumn_only', 'только летом', 'только весной', 'только осенью']
  };
  return containsAny(normalized, seasonMap[season] ?? []);
}

function toneFit(environment, socialEnvironment, risk) {
  return unique([environment, socialEnvironment, risk === 'high' || risk === 'extreme' ? 'dangerous' : 'ordinary'].filter(Boolean));
}

function strongestRisk(values) {
  const order = ['none', 'low', 'medium', 'high', 'extreme'];
  let strongest = 'none';
  for (const value of values) {
    const normalized = String(value ?? 'none').toLowerCase();
    if (order.indexOf(normalized) > order.indexOf(strongest)) strongest = normalized;
  }
  return strongest === 'extreme' ? 'high' : strongest;
}

function scoreBand(value) {
  if (value >= 90) return 'excellent';
  if (value >= 70) return 'good';
  if (value >= 50) return 'usable';
  if (value >= 30) return 'weak';
  return 'reject';
}

function rejection(code, reason, evidence = []) {
  return { rejection_code: code, rejection_reason: reason, evidence: asArray(evidence) };
}

function concern(code, message, extra = {}) {
  return { code, message, ...extra };
}

function compareCandidates(left, right) {
  const scoreDelta = (right.score?.value ?? 0) - (left.score?.value ?? 0);
  if (scoreDelta !== 0) return scoreDelta;
  const scaleDelta = SCALE_ORDER.indexOf(right.scale_level) - SCALE_ORDER.indexOf(left.scale_level);
  if (scaleDelta !== 0) return scaleDelta;
  return String(left.canonical_node?.title ?? left.candidate_id).localeCompare(String(right.canonical_node?.title ?? right.candidate_id));
}

function scaleKey(scaleLevel) {
  return scaleLevel ? `${String(scaleLevel).toLowerCase()}_node_id` : null;
}

function safeId(value) {
  return String(value ?? 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function uniqueById(rows) {
  return [...new Map(rows.filter(Boolean).map((row) => [row.id, row])).values()];
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ''))];
}

function push(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return [value];
  }
  return [value];
}

function flattenText(value) {
  if (Array.isArray(value)) return value.flatMap((item) => flattenText(item));
  if (value && typeof value === 'object') return Object.values(value).flatMap((item) => flattenText(item));
  if (value == null) return [];
  return [String(value)];
}

function containsAny(text, needles) {
  const normalized = String(text ?? '').toLowerCase();
  return needles.some((needle) => normalized.includes(String(needle).toLowerCase()));
}

function tokenOverlap(left, right) {
  const leftTokens = new Set(String(left).split(/\W+/u).filter((token) => token.length >= 4));
  const rightTokens = new Set(String(right).split(/\W+/u).filter((token) => token.length >= 4));
  let count = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) count += 1;
  return count;
}

function parseBooleanish(value) {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = String(value ?? '').toLowerCase();
  return ['true', 'yes', '1', 'known', 'knows_exact', 'knows_roughly'].includes(normalized);
}
