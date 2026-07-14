CREATE SCHEMA IF NOT EXISTS party_runtime;
CREATE TABLE IF NOT EXISTS party_runtime.delivery_attempts (
  delivery_attempt_id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  attempt JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS party_runtime.delivery_acknowledgements (
  message_id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  result JSONB NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS party_runtime.commit_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  physical_plan_digest TEXT NOT NULL,
  status TEXT NOT NULL,
  committed_result JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS party_runtime.parties (
  party_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 2),
  world_revision_id TEXT NOT NULL,
  world_catalog_digest TEXT NOT NULL,
  materializer_version TEXT NOT NULL,
  rng_version TEXT NOT NULL,
  command_catalog_digest TEXT NOT NULL,
  profile_bundle_digest TEXT NOT NULL,
  state_version BIGINT NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('creating','active','blocked','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS party_runtime.party_server_sessions (
  party_id TEXT PRIMARY KEY REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  stage26_result JSONB,
  delivery_attempt JSONB,
  delivery_ack_result JSONB,
  screen JSONB NOT NULL,
  turn_number INTEGER NOT NULL CHECK (turn_number >= 0),
  last_turn_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS party_runtime.party_state_snapshots (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  state_version BIGINT NOT NULL,
  state_payload JSONB NOT NULL,
  state_digest TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (party_id, state_version)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_positions (
  party_id TEXT PRIMARY KEY REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  g4_id TEXT NOT NULL,
  g5_node_id TEXT,
  g5_anchor_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((g5_node_id IS NULL) = (g5_anchor_id IS NULL))
);
CREATE TABLE IF NOT EXISTS party_runtime.party_player_characters (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  profile JSONB NOT NULL,
  PRIMARY KEY (party_id, character_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_character_knowledge (
  party_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  knowledge_state TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (party_id, character_id, fact_id),
  FOREIGN KEY (party_id, character_id) REFERENCES party_runtime.party_player_characters(party_id, character_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS party_runtime.party_materialization_runs (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  g4_id TEXT NOT NULL,
  run_kind TEXT NOT NULL CHECK (run_kind IN ('baseline','expansion','repair')),
  occurrence INTEGER NOT NULL DEFAULT 0 CHECK (occurrence >= 0),
  seed_digest TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  catalog_digest TEXT NOT NULL,
  materializer_version TEXT NOT NULL,
  rng_version TEXT NOT NULL,
  result_digest TEXT NOT NULL,
  supersedes_run_id TEXT,
  repair_reason TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','committed','blocked','rolled_back')),
  validation_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at TIMESTAMPTZ,
  PRIMARY KEY (party_id, run_id),
  UNIQUE (party_id, idempotency_key),
  FOREIGN KEY (party_id, supersedes_run_id) REFERENCES party_runtime.party_materialization_runs(party_id, run_id) ON DELETE RESTRICT,
  CHECK ((run_kind = 'repair') = (supersedes_run_id IS NOT NULL AND repair_reason IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS party_materialization_baseline_unique
  ON party_runtime.party_materialization_runs (party_id, g4_id)
  WHERE run_kind = 'baseline' AND status = 'committed';
CREATE TABLE IF NOT EXISTS party_runtime.party_materialization_choices (
  party_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  choice_ordinal INTEGER NOT NULL,
  slot_key TEXT NOT NULL,
  candidate_set_digest TEXT NOT NULL,
  candidate_ids JSONB NOT NULL,
  selected_id TEXT NOT NULL,
  rng_draw BIGINT NOT NULL,
  PRIMARY KEY (party_id, run_id, choice_ordinal),
  FOREIGN KEY (party_id, run_id) REFERENCES party_runtime.party_materialization_runs(party_id, run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS party_runtime.party_g5_nodes (
  party_id TEXT NOT NULL,
  g5_node_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  parent_g4_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, g5_node_id),
  FOREIGN KEY (party_id, run_id) REFERENCES party_runtime.party_materialization_runs(party_id, run_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS party_runtime.party_g5_anchors (
  party_id TEXT NOT NULL,
  anchor_id TEXT NOT NULL,
  g5_node_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  npc_capacity INTEGER NOT NULL DEFAULT 0 CHECK (npc_capacity >= 0),
  item_capacity INTEGER NOT NULL DEFAULT 0 CHECK (item_capacity >= 0),
  container_capacity INTEGER NOT NULL DEFAULT 0 CHECK (container_capacity >= 0),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, anchor_id),
  UNIQUE (party_id, g5_node_id, anchor_id),
  FOREIGN KEY (party_id, g5_node_id) REFERENCES party_runtime.party_g5_nodes(party_id, g5_node_id) ON DELETE CASCADE
);
ALTER TABLE party_runtime.party_positions
  DROP CONSTRAINT IF EXISTS party_positions_g5_node_fk;
ALTER TABLE party_runtime.party_positions
  ADD CONSTRAINT party_positions_g5_node_fk FOREIGN KEY (party_id, g5_node_id) REFERENCES party_runtime.party_g5_nodes(party_id, g5_node_id) ON DELETE RESTRICT;
ALTER TABLE party_runtime.party_positions
  DROP CONSTRAINT IF EXISTS party_positions_g5_anchor_fk;
ALTER TABLE party_runtime.party_positions
  ADD CONSTRAINT party_positions_g5_anchor_fk FOREIGN KEY (party_id, g5_anchor_id) REFERENCES party_runtime.party_g5_anchors(party_id, anchor_id) ON DELETE RESTRICT;
ALTER TABLE party_runtime.party_positions
  DROP CONSTRAINT IF EXISTS party_positions_g5_pair_fk;
ALTER TABLE party_runtime.party_positions
  ADD CONSTRAINT party_positions_g5_pair_fk FOREIGN KEY (party_id, g5_node_id, g5_anchor_id) REFERENCES party_runtime.party_g5_anchors(party_id, g5_node_id, anchor_id) ON DELETE RESTRICT;
CREATE TABLE IF NOT EXISTS party_runtime.party_g5_edges (
  party_id TEXT NOT NULL,
  g5_edge_id TEXT NOT NULL,
  from_anchor_id TEXT NOT NULL,
  to_anchor_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, g5_edge_id),
  FOREIGN KEY (party_id, from_anchor_id) REFERENCES party_runtime.party_g5_anchors(party_id, anchor_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, to_anchor_id) REFERENCES party_runtime.party_g5_anchors(party_id, anchor_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS party_runtime.party_npcs (
  party_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  profile_set_id TEXT NOT NULL,
  profile_level TEXT NOT NULL CHECK (profile_level IN ('background','scene','key')),
  anchor_id TEXT,
  identity_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  machine_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  semantic_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, npc_id),
  FOREIGN KEY (party_id, run_id) REFERENCES party_runtime.party_materialization_runs(party_id, run_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, anchor_id) REFERENCES party_runtime.party_g5_anchors(party_id, anchor_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_traits (
  party_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  trait_domain TEXT NOT NULL,
  category_id TEXT NOT NULL,
  source_profile_id TEXT NOT NULL,
  PRIMARY KEY (party_id, npc_id, trait_domain, category_id),
  FOREIGN KEY (party_id, npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_relations (
  party_id TEXT NOT NULL,
  from_npc_id TEXT NOT NULL,
  to_npc_id TEXT NOT NULL,
  relation_category_id TEXT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, from_npc_id, to_npc_id, relation_category_id),
  FOREIGN KEY (party_id, from_npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, to_npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_knowledge (
  party_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  knowledge_state TEXT NOT NULL,
  PRIMARY KEY (party_id, npc_id, fact_id),
  FOREIGN KEY (party_id, npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_schedules (
  party_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  time_band TEXT NOT NULL,
  schedule_profile_id TEXT NOT NULL,
  g5_node_id TEXT,
  PRIMARY KEY (party_id, npc_id, time_band),
  FOREIGN KEY (party_id, npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, g5_node_id) REFERENCES party_runtime.party_g5_nodes(party_id, g5_node_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS party_runtime.party_containers (
  party_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  anchor_id TEXT,
  parent_container_id TEXT,
  holder_npc_id TEXT,
  holder_character_id TEXT,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, container_id),
  FOREIGN KEY (party_id, run_id) REFERENCES party_runtime.party_materialization_runs(party_id, run_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, anchor_id) REFERENCES party_runtime.party_g5_anchors(party_id, anchor_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, parent_container_id) REFERENCES party_runtime.party_containers(party_id, container_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, holder_npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, holder_character_id) REFERENCES party_runtime.party_player_characters(party_id, character_id) ON DELETE RESTRICT,
  CHECK ((CASE WHEN anchor_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN parent_container_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN holder_npc_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN holder_character_id IS NULL THEN 0 ELSE 1 END) = 1),
  CHECK (parent_container_id IS NULL OR parent_container_id <> container_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_items (
  party_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  condition_state TEXT NOT NULL,
  legal_status TEXT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, item_id),
  FOREIGN KEY (party_id, run_id) REFERENCES party_runtime.party_materialization_runs(party_id, run_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS party_runtime.party_item_placements (
  party_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  anchor_id TEXT,
  container_id TEXT,
  holder_npc_id TEXT,
  holder_character_id TEXT,
  PRIMARY KEY (party_id, item_id),
  FOREIGN KEY (party_id, item_id) REFERENCES party_runtime.party_items(party_id, item_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, anchor_id) REFERENCES party_runtime.party_g5_anchors(party_id, anchor_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, container_id) REFERENCES party_runtime.party_containers(party_id, container_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, holder_npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, holder_character_id) REFERENCES party_runtime.party_player_characters(party_id, character_id) ON DELETE RESTRICT,
  CHECK ((CASE WHEN anchor_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN container_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN holder_npc_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN holder_character_id IS NULL THEN 0 ELSE 1 END) = 1)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_ownership (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  ownership_id TEXT NOT NULL,
  item_id TEXT,
  container_id TEXT,
  owner_npc_id TEXT,
  owner_character_id TEXT,
  owner_party BOOLEAN NOT NULL DEFAULT false,
  controller_npc_id TEXT,
  claim_state TEXT NOT NULL,
  PRIMARY KEY (party_id, ownership_id),
  FOREIGN KEY (party_id, item_id) REFERENCES party_runtime.party_items(party_id, item_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, container_id) REFERENCES party_runtime.party_containers(party_id, container_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, owner_npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, owner_character_id) REFERENCES party_runtime.party_player_characters(party_id, character_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, controller_npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE RESTRICT,
  CHECK ((CASE WHEN item_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN container_id IS NULL THEN 0 ELSE 1 END) = 1),
  CHECK ((CASE WHEN owner_npc_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN owner_character_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN owner_party THEN 1 ELSE 0 END) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS party_ownership_item_unique ON party_runtime.party_ownership (party_id, item_id) WHERE item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS party_ownership_container_unique ON party_runtime.party_ownership (party_id, container_id) WHERE container_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS party_runtime.party_decision_requests (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    policy_version TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  state_version BIGINT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    options_digest TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','resolved','expired','rejected')),
    input_digest TEXT NOT NULL,
    validation_report JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (party_id, request_id),
    UNIQUE (party_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_decision_options (
  party_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  command_token_digest TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (party_id, request_id, option_id),
  FOREIGN KEY (party_id, request_id) REFERENCES party_runtime.party_decision_requests(party_id, request_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS party_runtime.party_decision_results (
  party_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  state_version BIGINT NOT NULL,
  response_digest TEXT NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (party_id, request_id),
  FOREIGN KEY (party_id, request_id, option_id) REFERENCES party_runtime.party_decision_options(party_id, request_id, option_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS party_runtime.party_change_sets (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  change_set_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  world_revision_id TEXT NOT NULL,
  catalog_digest TEXT NOT NULL,
  command_catalog_digest TEXT NOT NULL,
  profile_bundle_digest TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  base_state_version BIGINT NOT NULL,
  result_state_version BIGINT NOT NULL,
  source_kind TEXT NOT NULL,
  operations JSONB NOT NULL,
  validation_report JSONB NOT NULL,
  created_or_changed_refs JSONB NOT NULL,
  trace JSONB NOT NULL,
  committed_at TIMESTAMPTZ,
  PRIMARY KEY (party_id, change_set_id),
  UNIQUE (party_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_autonomous_updates (
  party_id TEXT NOT NULL,
  update_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  world_revision_id TEXT NOT NULL,
  catalog_digest TEXT NOT NULL,
  command_catalog_digest TEXT NOT NULL,
  profile_bundle_digest TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  change_set_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  base_state_version BIGINT NOT NULL,
  result_state_version BIGINT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','committed','cancelled','blocked')),
  validation_report JSONB NOT NULL,
  created_or_changed_refs JSONB NOT NULL,
  trace JSONB NOT NULL,
  PRIMARY KEY (party_id, update_id),
  UNIQUE (party_id, idempotency_key),
  FOREIGN KEY (party_id, change_set_id) REFERENCES party_runtime.party_change_sets(party_id, change_set_id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS party_runtime.party_visible_read_models (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  state_version BIGINT NOT NULL,
  viewer_character_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_digest TEXT NOT NULL,
  PRIMARY KEY (party_id, state_version, viewer_character_id)
);
