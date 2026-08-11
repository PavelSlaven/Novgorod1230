import { canonicalDigest } from '@rus/materialization';
import { hydrateCombatSession } from './combat-session-persistence.js';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export async function assertCombatSessionRows(partyPool, payload) {
  const result = await partyPool.query(
    `SELECT combat_id,state_version,status,started_at,scope_ref,
            participant_refs,participant_states,exchange_ordinal,
            last_exchange_ref,player_response_required,last_change_set_id,
            canonical_digest,session_schema
       FROM party_runtime.party_combat_sessions
      WHERE party_id=$1 AND status <> 'ended'
      ORDER BY combat_id`,
    [payload.party_id]
  );
  const persisted = result.rows.map(hydrateCombatSession);
  const snapshot = payload.combat_sessions ?? [];
  if (snapshot.length !== persisted.length
      || snapshot.some((session, index) =>
        canonicalDigest(session) !== canonicalDigest(persisted[index]))) {
    throw phase2IntegrityError();
  }
  await assertCombatEventRows(partyPool, payload);
}

async function assertCombatEventRows(partyPool, payload) {
  const histories = payload.combat_history ?? [];
  const expected = histories.flatMap((history) =>
    (history.outcome_events ?? []).map((event) => ({ event, history })));
  const exactIds = new Set(expected.map(({ event }) => event.event_id));
  const allRefs = histories.flatMap(
    (history) => history.outcome_event_refs ?? []);
  const allIds = new Set(allRefs);
  if (allIds.size !== allRefs.length || exactIds.size !== expected.length) {
    throw phase2IntegrityError();
  }
  for (const history of histories) {
    if (history.outcome_events == null) continue;
    const refs = new Set(history.outcome_event_refs ?? []);
    const eventIds = new Set(history.outcome_events.map(
      ({ event_id: id }) => id));
    if (refs.size !== eventIds.size
        || [...refs].some((id) => !eventIds.has(id))) {
      throw phase2IntegrityError();
    }
  }
  for (const record of payload.npc_decision_signals ?? []) {
    const source = record.signal?.source_event_ref;
    if (source?.entity_kind === 'combat_event'
        && !allIds.has(source.entity_id)) {
      throw phase2IntegrityError();
    }
  }
  if (allIds.size === 0) return;
  const result = await partyPool.query(
    `SELECT event_id,event_kind,scheduled_at_whole_minutes,
            scheduled_at_subminute_numerator,
            scheduled_at_subminute_denominator,rule_ref,preconditions_digest,
            change_set_id
       FROM party_runtime.party_temporal_events
      WHERE party_id=$1 AND event_id=ANY($2::text[])
      ORDER BY event_id`,
    [payload.party_id, [...allIds].sort()]
  );
  const byId = new Map(result.rows.map((row) => [row.event_id, row]));
  if (byId.size !== allIds.size) throw phase2IntegrityError();
  for (const history of histories) {
    const at = history.occurred_at;
    const exact = new Map((history.outcome_events ?? [])
      .map((event) => [event.event_id, event]));
    for (const id of history.outcome_event_refs ?? []) {
      const row = byId.get(id);
      const event = exact.get(id);
      if (!row
          || String(row.scheduled_at_whole_minutes) !== String(at.whole_minutes)
          || String(row.scheduled_at_subminute_numerator)
            !== String(at.subminute_numerator)
          || String(row.scheduled_at_subminute_denominator)
            !== String(at.subminute_denominator)
          || row.change_set_id !== history.change_set_id
          || event?.traversal_interval_ref != null
            && canonicalDigest(row.rule_ref)
              !== canonicalDigest(event.traversal_interval_ref)
          || event != null && (row.event_kind !== event.event_kind
            || row.preconditions_digest !== canonicalDigest(event))) {
        throw phase2IntegrityError();
      }
    }
  }
  await assertCombatTraversalLineage(partyPool, payload.party_id, expected);
}

