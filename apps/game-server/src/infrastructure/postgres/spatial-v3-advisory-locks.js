export async function lockSpatialV3WritePlan(tx, locks) {
  await tx.query(`WITH ordered_locks AS MATERIALIZED (
      SELECT lock_key
        FROM unnest($1::text[]) AS lock_key
       ORDER BY lock_key
    )
    SELECT pg_advisory_xact_lock(hashtextextended(lock_key, 0))
      FROM ordered_locks`, [locks]);
}
