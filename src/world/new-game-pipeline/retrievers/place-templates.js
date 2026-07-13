import {
  frameFromHistoricalFrame,
  getAllowedStatuses,
  getRetrieverQueryable,
  jsonArrayIncludes,
  makeAudit,
  sourceTrace
} from './common.js';

const DEFAULT_TEMPLATE_POLICY = Object.freeze({
  require_region_place_template_link: true,
  require_place_template_status_allowed: true,
  require_candidate_environment_compatibility: true,
  require_scale_level_compatibility: true,
  require_node_type_compatibility: true,
  require_generation_rule_if_candidate_has_no_place_template_id: true,
  require_generation_limits_check: true,
  require_sources: true,
  prefer_existing_candidate_place_template_id: true,
  allow_multiple_templates_per_candidate: true,
  allow_weak_templates: false
});

const SELECTION_STATUSES = Object.freeze(['ready', 'empty', 'blocked', 'requires_repair']);
const WATER_EDGE_TYPES = Object.freeze(['river', 'lake_route', 'sea_route', 'ford', 'ferry', 'bridge']);
const ROUTE_EDGE_TYPES = Object.freeze(['road', 'path', 'forest_track', 'winter_road', 'portage', 'corridor_segment', 'street', 'yard_passage', 'gate', 'door', 'offroad_crossing']);
const FORBIDDEN_DOWNSTREAM_FIELDS = Object.freeze([
  'place_name',
  'owner',
  'visible_scene',
  'g5_scene',
  'G5',
  'npc',
  'NPC',
  'item',
  'items'
]);

export async function retrieveCandidatePlaceTemplates(input = {}, deps = {}) {
  const requestId = input.request_id ?? input.requestId ?? null;
  const frame = frameFromHistoricalFrame(input.historical_frame);
  const candidates = input.start_candidate_set?.candidates ?? [];
  const policy = normalizeTemplatePolicy(input.template_policy);
  const statuses = getAllowedStatuses(policy);
  const inputConcerns = validateStage6Input(input, frame, candidates);

  if (!frame.region_id) {
    return buildBlockedOutput({ requestId, frame, candidates, inputConcerns, sourceTraceRows: [] });
  }

  if (deps.queryable == null) {
    const error = new Error('CANDIDATE_PLACE_TEMPLATE_QUERYABLE_MISSING');
    error.code = 'CANDIDATE_PLACE_TEMPLATE_QUERYABLE_MISSING';
    throw error;
  }

  const db = getRetrieverQueryable(deps);
  const candidateNodeIds = unique(candidates.map((candidate) => candidate.node_id).filter(Boolean));
  const accessEdgeIds = unique(candidates.flatMap((candidate) => asArray(candidate.access_edge_ids)));

  const [templates, generationRules, generationLimits, edgeRows, existingCounts] = await Promise.all([
    queryRegionPlaceTemplates(db, frame.region_id, statuses),
    queryRegionPlaceGenerationRules(db, frame.region_id, statuses),
    queryPlaceGenerationLimits(db, frame.region_id, statuses),
    queryCandidateEdges(db, { candidateNodeIds, accessEdgeIds, statuses }),
    queryExistingTemplateCounts(db, frame.region_id, statuses)
  ]);

  const templateById = new Map(templates.map((row) => [row.place_template_id, row]));
  const generationRuleByTemplateId = indexGenerationRulesByTemplate(templates, generationRules);
  const generationLimitByTemplateId = new Map(generationLimits.map((row) => [row.place_template_id, row]));
  const edgeIndex = buildEdgeIndex(edgeRows);
  const acceptedLinks = [];
  const rejectedLinks = [];

  for (const candidate of candidates) {
    const candidateEdges = unique([
      ...asArray(candidate.access_edge_ids).map((edgeId) => edgeIndex.edgeById.get(edgeId)).filter(Boolean),
      ...(edgeIndex.edgesByNodeId.get(candidate.node_id) ?? [])
    ], (edge) => edge.id);
    const templatePool = selectTemplatePoolForCandidate(candidate, templates, templateById, policy);
    const candidateRejected = [];

    for (const template of templatePool) {
      const generationRule = generationRuleByTemplateId.get(template.place_template_id) ?? null;
      const generationLimit = generationLimitByTemplateId.get(template.place_template_id) ?? (generationRule ? generationLimitByTemplateId.get(generationRule.id) : null) ?? null;
      const evaluation = evaluateTemplateForCandidate({
        candidate,
        template,
        generationRule,
        generationLimit,
        candidateEdges,
        existingCount: Number(existingCounts.get(template.place_template_id) ?? 0),
        normalizedRequest: input.normalized_request,
        frame,
        policy
      });

      if (evaluation.pass) {
        acceptedLinks.push(buildCandidateTemplateLink({ candidate, template, generationRule, generationLimit, evaluation }));
      } else {
        candidateRejected.push(buildRejectedTemplateLink({ candidate, template, evaluation }));
      }
    }

    if (candidateRejected.length > 0) rejectedLinks.push(...candidateRejected);
    if (templatePool.length === 0) {
      rejectedLinks.push({
        candidate_id: candidate.candidate_id,
        node_id: candidate.node_id,
        place_template_id: candidate.place_template_id ?? null,
        rejection_code: candidate.place_template_id
          ? 'CANDIDATE_PLACE_TEMPLATE_NOT_ALLOWED_IN_REGION'
          : 'NO_REGION_PLACE_TEMPLATE_POOL',
        rejection_reason: candidate.place_template_id
          ? 'Candidate has a direct place_template_id, but it is not present in allowed region_place_templates for this region.'
          : 'No allowed region_place_templates were available for this candidate.',
        evidence: [{ kind: 'candidate_template_pool_empty', candidate_id: candidate.candidate_id }]
      });
    }
  }

  const links = finalizeAcceptedLinks(acceptedLinks, policy);
  const concerns = [...inputConcerns];
  if (candidates.length === 0) {
    concerns.push({
      code: 'START_CANDIDATE_SET_EMPTY',
      message: 'Stage 6 cannot select place templates because start_candidate_set.candidates is empty.'
    });
  }
  if (links.length === 0) {
    concerns.push({
      code: 'NO_ALLOWED_PLACE_TEMPLATES_FOR_CANDIDATES',
      message: 'No start candidate has an allowed place_template link after region, scale, node, environment, limit, source, and request checks.'
    });
  }

  const candidatesWithTemplates = new Set(links.map((link) => link.candidate_id));
  const sourceTraceRows = [
    ...sourceTrace('region_place_templates', templates.map((row) => ({ ...row, id: row.region_place_template_id, status: row.region_place_template_status, confidence: row.region_place_template_confidence, sources: row.region_place_template_sources }))),
    ...sourceTrace('place_templates', templates.map((row) => ({ ...row, id: row.place_template_id, status: row.place_template_status, confidence: row.place_template_confidence, sources: row.place_template_sources }))),
    ...sourceTrace('region_place_generation_rules', generationRules),
    ...sourceTrace('place_generation_limits', generationLimits),
    ...sourceTrace('graph_edges', edgeRows)
  ];

  return {
    version: 1,
    schema: 'candidate_place_template_set',
    request_id: requestId,
    selection_status: concerns.length === 0 ? 'ready' : (links.length === 0 ? 'empty' : 'requires_repair'),
    frame,
    summary: {
      candidate_count: candidates.length,
      candidates_with_templates: candidatesWithTemplates.size,
      candidates_without_templates: Math.max(0, candidates.length - candidatesWithTemplates.size),
      total_template_links: links.length,
      rejected_template_links: rejectedLinks.length
    },
    candidate_template_links: links,
    rejected_template_links: rejectedLinks,
    template_index: buildTemplateIndex(links, templates, generationLimits),
    downstream_constraints: {
      must_choose_candidate_template_link_id: links.map((link) => link.candidate_place_template_link_id),
      must_preserve: [
        'candidate_place_template_link_id',
        'candidate_id',
        'node_id',
        'place_template_id',
        'region_place_template_id',
        'source_trace'
      ],
      must_not_create_yet: ['place_name', 'owner', 'G5', 'NPC', 'item', 'visible_scene'],
      must_resolve_later: ['final_start_node', 'concrete_place_identity', 'G5_scene_anchors']
    },
    source_trace: sourceTraceRows,
    audit: makeAudit(concerns.length === 0, concerns, [{
      kind: 'stage6_candidate_place_template_gate',
      checked: [
        'region_place_templates',
        'place_templates',
        'region_place_generation_rules',
        'place_generation_limits',
        'graph_edges',
        'normalized_request_hard_constraints'
      ]
    }])
  };
}

