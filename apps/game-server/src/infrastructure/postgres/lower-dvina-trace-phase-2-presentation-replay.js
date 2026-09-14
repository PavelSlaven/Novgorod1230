import { spatialResult } from '@rus/turn';
import { runWithinTurnDeadline } from '../../runtime/llm-turn-budget.js';
import { buildPhase2ReadyScreen } from './lower-dvina-trace-phase-2-projection.js';
import { loadPhase2VisibleContext } from './lower-dvina-trace-phase-2-visible-context.js';

export async function replayLowerDvinaTracePhase2Presentation({
  partyPool, partyId, replay, narrator, turnBudget, persistPhase2Screen
}) {
  if (replay.screen?.screen_status !== 'committed_presentation_pending') {
    return replay.public_result;
  }
  const visibleContext = await loadPhase2VisibleContext(partyPool, {
    commit: replay.state.last_turn.visible_package, turnBudget
  });
  const narration = await runWithinTurnDeadline(turnBudget, () => narrator.run({
    version: 1, schema: 'narration_request', request_id: replay.screen.turn_id,
    party_id: partyId,
    delivery_turn_number: replay.state.party_state?.turn_number,
    surface: 'turn', visible_context: visibleContext,
    context: { attempt: { text: replay.state.last_turn.raw_text },
      outcome: spatialResult({ consequence: replay.state.last_turn.consequence }) },
    style_policy: { preserve_uncertainty: true, no_new_world_facts: true },
    max_repairs: 1, turnBudget
  }));
  const commit = { state_version: replay.state.party_state?.state_version,
    turn_number: replay.state.party_state?.turn_number,
    package_id: replay.state.last_turn.visible_package.package_id,
    package_digest: replay.state.last_turn.visible_package.package_digest };
  if (narration?.factual_delivery) return persistPhase2Screen({ partyId,
    inputDigest: replay.input_digest, turnBudget,
    result: { commit, factual_delivery: narration.factual_delivery,
      turn_id: replay.screen.turn_id } });
  return persistPhase2Screen({ partyId, inputDigest: replay.input_digest, turnBudget,
    result: { commit, narration, screen: buildPhase2ReadyScreen({
      payload: replay.state, turnId: replay.screen.turn_id, visibleContext, narration,
      narrationOutputDigest: narration.presentation.output_digest }),
    turn_id: replay.screen.turn_id } });
}
