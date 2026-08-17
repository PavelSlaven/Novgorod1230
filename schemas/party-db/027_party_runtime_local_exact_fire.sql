CREATE TABLE IF NOT EXISTS party_runtime.party_local_fire_authorities (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id)
    ON DELETE RESTRICT,
  context_ref text NOT NULL CHECK (context_ref <> ''),
  profile_ref text NOT NULL CHECK (profile_ref <> ''),
  profile_version text NOT NULL CHECK (profile_version <> ''),
  policy_ref text NOT NULL CHECK (policy_ref <> ''),
  policy_version integer NOT NULL CHECK (policy_version = 1),
  scope_ref text NOT NULL CHECK (scope_ref <> ''),
  ignition_basis_item_id text NOT NULL,
  approved_fuel_item_ids jsonb NOT NULL CHECK (
    jsonb_typeof(approved_fuel_item_ids)='array'
    AND jsonb_array_length(approved_fuel_item_ids)>0
  ),
  recheck_interval jsonb NOT NULL CHECK (
    party_runtime.runtime_item_jsonb_exact_keys(
      recheck_interval, ARRAY['exact_minutes'])
    AND party_runtime.runtime_item_jsonb_exact_keys(
      recheck_interval->'exact_minutes', ARRAY['numerator','denominator'])
    AND (recheck_interval->'exact_minutes'->>'numerator')::numeric > 0
    AND (recheck_interval->'exact_minutes'->>'denominator')::numeric > 0
  ),
  fuel_unit_mass_grams_min integer NOT NULL CHECK (
    fuel_unit_mass_grams_min > 0),
  fuel_unit_mass_grams_max integer NOT NULL CHECK (
    fuel_unit_mass_grams_max >= fuel_unit_mass_grams_min),
  authority_state_version bigint NOT NULL CHECK (
    authority_state_version BETWEEN 1 AND 9007199254740991),
  authority_digest text NOT NULL CHECK (
    authority_digest ~ '^sha256:[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status='committed'),
  PRIMARY KEY (party_id,context_ref),
  FOREIGN KEY (party_id,ignition_basis_item_id)
    REFERENCES party_runtime.party_items(party_id,item_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS party_runtime.party_local_world_processes (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id)
    ON DELETE RESTRICT,
  process_ref text NOT NULL,
  context_ref text NOT NULL,
  process_mode text NOT NULL CHECK (process_mode='local_exact'),
  process_kind text NOT NULL CHECK (process_kind='fire'),
  scope_ref text NOT NULL CHECK (scope_ref<>''),
  causal_basis_ref text NOT NULL CHECK (causal_basis_ref<>''),
  status text NOT NULL CHECK (status IN ('active','completed')),
  started_at jsonb NOT NULL,
  next_boundary_at jsonb,
  process_state jsonb NOT NULL,
  state_version bigint NOT NULL CHECK (
    state_version BETWEEN 1 AND 9007199254740991),
  last_change_set_id text NOT NULL,
  PRIMARY KEY (party_id,process_ref),
  FOREIGN KEY (party_id,context_ref)
    REFERENCES party_runtime.party_local_fire_authorities(party_id,context_ref)
    ON DELETE RESTRICT,
  FOREIGN KEY (party_id,last_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK ((status='active')=(next_boundary_at IS NOT NULL)),
  CHECK (
    party_runtime.runtime_item_jsonb_exact_keys(
      process_state, ARRAY['schema','process_ref','process_mode','process_kind',
        'scope_ref','causal_basis_ref','status','started_at','next_boundary_at',
        'fuel_bindings','state_version'])
    AND process_state->>'schema'='local_world_process_state_v1'
    AND process_state->>'process_ref'=process_ref
    AND process_state->>'process_mode'=process_mode
    AND process_state->>'process_kind'=process_kind
    AND process_state->>'scope_ref'=scope_ref
    AND process_state->>'causal_basis_ref'=causal_basis_ref
    AND process_state->>'status'=status
    AND (process_state->>'state_version')::bigint=state_version
    AND process_state->'started_at'=started_at
    AND ((next_boundary_at IS NULL
          AND process_state->'next_boundary_at'='null'::jsonb)
      OR (next_boundary_at IS NOT NULL
          AND process_state->'next_boundary_at'=next_boundary_at))
    AND jsonb_typeof(process_state->'fuel_bindings')='array'
  )
);

CREATE TABLE IF NOT EXISTS party_runtime.party_local_world_process_fuel_bindings (
  party_id text NOT NULL,
  process_ref text NOT NULL,
  fuel_item_id text NOT NULL,
  binding_ordinal integer NOT NULL CHECK (binding_ordinal>=0),
  bound_at_change_set_id text NOT NULL,
  released_at_change_set_id text,
  PRIMARY KEY (party_id,process_ref,fuel_item_id),
  UNIQUE (party_id,process_ref,binding_ordinal),
  FOREIGN KEY (party_id,process_ref)
    REFERENCES party_runtime.party_local_world_processes(party_id,process_ref)
    ON DELETE RESTRICT,
  FOREIGN KEY (party_id,fuel_item_id)
    REFERENCES party_runtime.party_items(party_id,item_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id,bound_at_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (party_id,released_at_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX IF NOT EXISTS
  party_local_world_process_fuel_active_unique
  ON party_runtime.party_local_world_process_fuel_bindings(party_id,fuel_item_id)
  WHERE released_at_change_set_id IS NULL;

CREATE TABLE IF NOT EXISTS party_runtime.party_local_world_process_commits (
  party_id text NOT NULL,
  request_id text NOT NULL,
  process_ref text NOT NULL,
  action text NOT NULL CHECK (action IN ('start','add_fuel','due_boundary')),
  root_turn_id text NOT NULL CHECK (root_turn_id<>''),
  action_ref text NOT NULL CHECK (action_ref<>''),
  step_index integer NOT NULL CHECK (step_index BETWEEN 1 AND 8),
  from_process_state_version bigint CHECK (from_process_state_version>=1),
  to_process_state_version bigint NOT NULL CHECK (to_process_state_version>=1),
  sealed_proposal jsonb NOT NULL,
  fuel_pin_evidence jsonb NOT NULL CHECK (
    party_runtime.runtime_item_jsonb_exact_keys(
      fuel_pin_evidence, ARRAY['ignition_basis_pin','fuel_pins'])
    AND jsonb_typeof(fuel_pin_evidence->'fuel_pins')='array'
    AND jsonb_typeof(fuel_pin_evidence->'ignition_basis_pin')='object'),
  write_plan_digest text NOT NULL CHECK (write_plan_digest ~ '^[0-9a-f]{64}$'),
  from_party_state_version bigint NOT NULL CHECK (from_party_state_version>=0),
  to_party_state_version bigint NOT NULL CHECK (
    to_party_state_version=from_party_state_version+1),
  p16_change_set_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id,request_id),
  UNIQUE (party_id,process_ref,to_process_state_version),
  FOREIGN KEY (party_id,process_ref)
    REFERENCES party_runtime.party_local_world_processes(party_id,process_ref)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (party_id,p16_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    party_runtime.runtime_item_jsonb_exact_keys(
      sealed_proposal, ARRAY['schema','version','status','action',
        'at_timestamp','causal_identity','policy_pin','process_before','process_after','outcome',
        'added_fuel_refs','retired_fuel_ref','subject_changed_refs',
        'proposal_digest'])
    AND sealed_proposal->>'schema'
      ='rus.world_processes.local_fire_transition_proposal.v1'
    AND sealed_proposal->>'version'='1'
    AND sealed_proposal->>'status'='sealed'
    AND sealed_proposal->>'action'=action
    AND sealed_proposal->'causal_identity'->>'request_id'=request_id
    AND sealed_proposal->'causal_identity'->>'root_turn_id'=root_turn_id
    AND sealed_proposal->'causal_identity'->>'action_ref'=action_ref
    AND (sealed_proposal->'causal_identity'->>'step_index')::integer=step_index
    AND sealed_proposal->'process_after'->>'process_ref'=process_ref
    AND (sealed_proposal->'process_after'->>'state_version')::bigint
      =to_process_state_version
  )
);
