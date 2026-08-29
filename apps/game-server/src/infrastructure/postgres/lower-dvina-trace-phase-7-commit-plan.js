import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { integrateSpatialV3TemporalWriteFragments } from
  '@rus/turn/spatial-v3-temporal-write-integration';
import { serverError } from '../../errors.js';
import {
  bindLowerDvinaTraceFactualTurnStepIdempotency
} from './lower-dvina-trace-turn-step-idempotency.js';
import {
  commitRechecks,
  expectedVersions,
  scheduleItemKeys
} from './lower-dvina-trace-phase-7-commit-policy.js';
import { integrateConversationTemporalWrites } from
  './lower-dvina-trace-conversation-temporal.js';
import { ordinaryPhysicalKeys } from './lower-dvina-trace-ordinary-p16.js';
import { localFirePhysicalKeys } from './local-fire-atomic-write-plan.js';
import { actionProducedPhysicalKeys } from
  './action-produced-atomic-write-plan.js';
import { spatialSemanticPhysicalKeys } from
  './spatial-semantic-atomic-write-plan.js';

export async function buildPhase7P16Plan({ partyId, writePlan, inputDigest,
  phase7Contracts, state, factual, turnNumber, changeSetId, idemId,
  visibleEnvelope, writes, operationBatch, ordinaryPlan, actionProductionPlans,
  localFirePlans, spatialSemanticPlan, approveNarration }) {
  const builder = createCombinedWritePlanBuilder({
    verifyApproval: async (candidate) => ({
      ok: candidate.party_id === partyId
        && candidate.operation_kind === 'trace_phase_7_fire_rest'
    }),
    approveNarration
  });
  const baseInput = {
    plan_id: `p16:${partyId}:trace-phase7:${turnNumber}`,
    party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_phase_7_fire_rest',
    canonical_input_digest: normalizeDigest(inputDigest),
    expected_state_versions: expectedVersions({ partyId, state, factual,
      ownerOperationBatch: operationBatch }),
    validation_report: {
      status: 'pass',
      digest: normalizeDigest(canonicalDigest({
        input_digest: inputDigest,
        option_id: factual.mode_resolution.option_id,
        decision_request_id:
          factual.consequence.phase7.autonomous.request.request_id,
        schedule_execution_ref:
          factual.consequence.phase7.schedule_execution.execution_binding_ref
      }))
    },
    idempotency: {
      id: idemId,
      key: factual.player_input.idempotency_key,
      ...phase7IdempotencyBinding({
        envelope: writePlan.turn_step_commit,
        inputDigest,
        factual,
        semanticCommandDigest: normalizeDigest(canonicalDigest({
          input_digest: inputDigest,
          option_id: factual.mode_resolution.option_id
        })),
        semanticDependencyPins: visibleEnvelope.dependency_pins,
        visibleDependencyPins: visibleEnvelope.dependency_pins
      }),
      request_id: factual.player_input.request_id
    },
    change_set: { id: changeSetId },
    visible_package_envelope: visibleEnvelope,
    approved_write_sets: [writes],
    lock_context: {
      owner_keys: [
        `actor:${state.actor_id}`,
        `actor:${factual.consequence.phase7.autonomous.request.npc_ref}`
      ],
      execution_keys: [
        factual.consequence.activity_attempt_id,
        factual.consequence.phase7.autonomous.request.request_id
      ],
      g4_keys: [],
      physical_keys: [...new Set([
        ...Object.values(writes).flat().map(
          (write) => `party_runtime.${write.target_table}:${write.id}`
        ),
        `party_runtime.party_npcs:${
          factual.consequence.phase7.autonomous.request.npc_ref}`,
        ...scheduleItemKeys(state, factual),
        ...ordinaryPhysicalKeys(ordinaryPlan),
        ...actionProductionPlans.flatMap(actionProducedPhysicalKeys),
        ...localFirePlans.flatMap(localFirePhysicalKeys),
        ...spatialSemanticPhysicalKeys(spatialSemanticPlan)
      ])]
    },
    commit_rechecks: commitRechecks({
      partyId,
      state,
      factual,
      phase7Contracts,
      inputDigest
    }),
    ordinary_materialization_atomic_write_plan: ordinaryPlan,
    action_production_atomic_write_plans: actionProductionPlans,
    local_fire_atomic_write_plans: localFirePlans,
    spatial_semantic_atomic_write_plan: spatialSemanticPlan
  };
  const firstIntegrated = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: baseInput,
    temporal_result: factual.consequence.phase7.temporal.result
  });
  if (!firstIntegrated.ok) {
    fail('TRACE_PHASE_7_TEMPORAL_WRITE_CONFLICT', firstIntegrated.error);
  }
  const integrated = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: firstIntegrated.input,
    temporal_result: factual.consequence.phase7.schedule_temporal.result
  });
  if (!integrated.ok) {
    fail('TRACE_PHASE_7_TEMPORAL_WRITE_CONFLICT', integrated.error);
  }
  const finalInput = factual.consequence.turn10_kind === 'companion_request'
    ? integrateConversationTemporalWrites({
        input: integrated.input,
        semanticExchange: factual.consequence.conversation.semantic_exchange
      })
    : integrated.input;
  const built = await builder.build(finalInput);
  if (!built.ok) fail('TRACE_PHASE_7_WRITE_PLAN_REJECTED', built.error);
  return built;
}

function phase7IdempotencyBinding(input) {
  const binding = bindLowerDvinaTraceFactualTurnStepIdempotency(input);
  const plan = input.factual.consequence.phase7.autonomous.proposal.plan;
  const operation = plan.operations.find(
    ({ op }) => op === 'request_world_process');
  if (operation == null) return binding;
  return { ...binding, semantic_command_snapshot: {
    ...binding.semantic_command_snapshot,
    npc_actor_step: {
      request_id: plan.request_id,
      root_turn_id: plan.root_turn_id,
      step_index: plan.decision_index,
      operation: structuredClone(operation)
    }
  } };
}

const normalizeDigest = (value) =>
  `sha256:${String(value).replace('sha256:', '')}`;

function fail(code, details = null) {
  throw serverError(code, 'Phase 7 factual commit failed closed.', {
    status: 409,
    details
  });
}
