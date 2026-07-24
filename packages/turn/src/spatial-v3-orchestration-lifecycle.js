import { clone, exact, fail, freeze, pins, record, requirePort, sealed, same, text } from './spatial-v3-orchestration-core.js';

export function createSpatialV3NewGameStarter({ loadStartSnapshot, prepareStart, persistStart } = {}) {
  [loadStartSnapshot, prepareStart, persistStart].forEach((port, index) => requirePort(port, ['loadStartSnapshot', 'prepareStart', 'persistStart'][index]));
  return freeze({
    async start(input = {}) {
      if (!record(input) || !text(input.party_id) || !text(input.request_id) || !sealed(input)) return fail('generated_schema_mismatch', input?.party_id, { stage: 'new_game_input' });
      const snapshot = await loadStartSnapshot(freeze(clone(input)));
      if (!snapshot?.ok || !exact(snapshot.start_snapshot, 'canonical_party_g5_start_snapshot', input.party_id) || !pins(snapshot.start_snapshot.dependency_pins) || !sealed(snapshot.start_snapshot.canonical_party_g5_projection) || !sealed(snapshot.start_snapshot.start_scene_baseline) || !sealed(snapshot.start_snapshot.start_position_binding)) return fail('route_plan_snapshot_missing', input.party_id, { stage: 'new_game_load' });
      const prepared = await prepareStart(freeze({ party_id: input.party_id, request_id: input.request_id, start_snapshot: clone(snapshot.start_snapshot) }));
      if (!prepared?.ok || !exact(prepared.preparation, 'prepared_start', input.party_id, snapshot.start_snapshot.dependency_pins) || !same(prepared.preparation.canonical_party_g5_projection, snapshot.start_snapshot.canonical_party_g5_projection) || !same(prepared.preparation.start_scene_baseline, snapshot.start_snapshot.start_scene_baseline) || !same(prepared.preparation.start_position_binding, snapshot.start_snapshot.start_position_binding) || !record(prepared.preparation.start_position) || !text(prepared.preparation.start_position.g6_id) || !text(prepared.preparation.start_position.position_id)) return fail('target_preparation_failed', input.party_id, { stage: 'new_game_prepare' });
      const persisted = await persistStart(freeze({ party_id: input.party_id, schema_version: 3, start_snapshot: clone(snapshot.start_snapshot), preparation: clone(prepared.preparation) }));
      if (!persisted?.ok || persisted.schema_version !== 3 || !exact(persisted.write_plan, 'party_runtime_v3_start_write_plan', input.party_id, snapshot.start_snapshot.dependency_pins) || persisted.write_plan.start_snapshot_digest !== snapshot.start_snapshot.canonical_digest || persisted.write_plan.preparation_digest !== prepared.preparation.canonical_digest || !exact(persisted.change_set, 'committed_change_set', input.party_id, snapshot.start_snapshot.dependency_pins) || persisted.change_set.write_plan_digest !== persisted.write_plan.canonical_digest) return fail('generated_schema_mismatch', input.party_id, { stage: 'new_game_persist' });
      return freeze({ ok: true, party_id: input.party_id, schema_version: 3, start_snapshot: clone(snapshot.start_snapshot), preparation: clone(prepared.preparation), change_set: clone(persisted.change_set) });
    }
  });
}

