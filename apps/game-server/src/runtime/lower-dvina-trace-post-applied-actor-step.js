import { canonicalDigest } from '@rus/materialization';

export function createLowerDvinaTracePostAppliedActorStepOwner({
  committedState, idempotencyKey
} = {}) {
  return async ({ working_projection: projection, factual_events: events }) => {
    if (events.length === 0) return empty(projection);
    const partyId = committedState?.party_id;
    const priorTurnNumber = Number(committedState?.party_state?.turn_number);
    if (!text(partyId) || !Number.isSafeInteger(priorTurnNumber)
        || priorTurnNumber < 0 || !text(idempotencyKey)) {
      gap('TRACE_POST_ACTION_FACTUAL_EVENT_STATE_GAP');
    }
    const turnNumber = priorTurnNumber + 1;
    const changeSetId = `change:${partyId}:turn-step:${turnNumber}`;
    const proposals = events.map((event) => eventWriteProposal({ event,
      partyId, changeSetId, idempotencyKey }));
    const temporal = {
      version: 1, schema: 'turn_step_factual_event_persistence_result_v1',
      clock_before: structuredClone(events[0].occurred_at),
      clock_after: structuredClone(events.at(-1).occurred_at),
      temporal_status: 'completed',
      projection: structuredClone(projection),
      combined_change_set: { proposals }
    };
    temporal.canonical_digest = canonicalDigest(temporal);
    return Object.freeze({ working_projection: structuredClone(projection),
      write_fragments: [], consequence_fragment: null,
      temporal_results: [temporal] });
  };
}

function eventWriteProposal({ event, partyId, changeSetId, idempotencyKey }) {
  const id = event.event_ref.entity_id, at = event.occurred_at;
  const row = { target_schema: 'party_runtime',
    target_table: 'party_temporal_events', id, record: {
      event_id: id, party_id: partyId, event_kind: 'actor_factual_event',
      status: 'resolved', scheduled_at_whole_minutes: at.whole_minutes,
      scheduled_at_subminute_numerator: at.subminute_numerator,
      scheduled_at_subminute_denominator: at.subminute_denominator,
      rule_ref: structuredClone(event.rule_ref),
      policy_ref: structuredClone(event.policy_ref),
      preconditions_digest: canonicalDigest(event),
      idempotency_key: `${idempotencyKey}:event:${id}`,
      change_set_id: changeSetId, terminal_change_set_id: changeSetId,
      state_version: 2 } };
  return { write_set: { appends: [], inserts: [row], updates: [] },
    expected_state_versions: [],
    physical_keys: [`party_runtime.party_temporal_events:${id}`] };
}

function gap(code, details = null) {
  throw Object.assign(new Error(code), { code, details });
}
function text(value) { return typeof value === 'string' && value.length > 0; }
function empty(projection) { return Object.freeze({
  working_projection: structuredClone(projection), write_fragments: [],
  consequence_fragment: null, temporal_results: [] }); }