export function validateCandidatePlaceTemplateSet(output = {}, input = {}) {
  const concerns = [];
  const frame = frameFromHistoricalFrame(input.historical_frame);
  const candidates = input.start_candidate_set?.candidates ?? [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const linkIds = new Set();

  if (output.version !== 1) concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_BAD_VERSION', 'candidate_place_template_set.version must be 1.'));
  if (output.schema !== 'candidate_place_template_set') concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_BAD_SCHEMA', 'candidate_place_template_set.schema must be candidate_place_template_set.'));
  if (!SELECTION_STATUSES.includes(output.selection_status)) concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_BAD_SELECTION_STATUS', 'selection_status must be ready, empty, blocked, or requires_repair.'));
  if (frame.region_id && output.frame?.region_id !== frame.region_id) concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_FRAME_REGION_MISMATCH', 'output.frame.region_id must match historical_frame.region.region_id.'));
  if (frame.year != null && output.frame?.year !== frame.year) concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_FRAME_YEAR_MISMATCH', 'output.frame.year must match historical_frame.year.value.'));
  if (frame.season != null && output.frame?.season !== frame.season) concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_FRAME_SEASON_MISMATCH', 'output.frame.season must match historical_frame.calendar.season.'));
  if (!Array.isArray(output.candidate_template_links)) concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_LINKS_NOT_ARRAY', 'candidate_template_links must be an array.'));
  if (!Array.isArray(output.rejected_template_links)) concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_REJECTED_NOT_ARRAY', 'rejected_template_links must be an array.'));
  if (output.selection_status === 'ready' && (!Array.isArray(output.candidate_template_links) || output.candidate_template_links.length === 0)) {
    concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_READY_WITHOUT_LINKS', 'selection_status=ready requires at least one candidate_template_link.'));
  }
  if (output.audit?.pass !== true) {
    concerns.push(...asArray(output.audit?.concerns));
    if ((output.audit?.concerns ?? []).length === 0) concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_AUDIT_FAILED', 'candidate_place_template_set.audit.pass must be true.'));
  }

  for (const link of output.candidate_template_links ?? []) {
    const linkId = link.candidate_place_template_link_id ?? null;
    if (!linkId) {
      concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_LINK_ID_MISSING', 'Each link must have candidate_place_template_link_id.'));
    } else if (linkIds.has(linkId)) {
      concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_LINK_ID_DUPLICATE', `Duplicate candidate_place_template_link_id: ${linkId}.`));
    }
    linkIds.add(linkId);

    const candidate = candidateById.get(link.candidate_id);
    if (!candidate) {
      concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_UNKNOWN_CANDIDATE', `Link references unknown candidate_id: ${link.candidate_id}.`));
    } else {
      if (candidate.node_id !== link.node_id) concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_NODE_MISMATCH', `Link ${linkId} node_id does not match source candidate.`));
      if (candidate.place_template_id && candidate.place_template_id !== link.place_template_id) {
        concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_DIRECT_ID_CHANGED', `Link ${linkId} violates candidate.place_template_id.`));
      }
    }

    if (!link.place_template_id) concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_ID_MISSING', `Link ${linkId ?? '?'} is missing place_template_id.`));
    if (!link.region_place_template_id) concerns.push(concern('CANDIDATE_REGION_PLACE_TEMPLATE_ID_MISSING', `Link ${linkId ?? '?'} is missing region_place_template_id.`));
    if (!Array.isArray(link.source_trace) || link.source_trace.length === 0) concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_SOURCE_TRACE_MISSING', `Link ${linkId ?? '?'} must include source_trace.`));
    for (const field of FORBIDDEN_DOWNSTREAM_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(link, field)) {
        concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_DOWNSTREAM_ENTITY_CREATED', `Stage 6 link must not contain downstream field ${field}.`));
      }
    }
  }

  if (output.selection_status === 'empty') {
    concerns.push(concern('NO_ALLOWED_PLACE_TEMPLATES_FOR_CANDIDATES', 'Stage 6 produced no allowed place template links.'));
  }
  if (output.selection_status === 'blocked' || output.selection_status === 'requires_repair') {
    concerns.push(concern('CANDIDATE_PLACE_TEMPLATE_STAGE_NOT_READY', `Stage 6 selection_status is ${output.selection_status}.`));
  }

  return {
    stage_id: 6,
    stage_slug: 'candidate_place_templates',
    gate_kind: 'candidate_place_template_contract_validation',
    pass: concerns.length === 0,
    concerns,
    evidence: [{
      kind: 'stage6_contract_gate',
      candidate_count: candidates.length,
      link_count: output.candidate_template_links?.length ?? 0,
      selection_status: output.selection_status ?? null
    }]
  };
}

