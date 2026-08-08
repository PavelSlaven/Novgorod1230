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

const REST_COMMAND =
  'lower_dvina_trace.rest_by_fire_and_dry_clothing';
const COMPANION_COMMAND =
  'lower_dvina_trace.request_eremey_and_fisher_to_zhdanko_storehouse';

export function isPreparedTurn10Ledger(ledger) {
  return ledger?.slices?.[0]?.owner_ref === REST_COMMAND;
}

export function validatePreparedTurn10({ ledger, traces, envelope, factual,
  state, batch }) {
  const [rest, conversation] = ledger.slices;
  const [restTrace, conversationTrace] = traces ?? [];
  const restOperation = restTrace?.approved_plan?.operations?.[0];
  const conversationOperation =
    conversationTrace?.approved_plan?.operations?.[0];
  if (batch != null
      || ledger.slices.length !== 2
      || traces?.length !== 2
      || ledger.committed_state_version !== state.party_state.state_version
      || envelope.loop_trace.working_revision !== 2
      || !['resolved', 'player_response_required'].includes(
        envelope.loop_trace.status)
      || rest.effect_kind !== 'domain_command'
      || rest.owner_ref !== REST_COMMAND
      || rest.operation_ref !== 'request_activity'
      || rest.step_index !== 1
      || rest.consequence?.phase7_kind !== 'fire_rest'
      || rest.consequence.duration_minutes !== 30
      || restOperation?.op !== 'request_activity'
      || restTrace.applied !== true
      || restTrace.player_response_boundary !== false
      || conversation.effect_kind !== 'domain_command'
      || conversation.owner_ref !== COMPANION_COMMAND
      || conversation.operation_ref !== 'emit_interaction'
      || conversation.step_index !== 2
      || conversation.consequence?.turn10_kind !== 'companion_request'
      || conversation.consequence.duration_minutes !== 0
      || conversationOperation?.op !== 'emit_interaction'
      || conversationTrace.applied !== true
      || conversationTrace.player_response_boundary !== true
      || !samePreparedValue(rest.time_update.clock_before, state.clock)
      || !samePreparedValue(conversation.time_update.clock_before,
        rest.time_update.clock_after)
      || !samePreparedValue(conversation.time_update.clock_after,
        rest.time_update.clock_after)
      || conversation.body_update.applied !== false
      || !samePreparedValue(conversation.body_update.state_after,
        rest.body_update.state_after)) {
    preparedEffectFail(
      'Turn 10 must be one ordered fire-rest then companion conversation');
  }
  const draft = {
    selected_command_ids: [REST_COMMAND, COMPANION_COMMAND],
    loop_result: {
      prepared_effect_ledger: ledger,
      consequence_fragments: [],
      completed_steps: structuredClone(
        envelope.loop_trace.completed_steps ?? []),
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
    preparedEffectFail('Turn 10 ledger aggregate differs from factual commit');
  }
  return {
    prepared: true,
    routeSlice: null,
    directSlice: null,
    restSlice: rest,
    companionSlice: conversation
  };
}
