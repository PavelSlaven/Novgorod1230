import { tracePhase2PreconditionSatisfied } from './lower-dvina-trace-phase-2-command.js';
import { createTracePhase2BodyEffect, createTracePhase2VisibleProjector } from './lower-dvina-trace-phase-2-effects.js';
import { createTracePhase2TemporalAdvance } from './lower-dvina-trace-phase-2-temporal.js';
import { tracePhase3PreconditionSatisfied } from './lower-dvina-trace-phase-3-command.js';
import { createTracePhase3TemporalAdvance, createTracePhase3VisibleProjector } from './lower-dvina-trace-phase-3-effects.js';
import { tracePhase4PreconditionSatisfied } from './lower-dvina-trace-phase-4-command.js';
import { createTracePhase4TemporalAdvance, createTracePhase4VisibleProjector } from './lower-dvina-trace-phase-4-effects.js';
import { tracePhase5PreconditionSatisfied } from './lower-dvina-trace-phase-5-command.js';
import { createTracePhase5BodyEffect, createTracePhase5TemporalAdvance, createTracePhase5VisibleProjector } from './lower-dvina-trace-phase-5-effects.js';
import { createTraceRouteBodyEffect } from './lower-dvina-trace-route-body-effects.js';
import { tracePhase6PreconditionSatisfied } from './lower-dvina-trace-phase-6-carry.js';
import { createTracePhase6BodyEffect, createTracePhase6TemporalAdvance, createTracePhase6VisibleProjector } from './lower-dvina-trace-phase-6-effects.js';
import { createTracePhase7BodyEffect, createTracePhase7TemporalAdvance, createTracePhase7VisibleProjector } from './lower-dvina-trace-phase-7-effects.js';
import { tracePhase7PreconditionSatisfied } from './lower-dvina-trace-phase-7-command.js';
import { traceTurn10PreconditionSatisfied } from './lower-dvina-trace-turn-10-command.js';
import { traceCombatPreconditionSatisfied } from './lower-dvina-trace-combat-command.js';
import { tracePhase8RoutePreconditionSatisfied } from './lower-dvina-trace-phase-8-route-command.js';
import { tracePhase8AccusationPreconditionSatisfied } from './lower-dvina-trace-phase-8-accusation-command.js';
import { createTracePhase8TemporalAdvance, createTracePhase8VisibleProjector } from './lower-dvina-trace-phase-8-effects.js';
import { createTracePhase9TemporalAdvance, createTracePhase9VisibleProjector, createTracePhase9BodyEffect } from './lower-dvina-trace-phase-9-effects.js';
import { tracePhase9PreconditionSatisfied } from './lower-dvina-trace-phase-9-commands.js';
import { tracePhase9TestimonyPreconditionSatisfied } from './lower-dvina-trace-phase-9-testimony-command.js';
import { createLowerDvinaTraceCompositeBodyEffect, createLowerDvinaTraceTurnStepVisibleProjector } from './lower-dvina-trace-turn-step-generic-owners.js';

export function createLowerDvinaTracePhase2ServiceFlow({
  contracts, inputDigest, phase3Contracts, phase4Contracts, phase5Contracts, phase6Contracts,
  phase7Contracts, turn10Contracts, phase8Contracts, phase9Contracts,
  temporalAdvanceOwner, turnStepGenericBodyEffect, scenePresentation
}) {
  const temporalAdvance = createTracePhase9TemporalAdvance({ fallback:
    createTracePhase8TemporalAdvance({ fallback:
      createTracePhase7TemporalAdvance({
        fallback: createTracePhase6TemporalAdvance({
          fallback: createTracePhase5TemporalAdvance({
            phase4Advance: createTracePhase4TemporalAdvance({
              phase3Advance: createTracePhase3TemporalAdvance({
                phase2Advance: createTracePhase2TemporalAdvance({ contracts,
                  temporalAdvanceOwner })
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
    })
  });
  return {
    temporalAdvance,
    bodyEffect,
    evaluatePrecondition(precondition, committedState) {
      return tracePhase2PreconditionSatisfied(precondition, committedState, contracts)
        || (phase3Contracts != null && tracePhase3PreconditionSatisfied(precondition, committedState, phase3Contracts))
        || (phase4Contracts != null && tracePhase4PreconditionSatisfied(precondition, committedState, phase4Contracts))
        || (phase5Contracts != null && tracePhase5PreconditionSatisfied(precondition, committedState, phase5Contracts))
        || (phase6Contracts != null && tracePhase6PreconditionSatisfied(precondition, committedState, phase6Contracts, inputDigest))
        || (phase7Contracts != null && tracePhase7PreconditionSatisfied(precondition, committedState, phase7Contracts))
        || (turn10Contracts != null && traceTurn10PreconditionSatisfied(precondition, committedState, turn10Contracts))
        || (phase8Contracts != null && tracePhase8RoutePreconditionSatisfied(precondition, committedState, phase8Contracts))
        || (phase8Contracts != null && tracePhase8AccusationPreconditionSatisfied(precondition, committedState, phase8Contracts))
        || (phase9Contracts != null && tracePhase9PreconditionSatisfied(precondition, committedState, phase9Contracts))
        || (phase9Contracts != null && tracePhase9TestimonyPreconditionSatisfied(precondition, committedState, phase9Contracts))
        || traceCombatPreconditionSatisfied(precondition, committedState, phase8Contracts);
    },
    createVisibleProjector() {
      return createLowerDvinaTraceTurnStepVisibleProjector({
        fallback: createTracePhase9VisibleProjector({
          contracts: phase9Contracts, fallback: createTracePhase8VisibleProjector({
            contracts: phase8Contracts, fallback: createTracePhase7VisibleProjector({ fallback: createTracePhase6VisibleProjector({ scenePresentation, fallback: createTracePhase5VisibleProjector({
              phase4Projector: createTracePhase4VisibleProjector({
                contracts: phase4Contracts,
                phase3Projector: createTracePhase3VisibleProjector({
                  phase2Projector: createTracePhase2VisibleProjector({ contracts,
                    scenePresentation }),
                  contracts: phase3Contracts, scenePresentation
                })
              })
            }) }) }) }) })
        });
    }
  };
}