async function queryRegionPlaceTemplates(db, regionId, statuses) {
  const { rows } = await db.query(`
    SELECT rpt.id AS region_place_template_id,
           rpt.region_id,
           rpt.place_template_id,
           rpt.is_allowed,
           rpt.is_common,
           rpt.is_rare,
           rpt.generation_weight,
           rpt.allowed_scale_levels,
           rpt.allowed_node_types,
           rpt.regional_limits,
           rpt.game_use AS region_place_template_game_use,
           rpt.limits AS region_place_template_limits,
           rpt.status AS region_place_template_status,
           rpt.confidence AS region_place_template_confidence,
           rpt.sources AS region_place_template_sources,
           rpt.audit_notes AS region_place_template_audit_notes,
           pt.id AS place_template_id,
           pt.slug,
           pt.title,
           pt.summary,
           pt.place_kind,
           pt.default_node_type,
           pt.can_exist_inside_landscape,
           pt.requires_water_nearby,
           pt.requires_route_nearby,
           pt.requires_land_use,
           pt.compatible_landscape_template_ids,
           pt.compatible_water_body_template_ids,
           pt.compatible_route_template_ids,
           pt.compatible_land_use_template_ids,
           pt.typical_scale_level,
           pt.access_logic,
           pt.social_logic,
           pt.economic_logic,
           pt.defense_logic,
           pt.game_use AS place_template_game_use,
           pt.limits AS place_template_limits,
           pt.status AS place_template_status,
           pt.confidence AS place_template_confidence,
           pt.sources AS place_template_sources,
           pt.audit_notes AS place_template_audit_notes
    FROM world_base.region_place_templates rpt
    JOIN world_base.place_templates pt ON pt.id = rpt.place_template_id
    WHERE rpt.region_id = $1
      AND rpt.is_allowed = true
      AND rpt.status = ANY($2::text[])
      AND pt.status = ANY($2::text[])
    ORDER BY rpt.generation_weight DESC, pt.title, pt.id
  `, [regionId, statuses]);
  return rows;
}

async function queryRegionPlaceGenerationRules(db, regionId, statuses) {
  const { rows } = await db.query(`
    SELECT id, region_id, title, slug, template_type, summary, generation_allowed,
           required_landscape, required_economy, required_route_access, required_water_access,
           seasonal_availability, typical_population_band, typical_household_count,
           typical_wealth_level, typical_authority, typical_social_roles, typical_occupations,
           layout_rules, access_rules, trade_rules, defense_rules, npc_generation_rules,
           item_generation_rules, route_generation_rules, historical_plausibility_rules,
           game_use, limits, status, confidence, sources, audit_notes
    FROM world_base.region_place_generation_rules
    WHERE region_id = $1
      AND generation_allowed = true
      AND status = ANY($2::text[])
    ORDER BY title, id
  `, [regionId, statuses]);
  return rows;
}

async function queryPlaceGenerationLimits(db, regionId, statuses) {
  const { rows } = await db.query(`
    SELECT id, region_id, place_template_id, max_total, max_per_subregion,
           min_total_if_region_active, economic_basis_required, route_basis_required,
           water_basis_required, authority_basis_required, historical_anchor_basis_required,
           allowed_near_place_types, forbidden_near_place_types, minimum_distance_band,
           maximum_distance_band, density_logic, naming_policy, duplication_policy,
           game_use, limits, status, confidence, sources, audit_notes
    FROM world_base.place_generation_limits
    WHERE region_id = $1
      AND status = ANY($2::text[])
  `, [regionId, statuses]);
  return rows;
}

async function queryCandidateEdges(db, { candidateNodeIds, accessEdgeIds, statuses }) {
  if (candidateNodeIds.length === 0 && accessEdgeIds.length === 0) return [];
  const { rows } = await db.query(`
    SELECT ge.id, ge.from_node_id, ge.to_node_id, ge.scale_level, ge.edge_type,
           ge.route_template_id, ge.landscape_template_id, ge.water_body_template_id,
           ge.base_gu, ge.base_distance_km, ge.base_time_minutes, ge.base_time_hours,
           ge.seasonal_rule, ge.access_rule, ge.risk_level, ge.requires_guide,
           ge.requires_boat, ge.requires_horse, ge.requires_sled, ge.requires_permission,
           ge.requires_orientation_check, ge.orientation_difficulty, ge.movement_risk_profile,
           ge.failure_consequences, ge.historical_status, ge.status, ge.confidence, ge.sources
    FROM world_base.graph_edges ge
    WHERE ge.status = ANY($3::text[])
      AND (
        ge.id = ANY($1::text[])
        OR ge.from_node_id = ANY($2::text[])
        OR ge.to_node_id = ANY($2::text[])
      )
  `, [accessEdgeIds, candidateNodeIds, statuses]);
  return rows;
}

async function queryExistingTemplateCounts(db, regionId, statuses) {
  const { rows } = await db.query(`
    SELECT place_template_id, COUNT(*)::int AS count
    FROM world_base.graph_nodes
    WHERE region_id = $1
      AND place_template_id IS NOT NULL
      AND status = ANY($2::text[])
    GROUP BY place_template_id
  `, [regionId, statuses]);
  return new Map(rows.map((row) => [row.place_template_id, Number(row.count ?? 0)]));
}

function normalizeTemplatePolicy(policy = {}) {
  return { ...DEFAULT_TEMPLATE_POLICY, ...(policy ?? {}) };
}

