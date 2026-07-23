CREATE TABLE party_runtime.schema_migrations (
  migration_id TEXT PRIMARY KEY,
  migration_digest TEXT NOT NULL CHECK (migration_digest ~ '^[a-f0-9]{64}$'),
  source_schema_fingerprint TEXT NOT NULL CHECK (source_schema_fingerprint ~ '^[a-f0-9]{64}$'),
  target_schema_fingerprint TEXT NOT NULL CHECK (target_schema_fingerprint ~ '^[a-f0-9]{64}$'),
  applied_by TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION party_runtime.reject_runtime_catalog_pin_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TABLE party_runtime.party_catalog_pins (
  party_id TEXT NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE RESTRICT,
  catalog_scope TEXT NOT NULL
    CHECK (catalog_scope = 'item_container_materialization_v2'),
  catalog_revision_id TEXT NOT NULL,
  catalog_digest TEXT NOT NULL CHECK (catalog_digest ~ '^[a-f0-9]{64}$'),
  import_id TEXT NOT NULL,
  import_audit_digest TEXT NOT NULL CHECK (import_audit_digest ~ '^[a-f0-9]{64}$'),
  record_registry_digest TEXT NOT NULL CHECK (record_registry_digest ~ '^[a-f0-9]{64}$'),
  runtime_contract_digest TEXT NOT NULL CHECK (runtime_contract_digest ~ '^[a-f0-9]{64}$'),
  compatible_world_revision_id TEXT NOT NULL,
  compatible_world_catalog_digest TEXT NOT NULL
    CHECK (compatible_world_catalog_digest ~ '^[a-f0-9]{64}$'),
  compatible_world_pin_manifest_digest TEXT NOT NULL
    CHECK (compatible_world_pin_manifest_digest ~ '^[a-f0-9]{64}$'),
  activation_event_id TEXT NOT NULL,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, catalog_scope)
);

CREATE TABLE party_runtime.party_materialization_run_catalog_pins (
  party_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  catalog_scope TEXT NOT NULL
    CHECK (catalog_scope = 'item_container_materialization_v2'),
  catalog_revision_id TEXT NOT NULL,
  catalog_digest TEXT NOT NULL CHECK (catalog_digest ~ '^[a-f0-9]{64}$'),
  import_id TEXT NOT NULL,
  import_audit_digest TEXT NOT NULL CHECK (import_audit_digest ~ '^[a-f0-9]{64}$'),
  record_registry_digest TEXT NOT NULL CHECK (record_registry_digest ~ '^[a-f0-9]{64}$'),
  runtime_contract_digest TEXT NOT NULL CHECK (runtime_contract_digest ~ '^[a-f0-9]{64}$'),
  activation_event_id TEXT NOT NULL,
  PRIMARY KEY (party_id, run_id, catalog_scope),
  FOREIGN KEY (party_id, run_id)
    REFERENCES party_runtime.party_materialization_runs(party_id, run_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, catalog_scope)
    REFERENCES party_runtime.party_catalog_pins(party_id, catalog_scope) ON DELETE RESTRICT
);

CREATE INDEX party_materialization_run_catalog_pin_lookup
  ON party_runtime.party_materialization_run_catalog_pins
    (party_id, catalog_scope, catalog_revision_id);

CREATE TRIGGER schema_migrations_append_only
BEFORE UPDATE OR DELETE ON party_runtime.schema_migrations
FOR EACH ROW EXECUTE FUNCTION party_runtime.reject_runtime_catalog_pin_mutation();
CREATE TRIGGER party_catalog_pins_immutable
BEFORE UPDATE OR DELETE ON party_runtime.party_catalog_pins
FOR EACH ROW EXECUTE FUNCTION party_runtime.reject_runtime_catalog_pin_mutation();
CREATE TRIGGER party_materialization_run_catalog_pins_immutable
BEFORE UPDATE OR DELETE ON party_runtime.party_materialization_run_catalog_pins
FOR EACH ROW EXECUTE FUNCTION party_runtime.reject_runtime_catalog_pin_mutation();

REVOKE UPDATE, DELETE, TRUNCATE
  ON party_runtime.schema_migrations,
     party_runtime.party_catalog_pins,
     party_runtime.party_materialization_run_catalog_pins
  FROM PUBLIC;
