export const PHASE_1A_TABLES = Object.freeze([
  'parties',
  'party_catalog_pins',
  'party_v3_change_sets',
  'party_materialization_runs',
  'party_materialization_run_catalog_pins',
  'party_materialization_choices',
  'party_g5_nodes',
  'party_g5_anchors',
  'party_positions',
  'party_player_characters',
  'party_npcs',
  'party_actor_profile_bindings',
  'party_actor_body_states',
  'party_actor_active_conditions',
  'party_items',
  'party_containers',
  'party_item_placements',
  'party_ownership',
  'party_obligations',
  'party_obligation_transitions',
  'party_clocks',
  'party_state_snapshots',
  'party_g5_sites',
  'party_scene_baselines',
  'party_g6_instances',
  'scene_position_nodes',
  'party_journey_locations',
  'preparation_snapshots',
  'preparation_snapshot_members',
  'party_route_plans',
  'party_route_plan_steps',
  'party_route_plan_executions',
  'party_route_plan_execution_events',
  'preparation_claims'
]);

export async function loadPhase1ASchemaMetadata(partyPool) {
  const [
    columns,
    foreignKeys,
    uniqueConstraints,
    checkConstraints,
    enumDefinitions,
    indexes
  ] = await Promise.all([
    partyPool.query(
      `SELECT table_name,column_name,data_type,is_nullable,column_default
         FROM information_schema.columns
        WHERE table_schema='party_runtime'
          AND table_name=ANY($1::text[])
        ORDER BY table_name,ordinal_position`,
      [PHASE_1A_TABLES]
    ),
    partyPool.query(
      `SELECT con.conname AS name,
              rel.relname AS table_name,
              array_agg(att.attname::text ORDER BY cols.ordinality)
                AS columns,
              frel.relname AS referenced_table_name,
              array_agg(fatt.attname::text ORDER BY cols.ordinality)
                AS referenced_columns,
              con.confdeltype AS on_delete_code,
              con.confupdtype AS on_update_code
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid=con.conrelid
         JOIN pg_namespace ns ON ns.oid=rel.relnamespace
         JOIN pg_class frel ON frel.oid=con.confrelid
         JOIN LATERAL unnest(con.conkey) WITH ORDINALITY
              AS cols(attnum,ordinality) ON true
         JOIN pg_attribute att
           ON att.attrelid=rel.oid AND att.attnum=cols.attnum
         JOIN LATERAL unnest(con.confkey) WITH ORDINALITY
              AS fcols(attnum,ordinality)
           ON fcols.ordinality=cols.ordinality
         JOIN pg_attribute fatt
           ON fatt.attrelid=frel.oid AND fatt.attnum=fcols.attnum
        WHERE ns.nspname='party_runtime'
          AND rel.relname=ANY($1::text[])
          AND con.contype='f'
        GROUP BY con.conname,rel.relname,frel.relname,
                 con.confdeltype,con.confupdtype
        ORDER BY rel.relname,con.conname`,
      [PHASE_1A_TABLES]
    ),
    partyPool.query(
      `SELECT con.conname AS name,
              rel.relname AS table_name,
              array_agg(att.attname::text ORDER BY cols.ordinality)
                AS columns,
              con.contype AS constraint_type
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid=con.conrelid
         JOIN pg_namespace ns ON ns.oid=rel.relnamespace
         JOIN LATERAL unnest(con.conkey) WITH ORDINALITY
              AS cols(attnum,ordinality) ON true
         JOIN pg_attribute att
           ON att.attrelid=rel.oid AND att.attnum=cols.attnum
        WHERE ns.nspname='party_runtime'
          AND rel.relname=ANY($1::text[])
          AND con.contype IN ('p','u')
        GROUP BY con.conname,rel.relname,con.contype
        ORDER BY rel.relname,con.conname`,
      [PHASE_1A_TABLES]
    ),
    partyPool.query(
      `SELECT con.conname AS name,
              rel.relname AS table_name,
              array_remove(
                array_agg(att.attname::text ORDER BY cols.ordinality),
                NULL
              ) AS columns,
              pg_get_constraintdef(con.oid,true) AS definition
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid=con.conrelid
         JOIN pg_namespace ns ON ns.oid=rel.relnamespace
         LEFT JOIN LATERAL unnest(con.conkey) WITH ORDINALITY
              AS cols(attnum,ordinality) ON true
         LEFT JOIN pg_attribute att
           ON att.attrelid=rel.oid AND att.attnum=cols.attnum
        WHERE ns.nspname='party_runtime'
          AND rel.relname=ANY($1::text[])
          AND con.contype='c'
        GROUP BY con.oid,con.conname,rel.relname
        ORDER BY rel.relname,con.conname`,
      [PHASE_1A_TABLES]
    ),
    partyPool.query(
      `SELECT typ.typname AS enum_name,
              array_agg(en.enumlabel ORDER BY en.enumsortorder) AS values
         FROM pg_type typ
         JOIN pg_namespace ns ON ns.oid=typ.typnamespace
         JOIN pg_enum en ON en.enumtypid=typ.oid
        WHERE ns.nspname='party_runtime'
        GROUP BY typ.typname
        ORDER BY typ.typname`
    ),
    partyPool.query(
      `SELECT tablename AS table_name,indexname AS name,
              indexdef AS definition
         FROM pg_indexes
        WHERE schemaname='party_runtime'
          AND tablename=ANY($1::text[])
        ORDER BY tablename,indexname`,
      [PHASE_1A_TABLES]
    )
  ]);
  return {
    columns: columns.rows,
    foreignKeys: foreignKeys.rows,
    uniqueConstraints: uniqueConstraints.rows,
    checkConstraints: checkConstraints.rows,
    enumDefinitions: enumDefinitions.rows,
    indexes: indexes.rows
  };
}

export function mandatorySchemaContracts({
  foreignKeys,
  uniqueConstraints,
  checkConstraints,
  indexes
}) {
  return {
    snapshot_party_fk: foreignKeys.some((constraint) =>
      constraint.table === 'party_state_snapshots'
      && constraint.columns.length === 1
      && constraint.columns[0] === 'party_id'
      && constraint.referenced_table === 'parties'
      && constraint.referenced_columns.length === 1
      && constraint.referenced_columns[0] === 'party_id'),
    snapshot_party_unique: uniqueConstraints.some((constraint) =>
      constraint.table === 'party_state_snapshots'
        && constraint.columns.length === 2
        && constraint.columns[0] === 'party_id'
        && constraint.columns[1] === 'state_version'),
    parties_schema_version_check: checkConstraints.some((constraint) =>
      constraint.table === 'parties'
        && constraint.name === 'parties_schema_version_check'
        && constraint.columns.includes('schema_version')
        && /\b2\b/u.test(constraint.definition)
        && /\b3\b/u.test(constraint.definition)),
    snapshot_party_index: indexes.some((index) =>
      index.table === 'party_state_snapshots'
        && /party_id/u.test(index.definition))
  };
}
