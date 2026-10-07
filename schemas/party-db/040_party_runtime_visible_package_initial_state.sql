ALTER TABLE party_runtime.party_visible_packages
  DROP CONSTRAINT IF EXISTS party_visible_packages_committed_state_version_check;

ALTER TABLE party_runtime.party_visible_packages
  ADD CONSTRAINT party_visible_packages_committed_state_version_check
  CHECK (committed_state_version >= 0);
