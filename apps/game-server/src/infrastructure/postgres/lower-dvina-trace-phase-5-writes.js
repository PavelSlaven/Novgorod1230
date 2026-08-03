import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { row } from './first-playable/plan-shared.js';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';
import { appendPhase5FinalTreatment } from
  './lower-dvina-trace-phase-5-final-writes.js';
import {
  appendPhase5ConsentDecision,
  appendPhase5InitialBindings
} from './lower-dvina-trace-phase-5-initial-writes.js';
import {
  appendPhase5ResourceStateWrites,
  phase5ActivityAttemptRecord,
  phase5TimedExecutionRecord
} from './lower-dvina-trace-phase-5-temporal-writes.js';
import { assertSharedSemanticSnapshotSafe } from
  './lower-dvina-trace-conversation-state.js';

export function phase5VisibleEnvelope({ partyId, nextVersion, turnNumber,
  changeSetId, idemId, factual, visibleContext, contracts }) {
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
    player_safe_interruption: factual.consequence.treatment.interrupted
      ? 'treatment_progress_preserved' : null,
    allowed_action_affordances: []
  };
  const pins = contracts.activityPins.map(({ entity_kind: entityKind, id,
    version }) => ({
    dependency_role: 'source_authoring',
    entity_ref: { entity_kind: entityKind, entity_id: id },
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: String(version ?? 1),
      state_version: null
    }
  }));
  return {
    package_id: `visible:${partyId}:trace-phase5:${turnNumber}`,
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
        entity_id: 'lower_dvina_trace_phase_5_visible_v1'
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

export function phase5PendingScreen({ state, factual, visibleEnvelope,
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

export function phase5Writes({ partyId, state, next, factual, visibleEnvelope,
  pendingScreen, nextVersion, turnNumber, changeSetId, idemId, contracts }) {
  assertSharedSemanticSnapshotSafe(next);
  const treatment = factual.consequence.treatment;
  const first = state.phase5_treatment == null;
  const execution = treatment.activity_execution;
  const attempt = treatment.attempt;
  const inserts = [row('party_state_snapshots', `${partyId}:${nextVersion}`, {
    party_id: partyId,
    state_version: nextVersion,
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
  const appends = [row('party_v3_change_sets', changeSetId, {
    id: changeSetId,
    party_id: partyId,
    operation_kind: 'trace_phase_5_treatment',
    idempotency_record_id: idemId
  })];
  const executionRecord = phase5TimedExecutionRecord({
    state, factual, execution, next, changeSetId, idemId, first
  });
  (first ? inserts : updates).push(
    row('party_timed_activity_executions', execution.id, executionRecord)
  );
  appends.push(row('party_timed_activity_attempts',
    `${execution.id}:${attempt.attempt_ordinal}`,
    phase5ActivityAttemptRecord({ attempt, execution, factual, turnNumber,
      changeSetId, idemId })));
  if (first) appendPhase5InitialBindings({
    inserts, appends, execution, state, contracts, changeSetId, idemId
  });
  if (first) appendPhase5ConsentDecision({
    appends, state, factual, contracts, changeSetId
  });
  for (const factId of treatment.stage_completion_facts ?? []) {
    inserts.push(row('party_character_knowledge',
      `${state.actor_id}:${factId}`, {
        party_id: partyId,
        character_id: state.actor_id,
        fact_id: factId,
        knowledge_state: 'known_from_committed_source',
        evidence: [execution.id]
      }));
  }
  if (treatment.final) {
    appendPhase5FinalTreatment({
      inserts, updates, appends, partyId, state, next, factual, contracts,
      turnNumber, changeSetId, idemId, execution
    });
  }
  appendPhase5ResourceStateWrites({ inserts, updates, appends, state, next, partyId,
    changeSetId, idemId, treatment, contracts });
  for (const slot of ['onisim_boatman', 'eremey_fisher',
    contracts.actors.participating_fisher.participant_slot_ref]) {
    const npc = next.npcs.find(
      ({ participant_slot_ref: ref }) => ref === slot
    );
    updates.push(row('party_npcs', npc.instance_id, {
      party_id: partyId,
      npc_id: npc.instance_id,
      machine_state: npc.machine_state
    }));
  }
  return { inserts, updates, appends, deletes: [] };
}
