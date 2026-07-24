-- Temporal World v4 approved authoring data. These tables preserve the
-- auditor-approved rows and their exact source/provenance bindings without
-- projecting authoring payloads into party runtime state.
CREATE TABLE IF NOT EXISTS world_base.temporal_source_history (
  source_id text PRIMARY KEY,
  family_id text NOT NULL,
  status text NOT NULL CHECK (status = 'approved'),
  source_path text NOT NULL UNIQUE,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_base.temporal_provenance (
  provenance_id text PRIMARY KEY,
  family_id text NOT NULL,
  status text NOT NULL CHECK (status = 'approved'),
  source_ids text[] NOT NULL CHECK (cardinality(source_ids) > 0),
  approval jsonb NOT NULL CHECK (jsonb_typeof(approval) = 'object'),
  canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_base.temporal_authoring_records (
  record_id text PRIMARY KEY,
  family_id text NOT NULL,
  record_kind text NOT NULL,
  record_version text NOT NULL CHECK (record_version ~ '^[1-9][0-9]*$'),
  applicability text[] NOT NULL CHECK (cardinality(applicability) > 0),
  status text NOT NULL CHECK (status = 'approved'),
  provenance_refs text[] NOT NULL CHECK (cardinality(provenance_refs) > 0),
  normalized_reference_ids text[] NOT NULL CHECK (cardinality(normalized_reference_ids) > 0),
  source_history_refs text[] NOT NULL CHECK (cardinality(source_history_refs) > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_base.temporal_normalized_references (
  reference_id text PRIMARY KEY,
  family_id text NOT NULL,
  status text NOT NULL CHECK (status = 'approved'),
  source_record_id text NOT NULL
    REFERENCES world_base.temporal_authoring_records(record_id) ON DELETE RESTRICT,
  target_table text NOT NULL CHECK (target_table = 'temporal_authoring_records'),
  target_record_id text NOT NULL
    REFERENCES world_base.temporal_authoring_records(record_id) ON DELETE RESTRICT,
  binding jsonb NOT NULL CHECK (jsonb_typeof(binding) = 'object'),
  canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_record_id = target_record_id)
);

CREATE OR REPLACE FUNCTION world_base.temporal_approved_row_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Temporal v4 approved authoring rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS temporal_source_history_immutable ON world_base.temporal_source_history;
CREATE TRIGGER temporal_source_history_immutable
BEFORE UPDATE OR DELETE ON world_base.temporal_source_history
FOR EACH ROW EXECUTE FUNCTION world_base.temporal_approved_row_immutable();

DROP TRIGGER IF EXISTS temporal_provenance_immutable ON world_base.temporal_provenance;
CREATE TRIGGER temporal_provenance_immutable
BEFORE UPDATE OR DELETE ON world_base.temporal_provenance
FOR EACH ROW EXECUTE FUNCTION world_base.temporal_approved_row_immutable();

DROP TRIGGER IF EXISTS temporal_authoring_records_immutable ON world_base.temporal_authoring_records;
CREATE TRIGGER temporal_authoring_records_immutable
BEFORE UPDATE OR DELETE ON world_base.temporal_authoring_records
FOR EACH ROW EXECUTE FUNCTION world_base.temporal_approved_row_immutable();

DROP TRIGGER IF EXISTS temporal_normalized_references_immutable ON world_base.temporal_normalized_references;
CREATE TRIGGER temporal_normalized_references_immutable
BEFORE UPDATE OR DELETE ON world_base.temporal_normalized_references
FOR EACH ROW EXECUTE FUNCTION world_base.temporal_approved_row_immutable();

GRANT SELECT ON
  world_base.temporal_source_history,
  world_base.temporal_provenance,
  world_base.temporal_authoring_records,
  world_base.temporal_normalized_references
TO world_reader;