function validateStage6Input(input, frame, candidates) {
  const concerns = [];
  if (!input.normalized_request) concerns.push(concern('STAGE_6_MISSING_NORMALIZED_REQUEST', 'Stage 6 input requires normalized_request.'));
  if (!input.historical_frame) concerns.push(concern('STAGE_6_MISSING_HISTORICAL_FRAME', 'Stage 6 input requires historical_frame.'));
  if (!frame.region_id) concerns.push(concern('STAGE_6_MISSING_REGION_ID', 'historical_frame.region.region_id is required.'));
  if (frame.year == null) concerns.push(concern('STAGE_6_MISSING_YEAR', 'historical_frame.year.value is required.'));
  if (!frame.season) concerns.push(concern('STAGE_6_MISSING_SEASON', 'historical_frame.calendar.season is required.'));
  if (!frame.clock || Object.keys(frame.clock).length === 0) concerns.push(concern('STAGE_6_MISSING_CLOCK', 'historical_frame.clock is required.'));
  if (!input.regional_context_package) concerns.push(concern('STAGE_6_MISSING_REGIONAL_CONTEXT_PACKAGE', 'Stage 6 input requires regional_context_package.'));
  if (!input.start_candidate_set) concerns.push(concern('STAGE_6_MISSING_START_CANDIDATE_SET', 'Stage 6 input requires start_candidate_set.'));
  if (input.historical_frame?.audit && input.historical_frame.audit.pass !== true) concerns.push(concern('STAGE_6_HISTORICAL_FRAME_AUDIT_FAILED', 'historical_frame.audit.pass must be true.'));
  if (input.regional_context_package?.audit && input.regional_context_package.audit.pass !== true) concerns.push(concern('STAGE_6_REGIONAL_CONTEXT_AUDIT_FAILED', 'regional_context_package.audit.pass must be true.'));
  if (input.start_candidate_set?.audit && input.start_candidate_set.audit.pass !== true) concerns.push(concern('STAGE_6_START_CANDIDATE_AUDIT_FAILED', 'start_candidate_set.audit.pass must be true.'));
  if (input.start_candidate_set?.selection_status !== 'ready') concerns.push(concern('STAGE_6_START_CANDIDATE_SET_NOT_READY', 'start_candidate_set.selection_status must be ready.'));
  if (!Array.isArray(candidates)) concerns.push(concern('STAGE_6_CANDIDATES_NOT_ARRAY', 'start_candidate_set.candidates must be an array.'));
  return concerns;
}

function buildBlockedOutput({ requestId, frame, candidates, inputConcerns, sourceTraceRows }) {
  return {
    version: 1,
    schema: 'candidate_place_template_set',
    request_id: requestId,
    selection_status: 'blocked',
    frame,
    summary: {
      candidate_count: candidates.length,
      candidates_with_templates: 0,
      candidates_without_templates: candidates.length,
      total_template_links: 0,
      rejected_template_links: 0
    },
    candidate_template_links: [],
    rejected_template_links: [],
    template_index: buildTemplateIndex([], [], []),
    downstream_constraints: {
      must_choose_candidate_template_link_id: [],
      must_preserve: ['candidate_id', 'node_id', 'place_template_id', 'source_trace'],
      must_not_create_yet: ['place_name', 'owner', 'G5', 'NPC', 'item', 'visible_scene'],
      must_resolve_later: []
    },
    source_trace: sourceTraceRows,
    audit: makeAudit(false, inputConcerns, [{ kind: 'stage6_input_blocked' }])
  };
}

function selectTemplatePoolForCandidate(candidate, templates, templateById, policy) {
  if (candidate.place_template_id && policy.prefer_existing_candidate_place_template_id !== false) {
    return templateById.has(candidate.place_template_id) ? [templateById.get(candidate.place_template_id)] : [];
  }
  return templates;
}

function evaluateTemplateForCandidate({ candidate, template, generationRule, generationLimit, candidateEdges, existingCount, normalizedRequest, frame, policy }) {
  const failures = [];
  const warnings = [];
  const compatibility = {};
  const candidateContext = buildCandidateContext(candidate, candidateEdges);

  compatibility.region_link = passCheck(Boolean(template.region_place_template_id), 'Region place template allowlist link exists.');
  if (policy.require_region_place_template_link && !compatibility.region_link.pass) pushFailure(failures, 'MISSING_REGION_PLACE_TEMPLATE_LINK', 'Template is not linked through region_place_templates.');

  compatibility.template_status = passCheck(template.place_template_status && getAllowedStatuses(policy).includes(template.place_template_status), `place_templates.status=${template.place_template_status ?? 'missing'}`);
  compatibility.region_link_status = passCheck(template.region_place_template_status && getAllowedStatuses(policy).includes(template.region_place_template_status), `region_place_templates.status=${template.region_place_template_status ?? 'missing'}`);
  if (policy.require_place_template_status_allowed && (!compatibility.template_status.pass || !compatibility.region_link_status.pass)) {
    pushFailure(failures, 'PLACE_TEMPLATE_STATUS_NOT_ALLOWED', 'place_templates and region_place_templates records must have allowed statuses.');
  }

  compatibility.direct_candidate_template = passCheck(!candidate.place_template_id || candidate.place_template_id === template.place_template_id, 'Candidate direct place_template_id preserved.');
  if (!compatibility.direct_candidate_template.pass) pushFailure(failures, 'DIRECT_CANDIDATE_PLACE_TEMPLATE_MISMATCH', 'Candidate has a fixed place_template_id and link points to another template.');

  compatibility.scale_level = evaluateScaleCompatibility(candidate, template);
  if (policy.require_scale_level_compatibility && !compatibility.scale_level.pass) pushFailure(failures, 'SCALE_LEVEL_INCOMPATIBLE', compatibility.scale_level.reason);

  compatibility.node_type = evaluateNodeTypeCompatibility(candidate, template);
  if (policy.require_node_type_compatibility && !compatibility.node_type.pass) pushFailure(failures, 'NODE_TYPE_INCOMPATIBLE', compatibility.node_type.reason);

  compatibility.generation_rule = evaluateGenerationRuleCompatibility(candidate, generationRule, policy);
  if (!compatibility.generation_rule.pass) pushFailure(failures, 'MISSING_REGION_PLACE_GENERATION_RULE', compatibility.generation_rule.reason);

  compatibility.landscape = evaluateLandscapeCompatibility(candidateContext, template);
  compatibility.water = evaluateWaterCompatibility(candidateContext, template, generationRule, generationLimit);
  compatibility.route = evaluateRouteCompatibility(candidateContext, template, generationRule, generationLimit);
  compatibility.land_use = evaluateLandUseCompatibility(candidateContext, template, generationRule, generationLimit);
  if (policy.require_candidate_environment_compatibility) {
    for (const [key, result] of Object.entries({
      landscape: compatibility.landscape,
      water: compatibility.water,
      route: compatibility.route,
      land_use: compatibility.land_use
    })) {
      if (!result.pass) pushFailure(failures, `${key.toUpperCase()}_INCOMPATIBLE`, result.reason);
    }
  }

  compatibility.generation_limits = evaluateGenerationLimits({ candidate, generationLimit, existingCount, candidateContext, generationRule });
  if (policy.require_generation_limits_check && !compatibility.generation_limits.pass) pushFailure(failures, 'GENERATION_LIMITS_FAILED', compatibility.generation_limits.reason);

  compatibility.sources = evaluateSourceRequirements(template, generationRule, generationLimit, policy);
  if (!compatibility.sources.pass) pushFailure(failures, 'SOURCE_TRACE_REQUIRED', compatibility.sources.reason);

  compatibility.hard_constraints = evaluateHardConstraints({ normalizedRequest, candidate, template });
  if (!compatibility.hard_constraints.pass) pushFailure(failures, 'NORMALIZED_REQUEST_HARD_CONSTRAINT_CONFLICT', compatibility.hard_constraints.reason);

  compatibility.clock_access = evaluateClockAccess(frame.clock, template);
  if (!compatibility.clock_access.pass) warnings.push({ code: 'CLOCK_ACCESS_POSSIBLE_CONFLICT', message: compatibility.clock_access.reason });

  if (generationLimit?.max_per_subregion != null) warnings.push({ code: 'MAX_PER_SUBREGION_NOT_FULLY_VERIFIED', message: 'Stage 6 has no subregion occupancy counter; max_per_subregion is preserved for downstream audit.' });
  if (generationLimit?.allowed_near_place_types?.length || generationLimit?.forbidden_near_place_types?.length) warnings.push({ code: 'NEAR_PLACE_TYPES_REQUIRE_DOWNSTREAM_SPATIAL_AUDIT', message: 'Near-place constraints are preserved for downstream semantic/spatial audit.' });

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    compatibility,
    score: scoreTemplateCandidate({ candidate, template, generationRule, generationLimit, compatibility }),
    basis: {
      candidate_source_ref: candidate.source_ref ?? null,
      graph_edge_ids: candidateContext.edgeIds,
      matched_landscape_template_ids: intersection(candidateContext.landscapeTemplateIds, asArray(template.compatible_landscape_template_ids)),
      matched_water_body_template_ids: intersection(candidateContext.waterBodyTemplateIds, asArray(template.compatible_water_body_template_ids)),
      matched_route_template_ids: intersection(candidateContext.routeTemplateIds, asArray(template.compatible_route_template_ids)),
      matched_land_use_template_ids: intersection(candidateContext.landUseTemplateIds, asArray(template.compatible_land_use_template_ids))
    }
  };
}

