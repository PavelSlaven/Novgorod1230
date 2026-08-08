import { canonicalDigest } from '@rus/materialization';
import {
  orderNpcDecisionBoundaries
} from '@rus/npc-runtime';
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

function refKey(value) {
  return `${value.entity_kind}\u0000${value.entity_id}`;
}

function resolveNpcRefs(decisionSignalState, descriptors) {
  if (Array.isArray(decisionSignalState.npc_refs)
      && decisionSignalState.npc_refs.length > 0) {
    const unique = new Map();
    for (const npcRef of decisionSignalState.npc_refs) {
      unique.set(refKey(npcRef), npcRef);
    }
    return [...unique.values()].sort((left, right) =>
      refKey(left).localeCompare(refKey(right), 'en'));
  }
  const discovered = new Map();
  for (const descriptor of descriptors ?? []) {
    const subject = descriptor?.subject_ref;
    if (subject?.entity_kind === 'npc' && typeof subject.entity_id === 'string') {
      discovered.set(refKey(subject), subject);
    }
  }
  if (discovered.size > 0) {
    return [...discovered.values()].sort((left, right) =>
      refKey(left).localeCompare(refKey(right), 'en'));
  }
  if (decisionSignalState.npc_ref != null) {
    return [decisionSignalState.npc_ref];
  }
  return [];
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
  let lastResolvedOrdinal = 0;
  let hadSuccessfulActorStep = false;
  let hadUnresolvedDomainRejection = false;
  let unresolvedDomainRejection = null;
  const resolvedBatches = [];

  for (let batchOrdinal = 1; batchOrdinal <= maxBatches; batchOrdinal += 1) {
    const descriptors = projection?.npc_decision_signal_descriptors ?? [];
    const npcRefs = resolveNpcRefs(decisionSignalState, descriptors);
    if (npcRefs.length === 0) {
      if (batchOrdinal === 1) {
        fail('temporal_change_set_conflict',
          'Paused NPC decision batch requires at least one NPC subject.');
      }
      break;
    }

    const signalBatches = [];
    for (const npcRef of npcRefs) {
      const signalBatch = aggregateTemporalNpcDecisionSignals({
        temporal: {
          ...temporal,
          projection,
          state_projection: projection
        },
        ...decisionSignalState,
        npc_ref: npcRef,
        factual_state: factualState,
        same_time_batch_ordinal: batchOrdinal
      });
      if (signalBatch !== null) {
        signalBatches.push(signalBatch);
      }
    }
    if (signalBatches.length === 0) {
      if (batchOrdinal === 1) {
        fail('temporal_change_set_conflict',
          'Paused NPC decision batch did not produce one decision boundary.');
      }
      break;
    }

    const orderedBoundaries = orderNpcDecisionBoundaries(
      signalBatches.map(({ boundary }) => boundary)
    );
    const orderedBatches = orderedBoundaries.map((boundary) =>
      signalBatches.find(({ boundary: candidate }) =>
        candidate.boundary_id === boundary.boundary_id));

    for (const signalBatch of orderedBatches) {
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
      // Domain reject for one NPC stays unresolved while same-time siblings run.
      // The unresolved boundary keeps the clock paused after the sibling pass.
      const domainRejected = actorStep?.domain_result?.pass === false
        && actorStep?.working_projection != null
        && typeof actorStep.working_projection === 'object'
        && !Array.isArray(actorStep.working_projection);
      if (!domainRejected
          && (!timestamp(actorStep?.started_at)
            || compareGameTimestamp(actorStep.started_at, decisionTimestamp) !== 0
            || actorStep?.working_projection == null
            || typeof actorStep.working_projection !== 'object'
            || Array.isArray(actorStep.working_projection))) {
        fail('temporal_change_set_conflict',
          'NPC actor-step must start on the decision timestamp and return working state.');
      }
      if (!domainRejected) {
        hadSuccessfulActorStep = true;
      } else {
        hadUnresolvedDomainRejection = true;
        unresolvedDomainRejection ??= {
          decision,
          actor_step: actorStep,
          unconsumed_signal_ids: signalBatch.ordered_signals.map(
            ({ signal_id: id }) => id)
        };
      }

      projection = cloneFrozen(actorStep.working_projection);
      const handledForThisAdvance = [
        ...(factualState.consumed_npc_decision_signal_ids ?? []),
        ...(domainRejected ? [] : signalBatch.ordered_signals.map(
          ({ signal_id: id }) => id))
      ];
      const knownSignals = [
        ...(factualState.npc_decision_signals ?? []),
        ...signalBatch.new_signal_records
      ];
      factualState = cloneFrozen({
        ...factualState,
        consumed_npc_decision_signal_ids: [
          ...new Set(handledForThisAdvance)
        ],
        npc_decision_signals: knownSignals
      });
      resolvedBatches.push({
        same_time_batch_ref: signalBatch.same_time_batch_ref,
        same_time_batch_ordinal: batchOrdinal,
        decision,
        actor_step: actorStep
      });
      lastResolvedOrdinal = batchOrdinal;
    }
    if (hadUnresolvedDomainRejection) break;
  }

  if (!hadUnresolvedDomainRejection && lastResolvedOrdinal >= maxBatches) {
    const descriptors = projection?.npc_decision_signal_descriptors ?? [];
    const npcRefs = resolveNpcRefs(decisionSignalState, descriptors);
    const again = npcRefs.some((npcRef) =>
      aggregateTemporalNpcDecisionSignals({
        temporal: {
          ...temporal,
          projection,
          state_projection: projection
        },
        ...decisionSignalState,
        npc_ref: npcRef,
        factual_state: factualState,
        same_time_batch_ordinal: maxBatches + 1
      }) !== null);
    if (again) {
      fail('temporal_boundary_cycle',
        'Temporal same-time NPC reaction loop did not reach a fixed point.');
    }
  }

  if (hadUnresolvedDomainRejection || !hadSuccessfulActorStep) {
    return cloneFrozen({
      temporal,
      decision,
      actor_step: actorStep,
      continuation: null,
      unresolved_domain_rejection: unresolvedDomainRejection,
      resolved_batches: resolvedBatches
    });
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
    unresolved_domain_rejection: null,
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
      unresolved_domain_rejection: {
        decision,
        actor_step: actorStep,
        unconsumed_signal_ids: []
      },
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
    unresolved_domain_rejection: null,
    resolved_batches: []
  });
}
