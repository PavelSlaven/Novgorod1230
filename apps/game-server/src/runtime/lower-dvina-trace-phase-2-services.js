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

export function buildLowerDvinaTracePhase2Services(context) {
  const {
    partyId, requestId, idempotencyKey, inputDigest, issuedAt,
    state, contracts, registry, repository, semanticResolver,
    turnStepModel, playerSafeStateProjector,
    turnStepBodyEventOwner, turnStepSemanticActivityOwner,
    turnStepGenericCheckContextOwner, turnStepGenericBodyEffect,
    turnStepOrdinaryResultPolicy, turnStepApprovedOwners,
    turnStepPackingCalculator,
    narrator, randomSourceFactory, decisionSecret, phase3Contracts,
    phase4Contracts, phase5Contracts, phase6Contracts, phase7Contracts
  } = context;
  const randomSource = randomSourceFactory({
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
  const temporalAdvance = createTracePhase7TemporalAdvance({
    fallback: createTracePhase6TemporalAdvance({
      fallback: createTracePhase5TemporalAdvance({
      phase4Advance: createTracePhase4TemporalAdvance({
        phase3Advance: createTracePhase3TemporalAdvance({
          phase2Advance: createTracePhase2TemporalAdvance({ contracts })
        })
      })
      })
    })
  });
  const bodyEffect = createLowerDvinaTraceCompositeBodyEffect({
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
  });
  const turnStepPorts = createLowerDvinaTraceTurnStepRuntimePorts({
    bodyEffect,
    bodyEventOwner: turnStepBodyEventOwner,
    committedState: state,
    genericCheckContextOwner: turnStepGenericCheckContextOwner,
    ordinaryResultPolicy: turnStepOrdinaryResultPolicy,
    resolveItemMechanics: createCommittedItemMechanicsResolver(state, {
      packingCalculator: turnStepPackingCalculator
    }),
    semanticActivityOwner: turnStepSemanticActivityOwner,
    temporalAdvance,
    workingProjectionAuthority
  });
  const turnStepPlayerSafeStateProjector = playerSafeStateProjector
    ? (input) => playerSafeStateProjector({
        ...input,
        working_projection_authority: workingProjectionAuthority
      })
    : null;
  return {
    commandRegistry: registry,
    stateReader: {
      async read(request) {
        return request.revalidation === true
          ? repository.loadPhase2State(partyId, {
              presentationIdempotencyKey: idempotencyKey
            })
          : structuredClone(state);
      }
    },
    semanticResolver,
    ...(turnStepModel ? { turnStepModel } : {}),
    ...(turnStepPlayerSafeStateProjector ? {
      playerSafeStateProjector: turnStepPlayerSafeStateProjector
    } : {}),
    turnStepExecutionRegistry: turnStepPorts.executionRegistry,
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
        ));
    },
    randomSource,
    temporalAdvance,
    bodyEffect,
    visibleProjector: createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: createTracePhase7VisibleProjector({ fallback: createTracePhase6VisibleProjector({ fallback: createTracePhase5VisibleProjector({
      phase4Projector: createTracePhase4VisibleProjector({
        phase3Projector: createTracePhase3VisibleProjector({
          phase2Projector: createTracePhase2VisibleProjector({ contracts }),
          contracts: phase3Contracts
        })
      })
    }) }) })
    }),
    partyStore: {
      commit(writePlan) {
        return repository.commitPhase2Turn({
          partyId, writePlan, inputDigest, contracts, phase3Contracts,
          phase4Contracts, phase5Contracts, phase6Contracts, phase7Contracts,
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
