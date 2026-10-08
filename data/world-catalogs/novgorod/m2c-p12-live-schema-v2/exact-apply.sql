BEGIN;
-- Immutable generated cache for approved procedural-scene compiler output.
CREATE TABLE IF NOT EXISTS world_base.procedural_scene_compiled_records (
  record_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  record_kind TEXT NOT NULL CHECK (record_kind IN (
    'profile','mapping','approval_metadata'
  )),
  family_candidate_ref TEXT,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_digest TEXT NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  source_pack_digest TEXT NOT NULL
    CHECK (source_pack_digest ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL
    CHECK (status = 'approved_authoring_not_runtime_selectable'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (record_id, version)
);

GRANT SELECT ON
  world_base.region_demographic_profile_entries,
  world_base.region_appearance_profile_entries,
  world_base.procedural_scene_compiled_records
TO world_reader;
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
-- Approved M2c NPC composition, reusable runtime profiles, and regional context.
CREATE UNIQUE INDEX IF NOT EXISTS spatial_v3_node_parents_m2c_npc_exact_edge
  ON world_base.spatial_v3_node_parents(
    child_id, child_version, parent_id, parent_version, world_revision_id
  );

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_g4_npc_composition_bindings (
  entity_kind TEXT NOT NULL DEFAULT 'g4_npc_composition_binding'
    CHECK (entity_kind = 'g4_npc_composition_binding'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  g4_id TEXT NOT NULL,
  g4_version INTEGER NOT NULL CHECK (g4_version > 0),
  generation_template_id TEXT,
  generation_template_version INTEGER CHECK (generation_template_version > 0),
  canonical_g5_id TEXT,
  canonical_g5_version INTEGER CHECK (canonical_g5_version > 0),
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
  CHECK (
    (generation_template_id IS NOT NULL AND generation_template_version IS NOT NULL
      AND canonical_g5_id IS NULL AND canonical_g5_version IS NULL)
    OR (generation_template_id IS NULL AND generation_template_version IS NULL
      AND canonical_g5_id IS NOT NULL AND canonical_g5_version IS NOT NULL)
  ),
  FOREIGN KEY (generation_template_id, generation_template_version, world_revision_id)
    REFERENCES world_base.spatial_v3_g5_generation_templates(id, version, world_revision_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (canonical_g5_id, canonical_g5_version, world_revision_id)
    REFERENCES world_base.spatial_v3_nodes(id, version, world_revision_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (canonical_g5_id, canonical_g5_version,
    g4_id, g4_version, world_revision_id)
    REFERENCES world_base.spatial_v3_node_parents(
      child_id, child_version, parent_id, parent_version, world_revision_id
    )
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS spatial_v3_g4_npc_composition_active_generated
  ON world_base.spatial_v3_g4_npc_composition_bindings(
    world_revision_id, g4_id, g4_version, generation_template_id
  ) WHERE status = 'approved' AND generation_template_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS spatial_v3_g4_npc_composition_active_canonical
  ON world_base.spatial_v3_g4_npc_composition_bindings(
    world_revision_id, g4_id, g4_version, canonical_g5_id
  ) WHERE status = 'approved' AND canonical_g5_id IS NOT NULL;

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
-- Append-only local movement eligibility. Original directed edges remain unchanged.
CREATE TABLE IF NOT EXISTS world_base.spatial_v3_local_movement_eligibility_profiles (
  entity_kind TEXT NOT NULL DEFAULT 'local_movement_eligibility_profile'
    CHECK (entity_kind = 'local_movement_eligibility_profile'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  scene_template_id TEXT NOT NULL,
  scene_template_version INTEGER NOT NULL CHECK (scene_template_version > 0),
  scene_template_digest TEXT NOT NULL CHECK (scene_template_digest ~ '^[a-f0-9]{64}$'),
  edge_slot_key TEXT NOT NULL,
  opposing_edge_slot_key TEXT NOT NULL CHECK (opposing_edge_slot_key <> edge_slot_key),
  from_position_slot_key TEXT NOT NULL,
  to_position_slot_key TEXT NOT NULL CHECK (to_position_slot_key <> from_position_slot_key),
  eligibility_kind TEXT NOT NULL CHECK (eligibility_kind = 'two_approved_directed_edges'),
  max_root_owners_per_transition INTEGER NOT NULL CHECK (max_root_owners_per_transition > 0),
  directness TEXT NOT NULL CHECK (length(btrim(directness)) > 0),
  confidence TEXT NOT NULL CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high')),
  status TEXT NOT NULL CHECK (status = 'approved'),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  FOREIGN KEY (entity_kind,id,version,world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(entity_kind,entity_id,version,world_revision_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (scene_template_id,scene_template_version,edge_slot_key)
    REFERENCES world_base.spatial_v3_scene_movement_edge_templates(scene_template_id,scene_template_version,edge_slot_key)
    ON DELETE RESTRICT,
  FOREIGN KEY (scene_template_id,scene_template_version,opposing_edge_slot_key)
    REFERENCES world_base.spatial_v3_scene_movement_edge_templates(scene_template_id,scene_template_version,edge_slot_key)
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION world_base.spatial_v3_local_movement_eligibility_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Spatial v3 local movement eligibility is append-only';
END;
$$;
DROP TRIGGER IF EXISTS spatial_v3_local_movement_eligibility_immutable
  ON world_base.spatial_v3_local_movement_eligibility_profiles;
CREATE TRIGGER spatial_v3_local_movement_eligibility_immutable
  BEFORE UPDATE OR DELETE ON world_base.spatial_v3_local_movement_eligibility_profiles
  FOR EACH ROW EXECUTE FUNCTION world_base.spatial_v3_local_movement_eligibility_immutable();
-- Non-portal canonical site connections may have no availability condition set.
ALTER TABLE world_base.spatial_v3_canonical_g5_connection_profiles
  ALTER COLUMN availability_condition_set_ref DROP NOT NULL;
ALTER TABLE world_base.spatial_v3_canonical_g5_connection_profiles
  ADD CONSTRAINT spatial_v3_route_profile_requires_availability
  CHECK (profile_scope = 'site_connection' OR availability_condition_set_ref IS NOT NULL);
COMMIT;
