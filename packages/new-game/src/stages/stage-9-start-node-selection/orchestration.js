import { HARD_INVALID_SELECTION_CODES, STAGE9_INPUT_SCHEMA, STAGE9_OUTPUT_SCHEMA } from './constants.js';
import { createStage9Gate } from './gate.js';
import { buildStage9StartNodeSelectorInputFromPipeline, normalizeStage9SelectionPolicy, validateStage9StartNodeSelectorInput } from './input.js';
import { concern } from './shared.js';
import { validateSelectedStartNode } from './validation.js';
import { issueBoundedDecisionRequest, validateBoundedDecisionResult } from '@rus/materialization';
import { allowedCandidateLinks, candidateChain, candidateIdOf, knownCandidateNodeIds, linkIdOf, placeTemplateIdOfLink, readAllowedCandidateIds, scaleOfCandidate } from './shared.js';

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

  const options = buildBoundedStartOptions(normalizedInput);
  if (options.length === 0) {
    const gate = createStage9Gate(null, normalizedInput, {
      pass: false,
      concerns: [concern('STAGE9_BOUNDED_OPTIONS_EMPTY', 'No allowed candidate/link pair can form a bounded start-node command.')],
      evidence: [{ kind: 'stage9_bounded_option_gate' }]
    });
    return buildStage9ManagedPipelineResult({ input: normalizedInput, output: null, gate, repairType: 'invalid_start_node_selection', status: 'blocked' });
  }
  let selectedOption = options[0];
  let decisionEvidence = { decision_protocol: 'code_singleton_v1', option_id: selectedOption.option_id };
  if (options.length > 1) {
    const executor = deps.executor ?? deps.llmStageExecutor ?? null;
    if (typeof executor !== 'function' || typeof deps.decisionSecret !== 'string' || !deps.decisionSecret || typeof deps.decisionExpiresAt !== 'string') {
      const gate = createStage9Gate(null, normalizedInput, { pass: false, concerns: [concern('STAGE9_BOUNDED_DECISION_DEPENDENCY_MISSING', 'Ambiguous Stage 9 selection requires an executor, decisionSecret and decisionExpiresAt.')], evidence: [{ kind: 'stage9_bounded_decision_gate' }] });
      return buildStage9ManagedPipelineResult({ input: normalizedInput, output: null, gate, repairType: 'start_node_selection_format_repair' });
    }
    try {
      const partyId = String(deps.partyId ?? normalizedInput.party_id ?? '').trim();
      if (!partyId) throw Object.assign(new Error('Ambiguous Stage 9 selection requires the target party identity.'), { code: 'STAGE9_PARTY_ID_MISSING' });
      const request = issueBoundedDecisionRequest({
        requestId: `${normalizedInput.request_id}:stage9`,
        partyId,
        actorId: 'new_game_start_selector',
        policyId: 'stage9_start_node_selection',
        policyVersion: '2', stateVersion: 0, expiresAt: deps.decisionExpiresAt, issuedAt: deps.now ?? new Date().toISOString(),
        options, secret: deps.decisionSecret
      });
      const raw = await executor({ input: request, stage: buildBoundedStageMeta() });
      const result = normalizeExecutorOutput(raw);
      const validated = validateBoundedDecisionResult({ request, result, secret: deps.decisionSecret, now: deps.now ?? new Date().toISOString(), currentPolicyVersion: '2' });
      selectedOption = options.find((option) => option.option_id === validated.option_id);
      decisionEvidence = { decision_protocol: 'bounded_decision_v2', option_id: validated.option_id, options_digest: request.options_digest, response_digest: validated.response_digest, bounded_decision_trace: { request, result: validated, validation_report: { pass: true, checked_state_version: request.state_version, checked_policy_version: request.policy_version } } };
    } catch (error) {
      const gate = createStage9Gate(null, normalizedInput, { pass: false, concerns: [concern(error.code ?? 'STAGE9_BOUNDED_DECISION_INVALID', error.message)], evidence: [{ kind: 'stage9_bounded_decision_gate' }] });
      return buildStage9ManagedPipelineResult({ input: normalizedInput, output: null, gate, repairType: 'start_node_selection_format_repair', technicalRetryExhausted: true });
    }
  }
  const output = buildSelectedStartNode(normalizedInput, selectedOption.metadata, decisionEvidence);
  const gate = await validateSelectedStartNode(output, normalizedInput, deps);
  if (!gate.pass) {
    const hardInvalid = gate.concerns.some((item) => HARD_INVALID_SELECTION_CODES.has(item.code));
    return buildStage9ManagedPipelineResult({ input: normalizedInput, output, gate, repairType: hardInvalid ? 'invalid_start_node_selection' : 'start_node_selection_format_repair', status: hardInvalid ? 'blocked' : 'requires_repair', technicalRetryExhausted: true });
  }
  return { stage_id: 9, stage_slug: 'start_node_selection', schema: 'stage_result', status: 'ready', output, gate, repair_request: null, attempts_used: options.length > 1 ? 1 : 0 };
}

