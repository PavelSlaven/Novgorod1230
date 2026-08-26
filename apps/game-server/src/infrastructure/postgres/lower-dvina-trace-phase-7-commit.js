import { canonicalDigest } from '@rus/materialization';
import {serverError} from '../../errors.js';
import { assertPhase2CurrentStateVersion } from
  './lower-dvina-trace-phase-2-commit-admission.js';
import { nextPhase7State } from './lower-dvina-trace-phase-7-state.js';
import { assertPhase7OwnerResult } from
  './lower-dvina-trace-phase-7-owner-result.js';
import {
  phase7PendingScreen,
  phase7VisibleEnvelope,
  phase7Writes
} from './lower-dvina-trace-phase-7-writes.js';
import {
  mergeLowerDvinaTraceTurnStepWrites
} from './lower-dvina-trace-turn-step-persistence.js';
import { completeTurn10Phase7Factual } from
  './lower-dvina-trace-turn-10-phase7.js';
import { spatialSemanticRows } from './spatial-semantic-atomic-write-plan.js';
import { buildPhase7P16Plan } from './lower-dvina-trace-phase-7-commit-plan.js';
import { applyPhase7OwnerOutputProjection, phase7OwnerOutputPlans,
  preparePhase7OwnerOperationPersistence } from
  './lower-dvina-trace-phase-7-owner-output.js';
import { projectLowerDvinaTraceS1Resolutions } from
  '../../runtime/releases/lower-dvina-trace-s1-production.js';
