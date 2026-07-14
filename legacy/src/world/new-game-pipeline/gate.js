export function createGateResult({ stageId, stageSlug, gateKind = 'structural_validation', pass, concerns = [], evidence = [] } = {}) {
  return {
    stage_id: stageId ?? null,
    stage_slug: stageSlug ?? null,
    gate_kind: gateKind,
    pass: pass === true,
    concerns,
    evidence
  };
}

export function runCodeGate({
  stageId,
  stageSlug,
  output,
  requiredArrays = [],
  requiredFields = [],
  requirePassTrue = false
} = {}) {
  const concerns = [];

  for (const field of requiredFields) {
    if (readPath(output, field) == null) {
      concerns.push({
        code: 'NEW_GAME_GATE_MISSING_FIELD',
        field,
        message: `${stageSlug ?? `stage ${stageId}`} output is missing ${field}.`
      });
    }
  }

  for (const field of requiredArrays) {
    const value = readPath(output, field);
    if (!Array.isArray(value) || value.length === 0) {
      concerns.push({
        code: 'NEW_GAME_GATE_EMPTY_REQUIRED_SET',
        field,
        message: `${stageSlug ?? `stage ${stageId}`} requires non-empty ${field}.`
      });
    }
  }

  if (requirePassTrue === true && output?.pass !== true) {
    concerns.push({
      code: 'NEW_GAME_GATE_PASS_REQUIRED',
      field: 'pass',
      message: `${stageSlug ?? `stage ${stageId}`} output must have pass=true.`
    });
  }

  return createGateResult({
    stageId,
    stageSlug,
    gateKind: 'structural_validation',
    pass: concerns.length === 0,
    concerns,
    evidence: [{
      kind: 'code_gate',
      required_fields: requiredFields,
      required_arrays: requiredArrays,
      require_pass_true: requirePassTrue === true
    }]
  });
}

