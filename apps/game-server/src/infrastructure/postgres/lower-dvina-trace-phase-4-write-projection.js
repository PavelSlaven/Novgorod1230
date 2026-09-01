
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { row } from './first-playable/plan-shared.js';
import {
  appendApprovedRatshaKnife,
  appendPromiseTransition
} from './lower-dvina-trace-phase-4-property-writes.js';
import {
  phase2ScreenDigest,
  phase2VisibleContextFromPayload
} from './lower-dvina-trace-phase-2-projection.js';
import {
  appendHostileSemantics,
  appendM2SurrenderObserverPerceptions,
  appendSurrenderSemantics
} from './lower-dvina-trace-phase-4-semantic-writes.js';
import {
  appendPhase4Movement
} from './lower-dvina-trace-phase-4-movement-writes.js';
import { appendWorldRouteJourney } from './lower-dvina-trace-world-route-journey.js';
import {
  appendPhase4ActivityExecution
} from './lower-dvina-trace-phase-4-activity-writes.js';
import { appendRouteBodyWrites } from './lower-dvina-trace-route-body-writes.js';
import {
  appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput
} from './npc-semantic-conversation-writes.js';
import { assertSharedSemanticSnapshotSafe } from
  './lower-dvina-trace-conversation-state.js';

import { appendSemanticNegotiation } from './lower-dvina-trace-phase-4-write-projection-semantic.js';
import { exactActivityRoots, validPersistedOfferStage } from './lower-dvina-trace-phase-4-write-projection-shared.js';

export function phase4Writes({ partyId, state, next, factual, visibleEnvelope,
  pendingScreen, nextVersion, turnNumber, changeSetId, idemId, contracts,
  scenarioRevision, rootTurnId, workingRevision }) {
  const inserts = [];
  const updates = [
    row('parties', partyId, { party_id: partyId, status: 'active' }),
    row('party_server_sessions', partyId, {
      party_id: partyId, turn_number: turnNumber,
      last_turn_id: factual.mode_resolution.turn_id, screen: pendingScreen,
      updated_change_set_id: changeSetId
    }),
    row('party_clocks', partyId, {
      party_id: partyId, ...next.clock, updated_change_set_id: changeSetId
    })
  ];
  const appends = [row('party_v3_change_sets', changeSetId, {
    id: changeSetId, party_id: partyId, operation_kind: 'trace_phase_4_turn',
    idempotency_record_id: idemId
  })];
  const deletes = [];

  if (factual.consequence.phase4_kind === 'movement') {
    appendWorldRouteJourney({ writes: { inserts, updates, deletes }, partyId,
      state, movement: { destination: { scene_position_id: null } }, changeSetId });
    appendPhase4Movement({ inserts, updates, appends, partyId, state, next, factual,
      turnNumber, changeSetId, idemId, contracts });
    appendRouteBodyWrites({ updates, appends, partyId, state, next, factual,
      changeSetId, idemId, historyId: `body-history:${partyId}:trace-phase4:${turnNumber}` });
  } else if (factual.consequence.phase4_kind === 'negotiation') {
    if ([14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].includes(scenarioRevision)) {
      appendSemanticNegotiation({
        inserts, updates, appends, partyId, state, next, factual,
        turnNumber, changeSetId, idemId, contracts, rootTurnId,
        workingRevision
      });
    } else {
      appendNegotiation({ inserts, updates, appends, partyId, state, next, factual,
        turnNumber, changeSetId, idemId, contracts });
    }
  } else {
    throw new Error('TRACE_PHASE_4_KIND_INVALID');
  }
  assertSharedSemanticSnapshotSafe(next);
  inserts.unshift(row('party_state_snapshots', `${partyId}:${nextVersion}`, {
    party_id: partyId, state_version: nextVersion, state_payload: next,
    state_digest: canonicalDigest(next)
  }));
  return { inserts, updates, appends, deletes };
}
function appendNegotiation({ inserts, updates, appends, partyId, state, next,
  factual, turnNumber, changeSetId, idemId, contracts }) {
  const n = factual.consequence.negotiation;
  if (!n?.offer_committed_before_check
      || !['not_offered', 'offered'].includes(
        state.promise_instances?.[0]?.current_state
      )
      || !validPersistedOfferStage({ state, factual, negotiation: n,
        contracts })) {
    throw new Error('TRACE_PHASE_4_PROMISE_TRANSITION_INVALID');
  }
  const roots = exactActivityRoots(n);
  const negotiationActivityId = `activity:${partyId}:trace-phase4:${turnNumber}:negotiation`;
  const negotiationActivitySeriesId =
    `series:${partyId}:trace-phase4:${turnNumber}:negotiation`;
  const continuationActivityId = roots.continuation
    ? `activity:${partyId}:trace-phase4:${turnNumber}:response` : null;
  const continuationActivitySeriesId = roots.continuation
    ? `series:${partyId}:trace-phase4:${turnNumber}:response` : null;
  appendPhase4ActivityExecution({ inserts, appends, partyId, state, factual, next,
    root: roots.negotiation, id: negotiationActivityId, seriesOrdinal: 0,
    activitySeriesId: negotiationActivitySeriesId, attemptOrdinal: 0, turnNumber,
    changeSetId, idemId });
  if (roots.continuation) {
    appendPhase4ActivityExecution({ inserts, appends, partyId, state, factual, next,
      root: roots.continuation, id: continuationActivityId, seriesOrdinal: 1,
      activitySeriesId: continuationActivitySeriesId, attemptOrdinal: 0, turnNumber,
      changeSetId, idemId });
  }
  const checkId = `check:${partyId}:trace-phase4:${turnNumber}`;
  const trace = n.npc_decision.trace;
  const offerAppends = [];
  const activationAppends = [];
  appendPromiseTransition({
    updates,
    offerAppends,
    activationAppends,
    state,
    next,
    n,
    partyId,
    changeSetId,
    idemId,
    turnNumber,
    activityId: negotiationActivityId,
    checkId,
    contracts
  });
  appends.push(...offerAppends);
  appends.push(row('party_check_resolutions', checkId, {
    check_resolution_id: checkId, party_id: partyId,
    check_scope_kind: 'immediate_action',
    check_scope_key: {
      request_id: factual.player_input.request_id,
      option_id: factual.mode_resolution.option_id,
      promise_offer_stage: structuredClone(n.offer_stage)
    },
    check_policy_ref: { entity_kind: 'check_policy', entity_id: n.check_result.check_id,
      authoring_version: '1' },
    deterministic_roll_input_digest: canonicalDigest({
      audit: n.check_result.audit,
      request: n.check_request
    }),
    roll_value: n.check_result.roll, modifier_snapshot: n.check_result.modifiers,
    target_value: n.check_result.difficulty,
    result_kind: n.check_result.outcome.success ? 'success' : 'failure',
    consequence_policy_ref: { entity_kind: 'consequence_policy', entity_id: n.outcome_ref,
      authoring_version: '1' }, result_change_set_id: changeSetId,
    canonical_digest: canonicalDigest(n.check_result)
  }));
  appends.push(row('party_npc_decision_traces', trace.request_id, {
    request_id: trace.request_id, party_id: partyId,
    npc_id: contracts.actors.ratsha_storehouse_helper.instance_id,
    state_version: Number(trace.state_version), option_id: trace.option_id,
    command_token: trace.command_token, options_digest: trace.options_digest,
    status: 'committed', validated_at_whole_minutes: trace.validated_at.whole_minutes,
    validated_at_subminute_numerator: trace.validated_at.subminute_numerator,
    validated_at_subminute_denominator: trace.validated_at.subminute_denominator,
    idempotency_key: trace.idempotency_key, change_set_id: changeSetId,
    trace_digest: trace.trace_digest
  }));
  appends.push(...activationAppends);
  if (n.npc_decision.outcome === 'surrender') {
    inserts.push(row('party_character_knowledge',
      `${state.actor_id}:ratsha_surrender_without_further_harm_committed`, {
        party_id: partyId, character_id: state.actor_id,
        fact_id: 'ratsha_surrender_without_further_harm_committed',
        knowledge_state: 'known_from_committed_source',
        evidence: [trace.request_id]
      }));
    appendApprovedRatshaKnife({ updates, state, next, n, partyId, contracts });
    appendSurrenderSemantics({
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
      activityId: negotiationActivityId
    });
  } else {
    appendHostileSemantics({
      inserts,
      appends,
      state,
      next,
      factual,
      partyId,
      turnNumber,
      changeSetId,
      idemId,
      contracts,
      activityId: negotiationActivityId
    });
  }
}

