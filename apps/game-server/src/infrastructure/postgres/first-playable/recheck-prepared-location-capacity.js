export async function recheckTracePhase3PreparedLocationCapacity({
  transaction,
  check
}) {
  if (!nonEmpty(check.preparation_snapshot_id)
      || !Number.isInteger(check.preparation_member_ordinal)
      || !nonEmpty(check.preparation_claim_id)
      || !Number.isInteger(check.max_actors) || check.max_actors < 1
      || !Array.isArray(check.expected_present_npcs)
      || check.expected_present_npcs.length + 1 > check.max_actors) {
    return resultOf(false);
  }
  const result = await transaction.query(
    `SELECT 1
       FROM party_runtime.preparation_snapshot_members m
       JOIN party_runtime.preparation_claims c
         ON c.preparation_snapshot_id=m.preparation_snapshot_id
        AND c.preparation_member_ordinal=m.ordinal
      WHERE m.preparation_snapshot_id=$1 AND m.ordinal=$2 AND c.id=$3
        AND c.claim_status='reserved' FOR UPDATE`,
    [check.preparation_snapshot_id, check.preparation_member_ordinal,
      check.preparation_claim_id]
  );
  return resultOf(result.rowCount === 1);
}

const nonEmpty = (value) => typeof value === 'string' && value.length > 0;
const resultOf = (ok) => Object.freeze({
  ok,
  code: ok ? 'state_version_conflict' : 'relation_capacity_undefined'
});
