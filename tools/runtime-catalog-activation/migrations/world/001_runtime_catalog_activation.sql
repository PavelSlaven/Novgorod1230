CREATE TABLE world_base.schema_migrations (
  migration_id TEXT PRIMARY KEY,
  migration_digest TEXT NOT NULL CHECK (migration_digest ~ '^[a-f0-9]{64}$'),
  source_schema_fingerprint TEXT NOT NULL CHECK (source_schema_fingerprint ~ '^[a-f0-9]{64}$'),
  target_schema_fingerprint TEXT NOT NULL CHECK (target_schema_fingerprint ~ '^[a-f0-9]{64}$'),
  applied_by TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION world_base.reject_runtime_catalog_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER schema_migrations_append_only
BEFORE UPDATE OR DELETE ON world_base.schema_migrations
FOR EACH ROW EXECUTE FUNCTION world_base.reject_runtime_catalog_ledger_mutation();

CREATE TABLE world_base.catalog_baseline_registrations (
  registration_id TEXT PRIMARY KEY,
  parent_revision_id TEXT NOT NULL UNIQUE
    REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  parent_catalog_digest TEXT NOT NULL CHECK (parent_catalog_digest ~ '^[a-f0-9]{64}$'),
  parent_snapshot_manifest_digest TEXT NOT NULL
    CHECK (parent_snapshot_manifest_digest ~ '^[a-f0-9]{64}$'),
  schema_fingerprint TEXT NOT NULL CHECK (schema_fingerprint ~ '^[a-f0-9]{64}$'),
  record_registry_digest TEXT NOT NULL CHECK (record_registry_digest ~ '^[a-f0-9]{64}$'),
  compatible_world_revision_id TEXT NOT NULL
    REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  compatible_world_catalog_digest TEXT NOT NULL
    CHECK (compatible_world_catalog_digest ~ '^[a-f0-9]{64}$'),
  compatible_world_pin_manifest_digest TEXT NOT NULL
    CHECK (compatible_world_pin_manifest_digest ~ '^[a-f0-9]{64}$'),
  registration_request_digest TEXT NOT NULL UNIQUE
    CHECK (registration_request_digest ~ '^[a-f0-9]{64}$'),
  registration_attestation_digest TEXT NOT NULL UNIQUE
    CHECK (registration_attestation_digest ~ '^[a-f0-9]{64}$'),
  registered_by TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.domain_catalog_revisions (
  catalog_revision_id TEXT PRIMARY KEY
    REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  catalog_scope TEXT NOT NULL
    CHECK (catalog_scope = 'item_container_materialization_v2'),
  parent_registration_id TEXT NOT NULL
    REFERENCES world_base.catalog_baseline_registrations(registration_id) ON DELETE RESTRICT,
  target_catalog_digest TEXT NOT NULL CHECK (target_catalog_digest ~ '^[a-f0-9]{64}$'),
  compatible_world_revision_id TEXT NOT NULL
    REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  compatible_world_catalog_digest TEXT NOT NULL
    CHECK (compatible_world_catalog_digest ~ '^[a-f0-9]{64}$'),
  compatible_world_pin_manifest_digest TEXT NOT NULL
    CHECK (compatible_world_pin_manifest_digest ~ '^[a-f0-9]{64}$'),
  record_registry_digest TEXT NOT NULL CHECK (record_registry_digest ~ '^[a-f0-9]{64}$'),
  runtime_contract_digest TEXT NOT NULL CHECK (runtime_contract_digest ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL CHECK (status = 'approved'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (catalog_scope, catalog_revision_id)
);

ALTER TABLE world_base.catalog_imports
  ADD COLUMN import_id TEXT GENERATED ALWAYS AS (id) STORED,
  ADD COLUMN catalog_scope TEXT,
  ADD COLUMN parent_revision_id TEXT REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN parent_catalog_digest TEXT CHECK (parent_catalog_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN parent_snapshot_manifest_digest TEXT
    CHECK (parent_snapshot_manifest_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN compatible_world_revision_id TEXT
    REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  ADD COLUMN compatible_world_catalog_digest TEXT
    CHECK (compatible_world_catalog_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN compatible_world_pin_manifest_digest TEXT
    CHECK (compatible_world_pin_manifest_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN target_revision_id TEXT GENERATED ALWAYS AS (world_revision_id) STORED,
  ADD COLUMN target_catalog_digest TEXT CHECK (target_catalog_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN record_registry_digest TEXT CHECK (record_registry_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN promotion_manifest_digest TEXT CHECK (promotion_manifest_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN approval_request_digest TEXT CHECK (approval_request_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN approval_attestation_digest TEXT CHECK (approval_attestation_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN schema_migration_digest TEXT CHECK (schema_migration_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN tables_digest TEXT CHECK (tables_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN records_digest TEXT CHECK (records_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN dependency_assertions_semantic_digest TEXT
    CHECK (dependency_assertions_semantic_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN dependency_assertions_audit_digest TEXT
    CHECK (dependency_assertions_audit_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN import_audit_digest TEXT CHECK (import_audit_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN imported_by TEXT,
  ADD CONSTRAINT catalog_imports_runtime_scope
    CHECK (catalog_scope IS NULL OR catalog_scope = 'item_container_materialization_v2'),
  ADD CONSTRAINT catalog_imports_runtime_root_complete
    CHECK (
      catalog_scope IS NULL OR (
        parent_revision_id IS NOT NULL
        AND parent_catalog_digest IS NOT NULL
        AND parent_snapshot_manifest_digest IS NOT NULL
        AND compatible_world_revision_id IS NOT NULL
        AND compatible_world_catalog_digest IS NOT NULL
        AND compatible_world_pin_manifest_digest IS NOT NULL
        AND target_catalog_digest IS NOT NULL
        AND record_registry_digest IS NOT NULL
        AND promotion_manifest_digest IS NOT NULL
        AND approval_request_digest IS NOT NULL
        AND approval_attestation_digest IS NOT NULL
        AND schema_migration_digest IS NOT NULL
        AND tables_digest IS NOT NULL
        AND records_digest IS NOT NULL
        AND dependency_assertions_semantic_digest IS NOT NULL
        AND dependency_assertions_audit_digest IS NOT NULL
        AND import_audit_digest IS NOT NULL
        AND imported_by IS NOT NULL
      )
    ),
  ADD CONSTRAINT catalog_imports_import_id_unique UNIQUE (import_id),
  ADD CONSTRAINT catalog_imports_import_audit_digest_unique UNIQUE (import_audit_digest);

ALTER TABLE world_base.catalog_import_tables
  ADD COLUMN insert_count INTEGER NOT NULL DEFAULT 0 CHECK (insert_count >= 0),
  ADD COLUMN assert_existing_count INTEGER NOT NULL DEFAULT 0 CHECK (assert_existing_count >= 0);

CREATE TABLE world_base.catalog_import_records (
  import_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_key TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK (operation_kind IN ('insert', 'assert_existing')),
  canonical_payload JSONB NOT NULL,
  record_digest TEXT NOT NULL CHECK (record_digest ~ '^[a-f0-9]{64}$'),
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (import_id, table_name, record_key),
  UNIQUE (import_id, table_name, ordinal),
  FOREIGN KEY (import_id, table_name)
    REFERENCES world_base.catalog_import_tables(import_id, table_name)
    ON DELETE RESTRICT
);

CREATE TABLE world_base.catalog_import_dependency_assertions (
  import_id TEXT NOT NULL
    REFERENCES world_base.catalog_imports(import_id) ON DELETE RESTRICT,
  catalog_scope TEXT NOT NULL
    CHECK (catalog_scope = 'item_container_materialization_v2'),
  target_table TEXT NOT NULL CHECK (target_table = 'graph_nodes'),
  record_key TEXT NOT NULL,
  expected_base_canonical_payload JSONB NOT NULL,
  expected_base_record_digest TEXT NOT NULL
    CHECK (expected_base_record_digest ~ '^[a-f0-9]{64}$'),
  asserted_status TEXT NOT NULL CHECK (asserted_status = 'approved'),
  source_transition_semantic_digest TEXT NOT NULL
    CHECK (source_transition_semantic_digest ~ '^[a-f0-9]{64}$'),
  historical_approval_basis_digest TEXT NOT NULL
    CHECK (historical_approval_basis_digest ~ '^[a-f0-9]{64}$'),
  semantic_assertion_digest TEXT NOT NULL
    CHECK (semantic_assertion_digest ~ '^[a-f0-9]{64}$'),
  overlay_approval_request_digest TEXT NOT NULL
    CHECK (overlay_approval_request_digest ~ '^[a-f0-9]{64}$'),
  overlay_approval_attestation_digest TEXT NOT NULL
    CHECK (overlay_approval_attestation_digest ~ '^[a-f0-9]{64}$'),
  assertion_audit_digest TEXT NOT NULL
    CHECK (assertion_audit_digest ~ '^[a-f0-9]{64}$'),
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (import_id, target_table, record_key),
  UNIQUE (import_id, target_table, ordinal)
);

CREATE TABLE world_base.runtime_catalog_activation_events (
  event_id TEXT PRIMARY KEY,
  event_sequence BIGINT NOT NULL CHECK (event_sequence > 0),
  event_type TEXT NOT NULL CHECK (event_type = 'activate'),
  catalog_scope TEXT NOT NULL
    CHECK (catalog_scope = 'item_container_materialization_v2'),
  catalog_revision_id TEXT NOT NULL
    REFERENCES world_base.domain_catalog_revisions(catalog_revision_id) ON DELETE RESTRICT,
  catalog_digest TEXT NOT NULL CHECK (catalog_digest ~ '^[a-f0-9]{64}$'),
  import_id TEXT NOT NULL
    REFERENCES world_base.catalog_imports(import_id) ON DELETE RESTRICT,
  import_audit_digest TEXT NOT NULL CHECK (import_audit_digest ~ '^[a-f0-9]{64}$'),
  record_registry_digest TEXT NOT NULL CHECK (record_registry_digest ~ '^[a-f0-9]{64}$'),
  runtime_contract_digest TEXT NOT NULL CHECK (runtime_contract_digest ~ '^[a-f0-9]{64}$'),
  compatible_world_revision_id TEXT NOT NULL
    REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  compatible_world_catalog_digest TEXT NOT NULL
    CHECK (compatible_world_catalog_digest ~ '^[a-f0-9]{64}$'),
  compatible_world_pin_manifest_digest TEXT NOT NULL
    CHECK (compatible_world_pin_manifest_digest ~ '^[a-f0-9]{64}$'),
  request_digest TEXT NOT NULL UNIQUE CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  attestation_digest TEXT NOT NULL CHECK (attestation_digest ~ '^[a-f0-9]{64}$'),
  expected_previous_event_id TEXT
    REFERENCES world_base.runtime_catalog_activation_events(event_id)
    DEFERRABLE INITIALLY DEFERRED,
  runtime_release_id TEXT NOT NULL CHECK (runtime_release_id ~ '^[a-f0-9]{64}$'),
  operator_principal TEXT NOT NULL,
  event_digest TEXT NOT NULL UNIQUE CHECK (event_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (catalog_scope, event_sequence)
);

CREATE INDEX runtime_catalog_activation_latest
  ON world_base.runtime_catalog_activation_events (catalog_scope, event_sequence DESC);
CREATE INDEX catalog_import_records_digest_lookup
  ON world_base.catalog_import_records (import_id, record_digest);

CREATE TRIGGER catalog_baseline_registrations_append_only
BEFORE UPDATE OR DELETE ON world_base.catalog_baseline_registrations
FOR EACH ROW EXECUTE FUNCTION world_base.reject_runtime_catalog_ledger_mutation();
CREATE TRIGGER domain_catalog_revisions_append_only
BEFORE UPDATE OR DELETE ON world_base.domain_catalog_revisions
FOR EACH ROW EXECUTE FUNCTION world_base.reject_runtime_catalog_ledger_mutation();
CREATE TRIGGER catalog_imports_append_only
BEFORE UPDATE OR DELETE ON world_base.catalog_imports
FOR EACH ROW EXECUTE FUNCTION world_base.reject_runtime_catalog_ledger_mutation();
CREATE TRIGGER catalog_import_tables_append_only
BEFORE UPDATE OR DELETE ON world_base.catalog_import_tables
FOR EACH ROW EXECUTE FUNCTION world_base.reject_runtime_catalog_ledger_mutation();
CREATE TRIGGER catalog_import_records_append_only
BEFORE UPDATE OR DELETE ON world_base.catalog_import_records
FOR EACH ROW EXECUTE FUNCTION world_base.reject_runtime_catalog_ledger_mutation();
CREATE TRIGGER catalog_import_dependency_assertions_append_only
BEFORE UPDATE OR DELETE ON world_base.catalog_import_dependency_assertions
FOR EACH ROW EXECUTE FUNCTION world_base.reject_runtime_catalog_ledger_mutation();
CREATE TRIGGER runtime_catalog_activation_events_append_only
BEFORE UPDATE OR DELETE ON world_base.runtime_catalog_activation_events
FOR EACH ROW EXECUTE FUNCTION world_base.reject_runtime_catalog_ledger_mutation();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON world_base.catalog_baseline_registrations,
     world_base.domain_catalog_revisions,
     world_base.catalog_import_records,
     world_base.catalog_import_dependency_assertions,
     world_base.runtime_catalog_activation_events,
     world_base.schema_migrations
  FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE
  ON world_base.catalog_imports, world_base.catalog_import_tables
  FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'runtime_catalog_importer') THEN
    CREATE ROLE runtime_catalog_importer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'runtime_catalog_activator') THEN
    CREATE ROLE runtime_catalog_activator NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA world_base
  TO runtime_catalog_importer, runtime_catalog_activator;
GRANT SELECT ON
  world_base.catalog_baseline_registrations,
  world_base.domain_catalog_revisions,
  world_base.catalog_imports,
  world_base.catalog_import_tables,
  world_base.catalog_import_records,
  world_base.catalog_import_dependency_assertions,
  world_base.runtime_catalog_activation_events,
  world_base.schema_migrations,
  world_base.graph_nodes,
  world_base.world_revisions
  TO runtime_catalog_importer;
GRANT INSERT ON
  world_base.catalog_baseline_registrations,
  world_base.domain_catalog_revisions,
  world_base.catalog_imports,
  world_base.catalog_import_tables,
  world_base.catalog_import_records,
  world_base.catalog_import_dependency_assertions,
  world_base.building_templates,
  world_base.quantity_unit_definitions,
  world_base.region_equipment_profiles,
  world_base.source_records,
  world_base.universal_categories,
  world_base.world_revisions,
  world_base.building_layout_templates,
  world_base.category_labels,
  world_base.container_content_category_relations,
  world_base.container_templates,
  world_base.g5_anchor_templates,
  world_base.g5_edge_templates,
  world_base.g5_minilocation_templates,
  world_base.item_profile_sets,
  world_base.item_templates,
  world_base.property_profiles,
  world_base.region_category_options,
  world_base.room_templates,
  world_base.universal_category_relations,
  world_base.building_layout_nodes,
  world_base.container_content_profiles,
  world_base.container_template_facet_bindings,
  world_base.container_template_inventory_profiles,
  world_base.container_template_source_bindings,
  world_base.g4_materialization_profiles,
  world_base.item_profile_entries,
  world_base.item_template_category_bindings,
  world_base.item_template_inventory_profiles,
  world_base.item_template_quantity_profiles,
  world_base.item_template_source_bindings,
  world_base.property_profile_rules,
  world_base.region_equipment_profile_entries,
  world_base.container_content_profile_entries,
  world_base.g4_materialization_bindings,
  world_base.g4_materialization_layout_edges,
  world_base.materialization_slot_rules,
  world_base.g4_container_materialization_rules,
  world_base.g4_item_materialization_rules,
  world_base.record_sources
  TO runtime_catalog_importer;
GRANT SELECT ON
  world_base.domain_catalog_revisions,
  world_base.catalog_imports,
  world_base.runtime_catalog_activation_events
  TO runtime_catalog_activator;
GRANT INSERT ON world_base.runtime_catalog_activation_events
  TO runtime_catalog_activator;
REVOKE UPDATE, DELETE, TRUNCATE ON
  world_base.catalog_baseline_registrations,
  world_base.domain_catalog_revisions,
  world_base.catalog_imports,
  world_base.catalog_import_tables,
  world_base.catalog_import_records,
  world_base.catalog_import_dependency_assertions,
  world_base.runtime_catalog_activation_events
  FROM runtime_catalog_importer, runtime_catalog_activator;

GRANT SELECT
  ON world_base.catalog_baseline_registrations,
     world_base.domain_catalog_revisions,
     world_base.catalog_import_records,
     world_base.catalog_import_dependency_assertions,
     world_base.runtime_catalog_activation_events,
     world_base.schema_migrations
  TO world_reader;
