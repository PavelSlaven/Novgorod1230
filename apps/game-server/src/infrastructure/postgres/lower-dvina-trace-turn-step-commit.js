import { canonicalDigest } from '@rus/materialization';
import { requireTurnStepCommitEnvelope } from '@rus/turn';
import { serverError } from '../../errors.js';
import {
  mergeLowerDvinaTraceTurnStepWrites,
  prepareLowerDvinaTraceTurnStepPersistence
} from './lower-dvina-trace-turn-step-persistence.js';
import {
  buildLowerDvinaTraceTurnStepSnapshot,
  buildLowerDvinaTraceTurnStepRootWrites,
  buildLowerDvinaTraceTurnStepVisibleEnvelope
} from './lower-dvina-trace-turn-step-state.js';
import {
  buildLowerDvinaTraceTurnStepCheckWrites
} from './lower-dvina-trace-turn-step-checks.js';
import {
  buildLowerDvinaTraceTurnStepCommitPlan
} from './lower-dvina-trace-turn-step-commit-plan.js';
import {
  buildLowerDvinaTracePendingScreen
} from './lower-dvina-trace-turn-presentation.js';
import { committedPendingPhase2PublicResult } from
  './lower-dvina-trace-phase-2-projection.js';
import { applyOrdinaryMaterializationProjection, ordinaryPlanFromWritePlan } from './lower-dvina-trace-ordinary-p16.js';
import { createActionProducedAtomicWritePlan } from
  './action-produced-atomic-write-plan.js';
import { applyActionProductionProjection } from
  './lower-dvina-trace-action-production-projection.js';
import { applyLocalFireProjection, createLocalFireAtomicWritePlan } from
  './local-fire-atomic-write-plan.js';
import { createSpatialSemanticAtomicWritePlan } from
  './spatial-semantic-atomic-write-plan.js';
import { spatialSemanticRows } from './spatial-semantic-atomic-write-plan.js';
import { projectLowerDvinaTraceS1Resolutions } from
  '../../runtime/releases/lower-dvina-trace-s1-production.js';

