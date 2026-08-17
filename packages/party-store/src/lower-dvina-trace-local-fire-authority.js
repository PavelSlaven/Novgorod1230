export async function readLowerDvinaTraceLocalFireAuthorities({query,partyId}) {
  try {
    return (await query(`SELECT party_id,context_ref,profile_ref,profile_version,
      policy_ref,policy_version::int,scope_ref,ignition_basis_item_id,
      approved_fuel_item_ids,recheck_interval,fuel_unit_mass_grams_min,
      fuel_unit_mass_grams_max,authority_state_version::int,authority_digest,status
      FROM party_runtime.party_local_fire_authorities WHERE party_id=$1
      ORDER BY context_ref`,[partyId])).rows;
  } catch (cause) {
    if (cause?.code === '42P01') return [];
    throw cause;
  }
}
export function lowerDvinaTraceLocalFireAuthorityField(value) {
  return value == null ? {} : {local_fire_authority:structuredClone(value)};
}
export function lowerDvinaTraceLocalFireAuthorityMatches(rows, expected) {
  if (expected == null) return rows.length===0;
  return rows.length===1 && Object.keys(expected).every((key)=>
    JSON.stringify(rows[0][key])===JSON.stringify(expected[key]));
}
export { readLowerDvinaTraceLocalFireAuthorities as read,
  lowerDvinaTraceLocalFireAuthorityField as field,
  lowerDvinaTraceLocalFireAuthorityMatches as matches };
