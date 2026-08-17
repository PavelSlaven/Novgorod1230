import { serverError } from '../errors.js';
import { tracePhase2PreconditionSatisfied } from './lower-dvina-trace-phase-2-command.js';
import { createTracePhase2BodyEffect, createTracePhase2VisibleProjector } from './lower-dvina-trace-phase-2-effects.js';
import { createTracePhase2TemporalAdvance } from './lower-dvina-trace-phase-2-temporal.js';
import { tracePhase3PreconditionSatisfied } from './lower-dvina-trace-phase-3-command.js';
import { createTracePhase3TemporalAdvance, createTracePhase3VisibleProjector } from './lower-dvina-trace-phase-3-effects.js';
import { tracePhase4PreconditionSatisfied } from './lower-dvina-trace-phase-4-command.js';
import { createTracePhase4TemporalAdvance, createTracePhase4VisibleProjector } from './lower-dvina-trace-phase-4-effects.js';
import { tracePhase5PreconditionSatisfied } from './lower-dvina-trace-phase-5-command.js';
import {
  createTracePhase5BodyEffect,
  createTracePhase5TemporalAdvance,
  createTracePhase5VisibleProjector
} from './lower-dvina-trace-phase-5-effects.js';
import { createTraceRouteBodyEffect } from './lower-dvina-trace-route-body-effects.js';
import {
  tracePhase6PreconditionSatisfied
} from './lower-dvina-trace-phase-6-carry.js';
import { createTracePhase6BodyEffect, createTracePhase6TemporalAdvance, createTracePhase6VisibleProjector } from './lower-dvina-trace-phase-6-effects.js';
import {
  createTracePhase7BodyEffect,
  createTracePhase7TemporalAdvance,
  createTracePhase7VisibleProjector
} from './lower-dvina-trace-phase-7-effects.js';
import { tracePhase7PreconditionSatisfied } from
  './lower-dvina-trace-phase-7-command.js';
import { traceTurn10PreconditionSatisfied } from
  './lower-dvina-trace-turn-10-command.js';
import { traceCombatPreconditionSatisfied } from
  './lower-dvina-trace-combat-command.js';
import { tracePhase8RoutePreconditionSatisfied } from
  './lower-dvina-trace-phase-8-route-command.js';
import { tracePhase8AccusationPreconditionSatisfied } from
  './lower-dvina-trace-phase-8-accusation-command.js';
import { createTracePhase8TemporalAdvance,
  createTracePhase8VisibleProjector } from
  './lower-dvina-trace-phase-8-effects.js';
import { createTracePhase9TemporalAdvance,
  createTracePhase9VisibleProjector, createTracePhase9BodyEffect } from
  './lower-dvina-trace-phase-9-effects.js';
import { tracePhase9PreconditionSatisfied } from
  './lower-dvina-trace-phase-9-commands.js';
import { tracePhase9TestimonyPreconditionSatisfied } from
  './lower-dvina-trace-phase-9-testimony-command.js';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  './lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  './lower-dvina-trace-player-safe-working.js';
import { createCommittedItemMechanicsResolver } from
  './lower-dvina-trace-committed-inventory.js';
import {
  createLowerDvinaTraceCompositeBodyEffect,
  createLowerDvinaTraceTurnStepVisibleProjector
} from
  './lower-dvina-trace-turn-step-generic-owners.js';
import { withLowerDvinaTraceCurrentScene } from
  './lower-dvina-trace-turn-step-current-scene.js';
import { createLowerDvinaTraceTurnStepPlayerSafeProjector } from
  './lower-dvina-trace-phase-2-player-safe.js';

