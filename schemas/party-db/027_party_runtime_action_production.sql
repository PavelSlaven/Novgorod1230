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