function evaluateScaleCompatibility(candidate, template) {
  const allowed = asArray(template.allowed_scale_levels);
  if (allowed.length > 0) return passCheck(allowed.includes(candidate.scale_level), `Candidate scale_level=${candidate.scale_level}; allowed=${allowed.join(',')}.`);
  if (template.typical_scale_level) return passCheck(template.typical_scale_level === candidate.scale_level, `Candidate scale_level=${candidate.scale_level}; typical_scale_level=${template.typical_scale_level}.`);
  return passCheck(true, 'No scale restriction declared.');
}

function evaluateNodeTypeCompatibility(candidate, template) {
  const allowed = asArray(template.allowed_node_types);
  if (allowed.length > 0) return passCheck(allowed.includes(candidate.node_type), `Candidate node_type=${candidate.node_type}; allowed=${allowed.join(',')}.`);
  if (template.default_node_type) return passCheck(template.default_node_type === candidate.node_type, `Candidate node_type=${candidate.node_type}; default_node_type=${template.default_node_type}.`);
  return passCheck(true, 'No node_type restriction declared.');
}

function evaluateGenerationRuleCompatibility(candidate, generationRule, policy) {
  if (candidate.place_template_id) return passCheck(true, 'Candidate already has a direct place_template_id; generation rule is not required.');
  if (policy.require_generation_rule_if_candidate_has_no_place_template_id === false) return passCheck(true, 'Policy does not require generation rule when candidate has no direct place_template_id.');
  return passCheck(Boolean(generationRule?.id), 'Candidate has no direct place_template_id, so a matching region_place_generation_rules record is required.');
}

function evaluateLandscapeCompatibility(candidateContext, template) {
  const compatible = asArray(template.compatible_landscape_template_ids);
  if (compatible.length === 0) return passCheck(true, 'No landscape compatibility list declared.');
  return passCheck(intersects(candidateContext.landscapeTemplateIds, compatible), `Candidate landscape templates ${candidateContext.landscapeTemplateIds.join(',') || 'none'} do not match ${compatible.join(',')}.`);
}

function evaluateWaterCompatibility(candidateContext, template, generationRule, generationLimit) {
  const compatible = asArray(template.compatible_water_body_template_ids);
  const hasWater = candidateContext.waterBodyTemplateIds.length > 0 || candidateContext.hasWaterEdge;
  if (template.requires_water_nearby || generationLimit?.water_basis_required || hasText(generationRule?.required_water_access)) {
    if (!hasWater) return passCheck(false, 'Template/rule/limit requires water access, but candidate has no water body or water edge evidence.');
  }
  if (compatible.length > 0 && !intersects(candidateContext.waterBodyTemplateIds, compatible)) {
    return passCheck(false, `Candidate water body templates ${candidateContext.waterBodyTemplateIds.join(',') || 'none'} do not match ${compatible.join(',')}.`);
  }
  return passCheck(true, hasWater ? 'Water evidence present or not required.' : 'Water not required.');
}

function evaluateRouteCompatibility(candidateContext, template, generationRule, generationLimit) {
  const compatible = asArray(template.compatible_route_template_ids);
  const hasRoute = candidateContext.routeTemplateIds.length > 0 || candidateContext.hasRouteEdge;
  if (template.requires_route_nearby || generationLimit?.route_basis_required || hasText(generationRule?.required_route_access)) {
    if (!hasRoute) return passCheck(false, 'Template/rule/limit requires route access, but candidate has no route edge evidence.');
  }
  if (compatible.length > 0 && !intersects(candidateContext.routeTemplateIds, compatible)) {
    return passCheck(false, `Candidate route templates ${candidateContext.routeTemplateIds.join(',') || 'none'} do not match ${compatible.join(',')}.`);
  }
  return passCheck(true, hasRoute ? 'Route evidence present or not required.' : 'Route not required.');
}

