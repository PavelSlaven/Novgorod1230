import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { assertSharedSemanticSnapshotSafe } from
  './lower-dvina-trace-conversation-state.js';
import { appendNpcDecisionTraceWrites } from
  './npc-semantic-conversation-decision-writes.js';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';
import { appendPhase7Activities } from
  './lower-dvina-trace-phase-7-activity-writes.js';
import {
  appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput
} from './npc-semantic-conversation-writes.js';
import { appendKnowledge } from
  './lower-dvina-trace-phase-3-conversation-writes.js';
import { appendPhase7ConversationWrites } from
  './lower-dvina-trace-phase-7-conversation-writes.js';

export function phase7VisibleEnvelope({ partyId, nextVersion, turnNumber,
  changeSetId, idemId, factual, visibleContext, phase7Contracts }) {
  const payload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: visibleContext.visible_scene,
    perceived_changes: visibleContext.visible_changes,
    sensory_details: visibleContext.sensory_details,
    visible_npcs: visibleContext.visible_npc,
    visible_objects: visibleContext.visible_objects,
    known_context: visibleContext.known_context,
    uncertainties: visibleContext.uncertainties,
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const pins = [{
    dependency_role: 'source_authoring',
    entity_ref: {
      entity_kind: 'activity_profile',
      entity_id: phase7Contracts.restActivity.profile_id
    },
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: String(phase7Contracts.restActivity.version),
      state_version: null
    }
  }, {
    dependency_role: 'source_authoring',
    entity_ref: {
      entity_kind: 'activity_contract',
      entity_id: phase7Contracts.schedulePolicy.schedule_policy_id
    },
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: String(phase7Contracts.schedulePolicy.version),
      state_version: null
    }
  }];
  return {
    package_id: `visible:${partyId}:trace-phase7:${turnNumber}`,
    party_id: partyId,
    turn_id: factual.mode_resolution.turn_id,
    committed_state_version: String(nextVersion),
    change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload,
    presentation_status: 'pending',
    projection_policy_ref: {
      entity_ref: {
        entity_kind: 'visibility_modifier',
        entity_id: 'lower_dvina_trace_phase_7_visible_v1'
      },
      authoring_version: '1'
    },
    dependency_pins: {
      pins,
      canonical_digest: canonicalDigest(pins)
    },
    idempotency_record_id: idemId
  };
}

export function phase7PendingScreen({ state, factual, visibleEnvelope,
  turnNumber, nextVersion }) {
  const screen = {
    version: 1,
    schema: 'lower_dvina_trace_turn_screen',
    scenario_id: 'lower_dvina_trace_v1',
    party_id: state.party_id,
    turn_id: factual.mode_resolution.turn_id,
    turn_number: turnNumber,
    screen_status: 'committed_presentation_pending',
    opening_screen_digest: state.opening_identity.opening_screen_digest,
    current_projection_anchor: {
      committed_state_version: nextVersion,
      package_id: visibleEnvelope.package_id,
      package_digest: visibleEnvelope.package_digest,
      narration_output_digest: null
    },
    visible_context:
      phase2VisibleContextFromPayload(visibleEnvelope.visible_payload),
    main_prose:
      'Факты хода сохранены; повествование ожидает повторной доставки.'
  };
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}

export function phase7Writes({ partyId, state, next, factual, turnNumber,
  changeSetId, idemId, visibleEnvelope, pendingScreen }) {
  assertSharedSemanticSnapshotSafe(next);
  const phase7 = factual.consequence.phase7;
  const restCompleted = phase7.schedule_temporal.rest_completed === true;
  const resumed = phase7.resumed === true;
  const inserts = [row('party_state_snapshots',
    `${partyId}:${next.party_state.state_version}`, {
      party_id: partyId,
      state_version: next.party_state.state_version,
      state_payload: next,
      state_digest: canonicalDigest(next)
    })];
  const updates = [
    row('parties', partyId, { party_id: partyId, status: 'active' }),
    row('party_server_sessions', partyId, {
      party_id: partyId,
      turn_number: turnNumber,
      last_turn_id: factual.mode_resolution.turn_id,
      screen: pendingScreen,
      updated_change_set_id: changeSetId
    }),
    row('party_clocks', partyId, {
      party_id: partyId,
      ...next.clock,
      updated_change_set_id: changeSetId
    })
  ];
  if (restCompleted) updates.push(row('party_actor_body_states',
      `player_character:${state.actor_id}`, {
        party_id: partyId,
        actor_kind: 'player_character',
        actor_id: state.actor_id,
        health: next.body_state.health,
        energy: next.body_state.energy,
        satiety: next.body_state.satiety,
        updated_change_set_id: changeSetId
      }));
  const appends = [row('party_v3_change_sets', changeSetId, {
    id: changeSetId,
    party_id: partyId,
    operation_kind: 'trace_phase_7_fire_rest',
    idempotency_record_id: idemId
  })];
  if (restCompleted) {
    appendConditionUpdates({ updates, partyId, state, next });
    appendBodyHistory({ appends, partyId, state, factual, changeSetId, idemId });
  }
  appendPhase7Activities({ inserts, updates, appends, partyId, state, factual, next,
    turnNumber, changeSetId, idemId });
  if (resumed !== true
      || phase7.schedule_applied_in_this_attempt === true) {
    appendScheduleProjection({
      updates, partyId, state, next, phase7, changeSetId
    });
  }
  if (!resumed) appendNpcDecisionTraceWrites({
    appends,
    decisionRecords: phase7.autonomous.decision_records,
    partyId,
    changeSetId,
    rootTurnId: phase7.autonomous.request.root_turn_id,
    workingRevision: phase7.autonomous.request.working_revision
  });
  if (!resumed) appendPhase7ConversationWrites({ inserts, updates, appends,
    partyId, state, next, phase7, changeSetId, idemId });
  appendTurn10ConversationWrites({
    inserts, updates, appends, partyId, state, next, factual,
    changeSetId, idemId
  });
  return { inserts, updates, appends, deletes: [] };
}

