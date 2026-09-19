import { projectLowerDvinaTraceScreenPanels } from './lower-dvina-trace-screen-panels.js';
import {
  phase2ScreenDigest,
  phase2VisibleContextFromPayload,
  projectPlayerSafeChecks,
  publicCombatStateFromConsequence
} from './lower-dvina-trace-phase-2-projection.js';

export function buildLowerDvinaTracePendingScreen({
  state,
  turnId,
  nextVersion,
  turnNumber,
  visibleEnvelope,
  turnConsequence = null,
  presentation = null
}) {
  const combatState = publicCombatStateFromConsequence(turnConsequence);
  const scenarioId = state.scenario_id ?? 'lower_dvina_trace_v1';
  const screen = structuredClone(projectLowerDvinaTraceScreenPanels({ payload: state, presentation, screen: {
    version: 1,
    schema: scenarioId === 'lower_dvina_trace_v1'
      ? 'lower_dvina_trace_turn_screen' : 'turn_screen',
    scenario_id: scenarioId,
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
    checks: projectPlayerSafeChecks(state),
    ...(combatState == null ? {} : { combat_state: combatState }),
    main_prose: 'Факты хода сохранены; повествование ожидает повторной доставки.'
  } }));
  delete screen.panels?.people?.data?.active_interlocutor?.portrait_spec_v1;
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}
