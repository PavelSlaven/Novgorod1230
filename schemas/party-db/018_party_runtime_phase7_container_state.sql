-- Phase 7 keeps the authored tied closure state on the already materialized
-- road-bag container. No new relation or ownership model is introduced.

ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_closure_state_check;

ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_closure_state_check CHECK (
    closure_state IN ('open', 'closed', 'locked', 'unavailable', 'tied')
  );
