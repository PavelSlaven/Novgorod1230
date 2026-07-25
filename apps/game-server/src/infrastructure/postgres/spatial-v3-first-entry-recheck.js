const FIRST_ENTRY_BINDING_FIELDS = Object.freeze([
  'baseline_disposition',
  'g4_id',
  'preparation_snapshot_id',
  'preparation_member_ordinal',
  'preparation_snapshot_digest',
  'preparation_member_digest',
  'route_plan_id',
  'route_plan_digest',
  'route_plan_execution_id',
  'preparation_claim_id',
  'scene_baseline_id',
  'g5_site_id',
  'g6_instance_id',
  'position_id'
]);

const failed = (code = 'target_preparation_failed') => Object.freeze({ ok: false, code });
const evidence = (check) => Object.freeze(Object.fromEntries(
  FIRST_ENTRY_BINDING_FIELDS.map((field) => [field, check[field]])
));

/**
 * Rechecks the complete sealed first-entry preparation chain inside the owning
 * transaction, after the committer acquired its G4 advisory lock.
 */
export async function recheckSpatialV3PostgresFirstEntry({
  transaction,
  party_id,
  check,
  plan
} = {}) {
  if (!transaction?.query
    || plan?.operation_kind !== 'first_entry'
    || check?.kind !== 'physical') {
    return failed('generated_schema_mismatch');
  }

  const preparation = await transaction.query(
    `SELECT s.canonical_digest AS preparation_snapshot_digest,
            m.member_digest AS preparation_member_digest,
            m.prepared_scene_materialization,
            p.canonical_serialization_digest AS route_plan_digest
       FROM party_runtime.preparation_snapshots s
       JOIN party_runtime.preparation_snapshot_members m
         ON m.preparation_snapshot_id=s.id AND m.ordinal=$2
       JOIN party_runtime.party_route_plans p
         ON p.id=$3 AND p.party_id=$6
        AND p.preparation_snapshot_id=s.id
        AND p.preparation_snapshot_digest=s.canonical_digest
       JOIN party_runtime.party_route_plan_executions e
         ON e.id=$4 AND e.party_id=$6 AND e.route_plan_id=p.id
       JOIN party_runtime.preparation_claims c
         ON c.id=$5 AND c.preparation_snapshot_id=s.id
        AND c.preparation_member_ordinal=m.ordinal
        AND c.route_plan_execution_id=e.id
      WHERE s.id=$1 AND s.party_id=$6 AND c.claim_status='reserved'`,
    [
      check.preparation_snapshot_id,
      check.preparation_member_ordinal,
      check.route_plan_id,
      check.route_plan_execution_id,
      check.preparation_claim_id,
      party_id
    ]
  );
  if (preparation.rows.length !== 1) return failed();
  const [row] = preparation.rows;
  if (row.preparation_snapshot_digest !== check.preparation_snapshot_digest
    || row.preparation_member_digest !== check.preparation_member_digest
    || row.route_plan_digest !== check.route_plan_digest) {
    return failed();
  }

  const prepared = row.prepared_scene_materialization;
  if (check.baseline_disposition === 'create') {
    if (prepared?.g4_id !== check.g4_id
      || prepared?.g5_site_id !== check.g5_site_id
      || prepared?.scene_baseline_id !== check.scene_baseline_id
      || prepared?.g6_instance_id !== check.g6_instance_id
      || prepared?.position_id !== check.position_id) {
      return failed();
    }
    const existing = await transaction.query(
      `SELECT
         EXISTS(
           SELECT 1 FROM party_runtime.party_g5_sites
            WHERE id=$1 OR (party_id=$5 AND id=$1)
         ) AS g5_exists,
         EXISTS(
           SELECT 1 FROM party_runtime.party_scene_baselines
            WHERE id=$2 OR (party_id=$5 AND id=$2)
         ) AS baseline_exists,
         EXISTS(
           SELECT 1 FROM party_runtime.party_g6_instances
            WHERE id=$3 OR (party_id=$5 AND id=$3)
         ) AS g6_exists,
         EXISTS(
           SELECT 1 FROM party_runtime.scene_position_nodes
            WHERE id=$4 OR (party_id=$5 AND id=$4)
         ) AS position_exists`,
      [
        check.g5_site_id,
        check.scene_baseline_id,
        check.g6_instance_id,
        check.position_id,
        party_id
      ]
    );
    if (Object.values(existing.rows[0]).some(Boolean)) {
      return failed('state_version_conflict');
    }
  } else if (check.baseline_disposition === 'reuse') {
    const reusable = await transaction.query(
      `SELECT b.id
         FROM party_runtime.party_scene_baselines b
         JOIN party_runtime.party_g5_sites s
           ON s.id=b.host_id AND s.party_id=b.party_id
          AND s.parent_g4_id=$2 AND s.status='active'
         JOIN party_runtime.party_g6_instances g
           ON g.id=$3 AND g.party_id=b.party_id
          AND g.scene_baseline_id=b.id AND g.status='active'
         JOIN party_runtime.scene_position_nodes p
           ON p.id=$4 AND p.party_id=b.party_id
          AND p.g6_instance_id=g.id AND p.status='active'
        WHERE b.id=$1 AND b.party_id=$5 AND b.host_kind='g5_site'
          AND b.host_id=$6 AND b.status='active'`,
      [
        check.scene_baseline_id,
        check.g4_id,
        check.g6_instance_id,
        check.position_id,
        party_id,
        check.g5_site_id
      ]
    );
    if (reusable.rows.length !== 1) return failed();
  } else {
    return failed('generated_schema_mismatch');
  }

  return Object.freeze({
    ok: true,
    first_entry_binding: evidence(check)
  });
}
