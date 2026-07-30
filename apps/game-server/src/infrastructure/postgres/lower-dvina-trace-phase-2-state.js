import { serverError } from '../../errors.js';

export function buildPhase2Snapshot({
  state,
  factual,
  nextVersion,
  turnNumber,
  nextItems,
  nextKnowledge,
  nextBodyState,
  visibleEnvelope,
  changeSetId,
  inputDigest
}) {
  const runtimeState = structuredClone(state);
  delete runtimeState.relevant_hidden_state;
  const bodyHistory = [...(state.body_effect_history ?? []), {
    history_id:
      `body-history:${state.party_id}:trace-phase2:${turnNumber}`,
    effect_ref: factual.consequence.body_effect_ref,
    activity_attempt_id: factual.consequence.activity_attempt_id,
    execution_variant_id:
      factual.body_update.proposal.execution_variant_id,
    occurred_at: structuredClone(factual.time_update.clock_after)
  }];
  return {
    ...runtimeState,
    schema: 'rus.lower_dvina_trace_phase_2_snapshot.v1',
    party_state: {
      ...state.party_state,
      state_version: nextVersion,
      session_state_version:
        state.party_state.session_state_version + 1,
      body_state_version:
        state.party_state.body_state_version + 1,
      clock_state_version:
        state.party_state.clock_state_version + 1,
      turn_number: turnNumber
    },
    body_state: structuredClone(nextBodyState),
    body_effect_history: bodyHistory,
    clock: structuredClone(factual.time_update.clock_after),
    clock_weather_light: {
      ...structuredClone(state.clock_weather_light),
      clock: structuredClone(factual.time_update.clock_after)
    },
    items: nextItems,
    knowledge: nextKnowledge,
    last_turn: {
      request_id: factual.player_input.request_id,
      idempotency_key: factual.player_input.idempotency_key,
      input_digest: inputDigest,
      raw_text: factual.player_input.raw_text,
      received_at: factual.player_input.received_at,
      option_id: factual.mode_resolution.option_id,
      action_set_digest:
        factual.mode_resolution.decision_trace.action_set_digest,
      semantic_trace:
        structuredClone(factual.mode_resolution.decision_trace),
      check_request:
        structuredClone(factual.availability.check_requests[0]),
      check_result:
        structuredClone(factual.consequence.check_result),
      consequence: structuredClone(factual.consequence),
      time_update: structuredClone(factual.time_update),
      body_update: structuredClone(factual.body_update),
      visible_package: {
        package_id: visibleEnvelope.package_id,
        package_digest: visibleEnvelope.package_digest,
        change_set_id: changeSetId
      }
    }
  };
}

export function commitPhase2BodyState({ before, proposed }) {
  const prior = new Map((before.active_conditions ?? []).map(
    (condition) => [condition.storage_condition_id, condition]
  ));
  const activeConditions = (proposed.active_conditions ?? []).map(
    (condition) => {
      const previous = prior.get(condition.storage_condition_id);
      if (!previous
          || previous.status !== 'active'
          || !Number.isSafeInteger(previous.state_version)) {
        fail(
          'A body condition transition lacks exact persisted identity.'
        );
      }
      return {
        ...structuredClone(condition),
        status: 'active',
        state_version: condition.condition_outcome
          ? previous.state_version + 1
          : previous.state_version
      };
    }
  );
  if (activeConditions.length !== prior.size) {
    fail('The body effect changed the approved condition inventory.');
  }
  return {
    ...structuredClone(proposed),
    active_conditions: activeConditions
  };
}

function fail(message) {
  throw serverError(
    'TRACE_PHASE_2_BODY_CONDITION_PERSISTENCE_GAP',
    message,
    { status: 409 }
  );
}
