-- Approved Lower Dvina boundary traversal policies.
--
-- These tables complete the existing world-route risk and availability refs
-- with queryable versioned owners. Execution remains owned by
-- @rus/turn/spatial-v3-execution; this migration does not create a second
-- traversal or check engine and does not activate a release.

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_traversal_availability_policies (
  entity_kind TEXT NOT NULL DEFAULT 'traversal_availability_policy'
    CHECK (entity_kind = 'traversal_availability_policy'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  scenario_id TEXT NOT NULL,
  season_mode TEXT NOT NULL,
  daylight_required BOOLEAN NOT NULL,
  fallback_behavior TEXT NOT NULL CHECK (fallback_behavior = 'forbidden'),
  unsupported_state_behavior TEXT NOT NULL
    CHECK (unsupported_state_behavior = 'hard_block'),
  status TEXT NOT NULL CHECK (status IN ('approved','deprecated','retired')),
  provenance_ref TEXT NOT NULL
    REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind,id,version,world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind,entity_id,version,world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_traversal_availability_values (
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  dimension_id TEXT NOT NULL,
  value_id TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('allowed','hard_block')),
  canonical_ordinal INTEGER NOT NULL CHECK (canonical_ordinal >= 0),
  PRIMARY KEY (policy_id, policy_version, dimension_id, value_id),
  UNIQUE (policy_id, policy_version, dimension_id, canonical_ordinal),
  FOREIGN KEY (policy_id, policy_version)
    REFERENCES world_base.spatial_v3_traversal_availability_policies(id,version)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_traversal_check_policies (
  entity_kind TEXT NOT NULL DEFAULT 'traversal_check_policy'
    CHECK (entity_kind = 'traversal_check_policy'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  activation_domain TEXT NOT NULL
    CHECK (activation_domain IN ('craft_control','orientation')),
  characteristic_id TEXT NOT NULL,
  modifier_skill_id TEXT NOT NULL,
  one_factor_dc INTEGER NOT NULL CHECK (one_factor_dc > 0),
  two_factor_dc INTEGER NOT NULL CHECK (two_factor_dc > one_factor_dc),
  maximum_factor_count INTEGER NOT NULL CHECK (maximum_factor_count = 2),
  identity_scope_kind TEXT NOT NULL
    CHECK (identity_scope_kind = 'traversal_interval_result_id'),
  status TEXT NOT NULL CHECK (status IN ('approved','deprecated','retired')),
  provenance_ref TEXT NOT NULL
    REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind,id,version,world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind,entity_id,version,world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_traversal_check_triggers (
  check_policy_id TEXT NOT NULL,
  check_policy_version INTEGER NOT NULL,
  trigger_id TEXT NOT NULL,
  canonical_ordinal INTEGER NOT NULL CHECK (canonical_ordinal >= 0),
  PRIMARY KEY (check_policy_id, check_policy_version, trigger_id),
  UNIQUE (check_policy_id, check_policy_version, canonical_ordinal),
  FOREIGN KEY (check_policy_id, check_policy_version)
    REFERENCES world_base.spatial_v3_traversal_check_policies(id,version)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_traversal_consequence_policies (
  entity_kind TEXT NOT NULL DEFAULT 'traversal_consequence_policy'
    CHECK (entity_kind = 'traversal_consequence_policy'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  pre_progress_elapsed_minutes INTEGER NOT NULL
    CHECK (pre_progress_elapsed_minutes = 0),
  pre_progress_progress_ppm INTEGER NOT NULL
    CHECK (pre_progress_progress_ppm = 0),
  positive_progress_delay_minutes INTEGER NOT NULL
    CHECK (positive_progress_delay_minutes >= 0),
  positive_progress_energy_delta INTEGER NOT NULL
    CHECK (positive_progress_energy_delta <= 0),
  condition_candidate_id TEXT,
  first_failure_state TEXT NOT NULL
    CHECK (first_failure_state = 'paused_in_transit'),
  repeated_failure_state TEXT NOT NULL
    CHECK (repeated_failure_state = 'stranded_in_transit'),
  preserves_committed_elapsed BOOLEAN NOT NULL CHECK (preserves_committed_elapsed),
  preserves_committed_progress BOOLEAN NOT NULL CHECK (preserves_committed_progress),
  fatality_allowed BOOLEAN NOT NULL CHECK (NOT fatality_allowed),
  craft_destruction_allowed BOOLEAN NOT NULL CHECK (NOT craft_destruction_allowed),
  inventory_wipe_allowed BOOLEAN NOT NULL CHECK (NOT inventory_wipe_allowed),
  status TEXT NOT NULL CHECK (status IN ('approved','deprecated','retired')),
  provenance_ref TEXT NOT NULL
    REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind,id,version,world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind,entity_id,version,world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_traversal_risk_profiles (
  entity_kind TEXT NOT NULL DEFAULT 'traversal_risk_profile'
    CHECK (entity_kind = 'traversal_risk_profile'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  environment_profile_id TEXT NOT NULL,
  environment_profile_version INTEGER NOT NULL CHECK (environment_profile_version > 0),
  activation_kind TEXT NOT NULL
    CHECK (activation_kind = 'environment_or_craft_state_trigger_only'),
  severity_band TEXT NOT NULL,
  random_draw_allowed BOOLEAN NOT NULL CHECK (NOT random_draw_allowed),
  mixed_check_domain_behavior TEXT NOT NULL
    CHECK (mixed_check_domain_behavior = 'hard_block'),
  consequence_policy_id TEXT NOT NULL,
  consequence_policy_version INTEGER NOT NULL CHECK (consequence_policy_version > 0),
  status TEXT NOT NULL CHECK (status IN ('approved','deprecated','retired')),
  provenance_ref TEXT NOT NULL
    REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind,id,version,world_revision_id)
    REFERENCES world_base.spatial_v3_authoring_versions(
      entity_kind,entity_id,version,world_revision_id
    ) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (environment_profile_id,environment_profile_version,world_revision_id)
    REFERENCES world_base.spatial_v3_transition_environment_profiles(
      id,version,world_revision_id
    ) ON DELETE RESTRICT,
  FOREIGN KEY (consequence_policy_id,consequence_policy_version,world_revision_id)
    REFERENCES world_base.spatial_v3_traversal_consequence_policies(
      id,version,world_revision_id
    ) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_traversal_risk_check_bindings (
  risk_profile_id TEXT NOT NULL,
  risk_profile_version INTEGER NOT NULL,
  check_domain TEXT NOT NULL
    CHECK (check_domain IN ('craft_control','orientation')),
  check_policy_id TEXT NOT NULL,
  check_policy_version INTEGER NOT NULL,
  canonical_ordinal INTEGER NOT NULL CHECK (canonical_ordinal >= 0),
  PRIMARY KEY (risk_profile_id, risk_profile_version, check_domain),
  UNIQUE (risk_profile_id, risk_profile_version, canonical_ordinal),
  FOREIGN KEY (risk_profile_id, risk_profile_version)
    REFERENCES world_base.spatial_v3_traversal_risk_profiles(id,version)
    ON DELETE CASCADE,
  FOREIGN KEY (check_policy_id, check_policy_version)
    REFERENCES world_base.spatial_v3_traversal_check_policies(id,version)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_traversal_risk_hazards (
  risk_profile_id TEXT NOT NULL,
  risk_profile_version INTEGER NOT NULL,
  hazard_class_id TEXT NOT NULL,
  canonical_ordinal INTEGER NOT NULL CHECK (canonical_ordinal >= 0),
  PRIMARY KEY (risk_profile_id, risk_profile_version, hazard_class_id),
  UNIQUE (risk_profile_id, risk_profile_version, canonical_ordinal),
  FOREIGN KEY (risk_profile_id, risk_profile_version)
    REFERENCES world_base.spatial_v3_traversal_risk_profiles(id,version)
    ON DELETE CASCADE
);

GRANT SELECT ON
  world_base.spatial_v3_traversal_availability_policies,
  world_base.spatial_v3_traversal_availability_values,
  world_base.spatial_v3_traversal_check_policies,
  world_base.spatial_v3_traversal_check_triggers,
  world_base.spatial_v3_traversal_consequence_policies,
  world_base.spatial_v3_traversal_risk_profiles,
  world_base.spatial_v3_traversal_risk_check_bindings,
  world_base.spatial_v3_traversal_risk_hazards
TO world_reader;
