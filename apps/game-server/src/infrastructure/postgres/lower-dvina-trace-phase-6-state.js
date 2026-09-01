import { commitPhase2BodyState } from
  './lower-dvina-trace-phase-2-state.js';
import { assertSharedSemanticSnapshotSafe } from
  './lower-dvina-trace-conversation-state.js';

export function nextPhase6State({ state, factual, nextVersion, turnNumber,
  changeSetId, inputDigest }) {
  const next = structuredClone(state);
  delete next.npc_semantic_decision_traces;
  delete next.npc_semantic_decision_inputs;
  const carry = factual.consequence.carry;
  const intent = carry.intent;
  const terminal = intent.execution_after.status === 'completed';
  applyTemporalNpcWrites(next, intent.temporal_advance_result);
  next.schema = 'rus.lower_dvina_trace_turn_snapshot.v2';
  next.party_state = {
    ...next.party_state,
    state_version: nextVersion,
    session_state_version: state.party_state.session_state_version + 1,
    clock_state_version: state.party_state.clock_state_version + 1,
    turn_number: turnNumber,
    ...(factual.body_update?.applied === true ? {
      body_state_version: state.party_state.body_state_version + 1
    } : {})
  };
  next.clock = structuredClone(factual.time_update.clock_after);
  next.clock_weather_light.clock = structuredClone(next.clock);
  if (factual.body_update?.applied === true) {
    next.body_state = commitPhase2BodyState({
      before: state.body_state,
      proposed: factual.body_update.state_after
    });
    next.body_effect_history = [...(next.body_effect_history ?? []), {
      history_id: `body-history:${state.party_id}:trace-phase6:player`,
      effect_ref: factual.body_update.proposal.profile_ref,
      activity_attempt_id: intent.execution_id,
      occurred_at: structuredClone(
        intent.internal_rebinding.effect_occurred_at
      )
    }];
  }
  next.phase6_carry_execution = structuredClone(intent.execution_after);
  next.phase6_history = [...(next.phase6_history ?? []), {
    turn_number: turnNumber,
    change_set_id: changeSetId,
    request_id: factual.player_input.request_id,
    input_digest: inputDigest,
    activity_execution_id: intent.execution_id,
    attempt: structuredClone(intent.attempt),
    exact_elapsed: structuredClone(intent.exact_elapsed),
    cumulative_elapsed_before:
      structuredClone(intent.cumulative_elapsed_before),
    cumulative_elapsed_after:
      structuredClone(intent.cumulative_elapsed_after),
    progress_before_ppm: intent.progress_before_ppm,
    progress_after_ppm: intent.progress_after_ppm,
    internal_rebinding: structuredClone(intent.internal_rebinding),
    body_effects_by_subject:
      structuredClone(intent.body_effects_by_subject),
    carrier_inventory_snapshots:
      structuredClone(intent.carrier_inventory_snapshots),
    traversal_interval: structuredClone(carry.traversal.interval_result)
  }];
  next.route_history = [...(next.route_history ?? []), {
    route_ref: intent.route_ref,
    route_plan_execution_id: carry.traversal.ids.execution_id,
    traversal_interval_id: carry.traversal.ids.interval_id,
    change_set_id: changeSetId,
    started_at: structuredClone(factual.time_update.clock_before),
    ended_at: structuredClone(factual.time_update.clock_after),
    result_kind: carry.traversal.interval_result.result_kind
  }];
  if (terminal) applyTerminalState(next, intent, changeSetId);
  next.last_turn = {
    request_id: factual.player_input.request_id,
    idempotency_key: factual.player_input.idempotency_key,
    input_digest: inputDigest,
    raw_text: factual.player_input.raw_text,
    option_id: factual.mode_resolution.option_id,
    action_set_digest:
      factual.mode_resolution.decision_trace.action_set_digest,
    semantic_trace:
      structuredClone(factual.mode_resolution.decision_trace),
    consequence: structuredClone(factual.consequence),
    time_update: structuredClone(factual.time_update),
    body_update: structuredClone(factual.body_update),
    visible_package: null,
    change_set_id: changeSetId
  };
  return assertSharedSemanticSnapshotSafe(next);
}

function applyTemporalNpcWrites(next, temporalResult) {
  const proposals = temporalResult?.combined_change_set?.proposals ?? [];
  for (const proposal of proposals) {
    for (const write of proposal.write_set?.updates ?? []) {
      if (write.target_table !== 'party_npcs'
          || write.record?.party_id !== next.party_id) continue;
      const npc = next.npcs?.find(({ instance_id: id }) =>
        id === write.record.npc_id);
      if (!npc) throw Object.assign(
        new Error('TRACE_PHASE_6_TEMPORAL_NPC_PROJECTION_GAP'),
        { code: 'TRACE_PHASE_6_TEMPORAL_NPC_PROJECTION_GAP' }
      );
      if (write.record.anchor_id !== undefined) {
        npc.anchor_id = write.record.anchor_id;
      }
      if (write.record.machine_state !== undefined) {
        npc.machine_state = structuredClone(write.record.machine_state);
      }
    }
  }
}

function applyTerminalState(next, intent, changeSetId) {
  next.position = structuredClone(intent.terminal_group_position);
  next.environment_snapshot = structuredClone(
    intent.terminal_environment_snapshot);
  const target = next.first_entry_preparation?.spatial_v3?.target;
  if (target?.status === 'prepared') {
    next.position.position_id = target.position_id;
    next.position.g6_id = target.g6_instance_id;
  } else {
    delete next.position.position_id;
    delete next.position.g6_id;
  }
  for (const npc of next.npcs ?? []) {
    if (!intent.terminal_group_ids.includes(npc.instance_id)) continue;
    npc.anchor_id = intent.terminal_group_position.g5_anchor_id;
    npc.machine_state = {
      ...npc.machine_state,
      spatial_zone_ref: npc.instance_id === intent.carried_actor_id
        ? intent.onisim_camp_fire_position.zone_ref
        : intent.terminal_group_position.zone_ref,
      ...(npc.instance_id === intent.ratsha_observation.npc_id ? {
        observation_state: intent.ratsha_observation.state
      } : {}),
      phase6_body_effect: bodyEffectFor(intent, npc.instance_id,
        changeSetId)
    };
  }
  next.knowledge = mergeKnowledge(next.knowledge, [{
    fact_id: 'onisim_carried_to_camp_committed',
    knowledge_state: 'known_from_committed_source',
    evidence_refs: [intent.execution_id]
  }, {
    fact_id: intent.ratsha_observation.committed_fact_output,
    knowledge_state: 'known_from_committed_source',
    evidence_refs: [intent.execution_id]
  }]);
}

function bodyEffectFor(intent, actorId, changeSetId) {
  const entry = intent.body_effects_by_subject.find(
    ({ subject_id: id }) => id === actorId
  );
  return entry == null ? null : {
    profile_ref: entry.profile_ref,
    exact_deltas: structuredClone(entry.effect.exact_deltas),
    condition_outcomes:
      structuredClone(entry.effect.condition_outcomes ?? []),
    change_set_id: changeSetId
  };
}

function mergeKnowledge(current = [], additions = []) {
  const byId = new Map(current.map((entry) => [entry.fact_id, entry]));
  for (const entry of additions) byId.set(entry.fact_id, entry);
  return [...byId.values()].sort((left, right) =>
    left.fact_id.localeCompare(right.fact_id));
}
