-- A1 persists through the common P16 change set. It does not reuse the O1/O2a
-- presence ledger and does not weaken finite-resource evidence introduced by 024.
ALTER TABLE party_runtime.party_items
  ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 1;
ALTER TABLE party_runtime.party_items
  DROP CONSTRAINT IF EXISTS party_items_state_version_safe_check;
ALTER TABLE party_runtime.party_items
  ADD CONSTRAINT party_items_state_version_safe_check CHECK (
    state_version >= 1 AND state_version <= 9007199254740991
  );

-- 015's validator predates A1 updates and names both its argument and the
-- jsonb_array_elements output "value". Pin the function-local resolution to
-- SQL columns so updating a runtime snapshot cannot depend on session GUCs.
ALTER FUNCTION party_runtime.runtime_instance_mechanics_snapshot_valid(jsonb)
  SET plpgsql.variable_conflict = 'use_column';

CREATE TABLE IF NOT EXISTS party_runtime.party_action_production_authorities (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id)
    ON DELETE RESTRICT,
  actor_ref text NOT NULL CHECK (actor_ref <> ''),
  context_ref text NOT NULL CHECK (context_ref <> ''),
  profile_ref text NOT NULL CHECK (profile_ref <> ''),
  profile_version text NOT NULL CHECK (profile_version <> ''),
  policy_ref text NOT NULL CHECK (policy_ref <> ''),
  policy_version integer NOT NULL CHECK (policy_version = 1),
  max_new_entities integer NOT NULL CHECK (max_new_entities BETWEEN 1 AND 8),
  allowed_access_states jsonb NOT NULL CHECK (
    jsonb_typeof(allowed_access_states) = 'array'
    AND jsonb_array_length(allowed_access_states) > 0
  ),
  allowed_identity_modes jsonb NOT NULL CHECK (
    jsonb_typeof(allowed_identity_modes) = 'array'
    AND jsonb_array_length(allowed_identity_modes) > 0
  ),
  allowed_origins jsonb NOT NULL CHECK (jsonb_typeof(allowed_origins)='array'),
  allowed_result_classes jsonb NOT NULL CHECK (
    jsonb_typeof(allowed_result_classes) = 'array'
    AND jsonb_array_length(allowed_result_classes) > 0
  ),
  authority_state_version bigint NOT NULL CHECK (
    authority_state_version BETWEEN 1 AND 9007199254740991
  ),
  status text NOT NULL CHECK (status = 'committed'),
  authority_digest text NOT NULL CHECK (authority_digest ~ '^sha256:[0-9a-f]{64}$'),
  PRIMARY KEY (party_id,actor_ref,context_ref)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_action_production_commits (
  party_id text NOT NULL,
  request_id text NOT NULL,
  actor_ref text NOT NULL CHECK (actor_ref <> ''),
  context_ref text NOT NULL CHECK (context_ref <> ''),
  profile_ref text NOT NULL CHECK (profile_ref <> ''),
  profile_version text NOT NULL CHECK (profile_version <> ''),
  policy_ref text NOT NULL CHECK (policy_ref <> ''),
  policy_version integer NOT NULL CHECK (policy_version = 1),
  max_new_entities integer NOT NULL CHECK (max_new_entities BETWEEN 1 AND 8),
  authority_state_version bigint NOT NULL CHECK (authority_state_version >= 1),
  authority_digest text NOT NULL CHECK (authority_digest ~ '^sha256:[0-9a-f]{64}$'),
  root_turn_id text NOT NULL CHECK (root_turn_id <> ''),
  action_ref text NOT NULL CHECK (action_ref <> ''),
  step_index integer NOT NULL CHECK (step_index BETWEEN 1 AND 8),
  identity_mode text NOT NULL CHECK (identity_mode IN (
    'preserve_source','independent_outputs','no_useful_result'
  )),
  origin text CHECK (origin IS NULL OR origin IN ('direct_partition','crafted')),
  result_class text NOT NULL CHECK (result_class IN (
    'ordinary_physical_result','partial_transformation',
    'nonworking_construction','waste','written_carrier','no_useful_result'
  )),
  sealed_proposal jsonb NOT NULL,
  source_pin_evidence jsonb NOT NULL CHECK (
    jsonb_typeof(source_pin_evidence)='array'
    AND jsonb_array_length(source_pin_evidence)>0
  ),
  tool_pin_evidence jsonb NOT NULL CHECK (jsonb_typeof(tool_pin_evidence)='array'),
  result_set_evidence jsonb NOT NULL CHECK (
    party_runtime.runtime_item_jsonb_exact_keys(
      result_set_evidence,
      ARRAY['schema','identity_mode','result_item_ids','source_item_ids','tool_item_ids']
    )
    AND result_set_evidence->>'schema'
      = 'rus.items.action_production_result_set_evidence.v1'
    AND jsonb_typeof(result_set_evidence->'result_item_ids')='array'
    AND jsonb_typeof(result_set_evidence->'source_item_ids')='array'
    AND jsonb_typeof(result_set_evidence->'tool_item_ids')='array'
  ),
  write_plan_digest text NOT NULL CHECK (write_plan_digest ~ '^[0-9a-f]{64}$'),
  from_party_state_version bigint NOT NULL CHECK (
    from_party_state_version >= 0
    AND from_party_state_version <= 9007199254740991
  ),
  to_party_state_version bigint NOT NULL CHECK (
    to_party_state_version = from_party_state_version + 1
  ),
  p16_change_set_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id,request_id),
  UNIQUE (party_id,root_turn_id,action_ref,step_index),
  FOREIGN KEY (party_id,actor_ref,context_ref)
    REFERENCES party_runtime.party_action_production_authorities(
      party_id,actor_ref,context_ref
    ) ON DELETE RESTRICT,
  FOREIGN KEY (party_id,p16_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    party_runtime.runtime_item_jsonb_exact_keys(
      sealed_proposal,
      ARRAY['schema','version','status','causal_identity','context_pin',
        'technical_policy_pin','identity_mode','origin','result_class',
        'source_transitions','tool_state_pins','results','known_waste',
        'qualitative_result']
    )
    AND sealed_proposal->>'schema'
      = 'rus.items.action_produced_transition_proposal.v1'
    AND sealed_proposal->>'version'='1'
    AND sealed_proposal->>'status'='sealed'
    AND sealed_proposal->'causal_identity'->>'request_id'=request_id
    AND sealed_proposal->'causal_identity'->>'root_turn_id'=root_turn_id
    AND sealed_proposal->'causal_identity'->>'action_ref'=action_ref
    AND (sealed_proposal->'causal_identity'->>'step_index')::integer=step_index
    AND sealed_proposal->'context_pin'->>'context_ref'=context_ref
    AND sealed_proposal->'context_pin'->>'profile_ref'=profile_ref
    AND sealed_proposal->'context_pin'->>'profile_version'=profile_version
    AND party_runtime.runtime_item_jsonb_exact_keys(
      sealed_proposal->'technical_policy_pin',
      ARRAY['policy_ref','version','max_new_entities']
    )
    AND sealed_proposal->'technical_policy_pin'->>'policy_ref'=policy_ref
    AND (sealed_proposal->'technical_policy_pin'->>'version')::integer
      = policy_version
    AND (sealed_proposal->'technical_policy_pin'->>'max_new_entities')::integer
      = max_new_entities
    AND sealed_proposal->>'identity_mode'=identity_mode
    AND sealed_proposal->>'result_class'=result_class
    AND sealed_proposal->>'origin' IS NOT DISTINCT FROM origin
  )
);

