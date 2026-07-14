import { STAGE19_AUDIT_SCHEMA, STAGE19_OUTPUT_SCHEMA, STAGE19_RESULT_SCHEMA, OUTPUT_ARRAYS } from '../policy/constants.js';
import { validateStage19Input } from '../input/input-boundary.js';
import { buildStage19ReferenceIndex } from '../references/reference-index.js';
import { buildFullHiddenStateCodePrecheck } from '../validation/state-validation.js';
import { buildFullHiddenStateAuditInput, validateFullHiddenStateAudit, validateStage19CommitPermission } from '../audit/audit-boundary.js';
import { array, isObject, issue, safeClone } from '../shared/utils.js';

export async function runStage19HiddenStateBlock({ input, build = buildHiddenStateFromApprovedInputs, audit, auditFormatRepair = null, formatRepair = null } = {}) {
  const inputConcerns = validateStage19Input(input);
  if (inputConcerns.length > 0) throw stage19Error('Stage 19 input gate failed.', inputConcerns, { failedGate: 'stage19_input_gate', input_snapshot: safeClone(input), terminal: true });
  if (typeof build !== 'function') throw new TypeError('Stage 19 requires a code builder.');
  if (typeof audit !== 'function') throw new TypeError('Stage 19 requires an audit service.');

  const refs = buildStage19ReferenceIndex(input);
  const state = await build(structuredClone(input));
  const precheck = buildFullHiddenStateCodePrecheck(state, input, refs);
  if (!precheck.pass) throw stage19Error('Stage 19 code-generated state failed validation.', precheck.concerns, { failedGate: 'full_hidden_state_code_precheck', full_hidden_scene_state: safeClone(state), code_precheck: safeClone(precheck), terminal: true });

  let rawAudit = await audit(buildFullHiddenStateAuditInput(input, state, precheck, refs));
  let parsedAudit = parseRoleResult(rawAudit);
  let auditConcerns = parsedAudit.parseError ? [issue('HIDDEN_STATE_AUDIT_INVALID_JSON', parsedAudit.parseError, 'audit')] : validateFullHiddenStateAudit(parsedAudit.value, state, precheck);
  const repairAudit = auditFormatRepair ?? formatRepair;
  if (auditConcerns.length > 0 && typeof repairAudit === 'function') {
    rawAudit = await repairAudit({ version: 1, schema: 'full_hidden_state_audit_format_repair_input', request_id: input.request_id, target: STAGE19_AUDIT_SCHEMA, raw_output: rawAudit, validation_errors: auditConcerns, full_hidden_scene_state: state, full_hidden_state_code_precheck: precheck, constraints: { change_audit_format_only: true, do_not_repair_hidden_state: true } });
    parsedAudit = parseRoleResult(rawAudit);
    auditConcerns = parsedAudit.parseError ? [issue('HIDDEN_STATE_AUDIT_INVALID_JSON', parsedAudit.parseError, 'audit')] : validateFullHiddenStateAudit(parsedAudit.value, state, precheck);
  }
  if (auditConcerns.length > 0 || parsedAudit.value?.pass !== true) throw stage19Error('Stage 19 audit rejected the immutable code state.', auditConcerns.length ? auditConcerns : parsedAudit.value?.concerns, { failedGate: 'full_hidden_state_semantic_audit', full_hidden_scene_state: safeClone(state), code_precheck: safeClone(precheck), full_hidden_state_audit: safeClone(parsedAudit.value), terminal: true });
  const commitPermission = validateStage19CommitPermission(state, precheck, parsedAudit.value);
  if (!commitPermission.can_continue_to_visible_context) throw stage19Error('Stage 19 commit gate denied continuation.', commitPermission.reasons.map((reason) => issue('HIDDEN_STATE_COMMIT_DENIED', reason, 'commit_permission')), { failedGate: 'stage19_commit_gate', terminal: true });
  return {
    version: 1, schema: STAGE19_RESULT_SCHEMA, request_id: input.request_id, pass: true,
    full_hidden_scene_state: structuredClone(state), full_hidden_state_code_precheck: structuredClone(precheck),
    full_hidden_state_audit: structuredClone(parsedAudit.value), repair_history: [],
    diagnostics: { reference_index_summary: { npc_count: refs.npcIds.size, item_count: refs.itemIds.size, container_count: refs.containerIds.size, anchor_count: refs.anchorIds.size, g5_edge_count: refs.g5EdgeIds.size, graph_edge_count: refs.graphEdgeIds.size, route_id_count_before_commit: 0 } },
    commit_permission: commitPermission
  };
}

