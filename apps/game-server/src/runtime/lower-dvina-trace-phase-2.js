import { canonicalDigest } from '@rus/materialization';
import { createTurnCommandRegistry, runTurnWorkflow } from '@rus/turn';
import { serverError } from '../errors.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../internal/lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTracePhase2Bundle } from
  '../internal/lower-dvina-trace-phase-2-bundle.js';
import {
  createTracePhase2InspectionCommand
} from './lower-dvina-trace-phase-2-command.js';
import { resolveTracePhase2Contracts } from
  './lower-dvina-trace-phase-2-contracts.js';
import {
  resolveTracePhase3Contracts
} from './lower-dvina-trace-phase-3-contracts.js';
import { createTracePhase3Commands } from './lower-dvina-trace-phase-3-command.js';
import { createTracePhase4Commands } from './lower-dvina-trace-phase-4-command.js';
import { resolveTracePhase4Contracts } from
  './lower-dvina-trace-phase-4-contracts.js';
import { createTracePhase5Command } from
  './lower-dvina-trace-phase-5-command.js';
import { resolveTracePhase5Contracts } from
  './lower-dvina-trace-phase-5-contracts.js';
import { resolveTracePhase6Contracts } from './lower-dvina-trace-phase-6-contracts.js';
import { createTracePhase6CarryCommand } from './lower-dvina-trace-phase-6-carry.js';
import {
  committedTraceScenarioDefinitionRevision
} from './lower-dvina-trace-committed-revision.js';
import { buildLowerDvinaTracePhase2Services } from
  './lower-dvina-trace-phase-2-services.js';
import {
  bindLowerDvinaTraceTurnStepCommands
} from './lower-dvina-trace-turn-step-bindings.js';
import {
  projectLowerDvinaTracePlayerSafeState
} from './lower-dvina-trace-player-safe-state.js';
import {
  createLowerDvinaTraceTurnStepGenericOwners
} from './lower-dvina-trace-turn-step-generic-owners.js';
export function createLowerDvinaTracePhase2Runtime({
  repository,
  semanticResolver,
  turnStepModel = null,
  playerSafeStateProjector = projectLowerDvinaTracePlayerSafeState,
  narrator,
  randomSourceFactory,
  decisionSecret,
  npcDecisionSelector = null,
  turnStepBodyEventOwner = null,
  turnStepPackingCalculator = null,
  turnStepSemanticActivityOwner = null,
  temporalAdvanceOwner = undefined,
  now = () => new Date().toISOString(),
  bundleLoader = ({ scenarioDefinitionRevision }) =>
    loadLowerDvinaTraceMaterializationBundle({
      scenarioDefinitionRevision
    }),
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
      const [state, phase2Bundle] = await Promise.all([
        repository.loadPhase2State(partyId, {
          presentationIdempotencyKey: idempotencyKey
        }),
        phase2BundleLoader()
      ]);
      const scenarioDefinitionRevision =
        committedTraceScenarioDefinitionRevision(state);
      const bundle = await bundleLoader({ scenarioDefinitionRevision });
      const contracts = resolveTracePhase2Contracts({
        state,
        bundle,
        phase2Bundle
      });
      const phase3Contracts = [9, 10, 11, 12, 13].includes(
        bundle.definition_revision
      )
        ? resolveTracePhase3Contracts({ state, bundle })
        : null;
      const phase4Contracts = [10, 11, 12, 13].includes(
        bundle.definition_revision
      )
        ? resolveTracePhase4Contracts({ state, bundle })
        : null;
      const phase5Contracts = [11, 12, 13].includes(
        bundle.definition_revision
      )
        ? resolveTracePhase5Contracts({ state, bundle })
        : null;
      const phase6Contracts = [12, 13].includes(bundle.definition_revision)
        ? resolveTracePhase6Contracts({ bundle })
        : null;
      const genericOwners = bundle.turn_step_owner_profiles
        ? createLowerDvinaTraceTurnStepGenericOwners({
            profiles: bundle.turn_step_owner_profiles,
            artifactPin: bundle.artifact_pins.turn_step_owner_profiles
          })
        : null;
      const commands = [
        createTracePhase2InspectionCommand({ contracts, inputDigest }),
        ...(phase3Contracts ? createTracePhase3Commands({
          contracts: phase3Contracts,
          inputDigest
        }) : []),
        ...(phase4Contracts ? createTracePhase4Commands({
          contracts: phase4Contracts,
          inputDigest,
          selectNpcDecision: npcDecisionSelector
        }) : []),
        ...(phase5Contracts ? [createTracePhase5Command({
          contracts: phase5Contracts,
          inputDigest
        })] : []),
        ...(phase6Contracts ? [createTracePhase6CarryCommand({
          contracts: phase6Contracts, inputDigest,
          temporalAdvanceOwner
        })] : [])
      ];
      const registry = createTurnCommandRegistry(
        bindLowerDvinaTraceTurnStepCommands({
          commands,
          bundle,
          targetRefs: {
            actor: state.actor_id,
            wreck: contracts.locationRef,
            fishingCamp: phase3Contracts?.ids.campLocation,
            eremey: phase3Contracts?.actors[0]?.instance_id,
            evidence: phase3Contracts?.ids.evidence,
            dryingShed: phase4Contracts?.ids.shed,
            ratsha:
              phase4Contracts?.actors.ratsha_storehouse_helper.instance_id,
            onisim:
              phase5Contracts?.actors.onisim_boatman.instance_id
          }
        })
      );
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
          policy_pins: [
            contracts.activityPin,
            ...(phase3Contracts?.activityPins ?? []),
            ...(phase4Contracts?.activityPins ?? []),
            ...(phase5Contracts?.activityPins ?? [])
          ]
        }
      }, buildLowerDvinaTracePhase2Services({
        partyId,
        requestId,
        idempotencyKey,
        inputDigest,
        issuedAt,
        state,
        contracts,
        phase3Contracts,
        phase4Contracts,
        phase5Contracts,
        phase6Contracts,
        registry,
        repository,
        semanticResolver,
        turnStepModel,
        playerSafeStateProjector,
        turnStepBodyEventOwner:
          turnStepBodyEventOwner ?? genericOwners?.bodyEventOwner,
        turnStepSemanticActivityOwner:
          turnStepSemanticActivityOwner ?? genericOwners?.semanticActivityOwner,
        turnStepGenericCheckContextOwner:
          genericOwners?.genericCheckContextOwner,
        turnStepGenericBodyEffect: genericOwners?.bodyEffect,
        turnStepOrdinaryResultPolicy: genericOwners?.ordinaryResultPolicy,
        turnStepApprovedOwners: genericOwners,
        turnStepPackingCalculator,
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
