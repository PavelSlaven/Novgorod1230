-- CR #158 / R-1b: D-1 schedule routine rules and D-2 place population composition.

CREATE TABLE IF NOT EXISTS world_base.npc_schedule_routine_rules (
  schedule_id TEXT NOT NULL CHECK (length(btrim(schedule_id)) > 0),
  schedule_version INTEGER NOT NULL CHECK (schedule_version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('place_family')),
  scope_ref TEXT NOT NULL CHECK (scope_ref ~ '^pf_'),
  subject_kind TEXT NOT NULL
    CHECK (subject_kind IN ('occupation', 'social_role', 'household_member')),
  subject_ref TEXT NOT NULL CHECK (length(btrim(subject_ref)) > 0),
  season TEXT NOT NULL CHECK (season IN ('winter', 'spring', 'summer', 'autumn')),
  months INTEGER[] CHECK (
    months IS NULL
    OR (
      array_length(months, 1) >= 1
      AND months <@ ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::integer[]
    )
  ),
  day_type TEXT NOT NULL CHECK (length(btrim(day_type)) > 0),
  routine_profile JSONB NOT NULL
    CHECK (jsonb_typeof(routine_profile) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  provenance_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  authoring_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(authoring_payload) = 'object'),
  PRIMARY KEY (schedule_id, schedule_version),
  UNIQUE (schedule_id, schedule_version, world_revision_id)
);

CREATE INDEX IF NOT EXISTS npc_schedule_routine_rules_scope_idx
  ON world_base.npc_schedule_routine_rules (world_revision_id, scope_kind, scope_ref);
CREATE INDEX IF NOT EXISTS npc_schedule_routine_rules_subject_idx
  ON world_base.npc_schedule_routine_rules (subject_kind, subject_ref);

CREATE TABLE IF NOT EXISTS world_base.place_population_composition_rules (
  composition_id TEXT NOT NULL CHECK (composition_id ~ '^pf_'),
  composition_version INTEGER NOT NULL CHECK (composition_version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  place_family_id TEXT NOT NULL,
  place_family_version INTEGER NOT NULL CHECK (place_family_version > 0),
  population_groups JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(population_groups) = 'array'),
  scheduled_absences JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(scheduled_absences) = 'array'),
  empty_reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  provenance_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  authoring_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(authoring_payload) = 'object'),
  PRIMARY KEY (composition_id, composition_version),
  UNIQUE (composition_id, composition_version, world_revision_id),
  FOREIGN KEY (place_family_id, place_family_version, world_revision_id)
    REFERENCES world_base.place_families(id, version, world_revision_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS place_population_composition_pf_uq
  ON world_base.place_population_composition_rules (world_revision_id, place_family_id, composition_version);
