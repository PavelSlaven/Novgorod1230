-- rt-lines (D49, D56): Spatial 4.7.0 lines - line kind profiles, their alternative methods, and the line fields of
-- canonical G5 connection bindings and world route segments.
-- Parts 09-20 stay untouched (the legacy world bridge migration is pinned to them): existing tables change only by
-- ALTER with nullable columns, so every row of an earlier version keeps its bytes (the importer is insert-only).
-- D56: a long segment is sliced by the recheck policy of its line kind, so a profile has no slice-step or length field;
-- the 30-minute step is a rule of the norm and of the wave validator.

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_line_kind_profiles (
  entity_kind TEXT NOT NULL DEFAULT 'line_kind_profile' CHECK(entity_kind='line_kind_profile'),
  id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0),
  world_revision_id TEXT NOT NULL REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  line_kind_id TEXT NOT NULL CHECK(length(btrim(line_kind_id))>0),
  transition_environment_profile_id TEXT NOT NULL, transition_environment_profile_version INTEGER NOT NULL,
  topological_orientation_profile_id TEXT NOT NULL, topological_orientation_profile_version INTEGER NOT NULL,
  baseline_movement_method_id TEXT NOT NULL CHECK(length(btrim(baseline_movement_method_id))>0),
  movement_method_cost_profile_id TEXT NOT NULL, movement_method_cost_profile_version INTEGER NOT NULL,
  dynamic_recheck_policy_id TEXT NOT NULL, dynamic_recheck_policy_version INTEGER NOT NULL,
  route_kind_id TEXT NOT NULL CHECK(length(btrim(route_kind_id))>0),
  status TEXT NOT NULL CHECK(status IN ('approved','deprecated','retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK(canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(id,version), UNIQUE(id,version,world_revision_id), UNIQUE(line_kind_id,version),
  FOREIGN KEY(entity_kind,id,version,world_revision_id) REFERENCES world_base.spatial_v3_authoring_versions(entity_kind,entity_id,version,world_revision_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(transition_environment_profile_id,transition_environment_profile_version,world_revision_id) REFERENCES world_base.spatial_v3_transition_environment_profiles(id,version,world_revision_id) ON DELETE RESTRICT,
  FOREIGN KEY(topological_orientation_profile_id,topological_orientation_profile_version) REFERENCES world_base.spatial_v3_topological_movement_orientation_profiles(id,version) ON DELETE RESTRICT,
  FOREIGN KEY(movement_method_cost_profile_id,movement_method_cost_profile_version,world_revision_id) REFERENCES world_base.spatial_v3_movement_method_cost_profiles(id,version,world_revision_id) ON DELETE RESTRICT,
  FOREIGN KEY(dynamic_recheck_policy_id,dynamic_recheck_policy_version,world_revision_id) REFERENCES world_base.spatial_v3_dynamic_recheck_policies(id,version,world_revision_id) ON DELETE RESTRICT
);

-- hazard_rule_ref is a text versioned reference like risk_profile_ref and capacity_semantics_ref: there are no hazard records yet (LW-097).
-- That the method is a rational_factor option of the profile's cost profile is checked by the wave validator (a row-spanning rule).
CREATE TABLE IF NOT EXISTS world_base.spatial_v3_line_kind_alternative_methods (
  profile_id TEXT NOT NULL, profile_version INTEGER NOT NULL,
  movement_method_id TEXT NOT NULL CHECK(length(btrim(movement_method_id))>0),
  risk_class TEXT NOT NULL CHECK(risk_class IN ('low','moderate','high','extreme')),
  hazard_rule_ref TEXT NOT NULL CHECK(length(btrim(hazard_rule_ref))>0),
  PRIMARY KEY(profile_id,profile_version,movement_method_id),
  FOREIGN KEY(profile_id,profile_version) REFERENCES world_base.spatial_v3_line_kind_profiles(id,version) ON DELETE CASCADE
);

-- Canonical G5 connection binding: a binding of the new style (binding@3 and later) names a line kind profile instead of a
-- connection profile and carries its own minutes (F binding block); the old style (@1, @2) keeps its connection profile.
-- availability_condition_set_ref stays optional (D3): null for a connection without a portal.
ALTER TABLE world_base.spatial_v3_canonical_g5_connection_bindings
  ALTER COLUMN connection_profile_id DROP NOT NULL,
  ALTER COLUMN connection_profile_version DROP NOT NULL,
  ADD COLUMN line_kind_profile_id TEXT,
  ADD COLUMN line_kind_profile_version INTEGER,
  ADD COLUMN line_name TEXT,
  ADD COLUMN line_discriminator TEXT,
  ADD COLUMN line_direction_id TEXT,
  ADD COLUMN line_toponym TEXT,
  ADD COLUMN base_minutes INTEGER,
  ADD COLUMN capacity INTEGER,
  ADD COLUMN capacity_semantics_ref TEXT,
  ADD COLUMN risk_profile_ref TEXT,
  ADD COLUMN availability_condition_set_ref TEXT;
ALTER TABLE world_base.spatial_v3_canonical_g5_connection_bindings
  ADD CONSTRAINT spatial_v3_cg5_binding_line_profile_fk
    FOREIGN KEY(line_kind_profile_id,line_kind_profile_version) REFERENCES world_base.spatial_v3_line_kind_profiles(id,version) ON DELETE RESTRICT,
  ADD CONSTRAINT spatial_v3_cg5_binding_profile_pair_ck
    CHECK((connection_profile_id IS NULL) = (connection_profile_version IS NULL)
      AND (line_kind_profile_id IS NULL) = (line_kind_profile_version IS NULL)),
  ADD CONSTRAINT spatial_v3_cg5_binding_one_style_ck
    CHECK((connection_profile_id IS NOT NULL) <> (line_kind_profile_id IS NOT NULL)),
  ADD CONSTRAINT spatial_v3_cg5_binding_old_style_no_line_ck
    CHECK(line_kind_profile_id IS NOT NULL OR (line_name IS NULL AND line_discriminator IS NULL AND line_direction_id IS NULL
      AND line_toponym IS NULL AND base_minutes IS NULL AND capacity IS NULL AND capacity_semantics_ref IS NULL
      AND risk_profile_ref IS NULL AND availability_condition_set_ref IS NULL)),
  ADD CONSTRAINT spatial_v3_cg5_binding_line_fields_ck
    CHECK(line_kind_profile_id IS NULL OR (line_name IS NOT NULL AND length(btrim(line_name))>0 AND base_minutes IS NOT NULL
      AND capacity_semantics_ref IS NOT NULL AND risk_profile_ref IS NOT NULL)),
  ADD CONSTRAINT spatial_v3_cg5_binding_line_values_ck
    CHECK((base_minutes IS NULL OR base_minutes>0) AND (capacity IS NULL OR capacity>0)
      AND (line_discriminator IS NULL OR length(btrim(line_discriminator))>0)
      AND (line_toponym IS NULL OR length(btrim(line_toponym))>0));

-- World route segment: the line fields of F (a segment of the new style has a line kind, its profile and a name).
ALTER TABLE world_base.spatial_v3_world_route_segments
  ADD COLUMN line_kind_id TEXT,
  ADD COLUMN line_kind_profile_id TEXT,
  ADD COLUMN line_kind_profile_version INTEGER,
  ADD COLUMN line_name TEXT,
  ADD COLUMN line_discriminator TEXT,
  ADD COLUMN line_direction_id TEXT,
  ADD COLUMN line_toponym TEXT;
ALTER TABLE world_base.spatial_v3_world_route_segments
  ADD CONSTRAINT spatial_v3_route_segment_line_profile_fk
    FOREIGN KEY(line_kind_profile_id,line_kind_profile_version,world_revision_id) REFERENCES world_base.spatial_v3_line_kind_profiles(id,version,world_revision_id) ON DELETE RESTRICT,
  ADD CONSTRAINT spatial_v3_route_segment_line_all_or_none_ck
    CHECK((line_kind_id IS NULL) = (line_kind_profile_id IS NULL)
      AND (line_kind_profile_id IS NULL) = (line_kind_profile_version IS NULL)
      AND (line_kind_profile_id IS NULL) = (line_name IS NULL)),
  ADD CONSTRAINT spatial_v3_route_segment_line_values_ck
    CHECK((line_name IS NULL OR length(btrim(line_name))>0)
      AND (line_kind_profile_id IS NOT NULL OR (line_discriminator IS NULL AND line_direction_id IS NULL AND line_toponym IS NULL))
      AND (line_discriminator IS NULL OR length(btrim(line_discriminator))>0)
      AND (line_toponym IS NULL OR length(btrim(line_toponym))>0));
