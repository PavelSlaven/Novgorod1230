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
            scheduled_at_subminute_denominator,preconditions_digest,
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
          || event != null && (row.event_kind !== event.event_kind
            || row.preconditions_digest !== canonicalDigest(event))) {
        throw phase2IntegrityError();
      }
    }
  }
}
