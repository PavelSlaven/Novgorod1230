import {
  phase2ScreenDigest,
  phase2VisibleContextFromPayload,
  turnStepPublicCombatState
} from './lower-dvina-trace-phase-2-projection.js';

export function buildLowerDvinaTracePendingScreen({
  state,
  turnId,
  nextVersion,
  turnNumber,
  visibleEnvelope,
  turnStepTrace = null
}) {
  const combatState = turnStepPublicCombatState(turnStepTrace);
  const screen = {
    version: 1,
    schema: 'lower_dvina_trace_turn_screen',
    scenario_id: 'lower_dvina_trace_v1',
    party_id: state.party_id,
    turn_id: turnId,
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
    ...(combatState == null ? {} : { combat_state: combatState }),
    main_prose: 'Факты хода сохранены; повествование ожидает повторной доставки.'
  };
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}
