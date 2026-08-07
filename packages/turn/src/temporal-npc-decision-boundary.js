import { canonicalDigest } from '@rus/materialization';
import { compareGameTimestamp } from '@rus/time-events-history';
import { cloneFrozen } from './temporal-advance-support.js';
import { aggregateTemporalNpcDecisionSignals } from
  './temporal-npc-decision-signals.js';

function timestamp(value) {
  return value != null
    && typeof value === 'object'
    && typeof value.whole_minutes === 'string'
    && typeof value.subminute_numerator === 'string'
    && typeof value.subminute_denominator === 'string';
}

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = cloneFrozen(details);
  throw error;
}

export async function advanceTemporalNpcDecisionBoundary({
  advanceToBoundary,
  resolveDecision,
  executeActorStep,
  continueAdvance,
  decisionSignalState = null,
  safety_limits = null
} = {}) {
  for (const [name, handler] of Object.entries({
    advanceToBoundary,
    resolveDecision,
    executeActorStep,
    continueAdvance
  })) {
    if (typeof handler !== 'function') {
      throw new TypeError(`temporal NPC decision ${name} is required`);
    }
  }
  const maxBatches = Number.isSafeInteger(
    safety_limits?.max_same_time_reaction_batches
  ) && safety_limits.max_same_time_reaction_batches > 0
    ? safety_limits.max_same_time_reaction_batches
    : 32;
  const temporal = await advanceToBoundary();
  const decisionTimestamp = temporal?.result?.clock_after;
  if (temporal?.result?.temporal_status !== 'paused'
      || !timestamp(decisionTimestamp)) {
    fail('temporal_change_set_conflict',
      'NPC decision handoff requires one fully resolved paused batch.');
  }

  if (decisionSignalState === null) {
    return runSingleNpcDecisionPass({
      temporal,
      decisionTimestamp,
      resolveDecision,
      executeActorStep,
      continueAdvance
    });
  }

  let projection = cloneFrozen(
    temporal.state_projection ?? temporal.projection ?? {}
  );
  let factualState = cloneFrozen(decisionSignalState.factual_state);
  let decision = null;
  let actorStep = null;
  const resolvedBatches = [];

  for (let batchOrdinal = 1; batchOrdinal <= maxBatches; batchOrdinal += 1) {
    const signalBatch = aggregateTemporalNpcDecisionSignals({
      temporal: {
        ...temporal,
        projection,
        state_projection: projection
      },
      ...decisionSignalState,
      factual_state: factualState,
      same_time_batch_ordinal: batchOrdinal
    });
    if (signalBatch === null) {
      if (batchOrdinal === 1) {
        fail('temporal_change_set_conflict',
          'Paused NPC decision batch did not produce one decision boundary.');
      }
      break;
    }

    decision = await resolveDecision(cloneFrozen({
      temporal: {
        ...temporal,
        projection,
        state_projection: projection
      },
      signal_batch: signalBatch
    }));
    if (!timestamp(decision?.boundary?.scheduled_at)
        || compareGameTimestamp(
          decision.boundary.scheduled_at, decisionTimestamp
        ) !== 0) {
      fail('temporal_candidate_stale',
        'NPC decision boundary must match the paused temporal timestamp.');
    }
    if (decision.boundary.same_time_batch_ref != null
        && canonicalDigest(decision.boundary.same_time_batch_ref)
          !== canonicalDigest(signalBatch.same_time_batch_ref)) {
      fail('temporal_change_set_conflict',
        'NPC decision boundary batch identity must match the resolved batch.');
    }

    actorStep = await executeActorStep(cloneFrozen({
      temporal: {
        ...temporal,
        projection,
        state_projection: projection
      },
      decision
    }));
    if (actorStep?.domain_result?.pass === false
        && actorStep?.working_projection != null
        && typeof actorStep.working_projection === 'object'
        && !Array.isArray(actorStep.working_projection)) {
      return cloneFrozen({
        temporal,
        decision,
        actor_step: actorStep,
        continuation: null,
        resolved_batches: [...resolvedBatches, {
          same_time_batch_ref: signalBatch.same_time_batch_ref,
          same_time_batch_ordinal: batchOrdinal,
          decision,
          actor_step: actorStep
        }]
      });
    }
    if (!timestamp(actorStep?.started_at)
        || compareGameTimestamp(actorStep.started_at, decisionTimestamp) !== 0
        || actorStep?.working_projection == null
        || typeof actorStep.working_projection !== 'object'
        || Array.isArray(actorStep.working_projection)) {
      fail('temporal_change_set_conflict',
        'NPC actor-step must start on the decision timestamp and return working state.');
    }

    projection = cloneFrozen(actorStep.working_projection);
    const consumed = [
      ...(factualState.consumed_npc_decision_signal_ids ?? []),
      ...(decision.autonomous?.consumed_signal_ids
        ?? signalBatch.ordered_signals.map(({ signal_id: id }) => id))
    ];
    const knownSignals = [
      ...(factualState.npc_decision_signals ?? []),
      ...signalBatch.new_signal_records
    ];
    factualState = cloneFrozen({
      ...factualState,
      consumed_npc_decision_signal_ids: [...new Set(consumed)],
      npc_decision_signals: knownSignals
    });
    resolvedBatches.push({
      same_time_batch_ref: signalBatch.same_time_batch_ref,
      same_time_batch_ordinal: batchOrdinal,
      decision,
      actor_step: actorStep
    });
  }

  if (resolvedBatches.length >= maxBatches) {
    const again = aggregateTemporalNpcDecisionSignals({
      temporal: {
        ...temporal,
        projection,
        state_projection: projection
      },
      ...decisionSignalState,
      factual_state: factualState,
      same_time_batch_ordinal: maxBatches + 1
    });
    if (again !== null) {
      fail('temporal_boundary_cycle',
        'Temporal same-time NPC reaction loop did not reach a fixed point.');
    }
  }

  const continuation = await continueAdvance(cloneFrozen({
    temporal: {
      ...temporal,
      projection,
      state_projection: projection
    },
    decision,
    actor_step: actorStep
  }));
  if (!timestamp(continuation?.result?.clock_before)
      || !timestamp(continuation?.result?.clock_after)
      || compareGameTimestamp(
        continuation.result.clock_before, decisionTimestamp
      ) !== 0
      || compareGameTimestamp(
        continuation.result.clock_after, decisionTimestamp
      ) < 0) {
    fail('temporal_change_set_conflict',
      'Temporal continuation must resume from the applied actor-step timestamp.');
  }
  return cloneFrozen({
    temporal,
    decision,
    actor_step: actorStep,
    continuation,
    resolved_batches: resolvedBatches
  });
}

