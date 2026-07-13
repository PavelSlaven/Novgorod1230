import { assertGatePassed, createGateResult } from '../gate.js';
import { retrieveCandidatePlaceTemplates, validateCandidatePlaceTemplateSet } from '../retrievers/place-templates.js';

export async function runStage6CandidatePlaceTemplates(context, input = {}, deps = {}) {
  const stageInput = {
    request_id: context.requestId,
    normalized_request: input.normalized_request ?? context.getStageOutput(2) ?? null,
    historical_frame: input.historical_frame ?? context.getStageOutput(3) ?? null,
    regional_context_package: input.regional_context_package ?? context.getStageOutput(4) ?? null,
    start_candidate_set: input.start_candidate_set ?? context.getStageOutput(5) ?? null,
    template_policy: input.template_policy ?? {}
  };
  const output = await retrieveCandidatePlaceTemplates(stageInput, deps);
  const gate = runCandidatePlaceTemplateSetGate(output, stageInput);
  context.setGateResult(6, gate);
  assertGatePassed(gate);
  context.setStageOutput(6, output);
  context.note(6, {
    label: 'candidate_place_templates',
    message: 'candidate_place_templates ready',
    responseRaw: { gate }
  });
  return output;
}

export function runCandidatePlaceTemplateSetGate(output, input = {}) {
  const validation = validateCandidatePlaceTemplateSet(output, input);
  return createGateResult({
    stageId: 6,
    stageSlug: 'candidate_place_templates',
    gateKind: 'candidate_place_template_contract_validation',
    pass: validation.pass,
    concerns: validation.concerns,
    evidence: validation.evidence
  });
}

export function validateCandidatePlaceTemplateSetGate(output, input = {}) {
  const gate = runCandidatePlaceTemplateSetGate(output, input);
  return {
    pass: gate.pass,
    concerns: gate.concerns,
    evidence: gate.evidence
  };
}

export function buildStage6CandidatePlaceTemplatesInput(context, {
  normalizedRequest = null,
  historicalFrame = null,
  regionalContextPackage = null,
  startCandidateSet = null,
  templatePolicy = {}
} = {}) {
  return {
    normalized_request: normalizedRequest ?? context.getStageOutput(2) ?? null,
    historical_frame: historicalFrame ?? context.getStageOutput(3) ?? null,
    regional_context_package: regionalContextPackage ?? context.getStageOutput(4) ?? null,
    start_candidate_set: startCandidateSet ?? context.getStageOutput(5) ?? null,
    template_policy: templatePolicy
  };
}
