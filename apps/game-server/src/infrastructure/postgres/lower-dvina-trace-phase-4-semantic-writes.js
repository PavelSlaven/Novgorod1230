import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
export {
  appendHostileSemantics
} from './lower-dvina-trace-phase-4-hostile-writes.js';

export function appendArrivalObservation({
  inserts,
  appends,
  state,
  next,
  factual,
  partyId,
  turnNumber,
  changeSetId,
  idemId,
  contracts
}) {
  const movement = factual.consequence.movement;
  const eventId = `event:${partyId}:trace-phase4:${turnNumber}:arrival`;
  const perceptionId =
    `perception:${partyId}:trace-phase4:${turnNumber}:arrival`;
  const timestamp = next.clock;
  const observation = contracts.observation;
  const input = {
    observation_ref: observation.profile_id,
    route_execution_id: movement.traversal.ids.execution_id,
    observer_id: state.actor_id,
    subject_id: contracts.actors.onisim_boatman.instance_id,
    location_ref: contracts.ids.shed,
    fact_id: observation.committed_fact_output
  };
  inserts.push(row('party_temporal_events', eventId, {
    event_id: eventId,
    party_id: partyId,
    event_kind: 'committed_scene_observation',
    status: 'resolved',
    scheduled_at_whole_minutes: timestamp.whole_minutes,
    scheduled_at_subminute_numerator: timestamp.subminute_numerator,
    scheduled_at_subminute_denominator: timestamp.subminute_denominator,
    rule_ref: {
      entity_kind: 'scene_observation_profile',
      entity_id: observation.profile_id,
      route_execution_id: movement.traversal.ids.execution_id
    },
    policy_ref: {
      entity_kind: 'visibility_knowledge_policy',
      entity_id: observation.owner_contract_ref
    },
    preconditions_digest: canonicalDigest(input),
    idempotency_key: `${factual.player_input.idempotency_key}:arrival`,
    change_set_id: changeSetId,
    terminal_change_set_id: changeSetId,
    state_version: 2
  }));
  const perceptionPayload = {
    perception_id: perceptionId,
    event_ref: { entity_kind: 'temporal_event', entity_id: eventId },
    observer_ref: { entity_kind: 'player_character', entity_id: state.actor_id },
    subject_ref: {
      entity_kind: 'npc',
      entity_id: contracts.actors.onisim_boatman.instance_id
    },
    observation_ref: observation.profile_id,
    fact_id: observation.committed_fact_output,
    route_execution_id: movement.traversal.ids.execution_id
  };
  appends.push(row('party_perception_records', perceptionId, {
    perception_id: perceptionId,
    party_id: partyId,
    event_id: eventId,
    perceiver_kind: 'player_character',
    perceiver_id: state.actor_id,
    result_kind: 'recognized',
    perceived_at_whole_minutes: timestamp.whole_minutes,
    perceived_at_subminute_numerator: timestamp.subminute_numerator,
    perceived_at_subminute_denominator: timestamp.subminute_denominator,
    recognition_policy_ref: {
      entity_kind: 'scene_observation_profile',
      entity_id: observation.profile_id
    },
    visibility_policy_ref: {
      entity_kind: 'visibility_requirement',
      entity_id: observation.trigger.visibility_requirement
    },
    canonical_digest: canonicalDigest(perceptionPayload),
    signal_refs: [{
      entity_kind: 'npc_body_condition',
      entity_id: observation.trigger.subject_body_condition_ref
    }],
    knowledge_update_refs: [{
      entity_kind: 'committed_fact',
      entity_id: observation.committed_fact_output
    }],
    change_set_id: changeSetId,
    idempotency_record_id: idemId
  }));
  appends.push(row(
    'party_perception_witnesses',
    `${perceptionId}:player_character:${state.actor_id}`,
    {
      perception_id: perceptionId,
      witness_kind: 'player_character',
      witness_id: state.actor_id
    }
  ));
  const replay = {
    perception_id: perceptionId,
    canonical_input_digest: canonicalDigest(input),
    perception_digest: canonicalDigest(perceptionPayload),
    expected_state_versions_digest: canonicalDigest({
      party_state_version: state.party_state.state_version
    }),
    dependency_pins_digest: canonicalDigest(contracts.activityPins),
    policy_versions_digest: canonicalDigest({
      observation_version: observation.version
    }),
    idempotency_key: `${factual.player_input.idempotency_key}:arrival`,
    change_set_id: changeSetId
  };
  appends.push(row('party_perception_replay_evidence', perceptionId, {
    ...replay,
    party_id: partyId,
    canonical_digest: canonicalDigest(replay)
  }));
}

