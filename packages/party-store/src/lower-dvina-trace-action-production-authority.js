import { sha256 } from '@rus/kernel';

export async function readLowerDvinaTraceActionProductionAuthorities({
  query, partyId
}) {
  return (await query(
    `SELECT party_id,actor_ref,context_ref,profile_ref,profile_version,
            policy_ref,policy_version::int,max_new_entities::int,
            allowed_access_states,allowed_identity_modes,allowed_origins,
            allowed_result_classes,authority_state_version::int,status,
            authority_digest
       FROM party_runtime.party_action_production_authorities
      WHERE party_id=$1`,
    [partyId]
  )).rows;
}

export function lowerDvinaTraceActionProductionAuthorityMatches(
  persistedRows, snapshotAuthority
) {
  return snapshotAuthority == null
    ? persistedRows.length === 0
    : persistedRows.length === 1
      && sha256(persistedRows[0]) === sha256(snapshotAuthority);
}

export function lowerDvinaTraceActionProductionAuthorityField(authority) {
  return authority == null ? {} : {
    action_production_authority: structuredClone(authority)
  };
}
export { readLowerDvinaTraceActionProductionAuthorities as read,
  lowerDvinaTraceActionProductionAuthorityField as field,
  lowerDvinaTraceActionProductionAuthorityMatches as matches };
