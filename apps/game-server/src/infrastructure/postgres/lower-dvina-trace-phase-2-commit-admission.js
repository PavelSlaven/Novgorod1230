import { serverError } from '../../errors.js';

export function assertPhase2CurrentStateVersion({
  writePlan,
  factual,
  state
}) {
  const currentVersion = state.party_state.state_version;
  const planVersion = writePlan.base_state_version;
  const decisionVersion =
    factual.mode_resolution.decision_trace?.state_version;
  if (!Number.isSafeInteger(currentVersion)
      || !Number.isSafeInteger(planVersion)
      || !Number.isSafeInteger(decisionVersion)
      || planVersion !== currentVersion
      || decisionVersion !== currentVersion) {
    throw serverError(
      'TRACE_PHASE_2_STALE_STATE',
      'Phase 2 factual plan was resolved from a stale committed state.',
      {
        status: 409,
        details: {
          current_state_version: currentVersion,
          write_plan_state_version: planVersion,
          decision_state_version: decisionVersion
        }
      }
    );
  }
}
