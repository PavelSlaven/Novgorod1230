-- PR8 environment feature state. Apply after 001_party_runtime.sql.
CREATE TABLE IF NOT EXISTS party_runtime.party_environment_runs (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  world_revision_id TEXT NOT NULL,
  g1_id TEXT NOT NULL,
  run_kind TEXT NOT NULL CHECK (run_kind IN ('baseline','update')),
  seed_digest TEXT,
  input_digest TEXT NOT NULL,
  catalog_digest TEXT NOT NULL,
  materializer_version TEXT NOT NULL,
  rng_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','committed','blocked','rolled_back')),
  validation_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (party_id, run_id),
  UNIQUE (party_id, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS party_environment_baseline_once
  ON party_runtime.party_environment_runs (party_id, world_revision_id, g1_id, materializer_version)
  WHERE run_kind = 'baseline' AND status = 'committed';
CREATE TABLE IF NOT EXISTS party_runtime.party_environment_choices (
  party_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  choice_ordinal INTEGER NOT NULL CHECK (choice_ordinal >= 0),
  choice_key TEXT NOT NULL,
  candidate_set_digest TEXT NOT NULL,
  candidate_ids JSONB NOT NULL,
  selected_id TEXT NOT NULL,
  selected_weight INTEGER,
  rng_draw BIGINT,
  rng_counter INTEGER,
  rejection_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, run_id, choice_ordinal),
  FOREIGN KEY (party_id, run_id) REFERENCES party_runtime.party_environment_runs(party_id, run_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS party_runtime.party_environment_landmarks (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  landmark_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  g1_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  location_binding TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','damaged','destroyed')),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, landmark_id),
  FOREIGN KEY (party_id, run_id) REFERENCES party_runtime.party_environment_runs(party_id, run_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS party_runtime.party_environment_cues (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  cue_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  g1_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  emission_rule_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  location_binding TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','fading','expired')),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, cue_id),
  FOREIGN KEY (party_id, run_id) REFERENCES party_runtime.party_environment_runs(party_id, run_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS party_runtime.party_environment_traces (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  trace_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  g1_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  creation_rule_id TEXT NOT NULL,
  decay_profile_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  cause_event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  location_binding TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('fresh','readable','faint','erased')),
  strength NUMERIC NOT NULL CHECK (strength >= 0 AND strength <= 1),
  age_minutes INTEGER NOT NULL CHECK (age_minutes >= 0),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, trace_id),
  FOREIGN KEY (party_id, run_id) REFERENCES party_runtime.party_environment_runs(party_id, run_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS party_runtime.party_landmark_g5_bindings (
  party_id TEXT NOT NULL,
  landmark_id TEXT NOT NULL,
  g5_anchor_id TEXT NOT NULL,
  projection_kind TEXT NOT NULL,
  PRIMARY KEY (party_id, landmark_id, g5_anchor_id),
  FOREIGN KEY (party_id, landmark_id) REFERENCES party_runtime.party_environment_landmarks(party_id, landmark_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, g5_anchor_id) REFERENCES party_runtime.party_g5_anchors(party_id, anchor_id) ON DELETE CASCADE
);
