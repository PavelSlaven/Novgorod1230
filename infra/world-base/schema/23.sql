-- Approved acoustic baseline authoring for a generated or canonical G5 scene slot.
CREATE TABLE IF NOT EXISTS world_base.spatial_v3_g6_acoustic_baselines (
  entity_kind TEXT NOT NULL DEFAULT 'g6_acoustic_baseline'
    CHECK (entity_kind = 'g6_acoustic_baseline'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  g5_template_id TEXT,
  g5_template_version INTEGER,
  canonical_g5_id TEXT,
  canonical_g5_version INTEGER,
  scene_template_id TEXT NOT NULL,
  scene_template_version INTEGER NOT NULL,
  g6_scene_slot_key TEXT NOT NULL,
  ambient_noise SMALLINT NOT NULL CHECK (ambient_noise IN (0, 1, 2)),
  directness TEXT NOT NULL CHECK (length(btrim(directness)) > 0),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL
    REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  CHECK ((g5_template_id IS NOT NULL AND g5_template_version IS NOT NULL
      AND canonical_g5_id IS NULL AND canonical_g5_version IS NULL)
    OR (g5_template_id IS NULL AND g5_template_version IS NULL
      AND canonical_g5_id IS NOT NULL AND canonical_g5_version IS NOT NULL)),
  FOREIGN KEY (entity_kind, id, version, world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind, entity_id, version, world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (g5_template_id, g5_template_version, world_revision_id)
    REFERENCES world_base.spatial_v3_g5_generation_templates(
      id, version, world_revision_id
    ) ON DELETE RESTRICT,
  FOREIGN KEY (canonical_g5_id, canonical_g5_version, world_revision_id)
    REFERENCES world_base.spatial_v3_nodes(id, version, world_revision_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (scene_template_id, scene_template_version, world_revision_id)
    REFERENCES world_base.spatial_v3_scene_templates(
      id, version, world_revision_id
    ) ON DELETE RESTRICT,
  FOREIGN KEY (scene_template_id, scene_template_version, g6_scene_slot_key)
    REFERENCES world_base.spatial_v3_g6_template_slots(
      scene_template_id, scene_template_version, scene_slot_key
    ) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS spatial_v3_g6_acoustic_baselines_generated_unique
  ON world_base.spatial_v3_g6_acoustic_baselines(g5_template_id,
    g5_template_version, scene_template_id, scene_template_version,
    g6_scene_slot_key) WHERE g5_template_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS spatial_v3_g6_acoustic_baselines_canonical_unique
  ON world_base.spatial_v3_g6_acoustic_baselines(canonical_g5_id,
    canonical_g5_version, scene_template_id, scene_template_version,
    g6_scene_slot_key) WHERE canonical_g5_id IS NOT NULL;
