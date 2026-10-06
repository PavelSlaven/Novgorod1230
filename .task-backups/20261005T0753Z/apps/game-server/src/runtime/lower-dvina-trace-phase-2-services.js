import { isDeepStrictEqual } from 'node:util';
import { serverError } from '../errors.js';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  './lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  './lower-dvina-trace-player-safe-working.js';
import { createCommittedItemMechanicsResolver } from
  './lower-dvina-trace-committed-inventory.js';
import { createLowerDvinaTracePhase2ServiceFlow } from './lower-dvina-trace-phase-2-service-flow.js';
import { withLowerDvinaTraceCurrentScene } from
  './lower-dvina-trace-turn-step-current-scene.js';
import { createLowerDvinaTraceTurnStepPlayerSafeProjector } from
  './lower-dvina-trace-phase-2-player-safe.js';
import { runWithinTurnDeadline } from './llm-turn-budget.js';
import { createLowerDvinaTracePhase2StateReader } from './lower-dvina-trace-phase-2-state-reader.js';
import { actorMovementBlocked } from './lower-dvina-trace-phase-3-command-shared.js';
import { partyHistoricalEventsOf, playerWorldKnowledgeAuthoritativeFromState } from
  './world-knowledge-request-context.js';
import { deepFreeze } from '@rus/kernel';
import { loadLowerDvinaTraceScreenPresentation } from
  '../internal/lower-dvina-trace-screen-presentation.js';
