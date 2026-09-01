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
export function buildLowerDvinaTracePhase2Services(context) {
  const {
    partyId, requestId, idempotencyKey, inputDigest, issuedAt,
    state, contracts, registry, repository, semanticResolver,
    turnStepModel, playerSafeStateProjector, locationProfiles, scenePresentation,
    turnStepBodyEventOwner, turnStepSemanticActivityOwner,
    turnStepGenericCheckContextOwner, turnStepGenericBodyEffect,
    turnStepOrdinaryDiscoveryResolver, createTurnStepOrdinaryDiscoveryResolver,
    createTurnStepOrdinaryContainerContentsResolver,
    ordinaryDiscoveryEnablementMarker,
    createTurnStepActionProductionOwner,
    actionProductionProfile,
    createTurnStepWorldProcessResolver,
    localFireProfile,
    createTurnStepSpatialSemanticResolver,
    admitAmbientOrdinaryPortion,
    requireAmbientOrdinaryAdmission,
    turnStepOrdinaryResultPolicy,
    turnStepApprovedOwners,
    turnStepPackingCalculator,
    turnBudget,
    narrator, randomSourceFactory, randomSource: injectedRandomSource,
    temporalAdvanceOwner,
    decisionSecret, phase3Contracts,
    phase4Contracts, phase5Contracts, phase6Contracts, phase7Contracts,
    turn10Contracts, phase8Contracts, phase9Contracts, phase10Contracts
  } = context;
  let committedPublicResult = null;
  const randomSource = injectedRandomSource ?? randomSourceFactory({
    party_id: partyId,
    request_id: requestId,
    idempotency_key: idempotencyKey
  });
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
    genericCheckContextOwner: turnStepGenericCheckContextOwner,
    ordinaryDiscoveryResolver: turnStepOrdinaryDiscoveryResolver
      ?? createTurnStepOrdinaryDiscoveryResolver?.({ partyId, inputDigest }),
    ordinaryContainerContentsResolver:
      createTurnStepOrdinaryContainerContentsResolver?.({partyId,inputDigest}),
    ordinaryResultPolicy: turnStepOrdinaryResultPolicy,
    admitAmbientOrdinaryPortion,
    requireAmbientOrdinaryAdmission,
    resolveItemMechanics: createCommittedItemMechanicsResolver(state, {
      packingCalculator: turnStepPackingCalculator
    }),
    semanticActivityOwner: turnStepSemanticActivityOwner,
    temporalAdvance,
    workingProjectionAuthority
  });
  const turnStepPlayerSafeStateProjector =
    createLowerDvinaTraceTurnStepPlayerSafeProjector({
      admitAmbientOrdinaryPortion,
      actionProductionProfile,
      createTurnStepActionProductionOwner,
      localFireProfile,
      createTurnStepWorldProcessResolver,
      createTurnStepSpatialSemanticResolver,
      ordinaryDiscoveryEnablementMarker,
      ordinaryDiscoveryResolver: turnStepPorts.ordinaryDiscoveryResolver,
      partyId,
      playerSafeStateProjector,
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
    ...(turnStepModel ? { turnStepModel } : {}),
    ...(turnStepPlayerSafeStateProjector ? {
      playerSafeStateProjector: turnStepPlayerSafeStateProjector
    } : {}),
    turnStepExecutionRegistry: turnStepPorts.executionRegistry,
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
    ...(typeof createTurnStepSpatialSemanticResolver === 'function' ? {
      turnStepSpatialSemanticResolver: createTurnStepSpatialSemanticResolver({ partyId })
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
      async commit(writePlan) {
        turnBudget?.assertCanCommit();
        const committed = await repository.commitPhase2Turn({
          partyId, writePlan, inputDigest, contracts, phase3Contracts,
          phase4Contracts, phase5Contracts, phase6Contracts, phase7Contracts,
          turn10Contracts, phase8Contracts, phase9Contracts,
          phase10Contracts, turnStepApprovedOwners, turnBudget
        });
        committedPublicResult = committed.committed_public_result ?? null;
        return committed;
      }
    },
    persistedVisibleReader: {
      read(request) {
        return runWithinTurnDeadline(turnBudget, () => repository.loadPhase2VisibleContext({
          partyId, commit: request.commit, turnBudget
        }));
      }
    },
    narrator: {
      ...narrator,
      run(request) {
        return runWithinTurnDeadline(turnBudget, () => narrator.run({
          ...request, turnBudget
        }));
      }
    },
    screenProjector: {
      project({ defaultScreen }) {
        turnBudget?.assertWithinDeadline();
        const screen = {
          ...defaultScreen,
          delivery_state: { ...defaultScreen.delivery_state, generated_at: issuedAt },
          scenario_id: 'lower_dvina_trace_v1',
          screen_kind: 'trace_turn',
          opening_screen_digest: state.opening_identity.opening_screen_digest
        };
        turnBudget?.assertWithinDeadline();
        return screen;
      }
    },
    committedPublicResult: () => committedPublicResult
  };
}
function addMinutes(value, minutes) { return new Date(Date.parse(value) + minutes * 60000).toISOString(); }
