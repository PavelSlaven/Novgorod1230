import { buildTimeDrivenUpdateRequest } from '@rus/time-events-history/legacy';
import { addElapsedTime } from '@rus/time-events-history';
import { freezeOutput } from './shared.js';
import { resolveTurnStepSemanticActivityTime } from
  '../semantic-activity-time.js';
import {
  buildTurnStepPreparedTimeUpdate,
  requireTurnStepPreparedEffectLedger
} from '../turn-step-prepared-effects.js';

export async function buildTimeUpdateStage({
  retrievedState,
  consequence,
  temporalAdvance = null,
  turnStepOperationBatch = null,
  preparedEffectLedger = null
}) {
  const clock = retrievedState.clock_weather_light?.clock ?? retrievedState.clock ?? {};
  const duration = consequence.duration_minutes ?? 0;
  if (preparedEffectLedger != null) {
    const ledger = requireTurnStepPreparedEffectLedger(preparedEffectLedger);
    const prepared = buildTurnStepPreparedTimeUpdate(ledger);
    if (consequence.prepared_effect_ledger_digest !== ledger.ledger_digest
        || prepared.exact_elapsed.exact_minutes.numerator
          !== String(duration)) {
      const error = new Error(
        'Prepared effect ledger differs from the consequence duration.');
      error.code = 'TURN_STEP_PREPARED_EFFECT_INVALID';
      throw error;
    }
    const semantic = resolveTurnStepSemanticActivityTime({
      batch: turnStepOperationBatch,
      consequence,
      clockBefore: prepared.clock_before,
      clockAfter: prepared.clock_after,
      exactElapsed: prepared.exact_elapsed,
      preparedEffectLedger: ledger
    });
    return freezeOutput({ ...prepared, ...(semantic ?? {}) });
  }
  const finish = (output) => {
    const semantic = resolveTurnStepSemanticActivityTime({
      batch: turnStepOperationBatch,
      consequence,
      clockBefore: output.clock_before ?? clock,
      clockAfter: output.clock_after,
      exactElapsed: output.exact_elapsed
    });
    return freezeOutput({
      ...output,
      ...(semantic ?? {})
    });
  };
  if (typeof temporalAdvance === 'function') {
    const result = await temporalAdvance({
      clock_before: structuredClone(clock),
      exact_elapsed: {
        exact_minutes: {
          numerator: String(duration),
          denominator: '1'
        }
      },
      relevant_state: structuredClone(retrievedState),
      consequence: structuredClone(consequence)
    });
    if (!result?.clock_after) {
      const error = new Error('Temporal owner did not return exact clock_after.');
      error.code = 'TURN_TEMPORAL_ADVANCE_INVALID';
      throw error;
    }
    return finish({
      version: 2,
      schema: 'turn_time_update',
      owner: '@rus/time-events-history',
      ...structuredClone(result)
    });
  }
  if (typeof clock?.whole_minutes === 'string') {
    return finish({
      version: 2,
      schema: 'turn_time_update',
      owner: '@rus/time-events-history',
      clock_before: structuredClone(clock),
      clock_after: addElapsedTime(clock, {
        exact_minutes: {
          numerator: String(duration),
          denominator: '1'
        }
      }),
      exact_elapsed: {
        exact_minutes: {
          numerator: String(duration),
          denominator: '1'
        }
      },
      nearest_boundary: null
    });
  }
  const state = {
    delayed_events: retrievedState.relevant_events ?? [],
    historical_events: retrievedState.historical_events ?? []
  };
  const update = buildTimeDrivenUpdateRequest(clock, duration, state);
  return finish({ version: 1, schema: 'turn_time_update', ...update });
}
