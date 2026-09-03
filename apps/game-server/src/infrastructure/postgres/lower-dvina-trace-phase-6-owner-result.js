import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../../errors.js';

export function assertLowerDvinaTracePhase6OwnerResult({
  factual, state, changeSetId, idemId, phase6Contracts
}) {
  const carry = factual.consequence.carry;
  const intent = carry.intent;
  const interval = carry.traversal?.interval_result;
  if (carry.traversal?.owner !== '@rus/movement-routes'
      || interval?.result_change_set_id !== changeSetId
      || interval.idempotency_record_id !== idemId
      || Number(interval.progress_before_ppm) !== intent.progress_before_ppm
      || Number(interval.actual_progress_after_ppm) !== intent.progress_after_ppm
      || interval.actual_time_numerator !== intent.exact_elapsed.numerator
      || interval.actual_time_denominator !== '1'
      || carry.traversal.planning_state_version
        !== state.party_state.state_version
      || factual.time_update.clock_after.whole_minutes
        !== carry.traversal.clock_update.world_time_after.whole_minutes
      || intent.execution_after.status === 'completed'
        && !validTerminalEnvironment(intent, phase6Contracts)) {
    throw serverError('TRACE_PHASE_6_OWNER_RESULT_INVALID',
      'Phase 6 factual commit failed closed.', { status: 409 });
  }
}

function validTerminalEnvironment(intent, contracts) {
  const snapshot = intent.terminal_environment_snapshot;
  if (snapshot == null) return false;
  const { scope, causal_basis: causalBasis, ...profile } = snapshot;
  return canonicalDigest(profile) === canonicalDigest(
    contracts.terminalEnvironment)
    && canonicalDigest(scope) === canonicalDigest({
      location_ref: intent.terminal_group_position.location_ref,
      g5_node_id: intent.terminal_group_position.g5_node_id,
      g5_anchor_id: intent.terminal_group_position.g5_anchor_id,
      zone_ref: intent.terminal_group_position.zone_ref
    })
    && causalBasis?.kind === 'authored_terminal_environment'
    && causalBasis.environment_profile_ref
      === contracts.terminalEnvironment.environment_profile_id
    && causalBasis.route_ref === contracts.route.route_id
    && causalBasis.anchor_template_ref
      === contracts.terminalPlacement.group.anchor_template_ref;
}
