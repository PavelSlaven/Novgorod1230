-- P24 append-only world migration evidence.  The source snapshot is retained
-- with its exact row digests so a future activation audit need not trust an
-- aggregate count.
CREATE TABLE IF NOT EXISTS world_base.spatial_v3_migration_coverage_artifacts (
  artifact_id text PRIMARY KEY,
  party_id text,
  world_revision_id text,
  source_scope text NOT NULL,
  source_digest text NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  source_record_count integer NOT NULL CHECK (source_record_count >= 0),
  inventory_digest text NOT NULL CHECK (inventory_digest ~ '^[a-f0-9]{64}$'),
  inventory_target_digest text NOT NULL CHECK (inventory_target_digest ~ '^[a-f0-9]{64}$'),
  target_digest text NOT NULL CHECK (target_digest ~ '^[a-f0-9]{64}$'),
  acceptance_ok boolean NOT NULL,
  error_codes jsonb NOT NULL,
  source_snapshot jsonb NOT NULL,
  canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_scope, source_digest, target_digest)
);

CREATE OR REPLACE FUNCTION world_base.spatial_v3_migration_coverage_artifact_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'spatial_v3_migration_coverage_artifacts are append-only';
END;
$$;

DROP TRIGGER IF EXISTS spatial_v3_migration_coverage_artifact_immutable ON world_base.spatial_v3_migration_coverage_artifacts;
CREATE TRIGGER spatial_v3_migration_coverage_artifact_immutable
BEFORE UPDATE OR DELETE ON world_base.spatial_v3_migration_coverage_artifacts
FOR EACH ROW EXECUTE FUNCTION world_base.spatial_v3_migration_coverage_artifact_immutable();
