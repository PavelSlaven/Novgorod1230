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
