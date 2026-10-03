-- Executable rules for finite G4 expansion profiles.
CREATE TABLE IF NOT EXISTS world_base.spatial_v3_expansion_rule_sets (
  entity_kind TEXT NOT NULL DEFAULT 'expansion_rule_set'
    CHECK (entity_kind = 'expansion_rule_set'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  rule_kind TEXT NOT NULL CHECK (rule_kind IN ('adjacency', 'connectivity', 'seed')),
  strategy TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind, id, version, world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind, entity_id, version, world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (rule_kind = 'adjacency' AND strategy = 'through_same_exit') OR
    (rule_kind = 'connectivity' AND strategy = 'existing_exit_reachable') OR
    (rule_kind = 'seed' AND strategy = 'mulberry32_v1')
  )
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spatial_v3_expansion_adjacency_rule_fk') THEN
    ALTER TABLE world_base.spatial_v3_g4_expansion_profiles
      ADD CONSTRAINT spatial_v3_expansion_adjacency_rule_fk
      FOREIGN KEY (adjacency_rule_set_id, adjacency_rule_set_version, world_revision_id)
      REFERENCES world_base.spatial_v3_expansion_rule_sets(id, version, world_revision_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spatial_v3_expansion_connectivity_rule_fk') THEN
    ALTER TABLE world_base.spatial_v3_g4_expansion_profiles
      ADD CONSTRAINT spatial_v3_expansion_connectivity_rule_fk
      FOREIGN KEY (connectivity_rule_set_id, connectivity_rule_set_version, world_revision_id)
      REFERENCES world_base.spatial_v3_expansion_rule_sets(id, version, world_revision_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spatial_v3_expansion_seed_rule_fk') THEN
    ALTER TABLE world_base.spatial_v3_g4_expansion_profiles
      ADD CONSTRAINT spatial_v3_expansion_seed_rule_fk
      FOREIGN KEY (seed_policy_id, seed_policy_version, world_revision_id)
      REFERENCES world_base.spatial_v3_expansion_rule_sets(id, version, world_revision_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
