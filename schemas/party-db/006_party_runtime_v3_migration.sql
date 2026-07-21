-- P24 append-only evidence.  This table is target-only and does not read or
-- alter active v2 composition before P28.
CREATE TABLE IF NOT EXISTS party_runtime.spatial_v3_migration_coverage_artifacts (
  artifact_id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE RESTRICT,
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
  UNIQUE (party_id, source_digest, target_digest)
);

CREATE OR REPLACE FUNCTION party_runtime.spatial_v3_migration_coverage_artifact_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'spatial_v3_migration_coverage_artifacts are append-only';
END;
$$;

DROP TRIGGER IF EXISTS spatial_v3_migration_coverage_artifact_immutable ON party_runtime.spatial_v3_migration_coverage_artifacts;
CREATE TRIGGER spatial_v3_migration_coverage_artifact_immutable
BEFORE UPDATE OR DELETE ON party_runtime.spatial_v3_migration_coverage_artifacts
FOR EACH ROW EXECUTE FUNCTION party_runtime.spatial_v3_migration_coverage_artifact_immutable();
