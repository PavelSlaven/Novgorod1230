ALTER TABLE party_runtime.party_perception_records
  DROP CONSTRAINT IF EXISTS party_perception_records_result_kind_check;
ALTER TABLE party_runtime.party_perception_records
  ADD CONSTRAINT party_perception_records_result_kind_check
  CHECK (result_kind IN (
    'not_perceived',
    'perceived_unidentified',
    'perceived_partial',
    'recognized',
    'misinterpreted'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS party_v3_change_sets_party_identity_key
  ON party_runtime.party_v3_change_sets (party_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS party_perception_records_party_identity_key
  ON party_runtime.party_perception_records (party_id, perception_id);

CREATE UNIQUE INDEX IF NOT EXISTS party_npc_decision_traces_party_identity_key
  ON party_runtime.party_npc_decision_traces (party_id, request_id);

CREATE TABLE IF NOT EXISTS party_runtime.party_perception_replay_evidence (
  perception_id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  canonical_input_digest text NOT NULL,
  perception_digest text NOT NULL,
  expected_state_versions_digest text NOT NULL,
  dependency_pins_digest text NOT NULL,
  policy_versions_digest text NOT NULL,
  idempotency_key text NOT NULL,
  canonical_digest text NOT NULL,
  change_set_id text NOT NULL,
  FOREIGN KEY (party_id, perception_id)
    REFERENCES party_runtime.party_perception_records(party_id, perception_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id) ON DELETE RESTRICT,
  UNIQUE (party_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_npc_reaction_consequences (
  request_id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL,
  perception_id text NOT NULL,
  option_id text NOT NULL,
  command_ref jsonb NOT NULL,
  handler_id text NOT NULL,
  consequence_contract_name text NOT NULL,
  consequence_payload jsonb NOT NULL,
  state_version bigint NOT NULL CHECK (state_version >= 1),
  proposed_at_whole_minutes numeric NOT NULL,
  proposed_at_subminute_numerator numeric NOT NULL,
  proposed_at_subminute_denominator numeric NOT NULL,
  dependency_pins jsonb NOT NULL,
  canonical_input_digest text NOT NULL,
  canonical_digest text NOT NULL,
  change_set_id text NOT NULL,
  idempotency_key text NOT NULL,
  FOREIGN KEY (party_id, npc_id)
    REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, request_id)
    REFERENCES party_runtime.party_npc_decision_traces(party_id, request_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, perception_id)
    REFERENCES party_runtime.party_perception_records(party_id, perception_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id) ON DELETE RESTRICT,
  CHECK (party_runtime.game_timestamp_parts_valid(
    proposed_at_whole_minutes,
    proposed_at_subminute_numerator,
    proposed_at_subminute_denominator
  )),
  UNIQUE (party_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_npc_knowledge_merge_states (
  party_id text NOT NULL,
  npc_id text NOT NULL,
  state_version bigint NOT NULL CHECK (state_version >= 1),
  last_proposal_id text,
  last_result_digest text,
  updated_change_set_id text NOT NULL,
  PRIMARY KEY (party_id, npc_id),
  FOREIGN KEY (party_id, npc_id)
    REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS party_runtime.party_npc_knowledge_merge_results (
  proposal_id text PRIMARY KEY,
  party_id text NOT NULL,
  npc_id text NOT NULL,
  source_perception_id text NOT NULL,
  state_version_before bigint NOT NULL CHECK (state_version_before >= 1),
  state_version_after bigint NOT NULL CHECK (state_version_after >= 1),
  state_changed boolean NOT NULL,
  proposal jsonb NOT NULL,
  state_before_fact_refs jsonb NOT NULL,
  state_before_hypothesis_refs jsonb NOT NULL,
  accepted_fact_refs jsonb NOT NULL,
  accepted_hypothesis_refs jsonb NOT NULL,
  dependency_pins jsonb NOT NULL,
  result_digest text NOT NULL,
  change_set_id text NOT NULL,
  idempotency_key text NOT NULL,
  FOREIGN KEY (party_id, npc_id)
    REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, source_perception_id)
    REFERENCES party_runtime.party_perception_records(party_id, perception_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id) ON DELETE RESTRICT,
  CHECK (
    state_version_after =
      state_version_before + CASE WHEN state_changed THEN 1 ELSE 0 END
  ),
  UNIQUE (party_id, idempotency_key)
);

ALTER TABLE party_runtime.party_npc_knowledge
  ADD COLUMN IF NOT EXISTS target_contract_version text,
  ADD COLUMN IF NOT EXISTS knowledge_ref_kind text,
  ADD COLUMN IF NOT EXISTS knowledge_classification text,
  ADD COLUMN IF NOT EXISTS source_perception_id text,
  ADD COLUMN IF NOT EXISTS proposal_id text,
  ADD COLUMN IF NOT EXISTS merge_state_version bigint,
  ADD COLUMN IF NOT EXISTS result_digest text,
  ADD COLUMN IF NOT EXISTS dependency_pins jsonb,
  ADD COLUMN IF NOT EXISTS updated_change_set_id text;

ALTER TABLE party_runtime.party_npc_knowledge
  DROP CONSTRAINT IF EXISTS party_npc_knowledge_target_branch_valid;
ALTER TABLE party_runtime.party_npc_knowledge
  ADD CONSTRAINT party_npc_knowledge_target_branch_valid CHECK (
    (
      target_contract_version IS NULL
      AND knowledge_ref_kind IS NULL
      AND knowledge_classification IS NULL
      AND source_perception_id IS NULL
      AND proposal_id IS NULL
      AND merge_state_version IS NULL
      AND result_digest IS NULL
      AND dependency_pins IS NULL
      AND updated_change_set_id IS NULL
    )
    OR
    (
      target_contract_version = '4.4.0-target.1'
      AND knowledge_ref_kind IS NOT NULL
      AND knowledge_classification IN ('fact','hypothesis')
      AND source_perception_id IS NOT NULL
      AND proposal_id IS NOT NULL
      AND merge_state_version >= 1
      AND result_digest IS NOT NULL
      AND dependency_pins IS NOT NULL
      AND updated_change_set_id IS NOT NULL
    )
  );

ALTER TABLE party_runtime.party_npc_knowledge
  DROP CONSTRAINT IF EXISTS party_npc_knowledge_source_perception_fk;
ALTER TABLE party_runtime.party_npc_knowledge
  ADD CONSTRAINT party_npc_knowledge_source_perception_fk
  FOREIGN KEY (party_id, source_perception_id)
  REFERENCES party_runtime.party_perception_records(party_id, perception_id) ON DELETE RESTRICT;

ALTER TABLE party_runtime.party_npc_knowledge
  DROP CONSTRAINT IF EXISTS party_npc_knowledge_target_change_set_fk;
ALTER TABLE party_runtime.party_npc_knowledge
  ADD CONSTRAINT party_npc_knowledge_target_change_set_fk
  FOREIGN KEY (party_id, updated_change_set_id)
  REFERENCES party_runtime.party_v3_change_sets(party_id, id) ON DELETE RESTRICT;
