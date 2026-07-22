-- Spatial architecture v3 / P12 dependency-closure contracts (target only).
-- These rows remain authoring data and do not activate the v3 runtime.

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_regional_scene_template_bases (
  entity_kind TEXT NOT NULL DEFAULT 'regional_scene_template_basis'
    CHECK (entity_kind = 'regional_scene_template_basis'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  source_profile_family_id TEXT NOT NULL,
  geometry_claim TEXT NOT NULL CHECK (geometry_claim = 'topological_only'),
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind, id, version, world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind, entity_id, version, world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_scene_selection_rules (
  entity_kind TEXT NOT NULL DEFAULT 'scene_selection_rule'
    CHECK (entity_kind = 'scene_selection_rule'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  rule_kind TEXT NOT NULL CHECK (rule_kind = 'single_candidate'),
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind, id, version, world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind, entity_id, version, world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_scene_applicability_rules (
  entity_kind TEXT NOT NULL DEFAULT 'scene_applicability_rule'
    CHECK (entity_kind = 'scene_applicability_rule'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  rule_kind TEXT NOT NULL CHECK (rule_kind = 'exact_source_ref'),
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind, id, version, world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind, entity_id, version, world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'spatial_v3_scene_template_regional_basis_fk'
  ) THEN
    ALTER TABLE world_base.spatial_v3_scene_templates
      ADD CONSTRAINT spatial_v3_scene_template_regional_basis_fk
      FOREIGN KEY (regional_template_id, regional_template_version)
      REFERENCES world_base.spatial_v3_regional_scene_template_bases(id, version)
      ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'spatial_v3_scene_profile_selection_rule_fk'
  ) THEN
    ALTER TABLE world_base.spatial_v3_scene_materialization_profiles
      ADD CONSTRAINT spatial_v3_scene_profile_selection_rule_fk
      FOREIGN KEY (selection_rule_id, selection_rule_version)
      REFERENCES world_base.spatial_v3_scene_selection_rules(id, version)
      ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF EXISTS (
    SELECT 1 FROM world_base.spatial_v3_scene_materialization_candidates
    WHERE applicability_rule_id IS NULL OR applicability_rule_version IS NULL
  ) THEN
    RAISE EXCEPTION
      'P12_DEPENDENCY_CLOSURE_GAP: scene candidate applicability rule is unpinned';
  END IF;

  ALTER TABLE world_base.spatial_v3_scene_materialization_candidates
    ALTER COLUMN applicability_rule_id SET NOT NULL,
    ALTER COLUMN applicability_rule_version SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'spatial_v3_scene_candidate_applicability_rule_fk'
  ) THEN
    ALTER TABLE world_base.spatial_v3_scene_materialization_candidates
      ADD CONSTRAINT spatial_v3_scene_candidate_applicability_rule_fk
      FOREIGN KEY (applicability_rule_id, applicability_rule_version)
      REFERENCES world_base.spatial_v3_scene_applicability_rules(id, version)
      ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

GRANT SELECT ON ALL TABLES IN SCHEMA world_base TO world_reader;
