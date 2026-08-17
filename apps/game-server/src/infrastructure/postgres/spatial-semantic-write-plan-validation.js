import { canonicalDigest } from '@rus/materialization';
import { createSpatialSemanticAtomicWritePlan, spatialSemanticPhysicalKeys,
  spatialSemanticTraceActionRef } from
  './spatial-semantic-atomic-write-plan.js';

export function validSpatialSemanticExtension(plan) {
  const spatial = plan.spatial_semantic_atomic_write_plan;
  if (spatial == null) return true;
  try {
    const sealed = createSpatialSemanticAtomicWritePlan(spatial);
    const party = plan.updates?.find((write) =>
      write.target_table === 'parties' && write.id === plan.party_id);
    const causal = sealed.causal_identity;
    const trace = plan.semantic_command_snapshot?.semantic_trace
      ?.step_traces?.[causal.step_index - 1];
    const operation = spatialOperation(trace?.approved_plan);
    return sealed.party_id === plan.party_id
      && sealed.change_set_id === plan.change_set_id
      && plan.operation_kind === 'trace_turn_step'
      && causal.request_id === trace?.approved_plan?.request_id
      && causal.root_turn_id === plan.visible_package_envelope?.turn_id
      && plan.owner_keys.includes(`actor:${causal.actor_ref}`)
      && trace?.step_index === causal.step_index
      && operation?.actor_ref === causal.actor_ref
      && operation.discovery_kind === 'look'
      && operation.target_refs.length === 1
      && operation.target_refs[0]
        === sealed.resolution.reservation.envelope.position_ref
      && causal.operation_digest
        === `sha256:${canonicalDigest(operation)}`
      && causal.action_ref === spatialSemanticTraceActionRef({
        rootTurnId: causal.root_turn_id, stepIndex: causal.step_index,
        approvedPlan: trace.approved_plan })
      && party?.record?.party_id === plan.party_id
      && plan.expected_state_versions.some((version) =>
        version.target_table === 'parties' && version.id === plan.party_id
          && version.state_version === sealed.base_party_state_version)
      && spatialSemanticPhysicalKeys(sealed).every((key) =>
        plan.physical_keys.includes(key));
  } catch { return false; }
}

function spatialOperation(approvedPlan) {
  const operations = approvedPlan?.operations;
  if (!Array.isArray(operations)) return null;
  const matches = operations.filter(({ op }) => op === 'request_discovery');
  return matches.length === 1 ? matches[0] : null;
}
