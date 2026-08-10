import { commitLowerDvinaTracePhase3 } from
  './lower-dvina-trace-phase-3-commit.js';
import { commitLowerDvinaTracePhase8Accusation } from
  './lower-dvina-trace-phase-8-commit.js';

export async function routeLowerDvinaTracePhase8Commit({ factual, partyId,
  writePlan, inputDigest, phase8Contracts, turnStepApprovedOwners,
  loadState, committer }) {
  if (factual?.consequence?.phase8_kind === 'movement') return {
    handled: true, result: await commitLowerDvinaTracePhase3({ partyId,
      writePlan, inputDigest, phase3Contracts: phase8Contracts,
      turnStepApprovedOwners, loadState, committer }) };
  if (factual?.consequence?.phase8_kind === 'accusation') return {
    handled: true, result: await commitLowerDvinaTracePhase8Accusation({
      partyId, writePlan, inputDigest, phase8Contracts,
      turnStepApprovedOwners, loadState, committer }) };
  return { handled: false, result: null };
}
