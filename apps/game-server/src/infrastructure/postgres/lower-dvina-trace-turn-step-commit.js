import { loadLowerDvinaTraceScreenPresentation } from '../../internal/lower-dvina-trace-screen-presentation.js';
import { canonicalDigest } from '@rus/materialization';
import { requireTurnStepCommitEnvelope } from '@rus/turn';
import { serverError } from '../../errors.js';
import { SCENE_NPC_SOURCE, withoutSceneNpcs } from './scene-npcs-readback.js';
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
import { projectLowerDvinaTraceS1Capability,
  projectLowerDvinaTraceS1Resolutions } from
  '../../runtime/releases/lower-dvina-trace-s1-production.js';
import { applyBackgroundNpcSemanticPlan,
  createBackgroundNpcSemanticAtomicWritePlan } from
  './background-npc-semantic-atomic-write-plan.js';
import {
  applyS1LocalPositionTransition,
  backgroundNpcPlanMatchesEnvelope,
  projectBackgroundNpcRemainder
} from './lower-dvina-trace-turn-step-commit-projections.js';
import { applySiteTraversalTransition, siteTraversalWrites } from
  './spatial-v3-site-traversal-commit.js';
import { projectPreparedDomainState } from
  '../../runtime/lower-dvina-trace-turn-step-prepared-state-projection.js';

