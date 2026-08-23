import { canonicalDigest } from '@rus/materialization';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import { row } from './first-playable/plan-shared.js';
import { serverError } from '../../errors.js';
import { commitPhase2BodyState } from './lower-dvina-trace-phase-2-state.js';
import { assertSharedSemanticSnapshotSafe } from
  './lower-dvina-trace-conversation-state.js';

export function buildLowerDvinaTraceTurnStepVisibleEnvelope({
  partyId, turnNumber, nextVersion, changeSetId, idemId, envelope
}) {
  const context = envelope.visible_context;
  const visiblePayload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: context.visible_scene,
    perceived_changes: structuredClone(context.visible_changes),
    sensory_details: structuredClone(context.sensory_details),
    visible_npcs: structuredClone(context.visible_npc),
    visible_objects: structuredClone(context.visible_objects),
    known_context: structuredClone(context.known_context),
    uncertainties: structuredClone(context.uncertainties),
    hypotheses: [],
    player_safe_interruption: envelope.loop_trace.clarification?.question
      ?? null,
    allowed_action_affordances: []
  };
  const dependencyPins =
    deriveLowerDvinaTraceTurnStepVisibleDependencyPins(envelope);
  return {
    package_id: `visible:${partyId}:turn-step:${turnNumber}`,
    party_id: partyId,
    turn_id: envelope.root_turn_id,
    committed_state_version: String(nextVersion),
    change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
    visible_payload: visiblePayload,
    presentation_status: 'pending',
    projection_policy_ref: {
      entity_ref: {
        entity_kind: 'visibility_modifier',
        entity_id: 'lower_dvina_trace_turn_step_visible_v1'
      },
      authoring_version: '1'
    },
    dependency_pins: dependencyPins,
    idempotency_record_id: idemId
  };
}

export function buildLowerDvinaTraceTurnStepSnapshot({
  state, envelope, inputDigest, nextVersion, turnNumber, changeSetId,
  visibleEnvelope
}) {
  const next = structuredClone(state);
  delete next.npc_semantic_decision_traces;
  delete next.npc_semantic_decision_inputs;
  delete next.relevant_hidden_state;
  const clockChanged = canonicalDigest(envelope.time_update.clock_after)
    !== canonicalDigest(state.clock);
  next.schema = 'rus.lower_dvina_trace_turn_snapshot.v2';
  next.party_state = {
    ...next.party_state,
    state_version: nextVersion,
    session_state_version: next.party_state.session_state_version + 1,
    clock_state_version: next.party_state.clock_state_version
      + (clockChanged ? 1 : 0),
    body_state_version: next.party_state.body_state_version
      + (envelope.body_update.applied ? 1 : 0),
    turn_number: turnNumber
  };
  if (clockChanged) {
    next.clock = structuredClone(envelope.time_update.clock_after);
    next.clock_weather_light = {
      ...structuredClone(next.clock_weather_light),
      clock: structuredClone(next.clock)
    };
  }
  if (envelope.body_update.applied) {
    next.body_state = commitPhase2BodyState({
      before: state.body_state,
      proposed: envelope.body_update.state_after
    });
  }
  next.last_turn = {
    request_id: envelope.player_input.request_id,
    idempotency_key: envelope.player_input.idempotency_key,
    input_digest: inputDigest,
    raw_text: envelope.player_input.raw_text,
    received_at: envelope.player_input.received_at,
    option_id: envelope.mode_resolution.option_id,
    action_set_digest:
      envelope.mode_resolution.decision_trace.action_set_digest,
    semantic_trace:
      structuredClone(envelope.mode_resolution.decision_trace),
    check_request: structuredClone(envelope.checks.requests[0] ?? null),
    check_result: structuredClone(envelope.checks.results[0] ?? null),
    consequence: structuredClone(envelope.consequence),
    time_update: structuredClone(envelope.time_update),
    body_update: structuredClone(envelope.body_update),
    hidden_update: structuredClone(envelope.hidden_update),
    turn_step_commit: structuredClone(envelope),
    turn_step_idempotency_record_id: visibleEnvelope.idempotency_record_id,
    player_visible_message: structuredClone(
      envelope.loop_trace.clarification
    ),
    visible_package: {
      package_id: visibleEnvelope.package_id,
      package_digest: visibleEnvelope.package_digest,
      change_set_id: changeSetId
    }
  };
  return {
    snapshot: assertSharedSemanticSnapshotSafe(next),
    clockChanged
  };
}

