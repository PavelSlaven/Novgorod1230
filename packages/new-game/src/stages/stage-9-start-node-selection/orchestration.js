import { HARD_INVALID_SELECTION_CODES, STAGE9_INPUT_SCHEMA, STAGE9_OUTPUT_SCHEMA } from './constants.js';
import { createStage9Gate } from './gate.js';
import { buildStage9StartNodeSelectorInputFromPipeline, normalizeStage9SelectionPolicy, validateStage9StartNodeSelectorInput } from './input.js';
import { concern } from './shared.js';
import { validateSelectedStartNode } from './validation.js';

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
