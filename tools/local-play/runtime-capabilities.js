export const PROCEDURAL_FINAL_PACK_REBUILD_REQUIRED =
  'PROCEDURAL_FINAL_PACK_REBUILD_REBIND_APPROVAL_IMPORT_READBACK_REQUIRED';

export const LOCAL_PLAY_RUNTIME_CAPABILITIES_V1 = Object.freeze({
  schema: 'rus.local_play_runtime_capabilities.v1',
  runtime_level: 'm2',
  capabilities: Object.freeze({
    m2_runtime: Object.freeze({ status: 'available' }),
    m3_procedural_equipment: Object.freeze({
      status: 'blocked_data_gap',
      code: PROCEDURAL_FINAL_PACK_REBUILD_REQUIRED,
      required_owner_work: Object.freeze([
        'rebuild_and_rebind_final_procedural_pack_against_reconciled_parent',
        'independent_approval',
        'transactional_import_and_exact_readback'
      ])
    })
  })
});

export function requireLocalPlayRuntimeCapability(capabilityId,
  status = LOCAL_PLAY_RUNTIME_CAPABILITIES_V1) {
  if (status?.schema !== LOCAL_PLAY_RUNTIME_CAPABILITIES_V1.schema) {
    throw Object.assign(new Error('Runtime capability contract is invalid.'), {
      code: 'LOCAL_PLAY_CAPABILITY_CONTRACT_INVALID'
    });
  }
  const capability = status.capabilities?.[capabilityId];
  if (!capability) {
    throw Object.assign(new Error(`Unknown runtime capability: ${capabilityId}`), {
      code: 'LOCAL_PLAY_CAPABILITY_UNKNOWN'
    });
  }
  if (capability.status !== 'available') {
    throw Object.assign(new Error(
      `Runtime capability is unavailable: ${capabilityId}`
    ), { code: capability.code, details: capability });
  }
  return capability;
}
