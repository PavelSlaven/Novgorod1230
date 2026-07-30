import { canonicalDigest } from '@rus/materialization';
import { runTurnWorkflow } from '@rus/turn';
import { serverError } from '../errors.js';
import {
  loadLowerDvinaTraceMaterializationBundle
} from '../internal/lower-dvina-trace-phase-1a-bundle.js';
import {
  loadLowerDvinaTracePhase2Bundle
} from '../internal/lower-dvina-trace-phase-2-bundle.js';
import {
  createTracePhase2InspectionRegistry,
  tracePhase2PreconditionSatisfied
} from './lower-dvina-trace-phase-2-command.js';
import {
  resolveTracePhase2Contracts
} from './lower-dvina-trace-phase-2-contracts.js';
import {
  createTracePhase2BodyEffect,
  createTracePhase2VisibleProjector
} from './lower-dvina-trace-phase-2-effects.js';
import {
  createTracePhase2TemporalAdvance
} from './lower-dvina-trace-phase-2-temporal.js';

export function createLowerDvinaTracePhase2Runtime({
  repository,
  semanticResolver,
  narrator,
  randomSourceFactory,
  decisionSecret,
  now = () => new Date().toISOString(),
  bundleLoader = loadLowerDvinaTraceMaterializationBundle,
  phase2BundleLoader = loadLowerDvinaTracePhase2Bundle
} = {}) {
  validateDependencies({
    repository,
    semanticResolver,
    narrator,
    randomSourceFactory,
    decisionSecret
  });
  return Object.freeze({
    async validateSessionRead({ partyId }) {
      await repository.loadPhase2State(partyId);
      return true;
    },
    async submitTurn({ partyId, input = {} }) {
      const requestId = requiredText(
        input.request_id,
        'TRACE_TURN_REQUEST_ID_REQUIRED'
      );
      const idempotencyKey = requiredText(
        input.idempotency_key ?? input.request_id,
        'TRACE_TURN_IDEMPOTENCY_KEY_REQUIRED'
      );
      const rawText = requiredText(
        input.raw_text,
        'TRACE_TURN_RAW_TEXT_REQUIRED'
      );
      const inputDigest = canonicalDigest({
        party_id: partyId,
        request_id: requestId,
        idempotency_key: idempotencyKey,
        raw_text: rawText
      });
      const replay = await repository.loadPhase2Replay({
        partyId,
        idempotencyKey
      });
      if (replay) {
        if (replay.input_digest !== inputDigest) {
          throw serverError(
            'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT',
            'The idempotency identity is already bound to another input.',
            { status: 409 }
          );
        }
        return repository.replayPhase2Turn
          ? repository.replayPhase2Turn({ partyId, replay, narrator })
          : replay.public_result;
      }
      const [state, bundle, phase2Bundle] = await Promise.all([
        repository.loadPhase2State(partyId, {
          presentationIdempotencyKey: idempotencyKey
        }),
        bundleLoader(),
        phase2BundleLoader()
      ]);
      const contracts = resolveTracePhase2Contracts({
        state,
        bundle,
        phase2Bundle
      });
      const registry = createTracePhase2InspectionRegistry({
        contracts,
        inputDigest
      });
      const issuedAt = now();
      const result = await runTurnWorkflow({
        party_id: partyId,
        turn_number: Number(state.party_state.turn_number) + 1,
        request_id: requestId,
        idempotency_key: idempotencyKey,
        raw_text: rawText,
        routing_context: {
          actor_id: state.actor_id,
          state_version: state.party_state.state_version,
          policy_id: 'lower_dvina_trace_semantic_intent',
          policy_version: '1',
          policy_pins: [contracts.activityPin]
        }
      }, buildServices({
        partyId,
        requestId,
        idempotencyKey,
        inputDigest,
        issuedAt,
        state,
        contracts,
        registry,
        repository,
        semanticResolver,
        narrator,
        randomSourceFactory,
        decisionSecret,
        decisionNow: now
      }), {
        now: issuedAt,
        requestId
      });
      return repository.persistPhase2Screen({
        partyId,
        inputDigest,
        result
      });
    }
  });
}

function buildServices(context) {
  const {
    partyId, requestId, idempotencyKey, inputDigest, issuedAt,
    state, contracts, registry, repository, semanticResolver,
    narrator, randomSourceFactory, decisionSecret
  } = context;
  const randomSource = randomSourceFactory({
    party_id: partyId,
    request_id: requestId,
    idempotency_key: idempotencyKey
  });
  const randomSnapshot = randomSource?.snapshot?.();
  if (!randomSnapshot?.algorithm
      || randomSnapshot.algorithm
        !== state.materialization_trace?.rng_version) {
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
      return tracePhase2PreconditionSatisfied(
        precondition,
        committedState,
        contracts
      );
    },
    randomSource,
    temporalAdvance:
      createTracePhase2TemporalAdvance({ contracts }),
    bodyEffect: createTracePhase2BodyEffect({ contracts }),
    visibleProjector:
      createTracePhase2VisibleProjector({ contracts }),
    partyStore: {
      commit(writePlan) {
        return repository.commitPhase2Turn({
          partyId,
          writePlan,
          inputDigest,
          contracts
        });
      }
    },
    persistedVisibleReader: {
      read(request) {
        return repository.loadPhase2VisibleContext({
          partyId,
          commit: request.commit
        });
      }
    },
    narrator,
    screenProjector: {
      project({ defaultScreen }) {
        return {
          ...defaultScreen,
          delivery_state: {
            ...defaultScreen.delivery_state,
            generated_at: issuedAt
          },
          scenario_id: 'lower_dvina_trace_v1',
          screen_kind: 'trace_turn',
          opening_screen_digest:
            state.opening_identity.opening_screen_digest
        };
      }
    }
  };
}

function validateDependencies({
  repository,
  semanticResolver,
  narrator,
  randomSourceFactory,
  decisionSecret
}) {
  const repositoryMethods = [
    'loadPhase2State',
    'commitPhase2Turn',
    'loadPhase2VisibleContext',
    'persistPhase2Screen',
    'loadPhase2Replay'
  ];
  if (!repository
      || repositoryMethods.some(
        (name) => typeof repository[name] !== 'function'
      )) {
    throw new TypeError('Lower Dvina Phase 2 repository ports are required.');
  }
  if (typeof semanticResolver !== 'function'
      || typeof narrator?.run !== 'function'
      || typeof randomSourceFactory !== 'function'
      || !String(decisionSecret ?? '').trim()) {
    throw serverError(
      'TRACE_PHASE_2_DEPENDENCY_MISSING',
      'Phase 2 requires semantic, narration, RNG and bounded-decision ports.',
      { status: 503 }
    );
  }
}

function addMinutes(value, minutes) {
  return new Date(Date.parse(value) + minutes * 60000).toISOString();
}

function requiredText(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw serverError(
      code,
      'Required trace turn identity is missing.',
      { status: 400 }
    );
  }
  return normalized;
}