export function deriveLowerDvinaTraceTurnStepVisibleDependencyPins(envelope) {
  const pins = semanticDependencyPins(envelope?.consequence?.state_changes);
  return {
    pins,
    canonical_digest: canonicalDigest(pins)
  };
}

function semanticDependencyPins(stateChanges) {
  const seen = new Set();
  const pins = [];
  for (const change of stateChanges ?? []) {
    const profileRef = change?.profile_ref
      ?? change?.body_effect_profile_ref;
    const profilePin = change?.profile_pin;
    const requiresPin = ['semantic_activity', 'direct_body_event']
      .includes(change?.kind);
    if (typeof profileRef !== 'string' || !profileRef.trim()
        || typeof profilePin?.artifact_id !== 'string'
        || !profilePin.artifact_id.trim()
        || !Number.isSafeInteger(profilePin.revision)
        || profilePin.revision < 1) {
      if (requiresPin) throw serverError(
        'TRACE_TURN_STEP_DEPENDENCY_PIN_MISSING',
        'An owner-produced semantic effect lacks its exact artifact pin.',
        { status: 409 }
      );
      continue;
    }
    const entityKind = change.kind === 'semantic_activity'
      ? 'activity_profile' : 'body_effect_profile';
    const identity = `${entityKind}:${profileRef}:${profilePin.revision}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    pins.push({
      dependency_role: 'source_authoring',
      entity_ref: {
        entity_kind: entityKind,
        entity_id: profileRef
      },
      version_pin: {
        pin_kind: 'authoring_version',
        authoring_version: String(profilePin.revision),
        state_version: null
      }
    });
  }
  return pins.sort((left, right) =>
    left.entity_ref.entity_id.localeCompare(right.entity_ref.entity_id));
}

export function buildLowerDvinaTraceTurnStepRootWrites({
  partyId, state, snapshot, envelope, nextVersion, turnNumber, changeSetId,
  idemId, pendingScreen, clockChanged
}) {
  const writes = {
    inserts: [row('party_state_snapshots', `${partyId}:${nextVersion}`, {
      party_id: partyId,
      state_version: nextVersion,
      state_payload: snapshot,
      state_digest: canonicalDigest(snapshot)
    })],
    updates: [
      row('parties', partyId, { party_id: partyId, status: 'active' }),
      row('party_server_sessions', partyId, {
        party_id: partyId,
        screen: pendingScreen,
        turn_number: turnNumber,
        last_turn_id: envelope.root_turn_id,
        updated_change_set_id: changeSetId
      })
    ],
    appends: [row('party_v3_change_sets', changeSetId, {
      id: changeSetId,
      party_id: partyId,
      operation_kind: 'trace_turn_step',
      idempotency_record_id: idemId
    })],
    deletes: []
  };
  if (clockChanged) writes.updates.push(row('party_clocks', partyId, {
    party_id: partyId,
    whole_minutes: envelope.time_update.clock_after.whole_minutes,
    subminute_numerator:
      envelope.time_update.clock_after.subminute_numerator,
    subminute_denominator:
      envelope.time_update.clock_after.subminute_denominator,
    updated_change_set_id: changeSetId
  }));
  if (envelope.body_update.applied) writes.updates.push(row(
    'party_actor_body_states', `player_character:${state.actor_id}`, {
      party_id: partyId,
      actor_kind: 'player_character',
      actor_id: state.actor_id,
      health: snapshot.body_state.health,
      energy: snapshot.body_state.energy,
      satiety: snapshot.body_state.satiety,
      updated_change_set_id: changeSetId
    }
  ));
  const transition = envelope.consequence?.position_transition;
  if (transition?.owner === '@rus/movement-routes') writes.updates.push(row(
    'party_journey_locations', state.journey_location.id, {
      id: state.journey_location.id, party_id: partyId, owner_kind: 'actor',
      owner_id: state.actor_id, location_kind: 'scene',
      scene_position_id: snapshot.position.position_id, transit_anchor_id: null,
      travel_state_id: null, updated_change_set_id: changeSetId
    }
  ));
  return writes;
}