CREATE TABLE IF NOT EXISTS
  party_runtime.party_action_production_resource_transitions (
  party_id text NOT NULL,
  request_id text NOT NULL,
  resource_node_id text NOT NULL,
  source_item_id text NOT NULL,
  expected_state_version bigint NOT NULL CHECK (expected_state_version >= 1),
  quantity_unit_ref jsonb NOT NULL CHECK (jsonb_typeof(quantity_unit_ref)='object'),
  before_numerator numeric NOT NULL CHECK (
    before_numerator >= 0
    AND party_runtime.integral_numeric(before_numerator)
  ),
  before_denominator numeric NOT NULL CHECK (
    before_denominator > 0
    AND party_runtime.integral_numeric(before_denominator)
    AND gcd(before_numerator,before_denominator)=1
  ),
  decrement_numerator numeric NOT NULL CHECK (
    decrement_numerator > 0
    AND party_runtime.integral_numeric(decrement_numerator)
  ),
  decrement_denominator numeric NOT NULL CHECK (
    decrement_denominator > 0
    AND party_runtime.integral_numeric(decrement_denominator)
    AND gcd(decrement_numerator,decrement_denominator)=1
  ),
  after_numerator numeric NOT NULL CHECK (
    after_numerator >= 0
    AND party_runtime.integral_numeric(after_numerator)
  ),
  after_denominator numeric NOT NULL CHECK (
    after_denominator > 0
    AND party_runtime.integral_numeric(after_denominator)
    AND gcd(after_numerator,after_denominator)=1
  ),
  lifecycle_state_after text NOT NULL CHECK (
    lifecycle_state_after IN ('active','depleted')
  ),
  p16_change_set_id text NOT NULL,
  PRIMARY KEY (party_id,request_id,resource_node_id),
  FOREIGN KEY (party_id,request_id)
    REFERENCES party_runtime.party_action_production_commits(party_id,request_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (party_id,resource_node_id)
    REFERENCES party_runtime.party_resource_nodes(party_id,resource_node_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (party_id,source_item_id)
    REFERENCES party_runtime.party_items(party_id,item_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id,p16_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    before_numerator * decrement_denominator * after_denominator
      = decrement_numerator * before_denominator * after_denominator
      + after_numerator * before_denominator * decrement_denominator
  ),
  CHECK ((lifecycle_state_after='depleted')=(after_numerator=0))
);
