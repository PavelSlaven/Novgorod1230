-- Spatial v3 production-v2 candidate dependencies.
--
-- External dependencies are global immutable registry rows. Authoring edges
-- either target revision-local authoring versions or exact external pins; the
-- branches are a strict XOR. This migration does not activate a world
-- revision and does not modify existing approved rows.

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_external_dependency_versions (
  registry_type TEXT NOT NULL,
  registry_id TEXT NOT NULL,
  registry_version TEXT NOT NULL,
  registry_digest TEXT NOT NULL CHECK (registry_digest ~ '^[a-f0-9]{64}$'),
  dependency_id TEXT NOT NULL,
  dependency_version INTEGER NOT NULL CHECK (dependency_version > 0),
  dependency_digest TEXT NOT NULL CHECK (dependency_digest ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL CHECK (status = 'approved'),
  approval_ref TEXT NOT NULL,
  approval_digest TEXT NOT NULL CHECK (approval_digest ~ '^[a-f0-9]{64}$'),
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (
    registry_type,
    registry_id,
    registry_version,
    dependency_id,
    dependency_version
  ),
  UNIQUE (
    registry_type,
    registry_id,
    registry_version,
    registry_digest,
    dependency_id,
    dependency_version,
    dependency_digest
  )
);

ALTER TABLE world_base.spatial_v3_authoring_dependency_edges
  ADD COLUMN IF NOT EXISTS target_registry_type TEXT,
  ADD COLUMN IF NOT EXISTS target_registry_id TEXT,
  ADD COLUMN IF NOT EXISTS target_registry_version TEXT,
  ADD COLUMN IF NOT EXISTS target_registry_digest TEXT,
  ADD COLUMN IF NOT EXISTS target_dependency_digest TEXT;

DO $$
DECLARE
  target_fk RECORD;
BEGIN
  FOR target_fk IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'world_base.spatial_v3_authoring_dependency_edges'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE
        'FOREIGN KEY (target_entity_kind, target_entity_id, target_version, world_revision_id)%'
  LOOP
    EXECUTE format(
      'ALTER TABLE world_base.spatial_v3_authoring_dependency_edges DROP CONSTRAINT %I',
      target_fk.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE world_base.spatial_v3_authoring_dependency_edges
  DROP CONSTRAINT IF EXISTS spatial_v3_authoring_dependency_edges_target_scope_xor;

ALTER TABLE world_base.spatial_v3_authoring_dependency_edges
  ADD CONSTRAINT spatial_v3_authoring_dependency_edges_target_scope_xor CHECK (
    (
      target_entity_kind <> 'external_dependency'
      AND target_registry_type IS NULL
      AND target_registry_id IS NULL
      AND target_registry_version IS NULL
      AND target_registry_digest IS NULL
      AND target_dependency_digest IS NULL
    )
    OR
    (
      target_entity_kind = 'external_dependency'
      AND target_registry_type IS NOT NULL
      AND target_registry_id IS NOT NULL
      AND target_registry_version IS NOT NULL
      AND target_registry_digest ~ '^[a-f0-9]{64}$'
      AND target_dependency_digest ~ '^[a-f0-9]{64}$'
    )
  ) NOT VALID;

ALTER TABLE world_base.spatial_v3_authoring_dependency_edges
  VALIDATE CONSTRAINT spatial_v3_authoring_dependency_edges_target_scope_xor;

CREATE OR REPLACE FUNCTION world_base.spatial_v3_dependency_edge_target_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.target_entity_kind = 'external_dependency' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM world_base.spatial_v3_external_dependency_versions dependency
      WHERE dependency.registry_type = NEW.target_registry_type
        AND dependency.registry_id = NEW.target_registry_id
        AND dependency.registry_version = NEW.target_registry_version
        AND dependency.registry_digest = NEW.target_registry_digest
        AND dependency.dependency_id = NEW.target_entity_id
        AND dependency.dependency_version = NEW.target_version
        AND dependency.dependency_digest = NEW.target_dependency_digest
        AND dependency.status = 'approved'
    ) THEN
      RAISE EXCEPTION
        'Spatial v3 external dependency pin is absent or mismatched: %/%@%',
        NEW.target_registry_type,
        NEW.target_entity_id,
        NEW.target_version;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM world_base.spatial_v3_authoring_versions target
    WHERE target.entity_kind = NEW.target_entity_kind
      AND target.entity_id = NEW.target_entity_id
      AND target.version = NEW.target_version
      AND target.world_revision_id = NEW.world_revision_id
  ) THEN
    RAISE EXCEPTION
      'Spatial v3 internal dependency target is absent from revision-local closure: %/%@%',
      NEW.target_entity_kind,
      NEW.target_entity_id,
      NEW.target_version;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS spatial_v3_dependency_edge_target_guard
  ON world_base.spatial_v3_authoring_dependency_edges;
CREATE CONSTRAINT TRIGGER spatial_v3_dependency_edge_target_guard
AFTER INSERT OR UPDATE
ON world_base.spatial_v3_authoring_dependency_edges
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION world_base.spatial_v3_dependency_edge_target_guard();

CREATE OR REPLACE FUNCTION world_base.spatial_v3_external_dependency_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Spatial v3 approved external dependency rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS spatial_v3_external_dependency_immutable
  ON world_base.spatial_v3_external_dependency_versions;
CREATE TRIGGER spatial_v3_external_dependency_immutable
BEFORE UPDATE OR DELETE
ON world_base.spatial_v3_external_dependency_versions
FOR EACH ROW
EXECUTE FUNCTION world_base.spatial_v3_external_dependency_immutable();

GRANT SELECT ON world_base.spatial_v3_external_dependency_versions TO world_reader;
