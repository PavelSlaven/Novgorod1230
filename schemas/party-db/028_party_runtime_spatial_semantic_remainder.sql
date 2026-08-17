-- S1 is dynamic, party-scoped semantic state.  It deliberately has no FK to
-- party_scene_baselines: a semantic remainder must never mutate topology.
CREATE TABLE IF NOT EXISTS party_runtime.party_spatial_semantic_envelopes (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE RESTRICT,
  envelope_ref text NOT NULL CHECK (envelope_ref<>''),
  envelope jsonb NOT NULL,
  capacity jsonb NOT NULL,
  authority_state_version bigint NOT NULL CHECK (authority_state_version>=1),
  authority_digest text NOT NULL CHECK (authority_digest ~ '^sha256:[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status='committed'),
  created_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY (party_id,envelope_ref),
  CHECK (envelope->>'envelope_ref'=envelope_ref),
  CHECK (party_runtime.runtime_item_jsonb_exact_keys(capacity, ARRAY['total','reserved','remaining'])),
  CHECK ((capacity->>'total')::bigint >= 1 AND (capacity->>'reserved')::bigint >= 0
    AND (capacity->>'remaining')::bigint >= 0
    AND (capacity->>'total')::bigint=(capacity->>'reserved')::bigint+(capacity->>'remaining')::bigint),
  CHECK (party_runtime.runtime_item_jsonb_exact_keys(envelope, ARRAY[
    'envelope_ref','kind','baseline_ref','g5_ref','g6_ref','position_ref',
    'template_ref','property_ref','function_ref','environment_ref','structural_primitive',
    'profile_ref','profile_version','profile_digest','policy_ref','policy_version',
    'baseline_state_version','g5_state_version','g6_state_version',
    'position_state_version','allowed_descriptors']))
);

CREATE TABLE IF NOT EXISTS party_runtime.party_spatial_semantic_reservations (
  party_id text NOT NULL,
  reservation_ref text NOT NULL CHECK (reservation_ref<>''),
  envelope_ref text NOT NULL,
  reservation_state_version bigint NOT NULL CHECK (reservation_state_version>=1),
  capacity jsonb NOT NULL,
  reservation_digest text NOT NULL CHECK (reservation_digest ~ '^sha256:[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('committed_reserved','committed_consumed')),
  reserved_at_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  consumed_at_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY (party_id,reservation_ref),
  FOREIGN KEY (party_id,envelope_ref) REFERENCES party_runtime.party_spatial_semantic_envelopes(party_id,envelope_ref) ON DELETE RESTRICT,
  CHECK (party_runtime.runtime_item_jsonb_exact_keys(capacity, ARRAY['total','reserved','remaining'])),
  CHECK ((capacity->>'total')::bigint >= 1 AND (capacity->>'reserved')::bigint >= 0
    AND (capacity->>'remaining')::bigint >= 0
    AND (capacity->>'total')::bigint=(capacity->>'reserved')::bigint+(capacity->>'remaining')::bigint),
  CHECK ((status='committed_reserved')=(consumed_at_change_set_id IS NULL))
);

CREATE TABLE IF NOT EXISTS party_runtime.party_spatial_semantic_resolutions (
  party_id text NOT NULL,
  request_id text NOT NULL CHECK (request_id<>''),
  reservation_ref text NOT NULL,
  structural_identity text NOT NULL CHECK (structural_identity<>''),
  causal_request_ref text NOT NULL CHECK (causal_request_ref<>''),
  root_turn_id text NOT NULL CHECK (root_turn_id<>''),
  action_ref text NOT NULL CHECK (action_ref<>''),
  step_index integer NOT NULL CHECK (step_index BETWEEN 1 AND 8),
  sealed_resolution jsonb NOT NULL,
  resolution_digest text NOT NULL CHECK (resolution_digest ~ '^sha256:[0-9a-f]{64}$'),
  from_party_state_version bigint NOT NULL CHECK (from_party_state_version>=0),
  to_party_state_version bigint NOT NULL CHECK (to_party_state_version=from_party_state_version+1),
  p16_change_set_id text NOT NULL REFERENCES party_runtime.party_v3_change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  write_plan_digest text NOT NULL CHECK (write_plan_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id,request_id),
  UNIQUE (party_id,reservation_ref),
  UNIQUE (party_id,structural_identity),
  FOREIGN KEY (party_id,reservation_ref) REFERENCES party_runtime.party_spatial_semantic_reservations(party_id,reservation_ref) ON DELETE RESTRICT,
  CHECK (sealed_resolution->>'schema'='rus.s1_spatial_semantic_resolution.v1'
    AND sealed_resolution->>'request_id'=request_id
    AND sealed_resolution->>'causal_request_ref'=causal_request_ref)
);
