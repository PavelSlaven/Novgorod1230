import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { buildTurnStepBodyEffectRef } from
  './lower-dvina-trace-turn-step-body-history.js';

export async function assertTurnStepBodyHistoryRows(pool, payload, headRow) {
  assertNormalizedBody(payload, headRow);
  const history = payload.turn_step_body_history ?? [];
  if (history.length === 0) {
    assertCurrentEffect(history, payload);
    return;
  }
  const ids = history.map(({ history_id: id }) => id);
  if (new Set(ids).size !== ids.length) invalid();
  const result = await pool.query(
    `SELECT history_id,party_id,subject_kind,subject_id,effect_ref,
            change_set_id,idempotency_record_id,
            occurred_at_whole_minutes::text,
            occurred_at_subminute_numerator::text,
            occurred_at_subminute_denominator::text
       FROM party_runtime.party_body_temporal_history
      WHERE history_id=ANY($1::text[])`,
    [ids]
  );
  if (result.rows.length !== history.length) invalid();
  const rows = new Map(result.rows.map((row) => [row.history_id, row]));
  if (rows.size !== result.rows.length) invalid();
  for (const expected of history) {
    const row = rows.get(expected.history_id);
    if (!row || !same(row, expected)
        || row.party_id !== payload.party_id
        || row.subject_id !== payload.actor_id
        || row.subject_kind !== 'player_character') invalid();
  }
  assertCurrentEffect(history, payload);
}

function assertCurrentEffect(history, payload) {
  const envelope = payload.last_turn?.turn_step_commit;
  if (!envelope) return;
  const current = history.filter(({ effect_ref: effect }) =>
    effect?.root_turn_id === envelope.root_turn_id);
  if (envelope.body_update?.applied !== true) {
    if (current.length !== 0) invalid();
    return;
  }
  if (current.length !== 1) invalid();
  const expected = current[0];
  let effectRef;
  try {
    effectRef = buildTurnStepBodyEffectRef({
      factual: envelope,
      batch: { root_turn_id: envelope.root_turn_id }
    });
  } catch {
    invalid();
  }
  if (!same(expected.effect_ref, effectRef)
      || !sameBodyMetrics(payload.body_state,
        envelope.body_update.state_after)
      || expected.change_set_id
        !== payload.last_turn.visible_package?.change_set_id
      || expected.idempotency_record_id
        !== payload.last_turn.turn_step_idempotency_record_id
      || expected.occurred_at_whole_minutes
        !== envelope.time_update?.clock_after?.whole_minutes
      || expected.occurred_at_subminute_numerator
        !== envelope.time_update?.clock_after?.subminute_numerator
      || expected.occurred_at_subminute_denominator
        !== envelope.time_update?.clock_after?.subminute_denominator) invalid();
}

function assertNormalizedBody(payload, row) {
  const body = payload.body_state;
  const valid = body != null
    && ['health', 'energy', 'satiety'].every((key) =>
      Number.isFinite(body[key]))
    && Number(row?.body_state_version)
      === payload.party_state?.body_state_version
    && row?.body_health === String(body.health)
    && row?.body_energy === String(body.energy)
    && row?.body_satiety === String(body.satiety);
  if (!valid) invalid();
  const envelope = payload.last_turn?.turn_step_commit;
  if (envelope?.body_update?.applied === true
      && (!sameBodyMetrics(body, envelope.body_update.state_after)
        || row.body_updated_change_set_id
          !== payload.last_turn.visible_package?.change_set_id)) invalid();
}

function sameBodyMetrics(left, right) {
  return ['health', 'energy', 'satiety'].every((key) =>
    left?.[key] === right?.[key]);
}

function same(left, right) {
  return canonicalDigest(left) === canonicalDigest(right);
}

function invalid() {
  throw phase2IntegrityError();
}