export async function commitLowerDvinaTraceTurnStep({
  partyId, writePlan, inputDigest, contracts, loadState, committer
}) {
  const envelope = requireEnvelope(writePlan);
  assertRootInput({ partyId, inputDigest, envelope });
  const state = await loadState(partyId, {
    presentationIdempotencyKey: envelope.player_input.idempotency_key
  });
  if (state.party_state.state_version !== envelope.base_state_version
      || writePlan.base_state_version !== envelope.base_state_version
      || state.party_state.turn_number + 1
        !== envelope.player_input.turn_number) {
    throw serverError(
      'TRACE_TURN_STEP_STATE_STALE',
      'Semantic turn-step base state changed before commit.',
      { status: 409 }
    );
  }
  const nextVersion = state.party_state.state_version + 1;
  const turnNumber = state.party_state.turn_number + 1;
  const changeSetId = `change:${partyId}:turn-step:${turnNumber}`;
  const idemId = `idem:${partyId}:${canonicalDigest(
    envelope.player_input.idempotency_key
  ).slice(0, 20)}`;
  let ordinaryPlan;
  try { ordinaryPlan = ordinaryPlanFromWritePlan(writePlan, partyId); }
  catch { throw serverError('TRACE_TURN_STEP_ORDINARY_PLAN_INVALID',
    'Ordinary atomic plan failed its sealed contract.', { status: 409 }); }
  let actionProductionPlans = [];
  try {
    if (!Array.isArray(writePlan.action_production_atomic_write_plans ?? [])) {
      throw new Error();
    }
    actionProductionPlans = (writePlan.action_production_atomic_write_plans
      ?? []).map(createActionProducedAtomicWritePlan);
    if (actionProductionPlans.some((plan) => plan.party_id !== partyId
      || plan.change_set_id !== changeSetId)) throw new Error();
  } catch {
    throw serverError('TRACE_TURN_STEP_ACTION_PRODUCTION_PLAN_INVALID',
      'Action-production atomic plan failed its sealed contract.',
      { status: 409 });
  }
  let localFirePlans=[];
  try{
    if(!Array.isArray(writePlan.local_fire_atomic_write_plans??[]))throw new Error();
    localFirePlans=(writePlan.local_fire_atomic_write_plans??[])
      .map(createLocalFireAtomicWritePlan);
    if(localFirePlans.some((plan)=>plan.party_id!==partyId
      ||plan.change_set_id!==changeSetId))throw new Error();
  }catch{
    throw serverError('TRACE_TURN_STEP_LOCAL_FIRE_PLAN_INVALID',
      'Local-fire atomic plan failed its contract.',{status:409});
  }
  let spatialSemanticPlan = null;
  try {
    if (writePlan.spatial_semantic_atomic_write_plan != null) {
      spatialSemanticPlan = createSpatialSemanticAtomicWritePlan(
        writePlan.spatial_semantic_atomic_write_plan);
      if (spatialSemanticPlan.party_id !== partyId
          || spatialSemanticPlan.change_set_id !== changeSetId) throw new Error();
    }
  } catch {
    throw serverError('TRACE_TURN_STEP_SPATIAL_SEMANTIC_PLAN_INVALID',
      'Spatial semantic atomic plan failed its sealed contract.', { status: 409 });
  }
  const ordinaryVisibleContext = ordinaryPlan == null ? envelope.visible_context
    : applyOrdinaryMaterializationProjection({
      next: structuredClone(state), visibleContext: envelope.visible_context, ordinaryPlan
    });
  const currentPosition = state.position?.position_id
    ?? state.position?.position_ref;
  const committedSpatialResolutions = (state.spatial_semantic ?? [])
    .flatMap(({ resolutions = [] }) => resolutions)
    .filter(({ position_ref: positionRef }) => positionRef === currentPosition);
  const visibleContext = projectLowerDvinaTraceS1Resolutions({
    playerSafeState: ordinaryVisibleContext,
    resolutions: [...committedSpatialResolutions,
      ...(spatialSemanticPlan == null ? [] : [{
        local_ref: spatialSemanticPlan.resolution.local_ref,
        position_ref: spatialSemanticPlan.resolution.position_ref,
        semantics: { kind: spatialSemanticPlan.formal_spatial_context.kind,
          ...spatialSemanticPlan.resolution.outcome } }])]
  });
  const visibleEnvelopeInput = visibleContext === envelope.visible_context ? envelope
    : { ...envelope, visible_context: visibleContext };
  const visibleEnvelope = buildLowerDvinaTraceTurnStepVisibleEnvelope({
    partyId, turnNumber, nextVersion, changeSetId, idemId, envelope: visibleEnvelopeInput, contracts
  });
  const base = buildLowerDvinaTraceTurnStepSnapshot({
    state, envelope, inputDigest, nextVersion, turnNumber, changeSetId,
    visibleEnvelope
  });
  applyOrdinaryMaterializationProjection({ next:base.snapshot,
    visibleContext:envelope.visible_context,ordinaryPlan,changeSetId });
  applyS1LocalPositionTransition({ snapshot: base.snapshot, state,
    transition: envelope.consequence.position_transition });
  for (const plan of actionProductionPlans) {
    applyActionProductionProjection({ next: base.snapshot, plan });
  }
  for(const plan of localFirePlans)
    applyLocalFireProjection({ next: base.snapshot, plan });
  const factual = {
    player_input: envelope.player_input,
    mode_resolution: envelope.mode_resolution,
    consequence: envelope.consequence,
    time_update: envelope.time_update,
    body_update: envelope.body_update
  };
  const turnStep = prepareLowerDvinaTraceTurnStepPersistence({
    partyId, writePlan, state, snapshot: base.snapshot, factual,
    changeSetId, idemId
  });
  const pendingScreen = buildLowerDvinaTracePendingScreen({
    state,
    turnId: envelope.root_turn_id,
    nextVersion,
    turnNumber,
    visibleEnvelope,
    turnStepTrace: envelope.loop_trace
  });
  const rootWrites = buildLowerDvinaTraceTurnStepRootWrites({
    partyId, state, snapshot: turnStep.snapshot, envelope, nextVersion,
    turnNumber, changeSetId, idemId, pendingScreen,
    clockChanged: base.clockChanged
  });
  rootWrites.appends.push(...buildLowerDvinaTraceTurnStepCheckWrites({
    partyId, envelope, inputDigest, changeSetId, idemId
  }));
  const writes = mergeLowerDvinaTraceTurnStepWrites(
    rootWrites,
    turnStep.writes
  );
  const committedPublicResult = committedPendingPhase2PublicResult({
    payload: turnStep.snapshot, screen: pendingScreen
  });
  if (spatialSemanticPlan != null) {
    writes.inserts.push(...spatialSemanticRows(spatialSemanticPlan));
  }
    const built = await buildLowerDvinaTraceTurnStepCommitPlan({
      partyId, state, envelope, inputDigest, visibleEnvelope, writes,
      turnNumber, changeSetId, idemId, ordinaryPlan, actionProductionPlans,
      localFirePlans, spatialSemanticPlan
    });
  const committed = await committer.commit({
    plan: built.plan,
    created_at_turn: turnNumber
  });
  if (!committed.ok) {
    throw serverError(
      committed.error?.code === 'idempotency_conflict'
        ? 'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT'
        : 'TRACE_TURN_STEP_COMMIT_FAILED',
      'Semantic turn-step P16 commit failed closed.',
      { status: 409, details: committed.error }
    );
  }
  return {
    ...committed,
    state_version: nextVersion,
    turn_number: turnNumber,
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest,
    committed_public_result: committedPublicResult
  };
}