export function appendSurrenderSemantics({
  inserts,
  updates,
  appends,
  state,
  next,
  factual,
  partyId,
  turnNumber,
  changeSetId,
  idemId,
  contracts,
  activityId
}) {
  const negotiation = factual.consequence.negotiation;
  const ratsha = next.npcs.find(
    ({ participant_slot_ref: ref }) => ref === 'ratsha_storehouse_helper'
  );
  if (ratsha?.machine_state?.surrender_state
      !== 'surrendered_without_further_harm'
      || ratsha.semantic_state?.surrender_fact
        !== 'ratsha_surrender_without_further_harm_committed') {
    throw new Error('TRACE_PHASE_4_RATSHA_SURRENDER_STATE_INVALID');
  }
  updates.push(row('party_npcs', ratsha.instance_id, {
    party_id: partyId,
    npc_id: ratsha.instance_id,
    machine_state: ratsha.machine_state,
    semantic_state: ratsha.semantic_state
  }));
  appends.push(row(
    'party_npc_runtime_transitions',
    `npc-transition:${partyId}:trace-phase4:${turnNumber}:surrender`,
    {
      transition_id:
        `npc-transition:${partyId}:trace-phase4:${turnNumber}:surrender`,
      party_id: partyId,
      npc_id: ratsha.instance_id,
      transition_kind: 'surrendered_without_further_harm',
      event_id: null,
      change_set_id: changeSetId,
      idempotency_record_id: idemId,
      occurred_at_whole_minutes: next.clock.whole_minutes,
      occurred_at_subminute_numerator: next.clock.subminute_numerator,
      occurred_at_subminute_denominator: next.clock.subminute_denominator,
      trace: {
        decision_request_id: negotiation.npc_decision.trace.request_id,
        fact_id: 'ratsha_surrender_without_further_harm_committed'
      }
    }
  ));
  insertKnowledge(inserts, state, partyId, {
    fact_id: 'promise_activation_basis_committed',
    evidence: [negotiation.npc_decision.trace.request_id]
  });
  if (negotiation.confession) {
    appendConfession({
      appends,
      state,
      factual,
      partyId,
      turnNumber,
      changeSetId,
      contracts,
      activityId
    });
  }
}

function appendConfession({
  appends,
  state,
  factual,
  partyId,
  turnNumber,
  changeSetId,
  contracts,
  activityId
}) {
  const confession = factual.consequence.negotiation.confession;
  const interactionId =
    `interaction:${partyId}:trace-phase4:${turnNumber}:confession`;
  const audienceIds = [
    state.actor_id,
    ...confession.required_audience_ids
  ];
  appends.push(row('party_actor_npc_interactions', interactionId, {
    interaction_id: interactionId,
    party_id: partyId,
    actor_id: state.actor_id,
    npc_id: contracts.actors.ratsha_storehouse_helper.instance_id,
    interaction_kind: 'conversation',
    activity_execution_id: activityId,
    started_at: factual.time_update.clock_before,
    ended_at: factual.time_update.clock_after,
    location_ref: structuredClone(state.position),
    outcome: 'completed',
    terminal_change_set_id: changeSetId,
    terminal_evidence_kind: 'terminal_attempt',
    terminal_evidence_ref: {
      statement_ref: confession.statement_ref,
      assertion: confession.assertion,
      audience_ids: audienceIds,
      truth_projection: 'forbidden',
      requires_independent_confirmation:
        confession.requires_independent_confirmation
    },
    interaction_policy_ref: {
      entity_kind: 'statement_effect_contract',
      entity_id: confession.effect_contract_ref
    },
    canonical_digest: canonicalDigest({
      statement_ref: confession.statement_ref,
      assertion: confession.assertion,
      audience_ids: audienceIds,
      decision_trace:
        factual.consequence.negotiation.npc_decision.trace
    })
  }));
  for (const [scope, kind, id] of [
    ['npc_memory', 'npc',
      contracts.actors.ratsha_storehouse_helper.instance_id],
    ['player_journal', 'player_character', state.actor_id]
  ]) {
    appends.push(row(
      'party_actor_npc_interaction_summaries',
      `summary:${interactionId}:${scope}`,
      {
        summary_id: `summary:${interactionId}:${scope}`,
        interaction_id: interactionId,
        summary_scope: scope,
        remembering_subject_kind: kind,
        remembering_subject_id: id,
        summary_text: confession.content_scope,
        salience: 1,
        source_message_digest: canonicalDigest({
          statement_ref: confession.statement_ref,
          assertion: confession.assertion
        }),
        state_version: 1,
        created_change_set_id: changeSetId
      }
    ));
  }
}

function insertKnowledge(inserts, state, partyId, { fact_id, evidence }) {
  if ((state.knowledge ?? []).some(({ fact_id: id }) => id === fact_id)) {
    return;
  }
  inserts.push(row('party_character_knowledge',
    `${state.actor_id}:${fact_id}`, {
      party_id: partyId,
      character_id: state.actor_id,
      fact_id,
      knowledge_state: 'known_from_committed_source',
      evidence
    }));
}
