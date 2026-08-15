import { assertGatePassed, createGateResult } from '../gate.js';
import { retrieveNpcCandidates, validateNpcCandidateSet } from '../retrievers/npc-candidates.js';
import {
  buildStage7NpcCandidatesInput as buildModularStage7NpcCandidatesInput
} from '@rus/new-game/stages/stage-7/compat';

export async function runStage7NpcCandidates(context, input = {}, deps = {}) {
  const stageInput = {
    request_id: context.requestId,
    normalized_request: input.normalized_request ?? context.getStageOutput(2) ?? null,
    historical_frame: input.historical_frame ?? context.getStageOutput(3) ?? null,
    regional_context_package: input.regional_context_package ?? context.getStageOutput(4) ?? null,
    start_candidate_set: input.start_candidate_set ?? context.getStageOutput(5) ?? null,
    candidate_place_template_set: input.candidate_place_template_set ?? context.getStageOutput(6) ?? null,
    world_revision_id: input.world_revision_id ?? null,
    approved_actor_profile_snapshot:
      input.approved_actor_profile_snapshot ?? null,
    npc_candidate_policy: input.npc_candidate_policy ?? {}
  };
  const output = await retrieveNpcCandidates(stageInput, deps);
  const gate = runNpcCandidateSetGate(output, stageInput.npc_candidate_policy);
  context.setGateResult(7, gate);
  assertGatePassed(gate);
  context.setStageOutput(7, output);
  context.note(7, {
    label: 'npc_candidates',
    message: 'npc_candidates ready',
    responseRaw: { gate }
  });
  return output;
}

export function runNpcCandidateSetGate(output, policy = {}) {
  const validation = validateNpcCandidateSet(output, { policy });
  return createGateResult({
    stageId: 7,
    stageSlug: 'npc_candidates',
    gateKind: 'npc_candidate_set_gate',
    pass: validation.pass,
    concerns: validation.concerns,
    evidence: validation.evidence
  });
}

export function validateNpcCandidateSetGate(output, policy = {}) {
  const gate = runNpcCandidateSetGate(output, policy);
  return {
    pass: gate.pass,
    concerns: gate.concerns,
    evidence: gate.evidence
  };
}

export function buildStage7NpcCandidatesInput(context, {
  normalizedRequest = null,
  historicalFrame = null,
  regionalContextPackage = null,
  startCandidateSet = null,
  candidatePlaceTemplateSet = null,
  worldRevisionId = null,
  approvedActorProfileSnapshot = null,
  npcCandidatePolicy = {}
} = {}) {
  return buildModularStage7NpcCandidatesInput(context, {
    normalizedRequest,
    historicalFrame,
    regionalContextPackage,
    startCandidateSet,
    candidatePlaceTemplateSet,
    worldRevisionId,
    approvedActorProfileSnapshot,
    npcCandidatePolicy
  });
}
