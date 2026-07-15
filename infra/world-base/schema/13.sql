-- PR8: travel authoring profiles and route bindings. No runtime instances or seed data.
CREATE TABLE world_base.travel_pace_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  pace_key TEXT NOT NULL CHECK (pace_key IN ('cautious','normal','forced')),
  time_multiplier NUMERIC NOT NULL CHECK (time_multiplier > 0),
  fatigue_multiplier NUMERIC NOT NULL CHECK (fatigue_multiplier >= 0),
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (world_revision_id, region_id, pace_key, valid_from, valid_to, status),
  CHECK (valid_to >= valid_from)
);
CREATE TABLE world_base.travel_navigation_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  navigation_key TEXT NOT NULL,
  orientation_policy JSONB NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  CHECK (valid_to >= valid_from),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.travel_rest_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  rest_key TEXT NOT NULL,
  minimum_minutes INTEGER NOT NULL CHECK (minimum_minutes > 0),
  rest_policy JSONB NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  CHECK (valid_to >= valid_from),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.travel_interruption_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  interruption_source_type TEXT NOT NULL CHECK (interruption_source_type IN ('weather','light','body','transport','route','due_timer','npc_process','social_checkpoint','signal','trace','player_command','arrival')),
  interruption_policy JSONB NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  CHECK (valid_to >= valid_from),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.route_travel_profile_bindings (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE RESTRICT,
  route_template_id TEXT NOT NULL REFERENCES world_base.route_templates(id) ON DELETE RESTRICT,
  pace_profile_id TEXT NOT NULL REFERENCES world_base.travel_pace_profiles(id) ON DELETE RESTRICT,
  navigation_profile_id TEXT NOT NULL REFERENCES world_base.travel_navigation_profiles(id) ON DELETE RESTRICT,
  rest_profile_id TEXT NOT NULL REFERENCES world_base.travel_rest_profiles(id) ON DELETE RESTRICT,
  interruption_profile_id TEXT NOT NULL REFERENCES world_base.travel_interruption_profiles(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (world_revision_id, region_id, route_template_id, pace_profile_id, navigation_profile_id, rest_profile_id, interruption_profile_id, valid_from, valid_to, status),
  CHECK (valid_to >= valid_from)
);
GRANT SELECT ON ALL TABLES IN SCHEMA world_base TO world_reader;
