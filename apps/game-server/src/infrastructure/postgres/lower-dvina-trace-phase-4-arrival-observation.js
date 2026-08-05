import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { ref, same, semanticFail } from './lower-dvina-trace-phase-4-semantic-write-shared.js';

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
