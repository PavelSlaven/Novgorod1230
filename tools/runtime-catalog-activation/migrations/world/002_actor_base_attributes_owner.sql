ALTER TABLE world_base.domain_catalog_revisions
  DROP CONSTRAINT domain_catalog_revisions_catalog_scope_check,
  ADD CONSTRAINT domain_catalog_revisions_catalog_scope_check
    CHECK (catalog_scope IN (
      'item_container_materialization_v2',
      'actor_base_attributes_v1'
    ));

ALTER TABLE world_base.catalog_imports
  DROP CONSTRAINT catalog_imports_runtime_scope,
  ADD CONSTRAINT catalog_imports_runtime_scope
    CHECK (catalog_scope IS NULL OR catalog_scope IN (
      'item_container_materialization_v2',
      'actor_base_attributes_v1'
    ));

ALTER TABLE world_base.catalog_import_dependency_assertions
  DROP CONSTRAINT catalog_import_dependency_assertions_catalog_scope_check,
  ADD CONSTRAINT catalog_import_dependency_assertions_catalog_scope_check
    CHECK (catalog_scope IN (
      'item_container_materialization_v2',
      'actor_base_attributes_v1'
    ));

ALTER TABLE world_base.runtime_catalog_activation_events
  DROP CONSTRAINT runtime_catalog_activation_events_catalog_scope_check,
  ADD CONSTRAINT runtime_catalog_activation_events_catalog_scope_check
    CHECK (catalog_scope IN (
      'item_container_materialization_v2',
      'actor_base_attributes_v1'
    ));

CREATE TABLE world_base.actor_base_attribute_profiles (
  catalog_revision_id TEXT NOT NULL
    REFERENCES world_base.domain_catalog_revisions(catalog_revision_id)
    ON DELETE RESTRICT,
  profile_id TEXT NOT NULL,
  profile_digest TEXT NOT NULL CHECK (profile_digest ~ '^[a-f0-9]{64}$'),
  profile_payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status = 'approved'),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_revision_id, profile_id),
  UNIQUE (catalog_revision_id, profile_digest),
  CHECK (profile_payload->>'profile_id' = profile_id)
);

CREATE TRIGGER actor_base_attribute_profiles_append_only
BEFORE UPDATE OR DELETE ON world_base.actor_base_attribute_profiles
FOR EACH ROW EXECUTE FUNCTION world_base.reject_runtime_catalog_ledger_mutation();

REVOKE UPDATE, DELETE, TRUNCATE
  ON world_base.actor_base_attribute_profiles
  FROM PUBLIC;

GRANT SELECT ON world_base.actor_base_attribute_profiles
  TO runtime_catalog_importer, runtime_catalog_activator, world_reader;
GRANT INSERT ON world_base.actor_base_attribute_profiles
  TO runtime_catalog_importer;
REVOKE UPDATE, DELETE, TRUNCATE
  ON world_base.actor_base_attribute_profiles
  FROM runtime_catalog_importer, runtime_catalog_activator, world_reader;