export function runStartCandidateSetGate({ stageId = 5, stageSlug = 'start_candidates', output, policy = {} } = {}) {
  const concerns = [];
  const candidateIds = new Set();
  const nodeIds = new Set();
  const candidates = Array.isArray(output?.candidates) ? output.candidates : [];
  const allowedSelectionStatuses = new Set(['ready', 'empty', 'blocked', 'requires_repair']);
  const requireSources = policy?.require_sources !== false;
  const preferG4ForStart = policy?.prefer_g4_for_start !== false;

  if (output?.version !== 1) concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', 'start_candidate_set.version must be 1.', 'version'));
  if (output?.schema !== 'start_candidate_set') concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', 'start_candidate_set.schema must be start_candidate_set.', 'schema'));
  if (!allowedSelectionStatuses.has(output?.selection_status)) concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', 'selection_status must be ready, empty, blocked or requires_repair.', 'selection_status'));
  if (output?.selection_status !== 'ready') concerns.push(gateConcern('NO_ALLOWED_START_CANDIDATES', 'Stage 5 can commit only a ready start_candidate_set.', 'selection_status'));
  if (!Array.isArray(output?.candidates) || output.candidates.length === 0) concerns.push(gateConcern('NEW_GAME_GATE_EMPTY_REQUIRED_SET', 'Stage 5 requires non-empty candidates when ready.', 'candidates'));
  if (!Array.isArray(output?.rejected_candidates)) concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', 'rejected_candidates must be an array.', 'rejected_candidates'));
  if (!Array.isArray(output?.candidate_groups)) concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', 'candidate_groups must be an array.', 'candidate_groups'));

  const startableIds = new Set(output?.downstream_constraints?.must_choose_from_candidate_ids ?? []);
  if (output?.selection_status === 'ready' && startableIds.size === 0) {
    concerns.push(gateConcern('NO_ALLOWED_START_CANDIDATES', 'downstream_constraints.must_choose_from_candidate_ids must contain at least one candidate id.', 'downstream_constraints.must_choose_from_candidate_ids'));
  }

  for (const forbiddenPath of ['selected_start_node_id', 'visible_scene', 'intro_prose', 'npc_ids', 'items', 'g5_anchor_id']) {
    if (readPath(output, forbiddenPath) != null) {
      concerns.push(gateConcern(forbiddenCode(forbiddenPath), `Stage 5 must not emit ${forbiddenPath}.`, forbiddenPath));
    }
  }

  for (const [index, candidate] of candidates.entries()) {
    const path = `candidates[${index}]`;
    if (!candidate?.candidate_id) concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', 'Candidate requires candidate_id.', `${path}.candidate_id`));
    if (candidate?.candidate_id && candidateIds.has(candidate.candidate_id)) concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', `Duplicate candidate_id ${candidate.candidate_id}.`, `${path}.candidate_id`));
    if (candidate?.candidate_id) candidateIds.add(candidate.candidate_id);

    const nodeId = candidate?.canonical_node?.node_id ?? candidate?.node_id ?? null;
    if (!nodeId) concerns.push(gateConcern('START_CANDIDATE_NODE_NOT_FOUND', 'Candidate requires canonical_node.node_id.', `${path}.canonical_node.node_id`));
    if (nodeId) nodeIds.add(nodeId);

    if (candidate?.canonical_node?.region_id !== output?.frame?.region_id) {
      concerns.push(gateConcern('START_CANDIDATE_REGION_MISMATCH', 'Candidate region_id must match start_candidate_set.frame.region_id.', `${path}.canonical_node.region_id`));
    }

    if (!['G1', 'G2', 'G3', 'G4'].includes(candidate?.canonical_node?.scale_level)) {
      concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', 'Candidate scale_level must be G1, G2, G3 or G4.', `${path}.canonical_node.scale_level`));
    }

    if (!hasRequiredParentChain(candidate?.canonical_node?.scale_level, candidate?.node_chain)) {
      concerns.push(gateConcern('START_CANDIDATE_BROKEN_PARENT_CHAIN', 'Candidate has an incomplete parent chain for its scale.', `${path}.node_chain`));
    }

    if (candidate?.candidate_status === 'rejected') {
      concerns.push(gateConcern('START_CANDIDATE_REJECTED_RECORD_USED', 'Rejected candidates must be placed in rejected_candidates, not candidates.', `${path}.candidate_status`));
    }

    if (!candidate?.score || !Number.isFinite(Number(candidate.score.value))) {
      concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', 'Candidate requires numeric score.value.', `${path}.score.value`));
    }

    if (requireSources) {
      const trace = Array.isArray(candidate?.source_trace) ? candidate.source_trace : [];
      if (trace.length === 0) concerns.push(gateConcern('START_CANDIDATE_SOURCE_MISSING', 'Candidate requires source_trace when require_sources=true.', `${path}.source_trace`));
      if (trace.every((item) => !Array.isArray(item.source_ids) || item.source_ids.length === 0)) {
        concerns.push(gateConcern('START_CANDIDATE_SOURCE_MISSING', 'Candidate source_trace must include source ids when require_sources=true.', `${path}.source_trace`));
      }
    }

    const compatibility = candidate?.compatibility ?? {};
    if (compatibility.region_match !== true) concerns.push(gateConcern('START_CANDIDATE_REGION_MISMATCH', 'Allowed candidate must have compatibility.region_match=true.', `${path}.compatibility.region_match`));
    if (compatibility.clock_match !== true) concerns.push(gateConcern('START_CANDIDATE_CLOCK_CONFLICT', 'Allowed candidate must have compatibility.clock_match=true.', `${path}.compatibility.clock_match`));
    if (compatibility.season_match !== true) concerns.push(gateConcern('START_CANDIDATE_SEASON_CONFLICT', 'Allowed candidate must have compatibility.season_match=true.', `${path}.compatibility.season_match`));
    if (compatibility.player_request_match === 'conflict') concerns.push(gateConcern('START_CANDIDATE_PLAYER_HARD_CONSTRAINT_CONFLICT', 'Allowed candidate must not conflict with player hard constraints.', `${path}.compatibility.player_request_match`));
    if (preferG4ForStart && candidate?.canonical_node?.scale_level === 'G4' && compatibility.g5_ready !== true) concerns.push(gateConcern('START_CANDIDATE_G5_NOT_READY', 'Allowed G4 candidate must be ready for later G5 materialization.', `${path}.compatibility.g5_ready`));

    if (candidate?.start_use?.can_start_here === true) {
      if (!startableIds.has(candidate.candidate_id)) concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', 'start_use.can_start_here candidate must be listed in downstream constraints.', `${path}.candidate_id`));
      if (candidate?.canonical_node?.scale_level !== 'G1' && candidate?.access?.has_entry_edge !== true && candidate?.access?.has_exit_edge !== true) {
        concerns.push(gateConcern('START_CANDIDATE_NO_ACCESS_EDGE', 'Startable candidate must have at least one entry or exit edge.', `${path}.access`));
      }
      if (!Array.isArray(candidate?.why_allowed) || candidate.why_allowed.length === 0) {
        concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', 'Startable candidate must explain why it is allowed.', `${path}.why_allowed`));
      }
    }
  }

  for (const candidateId of startableIds) {
    if (!candidateIds.has(candidateId)) concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', `downstream candidate id ${candidateId} is not present in candidates.`, 'downstream_constraints.must_choose_from_candidate_ids'));
  }

  if (output?.audit?.pass !== true) concerns.push(gateConcern('START_CANDIDATE_AUDIT_FAILED', 'start_candidate_set.audit.pass must be true.', 'audit.pass'));
  if (!Array.isArray(output?.audit?.evidence) || output.audit.evidence.length === 0) concerns.push(gateConcern('START_CANDIDATE_EMPTY_AUDIT_EVIDENCE', 'start_candidate_set.audit.evidence must be non-empty.', 'audit.evidence'));
  if (output?.audit?.pass === false && (!Array.isArray(output?.audit?.concerns) || output.audit.concerns.length === 0)) {
    concerns.push(gateConcern('START_CANDIDATE_SCHEMA_MISMATCH', 'Failed start_candidate_set.audit must include concerns.', 'audit.concerns'));
  }

  return createGateResult({
    stageId,
    stageSlug,
    gateKind: 'start_candidate_set_commit_gate',
    pass: concerns.length === 0,
    concerns,
    evidence: [{
      kind: 'start_candidate_set_gate',
      candidate_count: candidates.length,
      startable_candidate_count: startableIds.size,
      node_count: nodeIds.size,
      require_sources: requireSources
    }]
  });
}