export function createSpatialV3ModeHandoffOrchestrator({ endPlan, createSuccessorPlan, rollbackEndedPlan, handoffAtomically, verifyTransitionArtifact } = {}) {
  if (handoffAtomically != null) requirePort(handoffAtomically, 'handoffAtomically');
  if (handoffAtomically == null) [endPlan, createSuccessorPlan, rollbackEndedPlan].forEach((port, index) => requirePort(port, ['endPlan', 'createSuccessorPlan', 'rollbackEndedPlan'][index]));
  requirePort(verifyTransitionArtifact, 'verifyTransitionArtifact');
  return freeze({
    async handoff(input = {}) {
      const transition = input.mode_transition;
      const modes = new Set(['root_authoritative', 'attached']); const kinds = new Set(['board_carrier', 'disembark_carrier', 'load_carrier', 'change_cohort']);
      if (!record(input) || !text(input.party_id) || !text(input.execution_id) || !text(input.next_owner_ref?.entity_kind) || !text(input.next_owner_ref?.entity_id) || !sealed(input.handoff_endpoint_snapshot) || !sealed(input.expected_persisted_state) || !sealed(transition) || transition.kind !== 'mode_transition' || !kinds.has(transition.transition_kind) || !modes.has(transition.from_mode) || !modes.has(transition.to_mode) || transition.from_mode === transition.to_mode || transition.final_step !== true || !sealed(transition.post_transition_state_binding) || !sealed(input.trusted_transition_artifact) || transition.p19_artifact_digest !== input.trusted_transition_artifact.canonical_digest || !same(transition.next_owner_ref, input.next_owner_ref) || !same(input.expected_persisted_state, transition.post_transition_state_binding) || input.expected_persisted_state.mode !== transition.to_mode || !same(input.expected_persisted_state.next_owner_ref, input.next_owner_ref) || !same(input.expected_persisted_state.handoff_endpoint_snapshot, input.handoff_endpoint_snapshot) || input.expected_persisted_state.location !== input.handoff_endpoint_snapshot.endpoint_ref?.endpoint_id || (transition.to_mode === 'root_authoritative' && (input.next_owner_ref.entity_kind !== 'carrier' || input.expected_persisted_state.carrier_attachment !== 'attached')) || (transition.to_mode === 'attached' && input.next_owner_ref.entity_kind !== 'actor')) return fail('journey_handoff_snapshot_invalid', input?.party_id, { stage: 'handoff_input' });
      const trusted = await verifyTransitionArtifact(freeze({ party_id: input.party_id, execution_id: input.execution_id, mode_transition: clone(transition), artifact: clone(input.trusted_transition_artifact) }));
      if (!trusted?.ok || !sealed(trusted.artifact) || !same(trusted.artifact, input.trusted_transition_artifact) || trusted.artifact.contract_kind !== 'p19_mode_transition_result' || trusted.artifact.capability !== 'trusted_p19_transition') return fail('mode_transition_contract_missing', input.party_id, { stage: 'verify_transition_artifact' });
      if (handoffAtomically) return atomicHandoff(input);
      return compensatingHandoff(input);
    }
  });
  async function atomicHandoff(input) {
    const atomic = await handoffAtomically(freeze(clone(input)));
    if (!atomic?.ok || atomic.execution_status !== 'superseded' || !sealed(atomic.handoff_endpoint_snapshot) || atomic.handoff_endpoint_snapshot.canonical_digest !== input.handoff_endpoint_snapshot.canonical_digest || !sealed(atomic.persisted_state) || !same(atomic.persisted_state, input.expected_persisted_state) || !sealed(atomic.successor_plan) || atomic.successor_plan.predecessor_execution_id !== input.execution_id || atomic.successor_plan.source_endpoint_snapshot?.canonical_digest !== input.handoff_endpoint_snapshot.canonical_digest || !same(atomic.successor_plan.journey_owner_ref, input.next_owner_ref)) return fail('journey_handoff_snapshot_invalid', input.party_id, { stage: 'atomic_handoff' });
    return freeze({ ok: true, ended_execution_id: input.execution_id, handoff_endpoint_snapshot: clone(atomic.handoff_endpoint_snapshot), successor_plan: clone(atomic.successor_plan) });
  }
  async function compensatingHandoff(input) {
    const ended = await endPlan(freeze(clone(input)));
    if (!ended?.ok || !sealed(ended.handoff_endpoint_snapshot) || ended.handoff_endpoint_snapshot.canonical_digest !== input.handoff_endpoint_snapshot.canonical_digest || ended.execution_status !== 'superseded' || !sealed(ended.persisted_state) || !same(ended.persisted_state, input.expected_persisted_state)) return fail('journey_handoff_snapshot_invalid', input.party_id, { stage: 'end_plan' });
    const successor = await createSuccessorPlan(freeze({ party_id: input.party_id, predecessor_execution_id: input.execution_id, source_endpoint_snapshot: clone(ended.handoff_endpoint_snapshot), next_owner_ref: clone(input.next_owner_ref) }));
    if (!successor?.ok || !sealed(successor.plan) || successor.plan.predecessor_execution_id !== input.execution_id || successor.plan.source_endpoint_snapshot?.canonical_digest !== ended.handoff_endpoint_snapshot.canonical_digest || !same(successor.plan.journey_owner_ref, input.next_owner_ref)) {
      const rollback = await rollbackEndedPlan(freeze({ party_id: input.party_id, execution_id: input.execution_id, handoff_endpoint_snapshot: clone(ended.handoff_endpoint_snapshot), expected_persisted_state: clone(input.expected_persisted_state) }));
      if (!rollback?.ok || rollback.execution_status === 'superseded') return fail('journey_handoff_snapshot_invalid', input.party_id, { stage: 'handoff_rollback' });
      return fail('journey_handoff_snapshot_invalid', input.party_id, { stage: 'create_successor', rollback: 'applied' });
    }
    return freeze({ ok: true, ended_execution_id: input.execution_id, handoff_endpoint_snapshot: clone(ended.handoff_endpoint_snapshot), successor_plan: clone(successor.plan) });
  }
}
