import { assertGatePassed, createGateResult, runStartCandidateSetGate } from '../gate.js';
import { retrieveStartCandidates } from '../retrievers/start-candidates.js';

export async function runStage5StartCandidates(context, input = {}, deps = {}) {
  const candidatePolicy = input.candidate_policy ?? {};
  const output = await retrieveStartCandidates({ request_id: context.requestId, ...input }, deps);
  const gate = runStartCandidateSetGate({
    stageId: 5,
    stageSlug: 'start_candidates',
    output,
    policy: candidatePolicy
  });
  context.setGateResult(5, gate);
  assertGatePassed(gate);
  context.setStageOutput(5, output);
  context.note(5, {
    label: 'start_candidates',
    message: 'start_candidates ready',
    responseRaw: { gate }
  });
  return output;
}

export function validateStartCandidateSet(output, { policy = {} } = {}) {
  const gate = runStartCandidateSetGate({
    stageId: 5,
    stageSlug: 'start_candidates',
    output,
    policy
  });
  return {
    pass: gate.pass,
    concerns: gate.concerns,
    evidence: gate.evidence
  };
}

export function buildStage5StartCandidatesInput(context, {
  normalizedRequest = null,
  historicalFrame = null,
  regionalContextPackage = null,
  candidatePolicy = {}
} = {}) {
  return {
    normalized_request: normalizedRequest ?? context.getStageOutput(2) ?? null,
    historical_frame: historicalFrame ?? context.getStageOutput(3) ?? null,
    regional_context_package: regionalContextPackage ?? context.getStageOutput(4) ?? null,
    candidate_policy: candidatePolicy
  };
}
