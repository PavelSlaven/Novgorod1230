import { exact } from './ordinary-materialization-phase-6-commit-internal.js';

export function exactMaterializedItem(value) {
  const legacy = ['item_id','candidate_key','coverage_key','context_version',
    'functional_bucket','admission_class','supporting_basis_ref',
    'causal_basis_refs','property_basis_ref','position_ref','runtime_placement',
    'mechanics_policy_ref','item_proposal','mechanics_snapshot'];
  const contextBound = [...legacy.slice(0, 8), 'causal_basis_kind',
    'condition_state','permission_refs', ...legacy.slice(8)];
  const finiteCommon = [...legacy.slice(0, 8), 'causal_basis_kind',
    ...legacy.slice(8)];
  const keys = value != null && Object.hasOwn(value, 'permission_refs')
    ? contextBound : value != null && Object.hasOwn(value, 'causal_basis_kind')
      ? finiteCommon : legacy;
  return exact(value, value != null && Object.hasOwn(value,
    'weapon_mechanics_snapshot') ? [...keys.slice(0, -2),
    'weapon_mechanics_snapshot', ...keys.slice(-2)] : keys);
}
