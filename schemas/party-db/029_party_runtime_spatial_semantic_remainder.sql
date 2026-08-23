CREATE TABLE IF NOT EXISTS party_runtime.party_spatial_semantic_envelopes (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE RESTRICT,
  envelope_ref text NOT NULL CHECK (envelope_ref<>''),
  envelope jsonb NOT NULL,
  capacity_total bigint NOT NULL CHECK (capacity_total>=1),
  consumed_count bigint NOT NULL DEFAULT 0 CHECK (consumed_count BETWEEN 0 AND capacity_total),
  state_version bigint NOT NULL CHECK (state_version>=1),
  status text NOT NULL CHECK (status='committed'),
  created_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY (party_id,envelope_ref),
  CHECK (envelope->>'envelope_ref'=envelope_ref),
  CHECK (party_runtime.runtime_item_jsonb_exact_keys(envelope, ARRAY[
    'envelope_ref','kind','scope_kind','structural_variant','available_mechanics','baseline_ref','g5_ref','g6_ref',
    'position_ref','property_ref','function_ref','environment_ref','semantic_context','profile_ref',
    'profile_version','policy_ref','policy_version','baseline_state_version','g5_state_version',
    'g6_state_version','position_state_version','capacity_total','consumed_count','state_version'
  ])),
  CHECK ((envelope->>'capacity_total')::bigint=capacity_total
    AND (envelope->>'consumed_count')::bigint=consumed_count
    AND (envelope->>'state_version')::bigint=state_version)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_spatial_semantic_resolutions (
  party_id text NOT NULL,
  request_id text NOT NULL CHECK (request_id<>''),
  local_ref text NOT NULL CHECK (local_ref<>''),
  envelope_ref text NOT NULL,
  position_ref text NOT NULL CHECK (position_ref<>''),
  root_turn_id text NOT NULL CHECK (root_turn_id<>''),
  step_index integer NOT NULL CHECK (step_index BETWEEN 1 AND 8),
  semantics jsonb NOT NULL,
  formal_spatial_refs jsonb NOT NULL,
  from_party_state_version bigint NOT NULL CHECK (from_party_state_version>=0),
  to_party_state_version bigint NOT NULL CHECK (to_party_state_version=from_party_state_version+1),
  p16_change_set_id text NOT NULL REFERENCES party_runtime.party_v3_change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id,request_id),
  UNIQUE (party_id,local_ref),
  FOREIGN KEY (party_id,envelope_ref) REFERENCES party_runtime.party_spatial_semantic_envelopes(party_id,envelope_ref) ON DELETE RESTRICT,
  CHECK (semantics->>'name' IS NOT NULL AND semantics->>'description' IS NOT NULL
    AND formal_spatial_refs->>'schema'='rus.s1_formal_spatial_refs.v1'
    AND formal_spatial_refs->>'status'='materialized')
);