function applyS1LocalPositionTransition({ snapshot, state, transition }) {
  if (transition == null) return;
  if (transition.owner !== '@rus/movement-routes'
      || transition.actor_id !== state.actor_id
      || transition.from_position_ref !== state.position?.position_id
      || typeof transition.to_position_ref !== 'string'
      || !state.journey_location?.id
      || state.journey_location.scene_position_id !== transition.from_position_ref
      || !Number.isSafeInteger(Number(state.journey_location.state_version))) {
    throw serverError('TRACE_S1_MOVEMENT_TRANSITION_INVALID',
      'S1 local movement transition failed its committed position binding.', { status: 409 });
  }
  snapshot.position = { ...snapshot.position,
    position_id: transition.to_position_ref };
}

function requireEnvelope(writePlan) {
  try {
    return requireTurnStepCommitEnvelope(writePlan.turn_step_commit, {
      party_id: writePlan.party_id,
      turn_id: writePlan.turn_id,
      base_state_version: writePlan.base_state_version,
      command_trace: writePlan.command_trace,
      write_targets: writePlan.write_targets
    });
  } catch (cause) {
    throw serverError(
      'TRACE_TURN_STEP_COMMIT_ENVELOPE_INVALID',
      'Semantic turn-step commit envelope failed its public contract.',
      { status: 409, details: cause?.details }
    );
  }
}

function assertRootInput({ partyId, inputDigest, envelope }) {
  const expectedDigest = canonicalDigest({
    party_id: partyId,
    request_id: envelope.player_input.request_id,
    idempotency_key: envelope.player_input.idempotency_key,
    raw_text: envelope.player_input.raw_text
  });
  if (envelope.party_id !== partyId || expectedDigest !== inputDigest) {
    throw serverError(
      'TRACE_TURN_STEP_INPUT_IDENTITY_MISMATCH',
      'Semantic turn-step root input identity does not match the request.',
      { status: 409 }
    );
  }
}
