import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { row } from './first-playable/plan-shared.js';
import { event } from './first-playable/plan-traversal-evidence.js';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';
import { appendTraversal } from './lower-dvina-trace-phase-6-traversal-writes.js';
import { appendActivity } from './lower-dvina-trace-phase-6-activity-writes.js';
import { appendPlayerBodyEffect, appendTerminal } from
  './lower-dvina-trace-phase-6-terminal-writes.js';
import { assertSharedSemanticSnapshotSafe } from
  './lower-dvina-trace-conversation-state.js';

export function phase6VisibleEnvelope({ partyId, nextVersion, turnNumber,
  changeSetId, idemId, factual, visibleContext }) {
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
    player_safe_interruption:
      factual.consequence.carry.intent.execution_after.status === 'paused'
        ? 'carry_progress_preserved' : null,
    allowed_action_affordances: []
  };
  const pins = factual.consequence.carry.traversal.dependency_pins.pins
    .filter((pin) => pin.entity_ref.entity_kind === 'activity_profile')
    .map((pin) => ({
      dependency_role: 'source_authoring',
      entity_ref: structuredClone(pin.entity_ref),
      version_pin: structuredClone(pin.version_pin)
    }));
  const dependencyPins = {
    pins,
    canonical_digest: canonicalDigest(pins)
  };
  return {
    package_id: `visible:${partyId}:trace-phase6:${turnNumber}`,
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
        entity_id: 'lower_dvina_trace_phase_6_visible_v1'
      },
      authoring_version: '1'
    },
    dependency_pins: structuredClone(dependencyPins),
    idempotency_record_id: idemId
  };
}

export function phase6PendingScreen({ state, factual, visibleEnvelope,
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

export function phase6Writes({ partyId, state, next, factual, turnNumber,
  changeSetId, idemId, visibleEnvelope, pendingScreen }) {
  assertSharedSemanticSnapshotSafe(next);
  const carry = factual.consequence.carry;
  const intent = carry.intent;
  const traversal = carry.traversal;
  const first = state.phase6_carry_execution == null;
  const terminal = intent.execution_after.status === 'completed';
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
  const appends = [
    row('party_v3_change_sets', changeSetId, {
      id: changeSetId,
      party_id: partyId,
      operation_kind: 'trace_phase_6_carry',
      idempotency_record_id: idemId
    })
  ];
  const deletes = [];
  appendTraversal({ inserts, updates, appends, partyId, state, factual,
    traversal, intent, first, terminal, turnNumber, changeSetId, idemId });
  appendActivity({ inserts, updates, appends, state, factual, intent,
    traversal, first, terminal, turnNumber, changeSetId, idemId });
  if (factual.body_update?.applied === true) {
    appendPlayerBodyEffect({ updates, appends, partyId, state, next, factual,
      intent, changeSetId, idemId });
  }
  if (terminal) appendTerminal({ inserts, updates, appends, deletes, partyId, state,
    next, intent, changeSetId, idemId });
  return { inserts, updates, appends, deletes };
}
