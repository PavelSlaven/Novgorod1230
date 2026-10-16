-- Non-portal canonical site connections may have no availability condition set.
ALTER TABLE world_base.spatial_v3_canonical_g5_connection_profiles
  ALTER COLUMN availability_condition_set_ref DROP NOT NULL;
ALTER TABLE world_base.spatial_v3_canonical_g5_connection_profiles
  ADD CONSTRAINT spatial_v3_route_profile_requires_availability
  CHECK (profile_scope = 'site_connection' OR availability_condition_set_ref IS NOT NULL);