function appendTurn10ConversationWrites({ inserts, updates, appends, partyId,
  state, next, factual, changeSetId, idemId }) {
  if (factual.consequence.turn10_kind !== 'companion_request') return;
  const semanticExchange =
    factual.consequence.conversation?.semantic_exchange;
  const semanticInput = buildNpcSemanticConversationWriteInput({
    state,
    next,
    semanticExchange
  });
  appendNpcSemanticConversationWrites({
    inserts,
    updates,
    appends,
    partyId,
    changeSetId,
    idempotencyRecordId: idemId,
    rootTurnId: factual.mode_resolution.turn_id,
    workingRevision:
      factual.mode_resolution.decision_trace?.working_revision ?? 2,
    sessionWrite: semanticInput.sessionWrite,
    semanticExchange: semanticInput.semanticExchange,
    signalRecords: semanticInput.signalRecords,
    actualMessageEvidence: semanticInput.actualMessageEvidence,
    persistedMessageStatements: semanticInput.persistedMessageStatements,
    persistedMessageAudiences: semanticInput.persistedMessageAudiences,
    supportingOperationEvidence:
      semanticInput.supportingOperationEvidence,
    partyStateVersion: semanticInput.partyStateVersion,
    sameTimeBatchRef: semanticInput.sameTimeBatchRef,
    contributions: semanticInput.contributions
  });
  const guide = (next.route_participant_commitments ?? []).find(
    ({ role }) => role === 'guide');
  if (guide?.route_ref != null
      && !(state.route_knowledge ?? []).includes(guide.route_ref)) {
    const evidence = (next.knowledge ?? []).find(
      ({ fact_id: id }) => id === guide.route_ref)?.evidence_refs ?? [];
    appendKnowledge(inserts, state, partyId, guide.route_ref, evidence);
  }
}

function appendConditionUpdates({ updates, partyId, state, next }) {
  const before = new Map((state.body_state.active_conditions ?? []).map(
    (condition) => [condition.storage_condition_id, condition]
  ));
  for (const condition of next.body_state.active_conditions ?? []) {
    if (!before.has(condition.storage_condition_id)
        || !condition.condition_outcome) continue;
    updates.push(row('party_actor_active_conditions',
      `player_character:${state.actor_id}:${condition.storage_condition_id}`, {
        party_id: partyId,
        actor_kind: 'player_character',
        actor_id: state.actor_id,
        condition_id: condition.storage_condition_id,
        condition_profile_ref:
          structuredClone(condition.condition_profile_ref),
        status: 'active',
        terminal_change_set_id: null
      }));
  }
}

function appendBodyHistory({ appends, partyId, state, factual, changeSetId,
  idemId }) {
  const id = `body-history:${partyId}:trace-phase7:fire-rest`;
  appends.push(row('party_body_temporal_history', id, {
    history_id: id,
    party_id: partyId,
    subject_kind: 'player_character',
    subject_id: state.actor_id,
    effect_ref: {
      entity_kind: 'body_effect',
      entity_id: factual.body_update.proposal.profile_ref,
      activity_attempt_id: factual.consequence.activity_attempt_id,
      condition_transitions:
        factual.body_update.proposal.condition_transitions ?? []
    },
    change_set_id: changeSetId,
    idempotency_record_id: idemId,
    occurred_at_whole_minutes: factual.time_update.clock_after.whole_minutes,
    occurred_at_subminute_numerator:
      factual.time_update.clock_after.subminute_numerator,
    occurred_at_subminute_denominator:
      factual.time_update.clock_after.subminute_denominator
  }));
}

function appendScheduleProjection({ updates, partyId, state, next, phase7,
  changeSetId }) {
  const npcId = phase7.autonomous.request.npc_ref;
  const npc = next.npcs.find(({ instance_id: id }) => id === npcId);
  if (!npc) throw new Error('TRACE_PHASE_7_SCHEDULE_WRITE_GAP');
  updates.push(row('party_npcs', npcId, {
    party_id: partyId,
    npc_id: npcId,
    anchor_id: npc.anchor_id,
    machine_state: npc.machine_state
  }));
  if (!phase7.schedule_execution.property_proposal) return;
  const beforeBag = state.containers.find(({ template_id: id }) =>
    id === 'trace_ld_v1_container_road_bag');
  const bag = next.containers.find(
    ({ container_id: id }) => id === beforeBag?.container_id
  );
  if (!bag) throw new Error('TRACE_PHASE_7_SCHEDULE_WRITE_GAP');
  updates.push(row('party_containers', bag.container_id, {
    party_id: partyId,
    container_id: bag.container_id,
    state: bag.state,
    updated_change_set_id: changeSetId
  }));
}