function evaluateLandUseCompatibility(candidateContext, template, generationRule, generationLimit) {
  const compatible = asArray(template.compatible_land_use_template_ids);
  const hasLandUse = candidateContext.landUseTemplateIds.length > 0;
  const economyRequired = template.requires_land_use || generationLimit?.economic_basis_required || hasText(generationRule?.required_economy);
  if (economyRequired && !hasLandUse && !hasText(generationRule?.required_economy)) return passCheck(false, 'Template/rule/limit requires land use or economic basis, but candidate has no land_use_template_ids.');
  if (compatible.length > 0 && !intersects(candidateContext.landUseTemplateIds, compatible)) {
    return passCheck(false, `Candidate land use templates ${candidateContext.landUseTemplateIds.join(',') || 'none'} do not match ${compatible.join(',')}.`);
  }
  return passCheck(true, hasLandUse ? 'Land use evidence present or not required.' : 'Land use not required.');
}

function evaluateGenerationLimits({ candidate, generationLimit, existingCount, candidateContext, generationRule }) {
  if (!generationLimit) return passCheck(true, 'No place_generation_limits record declared for this template.');
  const failures = [];
  if (Number.isFinite(Number(generationLimit.max_total)) && existingCount >= Number(generationLimit.max_total)) failures.push(`max_total=${generationLimit.max_total} is already reached by graph_nodes count=${existingCount}.`);
  if (generationLimit.water_basis_required && !(candidateContext.waterBodyTemplateIds.length > 0 || candidateContext.hasWaterEdge)) failures.push('water_basis_required=true but no water evidence exists.');
  if (generationLimit.route_basis_required && !(candidateContext.routeTemplateIds.length > 0 || candidateContext.hasRouteEdge)) failures.push('route_basis_required=true but no route evidence exists.');
  if (generationLimit.economic_basis_required && candidateContext.landUseTemplateIds.length === 0 && !hasText(generationRule?.required_economy)) failures.push('economic_basis_required=true but no land use or rule economic basis exists.');
  if (generationLimit.authority_basis_required && !hasText(generationRule?.typical_authority)) failures.push('authority_basis_required=true but matching generation rule has no typical_authority.');
  if (generationLimit.historical_anchor_basis_required && !hasText(candidate.historical_status) && asArray(candidate.known_landmarks).length === 0) failures.push('historical_anchor_basis_required=true but candidate has no historical_status or known_landmarks.');
  return passCheck(failures.length === 0, failures.join(' '));
}

function evaluateSourceRequirements(template, generationRule, generationLimit, policy) {
  if (!policy.require_sources) return passCheck(true, 'Source requirement disabled by policy.');
  const hasRegionLinkSource = asArray(template.region_place_template_sources).length > 0;
  const hasTemplateSource = asArray(template.place_template_sources).length > 0;
  const hasRuleSource = !generationRule || asArray(generationRule.sources).length > 0;
  const hasLimitSource = !generationLimit || asArray(generationLimit.sources).length > 0;
  return passCheck(hasRegionLinkSource && hasTemplateSource && hasRuleSource && hasLimitSource, 'Stage 6 requires sources on region_place_templates, place_templates, and any matching generation rule/limits records.');
}

function evaluateHardConstraints({ normalizedRequest, candidate, template }) {
  const hardConstraints = readHardConstraints(normalizedRequest);
  const text = normalizeText([template.slug, template.title, template.place_kind, template.summary, template.access_logic, template.social_logic, template.economic_logic, template.defense_logic, candidate.node_type, candidate.title].filter(Boolean).join(' '));
  const failures = [];
  if (hardConstraints.no_city_start && /\b(city|posad|urban|town)\b|город|посад/u.test(text)) failures.push('no_city_start conflicts with city/urban place template.');
  if (hardConstraints.no_religious_start && /monastery|church|cathedral|cleric|clergy|religious|монастыр|церк|собор|духов/u.test(text)) failures.push('no_religious_start conflicts with religious place template.');
  if (hardConstraints.no_combat_start && /fortress|watch|guard|combat|military|battle|крепост|страж|застав|военн|битв/u.test(text)) failures.push('no_combat_start conflicts with military/defense place template.');
  if (hardConstraints.no_wilderness_start && /wilderness|forest_camp|hunting_camp|winter_hut|wild|дикий|пустош|лесн.*стан|зимов/u.test(text)) failures.push('no_wilderness_start conflicts with wilderness place template.');
  if (hardConstraints.no_noble_environment && /noble|elite|boyar|prince|manor|estate|княж|бояр|знат|усад/u.test(text)) failures.push('no_noble_environment conflicts with noble/elite place template.');
  if (hardConstraints.historical_consistency_required && template.place_template_status !== 'approved') failures.push('historical_consistency_required requires approved place_template status.');
  return passCheck(failures.length === 0, failures.join(' '));
}

function evaluateClockAccess(clock = {}, template) {
  const timeOfDay = clock?.time_of_day ?? null;
  const text = normalizeText(template.access_logic ?? '');
  if (!timeOfDay || !text) return passCheck(true, 'No clock/access conflict declared.');
  const isNight = ['night', 'deep_night'].includes(timeOfDay);
  if (isNight && /closed at night|not at night|daylight only|только днем|только днём|ночью закрыт|закрыт ночью/u.test(text)) {
    return passCheck(false, `Template access_logic appears incompatible with time_of_day=${timeOfDay}.`);
  }
  return passCheck(true, 'No explicit clock/access conflict detected.');
}

function buildCandidateContext(candidate, candidateEdges) {
  const edgeLandscapeIds = candidateEdges.map((edge) => edge.landscape_template_id).filter(Boolean);
  const edgeWaterIds = candidateEdges.map((edge) => edge.water_body_template_id).filter(Boolean);
  const edgeRouteIds = candidateEdges.map((edge) => edge.route_template_id).filter(Boolean);
  const edgeTypes = candidateEdges.map((edge) => edge.edge_type).filter(Boolean);
  return {
    edgeIds: unique(candidateEdges.map((edge) => edge.id).filter(Boolean)),
    edgeTypes: unique(edgeTypes),
    landscapeTemplateIds: unique([
      candidate.landscape_template_id,
      candidate.primary_landscape_template_id,
      ...asArray(candidate.secondary_landscape_template_ids),
      ...edgeLandscapeIds
    ].filter(Boolean)),
    waterBodyTemplateIds: unique([
      candidate.water_body_template_id,
      candidate.primary_water_body_template_id,
      ...asArray(candidate.secondary_water_body_template_ids),
      ...edgeWaterIds
    ].filter(Boolean)),
    routeTemplateIds: unique(edgeRouteIds),
    landUseTemplateIds: unique(asArray(candidate.land_use_template_ids).filter(Boolean)),
    hasWaterEdge: edgeTypes.some((type) => WATER_EDGE_TYPES.includes(type)),
    hasRouteEdge: edgeTypes.some((type) => ROUTE_EDGE_TYPES.includes(type))
  };
}

