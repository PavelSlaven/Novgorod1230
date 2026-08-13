
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { addElapsedTime } from '@rus/time-events-history';
import {
  assertPhase4AttackRows,
  assertPhase4StatementRows
} from './lower-dvina-trace-phase-4-read-semantics.js';
import {
  assertPhase4PromiseAndSurrender,
  assertPhase4SemanticPromiseAndSurrender
} from './lower-dvina-trace-phase-4-read-obligation.js';
import {
  isLowerDvinaTraceSemanticRevision
} from './lower-dvina-trace-semantic-conversation-read.js';
import {
  assertPhase5ArrivalResourceRows,
  loadPhase5ArrivalResourceRows
} from './lower-dvina-trace-phase-4-arrival-resource-proof.js';
import { loadPhase4ReadRows } from './lower-dvina-trace-phase-4-read-rows.js';
import {
  assertPhase4PerceptionRows,
  fail,
  timestampColumns
} from './lower-dvina-trace-phase-4-read-perceptions.js';

/**
 * The snapshot is a cache, never the authority.  On every restart/replay the
 * Phase 4 subset is reconstructed from normalized P16 rows and compared with
 * the snapshot's closed factual history.
 */
export async function assertPhase4NormalizedRows(pool, payload, head) {
  const history = payload.phase4_history;
  if (!Array.isArray(history) || history.length === 0) return;
  const semanticRevision = isLowerDvinaTraceSemanticRevision(payload);
  const partyId = payload.party_id;
  const { traversals, activities, checks, decisions, obligations, transitions,
    knife, visible, perceptions, perceptionWitnesses, perceptionReplay,
    npcTransitions, interactions, summaries, knowledge, phase5Resources } = await loadPhase4ReadRows(pool, partyId, payload);
  const movementHistory = history.filter(({ phase4_kind: kind }) => kind === 'movement');
  const negotiationHistory = history.filter(({ phase4_kind: kind }) => kind === 'negotiation');
  const expectedTraversal = movementHistory.map(({ consequence: c }) => ({
    plan_id: c.movement.traversal.ids.plan_id,
    execution_id: c.movement.traversal.ids.execution_id,
    travel_state_id: c.movement.traversal.ids.travel_state_id,
    interval_id: c.movement.traversal.ids.interval_id,
    option_id: c.movement.route_ref,
    planning_state_version: String(c.movement.traversal.planning_state_version),
    status: 'completed', travel_status: 'closed', closed_result: 'completed',
    result_kind: 'segment_completed',
    actual_time_numerator:
      String(c.movement.traversal.interval_result.actual_time_numerator),
    actual_time_denominator:
      String(c.movement.traversal.interval_result.actual_time_denominator)
  }));
  const actualTraversal = traversals.rows.map((row) => ({ ...row,
    planning_state_version: String(row.planning_state_version) }));
  if (canonicalDigest(actualTraversal) !== canonicalDigest(expectedTraversal)) fail();
  assertPhase4PerceptionRows({
    semanticRevision,
    partyId,
    payload,
    movementHistory,
    rows: perceptions.rows,
    witnesses: perceptionWitnesses.rows,
    replayRows: perceptionReplay.rows
  });
  for (const { consequence: c } of movementHistory) {
    const reverseKnowledge = knowledge.rows.find(
      ({ fact_id: id }) => id === c.movement.reverse_route_ref
    );
    if (reverseKnowledge?.knowledge_state
          !== 'known_from_committed_traversal'
        || canonicalDigest(reverseKnowledge.evidence)
          !== canonicalDigest([c.movement.traversal.ids.execution_id])) {
      fail();
    }
  }
  assertPhase5ArrivalResourceRows({ payload, movementHistory,
    rows: phase5Resources.rows });

  const expectedActivities = [];
  for (let historyIndex = 0; historyIndex < negotiationHistory.length;
    historyIndex += 1) {
    const { turn_number: turn, consequence: c,
      time_update: timeUpdate } = negotiationHistory[historyIndex];
    let started = timeUpdate?.clock_before;
    if (!started) fail();
    const projection = c.negotiation.semantic_exchange_projection;
    const previous = negotiationHistory[historyIndex - 1];
    const previousProjection = previous?.consequence?.negotiation
      ?.semantic_exchange_projection;
    const resumesPrevious = projection?.request_id != null
      && projection.request_id === previousProjection?.request_id
      && previousProjection?.time_budget?.status === 'paused';
    for (const root of c.negotiation.activity_roots) {
      const budget = c.negotiation.semantic_exchange_projection?.time_budget;
      const actualMinutes = budget?.elapsed_minutes ?? root.duration_minutes;
      const status = budget?.status ?? 'completed';
      if (resumesPrevious) {
        let originIndex = historyIndex - 1;
        while (originIndex > 0
          && negotiationHistory[originIndex - 1].consequence.negotiation
            .semantic_exchange_projection?.request_id
            === projection.request_id) originIndex -= 1;
        const origin = negotiationHistory[originIndex];
        const previousRoot = origin.consequence.negotiation.activity_roots[0];
        const previousId = `activity:${partyId}:trace-phase4:${
          origin.turn_number}:negotiation`;
        const ended = addElapsedTime(started, {
          exact_minutes: {
            numerator: String(actualMinutes), denominator: '1'
          }
        });
        for (const expected of expectedActivities) {
          if (expected.id === previousId) {
            expected.status = status;
            Object.assign(expected, timestampColumns('execution_ended', ended));
          }
        }
        expectedActivities.push({
          id: previousId,
          activity_snapshot: {
            activity_ref: previousRoot.activity_ref,
            phase4_kind: 'negotiation'
          },
          original_total_minutes: String(previousRoot.duration_minutes),
          status,
          activity_series_id:
            `series:${partyId}:trace-phase4:${origin.turn_number}:negotiation`,
          series_ordinal: 0,
          attempt_ordinal: historyIndex - originIndex,
          actual_time_numerator: String(actualMinutes),
          result_kind: status,
          result_code: previousRoot.activity_ref,
          ...timestampColumns('execution_started',
            origin.time_update.clock_before),
          ...timestampColumns('execution_ended', ended),
          ...timestampColumns('attempt_started', started),
          ...timestampColumns('attempt_ended', ended)
        });
        started = ended;
        continue;
      }
      const { activityKind, seriesOrdinal } = phase4ActivityIdentity({
        semanticRevision,
        durationMinutes: root.duration_minutes
      });
      const ended = addElapsedTime(started, {
        exact_minutes: {
          numerator: String(actualMinutes), denominator: '1'
        }
      });
      expectedActivities.push({
        id: `activity:${partyId}:trace-phase4:${turn}:${activityKind}`,
        activity_snapshot: { activity_ref: root.activity_ref, phase4_kind: 'negotiation' },
        original_total_minutes: String(root.duration_minutes),
        status,
        activity_series_id: `series:${partyId}:trace-phase4:${turn}:${activityKind}`,
        series_ordinal: seriesOrdinal, attempt_ordinal: 0,
        actual_time_numerator: String(actualMinutes),
        result_kind: status,
        result_code: root.activity_ref,
        ...timestampColumns('execution_started', started),
        ...timestampColumns('execution_ended', ended),
        ...timestampColumns('attempt_started', started),
        ...timestampColumns('attempt_ended', ended)
      });
      started = ended;
    }
  }
  if (canonicalDigest(activities.rows) !== canonicalDigest(expectedActivities)) fail();

  const expectedChecks = negotiationHistory.filter(
    ({ consequence: c }) => c.negotiation.check_result !== null
  ).map(({ turn_number: turn, request_id, option_id, consequence: c }) => ({
    check_resolution_id: `check:${partyId}:trace-phase4:${turn}`,
    check_scope_key: {
      request_id,
      option_id,
      promise_offer_stage: c.negotiation.offer_stage
    },
    deterministic_roll_input_digest: canonicalDigest({
      audit: c.negotiation.check_result.audit,
      request: c.negotiation.check_request
    }),
    result_kind: c.negotiation.check_result.outcome.success ? 'success' : 'failure',
    canonical_digest: canonicalDigest(c.negotiation.check_result)
  }));
  if (canonicalDigest(checks.rows) !== canonicalDigest(expectedChecks)) fail();

  const expectedDecisions = semanticRevision
    ? []
    : negotiationHistory.map(({ consequence: c }) => ({
      request_id: c.negotiation.npc_decision.trace.request_id,
      npc_id: payload.npcs.find(({ participant_slot_ref }) => participant_slot_ref === 'ratsha_storehouse_helper')?.instance_id,
      option_id: c.negotiation.npc_decision.trace.option_id,
      options_digest: c.negotiation.npc_decision.trace.options_digest,
      trace_digest: c.negotiation.npc_decision.trace.trace_digest, status: 'committed'
    })).sort((left, right) => left.request_id.localeCompare(right.request_id));
  const actualDecisions = decisions.rows.filter(({ request_id: id }) =>
    expectedDecisions.some(({ request_id }) => request_id === id));
  if (canonicalDigest(actualDecisions) !== canonicalDigest(expectedDecisions)) fail();

  if (semanticRevision) {
    assertPhase4SemanticPromiseAndSurrender({
      payload,
      negotiationHistory,
      obligations: obligations.rows,
      transitions: transitions.rows,
      knife,
      npcTransitions: npcTransitions.rows,
      knowledge: knowledge.rows
    });
    assertPhase4StatementRows({
      partyId,
      payload,
      negotiationHistory: [],
      interactions: interactions.rows,
      summaries: summaries.rows
    });
  } else {
    assertPhase4PromiseAndSurrender({
      payload,
      negotiationHistory,
      obligations: obligations.rows,
      transitions: transitions.rows,
      knife,
      npcTransitions: npcTransitions.rows,
      knowledge: knowledge.rows
    });
    assertPhase4StatementRows({
      partyId,
      payload,
      negotiationHistory,
      interactions: interactions.rows,
      summaries: summaries.rows
    });
    assertPhase4AttackRows({
      partyId,
      payload,
      negotiationHistory,
      npcTransitions: npcTransitions.rows,
      knowledge: knowledge.rows,
      activities: activities.rows
    });
  }
  const envelope = visible.rows[0];
  const screenStatus = head.screen?.screen_status;
  if (visible.rowCount !== 1 || envelope.presentation_status !== 'pending'
      || envelope.committed_state_version !== String(payload.party_state.state_version)
      || envelope.change_set_id
        !== (payload.completion?.status === 'committed'
          ? payload.last_turn.visible_package.change_set_id
          : payload.last_turn.change_set_id)
      || envelope.package_digest !== computeSpatialV3CanonicalDigest(envelope.visible_payload)
      || envelope.package_digest !== payload.last_turn.visible_package.package_digest
      || !['committed_presentation_pending', 'ready'].includes(screenStatus)
      || head.screen?.current_projection_anchor?.package_id !== envelope.package_id) fail();
}

export function phase4ActivityIdentity({
  semanticRevision,
  durationMinutes
}) {
  const negotiation = semanticRevision || durationMinutes === 10;
  return {
    activityKind: negotiation ? 'negotiation' : 'response',
    seriesOrdinal: negotiation ? 0 : 1
  };
}