export function assertGatePassed(result) {
  if (!result?.pass) {
    const details = (result?.concerns ?? []).map((item) => item.message ?? item.code).join('; ');
    throw new Error(`New-game stage gate failed: ${details || 'unknown gate failure'}`);
  }
  return result;
}

function gateConcern(code, message, field = null) {
  return { code, message, field };
}

function forbiddenCode(path) {
  if (path === 'selected_start_node_id') return 'START_CANDIDATE_SELECTED_FINAL_NODE_TOO_EARLY';
  if (path === 'visible_scene' || path === 'intro_prose') return 'START_CANDIDATE_CREATED_SCENE';
  if (path === 'npc_ids') return 'START_CANDIDATE_CREATED_NPC';
  if (path === 'items') return 'START_CANDIDATE_CREATED_ITEM';
  if (path === 'g5_anchor_id') return 'START_CANDIDATE_CREATED_G5';
  return 'START_CANDIDATE_DOWNSTREAM_ENTITY_CREATED';
}

function hasRequiredParentChain(scaleLevel, chain = {}) {
  if (scaleLevel === 'G1') return Boolean(chain.g1_node_id);
  if (scaleLevel === 'G2') return Boolean(chain.g1_node_id && chain.g2_node_id);
  if (scaleLevel === 'G3') return Boolean(chain.g1_node_id && chain.g2_node_id && chain.g3_node_id);
  if (scaleLevel === 'G4') return Boolean(chain.g1_node_id && chain.g2_node_id && chain.g3_node_id && chain.g4_node_id);
  return false;
}

function readPath(value, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}