async function runSingleNpcDecisionPass({
  temporal,
  decisionTimestamp,
  resolveDecision,
  executeActorStep,
  continueAdvance
}) {
  const decision = await resolveDecision(cloneFrozen({
    temporal,
    signal_batch: null
  }));
  if (!timestamp(decision?.boundary?.scheduled_at)
      || compareGameTimestamp(
        decision.boundary.scheduled_at, decisionTimestamp
      ) !== 0) {
    fail('temporal_candidate_stale',
      'NPC decision boundary must match the paused temporal timestamp.');
  }
  const actorStep = await executeActorStep(cloneFrozen({
    temporal,
    decision
  }));
  if (actorStep?.domain_result?.pass === false
      && actorStep?.working_projection != null
      && typeof actorStep.working_projection === 'object'
      && !Array.isArray(actorStep.working_projection)) {
    return cloneFrozen({
      temporal,
      decision,
      actor_step: actorStep,
      continuation: null,
      resolved_batches: []
    });
  }
  if (!timestamp(actorStep?.started_at)
      || compareGameTimestamp(actorStep.started_at, decisionTimestamp) !== 0
      || actorStep?.working_projection == null
      || typeof actorStep.working_projection !== 'object'
      || Array.isArray(actorStep.working_projection)) {
    fail('temporal_change_set_conflict',
      'NPC actor-step must start on the decision timestamp and return working state.');
  }
  const continuation = await continueAdvance(cloneFrozen({
    temporal,
    decision,
    actor_step: actorStep
  }));
  if (!timestamp(continuation?.result?.clock_before)
      || !timestamp(continuation?.result?.clock_after)
      || compareGameTimestamp(
        continuation.result.clock_before, decisionTimestamp
      ) !== 0
      || compareGameTimestamp(
        continuation.result.clock_after, decisionTimestamp
      ) < 0) {
    fail('temporal_change_set_conflict',
      'Temporal continuation must resume from the applied actor-step timestamp.');
  }
  return cloneFrozen({
    temporal,
    decision,
    actor_step: actorStep,
    continuation,
    resolved_batches: []
  });
}