export function buildLowerDvinaTracePhase2Services(context) {
  const {
    partyId, requestId, idempotencyKey, inputDigest, issuedAt,
    state, contracts, registry, repository, semanticResolver,
    turnStepModel, playerSafeStateProjector, locationProfiles,
    turnStepBodyEventOwner, turnStepSemanticActivityOwner,
    turnStepGenericCheckContextOwner, turnStepGenericBodyEffect,
    turnStepOrdinaryDiscoveryResolver, createTurnStepOrdinaryDiscoveryResolver,
    createTurnStepOrdinaryContainerContentsResolver,
    ordinaryDiscoveryEnablementMarker,
    createTurnStepActionProducedResolver,
    actionProductionProfile,
    admitAmbientOrdinaryPortion,
    requireAmbientOrdinaryAdmission,
    turnStepOrdinaryResultPolicy,
    turnStepApprovedOwners,
    turnStepPackingCalculator,
    narrator, randomSourceFactory, randomSource: injectedRandomSource,
    decisionSecret, phase3Contracts,
    phase4Contracts, phase5Contracts, phase6Contracts, phase7Contracts,
    turn10Contracts, phase8Contracts, phase9Contracts, phase10Contracts
  } = context;
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
  const workingProjectionAuthority =
    createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
  const projectCurrentScene = (committedState) =>
    withLowerDvinaTraceCurrentScene({ committedState, locationProfiles });
  const temporalAdvance = createTracePhase9TemporalAdvance({ fallback:
    createTracePhase8TemporalAdvance({ fallback:
      createTracePhase7TemporalAdvance({
        fallback: createTracePhase6TemporalAdvance({
          fallback: createTracePhase5TemporalAdvance({
            phase4Advance: createTracePhase4TemporalAdvance({
              phase3Advance: createTracePhase3TemporalAdvance({
                phase2Advance: createTracePhase2TemporalAdvance({ contracts })
              })
            })
          })
        })
      })
    })
  });
  const bodyEffect = createTracePhase9BodyEffect({ fallback:
    createLowerDvinaTraceCompositeBodyEffect({
    genericBodyEffect: turnStepGenericBodyEffect,
    fallback: createTracePhase7BodyEffect({
      fallback: createTracePhase6BodyEffect({
      fallback: createTracePhase5BodyEffect({
        phase2BodyEffect: createTraceRouteBodyEffect({
          phase2BodyEffect: createTracePhase2BodyEffect({ contracts }),
          phase3Contracts,
          phase4Contracts
        }),
        contracts: phase5Contracts
      }),
      contracts: phase6Contracts
      }),
      contracts: phase7Contracts
    })
  }) });
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
      createTurnStepActionProducedResolver,
      ordinaryDiscoveryEnablementMarker,
      ordinaryDiscoveryResolver: turnStepPorts.ordinaryDiscoveryResolver,
      partyId,
      playerSafeStateProjector,
      workingProjectionAuthority
    });
  return {
    commandRegistry: registry,
    stateReader: {
      async read(request) {
        const committedState = request.revalidation === true
          ? await repository.loadPhase2State(partyId, {
              presentationIdempotencyKey: idempotencyKey
            })
          : structuredClone(state);
        return projectCurrentScene(committedState);
      }
    },
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
    ...(typeof createTurnStepActionProducedResolver === 'function'
        && actionProductionProfile?.profile?.status === 'approved' ? {
      turnStepActionProducedResolver: createTurnStepActionProducedResolver({
        partyId, requestId, inputDigest
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
    evaluatePrecondition(precondition, committedState) {
      return tracePhase2PreconditionSatisfied(precondition, committedState, contracts)
        || (phase3Contracts != null && tracePhase3PreconditionSatisfied(
          precondition, committedState, phase3Contracts
        )) || (phase4Contracts != null && tracePhase4PreconditionSatisfied(
          precondition, committedState, phase4Contracts
        )) || (phase5Contracts != null && tracePhase5PreconditionSatisfied(
          precondition, committedState, phase5Contracts
        )) || (phase6Contracts != null && tracePhase6PreconditionSatisfied(
          precondition, committedState, phase6Contracts, inputDigest
        )) || (phase7Contracts != null && tracePhase7PreconditionSatisfied(
          precondition, committedState, phase7Contracts
        )) || (turn10Contracts != null && traceTurn10PreconditionSatisfied(
          precondition, committedState, turn10Contracts
        )) || (phase8Contracts != null
          && tracePhase8RoutePreconditionSatisfied(precondition,
            committedState, phase8Contracts))
        || (phase8Contracts != null
          && tracePhase8AccusationPreconditionSatisfied(precondition,
            committedState, phase8Contracts))
        || (phase9Contracts != null
          && tracePhase9PreconditionSatisfied(precondition, committedState,
            phase9Contracts))
        || (phase9Contracts != null
          && tracePhase9TestimonyPreconditionSatisfied(precondition,
            committedState, phase9Contracts))
        || traceCombatPreconditionSatisfied(precondition, committedState);
    },
    randomSource,
    temporalAdvance,
    bodyEffect,
    visibleProjector: createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: createTracePhase9VisibleProjector({
      contracts: phase9Contracts, fallback: createTracePhase8VisibleProjector({
      contracts: phase8Contracts, fallback: createTracePhase7VisibleProjector({ fallback: createTracePhase6VisibleProjector({ fallback: createTracePhase5VisibleProjector({
      phase4Projector: createTracePhase4VisibleProjector({
        phase3Projector: createTracePhase3VisibleProjector({
          phase2Projector: createTracePhase2VisibleProjector({ contracts }),
          contracts: phase3Contracts
        })
      })
    }) }) }) }) })
    }),
    partyStore: {
      commit(writePlan) {
        return repository.commitPhase2Turn({
          partyId, writePlan, inputDigest, contracts, phase3Contracts,
          phase4Contracts, phase5Contracts, phase6Contracts, phase7Contracts,
          turn10Contracts, phase8Contracts, phase9Contracts,
          phase10Contracts,
          turnStepApprovedOwners
        });
      }
    },
    persistedVisibleReader: {
      read(request) {
        return repository.loadPhase2VisibleContext({ partyId, commit: request.commit });
      }
    },
    narrator,
    screenProjector: {
      project({ defaultScreen }) {
        return {
          ...defaultScreen,
          delivery_state: { ...defaultScreen.delivery_state, generated_at: issuedAt },
          scenario_id: 'lower_dvina_trace_v1',
          screen_kind: 'trace_turn',
          opening_screen_digest: state.opening_identity.opening_screen_digest
        };
      }
    }
  };
}

function addMinutes(value, minutes) {
  return new Date(Date.parse(value) + minutes * 60000).toISOString();
}
