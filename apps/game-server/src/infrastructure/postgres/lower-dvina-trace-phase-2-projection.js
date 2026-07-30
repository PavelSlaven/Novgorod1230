import { canonicalDigest } from '@rus/materialization';
import { createTurnScreenReadModel } from '@rus/presentation';

export function phase2PublicResult({ payload, screen }) {
  return {
    party_id: payload.party_id,
    turn_number: payload.party_state.turn_number,
    state_version: payload.party_state.state_version,
    option_id: payload.last_turn.option_id,
    screen,
    check: payload.last_turn.check_result,
    time_update: payload.last_turn.time_update,
    body_update: payload.last_turn.body_update,
    observations: payload.last_turn.consequence.observations,
    evidence: payload.last_turn.consequence.evidence_relations,
    clue: payload.last_turn.consequence.clue_materialization
  };
}

export function rebuildPhase2HistoricalScreen({
  payload,
  turnId,
  visiblePayload,
  narrationOutput,
  narrationOutputDigest
}) {
  const visibleContext = phase2VisibleContextFromPayload(visiblePayload);
  const narration = {
    ...structuredClone(narrationOutput.flow_result),
    presentation: {
      package_digest: narrationOutput.package_digest,
      output_digest: narrationOutputDigest
    }
  };
  return buildPhase2ReadyScreen({
    payload,
    turnId,
    visibleContext,
    narration,
    narrationOutputDigest
  });
}

export function buildPhase2ReadyScreen({
  payload,
  turnId,
  visibleContext,
  narration,
  narrationOutputDigest
}) {
  const screen = {
    ...createTurnScreenReadModel({
      partyId: payload.party_id,
      turnId,
      turnNumber: payload.party_state.turn_number,
      visibleContext,
      narration,
      actions: [],
      panels: {}
    }),
    scenario_id: 'lower_dvina_trace_v1',
    screen_kind: 'trace_turn',
    delivery_state: {
      ready: true,
      generated_at: payload.last_turn.received_at
    },
    opening_screen_digest:
      payload.opening_identity.opening_screen_digest,
    schema: 'lower_dvina_trace_turn_screen',
    screen_status: 'ready',
    current_projection_anchor: {
      committed_state_version:
        payload.party_state.state_version,
      package_id: payload.last_turn.visible_package.package_id,
      package_digest:
        payload.last_turn.visible_package.package_digest,
      narration_output_digest: narrationOutputDigest
    }
  };
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}

export function phase2VisibleContextFromPayload(payload) {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: payload.perceived_scene,
    visible_changes: structuredClone(payload.perceived_changes),
    sensory_details: structuredClone(payload.sensory_details),
    visible_npc: structuredClone(payload.visible_npcs),
    visible_objects: structuredClone(payload.visible_objects),
    known_context: structuredClone(payload.known_context),
    uncertainties: structuredClone(payload.uncertainties),
    allowed_tensions: [],
    do_not_imply: []
  };
}

export function phase2ScreenDigest(screen) {
  const { screen_digest: _digest, ...payload } = screen;
  return canonicalDigest(payload);
}