function buildCandidateTemplateLink({ candidate, template, generationRule, generationLimit, evaluation }) {
  const linkId = `candidate_place_template_link:${safeId(candidate.candidate_id ?? candidate.node_id)}:${safeId(template.place_template_id)}`;
  const sourceTraceRows = [
    traceRow('world_base.region_place_templates', template.region_place_template_id, template.region_place_template_status, template.region_place_template_confidence, template.region_place_template_sources),
    traceRow('world_base.place_templates', template.place_template_id, template.place_template_status, template.place_template_confidence, template.place_template_sources),
    generationRule ? traceRow('world_base.region_place_generation_rules', generationRule.id, generationRule.status, generationRule.confidence, generationRule.sources) : null,
    generationLimit ? traceRow('world_base.place_generation_limits', generationLimit.id, generationLimit.status, generationLimit.confidence, generationLimit.sources) : null,
    candidate.source_ref ? { ...candidate.source_ref, kind: 'candidate_source' } : null
  ].filter(Boolean);

  return {
    candidate_place_template_link_id: linkId,
    link_id: linkId,
    candidate_id: candidate.candidate_id,
    node_id: candidate.node_id,
    place_template_id: template.place_template_id,
    region_place_template_id: template.region_place_template_id,
    place_kind: template.place_kind,
    scale_level: candidate.scale_level,
    node_type: candidate.node_type,
    place_template: {
      id: template.place_template_id,
      slug: template.slug,
      title: template.title,
      summary: template.summary,
      place_kind: template.place_kind,
      default_node_type: template.default_node_type,
      typical_scale_level: template.typical_scale_level,
      requires_water_nearby: template.requires_water_nearby,
      requires_route_nearby: template.requires_route_nearby,
      requires_land_use: template.requires_land_use,
      compatible_landscape_template_ids: asArray(template.compatible_landscape_template_ids),
      compatible_water_body_template_ids: asArray(template.compatible_water_body_template_ids),
      compatible_route_template_ids: asArray(template.compatible_route_template_ids),
      compatible_land_use_template_ids: asArray(template.compatible_land_use_template_ids),
      access_logic: template.access_logic,
      social_logic: template.social_logic,
      economic_logic: template.economic_logic,
      defense_logic: template.defense_logic,
      game_use: template.place_template_game_use,
      limits: template.place_template_limits,
      status: template.place_template_status,
      confidence: template.place_template_confidence,
      sources: asArray(template.place_template_sources)
    },
    region_link: {
      id: template.region_place_template_id,
      region_id: template.region_id,
      place_template_id: template.place_template_id,
      is_allowed: template.is_allowed,
      is_common: template.is_common,
      is_rare: template.is_rare,
      generation_weight: Number(template.generation_weight ?? 0),
      allowed_scale_levels: asArray(template.allowed_scale_levels),
      allowed_node_types: asArray(template.allowed_node_types),
      regional_limits: template.regional_limits,
      game_use: template.region_place_template_game_use,
      limits: template.region_place_template_limits,
      status: template.region_place_template_status,
      confidence: template.region_place_template_confidence,
      sources: asArray(template.region_place_template_sources)
    },
    template_source: candidate.place_template_id ? 'candidate.place_template_id' : 'region_place_generation_rules',
    generation_rule: generationRule ? compactRecord(generationRule, [
      'id', 'template_type', 'title', 'summary', 'required_landscape', 'required_economy',
      'required_route_access', 'required_water_access', 'seasonal_availability',
      'typical_population_band', 'typical_household_count', 'typical_wealth_level',
      'typical_authority', 'typical_social_roles', 'typical_occupations', 'layout_rules',
      'access_rules', 'trade_rules', 'defense_rules', 'npc_generation_rules',
      'item_generation_rules', 'route_generation_rules', 'historical_plausibility_rules',
      'status', 'confidence', 'sources'
    ]) : null,
    generation_limits: generationLimit ? compactRecord(generationLimit, [
      'id', 'max_total', 'max_per_subregion', 'min_total_if_region_active',
      'economic_basis_required', 'route_basis_required', 'water_basis_required',
      'authority_basis_required', 'historical_anchor_basis_required',
      'allowed_near_place_types', 'forbidden_near_place_types', 'minimum_distance_band',
      'maximum_distance_band', 'density_logic', 'naming_policy', 'duplication_policy',
      'status', 'confidence', 'sources'
    ]) : null,
    compatibility: evaluation.compatibility,
    basis: evaluation.basis,
    warnings: evaluation.warnings,
    score: evaluation.score,
    source_trace: sourceTraceRows,
    source_ref: { table: 'world_base.region_place_templates', id: template.region_place_template_id }
  };
}

function buildRejectedTemplateLink({ candidate, template, evaluation }) {
  const firstFailure = evaluation.failures[0] ?? { code: 'TEMPLATE_REJECTED', message: 'Template rejected by compatibility checks.' };
  return {
    candidate_id: candidate.candidate_id,
    node_id: candidate.node_id,
    place_template_id: template.place_template_id,
    region_place_template_id: template.region_place_template_id,
    rejection_code: firstFailure.code,
    rejection_reason: firstFailure.message,
    evidence: [
      { kind: 'candidate', candidate_id: candidate.candidate_id, node_id: candidate.node_id, scale_level: candidate.scale_level, node_type: candidate.node_type },
      { kind: 'template', place_template_id: template.place_template_id, region_place_template_id: template.region_place_template_id },
      ...evaluation.failures.map((failure) => ({ kind: 'failed_check', code: failure.code, message: failure.message }))
    ]
  };
}

function finalizeAcceptedLinks(links, policy) {
  const sorted = [...links].sort((a, b) => b.score - a.score || String(a.candidate_place_template_link_id).localeCompare(String(b.candidate_place_template_link_id)));
  if (policy.allow_multiple_templates_per_candidate !== false) return sorted;
  const seen = new Set();
  return sorted.filter((link) => {
    if (seen.has(link.candidate_id)) return false;
    seen.add(link.candidate_id);
    return true;
  });
}