export function buildLowerDvinaTracePhase2Services(context) {
  const {
    partyId, requestId, idempotencyKey, inputDigest, issuedAt, scenarioId,
    state, contracts, registry, repository, semanticResolver,
    turnStepModel, turnStepSemanticGroundingValidator, playerSafeStateProjector,
    locationProfiles, scenePresentation,
    turnStepBodyEventOwner, turnStepSemanticActivityOwner,
    turnStepGenericCheckContextOwner, turnStepGenericBodyEffect,
    turnStepOrdinaryDiscoveryResolver, createTurnStepOrdinaryDiscoveryResolver,
    createTurnStepOrdinaryContainerContentsResolver,
    turnStepNeedsCheckGuard = null,
    ordinaryDiscoveryEnablementMarker,
    ordinaryDiscoveryScopeBinding,
    createTurnStepActionProductionOwner,
    actionProductionProfile,
    createTurnStepWorldProcessResolver,
    localFireProfile,
    createTurnStepSpatialSemanticResolver,
    spatialSemanticProfile,
    createTurnStepBackgroundNpcResolver,
    npcSemanticRemainderProfile,
    admitAmbientOrdinaryPortion,
    requireAmbientOrdinaryAdmission,
    turnStepAmbientPortionProfileRef,
    turnStepOrdinaryResultPolicy,
    postActionPerceptionProfile,
    postActionPerceptionAdapter,
    postActionEnvironmentPort = null,
    turnStepApprovedOwners,
    turnStepPackingCalculator,
    turnBudget,
    narrator, randomSourceFactory, randomSource: injectedRandomSource,
    temporalAdvanceOwner,
    decisionSecret, phase3Contracts,
    phase4Contracts, phase5Contracts, phase6Contracts, phase7Contracts,
    turn10Contracts, phase8Contracts, phase9Contracts, phase10Contracts
  } = context;
  let committedPublicResult = null, turnCommitStatus = 'not_started';
  let preloadedSpatialRoutePresentation;
  // F7: narration WK uses post-commit party state when available (same as replay).
  let narrationAuthState = state;
  const trace = (record) => { try { context.llmDiagnostics?.recordGameplayTrace?.(record); }
    catch { /* Diagnostic capture must not affect gameplay. */ } };
  const recordNeedsCheckFilter = ({ path, queue_ids = [] }) => trace({
    event: 'needs_check_candidate_filtered', path,
    queue_id: queue_ids[0] ?? null,
    queue_ids: structuredClone(queue_ids)
  });
  const randomSource = injectedRandomSource ?? randomSourceFactory({
    party_id: partyId,
    request_id: requestId,
    idempotency_key: idempotencyKey
  });
  const needsCheckGuard = typeof turnStepNeedsCheckGuard === 'function'
    ? turnStepNeedsCheckGuard : null;
  const guardFactory = (factory) => typeof factory !== 'function'
    ? null : (input) => factory({ ...input,
      assertNeedsCheckAllowed: needsCheckGuard, recordNeedsCheckFilter });
  const spatialSemanticResolverFactory =
    guardFactory(createTurnStepSpatialSemanticResolver);
  const randomSnapshot = randomSource?.snapshot?.();
  if (!randomSnapshot?.algorithm
      || randomSnapshot.algorithm !== state.materialization_trace?.rng_version) {
    throw serverError(
      'TRACE_PHASE_2_RNG_PIN_MISMATCH',
      'The check RandomSource does not match the committed party RNG pin.',
      { status: 409 }
    );
  }
  const workingProjectionAuthority = createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
  const loadPreparedMovementScene = typeof repository.loadPreparedMovementScene
    === 'function' ? ({ partyId: preparedPartyId, state: preparedState,
      transaction = null }) =>
      repository.loadPreparedMovementScene({
        partyId: preparedPartyId, state: preparedState, turnBudget,
        ...(transaction == null ? {} : { transaction })
      }) : null;
  const projectCurrentScene = (committedState) => withLowerDvinaTraceCurrentScene({
    committedState, locationProfiles, scenePresentation
  });
  const { temporalAdvance, bodyEffect, evaluatePrecondition, createVisibleProjector } =
    createLowerDvinaTracePhase2ServiceFlow({
      contracts, inputDigest, phase3Contracts, phase4Contracts, phase5Contracts, phase6Contracts,
      phase7Contracts, turn10Contracts, phase8Contracts, phase9Contracts,
      temporalAdvanceOwner, turnStepGenericBodyEffect, scenePresentation
    });
  const turnStepPorts = createLowerDvinaTraceTurnStepRuntimePorts({
    bodyEffect,
    bodyEventOwner: turnStepBodyEventOwner,
    committedState: state,
    partyId,
    genericCheckContextOwner: turnStepGenericCheckContextOwner,
    ordinaryDiscoveryResolver: turnStepOrdinaryDiscoveryResolver
      ?? createTurnStepOrdinaryDiscoveryResolver?.({ partyId, inputDigest,
        assertNeedsCheckAllowed: needsCheckGuard,
        recordNeedsCheckFilter }),
    ordinaryContainerContentsResolver:
      createTurnStepOrdinaryContainerContentsResolver?.({partyId,inputDigest,
        assertNeedsCheckAllowed: needsCheckGuard, recordNeedsCheckFilter}),
    ordinaryResultPolicy: turnStepOrdinaryResultPolicy,
    admitAmbientOrdinaryPortion,
    requireAmbientOrdinaryAdmission,
    resolveItemMechanics: createCommittedItemMechanicsResolver(state, {
      packingCalculator: turnStepPackingCalculator
    }),
    semanticActivityOwner: turnStepSemanticActivityOwner,
    idempotencyKey,
    postActionPerceptionProfile,
    postActionPerceptionAdapter,
    postActionEnvironmentPort,
    projectCurrentScene,
    loadPreparedMovementScene,
    onNpcSceneProjection: context.onNpcSceneProjection,
    requestId,
    temporalAdvance,
    workingProjectionAuthority
  });
  const turnStepPlayerSafeStateProjector =
    createLowerDvinaTraceTurnStepPlayerSafeProjector({
      admitAmbientOrdinaryPortion,
      actionProductionProfile,
      createTurnStepActionProductionOwner:
        createTurnStepActionProductionOwner,
      localFireProfile,
      createTurnStepWorldProcessResolver,
      createTurnStepSpatialSemanticResolver:
        spatialSemanticResolverFactory,
      spatialSemanticProfile,
      createTurnStepBackgroundNpcResolver,
      npcSemanticRemainderProfile,
      ordinaryDiscoveryEnablementMarker,
      ordinaryDiscoveryScopeBinding,
      ordinaryDiscoveryResolver: turnStepPorts.ordinaryDiscoveryResolver,
      partyId,
      playerSafeStateProjector,
      scenePresentation,
      workingProjectionAuthority
    });
  const actionProductionOwner =
    typeof createTurnStepActionProductionOwner === 'function'
      && actionProductionProfile?.profile?.status === 'approved'
      ? createTurnStepActionProductionOwner({
          partyId, requestId, inputDigest,
          applyWorkingProjection: turnStepPorts.applyActionProductionProjection
        })
      : null;
  return {
    commandRegistry: registry,
    stateReader: createLowerDvinaTracePhase2StateReader({ repository, partyId,
      idempotencyKey, state, projectCurrentScene, turnBudget }),
    semanticResolver,
    // N1: per-request wrap binds committed events; no mutable model property.
    ...(turnStepModel ? {
      turnStepModel: (req, repair) => turnStepModel(req, repair, {
        historical_events: partyHistoricalEventsOf(state)
      })
    } : {}),
    // The outcome comes from structure only - the committed body/combat state and the
    // grounding of the chosen operation. The model's reason/reason_code is diagnostics
    // (contract §15) and is never read here.
    turnStepBlockPlan: async ({ plan, request }) => {
      if (request.step_index !== 1) return false;
      if (actorMovementBlocked(state) && plan.resolution === 'direct'
        && plan.goal_result === 'not_achieved' && plan.operations.length === 0) {
        return 'actor_movement_blocked';
      }
      if (plan.resolution !== 'domain_request') return false;
      const chosen = plan.operations ?? [];
      if (chosen.some((operation) => (request.player_safe_state
        ?.available_domain_operation_grounding ?? []).some((entry) =>
        entry.semantic_scope?.destination_status === 'occupied'
        && isDeepStrictEqual(entry.operation, operation)))) {
        return 'destination_occupied';
      }
      // The chosen command's own structural refusal (the movement owner's full-occupancy
      // verdict, which may name occupants the actor cannot perceive and is never shown).
      // The block carries no reason code: a code would disclose the unseen occupancy.
      const commands = typeof registry?.registered === 'function' ? registry.registered() : [];
      for (const operation of chosen) {
        for (const command of commands) {
          if (typeof command.attemptRefusal === 'function'
            && command.semantic_binding?.matches?.({ operation }) === true
            && await command.attemptRefusal({ committed_state: state }) != null) {
            return true;
          }
        }
      }
      return false;
    },
    ...(turnStepSemanticGroundingValidator ? {
      turnStepSemanticGroundingValidator
    } : {}),
    ...(turnStepPlayerSafeStateProjector ? {
      playerSafeStateProjector: turnStepPlayerSafeStateProjector
    } : {}),
    turnStepExecutionRegistry: turnStepPorts.executionRegistry,
    turnStepPostAppliedActorStep: turnStepPorts.postAppliedActorStep,
    ...(turnStepPorts.ordinaryDiscoveryResolver ? {
      turnStepOrdinaryDiscoveryResolver:
        turnStepPorts.ordinaryDiscoveryResolver
    } : {}),
    ...(actionProductionOwner ? {
      turnStepActionProductionOwner: actionProductionOwner.execute,
      turnStepActionProductionPreflight: actionProductionOwner.preflight
    } : {}),
    ...(typeof createTurnStepWorldProcessResolver === 'function'
        && localFireProfile?.profile?.status === 'approved' ? {
      turnStepWorldProcessResolver: createTurnStepWorldProcessResolver({
        partyId, requestId, inputDigest,
        applyWorkingProjection: turnStepPorts.applyLocalFireProjection
      })
    } : {}),
    ...(typeof spatialSemanticResolverFactory === 'function' ? {
      turnStepSpatialSemanticResolver: spatialSemanticResolverFactory({ partyId })
    } : {}),
    ...(typeof createTurnStepBackgroundNpcResolver === 'function'
        && npcSemanticRemainderProfile?.profile?.status === 'approved' ? {
      turnStepBackgroundNpcResolver: createTurnStepBackgroundNpcResolver({
        partyId, requestId, inputDigest,
        applyWorkingProjection: workingProjectionAuthority.admit
      })
    } : {}),
    turnStepCheckContextResolver: turnStepPorts.resolveCheckContext,
    ...(turnStepPorts.preparedDomainEffect ? {
      turnStepPreparedDomainEffect: turnStepPorts.preparedDomainEffect,
      turnStepPreparedEffectContext: turnStepPorts.preparedEffectContext,
      turnStepPreparedEffectTimeOwner: turnStepPorts.preparedEffectTimeOwner,
      turnStepPreparedEffectBodyOwner: turnStepPorts.preparedEffectBodyOwner,
      turnStepPreparedEffectProjectionOwner:
        turnStepPorts.preparedEffectProjectionOwner
    } : {}),
    decisionSecret,
    decisionNow: context.decisionNow,
    decisionExpiresAt: addMinutes(issuedAt, 5),
    evaluatePrecondition,
    randomSource,
    temporalAdvance,
    bodyEffect,
    visibleProjector: createVisibleProjector(),
    partyStore: {
      async preloadSpatialRoutePresentation(committedState) {
        const materializationRevision = committedState?.materialization_trace
          ?.seed_context?.scenario_definition_revision;
        const presentation = await loadLowerDvinaTraceScreenPresentation(
          committedState);
        preloadedSpatialRoutePresentation = deepFreeze({
          base_state_version: committedState?.party_state?.state_version ?? null,
          scenario_id: committedState?.scenario_id ?? null,
          scenario_definition_revision: Number.isInteger(materializationRevision)
            ? materializationRevision : null,
          presentation: structuredClone(presentation)
        });
        return preloadedSpatialRoutePresentation;
      },
      withSpatialP16Transaction(work) {
        if (typeof repository.withSpatialP16Transaction !== 'function') {
          throw new TypeError('Spatial P16 transaction boundary is unavailable.');
        }
        return repository.withSpatialP16Transaction(work, { turnBudget });
      },
      async commit(writePlan, options = {}) {
        const transaction = options?.transaction ?? null;
        turnBudget?.assertCanCommit();
        turnCommitStatus = 'ambiguous';
        trace({ event: 'owner_commit_requested',
          write_plan: writePlan, expected_versions: writePlan?.expected_versions ?? null });
        let committed;
        try { committed = await repository.commitPhase2Turn({
          partyId, writePlan, inputDigest, contracts, phase3Contracts,
          phase4Contracts, phase5Contracts, phase6Contracts, phase7Contracts,
          turn10Contracts, phase8Contracts, phase9Contracts,
          phase10Contracts, turnStepApprovedOwners: {
            ...turnStepApprovedOwners, scenePresentation,
            loadPreparedMovementScene
          }, turnBudget,
          turnStepAmbientPortionProfileRef,
          ...(transaction == null ? {} : { transaction,
            preloadedScreenPresentation: preloadedSpatialRoutePresentation })
        }); } catch (error) {
          if (authoritativeNotStarted(error)) {
            turnCommitStatus = 'not_started';
          }
          trace({ event: 'owner_commit_rejected',
            code: error?.code ?? null, turn_commit_status: turnCommitStatus,
            details: error?.details ?? null });
          throw error;
        }
        if (authoritativeNotStarted(committed)) turnCommitStatus = 'not_started';
        else if (committed?.ok === true) turnCommitStatus = 'committed';
        committedPublicResult = committed.committed_public_result ?? null;
        if (turnCommitStatus === 'committed'
            && typeof repository.loadPhase2State === 'function') {
          try {
            const loaded = await repository.loadPhase2State(partyId, {
              turnBudget, ...(transaction == null ? {} : {
                transaction, includeCurrentVisibleContext: false
              })
            });
            if (loaded != null) narrationAuthState = loaded;
          } catch { /* keep pre-commit state; narration still degrades without WK */ }
        }
        trace({ event: 'owner_commit_completed',
          turn_commit_status: turnCommitStatus, outcome: committed,
          committed_public_result: committedPublicResult });
        return committed;
      }
    },
    persistedVisibleReader: {
      async read(request) {
        const result = await runWithinTurnDeadline(turnBudget, () => repository.loadPhase2VisibleContext({
          partyId, commit: request.commit, turnBudget
        }));
        trace({ event: 'owner_readback_completed', result });
        return result;
      }
    },
    narrator: {
      ...narrator,
      run(request) {
        // F3/F7: authoritative via options port, not request body smuggling.
        return runWithinTurnDeadline(turnBudget, () => narrator.run({
          ...request, party_id: partyId,
          delivery_turn_number: committedPublicResult?.turn_number,
          turnBudget
        }, {
          worldKnowledgeAuthoritative:
            playerWorldKnowledgeAuthoritativeFromState(narrationAuthState)
        }));
      }
    },
    screenProjector: {
      project({ defaultScreen }) {
        turnBudget?.assertWithinDeadline();
        const screen = {
          ...defaultScreen,
          checks: structuredClone(
            committedPublicResult?.screen?.checks ?? []
          ),
          delivery_state: { ...defaultScreen.delivery_state, generated_at: issuedAt },
          scenario_id: scenarioId ?? 'lower_dvina_trace_v1',
          screen_kind: scenarioId === 'lower_dvina_trace_v1'
            ? 'trace_turn' : 'live_world_turn',
          opening_screen_digest: state.opening_identity.opening_screen_digest
        };
        turnBudget?.assertWithinDeadline();
        trace({ event: 'owner_screen_projected', screen });
        return screen;
      }
    },
    committedPublicResult: () => committedPublicResult,
    turnCommitStatus: () => turnCommitStatus
  };
}
function addMinutes(value, minutes) { return new Date(Date.parse(value) + minutes * 60000).toISOString(); }
function authoritativeNotStarted(error) {
  return [error, error?.error, error?.details, error?.details?.commit_error]
    .some((value) => value?.turn_commit_status === 'not_started'
      || value?.diagnostics?.turn_commit_status === 'not_started');
}