export async function commitLowerDvinaTraceTurnStep({
  partyId, writePlan, inputDigest, contracts, loadState, committer,
  turnStepAmbientPortionProfileRef = null, turnStepApprovedOwners = null,
  projectEnvironmentAtClock = null
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
  const preparedRoute = envelope.time_update?.prepared_effect_ledger?.slices
    ?.find((slice) => slice.operation_ref === 'request_movement'
      && slice.consequence?.position_transition?.destination_site_id != null);
  const preparedMovementState = preparedRoute != null
      && typeof turnStepApprovedOwners?.loadPreparedMovementScene === 'function'
      ? await turnStepApprovedOwners.loadPreparedMovementScene(
        { partyId, state: projectPreparedDomainState(state, preparedRoute),
          clock: envelope.time_update.clock_after })
    : null;
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
  let backgroundNpcSemanticPlan = null;
  try {
    if (writePlan.background_npc_semantic_atomic_write_plan != null) {
      backgroundNpcSemanticPlan = createBackgroundNpcSemanticAtomicWritePlan(
        writePlan.background_npc_semantic_atomic_write_plan);
      if (backgroundNpcSemanticPlan.party_id !== partyId
          || backgroundNpcSemanticPlan.change_set_id !== changeSetId
          || !backgroundNpcPlanMatchesEnvelope(
            backgroundNpcSemanticPlan, envelope, state)) {
        throw new Error();
      }
    }
  } catch {
    throw serverError('TRACE_TURN_STEP_BACKGROUND_NPC_SEMANTIC_PLAN_INVALID',
      'Background NPC semantic plan failed its sealed contract.',
      { status: 409 });
  }
  const destinationVisibleContext = preparedMovementState?.current_visible_context
    ?? envelope.consequence?.visible_seed?.destination_visible_context ?? null;
  const sourceVisibleContext = destinationVisibleContext == null
    ? envelope.visible_context
    : {
      ...destinationVisibleContext,
      visible_changes: [...new Set([
        ...(destinationVisibleContext.visible_changes ?? []),
        ...(envelope.visible_context.visible_changes ?? [])
      ])],
      uncertainties: [...new Set([
        ...(destinationVisibleContext.uncertainties ?? []),
        ...(envelope.visible_context.uncertainties ?? [])
      ])]
    };
  const ordinaryVisibleContext = ordinaryPlan == null ? sourceVisibleContext
    : applyOrdinaryMaterializationProjection({
      next: structuredClone(state), visibleContext: sourceVisibleContext, ordinaryPlan
    });
  const currentPosition = envelope.consequence?.position_transition?.to_position_ref
    ?? state.position?.position_id
    ?? state.position?.position_ref;
  const npcVisibleContext = projectBackgroundNpcRemainder({
    visibleContext: ordinaryVisibleContext,
    remainder: backgroundNpcSemanticPlan?.remainder
  });
  const committedS1VisibleContext = projectLowerDvinaTraceS1Capability({
    playerSafeState: npcVisibleContext,
    committedState: { ...state, position: { ...state.position,
      position_id: currentPosition } },
    resolverAvailable: true
  });
  const visibleContext = projectLowerDvinaTraceS1Resolutions({
    playerSafeState: committedS1VisibleContext,
    resolutions: spatialSemanticPlan == null ? [] : [{
        local_ref: spatialSemanticPlan.resolution.local_ref,
        position_ref: spatialSemanticPlan.resolution.position_ref,
        semantics: { kind: spatialSemanticPlan.formal_spatial_context.kind,
          ...spatialSemanticPlan.resolution.outcome } }]
  });
  const visibleEnvelopeInput = visibleContext === envelope.visible_context ? envelope
    : { ...envelope, visible_context: visibleContext };
  const visibleEnvelope = buildLowerDvinaTraceTurnStepVisibleEnvelope({
    partyId, turnNumber, nextVersion, changeSetId, idemId, envelope: visibleEnvelopeInput, contracts,
    currentLightPhase: projectEnvironmentAtClock?.({ state,
      clock: envelope.time_update.clock_after }).light_state ?? null
  });
  const base = buildLowerDvinaTraceTurnStepSnapshot({
    state, envelope, inputDigest, nextVersion, turnNumber, changeSetId,
    visibleEnvelope
  });
  applyOrdinaryMaterializationProjection({ next:base.snapshot,
    visibleContext:envelope.visible_context,ordinaryPlan,changeSetId });
  applyS1LocalPositionTransition({ snapshot: base.snapshot, state,
    transition: envelope.consequence.position_transition });
  applySiteTraversalTransition({ snapshot: base.snapshot, state,
    consequence: envelope.consequence });
  for (const plan of actionProductionPlans) {
    applyActionProductionProjection({ next: base.snapshot, plan });
  }
  for(const plan of localFirePlans)
    applyLocalFireProjection({ next: base.snapshot, plan });
  const backgroundNpcWrite = backgroundNpcSemanticPlan == null ? null
    : applyBackgroundNpcSemanticPlan({ plan: backgroundNpcSemanticPlan,
      state, snapshot: base.snapshot });
  const factual = {
    player_input: envelope.player_input,
    mode_resolution: envelope.mode_resolution,
    consequence: envelope.consequence,
    time_update: envelope.time_update,
    body_update: envelope.body_update
  };
  const turnStep = prepareLowerDvinaTraceTurnStepPersistence({
    partyId, writePlan, state, snapshot: base.snapshot, factual,
    changeSetId, idemId, turnStepAmbientPortionProfileRef,
    turnStepApprovedOwners, preparedMovementState
  });
  // Scene NPCs are read from party tables for projection, but never kept in the snapshot.
  const persistedSnapshot = withoutSceneNpcs(turnStep.snapshot);
  const pendingScenePosition = persistedSnapshot.position;
  const pendingPositionChanged = canonicalDigest(pendingScenePosition)
    !== canonicalDigest(state.position);
  const pendingSceneState = (preparedMovementState != null
      || pendingPositionChanged)
      && typeof turnStepApprovedOwners?.loadPreparedMovementScene === 'function'
    ? await turnStepApprovedOwners.loadPreparedMovementScene({
      partyId, state: { ...persistedSnapshot, position: pendingScenePosition,
        ...(destinationVisibleContext == null ? {}
          : { prepared_destination_visible_context: visibleContext }) },
      clock: envelope.time_update.clock_after
    })
    : preparedMovementState ?? state;
  const pendingProjectionState = withSceneNpcProjectionState({
    persistedSnapshot, sourceState: pendingSceneState,
    preparedPosition: pendingScenePosition
  });
  const pendingScreen = buildLowerDvinaTracePendingScreen({
    state: pendingProjectionState,
    presentation: await loadLowerDvinaTraceScreenPresentation(pendingProjectionState),
    turnId: envelope.root_turn_id,
    nextVersion,
    turnNumber,
    visibleEnvelope,
    turnConsequence: factual.consequence
  });
  const rootWrites = buildLowerDvinaTraceTurnStepRootWrites({
    partyId, state, snapshot: persistedSnapshot, envelope, nextVersion,
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
  if (backgroundNpcWrite != null) writes.updates.push(backgroundNpcWrite);
  const committedPublicResult = committedPendingPhase2PublicResult({
    payload: turnStep.snapshot, screen: pendingScreen
  });
  if (spatialSemanticPlan != null) {
    writes.inserts.push(...spatialSemanticRows(spatialSemanticPlan));
  }
  const siteTraversal = siteTraversalWrites({ partyId, envelope,
    changeSetId, idemId, turnNumber });
  if (siteTraversal.writes != null) {
    for (const key of ['inserts', 'updates', 'appends', 'deletes']) {
      writes[key].push(...siteTraversal.writes[key]);
    }
  }
    const built = await buildLowerDvinaTraceTurnStepCommitPlan({
      partyId, state, envelope, inputDigest, visibleEnvelope, writes,
      turnNumber, changeSetId, idemId, ordinaryPlan, actionProductionPlans,
      localFirePlans, spatialSemanticPlan,
      siteTraversalRechecks: siteTraversal.rechecks,
      temporalResults: envelope.time_update.temporal_results ?? []
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
      { status: 409, public_exposure: 'internal', details: committed.error }
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

function withSceneNpcProjectionState({ persistedSnapshot, sourceState,
  preparedPosition = null }) {
  const existingIds = new Set((persistedSnapshot.npcs ?? []).map(
    ({ instance_id: id }) => id).filter(Boolean));
  const sceneNpcs = (sourceState?.npcs ?? []).filter(({ instance_id: id,
    runtime_source: source }) => source === SCENE_NPC_SOURCE
      && id != null && !existingIds.has(id));
  return {
    ...persistedSnapshot,
    ...(preparedPosition == null ? {} : { position: preparedPosition }),
    npcs: [...(persistedSnapshot.npcs ?? []), ...sceneNpcs],
    ...(sourceState?.scene_position_g6 == null ? {} : {
      scene_position_g6: sourceState.scene_position_g6
    })
  };
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
