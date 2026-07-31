import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export function assertPhase6PlayerBody(payload, history, body, bodyHistory) {
  const effects = history.flatMap(
    (entry) => entry.body_effects_by_subject ?? []
  ).filter(({ subject_ref: subject }) => subject === 'player_clerk');
  const effect = effects[0];
  const executionId = payload.phase6_carry_execution?.id;
  const snapshotEffects = (payload.body_effect_history ?? []).filter(
    ({ activity_attempt_id: id }) => id === executionId
  );
  if (body.rowCount !== 1 || effects.length > 1
      || Number(body.rows[0].health) !== payload.body_state.health
      || Number(body.rows[0].energy) !== payload.body_state.energy
      || Number(body.rows[0].satiety) !== payload.body_state.satiety) fail();
  if (effect == null) {
    if (bodyHistory.rowCount !== 0 || snapshotEffects.length !== 0) fail();
    return;
  }
  const effectAttempt = history.find(
    (entry) => entry.body_effects_by_subject?.some(
      ({ subject_ref: subject }) => subject === 'player_clerk'
    )
  );
  const occurredAt = effectAttempt?.internal_rebinding?.effect_occurred_at;
  const normalizedOccurredAt = {
    whole_minutes: bodyHistory.rows[0]?.occurred_at_whole_minutes,
    subminute_numerator:
      bodyHistory.rows[0]?.occurred_at_subminute_numerator,
    subminute_denominator:
      bodyHistory.rows[0]?.occurred_at_subminute_denominator
  };
  if (bodyHistory.rowCount !== 1 || snapshotEffects.length !== 1
      || canonicalDigest(snapshotEffects[0].occurred_at)
        !== canonicalDigest(occurredAt)
      || bodyHistory.rows[0].subject_kind !== 'player_character'
      || bodyHistory.rows[0].subject_id !== payload.actor_id
      || canonicalDigest(bodyHistory.rows[0].effect_ref)
        !== canonicalDigest({
          profile_ref: effect.profile_ref,
          exact_deltas: effect.effect.exact_deltas,
          condition_outcomes: effect.effect.condition_outcomes ?? [],
          activity_execution_id: executionId
        })
      || canonicalDigest(normalizedOccurredAt)
        !== canonicalDigest(occurredAt)) fail();
}

function fail() {
  throw phase2IntegrityError();
}
