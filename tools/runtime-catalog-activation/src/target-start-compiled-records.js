import { createHash } from 'node:crypto';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';

/** Authoring compilation only. Existing catalog operators own import/activation. */
export function buildTargetStartCompiledRecords({ candidateBytes, approval } = {}) {
  const sha256 = typeof candidateBytes === 'string'
    ? createHash('sha256').update(candidateBytes).digest('hex') : null;
  if (!sha256 || approval?.schema !== 'rus.m2c_supplemental_data_approval.v1'
    || approval.decision !== 'APPROVE_DATA_ONLY'
    || approval.target_start_proposal_approval?.candidate_sha256 !== sha256) {
    throw new TypeError('Exact independently approved target start bytes are required.');
  }
  const candidate = JSON.parse(candidateBytes);
  const { status: _status, ...rule } = candidate.initial_perception_rule ?? {};
  const placement = candidate.initial_placement;
  if (candidate.schema !== 'rus.live_world_runtime.target_start_authoring_candidate.v1'
    || !rule.id || !Number.isSafeInteger(rule.version) || rule.version < 1
    || rule.scope !== 'exact_canonical_initial_scene_only'
    || rule.source_binding_kind !== 'approved_canonical_initial_endpoint'
    || rule.placement_cause !== 'authored_initial_state'
    || rule.world_revision_id !== candidate.world_pin?.world_revision_id
    || digest(rule.canonical_g5_ref) !== digest(placement?.canonical_g5_ref)
    || digest(rule.g4_ref) !== digest(placement?.g4_ref)
    || rule.scene_template_ref?.id !== placement?.scene_template_ref?.id
    || rule.scene_template_ref?.version !== placement?.scene_template_ref?.version
    || rule.source_endpoint_slot_key !== placement?.scene_endpoint_slot_key
    || !/^[a-f0-9]{64}$/u.test(rule.placement_candidate?.sha256 ?? '')) {
    throw new TypeError('Exact canonical initial source rule is required.');
  }
  const payload = { schema: 'rus.g4_natural_canonical_initial_rule.v1', rule,
    world_pin: structuredClone(candidate.world_pin), scenario_id: candidate.scenario_id,
    initial_environment_inputs: structuredClone(candidate.initial_environment_inputs),
    source_candidate_sha256: sha256,
    placement_candidate_sha256: rule.placement_candidate.sha256 };
  return [{ record_id: `profile:${rule.id}`, version: rule.version,
    record_kind: 'profile', family_candidate_ref: null, payload,
    payload_digest: digest(payload), source_pack_digest: digest(candidate),
    status: 'approved_authoring_not_runtime_selectable' }];
}
function digest(value) {
  return createHash('sha256').update(canonicalStringify(value ?? null)).digest('hex');
}