export function buildBoundedStartOptions(input) {
  const allowedCandidates = new Set(readAllowedCandidateIds(input));
  return allowedCandidateLinks(input).filter(({ candidate }) => allowedCandidates.has(candidateIdOf(candidate))).map(({ candidate, link }, ordinal) => {
    const chain = candidateChain(candidate, link);
    const scale = scaleOfCandidate(candidate) || (chain.g4_node_id ? 'G4' : chain.g3_node_id ? 'G3' : chain.g2_node_id ? 'G2' : 'G1');
    const selectedNodeId = chain[`${scale.toLowerCase()}_node_id`] ?? [...knownCandidateNodeIds(candidate)].sort()[0];
    return {
      option_id: `stage9-option-${ordinal + 1}`,
      command_id: `select_start_option_${ordinal + 1}`,
      actor_id: 'new_game_start_selector',
      target_id: selectedNodeId,
      preconditions: [],
      expected_cost: { kind: 'start_selection', value: 0 },
      known_risks: [],
      reason_visible_to_actor: 'Выбор разрешённой стартовой позиции.',
      state_version: 0,
      metadata: { selected_candidate_id: candidateIdOf(candidate), selected_candidate_place_template_link_id: linkIdOf(link), selected_scale_level: scale, selected_node_id: selectedNodeId, selected_place_template_id: placeTemplateIdOfLink(link), selected_node_chain: chain, source_trace: [...(candidate.source_trace ?? candidate.sources ?? []), ...(link.source_trace ?? link.sources ?? [])] }
    };
  }).filter((option) => option.metadata.selected_candidate_id && option.metadata.selected_candidate_place_template_link_id && option.metadata.selected_node_id && option.metadata.selected_place_template_id);
}

export function buildSelectedStartNode(input, selected, decisionEvidence) {
  const sourceTrace = structuredClone(selected.source_trace ?? []);
  return {
    version: 1, schema: STAGE9_OUTPUT_SCHEMA, request_id: input.request_id, selection_status: 'selected',
    selected: { selected_candidate_id: selected.selected_candidate_id, selected_candidate_place_template_link_id: selected.selected_candidate_place_template_link_id, selected_scale_level: selected.selected_scale_level, selected_node_id: selected.selected_node_id, selected_place_template_id: selected.selected_place_template_id },
    selected_node_chain: structuredClone(selected.selected_node_chain),
    selection_reasoning: decisionEvidence,
    downstream_constraints: { selected_candidate_id: selected.selected_candidate_id, selected_candidate_place_template_link_id: selected.selected_candidate_place_template_link_id, do_not_create_world_entities: true },
    source_trace: sourceTrace,
    audit: { pass: true, concerns: [], evidence: [{ kind: 'code_bounded_selection', ...decisionEvidence }, ...sourceTrace] }
  };
}

export function buildBoundedStageMeta() {
  return { id: 9, slug: 'start_node_selection', type: 'bounded_semantic_decision', input_schema: 'bounded_decision_request_v2', output_schema: 'bounded_decision_result_v2', semantic_repair_allowed: false, prompt_contract: { exact_response_shape: true, choose_only_offered_option: true, prose_forbidden: true } };
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

export function buildStageMeta(attemptIndex, maxAttempts) {
  return { ...buildBoundedStageMeta(), attempt_index: attemptIndex, max_attempts: maxAttempts };
}

export function normalizeExecutorOutput(raw) {
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
