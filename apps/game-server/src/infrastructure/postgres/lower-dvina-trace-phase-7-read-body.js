import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export function assertPhase7BodyHistory(payload, result) {
  const phase7 = payload.phase7_fire_rest;
  const row = result.rows[0];
  const history = (payload.body_effect_history ?? []).find(
    ({ history_id: id }) =>
      id === `body-history:${payload.party_id}:trace-phase7:fire-rest`);
  if (result.rowCount !== 1 || !history
      || row.subject_kind !== 'player_character'
      || row.subject_id !== payload.actor_id
      || row.change_set_id !== phase7.change_set_id
      || row.effect_ref?.entity_kind !== 'body_effect'
      || row.effect_ref?.entity_id !== phase7.body_effect_ref
      || row.effect_ref?.activity_attempt_id !== phase7.activity_execution_id
      || !Array.isArray(row.effect_ref?.condition_transitions)
      || canonicalDigest({
        whole_minutes: row.occurred_at_whole_minutes,
        subminute_numerator: row.occurred_at_subminute_numerator,
        subminute_denominator: row.occurred_at_subminute_denominator
      }) !== canonicalDigest(history.occurred_at)) throw phase2IntegrityError();
}