export async function commitLowerDvinaTracePhase7({ partyId, writePlan,
  inputDigest, phase7Contracts, turn10Contracts, loadState, committer }) {
  const persistedFactual = target(writePlan, 'party_state');
  const factual = completeTurn10Phase7Factual(persistedFactual);
  const visibleContext = target(writePlan, 'party_visible_context_package');
  if (factual?.consequence?.phase7_kind !== 'fire_rest'
      || factual.consequence.duration_minutes !== 30
      || !factual.consequence.phase7
      || !visibleContext) {
    fail('TRACE_PHASE_7_WRITE_PLAN_INVALID');
  }
  const state = await loadState(partyId, {
    presentationIdempotencyKey: factual.player_input.idempotency_key
  });
  assertPhase2CurrentStateVersion({ writePlan, factual, state });
  const nextVersion = state.party_state.state_version + 1;
  const turnNumber = state.party_state.turn_number + 1;
  const changeSetId = `change:${partyId}:trace-phase7:${turnNumber}`;
  const idemId = `idem:${partyId}:${canonicalDigest(
    factual.player_input.idempotency_key
  ).slice(0, 20)}`;
  assertPhase7OwnerResult({ factual, state, phase7Contracts, changeSetId });
  const plans = phase7OwnerOutputPlans({
    ownerOutputs: factual.consequence.phase7.actor_step_owner_outputs, partyId,
    changeSetId, npcRef: factual.consequence.phase7.autonomous.request.npc_ref,
    rootTurnId: factual.consequence.phase7.autonomous.request.root_turn_id,
    committedStateVersion: state.party_state.state_version,
    semanticPlan: factual.consequence.phase7.autonomous.proposal.plan,
    carrierPlan: selectedCarrierPlan(factual.consequence.phase7),
    semanticOperations: selectedCarrierPlan(factual.consequence.phase7).operations,
    semanticRequest: factual.consequence.phase7.autonomous.request,
    registeredOwner: selectedCarrierPlan(factual.consequence.phase7).operations
      .filter(({ op }) => !['create_entity', 'move_entity',
        'change_entity_facts', 'set_entity_mechanics', 'retire_entity',
        'apply_body_event'].includes(op)).map(({ op }) => factual.consequence
          .phase7.autonomous.request.decision_scope.operation_contract[op]?.owner)
      .at(0) ?? null,
    temporalPlans: [...temporalLocalFirePlans(factual.consequence.phase7.temporal.result),
      ...temporalLocalFirePlans(factual.consequence.phase7.schedule_temporal.result)], fail
  });
  const { operationBatch, ordinaryPlan, actionProductionPlans, localFirePlans,
    spatialSemanticPlan } = plans;
  let next = nextPhase7State({
    state,
    factual,
    nextVersion,
    turnNumber,
    changeSetId,
    inputDigest,
    turn10Contracts
  });
  applyPhase7OwnerOutputProjection({ next, visibleContext, plans });
  const currentPosition = state.position?.position_id
    ?? state.position?.position_ref;
  const committedSpatialResolutions = (state.spatial_semantic ?? [])
    .flatMap(({ resolutions = [] }) => resolutions)
    .filter(({ position_ref: positionRef }) => positionRef === currentPosition);
  const projectedVisibleContext = projectLowerDvinaTraceS1Resolutions({
    playerSafeState: visibleContext,
    resolutions: committedSpatialResolutions
  });
  const visibleEnvelope = phase7VisibleEnvelope({
    partyId,
    nextVersion,
    turnNumber,
    changeSetId,
    idemId,
    factual,
    visibleContext: projectedVisibleContext,
    phase7Contracts
  });
  next.last_turn.visible_package = {
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest,
    change_set_id: changeSetId
  };
  const turnStep = preparePhase7OwnerOperationPersistence({
    partyId, writePlan, state, snapshot: next, factual: persistedFactual,
    changeSetId, idemId, operationBatch
  });
  next = turnStep.snapshot;
  const pendingScreen = phase7PendingScreen({
    state,
    factual,
    visibleEnvelope,
    turnNumber,
    nextVersion
  });
  const writes = mergeLowerDvinaTraceTurnStepWrites(phase7Writes({
    partyId,
    state,
    next,
    factual,
    turnNumber,
    changeSetId,
    idemId,
    visibleEnvelope,
    pendingScreen
  }), turnStep.writes);
  if (spatialSemanticPlan != null) {
    writes.inserts.push(...spatialSemanticRows(spatialSemanticPlan));
  }
  const built = await buildPhase7P16Plan({
    partyId, writePlan, inputDigest, phase7Contracts, state, factual,
    turnNumber, changeSetId, idemId, visibleEnvelope, writes, operationBatch,
    ordinaryPlan, actionProductionPlans, localFirePlans, spatialSemanticPlan
  });
  const committed = await committer.commit({
    plan: built.plan,
    created_at_turn: turnNumber
  });
  if (!committed.ok) {
    fail('TRACE_PHASE_7_COMMIT_FAILED', committed.error);
  }
  return {
    ...committed,
    state_version: nextVersion,
    turn_number: turnNumber,
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  };
}
function selectedCarrierPlan(phase7) {
  const plan = phase7.autonomous.proposal.plan;
  if (plan?.resolution !== 'generic_check') return plan;
  const selected = plan.check?.outcomes?.[
    phase7.actor_step_check?.result?.outcome?.band];
  return selected == null ? plan : { ...structuredClone(plan),
    operations: structuredClone(selected.operations) };
}
function temporalLocalFirePlans(result){return(result?.combined_change_set?.proposals??[]).flatMap((proposal)=>proposal.local_fire_atomic_write_plans??[]);} export async function buildLowerDvinaTracePhase7Commit({ partyId, factual,
  state, inputDigest, visibleContext, phase7Contracts,
  committer: suppliedCommitter = null }) {
  const writePlan={base_state_version:state.party_state.state_version,
    write_targets: [{ target: 'party_state', value: factual }, {
      target: 'party_visible_context_package', value: visibleContext
    }]};
  let captured=null;
  await commitLowerDvinaTracePhase7({
    partyId,
    writePlan,
    inputDigest,
    phase7Contracts,
    loadState: async () => state,
    committer: suppliedCommitter ?? {
      async commit(input) {
        captured = input;
        return { ok: true };
      }
    }
  });
  return captured;
}
const target = (writePlan, name) => writePlan.write_targets
  .find(({ target: id }) => id === name)?.value;
function fail(code, details = null) {
  throw serverError(code, 'Phase 7 factual commit failed closed.', {
    status: 409,
    details
  });
}
