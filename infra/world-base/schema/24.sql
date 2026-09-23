-- Approved M2c NPC composition, reusable runtime profiles, and regional context.
CREATE TABLE IF NOT EXISTS world_base.spatial_v3_g4_npc_composition_bindings (
  entity_kind TEXT NOT NULL DEFAULT 'g4_npc_composition_binding'
    CHECK (entity_kind = 'g4_npc_composition_binding'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  g4_id TEXT NOT NULL,
  g4_version INTEGER NOT NULL CHECK (g4_version > 0),
  generation_template_id TEXT NOT NULL,
  generation_template_version INTEGER NOT NULL CHECK (generation_template_version > 0),
  min_count INTEGER NOT NULL CHECK (min_count >= 0),
  max_count INTEGER NOT NULL CHECK (max_count >= min_count),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL
    REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  directness TEXT NOT NULL CHECK (length(btrim(directness)) > 0),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind, id, version, world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind, entity_id, version, world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (g4_id, g4_version, world_revision_id)
    REFERENCES world_base.spatial_v3_nodes(id, version, world_revision_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (generation_template_id, generation_template_version, world_revision_id)
    REFERENCES world_base.spatial_v3_g5_generation_templates(id, version, world_revision_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS spatial_v3_g4_npc_composition_active_g4
  ON world_base.spatial_v3_g4_npc_composition_bindings(world_revision_id, g4_id, g4_version)
  WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_npc_runtime_profiles (
  entity_kind TEXT NOT NULL DEFAULT 'npc_runtime_profile'
    CHECK (entity_kind = 'npc_runtime_profile'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  profile_kind TEXT NOT NULL CHECK (profile_kind IN (
    'npc_binding', 'body', 'activity', 'routine', 'clothing',
    'item_template', 'item_inventory', 'item_visual'
  )),
  role_ref TEXT,
  occupation_ref TEXT,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL
    REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  directness TEXT NOT NULL CHECK (length(btrim(directness)) > 0),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind, id, version, world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind, entity_id, version, world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_npc_regional_context_profiles (
  entity_kind TEXT NOT NULL DEFAULT 'npc_regional_context_profile'
    CHECK (entity_kind = 'npc_regional_context_profile'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL
    REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  directness TEXT NOT NULL CHECK (length(btrim(directness)) > 0),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind, id, version, world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind, entity_id, version, world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED
);
