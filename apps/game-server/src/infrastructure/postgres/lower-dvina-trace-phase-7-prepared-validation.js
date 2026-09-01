import {
  bindTurnStepPreparedConsequence,
  buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedDomainConsequence,
  buildTurnStepPreparedTimeUpdate,
  mergeTurnStepDraftConsequence
} from '@rus/turn';
import {
  preparedEffectFail,
  samePreparedValue
} from './lower-dvina-trace-turn-step-prepared-effect-authority.js';

const REST_COMMAND = 'lower_dvina_trace.rest_by_fire_and_dry_clothing';

export function isPreparedPhase7RestLedger(ledger) {
  return ledger?.slices?.length === 1
    && ledger.slices[0]?.owner_ref === REST_COMMAND
    && (ledger.slices[0]?.consequence?.phase7_kind === 'fire_rest'
      || ledger.slices[0]?.consequence?.duration_minutes === 30);
}

export function validatePreparedPhase7Rest({ ledger, traces, envelope, factual,
  state, batch }) {
  const rest = ledger.slices[0];
  const trace = traces?.[0];
  const operation = trace?.approved_plan?.operations?.[0];
  const restCompleted = rest.consequence?.phase7?.schedule_temporal
    ?.rest_completed === true;
  const resumed = rest.consequence?.phase7?.resumed === true;
  const duration = Number(rest.consequence?.duration_minutes);
  const validDuration = Number.isSafeInteger(duration) && duration > 0
    && (resumed ? duration <= 5
      : restCompleted ? duration === 30 : duration >= 25 && duration < 30);
  if (batch != null
      || traces?.length !== 1
      || ledger.committed_state_version !== state.party_state.state_version
      || envelope.loop_trace.working_revision !== 1
      || envelope.loop_trace.status !== 'resolved'
      || envelope.loop_trace.stop_reason !== 'terminal'
      || rest.effect_kind !== 'domain_command'
      || rest.owner_ref !== REST_COMMAND
      || rest.operation_ref !== 'request_activity'
      || rest.step_index !== 1
      || rest.consequence?.phase7_kind !== 'fire_rest'
      || !validDuration
      || operation?.op !== 'request_activity'
      || trace.applied !== true
      || trace.player_response_boundary !== false
      || rest.body_update.applied !== restCompleted
      || !samePreparedValue(rest.time_update.clock_before, state.clock)) {
    preparedEffectFail('Phase 7 must be one valid fire-rest slice');
  }
  const draft = {
    selected_command_ids: [REST_COMMAND],
    loop_result: {
      prepared_effect_ledger: ledger,
      consequence_fragments: [],
      completed_steps: structuredClone(envelope.loop_trace.completed_steps ?? []),
      clarification: structuredClone(envelope.loop_trace.clarification),
      status: 'resolved'
    }
  };
  const expectedConsequence = bindTurnStepPreparedConsequence(
    mergeTurnStepDraftConsequence(
      buildTurnStepPreparedDomainConsequence(draft), draft), ledger);
  const expectedTime = buildTurnStepPreparedTimeUpdate(ledger);
  const expectedBody = buildTurnStepPreparedBodyUpdate(ledger);
  if (!samePreparedValue(expectedConsequence, envelope.consequence)
      || !samePreparedValue(envelope.consequence, factual?.consequence)
      || !samePreparedValue(expectedTime, envelope.time_update)
      || !samePreparedValue(expectedBody, envelope.body_update)
      || !samePreparedValue(envelope.time_update, factual?.time_update)
      || !samePreparedValue(envelope.body_update, factual?.body_update)
      || !samePreparedValue(envelope.player_input, factual?.player_input)
      || !samePreparedValue(envelope.mode_resolution,
        factual?.mode_resolution)) {
    preparedEffectFail('Phase 7 ledger aggregate differs from factual commit');
  }
  return { prepared: true, phase7RestSlice: rest };
}