export function buildHiddenStateFromApprovedInputs(input) {
  const frame = input.time_light_consistency_audit?.authoritative_frame ?? {};
  const projectionSources = [
    ...(input.g5_scene_graph?.g5_minilocations ?? []),
    ...(input.g5_scene_graph?.g5_anchors ?? []),
    ...(input.g5_scene_graph?.g5_edges ?? []),
    ...(input.initial_npc_placement?.npc_instances ?? []),
    ...(input.initial_item_placement?.item_instances ?? []),
    ...(input.initial_item_placement?.container_instances ?? []),
    ...(input.world_base_route_snapshot?.nearby_graph_edges ?? []),
    ...(input.world_base_route_snapshot?.known_route_candidates ?? []),
    ...(input.world_base_route_snapshot?.historical_anchor_candidates ?? []),
    ...(input.world_base_route_snapshot?.route_knowledge_rule_candidates ?? [])
  ];
  const projected = Object.fromEntries(OUTPUT_ARRAYS.map((key) => [key, []]));
  const traces = [];
  for (const source of projectionSources) {
    const projection = source?.hidden_state_projection;
    if (projection == null) continue;
    if (!isObject(projection)) throw hiddenProjectionError('HIDDEN_STATE_PROJECTION_INVALID', 'hidden_state_projection must be an approved object.');
    for (const key of Object.keys(projection)) {
      if (!OUTPUT_ARRAYS.includes(key) || !Array.isArray(projection[key])) throw hiddenProjectionError('HIDDEN_STATE_PROJECTION_INVALID', `Unsupported or non-array hidden projection field: ${key}.`);
      projected[key].push(...safeClone(projection[key]));
    }
    traces.push(...array(source.source_trace));
  }
  const requiredProjectionSources = [
    ...(input.initial_npc_placement?.npc_instances ?? []).filter((npc) => ['scene', 'key'].includes(npc.profile_level)),
    ...(input.initial_item_placement?.container_instances ?? [])
  ];
  const missingProjection = requiredProjectionSources.find((source) => source.hidden_state_projection == null);
  if (missingProjection) throw hiddenProjectionError('HIDDEN_STATE_PROJECTION_MISSING', `Materialized entity ${missingProjection.npc_instance_id ?? missingProjection.container_instance_id ?? '<unknown>'} requires its own approved hidden_state_projection.`);
  const hasProjectedState = OUTPUT_ARRAYS.some((key) => projected[key].length > 0);
  const output = {
    version: 1, schema: STAGE19_OUTPUT_SCHEMA, request_id: input.request_id, hidden_state_status: hasProjectedState ? 'formed' : 'empty_limited',
    frame: { region_id: input.selected_start_node?.selected_node_chain?.g1_node_id ?? null, year: input.historical_frame?.calendar?.year ?? input.historical_frame?.year ?? null, season: input.historical_frame?.calendar?.season ?? null, clock: frame.clock ?? input.historical_frame?.clock ?? {}, weather_state: input.weather_state },
    parent_scene: { g4_node_id: input.selected_start_node?.selected_node_chain?.g4_node_id, player_current_anchor_id: input.g5_scene_graph?.player_start_position?.anchor_id },
    player_facing_boundary: {}, source_trace: traces.length > 0 ? traces : [{ source_id: 'approved_materialized_party_state', source_kind: 'code_projection', proof: 'no_applicable_hidden_projection' }],
    audit_self_check: { pass: true, concerns: [], evidence: [{ kind: 'code_validation' }] }
  };
  for (const key of OUTPUT_ARRAYS) output[key] = projected[key];
  return output;
}

function hiddenProjectionError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.lifecycle = { stage_id: 19, stage_slug: 'hidden_state', failed_gate: 'approved_hidden_projection', terminal_status: 'needs_manual_review' };
  return error;
}

export function parseRoleResult(raw) {
  const unwrapped = raw?.output ?? raw;
  if (typeof unwrapped !== 'string') return { value: unwrapped, raw: unwrapped, parseError: null };
  try { return { value: JSON.parse(unwrapped), raw: unwrapped, parseError: null }; }
  catch (error) { return { value: unwrapped, raw: unwrapped, parseError: error.message }; }
}

export function stage19Error(message, concerns, { failedGate = 'stage19_hidden_state_gate', terminal = false, ...snapshots } = {}) {
  const error = new Error(message);
  error.lifecycle = { stage_id: 19, stage_slug: 'hidden_state', stage_type: 'code_projection_with_llm_audit', failed_gate: failedGate, concerns: array(concerns), terminal_status: terminal ? 'needs_manual_review' : 'stage_failed', ...snapshots };
  error.semanticRecoveryRoute = { repair_kind: 'code_or_upstream_data', return_to_stage: terminal ? 'manual_review' : 'hidden_state', rerun_from_stage: 19, reason_code: array(concerns)[0]?.code ?? 'HIDDEN_STATE_FAILED', terminal_status: terminal ? 'needs_manual_review' : null };
  return error;
}