async function assertCombatTraversalLineage(partyPool, partyId, expected) {
  const routeEvents = expected.filter(
    ({ event }) => event.traversal_interval_ref != null);
  if (routeEvents.length === 0) return;
  const intervalIds = routeEvents.map(
    ({ event: { traversal_interval_ref: ref } }) => ref.entity_id).sort();
  if (new Set(intervalIds).size !== intervalIds.length
      || routeEvents.some(({ event: { traversal_interval_ref: interval,
        traversal_execution_ref: execution } }) =>
        interval.entity_kind !== 'traversal_interval_result'
        || execution?.entity_kind !== 'route_plan_execution')) {
    throw phase2IntegrityError();
  }
  const result = await partyPool.query(
    `SELECT r.id AS interval_id,r.route_plan_execution_id,r.plan_step_ordinal,
            r.result_kind,r.planned_time_numerator,r.planned_time_denominator,
            r.actual_progress_after_ppm,r.actual_time_numerator,
            r.actual_time_denominator,r.cumulative_time_before_numerator,
            r.cumulative_time_before_denominator,
            r.cumulative_time_after_numerator,
            r.cumulative_time_after_denominator,r.result_change_set_id,
            e.party_id,e.status AS execution_status,e.updated_change_set_id,
            p.option_id,p.journey_owner_ref,p.created_change_set_id,
            s.ordinal AS step_ordinal,s.step_kind,s.static_contract_snapshot,
            t.status AS travel_status,t.closed_result,t.segment_progress_ppm,
            t.plan_step_ordinal AS travel_step_ordinal,
            t.cumulative_actual_time_numerator,
            t.cumulative_actual_time_denominator,
            t.updated_change_set_id AS travel_change_set_id
       FROM party_runtime.party_traversal_interval_results r
       JOIN party_runtime.party_route_plan_executions e
         ON e.id=r.route_plan_execution_id
       JOIN party_runtime.party_route_plans p ON p.id=e.route_plan_id
       JOIN party_runtime.party_route_plan_steps s
         ON s.route_plan_id=p.id AND s.ordinal=r.plan_step_ordinal
       JOIN party_runtime.traveller_travel_states t
         ON t.route_plan_execution_id=e.id
      WHERE e.party_id=$1 AND p.party_id=$1 AND t.party_id=$1
        AND r.id=ANY($2::text[])
      ORDER BY r.id`, [partyId, intervalIds]);
  const byId = new Map(result.rows.map((row) => [row.interval_id, row]));
  if (byId.size !== routeEvents.length) throw phase2IntegrityError();
  for (const { event, history } of routeEvents) {
    const row = byId.get(event.traversal_interval_ref.entity_id);
    const exact = event.exact_elapsed?.exact_minutes;
    if (!row
        || row.party_id !== partyId
        || row.route_plan_execution_id
          !== event.traversal_execution_ref.entity_id
        || row.option_id !== event.movement_ref
        || canonicalDigest(row.journey_owner_ref)
          !== canonicalDigest(event.actor_ref)
        || row.result_change_set_id !== history.change_set_id
        || row.updated_change_set_id !== history.change_set_id
        || row.created_change_set_id !== history.change_set_id
        || row.travel_change_set_id !== history.change_set_id
        || row.result_kind !== 'segment_completed'
        || row.step_kind !== 'timed_traversal'
        || Number(row.plan_step_ordinal) !== Number(row.step_ordinal)
        || Number(row.travel_step_ordinal) !== Number(row.step_ordinal)
        || exact == null
        || String(row.planned_time_numerator) !== String(exact.numerator)
        || String(row.planned_time_denominator) !== String(exact.denominator)
        || String(row.actual_time_numerator) !== String(exact.numerator)
        || String(row.actual_time_denominator) !== String(exact.denominator)
        || String(row.cumulative_time_before_numerator) !== '0'
        || String(row.cumulative_time_before_denominator) !== '1'
        || String(row.cumulative_time_after_numerator)
          !== String(exact.numerator)
        || String(row.cumulative_time_after_denominator)
          !== String(exact.denominator)
        || String(row.cumulative_actual_time_numerator)
          !== String(exact.numerator)
        || String(row.cumulative_actual_time_denominator)
          !== String(exact.denominator)
        || String(row.static_contract_snapshot?.base_minutes)
          !== String(exact.numerator)
        || Number(row.actual_progress_after_ppm) !== 1_000_000
        || row.execution_status !== 'completed'
        || row.travel_status !== 'closed'
        || row.closed_result !== 'completed'
        || Number(row.segment_progress_ppm) !== 1_000_000) {
      throw phase2IntegrityError();
    }
  }
}
