import { applyTracePhase5ResourceTransitions } from
  '../../runtime/lower-dvina-trace-phase-5-resource-transitions.js';

export function nextPhase5State({ state, factual, nextVersion, turnNumber,
  inputDigest, changeSetId, contracts }) {
  const next = structuredClone(state);
  const treatment = factual.consequence.treatment;
  next.schema = 'rus.lower_dvina_trace_turn_snapshot.v2';
  next.party_state = {
    ...next.party_state,
    state_version: nextVersion,
    session_state_version: next.party_state.session_state_version + 1,
    clock_state_version: next.party_state.clock_state_version + 1,
    turn_number: turnNumber
  };
  next.clock = structuredClone(factual.time_update.clock_after);
  next.clock_weather_light.clock = structuredClone(next.clock);
  next.phase5_treatment = {
    activity_execution:
      structuredClone(treatment.activity_execution),
    reserved_bandage_item_id: bandage(next, contracts).item_id,
    consent_decision: structuredClone(
      next.phase5_treatment?.consent_decision ?? treatment.consent
    ),
    resource_bindings: structuredClone(
      next.phase5_treatment?.resource_bindings
        ?? contracts.activity.resource_bindings
    ),
    completed_stage_ids: [...new Set([
      ...(next.phase5_treatment?.completed_stage_ids ?? []),
      ...(treatment.completed_stage_ids ?? [])
    ])],
    status: treatment.final ? 'completed'
      : treatment.interrupted ? 'paused' : 'active',
    outcome_fact: treatment.outcome_fact ?? null
  };
  const activeExecutionId = treatment.final
    ? null : treatment.activity_execution.id;
  next.npcs = next.npcs.map((npc) =>
    ['onisim_boatman', 'eremey_fisher',
      contracts.actors.participating_fisher.participant_slot_ref]
      .includes(npc.participant_slot_ref)
      ? {
          ...npc,
          machine_state: {
            ...npc.machine_state,
            current_activity_execution_id: activeExecutionId
          }
        }
      : npc);
  applyTracePhase5ResourceTransitions({
    next,
    contracts,
    completedStageIds: treatment.completed_stage_ids,
    priorCompletedStageIds: state.phase5_treatment?.completed_stage_ids ?? [],
    changeSetId
  });
  if (treatment.stage_completion_facts?.length > 0) {
    next.knowledge = mergeKnowledge(next.knowledge,
      treatment.stage_completion_facts.map((factId) => ({
        fact_id: factId,
        knowledge_state: 'known_from_committed_source',
        evidence_refs: [treatment.activity_execution.id]
      })));
  }
  if (treatment.final) {
    next.knowledge = mergeKnowledge(next.knowledge, [
      {
        fact_id: treatment.common_completion_fact,
        knowledge_state: 'known_from_committed_source',
        evidence_refs: [treatment.activity_execution.id]
      },
      {
        fact_id: treatment.outcome_fact,
        knowledge_state: 'known_from_committed_source',
        evidence_refs: [treatment.activity_execution.id]
      }
    ]);
    next.npcs = next.npcs.map((npc) =>
      npc.participant_slot_ref !== 'onisim_boatman' ? npc : {
        ...npc,
        machine_state: {
          ...npc.machine_state,
          body_condition: {
            ...npc.machine_state.body_condition,
            state: treatment.body_outcome.condition_outcomes[0].to,
            last_effect_ref: contracts.ids.bodyEffect
          }
        }
      });
    const item = bandage(next, contracts);
    const transition = contracts.transition;
    item.condition_state = transition.writes.condition_state;
    item.placement = {
      ...item.placement,
      holder_npc_id: contracts.actors.onisim_boatman.instance_id,
      holder_character_id: null,
      physical_position: transition.writes.physical_position
    };
    item.ownership = {
      ...item.ownership,
      controller_npc_id: contracts.actors.onisim_boatman.instance_id,
      controller_character_id: null
    };
    item.state = {
      ...item.state,
      accessibility: transition.writes.accessibility,
      use_state: transition.writes.use_state,
      approved_transition_history: [
        ...(item.state?.approved_transition_history ?? []),
        {
          item_id: item.item_id,
          transition_profile_id: transition.transition_profile_id,
          approved_facts: ['onisim_first_aid_final_stage_committed'],
          source: {
            actor_id: contracts.actors.eremey_fisher.instance_id,
            actor_kind: 'npc',
            controller_actor_id: contracts.actors.eremey_fisher.instance_id,
            physical_position: transition.requires.physical_position,
            accessibility: transition.requires.accessibility,
            condition_state: transition.requires.condition_state
          },
          destination: {
            actor_id: contracts.actors.onisim_boatman.instance_id,
            actor_kind: 'npc',
            controller_actor_id: contracts.actors.onisim_boatman.instance_id,
            physical_position: transition.writes.physical_position,
            accessibility: transition.writes.accessibility,
            condition_state: transition.writes.condition_state,
            use_state: transition.writes.use_state
          },
          owner_change: 'forbidden',
          change_set_id: changeSetId
        }
      ]
    };
  }
  next.phase5_history = [...(next.phase5_history ?? []), {
    turn_number: turnNumber,
    change_set_id: changeSetId,
    request_id: factual.player_input.request_id,
    option_id: factual.mode_resolution.option_id,
    time_update: structuredClone(factual.time_update),
    treatment: structuredClone(treatment)
  }];
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
    visible_package: null,
    change_set_id: changeSetId
  };
  return next;
}

function bandage(state, contracts) {
  const matches = state.items.filter(
    ({ template_id: id }) => id === contracts.ids.bandage
  );
  if (matches.length !== 1) throw new Error('TRACE_PHASE_5_BANDAGE_MISSING');
  return matches[0];
}

function mergeKnowledge(current = [], additions = []) {
  const byId = new Map(current.map((entry) => [entry.fact_id, entry]));
  for (const entry of additions) byId.set(entry.fact_id, entry);
  return [...byId.values()].sort((left, right) =>
    left.fact_id.localeCompare(right.fact_id));
}