function buildTemplateIndex(links, templates, generationLimits) {
  const allowedPlaceTemplateIds = unique(links.map((link) => link.place_template_id).filter(Boolean));
  const templateRowsById = new Map(templates.map((template) => [template.place_template_id, template]));
  const limitRowsByTemplateId = new Map(generationLimits.map((limit) => [limit.place_template_id, limit]));
  const regionLinkByTemplateId = {};
  const placeTemplateById = {};
  const allowedScaleLevelsByTemplateId = {};
  const allowedNodeTypesByTemplateId = {};
  const generationWeightByTemplateId = {};
  const regionalLimitsByTemplateId = {};

  for (const placeTemplateId of allowedPlaceTemplateIds) {
    const template = templateRowsById.get(placeTemplateId) ?? links.find((link) => link.place_template_id === placeTemplateId)?.place_template ?? {};
    const link = links.find((item) => item.place_template_id === placeTemplateId);
    regionLinkByTemplateId[placeTemplateId] = link?.region_link ?? null;
    placeTemplateById[placeTemplateId] = link?.place_template ?? compactRecord(template, ['place_template_id', 'slug', 'title', 'place_kind', 'default_node_type', 'typical_scale_level', 'status', 'confidence', 'sources']);
    allowedScaleLevelsByTemplateId[placeTemplateId] = asArray(link?.region_link?.allowed_scale_levels ?? template.allowed_scale_levels);
    allowedNodeTypesByTemplateId[placeTemplateId] = asArray(link?.region_link?.allowed_node_types ?? template.allowed_node_types);
    generationWeightByTemplateId[placeTemplateId] = Number(link?.region_link?.generation_weight ?? template.generation_weight ?? 0);
    regionalLimitsByTemplateId[placeTemplateId] = limitRowsByTemplateId.get(placeTemplateId) ?? link?.generation_limits ?? null;
  }

  return {
    allowed_place_template_ids: allowedPlaceTemplateIds,
    place_template_by_id: placeTemplateById,
    region_place_template_link_by_template_id: regionLinkByTemplateId,
    allowed_scale_levels_by_template_id: allowedScaleLevelsByTemplateId,
    allowed_node_types_by_template_id: allowedNodeTypesByTemplateId,
    generation_weight_by_template_id: generationWeightByTemplateId,
    regional_limits_by_template_id: regionalLimitsByTemplateId
  };
}

function indexGenerationRulesByTemplate(templates, generationRules) {
  const byTemplateId = new Map();
  for (const template of templates) {
    const keys = unique([
      template.place_template_id,
      template.slug,
      template.place_kind,
      template.title
    ].map(normalizeKey).filter(Boolean));
    const match = generationRules.find((rule) => keys.includes(normalizeKey(rule.template_type)) || keys.includes(normalizeKey(rule.slug)) || keys.includes(normalizeKey(rule.title)));
    if (match) byTemplateId.set(template.place_template_id, match);
  }
  return byTemplateId;
}

function buildEdgeIndex(edges) {
  const edgeById = new Map();
  const edgesByNodeId = new Map();
  for (const edge of edges) {
    edgeById.set(edge.id, edge);
    pushToMap(edgesByNodeId, edge.from_node_id, edge);
    pushToMap(edgesByNodeId, edge.to_node_id, edge);
  }
  return { edgeById, edgesByNodeId };
}

function scoreTemplateCandidate({ candidate, template, generationRule, generationLimit, compatibility }) {
  let score = Number(template.generation_weight ?? 0);
  if (candidate.place_template_id === template.place_template_id) score += 100;
  if (generationRule) score += 20;
  if (generationLimit) score += 5;
  for (const result of Object.values(compatibility)) if (result?.pass === true) score += 1;
  if (template.is_common) score += 3;
  if (template.is_rare) score -= 2;
  return score;
}

function readHardConstraints(normalizedRequest = {}) {
  const raw = normalizedRequest?.hard_constraints ?? normalizedRequest?.constraints?.hard_constraints ?? normalizedRequest?.start_constraints ?? {};
  if (Array.isArray(raw)) return Object.fromEntries(raw.map((key) => [key, true]));
  if (raw && typeof raw === 'object') return raw;
  return {};
}

function compactRecord(row, keys) {
  const output = {};
  for (const key of keys) {
    if (row?.[key] !== undefined) output[key] = row[key];
  }
  return output;
}

function traceRow(table, id, status, confidence, sources) {
  return { table, id, status: status ?? null, confidence: confidence ?? null, sources: asArray(sources) };
}

function passCheck(pass, reason) {
  return { pass: pass === true, reason: reason || null };
}

function pushFailure(failures, code, message) {
  failures.push({ code, message });
}

function concern(code, message, extra = {}) {
  return { code, message, ...extra };
}

function hasText(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return String(value ?? '').trim().length > 0;
}

function normalizeText(value) {
  return String(value ?? '').toLowerCase();
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-zа-я0-9]+/giu, '_').replace(/^_+|_+$/gu, '');
}

function safeId(value) {
  return String(value ?? 'unknown').replace(/[^a-zA-Z0-9:_-]+/g, '_');
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item != null);
  if (value == null) return [];
  return [value];
}

function unique(values, keyFn = null) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const key = keyFn ? keyFn(value) : value;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function intersects(left, right) {
  return intersection(left, right).length > 0;
}

function intersection(left, right) {
  const rightSet = new Set(asArray(right));
  return unique(asArray(left).filter((value) => rightSet.has(value)));
}

function pushToMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

// Kept for compatibility with older tests/imports that used this helper indirectly.
export function isTemplateCompatible(candidate, template) {
  if (candidate.place_template_id && candidate.place_template_id !== template.place_template_id) return false;
  if (Array.isArray(template.allowed_scale_levels) && template.allowed_scale_levels.length > 0) {
    if (!jsonArrayIncludes(template.allowed_scale_levels, candidate.scale_level)) return false;
  }
  if (Array.isArray(template.allowed_node_types) && template.allowed_node_types.length > 0) {
    if (!jsonArrayIncludes(template.allowed_node_types, candidate.node_type)) return false;
  }
  if (template.typical_scale_level && template.typical_scale_level !== candidate.scale_level) return false;
  if (template.default_node_type && template.default_node_type !== candidate.node_type) return false;
  return true;
}
