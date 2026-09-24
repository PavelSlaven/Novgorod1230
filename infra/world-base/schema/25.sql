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
