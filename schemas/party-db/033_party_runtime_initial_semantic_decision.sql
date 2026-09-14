ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_state_version_check;

ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_state_version_check
  CHECK (state_version >= 0);
