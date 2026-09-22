ALTER TABLE party_runtime.party_actor_profile_bindings
  ADD COLUMN IF NOT EXISTS attribute_profile_snapshot jsonb;
