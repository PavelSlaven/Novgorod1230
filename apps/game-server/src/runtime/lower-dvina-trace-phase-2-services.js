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

export function buildLowerDvinaTracePhase2Services(context) {
  const {
    partyId, requestId, idempotencyKey, inputDigest, issuedAt,
    state, contracts, registry, repository, semanticResolver,
    narrator, randomSourceFactory, decisionSecret, phase3Contracts,
    phase4Contracts, phase5Contracts
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
        ));
    },
    randomSource,
    temporalAdvance: createTracePhase5TemporalAdvance({
      phase4Advance: createTracePhase4TemporalAdvance({
        phase3Advance: createTracePhase3TemporalAdvance({
          phase2Advance: createTracePhase2TemporalAdvance({ contracts })
        })
      })
    }),
    bodyEffect: createTracePhase5BodyEffect({
      phase2BodyEffect: createTracePhase2BodyEffect({ contracts }),
      contracts: phase5Contracts
    }),
    visibleProjector: createTracePhase5VisibleProjector({
      phase4Projector: createTracePhase4VisibleProjector({
        phase3Projector: createTracePhase3VisibleProjector({
          phase2Projector: createTracePhase2VisibleProjector({ contracts }),
          contracts: phase3Contracts
        })
      })
    }),
    partyStore: {
      commit(writePlan) {
        return repository.commitPhase2Turn({
          partyId, writePlan, inputDigest, contracts, phase3Contracts,
          phase4Contracts, phase5Contracts
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
