import {
  buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedTimeUpdate
} from '@rus/turn';
import {
  preparedEffectFail,
  samePreparedValue
} from './lower-dvina-trace-turn-step-prepared-effect-authority.js';

export const PHASE9_PREPARED_COMMANDS = new Map([
  ['lower_dvina_trace.recover_road_bag_control', 'request_item_use'],
  ['lower_dvina_trace.open_recovered_road_bag', 'request_container_access'],
  ['lower_dvina_trace.recover_packet_and_inspect_seal', 'request_item_use'],
  ['lower_dvina_trace.return_to_fishing_camp_with_group', 'request_movement'],
  ['lower_dvina_trace.ask_onisim_for_testimony', 'emit_interaction'],
  ['lower_dvina_trace.resolve_case_evidence', 'request_activity'],
  ['lower_dvina_trace.commit_temporary_disposition', 'request_activity']
]);

export function validatePreparedPhase9({ ledger, envelope, factual, state,
  batch }) {
  const slice = ledger.slices[0];
  const trace = envelope?.loop_trace?.step_traces?.[0];
  const operation = trace?.approved_plan?.operations?.[0];
  const expectedOperation = PHASE9_PREPARED_COMMANDS.get(slice.owner_ref);
  const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
  const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
  if (ledger.root_turn_id !== (batch?.root_turn_id ?? envelope.root_turn_id)
      || ledger.committed_state_version !== (batch?.committed_state_version
        ?? envelope.base_state_version)
      || slice.effect_kind !== 'domain_command'
      || slice.operation_ref !== expectedOperation
      || slice.step_index !== 1
      || slice.consequence?.phase9_kind == null
      || slice.consequence?.phase9 == null
      || trace?.applied !== true
      || trace?.player_response_boundary !== true
      || trace?.approved_plan?.resolution !== 'domain_request'
      || operation?.op !== expectedOperation
      || !samePreparedValue(envelope.consequence, factual?.consequence)
      || !samePreparedValue(envelope.time_update, factual?.time_update)
      || !samePreparedValue(envelope.body_update, factual?.body_update)
      || !samePreparedValue(expectedBody, envelope.body_update)
      || !sameTimeBase(expectedTime, envelope.time_update)
      || !samePreparedValue(trace.plan_request?.player_safe_state?.clock,
        state.clock)) {
    preparedEffectFail('Phase 9 prepared ledger is not authoritative');
  }
  return { prepared: true, phase9Slice: slice };
}

function sameTimeBase(expected, actual) {
  return ['version', 'schema', 'owner', 'clock_before', 'clock_after',
    'exact_elapsed', 'nearest_boundary', 'boundary_trace',
    'prepared_effect_ledger_digest', 'prepared_effect_ledger']
    .every((key) => samePreparedValue(expected[key], actual?.[key]));
}
