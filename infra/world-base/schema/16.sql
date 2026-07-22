-- P12 V1.1 immutable target projection contracts (target only; no runtime activation).

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_approved_physical_source_pairs (
  id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  source_payload_sha256 TEXT NOT NULL CHECK(source_payload_sha256 ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL CHECK(status IN ('approved','deprecated','retired')),
  PRIMARY KEY(id,version)
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_topological_movement_orientation_profiles (
  id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0),
  orientation_kind TEXT NOT NULL CHECK(orientation_kind IN ('ordered_endpoints','ordered_channel','ordered_shore')),
  vertical_direction TEXT NOT NULL CHECK(vertical_direction IN ('level','up','down','mixed')),
  forbids_compass_inference BOOLEAN NOT NULL CHECK(forbids_compass_inference),
  status TEXT NOT NULL CHECK(status IN ('approved','deprecated','retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK(canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(id,version)
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_topological_exit_orientation_rules (
  id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0),
  rule_kind TEXT NOT NULL CHECK(rule_kind='ordered_source_to_target'),
  forbids_compass_inference BOOLEAN NOT NULL CHECK(forbids_compass_inference),
  status TEXT NOT NULL CHECK(status IN ('approved','deprecated','retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK(canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(id,version)
);

ALTER TABLE world_base.spatial_v3_g4_directional_exits
  ALTER COLUMN exit_orientation_profile_id DROP NOT NULL,
  ALTER COLUMN exit_orientation_profile_version DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='spatial_v3_g4_exit_topological_orientation_rule_fk') THEN
    ALTER TABLE world_base.spatial_v3_g4_directional_exits
      ADD CONSTRAINT spatial_v3_g4_exit_topological_orientation_rule_fk
      FOREIGN KEY(exit_orientation_rule_id,exit_orientation_rule_version)
      REFERENCES world_base.spatial_v3_topological_exit_orientation_rules(id,version) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='spatial_v3_g4_exit_orientation_xor') THEN
    ALTER TABLE world_base.spatial_v3_g4_directional_exits
      ADD CONSTRAINT spatial_v3_g4_exit_orientation_xor CHECK(
        ((exit_orientation_profile_id IS NOT NULL) AND (exit_orientation_profile_version IS NOT NULL) AND (exit_orientation_rule_id IS NULL) AND (exit_orientation_rule_version IS NULL))
        OR ((exit_orientation_profile_id IS NULL) AND (exit_orientation_profile_version IS NULL) AND (exit_orientation_rule_id IS NOT NULL) AND (exit_orientation_rule_version IS NOT NULL))
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_canonical_g5_connection_profiles (
  id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0),
  profile_scope TEXT NOT NULL CHECK(profile_scope IN ('site_connection','world_route_segment')),
  passage_type_id TEXT NOT NULL,
  transition_environment_profile_id TEXT NOT NULL, transition_environment_profile_version INTEGER NOT NULL,
  movement_orientation_profile_id TEXT NOT NULL, movement_orientation_profile_version INTEGER NOT NULL,
  cost_kind TEXT NOT NULL CHECK(cost_kind IN ('action','time')),
  action_units INTEGER, baseline_movement_method_id TEXT,
  movement_method_cost_profile_id TEXT, movement_method_cost_profile_version INTEGER,
  base_minutes INTEGER, dynamic_recheck_policy_id TEXT, dynamic_recheck_policy_version INTEGER,
  capacity INTEGER CHECK(capacity IS NULL OR capacity > 0), capacity_semantics_ref TEXT NOT NULL,
  risk_profile_ref TEXT NOT NULL, availability_condition_set_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('approved','deprecated','retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK(canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(id,version),
  FOREIGN KEY(movement_orientation_profile_id,movement_orientation_profile_version) REFERENCES world_base.spatial_v3_topological_movement_orientation_profiles(id,version) ON DELETE RESTRICT,
  CHECK((cost_kind='action' AND action_units IS NOT NULL AND baseline_movement_method_id IS NULL AND movement_method_cost_profile_id IS NULL AND movement_method_cost_profile_version IS NULL AND base_minutes IS NULL AND dynamic_recheck_policy_id IS NULL AND dynamic_recheck_policy_version IS NULL)
    OR (cost_kind='time' AND action_units IS NULL AND baseline_movement_method_id IS NOT NULL AND movement_method_cost_profile_id IS NOT NULL AND movement_method_cost_profile_version IS NOT NULL AND base_minutes IS NOT NULL AND base_minutes > 0 AND dynamic_recheck_policy_id IS NOT NULL AND dynamic_recheck_policy_version IS NOT NULL)),
  CHECK((movement_method_cost_profile_id IS NULL)=(movement_method_cost_profile_version IS NULL)),
  CHECK((dynamic_recheck_policy_id IS NULL)=(dynamic_recheck_policy_version IS NULL))
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='spatial_v3_segment_topological_orientation_fk') THEN
    ALTER TABLE world_base.spatial_v3_world_route_segments
      ADD CONSTRAINT spatial_v3_segment_topological_orientation_fk
      FOREIGN KEY(topological_orientation_profile_id,topological_orientation_profile_version)
      REFERENCES world_base.spatial_v3_topological_movement_orientation_profiles(id,version) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='spatial_v3_segment_orientation_xor') THEN
    ALTER TABLE world_base.spatial_v3_world_route_segments
      ADD CONSTRAINT spatial_v3_segment_orientation_xor CHECK(
        ((movement_orientation_profile_id IS NOT NULL) AND (movement_orientation_profile_version IS NOT NULL) AND (topological_orientation_profile_id IS NULL) AND (topological_orientation_profile_version IS NULL))
        OR ((movement_orientation_profile_id IS NULL) AND (movement_orientation_profile_version IS NULL) AND (topological_orientation_profile_id IS NOT NULL) AND (topological_orientation_profile_version IS NOT NULL))
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_canonical_g5_connection_bindings (
  id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0),
  parent_g4_id TEXT NOT NULL, parent_g4_version INTEGER NOT NULL DEFAULT 1,
  from_canonical_g5_id TEXT NOT NULL, from_canonical_g5_version INTEGER NOT NULL DEFAULT 1,
  to_canonical_g5_id TEXT NOT NULL, to_canonical_g5_version INTEGER NOT NULL DEFAULT 1,
  connection_profile_id TEXT NOT NULL, connection_profile_version INTEGER NOT NULL,
  from_scene_endpoint_slot_key TEXT NOT NULL, to_scene_endpoint_slot_key TEXT NOT NULL,
  reverse_binding_id TEXT NOT NULL, reverse_binding_version INTEGER NOT NULL,
  source_pair_id TEXT NOT NULL, source_pair_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('approved','deprecated','retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  PRIMARY KEY(id,version),
  FOREIGN KEY(parent_g4_id,parent_g4_version) REFERENCES world_base.spatial_v3_nodes(id,version) ON DELETE RESTRICT,
  FOREIGN KEY(from_canonical_g5_id,from_canonical_g5_version) REFERENCES world_base.spatial_v3_nodes(id,version) ON DELETE RESTRICT,
  FOREIGN KEY(to_canonical_g5_id,to_canonical_g5_version) REFERENCES world_base.spatial_v3_nodes(id,version) ON DELETE RESTRICT,
  FOREIGN KEY(connection_profile_id,connection_profile_version) REFERENCES world_base.spatial_v3_canonical_g5_connection_profiles(id,version) ON DELETE RESTRICT,
  FOREIGN KEY(reverse_binding_id,reverse_binding_version) REFERENCES world_base.spatial_v3_canonical_g5_connection_bindings(id,version) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(source_pair_id,source_pair_version) REFERENCES world_base.spatial_v3_approved_physical_source_pairs(id,version) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_g4_entry_endpoint_bindings (
  id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0),
  g4_id TEXT NOT NULL, g4_version INTEGER NOT NULL DEFAULT 1,
  canonical_g5_id TEXT NOT NULL, canonical_g5_version INTEGER NOT NULL DEFAULT 1,
  arrival_scene_endpoint_slot_key TEXT NOT NULL, departure_scene_endpoint_slot_key TEXT NOT NULL,
  source_pair_id TEXT NOT NULL, source_pair_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('approved','deprecated','retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  PRIMARY KEY(id,version),
  FOREIGN KEY(g4_id,g4_version) REFERENCES world_base.spatial_v3_nodes(id,version) ON DELETE RESTRICT,
  FOREIGN KEY(canonical_g5_id,canonical_g5_version) REFERENCES world_base.spatial_v3_nodes(id,version) ON DELETE RESTRICT,
  FOREIGN KEY(source_pair_id,source_pair_version) REFERENCES world_base.spatial_v3_approved_physical_source_pairs(id,version) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_topological_direction_contexts (
  id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0),
  from_g4_id TEXT NOT NULL, from_g4_version INTEGER NOT NULL,
  to_g4_id TEXT NOT NULL, to_g4_version INTEGER NOT NULL,
  from_canonical_g5_id TEXT NOT NULL, from_canonical_g5_version INTEGER NOT NULL,
  to_canonical_g5_id TEXT NOT NULL, to_canonical_g5_version INTEGER NOT NULL,
  orientation_profile_id TEXT NOT NULL, orientation_profile_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('approved','deprecated','retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  PRIMARY KEY(id,version),
  FOREIGN KEY(from_g4_id,from_g4_version) REFERENCES world_base.spatial_v3_nodes(id,version) ON DELETE RESTRICT,
  FOREIGN KEY(to_g4_id,to_g4_version) REFERENCES world_base.spatial_v3_nodes(id,version) ON DELETE RESTRICT,
  FOREIGN KEY(from_canonical_g5_id,from_canonical_g5_version) REFERENCES world_base.spatial_v3_nodes(id,version) ON DELETE RESTRICT,
  FOREIGN KEY(to_canonical_g5_id,to_canonical_g5_version) REFERENCES world_base.spatial_v3_nodes(id,version) ON DELETE RESTRICT,
  FOREIGN KEY(orientation_profile_id,orientation_profile_version) REFERENCES world_base.spatial_v3_topological_movement_orientation_profiles(id,version) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_g4_traversal_profiles (
  g4_id TEXT NOT NULL, g4_version INTEGER NOT NULL,
  traversal_model TEXT NOT NULL CHECK(traversal_model='through_area'),
  status TEXT NOT NULL CHECK(status IN ('approved','deprecated','retired')),
  PRIMARY KEY(g4_id,g4_version),
  FOREIGN KEY(g4_id,g4_version) REFERENCES world_base.spatial_v3_nodes(id,version) ON DELETE CASCADE
);

GRANT SELECT ON ALL TABLES IN SCHEMA world_base TO world_reader;
