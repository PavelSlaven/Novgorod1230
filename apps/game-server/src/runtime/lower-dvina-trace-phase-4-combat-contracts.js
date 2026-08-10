import { serverError } from '../errors.js';

export function resolveTracePhase4CombatBindings(
  bindings,
  expectedLocationRef
) {
  const phase4 = bindings?.phase_4;
  if (bindings?.schema
      !== 'rus.lower_dvina_trace_combat_semantic_bindings.v1'
      || bindings.scenario_definition_revision !== 16
      || bindings.status !== 'approved'
      || bindings.fallback_policy !== 'forbidden'
      || phase4?.actor_slot !== 'ratsha_storehouse_helper'
      || phase4.scope_location_ref !== expectedLocationRef
      || phase4.handoff_kind !== 'combat'
      || phase4.signal_descriptor?.category !== 'objective'
      || phase4.signal_descriptor?.significance !== 'material'
      || phase4.player_response_required_before_execution !== true
      || phase4.execution_profiles?.length !== 4
      || !phase4.allowed_target_slots?.includes('player_clerk')) {
    throw serverError(
      'TRACE_PHASE_4_COMBAT_BINDING_INVALID',
      'The exact party-pinned Phase 4 combat binding is incomplete.',
      { status: 409 }
    );
  }
  return structuredClone(phase4);
}
