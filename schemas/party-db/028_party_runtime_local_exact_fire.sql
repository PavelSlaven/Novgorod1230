CREATE TABLE IF NOT EXISTS party_runtime.party_local_world_processes (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id)
    ON DELETE RESTRICT,
  process_ref text NOT NULL,
  context_ref text NOT NULL CHECK (context_ref<>''),
  rule_ref jsonb NOT NULL,
  policy_ref jsonb NOT NULL,
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
  FOREIGN KEY (party_id,last_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK ((status='active')=(next_boundary_at IS NOT NULL)),
  CHECK (jsonb_typeof(rule_ref)='object' AND jsonb_typeof(policy_ref)='object'),
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
