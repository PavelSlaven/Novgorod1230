import { buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedTimeUpdate } from '@rus/turn';
import { preparedEffectFail, samePreparedValue } from
  './lower-dvina-trace-turn-step-prepared-effect-authority.js';

export const PHASE8_PREPARED_COMMANDS = new Map([
  ['lower_dvina_trace.follow_known_route_to_zhdanko_storehouse',
    'request_movement']
]);

export function validatePreparedPhase8({ ledger, envelope, factual, state,
  batch }) {
  const slice = ledger.slices[0];
  const trace = envelope?.loop_trace?.step_traces?.[0];
  const operation = trace?.approved_plan?.operations?.[0];
  const expectedOperation = PHASE8_PREPARED_COMMANDS.get(slice.owner_ref);
  const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
  const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
  if (ledger.root_turn_id !== (batch?.root_turn_id ?? envelope.root_turn_id)
      || ledger.committed_state_version !== (batch?.committed_state_version
        ?? envelope.base_state_version)
      || slice.effect_kind !== 'domain_command'
      || slice.operation_ref !== expectedOperation || slice.step_index !== 1
      || slice.consequence?.phase8_kind !== 'movement'
      || trace?.applied !== true
      || trace?.approved_plan?.resolution !== 'domain_request'
      || operation?.op !== expectedOperation
      || !samePreparedValue(envelope.consequence, factual?.consequence)
      || !samePreparedValue(envelope.time_update, factual?.time_update)
      || !samePreparedValue(envelope.body_update, factual?.body_update)
      || !samePreparedValue(expectedBody, envelope.body_update)
      || !sameTimeBase(expectedTime, envelope.time_update)
      || !samePreparedValue(trace.plan_request?.player_safe_state?.clock,
        state.clock)) {
    preparedEffectFail('Phase 8 prepared ledger is not authoritative');
  }
  return { prepared: true, phase8Slice: slice };
}

function sameTimeBase(left, right) {
  return samePreparedValue(left.clock_before, right.clock_before)
    && samePreparedValue(left.clock_after, right.clock_after)
    && samePreparedValue(left.exact_elapsed, right.exact_elapsed);
}