export function phase4VisibleEnvelope({ partyId, nextVersion, turnNumber, changeSetId,
  idemId, factual, visibleContext, contracts }) {
  const payload = { schema: 'temporal_visible_package.v1',
    perceived_scene: visibleContext.visible_scene,
    perceived_changes: visibleContext.visible_changes,
    sensory_details: visibleContext.sensory_details, visible_npcs: visibleContext.visible_npc,
    visible_objects: visibleContext.visible_objects, known_context: visibleContext.known_context,
    uncertainties: visibleContext.uncertainties, hypotheses: [],
    player_safe_interruption:
      factual.consequence.negotiation?.player_response_boundary
        ? 'ratsha_attack_player_response_required'
        : null,
    allowed_action_affordances: [] };
  const pins = contracts.activityPins.map(({ id, version }) => ({ dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'activity_profile', entity_id: id },
    version_pin: { pin_kind: 'authoring_version', authoring_version: String(version), state_version: null } }));
  return { package_id: `visible:${partyId}:trace-phase4:${turnNumber}`, party_id: partyId,
    turn_id: factual.mode_resolution.turn_id, committed_state_version: String(nextVersion),
    change_set_id: changeSetId, package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload, presentation_status: 'pending', projection_policy_ref: {
      entity_ref: { entity_kind: 'visibility_modifier',
        entity_id: 'lower_dvina_trace_phase_4_visible_v1' }, authoring_version: '1' },
    dependency_pins: { pins, canonical_digest: canonicalDigest(pins) },
    idempotency_record_id: idemId };
}

export function phase4PendingScreen({ state, factual, visibleEnvelope, turnNumber,
  nextVersion }) {
  const screen = { version: 1, schema: 'lower_dvina_trace_turn_screen',
    scenario_id: 'lower_dvina_trace_v1', party_id: state.party_id,
    turn_id: factual.mode_resolution.turn_id, turn_number: turnNumber,
    screen_status: 'committed_presentation_pending',
    opening_screen_digest: state.opening_identity.opening_screen_digest,
    current_projection_anchor: { committed_state_version: nextVersion,
      package_id: visibleEnvelope.package_id, package_digest: visibleEnvelope.package_digest,
      narration_output_digest: null },
    visible_context: phase2VisibleContextFromPayload(visibleEnvelope.visible_payload),
    main_prose: 'Факты хода сохранены; повествование ожидает повторной доставки.' };
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}
