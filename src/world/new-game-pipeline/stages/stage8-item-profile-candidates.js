import { createGateResult } from '../gate.js';
import {
  normalizeStage8ItemProfilePolicy,
  retrieveItemProfileCandidates,
  validateItemProfileCandidateSet,
  validateStage8ItemProfileRetrieverInput
} from '../retrievers/item-profiles.js';

export const STAGE8_INPUT_SCHEMA = 'item_profile_retriever_input';
export const STAGE8_OUTPUT_SCHEMA = 'item_profile_candidate_set';

export function buildStage8ItemProfileInputFromPipeline(context, options = {}) {
  return {
    version: 1,
    schema: STAGE8_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? context.getStageOutput(2) ?? null,
    historical_frame: options.historical_frame ?? context.getStageOutput(3) ?? null,
    regional_context_package: options.regional_context_package ?? context.getStageOutput(4) ?? null,
    candidate_place_template_set: options.candidate_place_template_set ?? context.getStageOutput(6) ?? null,
    npc_candidate_set: options.npc_candidate_set ?? context.getStageOutput(7) ?? null,
    item_profile_policy: normalizeStage8ItemProfilePolicy(options.item_profile_policy ?? {})
  };
}

export { normalizeStage8ItemProfilePolicy, validateStage8ItemProfileRetrieverInput };

export async function runStage8ItemProfileRetriever(input, deps = {}) {
  const normalizedInput = {
    ...(input ?? {}),
    item_profile_policy: normalizeStage8ItemProfilePolicy(input?.item_profile_policy ?? {})
  };
  const inputGate = validateStage8ItemProfileRetrieverInput(normalizedInput);
  if (!inputGate.pass) {
    const gate = createStage8Gate(null, normalizedInput, inputGate);
    return buildStage8ManagedPipelineResult(null, gate, 'invalid_item_profile_retriever_input');
  }

  const output = await retrieveItemProfileCandidates(normalizedInput, deps);
  const gate = runItemProfileCandidateSetGate(output, normalizedInput);
  if (output?.selection_status !== 'ready' || gate.pass !== true) {
    return buildStage8ManagedPipelineResult(output, gate, output?.repair_request?.repair_type ?? 'item_profile_candidate_repair');
  }

  return {
    stage_id: 8,
    schema: 'stage_result',
    status: 'ready',
    output,
    gate,
    repair_request: null
  };
}

export async function runStage8ItemProfileCandidates(context, input = null, deps = {}) {
  const stageInput = input?.schema === STAGE8_INPUT_SCHEMA
    ? input
    : buildStage8ItemProfileInputFromPipeline(context, input ?? {});
  const result = await runStage8ItemProfileRetriever(stageInput, deps);
  context.setGateResult(8, result.gate);
  if (result.output) context.setStageOutput(8, result.output);
  context.setStageResult?.(8, result);
  context.note?.(8, {
    label: 'item_profile_candidates',
    message: result.status === 'ready' ? 'item_profile_candidates ready' : 'item_profile_candidates requires repair',
    responseRaw: { gate: result.gate, repair_request: result.repair_request }
  });
  return result.status === 'ready' ? result.output : result;
}

export function runItemProfileCandidateSetGate(output, input = {}) {
  const validation = validateItemProfileCandidateSet(output, { input, policy: input?.item_profile_policy ?? {} });
  return createStage8Gate(output, input, validation);
}

export function validateItemProfileCandidateSetGate(output, input = {}) {
  const gate = runItemProfileCandidateSetGate(output, input);
  return { pass: gate.pass, concerns: gate.concerns, evidence: gate.evidence };
}

export function buildStage8ManagedPipelineResult(output, gate, repairType = 'item_profile_candidate_repair') {
  return {
    stage_id: 8,
    schema: 'stage_result',
    status: 'requires_repair',
    output,
    gate,
    repair_request: output?.repair_request ?? {
      repair_type: repairType,
      llm_allowed: true,
      llm_mode: 'thinking',
      can_create_item: false,
      can_create_container_contents: false,
      can_create_inventory: false,
      can_create_world_base_record: false,
      can_change_historical_frame: false,
      can_change_candidate_place_template_set: false,
      can_change_npc_candidate_set: false
    }
  };
}

function createStage8Gate(output, input, validation) {
  return createGateResult({
    stageId: 8,
    stageSlug: 'item_profile_candidates',
    gateKind: 'item_profile_candidate_set_gate',
    pass: validation.pass,
    concerns: validation.concerns,
    evidence: validation.evidence
  });
}
