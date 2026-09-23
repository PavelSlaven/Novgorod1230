<!-- GENERATED FILE. Sources: schemas/party-db/001–034, ordered by the game-server migration manifest. Run `npm run docs:generate`; do not edit manually. -->
# Справочник схемы `party_runtime`

- Исполняемый источник: 34 упорядоченных SQL-миграций в `schemas/party-db/`.
- Таблиц: 131.
- Для каждой таблицы приведены SQL-определения `CREATE TABLE`, `ALTER TABLE` и `CREATE INDEX` в порядке миграций. Полный SQL всех миграций, включая `DROP`, триггеры и условные блоки, приведён ниже. Исполняемые файлы остаются источником истины.

## Порядок миграций

- [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)
- [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)
- [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)
- [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)
- [`005_party_runtime_v3_domain.sql`](../../schemas/party-db/005_party_runtime_v3_domain.sql)
- [`006_party_runtime_v3_migration.sql`](../../schemas/party-db/006_party_runtime_v3_migration.sql)
- [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)
- [`008_party_runtime_pr8_first_entry.sql`](../../schemas/party-db/008_party_runtime_pr8_first_entry.sql)
- [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)
- [`010_party_runtime_pr8_reaction_options.sql`](../../schemas/party-db/010_party_runtime_pr8_reaction_options.sql)
- [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)
- [`012_party_runtime_external_ownership.sql`](../../schemas/party-db/012_party_runtime_external_ownership.sql)
- [`013_party_runtime_obligations.sql`](../../schemas/party-db/013_party_runtime_obligations.sql)
- [`014_party_runtime_activity_resume_terminal.sql`](../../schemas/party-db/014_party_runtime_activity_resume_terminal.sql)
- [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)
- [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)
- [`017_party_runtime_conversation_transcript.sql`](../../schemas/party-db/017_party_runtime_conversation_transcript.sql)
- [`018_party_runtime_phase7_container_state.sql`](../../schemas/party-db/018_party_runtime_phase7_container_state.sql)
- [`019_party_runtime_combat_sessions.sql`](../../schemas/party-db/019_party_runtime_combat_sessions.sql)
- [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)
- [`021_party_runtime_ordinary_materialization.sql`](../../schemas/party-db/021_party_runtime_ordinary_materialization.sql)
- [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)
- [`023_party_runtime_ordinary_materialization_enablement.sql`](../../schemas/party-db/023_party_runtime_ordinary_materialization_enablement.sql)
- [`024_party_runtime_ordinary_world_items.sql`](../../schemas/party-db/024_party_runtime_ordinary_world_items.sql)
- [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)
- [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)
- [`027_party_runtime_action_production.sql`](../../schemas/party-db/027_party_runtime_action_production.sql)
- [`028_party_runtime_local_exact_fire.sql`](../../schemas/party-db/028_party_runtime_local_exact_fire.sql)
- [`029_party_runtime_spatial_semantic_remainder.sql`](../../schemas/party-db/029_party_runtime_spatial_semantic_remainder.sql)
- [`030_party_runtime_snapshot_validator_alias.sql`](../../schemas/party-db/030_party_runtime_snapshot_validator_alias.sql)
- [`031_party_runtime_deferred_npc_schedules.sql`](../../schemas/party-db/031_party_runtime_deferred_npc_schedules.sql)
- [`032_party_runtime_factual_presentation_delivery.sql`](../../schemas/party-db/032_party_runtime_factual_presentation_delivery.sql)
- [`033_party_runtime_initial_semantic_decision.sql`](../../schemas/party-db/033_party_runtime_initial_semantic_decision.sql)
- [`034_party_runtime_actor_base_attributes.sql`](../../schemas/party-db/034_party_runtime_actor_base_attributes.sql)

## `party_runtime.acoustic_edges`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.acoustic_edges (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,source_scene_template_ref jsonb NOT NULL,source_edge_slot_key text NOT NULL,from_g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,to_g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,base_loss integer NOT NULL CHECK(base_loss BETWEEN 0 AND 2),portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,closed_extra_loss text,reverse_edge_id text,condition_profile_ref jsonb,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,UNIQUE(scene_baseline_id,source_edge_slot_key),CHECK((portal_entity_id IS NULL AND closed_extra_loss IS NULL) OR (portal_entity_id IS NOT NULL AND closed_extra_loss IS NOT NULL AND condition_profile_ref IS NOT NULL)),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
```

## `party_runtime.commit_idempotency`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.commit_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  physical_plan_digest TEXT NOT NULL,
  status TEXT NOT NULL,
  committed_result JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## `party_runtime.delivery_acknowledgements`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.delivery_acknowledgements (
  message_id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  result JSONB NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## `party_runtime.delivery_attempts`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.delivery_attempts (
  delivery_attempt_id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  attempt JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## `party_runtime.entity_placements`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.entity_placements (party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,entity_kind text NOT NULL,entity_id text NOT NULL,placement_kind text NOT NULL CHECK(placement_kind IN ('scene_position','inside_entity','on_entity','attached_to_entity','moored_at_position','parked_at_position')),position_node_id text REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,host_entity_ref jsonb,occupies_capacity_units integer NOT NULL CHECK(occupies_capacity_units>=0),visibility_modifier_ref jsonb,interaction_profile_ref jsonb,state_version bigint NOT NULL CHECK(state_version>=0),updated_change_set_id text NOT NULL,PRIMARY KEY(party_id,entity_kind,entity_id),CHECK((placement_kind IN ('scene_position','moored_at_position','parked_at_position')) = (position_node_id IS NOT NULL)),CHECK((placement_kind IN ('inside_entity','on_entity','attached_to_entity')) = (host_entity_ref IS NOT NULL)));
```

## `party_runtime.expansion_capacity_reservations`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.expansion_capacity_reservations (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE, g4_id text NOT NULL,
  profile_ref jsonb NOT NULL, slot_ref jsonb NOT NULL, selected_template_ref jsonb NOT NULL,
  frontier_id text NOT NULL REFERENCES party_runtime.expansion_frontiers(id) ON DELETE RESTRICT, idempotency_record_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved','consumed','released','expired')), expires_at timestamptz NOT NULL,
  state_version bigint NOT NULL CHECK (state_version >= 0), terminal_change_set_id text,
  CHECK ((status='reserved') = (terminal_change_set_id IS NULL))
);
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS expansion_reservation_frontier_live_uq ON party_runtime.expansion_capacity_reservations(frontier_id) WHERE status='reserved';
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE INDEX IF NOT EXISTS expansion_reservation_ttl_idx ON party_runtime.expansion_capacity_reservations(status,expires_at) WHERE status='reserved';
```

## `party_runtime.expansion_frontiers`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.expansion_frontiers (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  g4_id text NOT NULL, source_g5_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,
  slot_ref jsonb NOT NULL, direction_context_id text, continuation_chain_id text REFERENCES party_runtime.party_continuation_chains(id) ON DELETE RESTRICT,
  continuation_ordinal integer, status text NOT NULL CHECK (status IN ('open','consumed','closed')),
  resolution_kind text, resolved_site_connection_id text, resolved_boundary_entity_id text,
  state_version bigint NOT NULL CHECK (state_version >= 0), created_change_set_id text NOT NULL, resolved_change_set_id text,
  CHECK ((continuation_chain_id IS NULL) = (direction_context_id IS NULL)),
  CHECK ((continuation_chain_id IS NULL) = (continuation_ordinal IS NULL)),
  CHECK ((status='open') = (resolution_kind IS NULL AND resolved_site_connection_id IS NULL AND resolved_boundary_entity_id IS NULL AND resolved_change_set_id IS NULL)),
  CHECK (status <> 'consumed' OR (resolution_kind IN ('generated_site','existing_site','world_route_exit') AND resolved_site_connection_id IS NOT NULL AND resolved_boundary_entity_id IS NULL AND resolved_change_set_id IS NOT NULL)),
  CHECK (status <> 'closed' OR (resolution_kind='physical_boundary' AND resolved_boundary_entity_id IS NOT NULL AND resolved_site_connection_id IS NULL AND resolved_change_set_id IS NOT NULL))
);
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS expansion_frontiers_open_chain_uq ON party_runtime.expansion_frontiers(continuation_chain_id) WHERE status='open' AND continuation_chain_id IS NOT NULL;
```

## `party_runtime.g5_site_connections`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.g5_site_connections (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,from_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,to_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,passage_type_id text NOT NULL,transition_environment_profile_ref jsonb NOT NULL,movement_orientation_profile_ref jsonb NOT NULL,cost_kind text NOT NULL CHECK(cost_kind IN ('action','time')),action_units integer,baseline_movement_method_id text,movement_method_cost_profile_ref jsonb,base_minutes numeric,dynamic_recheck_policy_ref jsonb,capacity integer,risk_profile_ref jsonb,portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,availability_condition_set_ref jsonb,reverse_connection_id text,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,CHECK(base_minutes IS NULL OR party_runtime.integral_numeric(base_minutes)),CHECK((cost_kind='action')=(action_units IS NOT NULL AND baseline_movement_method_id IS NULL AND movement_method_cost_profile_ref IS NULL AND base_minutes IS NULL AND dynamic_recheck_policy_ref IS NULL)),CHECK((portal_entity_id IS NOT NULL)=(availability_condition_set_ref IS NOT NULL)),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
```

## `party_runtime.g6_acoustic_profiles`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.g6_acoustic_profiles (party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE CASCADE,ambient_noise integer NOT NULL CHECK(ambient_noise>=0),acoustic_uniformity text NOT NULL,state_version bigint NOT NULL CHECK(state_version>=0),updated_change_set_id text NOT NULL,PRIMARY KEY(party_id,g6_instance_id));
```

## `party_runtime.movement_edge_blockers`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.movement_edge_blockers (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,relation_ref jsonb NOT NULL,relation_dependency_pins jsonb NOT NULL,blocker_entity_ref jsonb NOT NULL,block_kind text NOT NULL CHECK(block_kind IN ('full','capacity_reduction')),reduced_capacity integer,activation_condition_ref jsonb,status text NOT NULL CHECK(status IN ('active','removed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,CHECK((block_kind='capacity_reduction')=(reduced_capacity IS NOT NULL)),CHECK((status='active')=(terminal_change_set_id IS NULL)));
```

## `party_runtime.navigation_beliefs`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.navigation_beliefs (party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,character_id text NOT NULL,perceived_area_ref jsonb,perceived_direction_id text,perceived_bearing_mdeg integer,perceived_vertical_direction text,confidence text NOT NULL CHECK(confidence IN ('exact','approximate','uncertain','lost')),updated_at_turn bigint NOT NULL CHECK(updated_at_turn>=0),state_version bigint NOT NULL CHECK(state_version>=0),updated_change_set_id text NOT NULL,PRIMARY KEY(party_id,character_id),CHECK(confidence <> 'exact' OR perceived_area_ref IS NOT NULL OR perceived_direction_id IS NOT NULL));
```

## `party_runtime.parties`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
ALTER TABLE party_runtime.parties DROP CONSTRAINT IF EXISTS parties_schema_version_check;
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
ALTER TABLE party_runtime.parties ADD CONSTRAINT parties_schema_version_check CHECK (schema_version IN (2, 3));
```

Источник: [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
ALTER TABLE party_runtime.parties
  DROP CONSTRAINT IF EXISTS party_runtime_parties_state_version_safe_integer_check;
```

Источник: [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
ALTER TABLE party_runtime.parties
  ADD CONSTRAINT party_runtime_parties_state_version_safe_integer_check
  CHECK (state_version <= 9007199254740991);
```

## `party_runtime.party_action_step_runs`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_action_step_runs (
  id text PRIMARY KEY, execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), attempt_ordinal integer NOT NULL CHECK(attempt_ordinal>=0),
  action_snapshot jsonb NOT NULL, departure_endpoint_snapshot jsonb NOT NULL, arrival_endpoint_snapshot jsonb NOT NULL, execution_context_snapshot jsonb NOT NULL,
  result_kind text NOT NULL CHECK(result_kind IN ('completed','blocked','failed')), result_code text NOT NULL,
  result_change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0),
  UNIQUE(execution_id,plan_step_ordinal,attempt_ordinal)
);
```

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_action_step_one_completed_uq ON party_runtime.party_action_step_runs(execution_id,plan_step_ordinal) WHERE result_kind='completed';
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_action_step_runs
  ALTER COLUMN execution_id DROP NOT NULL,
  ALTER COLUMN plan_step_ordinal DROP NOT NULL,
  ADD COLUMN party_id text
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  ADD COLUMN action_scope text,
  ADD COLUMN origin_location_snapshot jsonb,
  ADD COLUMN originating_command_ref jsonb,
  ADD COLUMN originating_command_digest text;
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_action_step_runs
  ALTER COLUMN party_id SET NOT NULL,
  ALTER COLUMN action_scope SET NOT NULL,
  ADD CONSTRAINT party_immediate_action_scope_ck CHECK (
    action_scope IN ('route_step','standalone')
    AND (
      (
        action_scope = 'route_step'
        AND execution_id IS NOT NULL
        AND plan_step_ordinal IS NOT NULL
        AND origin_location_snapshot IS NULL
        AND originating_command_ref IS NULL
        AND originating_command_digest IS NULL
      )
      OR
      (
        action_scope = 'standalone'
        AND execution_id IS NULL
        AND plan_step_ordinal IS NULL
        AND jsonb_typeof(origin_location_snapshot) = 'object'
        AND jsonb_typeof(execution_context_snapshot) = 'object'
        AND jsonb_typeof(originating_command_ref) = 'object'
        AND NULLIF(originating_command_digest,'') IS NOT NULL
      )
    )
  );
```

## `party_runtime.party_activity_participant_bindings`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_activity_participant_bindings (
  activity_execution_id text NOT NULL REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT,
  participant_kind text NOT NULL, participant_id text NOT NULL, role_id text NOT NULL,
  required boolean NOT NULL DEFAULT false, status text NOT NULL CHECK(status IN ('active','left','removed')),
  bound_change_set_id text NOT NULL, terminal_change_set_id text,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  PRIMARY KEY(activity_execution_id,participant_kind,participant_id),
  CHECK((status='active') = (terminal_change_set_id IS NULL))
);
```

## `party_runtime.party_activity_resource_bindings`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_activity_resource_bindings (
  activity_execution_id text NOT NULL REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT,
  resource_kind text NOT NULL, resource_id text NOT NULL, binding_kind text NOT NULL CHECK(binding_kind IN ('reserved','consumed')),
  quantity_numerator numeric NOT NULL CHECK(quantity_numerator >= 0 AND party_runtime.integral_numeric(quantity_numerator)),
  quantity_denominator numeric NOT NULL CHECK(quantity_denominator > 0 AND party_runtime.integral_numeric(quantity_denominator) AND gcd(quantity_numerator,quantity_denominator)=1),
  change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  PRIMARY KEY(activity_execution_id,resource_kind,resource_id,binding_kind,change_set_id),
  UNIQUE(activity_execution_id,resource_kind,resource_id,idempotency_record_id)
);
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_activity_resource_bindings
  DROP CONSTRAINT party_activity_resource_bindings_pkey,
  DROP CONSTRAINT party_activity_resource_bindings_binding_kind_check,
  ADD COLUMN consumption_policy_ref jsonb,
  ADD COLUMN state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1);
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_activity_resource_bindings
  ALTER COLUMN consumption_policy_ref SET NOT NULL,
  ADD CONSTRAINT party_activity_resource_binding_kind_ck CHECK (
    binding_kind IN (
      'required_tool',
      'reserved_input',
      'consumable_input',
      'output_target'
    )
  ),
  ADD CONSTRAINT party_activity_resource_binding_policy_ck CHECK (
    jsonb_typeof(consumption_policy_ref) = 'object'
  ),
  ADD PRIMARY KEY (
    activity_execution_id,
    resource_kind,
    resource_id,
    binding_kind
  );
```

## `party_runtime.party_actor_active_conditions`

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE TABLE party_runtime.party_actor_active_conditions (
  party_id text NOT NULL,
  actor_kind text NOT NULL,
  actor_id text NOT NULL,
  condition_id text NOT NULL,
  condition_profile_ref jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('active','resolved')),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  terminal_change_set_id text,
  PRIMARY KEY(party_id,actor_kind,actor_id,condition_id),
  FOREIGN KEY(party_id,actor_kind,actor_id)
    REFERENCES party_runtime.party_actor_body_states(
      party_id,actor_kind,actor_id
    ) ON DELETE CASCADE,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);
```

## `party_runtime.party_actor_body_states`

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE TABLE party_runtime.party_actor_body_states (
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_kind text NOT NULL CHECK(actor_kind IN ('player_character','npc')),
  actor_id text NOT NULL,
  body_profile_ref jsonb NOT NULL,
  health numeric NOT NULL CHECK(health >= 0),
  energy numeric NOT NULL CHECK(energy >= 0),
  satiety numeric NOT NULL CHECK(satiety >= 0),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  updated_change_set_id text NOT NULL,
  PRIMARY KEY(party_id,actor_kind,actor_id),
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);
```

## `party_runtime.party_actor_carrier_positions`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_actor_carrier_positions (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_id text NOT NULL, root_carrier_kind text NOT NULL CHECK(root_carrier_kind IN ('cohort','transport')), root_carrier_id text NOT NULL,
  scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,
  g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,
  position_node_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('active','cleared')), state_version bigint NOT NULL CHECK(state_version >= 0), created_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);
```

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_actor_carrier_position_active_uq ON party_runtime.party_actor_carrier_positions(party_id, actor_id) WHERE status = 'active';
```

## `party_runtime.party_actor_npc_interaction_summaries`

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE TABLE party_runtime.party_actor_npc_interaction_summaries (
  summary_id text PRIMARY KEY,
  interaction_id text NOT NULL
    REFERENCES party_runtime.party_actor_npc_interactions(interaction_id)
    ON DELETE RESTRICT,
  summary_scope text NOT NULL
    CHECK(summary_scope IN ('player_journal','npc_memory')),
  remembering_subject_kind text NOT NULL,
  remembering_subject_id text NOT NULL,
  summary_text text NOT NULL,
  salience integer NOT NULL CHECK(salience >= 0),
  source_message_digest text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  UNIQUE(interaction_id,summary_scope,remembering_subject_kind,
    remembering_subject_id,source_message_digest)
);
```

## `party_runtime.party_actor_npc_interactions`

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE TABLE party_runtime.party_actor_npc_interactions (
  interaction_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  npc_id text NOT NULL,
  interaction_kind text NOT NULL CHECK(interaction_kind = 'conversation'),
  activity_execution_id text NOT NULL UNIQUE
    REFERENCES party_runtime.party_timed_activity_executions(id)
    ON DELETE RESTRICT,
  started_at jsonb NOT NULL,
  ended_at jsonb,
  location_ref jsonb NOT NULL,
  outcome text NOT NULL CHECK(outcome IN ('completed','failed','aborted')),
  terminal_change_set_id text NOT NULL,
  terminal_evidence_kind text NOT NULL CHECK(
    terminal_evidence_kind IN ('terminal_attempt','lifecycle_abort')
  ),
  terminal_evidence_ref jsonb NOT NULL,
  interaction_policy_ref jsonb NOT NULL,
  canonical_digest text NOT NULL,
  FOREIGN KEY(party_id,npc_id)
    REFERENCES party_runtime.party_npcs(party_id,npc_id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,terminal_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  CHECK((outcome = 'aborted') = (terminal_evidence_kind = 'lifecycle_abort'))
);
```

## `party_runtime.party_actor_profile_bindings`

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE TABLE party_runtime.party_actor_profile_bindings (
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_kind text NOT NULL CHECK(actor_kind IN ('player_character','npc')),
  actor_id text NOT NULL,
  role_ref jsonb NOT NULL,
  occupation_ref jsonb NOT NULL,
  skill_profile_snapshot jsonb NOT NULL,
  name_profile_snapshot jsonb NOT NULL,
  language_profile_snapshot jsonb NOT NULL,
  knowledge_profile_snapshot jsonb NOT NULL,
  profile_candidate_set_digest text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  PRIMARY KEY(party_id,actor_kind,actor_id),
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);
```

Источник: [`034_party_runtime_actor_base_attributes.sql`](../../schemas/party-db/034_party_runtime_actor_base_attributes.sql)

```sql
ALTER TABLE party_runtime.party_actor_profile_bindings
  ADD COLUMN IF NOT EXISTS attribute_profile_snapshot jsonb;
```

## `party_runtime.party_actor_relations`

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE TABLE party_runtime.party_actor_relations (
  relation_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  subject_ref jsonb NOT NULL,
  object_ref jsonb NOT NULL,
  relation_category_ref jsonb NOT NULL,
  relation_state jsonb NOT NULL,
  causal_evidence_kind text NOT NULL CHECK(
    causal_evidence_kind IN (
      'interaction',
      'terminal_activity_attempt',
      'immediate_action',
      'traversal_interval'
    )
  ),
  causal_evidence_ref jsonb NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE UNIQUE INDEX party_actor_relation_semantic_identity_uq
  ON party_runtime.party_actor_relations(
    party_id,
    (subject_ref->>'entity_kind'),
    (subject_ref->>'entity_id'),
    (object_ref->>'entity_kind'),
    (object_ref->>'entity_id'),
    (relation_category_ref->>'entity_id')
  );
```

## `party_runtime.party_autonomous_updates`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_body_temporal_history`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_body_temporal_history (
  history_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  subject_kind text NOT NULL, subject_id text NOT NULL, effect_ref jsonb NOT NULL, change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  occurred_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_whole_minutes)),
  occurred_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_numerator) AND occurred_at_subminute_numerator >= 0),
  occurred_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_denominator) AND occurred_at_subminute_denominator > 0),
  CHECK(party_runtime.game_timestamp_parts_valid(occurred_at_whole_minutes,occurred_at_subminute_numerator,occurred_at_subminute_denominator)), UNIQUE(party_id,idempotency_record_id)
);
```

## `party_runtime.party_carrier_attachments`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_carrier_attachments (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  subject_kind text NOT NULL CHECK(subject_kind IN ('actor','cohort')), subject_id text NOT NULL,
  carrier_kind text NOT NULL CHECK(carrier_kind IN ('cohort','transport')), carrier_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('active','detached')), state_version bigint NOT NULL CHECK(state_version >= 0),
  attached_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK(NOT (subject_kind = carrier_kind AND subject_id = carrier_id)),
  CHECK((subject_kind = 'actor' AND carrier_kind IN ('cohort','transport')) OR (subject_kind = 'cohort' AND carrier_kind = 'transport')),
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);
```

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_carrier_attachment_subject_active_uq ON party_runtime.party_carrier_attachments(party_id, subject_kind, subject_id) WHERE status = 'active';
```

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE INDEX IF NOT EXISTS party_carrier_attachment_lock_idx ON party_runtime.party_carrier_attachments(party_id, subject_kind, subject_id) WHERE status='active';
```

## `party_runtime.party_change_set_write_plans`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_change_set_write_plans (
  change_set_id text PRIMARY KEY REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  canonical_write_plan jsonb NOT NULL, canonical_write_plan_digest text NOT NULL,
  expected_state_version_set jsonb NOT NULL, expected_state_version_set_digest text NOT NULL, lock_key_set jsonb NOT NULL,
  CHECK(jsonb_typeof(expected_state_version_set) = 'array'), CHECK(jsonb_typeof(lock_key_set) = 'array')
);
```

## `party_runtime.party_change_sets`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_character_knowledge`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_character_knowledge (
  party_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  knowledge_state TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (party_id, character_id, fact_id),
  FOREIGN KEY (party_id, character_id) REFERENCES party_runtime.party_player_characters(party_id, character_id) ON DELETE CASCADE
);
```

## `party_runtime.party_check_resolutions`

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE TABLE party_runtime.party_check_resolutions (
  check_resolution_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  check_scope_kind text NOT NULL CHECK(
    check_scope_kind IN (
      'immediate_action',
      'timed_activity_attempt',
      'traversal_interval'
    )
  ),
  check_scope_key jsonb NOT NULL,
  check_policy_ref jsonb NOT NULL,
  deterministic_roll_input_digest text NOT NULL,
  roll_value integer NOT NULL,
  modifier_snapshot jsonb NOT NULL,
  target_value integer NOT NULL,
  result_kind text NOT NULL CHECK(result_kind IN ('success','failure')),
  consequence_policy_ref jsonb NOT NULL,
  result_change_set_id text NOT NULL,
  canonical_digest text NOT NULL,
  UNIQUE(party_id,check_scope_kind,check_scope_key),
  FOREIGN KEY(party_id,result_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);
```

## `party_runtime.party_clock_owner_handoffs`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_clock_owner_handoffs (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  old_owner_kind text NOT NULL CHECK(old_owner_kind IN ('party','cohort','transport')), old_owner_id text,
  new_owner_kind text NOT NULL CHECK(new_owner_kind IN ('party','cohort','transport')), new_owner_id text,
  effective_whole_minutes numeric NOT NULL CHECK(effective_whole_minutes >= 0 AND party_runtime.integral_numeric(effective_whole_minutes)), effective_subminute_numerator numeric NOT NULL CHECK(effective_subminute_numerator >= 0 AND party_runtime.integral_numeric(effective_subminute_numerator)), effective_subminute_denominator numeric NOT NULL CHECK(effective_subminute_denominator > 0 AND party_runtime.integral_numeric(effective_subminute_denominator)),
  change_set_id text NOT NULL REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  CHECK(effective_subminute_numerator < effective_subminute_denominator), CHECK(gcd(effective_subminute_numerator,effective_subminute_denominator)=1),
  CHECK((old_owner_kind='party')=(old_owner_id IS NULL)), CHECK((new_owner_kind='party')=(new_owner_id IS NULL)),
  UNIQUE(party_id, change_set_id), UNIQUE(party_id, effective_whole_minutes, effective_subminute_numerator, effective_subminute_denominator, new_owner_kind, new_owner_id)
);
```

## `party_runtime.party_clocks`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_clocks (
  party_id text PRIMARY KEY REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  whole_minutes numeric NOT NULL CHECK(whole_minutes >= 0 AND party_runtime.integral_numeric(whole_minutes)), subminute_numerator numeric NOT NULL CHECK(subminute_numerator >= 0 AND party_runtime.integral_numeric(subminute_numerator)), subminute_denominator numeric NOT NULL CHECK(subminute_denominator > 0 AND party_runtime.integral_numeric(subminute_denominator)),
  clock_owner_kind text NOT NULL CHECK(clock_owner_kind IN ('party','cohort','transport')), clock_owner_id text,
  state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL,
  CHECK(subminute_numerator < subminute_denominator), CHECK(gcd(subminute_numerator, subminute_denominator) = 1),
  CHECK((clock_owner_kind = 'party') = (clock_owner_id IS NULL))
);
```

## `party_runtime.party_cohort_memberships`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_cohort_memberships (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  cohort_id text NOT NULL REFERENCES party_runtime.party_cohorts(id) ON DELETE RESTRICT, actor_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('active','left','split','merged')), state_version bigint NOT NULL CHECK(state_version >= 0),
  joined_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);
```

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_cohort_membership_actor_active_uq ON party_runtime.party_cohort_memberships(party_id, actor_id) WHERE status = 'active';
```

## `party_runtime.party_cohorts`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_cohorts (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  pace_rule_ref jsonb NOT NULL, status text NOT NULL CHECK(status IN ('active','split','merged','retired')),
  state_version bigint NOT NULL CHECK(state_version >= 0), created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);
```

## `party_runtime.party_combat_sessions`

Источник: [`019_party_runtime_combat_sessions.sql`](../../schemas/party-db/019_party_runtime_combat_sessions.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_combat_sessions (
  combat_id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  state_version bigint NOT NULL CHECK(state_version >= 1),
  status text NOT NULL CHECK(status IN ('active','paused_for_player','paused_for_decisions','ended')),
  started_at jsonb NOT NULL CHECK (jsonb_typeof(started_at) = 'object'),
  scope_ref jsonb NOT NULL CHECK (jsonb_typeof(scope_ref) = 'object'),
  participant_refs jsonb NOT NULL
    CHECK (jsonb_typeof(participant_refs) = 'array'),
  participant_states jsonb NOT NULL
    CHECK (jsonb_typeof(participant_states) = 'array'),
  exchange_ordinal bigint NOT NULL CHECK(exchange_ordinal >= 0),
  last_exchange_ref jsonb
    CHECK (
      last_exchange_ref IS NULL
      OR jsonb_typeof(last_exchange_ref) = 'object'
    ),
  player_response_required boolean NOT NULL,
  last_change_set_id text NOT NULL,
  canonical_digest text NOT NULL,
  session_schema text NOT NULL CHECK(session_schema = 'combat_session_v1'),
  UNIQUE(combat_id, party_id),
  FOREIGN KEY (party_id, last_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);
```

Источник: [`019_party_runtime_combat_sessions.sql`](../../schemas/party-db/019_party_runtime_combat_sessions.sql)

```sql
CREATE INDEX IF NOT EXISTS party_combat_sessions_party_idx
  ON party_runtime.party_combat_sessions(party_id, status);
```

Источник: [`019_party_runtime_combat_sessions.sql`](../../schemas/party-db/019_party_runtime_combat_sessions.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_combat_sessions_one_open_per_party_uq
  ON party_runtime.party_combat_sessions(party_id)
  WHERE status <> 'ended';
```

## `party_runtime.party_command_idempotency`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_command_idempotency (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  operation_kind text NOT NULL, idempotency_key text NOT NULL, parent_record_id text REFERENCES party_runtime.party_command_idempotency(id) ON DELETE RESTRICT,
  child_ordinal integer CHECK(child_ordinal >= 0), canonical_input_digest text NOT NULL, expected_state_version_set_digest text NOT NULL,
  status text NOT NULL CHECK(status IN ('leased','committed','failed_terminal')), lease_token text, lease_expires_at timestamptz,
  result_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  terminal_failure_code text, terminal_failure_digest text,
  created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0), finalized_at_turn bigint,
  UNIQUE(party_id, operation_kind, idempotency_key),
  UNIQUE(parent_record_id, child_ordinal),
  CHECK((parent_record_id IS NULL) = (child_ordinal IS NULL)),
  CHECK((status = 'leased') = (result_change_set_id IS NULL AND terminal_failure_code IS NULL AND terminal_failure_digest IS NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK((status = 'committed') = (result_change_set_id IS NOT NULL AND terminal_failure_code IS NULL AND terminal_failure_digest IS NULL AND finalized_at_turn IS NOT NULL)),
  CHECK((status = 'failed_terminal') = (result_change_set_id IS NULL AND terminal_failure_code IS NOT NULL AND terminal_failure_digest IS NOT NULL AND finalized_at_turn IS NOT NULL))
);
```

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
ALTER TABLE party_runtime.party_command_idempotency ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1);
```

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE INDEX IF NOT EXISTS party_idempotency_party_lock_idx ON party_runtime.party_command_idempotency(party_id, operation_kind, idempotency_key);
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_command_idempotency
  ADD COLUMN semantic_command_snapshot jsonb,
  ADD COLUMN semantic_command_digest text,
  ADD COLUMN semantic_dependency_pins jsonb,
  ADD COLUMN request_id text,
  ADD CONSTRAINT party_semantic_command_seal_ck CHECK (
    (semantic_command_snapshot IS NULL
      AND semantic_command_digest IS NULL
      AND semantic_dependency_pins IS NULL
      AND request_id IS NULL)
    OR
    (semantic_command_snapshot IS NOT NULL
      AND jsonb_typeof(semantic_command_snapshot) = 'object'
      AND NULLIF(semantic_command_digest,'') IS NOT NULL
      AND semantic_dependency_pins IS NOT NULL
      AND jsonb_typeof(semantic_dependency_pins) = 'object'
      AND NULLIF(request_id,'') IS NOT NULL)
  );
```

## `party_runtime.party_containers`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_containers (
  party_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  anchor_id TEXT,
  parent_container_id TEXT,
  holder_npc_id TEXT,
  holder_character_id TEXT,
  physical_position TEXT CHECK (physical_position IN ('hands','worn','worn_quick','equipped','external','external_load')),
  equipment_slot_category_id TEXT,
  condition_state TEXT,
  closure_state TEXT CHECK (closure_state IN ('open','closed','locked','unavailable')),
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
  CHECK (physical_position IS NULL OR holder_character_id IS NOT NULL),
  CHECK (holder_character_id IS NULL OR physical_position IS NOT NULL),
  CHECK (equipment_slot_category_id IS NULL OR (holder_character_id IS NOT NULL AND physical_position = 'equipped')),
  CHECK (physical_position <> 'equipped' OR equipment_slot_category_id IS NOT NULL),
  CHECK (parent_container_id IS NULL OR parent_container_id <> container_id)
);
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_containers
  ADD COLUMN state_version bigint NOT NULL DEFAULT 1
    CHECK(state_version >= 1),
  ADD COLUMN updated_change_set_id text;
```

Источник: [`018_party_runtime_phase7_container_state.sql`](../../schemas/party-db/018_party_runtime_phase7_container_state.sql)

```sql
ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_closure_state_check;
```

Источник: [`018_party_runtime_phase7_container_state.sql`](../../schemas/party-db/018_party_runtime_phase7_container_state.sql)

```sql
ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_closure_state_check CHECK (
    closure_state IN ('open', 'closed', 'locked', 'unavailable', 'tied')
  );
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_actor_position_check;
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_actor_position_check CHECK (
    (physical_position IS NOT NULL) = (
      holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL
    )
  ) NOT VALID;
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_equipment_slot_check;
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_equipment_slot_check CHECK (
    equipment_slot_category_id IS NULL
    OR (
      physical_position = 'equipped'
      AND (holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL)
    )
  );
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_equipped_requires_slot_check;
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_equipped_requires_slot_check CHECK (
    physical_position IS DISTINCT FROM 'equipped'
    OR equipment_slot_category_id IS NOT NULL
  );
```

## `party_runtime.party_continuation_chains`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_continuation_chains (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  g4_id text NOT NULL, slot_ref jsonb NOT NULL, initial_frontier_id text NOT NULL, terminal_ordinal integer NOT NULL CHECK (terminal_ordinal >= 0),
  length_rule_ref jsonb NOT NULL, candidate_digest text NOT NULL, choice_trace_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','terminal_resolved')), state_version bigint NOT NULL CHECK (state_version >= 0),
  created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text,
  UNIQUE (party_id, initial_frontier_id), CHECK ((status='active') = (terminal_change_set_id IS NULL))
);
```

## `party_runtime.party_conversation_contributions`

Источник: [`017_party_runtime_conversation_transcript.sql`](../../schemas/party-db/017_party_runtime_conversation_transcript.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_contributions (
  contribution_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  exchange_id text NOT NULL,
  party_state_version integer NOT NULL CHECK (party_state_version > 0),
  session_state_version integer NOT NULL CHECK (session_state_version > 0),
  contribution_index integer NOT NULL CHECK (contribution_index > 0),
  contribution_schema text NOT NULL CHECK (
    contribution_schema IN (
      'conversation_statement_event_v1',
      'conversation_non_statement_contribution_v1'
    )
  ),
  contribution_payload jsonb NOT NULL
    CHECK (jsonb_typeof(contribution_payload) = 'object'),
  change_set_id text NOT NULL,
  idempotency_key text NOT NULL,
  canonical_digest text NOT NULL,
  FOREIGN KEY (party_id, conversation_id)
    REFERENCES party_runtime.party_conversation_sessions(
      party_id,
      conversation_id
    ) ON DELETE CASCADE,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT,
  UNIQUE (party_id, conversation_id, session_state_version, contribution_index),
  UNIQUE (party_id, idempotency_key)
);
```

Источник: [`017_party_runtime_conversation_transcript.sql`](../../schemas/party-db/017_party_runtime_conversation_transcript.sql)

```sql
CREATE INDEX IF NOT EXISTS party_conversation_contributions_transcript_idx
  ON party_runtime.party_conversation_contributions (
    party_id,
    conversation_id,
    session_state_version,
    contribution_index
  );
```

## `party_runtime.party_conversation_sessions`

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_sessions (
  conversation_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  state_version bigint NOT NULL CHECK (state_version >= 1),
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'ended')),
  started_at jsonb NOT NULL CHECK (jsonb_typeof(started_at) = 'object'),
  location_ref jsonb NOT NULL CHECK (jsonb_typeof(location_ref) = 'object'),
  initiator_ref jsonb NOT NULL CHECK (jsonb_typeof(initiator_ref) = 'object'),
  active_participant_refs jsonb NOT NULL
    CHECK (jsonb_typeof(active_participant_refs) = 'array'),
  last_contribution_ref jsonb
    CHECK (
      last_contribution_ref IS NULL
      OR jsonb_typeof(last_contribution_ref) = 'object'
    ),
  topic_refs jsonb NOT NULL CHECK (jsonb_typeof(topic_refs) = 'array'),
  status_reason text,
  updated_change_set_id text NOT NULL,
  canonical_digest text NOT NULL,
  session_schema text NOT NULL
    CHECK (session_schema = 'conversation_session_v1'),
  UNIQUE (party_id, conversation_id),
  FOREIGN KEY (party_id, updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
CREATE INDEX IF NOT EXISTS party_conversation_sessions_party_status_idx
  ON party_runtime.party_conversation_sessions (party_id, status);
```

## `party_runtime.party_conversation_statements`

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_statements (
  statement_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  exchange_id text NOT NULL,
  speaker_ref jsonb NOT NULL CHECK (jsonb_typeof(speaker_ref) = 'object'),
  intended_addressee_refs jsonb NOT NULL
    CHECK (jsonb_typeof(intended_addressee_refs) = 'array'),
  utterance_text text NOT NULL,
  dominant_act text NOT NULL,
  interaction_tags jsonb NOT NULL
    CHECK (jsonb_typeof(interaction_tags) = 'array'),
  topic_refs jsonb NOT NULL CHECK (jsonb_typeof(topic_refs) = 'array'),
  claims jsonb NOT NULL CHECK (jsonb_typeof(claims) = 'array'),
  message_completeness text NOT NULL
    CHECK (message_completeness = 'complete'),
  spoken_at jsonb NOT NULL CHECK (jsonb_typeof(spoken_at) = 'object'),
  duration jsonb NOT NULL CHECK (jsonb_typeof(duration) = 'object'),
  social_delivery_result jsonb
    CHECK (
      social_delivery_result IS NULL
      OR jsonb_typeof(social_delivery_result) = 'object'
    ),
  source_plan_ref jsonb NOT NULL
    CHECK (jsonb_typeof(source_plan_ref) = 'object'),
  audience_projection jsonb NOT NULL
    CHECK (
      jsonb_typeof(audience_projection) = 'object'
      AND audience_projection ->> 'schema'
        = 'conversation_audience_projection_v1'
      AND audience_projection -> 'statement_ref' ->> 'entity_kind'
        = 'conversation_statement'
      AND audience_projection -> 'statement_ref' ->> 'entity_id'
        = statement_id
    ),
  audience_digest text NOT NULL CHECK (length(audience_digest) > 0),
  change_set_id text NOT NULL,
  statement_schema text NOT NULL
    CHECK (statement_schema = 'conversation_statement_event_v1'),
  idempotency_key text NOT NULL,
  canonical_digest text NOT NULL,
  FOREIGN KEY (party_id, conversation_id)
    REFERENCES party_runtime.party_conversation_sessions(
      party_id,
      conversation_id
    )
    ON DELETE CASCADE,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT,
  UNIQUE (party_id, idempotency_key)
);
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
CREATE INDEX IF NOT EXISTS party_conversation_statements_conversation_exchange_idx
  ON party_runtime.party_conversation_statements (conversation_id, exchange_id);
```

## `party_runtime.party_decision_options`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_decision_requests`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_decision_results`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_entity_controls`

Источник: [`005_party_runtime_v3_domain.sql`](../../schemas/party-db/005_party_runtime_v3_domain.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_entity_controls (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  entity_kind text NOT NULL, entity_id text NOT NULL,
  owner_ref jsonb NOT NULL, holder_ref jsonb NOT NULL, controller_ref jsonb NOT NULL,
  access_profile_ref jsonb NOT NULL, capacity_units integer NOT NULL CHECK(capacity_units >= 0),
  state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL,
  PRIMARY KEY(party_id,entity_kind,entity_id),
  FOREIGN KEY(party_id,entity_kind,entity_id) REFERENCES party_runtime.entity_placements(party_id,entity_kind,entity_id) ON DELETE CASCADE
);
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_entity_controls
  DROP CONSTRAINT IF EXISTS party_entity_controls_party_id_entity_kind_entity_id_fkey;
```

## `party_runtime.party_g4_expansion_ledgers`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_g4_expansion_ledgers (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE, g4_id text NOT NULL, profile_ref jsonb NOT NULL,
  profile_ref_id text GENERATED ALWAYS AS (profile_ref->>'entity_id') STORED,
  state_version bigint NOT NULL CHECK (state_version >= 0), updated_change_set_id text NOT NULL, PRIMARY KEY (party_id,g4_id,profile_ref_id)
);
```

## `party_runtime.party_g5_anchors`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_g5_edges`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_g5_nodes`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_g5_sites`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_g5_sites (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  origin text NOT NULL CHECK (origin IN ('canonical','generated')), parent_g4_id text NOT NULL,
  canonical_g5_ref jsonb, generated_template_ref jsonb, expansion_slot_ref jsonb, source_frontier_id text,
  generation_ordinal integer, direction_context_id text, continuation_chain_id text, continuation_ordinal integer,
  status text NOT NULL CHECK (status IN ('active','superseded','destroyed')), state_version bigint NOT NULL CHECK (state_version >= 0),
  created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text, superseded_by_site_id text,
  CHECK ((origin = 'canonical') = (canonical_g5_ref IS NOT NULL)),
  CHECK ((origin = 'generated') = (generated_template_ref IS NOT NULL AND expansion_slot_ref IS NOT NULL AND source_frontier_id IS NOT NULL AND generation_ordinal IS NOT NULL)),
  CHECK ((origin = 'canonical') OR generation_ordinal >= 0),
  CHECK (party_runtime.spatial_v3_lifecycle_valid(status, terminal_change_set_id))
);
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_g5_sites_canonical_active_uq ON party_runtime.party_g5_sites(party_id, (canonical_g5_ref->>'entity_id')) WHERE origin='canonical' AND status <> 'superseded';
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_g5_sites_generated_frontier_uq ON party_runtime.party_g5_sites(party_id, source_frontier_id) WHERE origin='generated';
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_g5_sites_generated_ordinal_uq ON party_runtime.party_g5_sites(party_id,parent_g4_id,(expansion_slot_ref->>'entity_id'),generation_ordinal) WHERE origin='generated';
```

## `party_runtime.party_g6_instances`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_g6_instances (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT, source_scene_template_ref jsonb NOT NULL, scene_slot_key text NOT NULL,
  enclosing_stable_structure_id text, host_kind text NOT NULL, host_id text NOT NULL, physical_class_id text NOT NULL, primary_scene_role_id text NOT NULL,
  vertical_context_id text NOT NULL, overhead_cover_id text NOT NULL, intra_g6_visibility_mode text NOT NULL CHECK (intra_g6_visibility_mode IN ('default_clear','explicit')),
  default_visibility_distance_band text, acoustic_uniformity text NOT NULL, status text NOT NULL CHECK (status IN ('active','superseded','destroyed')),
  state_version bigint NOT NULL CHECK (state_version >= 0), created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text,
  UNIQUE(scene_baseline_id,scene_slot_key), CHECK ((intra_g6_visibility_mode='default_clear') = (default_visibility_distance_band IS NOT NULL)), CHECK (party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id))
);
```

## `party_runtime.party_item_placements`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_item_placements (
  party_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  anchor_id TEXT,
  container_id TEXT,
  holder_npc_id TEXT,
  holder_character_id TEXT,
  physical_position TEXT CHECK (physical_position IN ('hands','worn','worn_quick','equipped','external','external_load')),
  equipment_slot_category_id TEXT,
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
  ,CHECK (physical_position IS NULL OR holder_character_id IS NOT NULL)
  ,CHECK (holder_character_id IS NULL OR physical_position IS NOT NULL)
  ,CHECK (equipment_slot_category_id IS NULL OR (holder_character_id IS NOT NULL AND physical_position = 'equipped'))
  ,CHECK (physical_position <> 'equipped' OR equipment_slot_category_id IS NOT NULL)
);
```

Источник: [`013_party_runtime_obligations.sql`](../../schemas/party-db/013_party_runtime_obligations.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_holder_position_check;
```

Источник: [`013_party_runtime_obligations.sql`](../../schemas/party-db/013_party_runtime_obligations.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_holder_position_check CHECK (
    (physical_position IS NOT NULL) = (
      holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL
    )
  );
```

Источник: [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD COLUMN IF NOT EXISTS attached_item_id text;
```

Источник: [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD COLUMN IF NOT EXISTS scene_position_id text;
```

Источник: [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_owner_check;
```

Источник: [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_owner_check CHECK (
    (CASE WHEN anchor_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN scene_position_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN container_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN holder_npc_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN holder_character_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN attached_item_id IS NULL THEN 0 ELSE 1 END) = 1
  );
```

Источник: [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_attached_item_fk;
```

Источник: [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_attached_item_fk
  FOREIGN KEY (party_id, attached_item_id)
  REFERENCES party_runtime.party_items(party_id, item_id)
  ON DELETE RESTRICT;
```

Источник: [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_no_self_attachment_check;
```

Источник: [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_no_self_attachment_check
  CHECK (attached_item_id IS NULL OR attached_item_id <> item_id);
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_actor_position_check;
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_actor_position_check CHECK (
    (physical_position IS NOT NULL) = (
      holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL
    )
  );
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_equipment_slot_check;
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_equipment_slot_check CHECK (
    equipment_slot_category_id IS NULL
    OR (
      physical_position = 'equipped'
      AND (holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL)
    )
  );
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_equipped_requires_slot_check;
```

Источник: [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_equipped_requires_slot_check CHECK (
    physical_position IS DISTINCT FROM 'equipped'
    OR equipment_slot_category_id IS NOT NULL
  );
```

Источник: [`024_party_runtime_ordinary_world_items.sql`](../../schemas/party-db/024_party_runtime_ordinary_world_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD COLUMN IF NOT EXISTS scene_position_id text;
```

Источник: [`024_party_runtime_ordinary_world_items.sql`](../../schemas/party-db/024_party_runtime_ordinary_world_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_owner_check;
```

Источник: [`024_party_runtime_ordinary_world_items.sql`](../../schemas/party-db/024_party_runtime_ordinary_world_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_owner_check CHECK (
    (CASE WHEN anchor_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN scene_position_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN container_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN holder_npc_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN holder_character_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN attached_item_id IS NULL THEN 0 ELSE 1 END) = 1
  );
```

Источник: [`024_party_runtime_ordinary_world_items.sql`](../../schemas/party-db/024_party_runtime_ordinary_world_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_scene_position_fk;
```

Источник: [`024_party_runtime_ordinary_world_items.sql`](../../schemas/party-db/024_party_runtime_ordinary_world_items.sql)

```sql
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_scene_position_fk
  FOREIGN KEY (scene_position_id)
  REFERENCES party_runtime.scene_position_nodes(id)
  ON DELETE RESTRICT;
```

## `party_runtime.party_items`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

Источник: [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
ALTER TABLE party_runtime.party_items
  ALTER COLUMN run_id DROP NOT NULL,
  ALTER COLUMN template_id DROP NOT NULL,
  ALTER COLUMN profile_id DROP NOT NULL,
  ALTER COLUMN category_id DROP NOT NULL;
```

Источник: [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
ALTER TABLE party_runtime.party_items
      DROP CONSTRAINT IF EXISTS party_items_mechanics_source_check;
```

Источник: [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
ALTER TABLE party_runtime.party_items
      ADD CONSTRAINT party_items_mechanics_source_check CHECK (
        (
          run_id IS NOT NULL
          AND template_id IS NOT NULL
          AND profile_id IS NOT NULL
          AND category_id IS NOT NULL
          AND NOT state ? 'runtime_instance_mechanics_snapshot'
        )
        OR (
          run_id IS NULL
          AND template_id IS NULL
          AND profile_id IS NULL
          AND category_id IS NULL
          AND party_runtime.runtime_instance_mechanics_snapshot_valid(
            state->'runtime_instance_mechanics_snapshot'
          )
        )
      );
```

Источник: [`024_party_runtime_ordinary_world_items.sql`](../../schemas/party-db/024_party_runtime_ordinary_world_items.sql)

```sql
ALTER TABLE party_runtime.party_items
      DROP CONSTRAINT IF EXISTS party_items_mechanics_source_check;
```

Источник: [`024_party_runtime_ordinary_world_items.sql`](../../schemas/party-db/024_party_runtime_ordinary_world_items.sql)

```sql
ALTER TABLE party_runtime.party_items
      ADD CONSTRAINT party_items_mechanics_source_check CHECK (
        (
          run_id IS NOT NULL
          AND template_id IS NOT NULL
          AND profile_id IS NOT NULL
          AND category_id IS NOT NULL
          AND NOT state ? 'runtime_instance_mechanics_snapshot'
        )
        OR (
          run_id IS NULL
          AND template_id IS NULL
          AND profile_id IS NULL
          AND category_id IS NULL
          AND (
            party_runtime.runtime_instance_mechanics_snapshot_valid(
              state->'runtime_instance_mechanics_snapshot'
            )
            OR party_runtime
              .ordinary_world_runtime_instance_mechanics_snapshot_valid(
                state->'runtime_instance_mechanics_snapshot'
              )
          )
        )
      );
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_items
  DROP CONSTRAINT IF EXISTS party_items_mechanics_source_check;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_items
  ADD CONSTRAINT party_items_mechanics_source_check CHECK (
    (
      run_id IS NOT NULL AND template_id IS NOT NULL
      AND profile_id IS NOT NULL AND category_id IS NOT NULL
      AND NOT state ? 'runtime_instance_mechanics_snapshot'
    )
    OR (
      run_id IS NULL AND template_id IS NULL
      AND profile_id IS NULL AND category_id IS NULL
      AND (
        party_runtime.runtime_instance_mechanics_snapshot_valid(
          state->'runtime_instance_mechanics_snapshot')
        OR party_runtime
          .ordinary_world_runtime_instance_mechanics_snapshot_valid(
            state->'runtime_instance_mechanics_snapshot')
        OR (
          legal_status='ordinary_container_content'
          AND party_runtime.ordinary_container_runtime_mechanics_snapshot_valid(
            state->'runtime_instance_mechanics_snapshot')
        )
      )
    )
  );
```

Источник: [`027_party_runtime_action_production.sql`](../../schemas/party-db/027_party_runtime_action_production.sql)

```sql
ALTER TABLE party_runtime.party_items
  ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 1;
```

Источник: [`027_party_runtime_action_production.sql`](../../schemas/party-db/027_party_runtime_action_production.sql)

```sql
ALTER TABLE party_runtime.party_items
  DROP CONSTRAINT IF EXISTS party_items_state_version_safe_check;
```

Источник: [`027_party_runtime_action_production.sql`](../../schemas/party-db/027_party_runtime_action_production.sql)

```sql
ALTER TABLE party_runtime.party_items
  ADD CONSTRAINT party_items_state_version_safe_check CHECK (
    state_version >= 1 AND state_version <= 9007199254740991
  );
```

## `party_runtime.party_journey_locations`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_journey_locations (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  owner_kind text NOT NULL CHECK(owner_kind IN ('actor','cohort','transport')), owner_id text NOT NULL,
  location_kind text NOT NULL CHECK(location_kind IN ('scene','transit_anchor','in_transit')),
  scene_position_id text REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  transit_anchor_id text REFERENCES party_runtime.party_transit_anchors(id) ON DELETE RESTRICT,
  travel_state_id text REFERENCES party_runtime.traveller_travel_states(id) ON DELETE RESTRICT,
  state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL,
  CHECK((location_kind = 'scene') = (scene_position_id IS NOT NULL AND transit_anchor_id IS NULL AND travel_state_id IS NULL)),
  CHECK((location_kind = 'transit_anchor') = (scene_position_id IS NULL AND transit_anchor_id IS NOT NULL AND travel_state_id IS NULL)),
  CHECK((location_kind = 'in_transit') = (scene_position_id IS NULL AND transit_anchor_id IS NULL AND travel_state_id IS NOT NULL))
);
```

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_journey_location_root_owner_uq ON party_runtime.party_journey_locations(party_id, owner_kind, owner_id);
```

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE INDEX IF NOT EXISTS party_journey_location_lock_idx ON party_runtime.party_journey_locations(party_id, owner_kind, owner_id);
```

## `party_runtime.party_local_world_process_fuel_bindings`

Источник: [`028_party_runtime_local_exact_fire.sql`](../../schemas/party-db/028_party_runtime_local_exact_fire.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_local_world_process_fuel_bindings (
  party_id text NOT NULL,
  process_ref text NOT NULL,
  fuel_item_id text NOT NULL,
  binding_ordinal integer NOT NULL CHECK (binding_ordinal>=0),
  bound_at_change_set_id text NOT NULL,
  released_at_change_set_id text,
  PRIMARY KEY (party_id,process_ref,fuel_item_id),
  UNIQUE (party_id,process_ref,binding_ordinal),
  FOREIGN KEY (party_id,process_ref)
    REFERENCES party_runtime.party_local_world_processes(party_id,process_ref)
    ON DELETE RESTRICT,
  FOREIGN KEY (party_id,fuel_item_id)
    REFERENCES party_runtime.party_items(party_id,item_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id,bound_at_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (party_id,released_at_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED
);
```

Источник: [`028_party_runtime_local_exact_fire.sql`](../../schemas/party-db/028_party_runtime_local_exact_fire.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS
  party_local_world_process_fuel_active_unique
  ON party_runtime.party_local_world_process_fuel_bindings(party_id,fuel_item_id)
  WHERE released_at_change_set_id IS NULL;
```

## `party_runtime.party_local_world_processes`

Источник: [`028_party_runtime_local_exact_fire.sql`](../../schemas/party-db/028_party_runtime_local_exact_fire.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_local_world_processes (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id)
    ON DELETE RESTRICT,
  process_ref text NOT NULL,
  context_ref text NOT NULL CHECK (context_ref<>''),
  rule_ref jsonb NOT NULL,
  policy_ref jsonb NOT NULL,
  process_mode text NOT NULL CHECK (process_mode='local_exact'),
  process_kind text NOT NULL CHECK (process_kind='fire'),
  scope_ref text NOT NULL CHECK (scope_ref<>''),
  causal_basis_ref text NOT NULL CHECK (causal_basis_ref<>''),
  status text NOT NULL CHECK (status IN ('active','completed')),
  started_at jsonb NOT NULL,
  next_boundary_at jsonb,
  process_state jsonb NOT NULL,
  state_version bigint NOT NULL CHECK (
    state_version BETWEEN 1 AND 9007199254740991),
  last_change_set_id text NOT NULL,
  PRIMARY KEY (party_id,process_ref),
  FOREIGN KEY (party_id,last_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK ((status='active')=(next_boundary_at IS NOT NULL)),
  CHECK (jsonb_typeof(rule_ref)='object' AND jsonb_typeof(policy_ref)='object'),
  CHECK (
    party_runtime.runtime_item_jsonb_exact_keys(
      process_state, ARRAY['schema','process_ref','process_mode','process_kind',
        'scope_ref','causal_basis_ref','status','started_at','next_boundary_at',
        'fuel_bindings','state_version'])
    AND process_state->>'schema'='local_world_process_state_v1'
    AND process_state->>'process_ref'=process_ref
    AND process_state->>'process_mode'=process_mode
    AND process_state->>'process_kind'=process_kind
    AND process_state->>'scope_ref'=scope_ref
    AND process_state->>'causal_basis_ref'=causal_basis_ref
    AND process_state->>'status'=status
    AND (process_state->>'state_version')::bigint=state_version
    AND process_state->'started_at'=started_at
    AND ((next_boundary_at IS NULL
          AND process_state->'next_boundary_at'='null'::jsonb)
      OR (next_boundary_at IS NOT NULL
          AND process_state->'next_boundary_at'=next_boundary_at))
    AND jsonb_typeof(process_state->'fuel_bindings')='array'
  )
);
```

## `party_runtime.party_materialization_choices`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_materialization_runs`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_materialization_baseline_unique
  ON party_runtime.party_materialization_runs (party_id, g4_id)
  WHERE run_kind = 'baseline' AND status = 'committed';
```

## `party_runtime.party_narration_attempts`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_narration_attempts (
  attempt_id text PRIMARY KEY, job_id text NOT NULL REFERENCES party_runtime.party_narration_jobs(job_id) ON DELETE RESTRICT,
  attempt_ordinal integer NOT NULL CHECK(attempt_ordinal >= 0), outcome text NOT NULL CHECK(outcome IN ('delivered','failed_retryable')),
  output_digest text, failure_code text, failure_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id,attempt_ordinal),
  CHECK((outcome='delivered') = (output_digest IS NOT NULL)),
  CHECK((outcome='delivered') = (failure_code IS NULL))
);
```

Источник: [`032_party_runtime_factual_presentation_delivery.sql`](../../schemas/party-db/032_party_runtime_factual_presentation_delivery.sql)

```sql
ALTER TABLE party_runtime.party_narration_attempts
  DROP CONSTRAINT IF EXISTS party_narration_attempts_outcome_check,
  DROP CONSTRAINT IF EXISTS party_narration_attempts_check,
  DROP CONSTRAINT IF EXISTS party_narration_attempts_check1,
  DROP CONSTRAINT IF EXISTS party_narration_attempts_delivery_valid;
```

Источник: [`032_party_runtime_factual_presentation_delivery.sql`](../../schemas/party-db/032_party_runtime_factual_presentation_delivery.sql)

```sql
ALTER TABLE party_runtime.party_narration_attempts
  ADD CONSTRAINT party_narration_attempts_delivery_valid CHECK(
    attempt_ordinal >= 0 AND (
    (outcome='delivered' AND output_digest IS NOT NULL AND failure_code IS NULL)
    OR (outcome='factual_delivered' AND output_digest IS NULL AND failure_code IS NULL)
    OR (outcome='failed_retryable' AND output_digest IS NULL)
    )
  );
```

## `party_runtime.party_narration_jobs`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_narration_jobs (
  job_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  package_id text NOT NULL REFERENCES party_runtime.party_visible_packages(package_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('pending','in_progress','output_ready','delivered','failed_retryable')),
  idempotency_key text NOT NULL, next_attempt_ordinal integer NOT NULL DEFAULT 0 CHECK(next_attempt_ordinal >= 0),
  active_attempt_id text, claim_token text, lease_expires_at timestamptz,
  narration_output jsonb, output_digest text, state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  UNIQUE(party_id,idempotency_key), UNIQUE(package_id),
  CHECK(
    (status IN ('pending','failed_retryable') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NULL AND output_digest IS NULL)
    OR (status='in_progress' AND active_attempt_id IS NOT NULL AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL AND narration_output IS NULL AND output_digest IS NULL)
    OR (status IN ('output_ready','delivered') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NOT NULL AND output_digest IS NOT NULL)
  )
);
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_narration_jobs
  DROP CONSTRAINT IF EXISTS party_narration_jobs_package_id_fkey;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_narration_jobs
  DROP CONSTRAINT IF EXISTS party_narration_package_party_fk;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_narration_jobs
  ADD CONSTRAINT party_narration_package_party_fk
  FOREIGN KEY(package_id,party_id) REFERENCES party_runtime.party_visible_packages(package_id,party_id) ON DELETE RESTRICT;
```

Источник: [`032_party_runtime_factual_presentation_delivery.sql`](../../schemas/party-db/032_party_runtime_factual_presentation_delivery.sql)

```sql
ALTER TABLE party_runtime.party_narration_jobs
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'narrated',
  ADD COLUMN IF NOT EXISTS factual_screen jsonb;
```

Источник: [`032_party_runtime_factual_presentation_delivery.sql`](../../schemas/party-db/032_party_runtime_factual_presentation_delivery.sql)

```sql
ALTER TABLE party_runtime.party_narration_jobs
  DROP CONSTRAINT IF EXISTS party_narration_jobs_check,
  DROP CONSTRAINT IF EXISTS party_narration_jobs_delivery_valid;
```

Источник: [`032_party_runtime_factual_presentation_delivery.sql`](../../schemas/party-db/032_party_runtime_factual_presentation_delivery.sql)

```sql
ALTER TABLE party_runtime.party_narration_jobs
  ADD CONSTRAINT party_narration_jobs_delivery_valid CHECK(
    state_version >= 1 AND next_attempt_ordinal >= 0 AND delivery_mode IN ('narrated','factual') AND (
    (delivery_mode='narrated' AND (
      (status IN ('pending','failed_retryable') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NULL AND output_digest IS NULL AND factual_screen IS NULL)
      OR (status='in_progress' AND active_attempt_id IS NOT NULL AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL AND narration_output IS NULL AND output_digest IS NULL AND factual_screen IS NULL)
      OR (status IN ('output_ready','delivered') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NOT NULL AND output_digest IS NOT NULL AND factual_screen IS NULL)
    ))
    OR (delivery_mode='factual' AND status='delivered' AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NULL AND output_digest IS NULL AND factual_screen IS NOT NULL))
  );
```

## `party_runtime.party_npc_decision_traces`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_decision_traces (
  request_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL, state_version bigint NOT NULL CHECK(state_version >= 1), option_id text NOT NULL, command_token text NOT NULL,
  options_digest text NOT NULL, status text NOT NULL CHECK(status IN ('validated','committed','cancelled')),
  validated_at_whole_minutes numeric NOT NULL,
  validated_at_subminute_numerator numeric NOT NULL,
  validated_at_subminute_denominator numeric NOT NULL,
  idempotency_key text NOT NULL, change_set_id text, trace_digest text NOT NULL,
  CHECK(party_runtime.game_timestamp_parts_valid(validated_at_whole_minutes,validated_at_subminute_numerator,validated_at_subminute_denominator)),
  UNIQUE(party_id,idempotency_key), UNIQUE(party_id,npc_id,options_digest)
);
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_npc_decision_traces_party_identity_key
  ON party_runtime.party_npc_decision_traces (party_id, request_id);
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  ALTER COLUMN option_id DROP NOT NULL,
  ALTER COLUMN command_token DROP NOT NULL,
  ALTER COLUMN options_digest DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS boundary_id text,
  ADD COLUMN IF NOT EXISTS decision_mode text,
  ADD COLUMN IF NOT EXISTS root_turn_id text,
  ADD COLUMN IF NOT EXISTS working_revision bigint,
  ADD COLUMN IF NOT EXISTS signal_refs jsonb,
  ADD COLUMN IF NOT EXISTS decision_categories jsonb,
  ADD COLUMN IF NOT EXISTS aggregate_significance text,
  ADD COLUMN IF NOT EXISTS same_time_batch_ref jsonb,
  ADD COLUMN IF NOT EXISTS semantic_request jsonb,
  ADD COLUMN IF NOT EXISTS boundary_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS signal_records jsonb,
  ADD COLUMN IF NOT EXISTS semantic_plan jsonb,
  ADD COLUMN IF NOT EXISTS canonical_input_digest text,
  ADD COLUMN IF NOT EXISTS semantic_trace_schema text;
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_decision_mode_check;
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_decision_mode_check CHECK (
    decision_mode IS NULL
    OR decision_mode IN ('autonomous', 'conversation', 'combat')
  );
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_working_revision_check;
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_working_revision_check CHECK (
    working_revision IS NULL OR working_revision >= 0
  );
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_categories_check;
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_categories_check CHECK (
    decision_categories IS NULL
    OR party_runtime.npc_semantic_categories_valid(decision_categories)
  );
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_json_check;
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_json_check CHECK (
    (signal_refs IS NULL OR jsonb_typeof(signal_refs) = 'array')
    AND (same_time_batch_ref IS NULL OR jsonb_typeof(same_time_batch_ref) = 'object')
    AND (semantic_request IS NULL OR jsonb_typeof(semantic_request) = 'object')
    AND (boundary_snapshot IS NULL OR jsonb_typeof(boundary_snapshot) = 'object')
    AND (signal_records IS NULL OR jsonb_typeof(signal_records) = 'array')
    AND (semantic_plan IS NULL OR jsonb_typeof(semantic_plan) = 'object')
  );
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_significance_check;
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_significance_check CHECK (
    aggregate_significance IS NULL
    OR aggregate_significance IN ('material', 'critical')
  );
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_schema_check;
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_schema_check CHECK (
    semantic_trace_schema IS NULL
    OR semantic_trace_schema = 'npc_semantic_decision_trace_v1'
  );
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_branch_check;
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_branch_check CHECK (
    (
      option_id IS NOT NULL
      AND command_token IS NOT NULL
      AND options_digest IS NOT NULL
      AND boundary_id IS NULL
      AND decision_mode IS NULL
      AND root_turn_id IS NULL
      AND working_revision IS NULL
      AND signal_refs IS NULL
      AND decision_categories IS NULL
      AND aggregate_significance IS NULL
      AND same_time_batch_ref IS NULL
      AND semantic_request IS NULL
      AND boundary_snapshot IS NULL
      AND signal_records IS NULL
      AND semantic_plan IS NULL
      AND canonical_input_digest IS NULL
      AND semantic_trace_schema IS NULL
    )
    OR
    (
      option_id IS NULL
      AND command_token IS NULL
      AND options_digest IS NULL
      AND boundary_id IS NOT NULL
      AND decision_mode IS NOT NULL
      AND root_turn_id IS NOT NULL
      AND working_revision IS NOT NULL
      AND signal_refs IS NOT NULL
      AND decision_categories IS NOT NULL
      AND aggregate_significance IS NOT NULL
      AND same_time_batch_ref IS NOT NULL
      AND semantic_request IS NOT NULL
      AND boundary_snapshot IS NOT NULL
      AND signal_records IS NOT NULL
      AND semantic_plan IS NOT NULL
      AND canonical_input_digest IS NOT NULL
      AND semantic_trace_schema IS NOT NULL
      AND change_set_id IS NOT NULL
      AND status = 'committed'
    )
  );
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_change_set_fk;
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_change_set_fk
  FOREIGN KEY (party_id, change_set_id)
  REFERENCES party_runtime.party_v3_change_sets(party_id, id)
  ON DELETE RESTRICT;
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_npc_decision_traces_boundary_key
  ON party_runtime.party_npc_decision_traces (party_id, boundary_id)
  WHERE boundary_id IS NOT NULL;
```

Источник: [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_npc_decision_traces_batch_npc_key
  ON party_runtime.party_npc_decision_traces (
    party_id,
    npc_id,
    (same_time_batch_ref ->> 'entity_id')
  )
  WHERE boundary_id IS NOT NULL;
```

Источник: [`033_party_runtime_initial_semantic_decision.sql`](../../schemas/party-db/033_party_runtime_initial_semantic_decision.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_state_version_check;
```

Источник: [`033_party_runtime_initial_semantic_decision.sql`](../../schemas/party-db/033_party_runtime_initial_semantic_decision.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_state_version_check
  CHECK (state_version >= 0);
```

## `party_runtime.party_npc_knowledge`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_knowledge (
  party_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  knowledge_state TEXT NOT NULL,
  PRIMARY KEY (party_id, npc_id, fact_id),
  FOREIGN KEY (party_id, npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE
);
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
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
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
ALTER TABLE party_runtime.party_npc_knowledge
  DROP CONSTRAINT IF EXISTS party_npc_knowledge_target_branch_valid;
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
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
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
ALTER TABLE party_runtime.party_npc_knowledge
  DROP CONSTRAINT IF EXISTS party_npc_knowledge_source_perception_fk;
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
ALTER TABLE party_runtime.party_npc_knowledge
  ADD CONSTRAINT party_npc_knowledge_source_perception_fk
  FOREIGN KEY (party_id, source_perception_id)
  REFERENCES party_runtime.party_perception_records(party_id, perception_id) ON DELETE RESTRICT;
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
ALTER TABLE party_runtime.party_npc_knowledge
  DROP CONSTRAINT IF EXISTS party_npc_knowledge_target_change_set_fk;
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
ALTER TABLE party_runtime.party_npc_knowledge
  ADD CONSTRAINT party_npc_knowledge_target_change_set_fk
  FOREIGN KEY (party_id, updated_change_set_id)
  REFERENCES party_runtime.party_v3_change_sets(party_id, id) ON DELETE RESTRICT;
```

## `party_runtime.party_npc_knowledge_merge_results`

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
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
```

## `party_runtime.party_npc_knowledge_merge_states`

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
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
```

## `party_runtime.party_npc_reaction_consequences`

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
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
```

## `party_runtime.party_npc_reaction_option_proposals`

Источник: [`010_party_runtime_pr8_reaction_options.sql`](../../schemas/party-db/010_party_runtime_pr8_reaction_options.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_reaction_option_proposals (
  request_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL,
  source_perception_id text NOT NULL,
  state_version bigint NOT NULL CHECK (state_version >= 1),
  options_digest text NOT NULL,
  proposal jsonb NOT NULL CHECK (jsonb_typeof(proposal) = 'object'),
  dependency_pins jsonb NOT NULL
    CHECK (jsonb_typeof(dependency_pins) = 'object'),
  canonical_digest text NOT NULL,
  idempotency_key text NOT NULL,
  change_set_id text NOT NULL,
  FOREIGN KEY (party_id, npc_id)
    REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, source_perception_id)
    REFERENCES party_runtime.party_perception_records(party_id, perception_id)
      ON DELETE RESTRICT,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
      ON DELETE RESTRICT,
  UNIQUE (party_id, request_id),
  UNIQUE (party_id, idempotency_key)
);
```

## `party_runtime.party_npc_relations`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_npc_runtime_transitions`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_runtime_transitions (
  transition_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL, transition_kind text NOT NULL, event_id text REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE RESTRICT,
  change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_whole_minutes)),
  occurred_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_numerator) AND occurred_at_subminute_numerator >= 0),
  occurred_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_denominator) AND occurred_at_subminute_denominator > 0),
  trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(party_runtime.game_timestamp_parts_valid(occurred_at_whole_minutes,occurred_at_subminute_numerator,occurred_at_subminute_denominator)), UNIQUE(party_id,idempotency_record_id)
);
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_npc_runtime_transitions
  DROP CONSTRAINT IF EXISTS party_npc_runtime_transitions_event_id_fkey;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_npc_runtime_transitions
  DROP CONSTRAINT IF EXISTS party_npc_transition_event_party_fk;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_npc_runtime_transitions
  ADD CONSTRAINT party_npc_transition_event_party_fk
  FOREIGN KEY(event_id,party_id) REFERENCES party_runtime.party_temporal_events(event_id,party_id) ON DELETE RESTRICT;
```

## `party_runtime.party_npc_schedules`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_npc_spatial_schedules`

Источник: [`005_party_runtime_v3_domain.sql`](../../schemas/party-db/005_party_runtime_v3_domain.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_spatial_schedules (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL, current_position_node_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  schedule_profile_ref jsonb NOT NULL, dependency_pins jsonb NOT NULL, causal_state_ref jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('active','inactive')), state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL
);
```

Источник: [`005_party_runtime_v3_domain.sql`](../../schemas/party-db/005_party_runtime_v3_domain.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_npc_spatial_schedule_active_uq ON party_runtime.party_npc_spatial_schedules(party_id,npc_id) WHERE status='active';
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_npc_spatial_schedules
  ADD COLUMN IF NOT EXISTS next_transition_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS next_transition_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS next_transition_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS current_activity_execution_id text REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS attention_state_ref jsonb,
  ADD COLUMN IF NOT EXISTS body_state_ref jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_state_ref jsonb,
  ADD COLUMN IF NOT EXISTS relationship_state_ref jsonb;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_npc_spatial_schedules
  DROP CONSTRAINT IF EXISTS party_npc_exact_schedule_boundary_valid;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_npc_spatial_schedules
  ADD CONSTRAINT party_npc_exact_schedule_boundary_valid CHECK (
    state_version >= 1
    AND (status='active') = (
      next_transition_at_whole_minutes IS NOT NULL
      AND next_transition_at_subminute_numerator IS NOT NULL
      AND next_transition_at_subminute_denominator IS NOT NULL
    )
    AND (
      (next_transition_at_whole_minutes IS NULL AND next_transition_at_subminute_numerator IS NULL AND next_transition_at_subminute_denominator IS NULL)
      OR party_runtime.game_timestamp_parts_valid(next_transition_at_whole_minutes,next_transition_at_subminute_numerator,next_transition_at_subminute_denominator)
    )
  );
```

Источник: [`031_party_runtime_deferred_npc_schedules.sql`](../../schemas/party-db/031_party_runtime_deferred_npc_schedules.sql)

```sql
ALTER TABLE party_runtime.party_npc_spatial_schedules
  ALTER COLUMN current_position_node_id DROP NOT NULL;
```

## `party_runtime.party_npc_traits`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_traits (
  party_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  trait_domain TEXT NOT NULL,
  category_id TEXT NOT NULL,
  source_profile_id TEXT NOT NULL,
  PRIMARY KEY (party_id, npc_id, trait_domain, category_id),
  FOREIGN KEY (party_id, npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE
);
```

## `party_runtime.party_npcs`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

## `party_runtime.party_obligation_transitions`

Источник: [`013_party_runtime_obligations.sql`](../../schemas/party-db/013_party_runtime_obligations.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_obligation_transitions (
  obligation_transition_id text PRIMARY KEY,
  party_id text NOT NULL,
  obligation_id text NOT NULL,
  transition_ordinal integer NOT NULL CHECK(transition_ordinal >= 0),
  from_state text,
  to_state text NOT NULL,
  transition_kind text NOT NULL,
  causal_basis jsonb NOT NULL,
  witness_snapshot jsonb NOT NULL,
  activity_execution_id text
    REFERENCES party_runtime.party_timed_activity_executions(id)
    ON DELETE RESTRICT,
  check_resolution_id text
    REFERENCES party_runtime.party_check_resolutions(check_resolution_id)
    ON DELETE RESTRICT,
  npc_decision_request_id text
    REFERENCES party_runtime.party_npc_decision_traces(request_id)
    ON DELETE RESTRICT,
  change_set_id text NOT NULL,
  idempotency_record_id text
    REFERENCES party_runtime.party_command_idempotency(id)
    ON DELETE RESTRICT,
  occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn >= 0),
  occurred_at_whole_minutes numeric NOT NULL,
  occurred_at_subminute_numerator numeric NOT NULL,
  occurred_at_subminute_denominator numeric NOT NULL,
  UNIQUE(party_id, obligation_id, transition_ordinal),
  UNIQUE(
    party_id,
    obligation_id,
    idempotency_record_id,
    transition_ordinal
  ),
  CHECK(from_state IS NULL OR NULLIF(btrim(from_state), '') IS NOT NULL),
  CHECK(NULLIF(btrim(to_state), '') IS NOT NULL),
  CHECK(NULLIF(btrim(transition_kind), '') IS NOT NULL),
  CHECK(jsonb_typeof(causal_basis) = 'object'),
  CHECK(party_runtime.obligation_actor_refs_valid(witness_snapshot)),
  CHECK(party_runtime.game_timestamp_parts_valid(
    occurred_at_whole_minutes,
    occurred_at_subminute_numerator,
    occurred_at_subminute_denominator
  )),
  FOREIGN KEY(party_id, obligation_id)
    REFERENCES party_runtime.party_obligations(party_id, obligation_id)
    ON DELETE CASCADE,
  FOREIGN KEY(party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);
```

## `party_runtime.party_obligations`

Источник: [`013_party_runtime_obligations.sql`](../../schemas/party-db/013_party_runtime_obligations.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_obligations (
  obligation_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  policy_ref jsonb NOT NULL,
  policy_version text NOT NULL,
  promisor_ref jsonb NOT NULL,
  beneficiary_ref jsonb NOT NULL,
  witness_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  scope_snapshot jsonb NOT NULL,
  current_state text NOT NULL,
  current_state_fact text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  last_change_set_id text NOT NULL,
  UNIQUE(party_id, obligation_id),
  CHECK(
    jsonb_typeof(policy_ref) = 'object'
    AND COALESCE(
      NULLIF(btrim(policy_ref->>'entity_id'), ''),
      NULLIF(btrim(policy_ref->>'id'), ''),
      ''
    ) <> ''
    AND NULLIF(btrim(policy_version), '') IS NOT NULL
  ),
  CHECK(party_runtime.obligation_actor_ref_valid(promisor_ref)),
  CHECK(party_runtime.obligation_actor_ref_valid(beneficiary_ref)),
  CHECK(party_runtime.obligation_actor_refs_valid(witness_refs)),
  CHECK(jsonb_typeof(scope_snapshot) = 'object'),
  CHECK(NULLIF(btrim(current_state), '') IS NOT NULL),
  CHECK(NULLIF(btrim(current_state_fact), '') IS NOT NULL),
  FOREIGN KEY(party_id, created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id, last_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);
```

## `party_runtime.party_ordinary_materialization_aggregates`

Источник: [`021_party_runtime_ordinary_materialization.sql`](../../schemas/party-db/021_party_runtime_ordinary_materialization.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_aggregates (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('g6', 'scene_position', 'container', 'source')),
  scope_id TEXT NOT NULL CHECK (
    scope_id <> ''
    AND scope_id !~ '^[[:space:]]|[[:space:]]$'
    AND scope_id !~ '[[:cntrl:]]'
  ),
  state_version BIGINT NOT NULL CHECK (state_version >= 0),
  aggregate_payload JSONB NOT NULL CHECK (jsonb_typeof(aggregate_payload) = 'object'),
  PRIMARY KEY (party_id, scope_kind, scope_id)
);
```

Источник: [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_aggregates
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_aggregates_state_version_check;
```

Источник: [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_aggregates
  ADD CONSTRAINT party_ordinary_materialization_aggregates_state_version_check
  CHECK (state_version >= 0 AND state_version <= 9007199254740991);
```

## `party_runtime.party_ordinary_materialization_basis_catalog`

Источник: [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_basis_catalog (
  party_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  basis_ref TEXT NOT NULL,
  origin_request_identity TEXT,
  basis_snapshot JSONB NOT NULL CHECK (jsonb_typeof(basis_snapshot) = 'object'),
  PRIMARY KEY (party_id,scope_kind,scope_id,basis_ref),
  FOREIGN KEY (party_id,origin_request_identity) REFERENCES party_runtime.party_ordinary_materialization_commits(party_id,request_identity) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id) REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id) ON DELETE CASCADE,
  CHECK (basis_ref <> '' AND basis_snapshot ->> 'basis_ref' = basis_ref),
  CHECK (basis_snapshot ->> 'state' IN ('committed','prepared_seed')),
  CHECK (basis_snapshot -> 'scope_ref' ->> 'entity_kind' = scope_kind),
  CHECK (basis_snapshot -> 'scope_ref' ->> 'entity_id' = scope_id),
  CHECK ((basis_snapshot ->> 'state' = 'prepared_seed') = (origin_request_identity IS NOT NULL))
);
```

## `party_runtime.party_ordinary_materialization_commit_items`

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_commit_items (
  party_id text NOT NULL,
  request_identity text NOT NULL,
  item_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  resolution_request_identity text NOT NULL,
  PRIMARY KEY (party_id,request_identity,item_id),
  UNIQUE (party_id,request_identity,ordinal),
  UNIQUE (party_id,resolution_request_identity),
  FOREIGN KEY (party_id,request_identity)
    REFERENCES party_runtime.party_ordinary_materialization_commits(party_id,request_identity)
    ON DELETE CASCADE,
  FOREIGN KEY (party_id,item_id)
    REFERENCES party_runtime.party_ordinary_materialization_items(party_id,item_id)
    ON DELETE CASCADE
);
```

## `party_runtime.party_ordinary_materialization_commits`

Источник: [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_commits (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  request_identity TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  transition_digest TEXT NOT NULL,
  write_plan_digest TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('materialize','absent','no_change','authority_required')),
  transition_count SMALLINT NOT NULL CHECK (transition_count IN (1,2)),
  from_party_state_version BIGINT NOT NULL CHECK (from_party_state_version >= 0 AND from_party_state_version <= 9007199254740991),
  to_party_state_version BIGINT NOT NULL CHECK (to_party_state_version = from_party_state_version + 1),
  from_ordinary_state_version BIGINT NOT NULL CHECK (from_ordinary_state_version >= 0 AND from_ordinary_state_version <= 9007199254740991),
  to_ordinary_state_version BIGINT NOT NULL CHECK (to_ordinary_state_version = from_ordinary_state_version + transition_count),
  item_id TEXT,
  PRIMARY KEY (party_id,request_identity),
  UNIQUE (party_id,scope_kind,scope_id,request_identity),
  UNIQUE (party_id,request_identity,transition_digest),
  FOREIGN KEY (party_id,scope_kind,scope_id) REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id) ON DELETE CASCADE,
  CHECK ((resolution = 'materialize') = (item_id IS NOT NULL))
);
```

Источник: [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_item_fk;
```

Источник: [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_item_fk
  FOREIGN KEY (party_id,request_identity,item_id)
  REFERENCES party_runtime.party_ordinary_materialization_items(party_id,request_identity,item_id)
  DEFERRABLE INITIALLY DEFERRED;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD COLUMN IF NOT EXISTS plan_schema text;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD COLUMN IF NOT EXISTS item_count integer;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD COLUMN IF NOT EXISTS max_new_entities integer DEFAULT 1;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN plan_schema SET NOT NULL;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN item_count SET NOT NULL;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN max_new_entities SET NOT NULL;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN max_new_entities SET DEFAULT 1;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_batch_limit_check;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_batch_limit_check
  CHECK (max_new_entities BETWEEN 1 AND 8
    AND item_count BETWEEN 0 AND max_new_entities);
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_transition_count_check;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_transition_count_check
  CHECK (transition_count >= 1 AND transition_count <= 128);
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_check;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_item_cardinality_check;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_item_cardinality_check CHECK (
    (plan_schema='ordinary_materialization_atomic_write_plan_v1'
      AND item_count IN (0,1)
      AND max_new_entities=1
      AND ((resolution='materialize')=(item_id IS NOT NULL))
      AND item_count=CASE WHEN item_id IS NULL THEN 0 ELSE 1 END)
    OR
    (plan_schema='ordinary_container_contents_atomic_write_plan_v2'
      AND scope_kind='container' AND item_id IS NULL
      AND item_count <= max_new_entities
      AND resolution IN ('materialize','no_change'))
  );
```

## `party_runtime.party_ordinary_materialization_contexts`

Источник: [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_contexts (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('g6','scene_position','container','source')),
  scope_id TEXT NOT NULL,
  catalog_version BIGINT NOT NULL CHECK (catalog_version >= 0 AND catalog_version <= 9007199254740991),
  property_version BIGINT NOT NULL CHECK (property_version >= 0 AND property_version <= 9007199254740991),
  placement_version BIGINT NOT NULL CHECK (placement_version >= 0 AND placement_version <= 9007199254740991),
  supporting_basis_catalog_version BIGINT NOT NULL DEFAULT 0 CHECK (supporting_basis_catalog_version >= 0 AND supporting_basis_catalog_version <= 9007199254740991),
  supporting_basis_catalog_digest TEXT NOT NULL CHECK (supporting_basis_catalog_digest <> ''),
  property_placement_context_digest TEXT NOT NULL CHECK (property_placement_context_digest <> ''),
  property_placement_base_snapshot JSONB NOT NULL CHECK (jsonb_typeof(property_placement_base_snapshot) = 'object'),
  PRIMARY KEY (party_id,scope_kind,scope_id),
  FOREIGN KEY (party_id,scope_kind,scope_id)
    REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id)
    ON DELETE CASCADE
);
```

## `party_runtime.party_ordinary_materialization_enablements`

Источник: [`023_party_runtime_ordinary_materialization_enablement.sql`](../../schemas/party-db/023_party_runtime_ordinary_materialization_enablement.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_enablements (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind = 'g6'),
  scope_id TEXT NOT NULL CHECK (scope_id <> ''),
  objective_snapshot JSONB NOT NULL CHECK (jsonb_typeof(objective_snapshot) = 'object'),
  objective_digest TEXT NOT NULL CHECK (objective_digest <> ''),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (party_id, scope_kind, scope_id),
  FOREIGN KEY (party_id, scope_kind, scope_id)
    REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id, scope_kind, scope_id)
    ON DELETE CASCADE,
  FOREIGN KEY (party_id, scope_kind, scope_id)
    REFERENCES party_runtime.party_ordinary_materialization_contexts(party_id, scope_kind, scope_id)
    ON DELETE CASCADE,
  CHECK (objective_snapshot -> 'scope_ref' ->> 'entity_kind' = scope_kind),
  CHECK (objective_snapshot -> 'scope_ref' ->> 'entity_id' = scope_id)
);
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_enablements
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_enablements_scope_kind_check;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_enablements
  ADD CONSTRAINT party_ordinary_materialization_enablements_scope_kind_check
  CHECK (scope_kind IN ('g6','container'));
```

## `party_runtime.party_ordinary_materialization_item_basis_refs`

Источник: [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_item_basis_refs (
  party_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  basis_ref TEXT NOT NULL,
  PRIMARY KEY (party_id,item_id,basis_ref),
  FOREIGN KEY (party_id,item_id) REFERENCES party_runtime.party_ordinary_materialization_items(party_id,item_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id,basis_ref) REFERENCES party_runtime.party_ordinary_materialization_basis_catalog(party_id,scope_kind,scope_id,basis_ref) ON DELETE CASCADE
);
```

## `party_runtime.party_ordinary_materialization_items`

Источник: [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_items (
  party_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  request_identity TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  candidate_key TEXT NOT NULL,
  coverage_key TEXT NOT NULL,
  context_version TEXT NOT NULL,
  functional_bucket TEXT NOT NULL,
  admission_class TEXT NOT NULL,
  supporting_basis_ref TEXT NOT NULL,
  causal_basis_refs JSONB NOT NULL CHECK (jsonb_typeof(causal_basis_refs) = 'array'),
  property_basis_ref TEXT NOT NULL,
  position_ref TEXT NOT NULL,
  property_placement_context_digest TEXT NOT NULL,
  property_catalog_version_ref TEXT NOT NULL,
  placement_catalog_version_ref TEXT NOT NULL,
  property_placement_evidence JSONB NOT NULL CHECK (jsonb_typeof(property_placement_evidence) = 'object'),
  mechanics_policy_ref TEXT NOT NULL,
  item_proposal JSONB NOT NULL CHECK (jsonb_typeof(item_proposal) = 'object'),
  mechanics_snapshot JSONB NOT NULL CHECK (jsonb_typeof(mechanics_snapshot) = 'object'),
  PRIMARY KEY (party_id,item_id),
  UNIQUE (party_id,request_identity),
  UNIQUE (party_id,request_identity,item_id),
  UNIQUE (party_id,scope_kind,scope_id,candidate_key,coverage_key,context_version),
  FOREIGN KEY (party_id,request_identity) REFERENCES party_runtime.party_ordinary_materialization_commits(party_id,request_identity) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id) REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id,supporting_basis_ref) REFERENCES party_runtime.party_ordinary_materialization_basis_catalog(party_id,scope_kind,scope_id,basis_ref) ON DELETE RESTRICT,
  CONSTRAINT party_ordinary_materialization_items_item_proposal_schema_check CHECK (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v1'),
  CONSTRAINT party_ordinary_materialization_items_property_placement_evidence_schema_check CHECK (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v2'),
  CHECK (property_placement_evidence ->> 'property_placement_context_digest' = property_placement_context_digest),
  CHECK (property_placement_evidence ->> 'property_catalog_version_ref' = property_catalog_version_ref),
  CHECK (property_placement_evidence ->> 'placement_catalog_version_ref' = placement_catalog_version_ref),
  CHECK (property_placement_evidence ->> 'property_basis_ref' = property_basis_ref),
  CHECK (property_placement_evidence -> 'placement' ->> 'position_ref' = position_ref),
  CHECK (mechanics_snapshot ->> 'schema' = 'rus.items.runtime_instance_mechanics_snapshot.v2'),
  CHECK (mechanics_snapshot -> 'provenance' ->> 'source_kind' = 'ordinary_world_materialization')
);
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_item_proposal_schema_check;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_property_placement_evidence_schema_check;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_item_proposal_schema_check CHECK (
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v1'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb)
    OR
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v2'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal ->> 'causal_basis_kind' IN ('personal_possession','stored_supply','communal_or_service','waste_or_scrap','remnant','finite_source','ambient_source','local_natural_feature'))
    OR
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v3'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal ->> 'causal_basis_kind' IN ('personal_possession','stored_supply','communal_or_service','waste_or_scrap','remnant','finite_source','ambient_source','local_natural_feature')
      AND item_proposal ->> 'condition_state' IN ('serviceable','damaged')
      AND (item_proposal ->> 'condition_state' <> 'damaged' OR item_proposal ->> 'causal_basis_kind' = 'remnant'))
  );
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_property_placement_evidence_schema_check CHECK (
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v2'
      AND property_placement_evidence ->> 'version' = '2'
      AND property_placement_evidence ?& ARRAY['schema','version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','placement_context_ref','placement']
      AND property_placement_evidence - ARRAY['schema','version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','placement_context_ref','placement'] = '{}'::jsonb)
    OR
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v3'
      AND property_placement_evidence ->> 'version' = '3'
      AND property_placement_evidence ->> 'property_context_version' = '2'
      AND property_placement_evidence ?& ARRAY['schema','version','property_context_version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','unowned_cause_kind','placement_context_ref','placement']
      AND property_placement_evidence - ARRAY['schema','version','property_context_version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','unowned_cause_kind','placement_context_ref','placement'] = '{}'::jsonb
      AND (property_placement_evidence ->> 'unowned_cause_kind' IS NULL OR property_placement_evidence ->> 'unowned_cause_kind' IN ('lost','discarded','abandoned','broken_waste','battlefield_or_ruin_remnant')))
  );
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD COLUMN IF NOT EXISTS container_id text;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD COLUMN IF NOT EXISTS resolution_request_identity text;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ALTER COLUMN resolution_request_identity SET NOT NULL;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ALTER COLUMN position_ref DROP NOT NULL;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_party_id_request_identity_key;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_placement_xor_check;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_placement_xor_check CHECK (
    (position_ref IS NOT NULL AND container_id IS NULL)
    OR (position_ref IS NULL AND container_id IS NOT NULL AND scope_kind='container')
  );
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_container_fk;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_container_fk
  FOREIGN KEY (party_id,container_id)
  REFERENCES party_runtime.party_containers(party_id,container_id)
  DEFERRABLE INITIALLY DEFERRED;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_item_proposal_schema_check;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_item_proposal_schema_check CHECK (
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v1'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb)
    OR
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v2'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal ->> 'causal_basis_kind' IN ('personal_possession','stored_supply','communal_or_service','waste_or_scrap','remnant','finite_source','ambient_source','local_natural_feature'))
    OR
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v3'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal ->> 'causal_basis_kind' IN ('personal_possession','stored_supply','communal_or_service','waste_or_scrap','remnant','finite_source','ambient_source','local_natural_feature')
      AND item_proposal ->> 'condition_state' IN ('serviceable','damaged')
      AND (item_proposal ->> 'condition_state' <> 'damaged'
        OR item_proposal ->> 'causal_basis_kind' = 'remnant'))
    OR
    (item_proposal ->> 'schema' = 'ordinary_existing_container_item_proposal_v1'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal -> 'scope_ref' ->> 'entity_kind'='container'
      AND item_proposal -> 'scope_ref' ->> 'entity_id'=container_id
      AND item_proposal -> 'placement' ->> 'container_id'=container_id
      AND (item_proposal ->> 'causal_basis_kind' IS NULL
        OR item_proposal ->> 'causal_basis_kind' IN
          ('personal_possession','stored_supply','communal_or_service',
           'waste_or_scrap','remnant','finite_source','ambient_source',
           'local_natural_feature'))
      AND item_proposal ->> 'condition_state' IN ('serviceable','damaged')
      AND (item_proposal ->> 'condition_state' <> 'damaged'
        OR item_proposal ->> 'causal_basis_kind' = 'remnant'))
  );
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_property_placement_evidence_schema_check;
```

Источник: [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_property_placement_evidence_schema_check CHECK (
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v2'
      AND property_placement_evidence ->> 'version' = '2'
      AND property_placement_evidence ?& ARRAY['schema','version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','placement_context_ref','placement']
      AND property_placement_evidence - ARRAY['schema','version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','placement_context_ref','placement'] = '{}'::jsonb)
    OR
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v3'
      AND property_placement_evidence ->> 'version' = '3'
      AND property_placement_evidence ->> 'property_context_version' = '2'
      AND property_placement_evidence ?& ARRAY['schema','version','property_context_version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','unowned_cause_kind','placement_context_ref','placement']
      AND property_placement_evidence - ARRAY['schema','version','property_context_version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','unowned_cause_kind','placement_context_ref','placement'] = '{}'::jsonb
      AND (property_placement_evidence ->> 'unowned_cause_kind' IS NULL OR property_placement_evidence ->> 'unowned_cause_kind' IN ('lost','discarded','abandoned','broken_waste','battlefield_or_ruin_remnant')))
    OR
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_existing_container_property_placement_evidence.v1'
      AND property_placement_evidence ->> 'version' = '1'
      AND property_placement_evidence ?& ARRAY['schema','version','scope_ref','container_id','property_basis_ref','property_context_ref','owner_controller_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref']
      AND property_placement_evidence - ARRAY['schema','version','scope_ref','container_id','property_basis_ref','property_context_ref','owner_controller_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref'] = '{}'::jsonb
      AND property_placement_evidence -> 'scope_ref' ->> 'entity_kind'='container'
      AND property_placement_evidence -> 'scope_ref' ->> 'entity_id'=container_id
      AND property_placement_evidence ->> 'container_id'=container_id)
  );
```

## `party_runtime.party_ownership`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_ownership (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  ownership_id TEXT NOT NULL,
  item_id TEXT,
  container_id TEXT,
  owner_npc_id TEXT,
  owner_character_id TEXT,
  owner_party BOOLEAN NOT NULL DEFAULT false,
  controller_npc_id TEXT,
  controller_character_id TEXT,
  claim_state TEXT NOT NULL,
  PRIMARY KEY (party_id, ownership_id),
  FOREIGN KEY (party_id, item_id) REFERENCES party_runtime.party_items(party_id, item_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, container_id) REFERENCES party_runtime.party_containers(party_id, container_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, owner_npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, owner_character_id) REFERENCES party_runtime.party_player_characters(party_id, character_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, controller_npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, controller_character_id) REFERENCES party_runtime.party_player_characters(party_id, character_id) ON DELETE RESTRICT,
  CHECK ((CASE WHEN item_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN container_id IS NULL THEN 0 ELSE 1 END) = 1),
  CHECK ((CASE WHEN owner_npc_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN owner_character_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN owner_party THEN 1 ELSE 0 END) = 1)
  ,CHECK (NOT (controller_npc_id IS NOT NULL AND controller_character_id IS NOT NULL))
);
```

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_ownership_item_unique ON party_runtime.party_ownership (party_id, item_id) WHERE item_id IS NOT NULL;
```

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_ownership_container_unique ON party_runtime.party_ownership (party_id, container_id) WHERE container_id IS NOT NULL;
```

Источник: [`012_party_runtime_external_ownership.sql`](../../schemas/party-db/012_party_runtime_external_ownership.sql)

```sql
ALTER TABLE party_runtime.party_ownership
  ADD COLUMN IF NOT EXISTS owner_external_ref JSONB;
```

Источник: [`012_party_runtime_external_ownership.sql`](../../schemas/party-db/012_party_runtime_external_ownership.sql)

```sql
ALTER TABLE party_runtime.party_ownership
      ADD CONSTRAINT party_ownership_exactly_one_owner_check CHECK (
        (CASE WHEN owner_npc_id IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN owner_character_id IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN owner_party THEN 1 ELSE 0 END)
        + (CASE WHEN owner_external_ref IS NULL THEN 0 ELSE 1 END) = 1
      );
```

Источник: [`012_party_runtime_external_ownership.sql`](../../schemas/party-db/012_party_runtime_external_ownership.sql)

```sql
ALTER TABLE party_runtime.party_ownership
      ADD CONSTRAINT party_ownership_external_owner_ref_check CHECK (
        owner_external_ref IS NULL OR (
          jsonb_typeof(owner_external_ref) = 'object'
          AND COALESCE(
            NULLIF(btrim(owner_external_ref->>'entity_kind'), ''), ''
          ) <> ''
          AND COALESCE(
            NULLIF(btrim(owner_external_ref->>'entity_id'), ''), ''
          ) <> ''
        )
      );
```

## `party_runtime.party_perception_records`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_perception_records (
  perception_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE RESTRICT,
  perceiver_kind text NOT NULL, perceiver_id text NOT NULL, result_kind text NOT NULL CHECK(result_kind IN ('perceived','misinterpreted','unperceived')),
  perceived_at_whole_minutes numeric NOT NULL,
  perceived_at_subminute_numerator numeric NOT NULL,
  perceived_at_subminute_denominator numeric NOT NULL,
  recognition_policy_ref jsonb NOT NULL, visibility_policy_ref jsonb NOT NULL,
  canonical_digest text NOT NULL, signal_refs jsonb NOT NULL, knowledge_update_refs jsonb NOT NULL,
  change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  CHECK(party_runtime.game_timestamp_parts_valid(perceived_at_whole_minutes,perceived_at_subminute_numerator,perceived_at_subminute_denominator)),
  UNIQUE(party_id,idempotency_record_id)
);
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_perception_records
  DROP CONSTRAINT IF EXISTS party_perception_records_event_id_fkey;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_perception_records
  DROP CONSTRAINT IF EXISTS party_perception_event_party_fk;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_perception_records
  ADD CONSTRAINT party_perception_event_party_fk
  FOREIGN KEY(event_id,party_id) REFERENCES party_runtime.party_temporal_events(event_id,party_id) ON DELETE RESTRICT;
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
ALTER TABLE party_runtime.party_perception_records
  DROP CONSTRAINT IF EXISTS party_perception_records_result_kind_check;
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
ALTER TABLE party_runtime.party_perception_records
  ADD CONSTRAINT party_perception_records_result_kind_check
  CHECK (result_kind IN (
    'not_perceived',
    'perceived_unidentified',
    'perceived_partial',
    'recognized',
    'misinterpreted'
  ));
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_perception_records_party_identity_key
  ON party_runtime.party_perception_records (party_id, perception_id);
```

## `party_runtime.party_perception_replay_evidence`

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
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
```

## `party_runtime.party_perception_witnesses`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_perception_witnesses (
  perception_id text NOT NULL REFERENCES party_runtime.party_perception_records(perception_id) ON DELETE CASCADE,
  witness_kind text NOT NULL, witness_id text NOT NULL, PRIMARY KEY(perception_id,witness_kind,witness_id)
);
```

## `party_runtime.party_player_characters`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_player_characters (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  profile JSONB NOT NULL,
  PRIMARY KEY (party_id, character_id)
);
```

## `party_runtime.party_positions`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_positions (
  party_id TEXT PRIMARY KEY REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  g4_id TEXT NOT NULL,
  g5_node_id TEXT,
  g5_anchor_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((g5_node_id IS NULL) = (g5_anchor_id IS NULL))
);
```

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
ALTER TABLE party_runtime.party_positions
  DROP CONSTRAINT IF EXISTS party_positions_g5_node_fk;
```

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
ALTER TABLE party_runtime.party_positions
  ADD CONSTRAINT party_positions_g5_node_fk FOREIGN KEY (party_id, g5_node_id) REFERENCES party_runtime.party_g5_nodes(party_id, g5_node_id) ON DELETE RESTRICT;
```

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
ALTER TABLE party_runtime.party_positions
  DROP CONSTRAINT IF EXISTS party_positions_g5_anchor_fk;
```

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
ALTER TABLE party_runtime.party_positions
  ADD CONSTRAINT party_positions_g5_anchor_fk FOREIGN KEY (party_id, g5_anchor_id) REFERENCES party_runtime.party_g5_anchors(party_id, anchor_id) ON DELETE RESTRICT;
```

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
ALTER TABLE party_runtime.party_positions
  DROP CONSTRAINT IF EXISTS party_positions_g5_pair_fk;
```

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
ALTER TABLE party_runtime.party_positions
  ADD CONSTRAINT party_positions_g5_pair_fk FOREIGN KEY (party_id, g5_node_id, g5_anchor_id) REFERENCES party_runtime.party_g5_anchors(party_id, g5_node_id, anchor_id) ON DELETE RESTRICT;
```

## `party_runtime.party_propagation_processes`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_propagation_processes (
  process_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  aggregate_id text REFERENCES party_runtime.party_remote_aggregate_states(aggregate_id) ON DELETE RESTRICT,
  process_kind text NOT NULL, source_ref jsonb NOT NULL, causal_basis_ref jsonb NOT NULL, scope_ref jsonb NOT NULL, path_ref jsonb,
  status text NOT NULL CHECK(status IN ('pending','active','completed','terminated')),
  started_at_whole_minutes numeric NOT NULL, started_at_subminute_numerator numeric NOT NULL, started_at_subminute_denominator numeric NOT NULL,
  next_boundary_at_whole_minutes numeric, next_boundary_at_subminute_numerator numeric, next_boundary_at_subminute_denominator numeric,
  visibility_policy_ref jsonb NOT NULL, termination_policy_ref jsonb NOT NULL,
  rule_pins jsonb NOT NULL, idempotency_key text NOT NULL, state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  UNIQUE(party_id,idempotency_key),
  CHECK(party_runtime.game_timestamp_parts_valid(started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator)),
  CHECK(
    (status IN ('pending','active')) = (
      next_boundary_at_whole_minutes IS NOT NULL
      AND next_boundary_at_subminute_numerator IS NOT NULL
      AND next_boundary_at_subminute_denominator IS NOT NULL
    )
  ),
  CHECK(
    (next_boundary_at_whole_minutes IS NULL AND next_boundary_at_subminute_numerator IS NULL AND next_boundary_at_subminute_denominator IS NULL)
    OR party_runtime.game_timestamp_parts_valid(next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator)
  )
);
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_propagation_processes
  DROP CONSTRAINT IF EXISTS party_propagation_processes_aggregate_id_fkey;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_propagation_processes
  DROP CONSTRAINT IF EXISTS party_propagation_aggregate_party_fk;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_propagation_processes
  ADD CONSTRAINT party_propagation_aggregate_party_fk
  FOREIGN KEY(aggregate_id,party_id) REFERENCES party_runtime.party_remote_aggregate_states(aggregate_id,party_id) ON DELETE RESTRICT;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE INDEX IF NOT EXISTS party_propagation_processes_due_idx ON party_runtime.party_propagation_processes(party_id,next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator) WHERE status IN ('pending','active');
```

## `party_runtime.party_recovery_transition_bindings`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_recovery_transition_bindings (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  stranded_travel_state_id text NOT NULL REFERENCES party_runtime.traveller_travel_states(id) ON DELETE RESTRICT,
  source_endpoint_snapshot jsonb NOT NULL, target_endpoint_snapshot jsonb NOT NULL, template_ref jsonb NOT NULL,
  executable_cost_step_snapshot jsonb, status text NOT NULL CHECK(status IN ('active','consumed','superseded')),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1), created_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status='active')=(terminal_change_set_id IS NULL))
);
```

## `party_runtime.party_remote_aggregate_states`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_remote_aggregate_states (
  aggregate_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_ref jsonb NOT NULL, scope_mode text NOT NULL, last_updated_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(last_updated_at_whole_minutes)),
  last_updated_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(last_updated_at_subminute_numerator) AND last_updated_at_subminute_numerator >= 0),
  last_updated_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(last_updated_at_subminute_denominator) AND last_updated_at_subminute_denominator > 0),
  next_boundary_at_whole_minutes numeric, next_boundary_at_subminute_numerator numeric, next_boundary_at_subminute_denominator numeric,
  state_version bigint NOT NULL CHECK(state_version >= 1), canonical_digest text NOT NULL,
  aggregate_process_refs jsonb NOT NULL, pending_incoming_effect_refs jsonb NOT NULL, coarse_rule_versions jsonb NOT NULL,
  CHECK(party_runtime.game_timestamp_parts_valid(last_updated_at_whole_minutes,last_updated_at_subminute_numerator,last_updated_at_subminute_denominator)),
  CHECK(
    (next_boundary_at_whole_minutes IS NULL AND next_boundary_at_subminute_numerator IS NULL AND next_boundary_at_subminute_denominator IS NULL)
    OR party_runtime.game_timestamp_parts_valid(next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator)
  )
);
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_remote_aggregate_states_aggregate_party_uq
  ON party_runtime.party_remote_aggregate_states(aggregate_id,party_id);
```

## `party_runtime.party_resource_node_decrements`

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_resource_node_decrements (
  party_id text NOT NULL, resource_node_id text NOT NULL,
  causal_transition_identity text NOT NULL CHECK (causal_transition_identity <> '' AND causal_transition_identity !~ '[[:cntrl:]]'),
  result_item_id text NOT NULL,
  result_item_mechanics_digest text NOT NULL CHECK (result_item_mechanics_digest ~ '^[0-9a-f]{64}$'),
  result_item_property_placement_digest text NOT NULL CHECK (result_item_property_placement_digest ~ '^[0-9a-f]{64}$'),
  expected_state_version bigint NOT NULL CHECK (expected_state_version >= 1 AND expected_state_version <= 9007199254740991),
  quantity_unit_ref jsonb NOT NULL CHECK (jsonb_typeof(quantity_unit_ref) = 'object'),
  before_numerator numeric NOT NULL CHECK (before_numerator >= 0 AND party_runtime.integral_numeric(before_numerator)),
  before_denominator numeric NOT NULL CHECK (before_denominator > 0 AND party_runtime.integral_numeric(before_denominator) AND gcd(before_numerator,before_denominator)=1),
  decrement_numerator numeric NOT NULL CHECK (decrement_numerator > 0 AND party_runtime.integral_numeric(decrement_numerator)),
  decrement_denominator numeric NOT NULL CHECK (decrement_denominator > 0 AND party_runtime.integral_numeric(decrement_denominator) AND gcd(decrement_numerator,decrement_denominator)=1),
  after_numerator numeric NOT NULL CHECK (after_numerator >= 0 AND party_runtime.integral_numeric(after_numerator)),
  after_denominator numeric NOT NULL CHECK (after_denominator > 0 AND party_runtime.integral_numeric(after_denominator) AND gcd(after_numerator,after_denominator)=1),
  lifecycle_state_after text NOT NULL CHECK (lifecycle_state_after IN ('active','depleted')),
  initialization_identity text NULL CHECK (initialization_identity IS NULL OR (initialization_identity <> '' AND initialization_identity !~ '[[:cntrl:]]')),
  initial_amount_evidence jsonb NULL CHECK (initial_amount_evidence IS NULL OR jsonb_typeof(initial_amount_evidence)='object'),
  p16_change_set_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, resource_node_id, causal_transition_identity), UNIQUE (party_id, causal_transition_identity),
  FOREIGN KEY (party_id,resource_node_id) REFERENCES party_runtime.party_resource_nodes(party_id,resource_node_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id,result_item_id) REFERENCES party_runtime.party_ordinary_materialization_items(party_id,item_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (party_id,p16_change_set_id) REFERENCES party_runtime.party_v3_change_sets(party_id,id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (before_numerator * decrement_denominator * after_denominator = decrement_numerator * before_denominator * after_denominator + after_numerator * before_denominator * decrement_denominator),
  CHECK ((lifecycle_state_after='depleted') = (after_numerator=0))
);
```

## `party_runtime.party_resource_nodes`

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE TABLE party_runtime.party_resource_nodes (
  resource_node_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  source_resource_ref jsonb NOT NULL,
  position_node_id text NOT NULL
    REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  quantity_numerator numeric NOT NULL
    CHECK(quantity_numerator >= 0
      AND party_runtime.integral_numeric(quantity_numerator)),
  quantity_denominator numeric NOT NULL
    CHECK(quantity_denominator > 0
      AND party_runtime.integral_numeric(quantity_denominator)
      AND gcd(quantity_numerator,quantity_denominator) = 1),
  quantity_unit_ref jsonb NOT NULL,
  quality_ref jsonb NOT NULL,
  access_policy_ref jsonb NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  UNIQUE(party_id,resource_node_id),
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS lifecycle_state text;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS retired_by_causal_identity text;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS initial_amount_bounds jsonb;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS initialization_identity text;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS initial_amount_evidence jsonb;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS property_basis_ref text;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes ALTER COLUMN lifecycle_state SET NOT NULL;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes ALTER COLUMN lifecycle_state SET DEFAULT 'active';
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes DROP CONSTRAINT IF EXISTS party_resource_nodes_lifecycle_quantity_check;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes ADD CONSTRAINT party_resource_nodes_lifecycle_quantity_check CHECK ((lifecycle_state='active' AND quantity_numerator>0) OR (lifecycle_state='depleted' AND quantity_numerator=0) OR (lifecycle_state='uninitialized' AND quantity_numerator=0 AND property_basis_ref IS NOT NULL AND initial_amount_bounds IS NOT NULL AND jsonb_typeof(initial_amount_bounds)='object' AND initial_amount_bounds ?& ARRAY['minimum','maximum'] AND initial_amount_bounds - ARRAY['minimum','maximum'] = '{}'::jsonb AND initialization_identity IS NULL AND initial_amount_evidence IS NULL));
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes DROP CONSTRAINT IF EXISTS party_resource_nodes_state_version_safe_check;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes ADD CONSTRAINT party_resource_nodes_state_version_safe_check CHECK (state_version >= 1 AND state_version <= 9007199254740991);
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes DROP CONSTRAINT IF EXISTS party_resource_nodes_party_id_updated_change_set_id_fkey;
```

Источник: [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
ALTER TABLE party_runtime.party_resource_nodes ADD CONSTRAINT party_resource_nodes_party_id_updated_change_set_id_fkey FOREIGN KEY (party_id,updated_change_set_id) REFERENCES party_runtime.party_v3_change_sets(party_id,id) DEFERRABLE INITIALLY DEFERRED;
```

## `party_runtime.party_route_anchor_identities`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_route_anchor_identities (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,anchor_kind text NOT NULL CHECK(anchor_kind IN ('shared_checkpoint','interruption','migration_checkpoint')),source_transit_anchor_id text REFERENCES party_runtime.party_transit_anchors(id) ON DELETE RESTRICT,source_execution_id text,source_step_ordinal integer,source_segment_progress_ppm integer,source_dependency_pins jsonb NOT NULL,factual_context_snapshot jsonb NOT NULL,status text NOT NULL CHECK(status IN ('active','inactive','superseded','destroyed')),resolution_kind text NOT NULL CHECK(resolution_kind IN ('reusable_checkpoint','ephemeral_resolved','persistent_consequence','unresolved')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,CHECK((anchor_kind='shared_checkpoint')=(source_transit_anchor_id IS NOT NULL)),CHECK((status IN ('active','inactive')) = (terminal_change_set_id IS NULL)));
```

## `party_runtime.party_route_anchor_location_bindings`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_route_anchor_location_bindings (id text PRIMARY KEY,route_anchor_id text NOT NULL REFERENCES party_runtime.party_route_anchor_identities(id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,position_node_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,dependency_pins jsonb NOT NULL,status text NOT NULL CHECK(status IN ('active','inactive','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),activated_change_set_id text NOT NULL,deactivated_change_set_id text,CHECK((status='active')=(deactivated_change_set_id IS NULL)));
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS route_anchor_location_active_uq ON party_runtime.party_route_anchor_location_bindings(route_anchor_id) WHERE status='active';
```

## `party_runtime.party_route_plan_execution_events`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_route_plan_execution_events (
  execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE CASCADE,
  event_ordinal integer NOT NULL CHECK(event_ordinal>=0),
  event_kind text NOT NULL CHECK(event_kind IN ('planned','activated','step_progressed','step_paused','step_completed','wait_started','suspended','stranded','resumed','completed','aborted','superseded')),
  from_status text, to_status text NOT NULL, step_ordinal integer NOT NULL CHECK(step_ordinal>=0),
  location_snapshot jsonb NOT NULL, causal_result_ref jsonb, change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0), PRIMARY KEY(execution_id,event_ordinal)
);
```

## `party_runtime.party_route_plan_executions`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_route_plan_executions (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  route_plan_id text NOT NULL UNIQUE REFERENCES party_runtime.party_route_plans(id) ON DELETE RESTRICT,
  journey_owner_ref jsonb NOT NULL, journey_scope text NOT NULL CHECK(journey_scope IN ('world_travel','carrier_local')),
  status text NOT NULL CHECK(status IN ('planned','active','waiting_at_anchor','suspended_at_scene','stranded_in_transit','completed','aborted','superseded')),
  current_step_ordinal integer CHECK(current_step_ordinal >= 0), current_endpoint_ref jsonb,
  active_travel_state_id text, active_activity_execution_id text, suspension_endpoint_ref jsonb,
  final_location_snapshot jsonb, abort_reason_code text,
  supersedes_execution_id text UNIQUE, superseded_by_execution_id text UNIQUE,
  started_at_turn bigint CHECK(started_at_turn >= 0), terminal_at_turn bigint CHECK(terminal_at_turn >= 0),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1), updated_change_set_id text NOT NULL,
  CHECK ((status='planned' AND current_step_ordinal=0 AND current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NULL AND terminal_at_turn IS NULL)
    OR (status='active' AND current_step_ordinal IS NOT NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL AND ((current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL) OR (current_endpoint_ref IS NULL AND active_travel_state_id IS NOT NULL)) )
    OR (status='waiting_at_anchor' AND current_step_ordinal IS NOT NULL AND current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL)
    OR (status='suspended_at_scene' AND current_step_ordinal IS NOT NULL AND current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref=current_endpoint_ref AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL)
    OR (status='stranded_in_transit' AND current_step_ordinal IS NOT NULL AND current_endpoint_ref IS NULL AND active_travel_state_id IS NOT NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL)
    OR (status IN ('completed','aborted','superseded') AND current_step_ordinal IS NULL AND current_endpoint_ref IS NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NOT NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NOT NULL)),
  CHECK ((status='aborted') = (abort_reason_code IS NOT NULL)),
  CHECK ((status='superseded') = (superseded_by_execution_id IS NOT NULL)),
  CHECK(terminal_at_turn IS NULL OR started_at_turn IS NULL OR terminal_at_turn >= started_at_turn)
);
```

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
ALTER TABLE party_runtime.party_route_plan_executions DROP CONSTRAINT IF EXISTS party_route_plan_executions_supersedes_fk;
```

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
ALTER TABLE party_runtime.party_route_plan_executions ADD CONSTRAINT party_route_plan_executions_supersedes_fk FOREIGN KEY(supersedes_execution_id) REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
```

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
ALTER TABLE party_runtime.party_route_plan_executions DROP CONSTRAINT IF EXISTS party_route_plan_executions_superseded_by_fk;
```

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
ALTER TABLE party_runtime.party_route_plan_executions ADD CONSTRAINT party_route_plan_executions_superseded_by_fk FOREIGN KEY(superseded_by_execution_id) REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
```

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE INDEX IF NOT EXISTS party_route_execution_lock_idx ON party_runtime.party_route_plan_executions(party_id, status, id);
```

## `party_runtime.party_route_plan_steps`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_route_plan_steps (
  route_plan_id text NOT NULL REFERENCES party_runtime.party_route_plans(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK(ordinal >= 0), step_kind text NOT NULL CHECK(step_kind IN ('immediate_action','timed_activity','timed_traversal')),
  departure_endpoint_snapshot jsonb NOT NULL, arrival_endpoint_snapshot jsonb NOT NULL,
  static_contract_snapshot jsonb NOT NULL, PRIMARY KEY(route_plan_id, ordinal),
  CHECK(static_contract_snapshot->>'snapshot_kind'=step_kind)
);
```

## `party_runtime.party_route_plans`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_route_plans (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  journey_owner_ref jsonb NOT NULL, journey_scope text NOT NULL CHECK(journey_scope IN ('world_travel','carrier_local')),
  request_kind text NOT NULL CHECK(request_kind IN ('ordinary','rescue','repair','migration')),
  recovery_binding_id text, administrative_authorization_pins jsonb,
  planning_request_id text NOT NULL, path_query_digest text NOT NULL, option_id text NOT NULL,
  knowledge_scope text NOT NULL CHECK(knowledge_scope IN ('factual','character_known','admin')), knowledge_subject_ref jsonb,
  source_endpoint_snapshot jsonb NOT NULL, target_request jsonb, resolved_factual_target_ref jsonb,
  target_resolution_dependency_pins jsonb, intended_direction_id text,
  world_revision_id text NOT NULL, catalog_digest text NOT NULL, planning_algorithm_version text NOT NULL,
  planning_state_version bigint NOT NULL CHECK(planning_state_version >= 0), planning_context_dependency_pins jsonb NOT NULL,
  preparation_snapshot_id text REFERENCES party_runtime.preparation_snapshots(id) ON DELETE RESTRICT, preparation_snapshot_digest text,
  canonical_serialization_digest text NOT NULL, status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','superseded','retired')),
  superseded_by_plan_id text REFERENCES party_runtime.party_route_plans(id) ON DELETE RESTRICT, retired_reason_code text,
  lifecycle_state_version bigint NOT NULL DEFAULT 1 CHECK(lifecycle_state_version >= 1),
  created_change_set_id text NOT NULL, lifecycle_change_set_id text NOT NULL, created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0),
  CHECK ((target_request IS NULL) <> (intended_direction_id IS NULL)),
  CHECK ((target_request IS NULL) = (resolved_factual_target_ref IS NULL)),
  CHECK ((target_request IS NULL) = (target_resolution_dependency_pins IS NULL)),
  CHECK ((preparation_snapshot_id IS NULL) = (preparation_snapshot_digest IS NULL)),
  CHECK ((request_kind='ordinary') = (recovery_binding_id IS NULL AND administrative_authorization_pins IS NULL)),
  CHECK ((request_kind='rescue') = (recovery_binding_id IS NOT NULL AND administrative_authorization_pins IS NULL)),
  CHECK ((request_kind IN ('repair','migration')) = (recovery_binding_id IS NULL AND administrative_authorization_pins IS NOT NULL)),
  CHECK ((knowledge_scope='character_known') = (knowledge_subject_ref IS NOT NULL)),
  CHECK ((status='ready' AND superseded_by_plan_id IS NULL AND retired_reason_code IS NULL)
      OR (status='superseded' AND superseded_by_plan_id IS NOT NULL AND retired_reason_code IS NULL)
      OR (status='retired' AND superseded_by_plan_id IS NULL AND retired_reason_code IS NOT NULL))
);
```

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
ALTER TABLE party_runtime.party_route_plans DROP CONSTRAINT IF EXISTS party_route_plans_recovery_binding_fk;
```

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
ALTER TABLE party_runtime.party_route_plans ADD CONSTRAINT party_route_plans_recovery_binding_fk FOREIGN KEY(recovery_binding_id) REFERENCES party_runtime.party_recovery_transition_bindings(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
```

## `party_runtime.party_scene_baselines`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_scene_baselines (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  host_kind text NOT NULL CHECK (host_kind IN ('g5_site','transport','route_anchor_identity')), host_id text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('canonical_template','generated_template','transport_template','route_checkpoint','interruption_scene','migration','repair')),
  scene_template_ref jsonb NOT NULL, materialization_trace_id text NOT NULL, materializer_version text NOT NULL, catalog_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','superseded','destroyed')), state_version bigint NOT NULL CHECK (state_version >= 0),
  created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK (party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id))
);
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_scene_baseline_active_host_uq ON party_runtime.party_scene_baselines(party_id,host_kind,host_id) WHERE status='active';
```

## `party_runtime.party_server_sessions`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_server_sessions
  ADD COLUMN state_version bigint NOT NULL DEFAULT 1
    CHECK(state_version >= 1),
  ADD COLUMN updated_change_set_id text;
```

## `party_runtime.party_site_connection_endpoint_bindings`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_site_connection_endpoint_bindings (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,site_connection_id text NOT NULL REFERENCES party_runtime.g5_site_connections(id) ON DELETE CASCADE,endpoint_role text NOT NULL CHECK(endpoint_role IN ('from','to')),g5_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,source_slot_key text NOT NULL,status text NOT NULL CHECK(status IN ('active','inactive','superseded')),state_version bigint NOT NULL CHECK(state_version>=0),activated_change_set_id text NOT NULL,deactivated_change_set_id text,CHECK((status='active')=(deactivated_change_set_id IS NULL)));
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS site_connection_endpoint_active_uq ON party_runtime.party_site_connection_endpoint_bindings(party_id,site_connection_id,endpoint_role) WHERE status='active';
```

## `party_runtime.party_spatial_semantic_envelopes`

Источник: [`029_party_runtime_spatial_semantic_remainder.sql`](../../schemas/party-db/029_party_runtime_spatial_semantic_remainder.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_spatial_semantic_envelopes (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE RESTRICT,
  envelope_ref text NOT NULL CHECK (envelope_ref<>''),
  envelope jsonb NOT NULL,
  capacity_total bigint NOT NULL CHECK (capacity_total>=1),
  consumed_count bigint NOT NULL DEFAULT 0 CHECK (consumed_count BETWEEN 0 AND capacity_total),
  state_version bigint NOT NULL CHECK (state_version>=1),
  status text NOT NULL CHECK (status='committed'),
  created_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY (party_id,envelope_ref),
  CHECK (envelope->>'envelope_ref'=envelope_ref),
  CHECK (party_runtime.runtime_item_jsonb_exact_keys(envelope, ARRAY[
    'envelope_ref','kind','scope_kind','structural_variant','available_mechanics','required_semantic_requirements',
    'baseline_ref','g5_ref','g6_ref',
    'position_ref','property_ref','function_ref','environment_ref','semantic_context','profile_ref',
    'profile_version','policy_ref','policy_version','baseline_state_version','g5_state_version',
    'g6_state_version','position_state_version','topology','capacity_total','consumed_count','state_version'
  ])),
  CHECK ((envelope->>'capacity_total')::bigint=capacity_total
    AND (envelope->>'consumed_count')::bigint=consumed_count
    AND (envelope->>'state_version')::bigint=state_version)
);
```

## `party_runtime.party_spatial_semantic_resolutions`

Источник: [`029_party_runtime_spatial_semantic_remainder.sql`](../../schemas/party-db/029_party_runtime_spatial_semantic_remainder.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_spatial_semantic_resolutions (
  party_id text NOT NULL,
  request_id text NOT NULL CHECK (request_id<>''),
  local_ref text NOT NULL CHECK (local_ref<>''),
  envelope_ref text NOT NULL,
  position_ref text NOT NULL CHECK (position_ref<>''),
  root_turn_id text NOT NULL CHECK (root_turn_id<>''),
  step_index integer NOT NULL CHECK (step_index BETWEEN 1 AND 8),
  semantics jsonb NOT NULL,
  formal_spatial_refs jsonb NOT NULL,
  from_party_state_version bigint NOT NULL CHECK (from_party_state_version>=0),
  to_party_state_version bigint NOT NULL CHECK (to_party_state_version=from_party_state_version+1),
  p16_change_set_id text NOT NULL REFERENCES party_runtime.party_v3_change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id,request_id),
  UNIQUE (party_id,local_ref),
  FOREIGN KEY (party_id,envelope_ref) REFERENCES party_runtime.party_spatial_semantic_envelopes(party_id,envelope_ref) ON DELETE RESTRICT,
  CHECK (semantics->>'name' IS NOT NULL AND semantics->>'description' IS NOT NULL
    AND formal_spatial_refs->>'schema'='rus.s1_formal_spatial_refs.v1'
    AND formal_spatial_refs->>'status'='materialized')
);
```

## `party_runtime.party_state_snapshots`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_state_snapshots (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  state_version BIGINT NOT NULL,
  state_payload JSONB NOT NULL,
  state_digest TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (party_id, state_version)
);
```

## `party_runtime.party_synchronized_time_slice_results`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_synchronized_time_slice_results (
  id text PRIMARY KEY, slice_id text NOT NULL REFERENCES party_runtime.party_synchronized_time_slices(id) ON DELETE RESTRICT,
  participant_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  participant_actor_id text, result_kind text NOT NULL CHECK(result_kind IN ('root_traversal','carrier_local_activity','carrier_local_traversal','blocked','paused','failed')),
  elapsed_numerator numeric NOT NULL CHECK(elapsed_numerator >= 0 AND party_runtime.integral_numeric(elapsed_numerator)), elapsed_denominator numeric NOT NULL CHECK(elapsed_denominator > 0 AND party_runtime.integral_numeric(elapsed_denominator)),
  result_ref jsonb NOT NULL, CHECK(gcd(elapsed_numerator, elapsed_denominator) = 1), UNIQUE(slice_id, participant_execution_id)
);
```

## `party_runtime.party_synchronized_time_slices`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_synchronized_time_slices (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  root_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  root_travel_state_id text NOT NULL REFERENCES party_runtime.traveller_travel_states(id) ON DELETE RESTRICT,
  clock_owner_kind text NOT NULL CHECK(clock_owner_kind IN ('cohort','transport')), clock_owner_id text NOT NULL,
  elapsed_numerator numeric NOT NULL CHECK(elapsed_numerator > 0 AND party_runtime.integral_numeric(elapsed_numerator)), elapsed_denominator numeric NOT NULL CHECK(elapsed_denominator > 0 AND party_runtime.integral_numeric(elapsed_denominator)),
  clock_before_whole_minutes numeric NOT NULL CHECK(clock_before_whole_minutes >= 0 AND party_runtime.integral_numeric(clock_before_whole_minutes)), clock_before_subminute_numerator numeric NOT NULL CHECK(clock_before_subminute_numerator >= 0 AND party_runtime.integral_numeric(clock_before_subminute_numerator)), clock_before_subminute_denominator numeric NOT NULL CHECK(clock_before_subminute_denominator > 0 AND party_runtime.integral_numeric(clock_before_subminute_denominator)),
  clock_after_whole_minutes numeric NOT NULL CHECK(clock_after_whole_minutes >= 0 AND party_runtime.integral_numeric(clock_after_whole_minutes)), clock_after_subminute_numerator numeric NOT NULL CHECK(clock_after_subminute_numerator >= 0 AND party_runtime.integral_numeric(clock_after_subminute_numerator)), clock_after_subminute_denominator numeric NOT NULL CHECK(clock_after_subminute_denominator > 0 AND party_runtime.integral_numeric(clock_after_subminute_denominator)),
  crossed_whole_minute_boundaries numeric NOT NULL CHECK(crossed_whole_minute_boundaries >= 0 AND party_runtime.integral_numeric(crossed_whole_minute_boundaries)), change_set_id text NOT NULL REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  idempotency_record_id text NOT NULL REFERENCES party_runtime.party_command_idempotency(id) ON DELETE RESTRICT,
  CHECK(gcd(elapsed_numerator, elapsed_denominator) = 1), CHECK(clock_before_subminute_numerator < clock_before_subminute_denominator), CHECK(gcd(clock_before_subminute_numerator, clock_before_subminute_denominator) = 1), CHECK(clock_after_subminute_numerator < clock_after_subminute_denominator), CHECK(gcd(clock_after_subminute_numerator, clock_after_subminute_denominator) = 1),
  UNIQUE(root_execution_id, change_set_id), UNIQUE(change_set_id)
);
```

## `party_runtime.party_temporal_event_dependencies`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_temporal_event_dependencies (
  event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE CASCADE,
  depends_on_event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE RESTRICT,
  PRIMARY KEY(event_id,depends_on_event_id), CHECK(event_id <> depends_on_event_id)
);
```

## `party_runtime.party_temporal_event_subjects`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_temporal_event_subjects (
  event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE CASCADE,
  subject_kind text NOT NULL, subject_id text NOT NULL, subject_role text NOT NULL,
  PRIMARY KEY(event_id,subject_kind,subject_id,subject_role)
);
```

## `party_runtime.party_temporal_events`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_temporal_events (
  event_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  event_kind text NOT NULL, status text NOT NULL CHECK(status IN ('pending','resolved','cancelled','blocked')),
  scheduled_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(scheduled_at_whole_minutes)),
  scheduled_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(scheduled_at_subminute_numerator) AND scheduled_at_subminute_numerator >= 0),
  scheduled_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(scheduled_at_subminute_denominator) AND scheduled_at_subminute_denominator > 0),
  rule_ref jsonb NOT NULL, policy_ref jsonb NOT NULL, preconditions_digest text NOT NULL,
  idempotency_key text NOT NULL, change_set_id text NOT NULL, terminal_change_set_id text,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  CHECK(party_runtime.game_timestamp_parts_valid(scheduled_at_whole_minutes,scheduled_at_subminute_numerator,scheduled_at_subminute_denominator)),
  UNIQUE(party_id,idempotency_key)
);
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_temporal_events_event_party_uq
  ON party_runtime.party_temporal_events(event_id,party_id);
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE INDEX IF NOT EXISTS party_temporal_events_due_idx ON party_runtime.party_temporal_events(party_id,scheduled_at_whole_minutes,scheduled_at_subminute_numerator,scheduled_at_subminute_denominator) WHERE status='pending';
```

## `party_runtime.party_timed_activity_attempts`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_timed_activity_attempts (
  activity_execution_id text NOT NULL REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT, attempt_ordinal integer NOT NULL CHECK(attempt_ordinal>=0),
  remaining_before_numerator numeric NOT NULL CHECK(remaining_before_numerator>0 AND party_runtime.integral_numeric(remaining_before_numerator)), remaining_before_denominator numeric NOT NULL CHECK(remaining_before_denominator>0 AND party_runtime.integral_numeric(remaining_before_denominator)), planned_time_numerator numeric NOT NULL CHECK(planned_time_numerator>0 AND party_runtime.integral_numeric(planned_time_numerator)), planned_time_denominator numeric NOT NULL CHECK(planned_time_denominator>0 AND party_runtime.integral_numeric(planned_time_denominator)), actual_time_numerator numeric NOT NULL CHECK(actual_time_numerator>=0 AND party_runtime.integral_numeric(actual_time_numerator)), actual_time_denominator numeric NOT NULL CHECK(actual_time_denominator>0 AND party_runtime.integral_numeric(actual_time_denominator)), remaining_after_numerator numeric NOT NULL CHECK(remaining_after_numerator>=0 AND party_runtime.integral_numeric(remaining_after_numerator)), remaining_after_denominator numeric NOT NULL CHECK(remaining_after_denominator>0 AND party_runtime.integral_numeric(remaining_after_denominator)), cumulative_time_before_numerator numeric NOT NULL CHECK(cumulative_time_before_numerator>=0 AND party_runtime.integral_numeric(cumulative_time_before_numerator)), cumulative_time_before_denominator numeric NOT NULL CHECK(cumulative_time_before_denominator>0 AND party_runtime.integral_numeric(cumulative_time_before_denominator)), cumulative_time_after_numerator numeric NOT NULL CHECK(cumulative_time_after_numerator>=0 AND party_runtime.integral_numeric(cumulative_time_after_numerator)), cumulative_time_after_denominator numeric NOT NULL CHECK(cumulative_time_after_denominator>0 AND party_runtime.integral_numeric(cumulative_time_after_denominator)), crossed_whole_minute_boundaries numeric NOT NULL CHECK(crossed_whole_minute_boundaries>=0 AND party_runtime.integral_numeric(crossed_whole_minute_boundaries)), clock_commit_mode text NOT NULL CHECK(clock_commit_mode IN ('direct_party_clock','shared_root_transport_clock')), synchronized_time_slice_result_id text, execution_context_snapshot jsonb NOT NULL, result_kind text NOT NULL CHECK(result_kind IN ('progressed','completed','paused','blocked','failed')), result_code text NOT NULL, dynamic_dependency_pins jsonb NOT NULL, result_change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0), PRIMARY KEY(activity_execution_id,attempt_ordinal), CHECK(gcd(remaining_before_numerator,remaining_before_denominator)=1), CHECK(gcd(planned_time_numerator,planned_time_denominator)=1), CHECK(gcd(actual_time_numerator,actual_time_denominator)=1), CHECK(gcd(remaining_after_numerator,remaining_after_denominator)=1), CHECK(gcd(cumulative_time_before_numerator,cumulative_time_before_denominator)=1), CHECK(gcd(cumulative_time_after_numerator,cumulative_time_after_denominator)=1), CHECK((clock_commit_mode='direct_party_clock')=(synchronized_time_slice_result_id IS NULL))
);
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_timed_activity_attempts
  ADD COLUMN IF NOT EXISTS started_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS ended_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS ended_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS ended_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS failure_class text,
  ADD COLUMN IF NOT EXISTS progress_before jsonb,
  ADD COLUMN IF NOT EXISTS progress_after jsonb,
  ADD COLUMN IF NOT EXISTS resource_reservations jsonb,
  ADD COLUMN IF NOT EXISTS resource_consumptions jsonb,
  ADD COLUMN IF NOT EXISTS body_effect_refs jsonb,
  ADD COLUMN IF NOT EXISTS participant_attendance jsonb,
  ADD COLUMN IF NOT EXISTS rule_and_policy_pins jsonb,
  ADD COLUMN IF NOT EXISTS trace jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_timed_activity_attempts
  DROP CONSTRAINT IF EXISTS party_activity_attempt_timestamp_valid;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_timed_activity_attempts
  ADD CONSTRAINT party_activity_attempt_timestamp_valid CHECK (
    party_runtime.game_timestamp_parts_valid(started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator)
    AND party_runtime.game_timestamp_parts_valid(ended_at_whole_minutes,ended_at_subminute_numerator,ended_at_subminute_denominator)
    AND progress_before IS NOT NULL
    AND progress_after IS NOT NULL
    AND resource_reservations IS NOT NULL
    AND resource_consumptions IS NOT NULL
    AND body_effect_refs IS NOT NULL
    AND participant_attendance IS NOT NULL
    AND rule_and_policy_pins IS NOT NULL
  );
```

## `party_runtime.party_timed_activity_executions`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_timed_activity_executions (
  id text PRIMARY KEY, route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), series_ordinal integer NOT NULL CHECK(series_ordinal>=0), predecessor_activity_execution_id text UNIQUE,
  activity_snapshot jsonb NOT NULL, original_total_minutes numeric NOT NULL CHECK(original_total_minutes>0 AND party_runtime.integral_numeric(original_total_minutes)),
  cumulative_elapsed_numerator numeric NOT NULL CHECK(cumulative_elapsed_numerator>=0 AND party_runtime.integral_numeric(cumulative_elapsed_numerator)), cumulative_elapsed_denominator numeric NOT NULL CHECK(cumulative_elapsed_denominator>0 AND party_runtime.integral_numeric(cumulative_elapsed_denominator)),
  remaining_time_numerator numeric NOT NULL CHECK(remaining_time_numerator>=0 AND party_runtime.integral_numeric(remaining_time_numerator)), remaining_time_denominator numeric NOT NULL CHECK(remaining_time_denominator>0 AND party_runtime.integral_numeric(remaining_time_denominator)),
  next_attempt_ordinal integer NOT NULL DEFAULT 0 CHECK(next_attempt_ordinal>=0), status text NOT NULL CHECK(status IN ('active','paused','completed','failed','aborted')),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1), updated_change_set_id text NOT NULL, terminal_change_set_id text,
  UNIQUE(route_plan_execution_id,plan_step_ordinal,series_ordinal),
  CHECK((status IN ('active','paused'))=(terminal_change_set_id IS NULL)),
  CHECK(gcd(cumulative_elapsed_numerator,cumulative_elapsed_denominator)=1), CHECK(gcd(remaining_time_numerator,remaining_time_denominator)=1), CHECK((status='completed')=(remaining_time_numerator=0))
);
```

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
ALTER TABLE party_runtime.party_timed_activity_executions DROP CONSTRAINT IF EXISTS party_activity_predecessor_fk;
```

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
ALTER TABLE party_runtime.party_timed_activity_executions ADD CONSTRAINT party_activity_predecessor_fk FOREIGN KEY(predecessor_activity_execution_id) REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
```

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_activity_one_nonterminal_uq ON party_runtime.party_timed_activity_executions(route_plan_execution_id,plan_step_ordinal) WHERE status IN ('active','paused');
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_timed_activity_executions
  ADD COLUMN IF NOT EXISTS started_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS last_processed_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS last_processed_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS last_processed_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS next_boundary_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS next_boundary_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS next_boundary_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS progress jsonb,
  ADD COLUMN IF NOT EXISTS preconditions_digest text,
  ADD COLUMN IF NOT EXISTS terminal_reason_code text;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_timed_activity_executions
  DROP CONSTRAINT IF EXISTS party_activity_active_boundary_valid;
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
ALTER TABLE party_runtime.party_timed_activity_executions
  ADD CONSTRAINT party_activity_active_boundary_valid CHECK (
    (status = 'active') = (next_boundary_at_whole_minutes IS NOT NULL AND next_boundary_at_subminute_numerator IS NOT NULL AND next_boundary_at_subminute_denominator IS NOT NULL)
    AND party_runtime.game_timestamp_parts_valid(started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator)
    AND party_runtime.game_timestamp_parts_valid(last_processed_at_whole_minutes,last_processed_at_subminute_numerator,last_processed_at_subminute_denominator)
    AND (
      (next_boundary_at_whole_minutes IS NULL AND next_boundary_at_subminute_numerator IS NULL AND next_boundary_at_subminute_denominator IS NULL)
      OR party_runtime.game_timestamp_parts_valid(next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator)
    )
  );
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE INDEX IF NOT EXISTS party_activity_executions_due_idx ON party_runtime.party_timed_activity_executions(route_plan_execution_id,next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator) WHERE status='active';
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_timed_activity_executions
  ALTER COLUMN route_plan_execution_id DROP NOT NULL,
  ALTER COLUMN plan_step_ordinal DROP NOT NULL,
  ADD COLUMN execution_scope text,
  ADD COLUMN activity_series_id text,
  ADD COLUMN activity_owner_ref jsonb,
  ADD COLUMN origin_location_snapshot jsonb,
  ADD COLUMN execution_context_snapshot jsonb,
  ADD COLUMN originating_command_ref jsonb,
  ADD COLUMN originating_command_digest text,
  ADD COLUMN idempotency_record_id text
    REFERENCES party_runtime.party_command_idempotency(id) ON DELETE RESTRICT;
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_timed_activity_executions
  ALTER COLUMN execution_scope SET NOT NULL,
  ALTER COLUMN activity_series_id SET NOT NULL,
  ALTER COLUMN activity_owner_ref SET NOT NULL;
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_timed_activity_executions
  ADD CONSTRAINT party_activity_execution_scope_ck CHECK (
    execution_scope IN ('route_step','standalone')
    AND jsonb_typeof(activity_owner_ref) = 'object'
    AND NULLIF(activity_owner_ref->>'entity_kind','') IS NOT NULL
    AND NULLIF(activity_owner_ref->>'entity_id','') IS NOT NULL
    AND (
      (
        execution_scope = 'route_step'
        AND route_plan_execution_id IS NOT NULL
        AND plan_step_ordinal IS NOT NULL
        AND origin_location_snapshot IS NULL
        AND execution_context_snapshot IS NULL
        AND originating_command_ref IS NULL
        AND originating_command_digest IS NULL
        AND idempotency_record_id IS NULL
      )
      OR
      (
        execution_scope = 'standalone'
        AND route_plan_execution_id IS NULL
        AND plan_step_ordinal IS NULL
        AND jsonb_typeof(origin_location_snapshot) = 'object'
        AND jsonb_typeof(execution_context_snapshot) = 'object'
        AND jsonb_typeof(originating_command_ref) = 'object'
        AND NULLIF(originating_command_digest,'') IS NOT NULL
        AND idempotency_record_id IS NOT NULL
      )
    )
  );
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE UNIQUE INDEX party_activity_series_ordinal_uq
  ON party_runtime.party_timed_activity_executions(
    activity_series_id,
    series_ordinal
  );
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE UNIQUE INDEX party_activity_series_one_nonterminal_uq
  ON party_runtime.party_timed_activity_executions(activity_series_id)
  WHERE status IN ('active','paused');
```

## `party_runtime.party_transit_anchors`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_transit_anchors (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,source_route_point_ref jsonb NOT NULL,anchor_role text NOT NULL CHECK(anchor_role IN ('ordinary','boundary','checkpoint')),context_snapshot jsonb NOT NULL,active_side text NOT NULL,allowed_departure_dependency_pins jsonb NOT NULL,status text NOT NULL CHECK(status IN ('active','superseded','retired')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS transit_anchor_active_route_point_uq ON party_runtime.party_transit_anchors(party_id,(source_route_point_ref->>'entity_id'),(source_route_point_ref->>'authoring_version')) WHERE status='active';
```

## `party_runtime.party_transport_attached_g6`

Источник: [`005_party_runtime_v3_domain.sql`](../../schemas/party-db/005_party_runtime_v3_domain.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_transport_attached_g6 (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  transport_id text NOT NULL, g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,
  approved_template_ref jsonb NOT NULL, status text NOT NULL CHECK(status IN ('active','inactive')),
  state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL
);
```

Источник: [`005_party_runtime_v3_domain.sql`](../../schemas/party-db/005_party_runtime_v3_domain.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_transport_attached_g6_active_uq ON party_runtime.party_transport_attached_g6(party_id,transport_id,g6_instance_id) WHERE status='active';
```

## `party_runtime.party_transports`

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
CREATE TABLE party_runtime.party_transports (
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  transport_id text NOT NULL,
  transport_category_ref jsonb NOT NULL,
  transport_template_ref jsonb NOT NULL,
  applicability_snapshot jsonb NOT NULL,
  capacity_policy_ref jsonb NOT NULL,
  movement_capability_refs jsonb NOT NULL,
  control_requirement_ref jsonb NOT NULL,
  route_applicability_ref jsonb NOT NULL,
  transport_contract_digest text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  PRIMARY KEY(party_id,transport_id),
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);
```

## `party_runtime.party_traversal_interval_results`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_traversal_interval_results (
  id text PRIMARY KEY, route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT, plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), interval_ordinal integer NOT NULL CHECK(interval_ordinal>=0), progress_before_ppm integer NOT NULL CHECK(progress_before_ppm BETWEEN 0 AND 999999), planned_progress_after_ppm integer NOT NULL CHECK(planned_progress_after_ppm BETWEEN 1 AND 1000000), actual_progress_after_ppm integer NOT NULL CHECK(actual_progress_after_ppm BETWEEN 0 AND 1000000), planned_time_numerator numeric NOT NULL CHECK(planned_time_numerator>0 AND party_runtime.integral_numeric(planned_time_numerator)), planned_time_denominator numeric NOT NULL CHECK(planned_time_denominator>0 AND party_runtime.integral_numeric(planned_time_denominator)), actual_time_numerator numeric NOT NULL CHECK(actual_time_numerator>=0 AND party_runtime.integral_numeric(actual_time_numerator)), actual_time_denominator numeric NOT NULL CHECK(actual_time_denominator>0 AND party_runtime.integral_numeric(actual_time_denominator)), cumulative_time_before_numerator numeric NOT NULL CHECK(cumulative_time_before_numerator>=0 AND party_runtime.integral_numeric(cumulative_time_before_numerator)), cumulative_time_before_denominator numeric NOT NULL CHECK(cumulative_time_before_denominator>0 AND party_runtime.integral_numeric(cumulative_time_before_denominator)), cumulative_time_after_numerator numeric NOT NULL CHECK(cumulative_time_after_numerator>=0 AND party_runtime.integral_numeric(cumulative_time_after_numerator)), cumulative_time_after_denominator numeric NOT NULL CHECK(cumulative_time_after_denominator>0 AND party_runtime.integral_numeric(cumulative_time_after_denominator)), crossed_whole_minute_boundaries numeric NOT NULL CHECK(crossed_whole_minute_boundaries>=0 AND party_runtime.integral_numeric(crossed_whole_minute_boundaries)), clock_commit_mode text NOT NULL CHECK(clock_commit_mode IN ('direct_party_clock','shared_root_transport_clock')), synchronized_time_slice_result_id text, dynamic_snapshot jsonb NOT NULL, result_kind text NOT NULL CHECK(result_kind IN ('progressed','segment_completed','paused_in_transit','interrupted_at_anchor','stranded','blocked_before_progress')), result_code text NOT NULL, navigation_resolution jsonb, hazard_resolution jsonb, outcome_composition_policy_version text NOT NULL, outcome_composition_trace_digest text NOT NULL, interruption_anchor_id text, result_change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0), UNIQUE(route_plan_execution_id,plan_step_ordinal,interval_ordinal), CHECK(gcd(planned_time_numerator,planned_time_denominator)=1), CHECK(gcd(actual_time_numerator,actual_time_denominator)=1), CHECK(gcd(cumulative_time_before_numerator,cumulative_time_before_denominator)=1), CHECK(gcd(cumulative_time_after_numerator,cumulative_time_after_denominator)=1), CHECK(planned_progress_after_ppm>progress_before_ppm), CHECK(actual_progress_after_ppm BETWEEN progress_before_ppm AND planned_progress_after_ppm), CHECK((clock_commit_mode='direct_party_clock')=(synchronized_time_slice_result_id IS NULL)), CHECK((result_kind='segment_completed')=(actual_progress_after_ppm=1000000)), CHECK((result_kind='interrupted_at_anchor')=(interruption_anchor_id IS NOT NULL))
);
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_traversal_interval_results
  DROP CONSTRAINT
    party_traversal_interval_results_planned_time_numerator_check;
```

Источник: [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
ALTER TABLE party_runtime.party_traversal_interval_results
  ADD CONSTRAINT
    party_traversal_interval_results_planned_time_numerator_check
  CHECK(
    planned_time_numerator >= 0
    AND party_runtime.integral_numeric(planned_time_numerator)
  );
```

## `party_runtime.party_v3_change_sets`

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_v3_change_sets (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  operation_kind text NOT NULL, expected_state_version_set_digest text NOT NULL,
  expected_state_version_set jsonb NOT NULL CHECK(jsonb_typeof(expected_state_version_set) = 'array'),
  committed_state_version_set_digest text NOT NULL, write_plan_digest text NOT NULL,
  parent_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0), committed_at_turn bigint NOT NULL CHECK(committed_at_turn >= 0),
  UNIQUE(party_id, operation_kind, write_plan_digest)
);
```

Источник: [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
CREATE INDEX IF NOT EXISTS party_v3_change_sets_party_lock_idx ON party_runtime.party_v3_change_sets(party_id, created_at_turn, id);
```

Источник: [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_v3_change_sets_party_identity_key
  ON party_runtime.party_v3_change_sets (party_id, id);
```

## `party_runtime.party_visible_packages`

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_visible_packages (
  package_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  turn_id text NOT NULL, committed_state_version bigint NOT NULL CHECK(committed_state_version >= 1), change_set_id text NOT NULL,
  package_digest text NOT NULL, visible_payload jsonb NOT NULL,
  presentation_status text NOT NULL CHECK(presentation_status IN ('pending')),
  projection_policy_ref jsonb NOT NULL, dependency_pins jsonb NOT NULL, idempotency_record_id text NOT NULL,
  UNIQUE(party_id,idempotency_record_id), UNIQUE(party_id,change_set_id)
);
```

Источник: [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS party_visible_packages_package_party_uq
  ON party_runtime.party_visible_packages(package_id,party_id);
```

## `party_runtime.party_visible_read_models`

Источник: [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_visible_read_models (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  state_version BIGINT NOT NULL,
  viewer_character_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_digest TEXT NOT NULL,
  PRIMARY KEY (party_id, state_version, viewer_character_id)
);
```

## `party_runtime.party_world_route_endpoint_position_bindings`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_world_route_endpoint_position_bindings (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,source_endpoint_binding_ref jsonb NOT NULL,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,g5_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,status text NOT NULL CHECK(status IN ('active','inactive','superseded')),state_version bigint NOT NULL CHECK(state_version>=0),activated_change_set_id text NOT NULL,deactivated_change_set_id text,CHECK((status='active')=(deactivated_change_set_id IS NULL)));
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS world_endpoint_position_active_uq ON party_runtime.party_world_route_endpoint_position_bindings(party_id,(source_endpoint_binding_ref->>'entity_id'),(source_endpoint_binding_ref->>'authoring_version')) WHERE status='active';
```

## `party_runtime.portal_entities`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.portal_entities (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,portal_template_ref jsonb NOT NULL,state text NOT NULL CHECK(state IN ('open','closed','locked','destroyed')),controller_entity_ref jsonb,state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL);
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS portal_entity_template_uq ON party_runtime.portal_entities(scene_baseline_id,(portal_template_ref->>'entity_id'));
```

## `party_runtime.preparation_claims`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.preparation_claims (
  id text PRIMARY KEY, preparation_snapshot_id text NOT NULL REFERENCES party_runtime.preparation_snapshots(id) ON DELETE RESTRICT,
  preparation_member_ordinal integer NOT NULL CHECK(preparation_member_ordinal>=0), route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  claim_status text NOT NULL CHECK(claim_status IN ('reserved','consumed','released','failed')), state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1),
  reserved_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK ((claim_status='reserved')=(terminal_change_set_id IS NULL)),
  UNIQUE(route_plan_execution_id, preparation_member_ordinal),
  FOREIGN KEY(preparation_snapshot_id,preparation_member_ordinal) REFERENCES party_runtime.preparation_snapshot_members(preparation_snapshot_id,ordinal) ON DELETE RESTRICT
);
```

## `party_runtime.preparation_snapshot_members`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.preparation_snapshot_members (
  preparation_snapshot_id text NOT NULL REFERENCES party_runtime.preparation_snapshots(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK(ordinal >= 0), member_kind text NOT NULL CHECK(member_kind IN ('endpoint','transfer_scene')),
  source_authoring_ref jsonb NOT NULL, resolved_endpoint_snapshot jsonb,
  resolved_scene_baseline_id text REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,
  resolved_g6_instance_id text REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,
  resolved_position_id text REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  dependency_pins jsonb NOT NULL, share_mode text NOT NULL CHECK(share_mode IN ('execution_exclusive','reusable')),
  member_digest text NOT NULL, PRIMARY KEY(preparation_snapshot_id, ordinal),
  CHECK ((member_kind='endpoint') = (resolved_endpoint_snapshot IS NOT NULL AND resolved_scene_baseline_id IS NULL AND resolved_g6_instance_id IS NULL AND resolved_position_id IS NULL)),
  CHECK ((member_kind='transfer_scene') = (resolved_endpoint_snapshot IS NULL AND resolved_scene_baseline_id IS NOT NULL AND resolved_g6_instance_id IS NOT NULL AND resolved_position_id IS NOT NULL)),
  UNIQUE(preparation_snapshot_id, member_kind, dependency_pins)
);
```

Источник: [`008_party_runtime_pr8_first_entry.sql`](../../schemas/party-db/008_party_runtime_pr8_first_entry.sql)

```sql
ALTER TABLE party_runtime.preparation_snapshot_members
  ADD COLUMN IF NOT EXISTS prepared_scene_materialization jsonb;
```

Источник: [`008_party_runtime_pr8_first_entry.sql`](../../schemas/party-db/008_party_runtime_pr8_first_entry.sql)

```sql
ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_check;
```

Источник: [`008_party_runtime_pr8_first_entry.sql`](../../schemas/party-db/008_party_runtime_pr8_first_entry.sql)

```sql
ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_check1;
```

Источник: [`008_party_runtime_pr8_first_entry.sql`](../../schemas/party-db/008_party_runtime_pr8_first_entry.sql)

```sql
ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_branch_check;
```

Источник: [`008_party_runtime_pr8_first_entry.sql`](../../schemas/party-db/008_party_runtime_pr8_first_entry.sql)

```sql
ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_prepared_object_check;
```

Источник: [`008_party_runtime_pr8_first_entry.sql`](../../schemas/party-db/008_party_runtime_pr8_first_entry.sql)

```sql
ALTER TABLE party_runtime.preparation_snapshot_members
  ADD CONSTRAINT preparation_snapshot_members_branch_check CHECK (
    (
      member_kind = 'endpoint'
      AND resolved_endpoint_snapshot IS NOT NULL
      AND resolved_scene_baseline_id IS NULL
      AND resolved_g6_instance_id IS NULL
      AND resolved_position_id IS NULL
      AND prepared_scene_materialization IS NULL
    )
    OR
    (
      member_kind = 'transfer_scene'
      AND resolved_endpoint_snapshot IS NULL
      AND (
        (
          resolved_scene_baseline_id IS NOT NULL
          AND resolved_g6_instance_id IS NOT NULL
          AND resolved_position_id IS NOT NULL
          AND prepared_scene_materialization IS NULL
        )
        OR
        (
          resolved_scene_baseline_id IS NULL
          AND resolved_g6_instance_id IS NULL
          AND resolved_position_id IS NULL
          AND prepared_scene_materialization IS NOT NULL
        )
      )
    )
  );
```

Источник: [`008_party_runtime_pr8_first_entry.sql`](../../schemas/party-db/008_party_runtime_pr8_first_entry.sql)

```sql
ALTER TABLE party_runtime.preparation_snapshot_members
  ADD CONSTRAINT preparation_snapshot_members_prepared_object_check CHECK (
    prepared_scene_materialization IS NULL
    OR jsonb_typeof(prepared_scene_materialization) = 'object'
  );
```

## `party_runtime.preparation_snapshots`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.preparation_snapshots (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  planning_request_id text NOT NULL, planning_request_digest text NOT NULL,
  immutable_members_digest text NOT NULL, canonical_digest text NOT NULL,
  created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0), created_change_set_id text NOT NULL,
  UNIQUE(party_id, planning_request_id, planning_request_digest, immutable_members_digest)
);
```

## `party_runtime.relative_positions`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.relative_positions (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,actor_id text NOT NULL,relation text NOT NULL,target_entity_ref jsonb NOT NULL,against_position_id text REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,direction_context_id text,valid_while_condition_ref jsonb NOT NULL,state_version bigint NOT NULL CHECK(state_version>=0),updated_change_set_id text NOT NULL);
```

## `party_runtime.scene_frontier_bindings`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.scene_frontier_bindings (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  frontier_id text NOT NULL REFERENCES party_runtime.expansion_frontiers(id) ON DELETE RESTRICT,
  scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,
  access_condition_set_ref jsonb, status text NOT NULL CHECK(status IN ('active','inactive','superseded')),
  state_version bigint NOT NULL CHECK(state_version>=0), activated_change_set_id text NOT NULL, deactivated_change_set_id text,
  CHECK ((status='active')=(deactivated_change_set_id IS NULL))
);
```

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS scene_frontier_binding_active_frontier_uq ON party_runtime.scene_frontier_bindings(party_id,frontier_id) WHERE status='active';
```

## `party_runtime.scene_movement_edges`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.scene_movement_edges (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,source_scene_template_ref jsonb NOT NULL,source_edge_slot_key text NOT NULL,from_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,to_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,passage_type_id text NOT NULL,transition_environment_profile_ref jsonb NOT NULL,movement_orientation_profile_ref jsonb NOT NULL,cost_kind text NOT NULL CHECK(cost_kind IN ('action','time')),action_units integer,baseline_movement_method_id text,movement_method_cost_profile_ref jsonb,base_minutes numeric,dynamic_recheck_policy_ref jsonb,capacity integer,portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,availability_condition_set_ref jsonb,reverse_edge_id text,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,UNIQUE(scene_baseline_id,source_edge_slot_key),CHECK(base_minutes IS NULL OR party_runtime.integral_numeric(base_minutes)),CHECK((cost_kind='action')=(action_units IS NOT NULL AND baseline_movement_method_id IS NULL AND movement_method_cost_profile_ref IS NULL AND base_minutes IS NULL AND dynamic_recheck_policy_ref IS NULL)),CHECK((portal_entity_id IS NOT NULL)=(availability_condition_set_ref IS NOT NULL)),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
```

## `party_runtime.scene_position_nodes`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.scene_position_nodes (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE, g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,
  position_type_id text NOT NULL, template_slot_key text NOT NULL, template_instance_ordinal integer NOT NULL CHECK(template_instance_ordinal>=0), stable_basis_ref jsonb,
  capacity integer NOT NULL CHECK(capacity>0), access_class_id text NOT NULL, light_profile_ref jsonb, hazard_profile_ref jsonb,
  status text NOT NULL CHECK(status IN ('active','superseded','destroyed')), state_version bigint NOT NULL CHECK(state_version>=0), created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text,
  UNIQUE(g6_instance_id,template_slot_key,template_instance_ordinal), CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id))
);
```

## `party_runtime.spatial_v3_migration_coverage_artifacts`

Источник: [`006_party_runtime_v3_migration.sql`](../../schemas/party-db/006_party_runtime_v3_migration.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.spatial_v3_migration_coverage_artifacts (
  artifact_id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE RESTRICT,
  world_revision_id text,
  source_scope text NOT NULL,
  source_digest text NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  source_record_count integer NOT NULL CHECK (source_record_count >= 0),
  inventory_digest text NOT NULL CHECK (inventory_digest ~ '^[a-f0-9]{64}$'),
  inventory_target_digest text NOT NULL CHECK (inventory_target_digest ~ '^[a-f0-9]{64}$'),
  target_digest text NOT NULL CHECK (target_digest ~ '^[a-f0-9]{64}$'),
  acceptance_ok boolean NOT NULL,
  error_codes jsonb NOT NULL,
  source_snapshot jsonb NOT NULL,
  canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, source_digest, target_digest)
);
```

## `party_runtime.traveller_travel_states`

Источник: [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.traveller_travel_states (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE, route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT, plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), movement_carrier_ref jsonb NOT NULL, segment_progress_ppm integer NOT NULL CHECK(segment_progress_ppm BETWEEN 0 AND 1000000), cumulative_actual_time_numerator numeric NOT NULL CHECK(cumulative_actual_time_numerator>=0 AND party_runtime.integral_numeric(cumulative_actual_time_numerator)), cumulative_actual_time_denominator numeric NOT NULL CHECK(cumulative_actual_time_denominator>0 AND party_runtime.integral_numeric(cumulative_actual_time_denominator)), next_interval_ordinal integer NOT NULL DEFAULT 0 CHECK(next_interval_ordinal>=0), intended_direction_id text, navigation_state text NOT NULL CHECK(navigation_state IN ('on_course','deviating','lost')), last_confirmed_endpoint_ref jsonb NOT NULL, last_dynamic_snapshot_digest text, status text NOT NULL CHECK(status IN ('active','paused_in_transit','stranded_in_transit','closed')), stranded_reason_code text, closed_result text CHECK(closed_result IN ('completed','interrupted_to_anchor','superseded')), state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1), updated_change_set_id text NOT NULL, closed_change_set_id text,
  CHECK(gcd(cumulative_actual_time_numerator,cumulative_actual_time_denominator)=1), CHECK((status='stranded_in_transit')=(stranded_reason_code IS NOT NULL)),
  CHECK((status='closed')=(closed_result IS NOT NULL AND closed_change_set_id IS NOT NULL)),
  CHECK(status<>'closed' OR (closed_result='completed' AND segment_progress_ppm=1000000) OR (closed_result IN ('interrupted_to_anchor','superseded') AND segment_progress_ppm<1000000)),
  UNIQUE(route_plan_execution_id,plan_step_ordinal)
);
```

## `party_runtime.visibility_links`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.visibility_links (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,source_scene_template_ref jsonb NOT NULL,source_link_slot_key text NOT NULL,from_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,to_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,quality text NOT NULL CHECK(quality IN ('clear','partial')),distance_band text NOT NULL,portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,condition_profile_ref jsonb,reverse_link_id text,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,UNIQUE(scene_baseline_id,source_link_slot_key),CHECK((portal_entity_id IS NULL) OR condition_profile_ref IS NOT NULL),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
```

## `party_runtime.world_perception_signals`

Источник: [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.world_perception_signals (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,source_spatial_ref jsonb NOT NULL,source_dependency_pins jsonb NOT NULL,signal_type_id text NOT NULL,strength_profile_ref jsonb NOT NULL,weather_dependency_ref jsonb,route_or_direction_context_id text,active_condition_ref jsonb,state_version bigint NOT NULL CHECK(state_version>=0),updated_change_set_id text NOT NULL);
```

## Полный SQL миграций

### [`001_party_runtime.sql`](../../schemas/party-db/001_party_runtime.sql)

```sql
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
  physical_position TEXT CHECK (physical_position IN ('hands','worn','worn_quick','equipped','external','external_load')),
  equipment_slot_category_id TEXT,
  condition_state TEXT,
  closure_state TEXT CHECK (closure_state IN ('open','closed','locked','unavailable')),
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
  CHECK (physical_position IS NULL OR holder_character_id IS NOT NULL),
  CHECK (holder_character_id IS NULL OR physical_position IS NOT NULL),
  CHECK (equipment_slot_category_id IS NULL OR (holder_character_id IS NOT NULL AND physical_position = 'equipped')),
  CHECK (physical_position <> 'equipped' OR equipment_slot_category_id IS NOT NULL),
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
  physical_position TEXT CHECK (physical_position IN ('hands','worn','worn_quick','equipped','external','external_load')),
  equipment_slot_category_id TEXT,
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
  ,CHECK (physical_position IS NULL OR holder_character_id IS NOT NULL)
  ,CHECK (holder_character_id IS NULL OR physical_position IS NOT NULL)
  ,CHECK (equipment_slot_category_id IS NULL OR (holder_character_id IS NOT NULL AND physical_position = 'equipped'))
  ,CHECK (physical_position <> 'equipped' OR equipment_slot_category_id IS NOT NULL)
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
  controller_character_id TEXT,
  claim_state TEXT NOT NULL,
  PRIMARY KEY (party_id, ownership_id),
  FOREIGN KEY (party_id, item_id) REFERENCES party_runtime.party_items(party_id, item_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, container_id) REFERENCES party_runtime.party_containers(party_id, container_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, owner_npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, owner_character_id) REFERENCES party_runtime.party_player_characters(party_id, character_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, controller_npc_id) REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id, controller_character_id) REFERENCES party_runtime.party_player_characters(party_id, character_id) ON DELETE RESTRICT,
  CHECK ((CASE WHEN item_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN container_id IS NULL THEN 0 ELSE 1 END) = 1),
  CHECK ((CASE WHEN owner_npc_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN owner_character_id IS NULL THEN 0 ELSE 1 END)
       + (CASE WHEN owner_party THEN 1 ELSE 0 END) = 1)
  ,CHECK (NOT (controller_npc_id IS NOT NULL AND controller_character_id IS NOT NULL))
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
```

### [`002_party_runtime_v3.sql`](../../schemas/party-db/002_party_runtime_v3.sql)

```sql
-- Target-only spatial v3 foundation.  It is deliberately not part of the
-- production migration composition before the P28 atomic cutover.
CREATE SCHEMA IF NOT EXISTS party_runtime;

CREATE OR REPLACE FUNCTION party_runtime.integral_numeric(value numeric)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT value NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    AND value = trunc(value)
$$;

ALTER TABLE party_runtime.parties DROP CONSTRAINT IF EXISTS parties_schema_version_check;
ALTER TABLE party_runtime.parties ADD CONSTRAINT parties_schema_version_check CHECK (schema_version IN (2, 3));

CREATE OR REPLACE FUNCTION party_runtime.spatial_v3_lifecycle_valid(status text, terminal_change_set_id text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN status = 'active' THEN terminal_change_set_id IS NULL
    WHEN status IN ('superseded','destroyed','retired','removed','inactive','consumed','closed','expired','released') THEN terminal_change_set_id IS NOT NULL
    ELSE true
  END
$$;

CREATE TABLE IF NOT EXISTS party_runtime.party_g5_sites (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  origin text NOT NULL CHECK (origin IN ('canonical','generated')), parent_g4_id text NOT NULL,
  canonical_g5_ref jsonb, generated_template_ref jsonb, expansion_slot_ref jsonb, source_frontier_id text,
  generation_ordinal integer, direction_context_id text, continuation_chain_id text, continuation_ordinal integer,
  status text NOT NULL CHECK (status IN ('active','superseded','destroyed')), state_version bigint NOT NULL CHECK (state_version >= 0),
  created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text, superseded_by_site_id text,
  CHECK ((origin = 'canonical') = (canonical_g5_ref IS NOT NULL)),
  CHECK ((origin = 'generated') = (generated_template_ref IS NOT NULL AND expansion_slot_ref IS NOT NULL AND source_frontier_id IS NOT NULL AND generation_ordinal IS NOT NULL)),
  CHECK ((origin = 'canonical') OR generation_ordinal >= 0),
  CHECK (party_runtime.spatial_v3_lifecycle_valid(status, terminal_change_set_id))
);
CREATE UNIQUE INDEX IF NOT EXISTS party_g5_sites_canonical_active_uq ON party_runtime.party_g5_sites(party_id, (canonical_g5_ref->>'entity_id')) WHERE origin='canonical' AND status <> 'superseded';
CREATE UNIQUE INDEX IF NOT EXISTS party_g5_sites_generated_frontier_uq ON party_runtime.party_g5_sites(party_id, source_frontier_id) WHERE origin='generated';
CREATE UNIQUE INDEX IF NOT EXISTS party_g5_sites_generated_ordinal_uq ON party_runtime.party_g5_sites(party_id,parent_g4_id,(expansion_slot_ref->>'entity_id'),generation_ordinal) WHERE origin='generated';

CREATE TABLE IF NOT EXISTS party_runtime.party_continuation_chains (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  g4_id text NOT NULL, slot_ref jsonb NOT NULL, initial_frontier_id text NOT NULL, terminal_ordinal integer NOT NULL CHECK (terminal_ordinal >= 0),
  length_rule_ref jsonb NOT NULL, candidate_digest text NOT NULL, choice_trace_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','terminal_resolved')), state_version bigint NOT NULL CHECK (state_version >= 0),
  created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text,
  UNIQUE (party_id, initial_frontier_id), CHECK ((status='active') = (terminal_change_set_id IS NULL))
);
CREATE TABLE IF NOT EXISTS party_runtime.expansion_frontiers (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  g4_id text NOT NULL, source_g5_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,
  slot_ref jsonb NOT NULL, direction_context_id text, continuation_chain_id text REFERENCES party_runtime.party_continuation_chains(id) ON DELETE RESTRICT,
  continuation_ordinal integer, status text NOT NULL CHECK (status IN ('open','consumed','closed')),
  resolution_kind text, resolved_site_connection_id text, resolved_boundary_entity_id text,
  state_version bigint NOT NULL CHECK (state_version >= 0), created_change_set_id text NOT NULL, resolved_change_set_id text,
  CHECK ((continuation_chain_id IS NULL) = (direction_context_id IS NULL)),
  CHECK ((continuation_chain_id IS NULL) = (continuation_ordinal IS NULL)),
  CHECK ((status='open') = (resolution_kind IS NULL AND resolved_site_connection_id IS NULL AND resolved_boundary_entity_id IS NULL AND resolved_change_set_id IS NULL)),
  CHECK (status <> 'consumed' OR (resolution_kind IN ('generated_site','existing_site','world_route_exit') AND resolved_site_connection_id IS NOT NULL AND resolved_boundary_entity_id IS NULL AND resolved_change_set_id IS NOT NULL)),
  CHECK (status <> 'closed' OR (resolution_kind='physical_boundary' AND resolved_boundary_entity_id IS NOT NULL AND resolved_site_connection_id IS NULL AND resolved_change_set_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS expansion_frontiers_open_chain_uq ON party_runtime.expansion_frontiers(continuation_chain_id) WHERE status='open' AND continuation_chain_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS party_runtime.expansion_capacity_reservations (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE, g4_id text NOT NULL,
  profile_ref jsonb NOT NULL, slot_ref jsonb NOT NULL, selected_template_ref jsonb NOT NULL,
  frontier_id text NOT NULL REFERENCES party_runtime.expansion_frontiers(id) ON DELETE RESTRICT, idempotency_record_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved','consumed','released','expired')), expires_at timestamptz NOT NULL,
  state_version bigint NOT NULL CHECK (state_version >= 0), terminal_change_set_id text,
  CHECK ((status='reserved') = (terminal_change_set_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS expansion_reservation_frontier_live_uq ON party_runtime.expansion_capacity_reservations(frontier_id) WHERE status='reserved';
CREATE INDEX IF NOT EXISTS expansion_reservation_ttl_idx ON party_runtime.expansion_capacity_reservations(status,expires_at) WHERE status='reserved';
CREATE TABLE IF NOT EXISTS party_runtime.party_g4_expansion_ledgers (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE, g4_id text NOT NULL, profile_ref jsonb NOT NULL,
  profile_ref_id text GENERATED ALWAYS AS (profile_ref->>'entity_id') STORED,
  state_version bigint NOT NULL CHECK (state_version >= 0), updated_change_set_id text NOT NULL, PRIMARY KEY (party_id,g4_id,profile_ref_id)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_scene_baselines (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  host_kind text NOT NULL CHECK (host_kind IN ('g5_site','transport','route_anchor_identity')), host_id text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('canonical_template','generated_template','transport_template','route_checkpoint','interruption_scene','migration','repair')),
  scene_template_ref jsonb NOT NULL, materialization_trace_id text NOT NULL, materializer_version text NOT NULL, catalog_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','superseded','destroyed')), state_version bigint NOT NULL CHECK (state_version >= 0),
  created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK (party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id))
);
CREATE UNIQUE INDEX IF NOT EXISTS party_scene_baseline_active_host_uq ON party_runtime.party_scene_baselines(party_id,host_kind,host_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS party_runtime.party_g6_instances (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT, source_scene_template_ref jsonb NOT NULL, scene_slot_key text NOT NULL,
  enclosing_stable_structure_id text, host_kind text NOT NULL, host_id text NOT NULL, physical_class_id text NOT NULL, primary_scene_role_id text NOT NULL,
  vertical_context_id text NOT NULL, overhead_cover_id text NOT NULL, intra_g6_visibility_mode text NOT NULL CHECK (intra_g6_visibility_mode IN ('default_clear','explicit')),
  default_visibility_distance_band text, acoustic_uniformity text NOT NULL, status text NOT NULL CHECK (status IN ('active','superseded','destroyed')),
  state_version bigint NOT NULL CHECK (state_version >= 0), created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text,
  UNIQUE(scene_baseline_id,scene_slot_key), CHECK ((intra_g6_visibility_mode='default_clear') = (default_visibility_distance_band IS NOT NULL)), CHECK (party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id))
);
CREATE TABLE IF NOT EXISTS party_runtime.scene_position_nodes (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE, g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,
  position_type_id text NOT NULL, template_slot_key text NOT NULL, template_instance_ordinal integer NOT NULL CHECK(template_instance_ordinal>=0), stable_basis_ref jsonb,
  capacity integer NOT NULL CHECK(capacity>0), access_class_id text NOT NULL, light_profile_ref jsonb, hazard_profile_ref jsonb,
  status text NOT NULL CHECK(status IN ('active','superseded','destroyed')), state_version bigint NOT NULL CHECK(state_version>=0), created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text,
  UNIQUE(g6_instance_id,template_slot_key,template_instance_ordinal), CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id))
);
CREATE TABLE IF NOT EXISTS party_runtime.scene_frontier_bindings (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  frontier_id text NOT NULL REFERENCES party_runtime.expansion_frontiers(id) ON DELETE RESTRICT,
  scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,
  access_condition_set_ref jsonb, status text NOT NULL CHECK(status IN ('active','inactive','superseded')),
  state_version bigint NOT NULL CHECK(state_version>=0), activated_change_set_id text NOT NULL, deactivated_change_set_id text,
  CHECK ((status='active')=(deactivated_change_set_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS scene_frontier_binding_active_frontier_uq ON party_runtime.scene_frontier_bindings(party_id,frontier_id) WHERE status='active';

CREATE TABLE IF NOT EXISTS party_runtime.portal_entities (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,portal_template_ref jsonb NOT NULL,state text NOT NULL CHECK(state IN ('open','closed','locked','destroyed')),controller_entity_ref jsonb,state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS portal_entity_template_uq ON party_runtime.portal_entities(scene_baseline_id,(portal_template_ref->>'entity_id'));
CREATE TABLE IF NOT EXISTS party_runtime.scene_movement_edges (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,source_scene_template_ref jsonb NOT NULL,source_edge_slot_key text NOT NULL,from_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,to_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,passage_type_id text NOT NULL,transition_environment_profile_ref jsonb NOT NULL,movement_orientation_profile_ref jsonb NOT NULL,cost_kind text NOT NULL CHECK(cost_kind IN ('action','time')),action_units integer,baseline_movement_method_id text,movement_method_cost_profile_ref jsonb,base_minutes numeric,dynamic_recheck_policy_ref jsonb,capacity integer,portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,availability_condition_set_ref jsonb,reverse_edge_id text,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,UNIQUE(scene_baseline_id,source_edge_slot_key),CHECK(base_minutes IS NULL OR party_runtime.integral_numeric(base_minutes)),CHECK((cost_kind='action')=(action_units IS NOT NULL AND baseline_movement_method_id IS NULL AND movement_method_cost_profile_ref IS NULL AND base_minutes IS NULL AND dynamic_recheck_policy_ref IS NULL)),CHECK((portal_entity_id IS NOT NULL)=(availability_condition_set_ref IS NOT NULL)),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
CREATE TABLE IF NOT EXISTS party_runtime.visibility_links (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,source_scene_template_ref jsonb NOT NULL,source_link_slot_key text NOT NULL,from_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,to_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,quality text NOT NULL CHECK(quality IN ('clear','partial')),distance_band text NOT NULL,portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,condition_profile_ref jsonb,reverse_link_id text,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,UNIQUE(scene_baseline_id,source_link_slot_key),CHECK((portal_entity_id IS NULL) OR condition_profile_ref IS NOT NULL),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
CREATE TABLE IF NOT EXISTS party_runtime.g6_acoustic_profiles (party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE CASCADE,ambient_noise integer NOT NULL CHECK(ambient_noise>=0),acoustic_uniformity text NOT NULL,state_version bigint NOT NULL CHECK(state_version>=0),updated_change_set_id text NOT NULL,PRIMARY KEY(party_id,g6_instance_id));
CREATE TABLE IF NOT EXISTS party_runtime.acoustic_edges (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,source_scene_template_ref jsonb NOT NULL,source_edge_slot_key text NOT NULL,from_g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,to_g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,base_loss integer NOT NULL CHECK(base_loss BETWEEN 0 AND 2),portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,closed_extra_loss text,reverse_edge_id text,condition_profile_ref jsonb,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,UNIQUE(scene_baseline_id,source_edge_slot_key),CHECK((portal_entity_id IS NULL AND closed_extra_loss IS NULL) OR (portal_entity_id IS NOT NULL AND closed_extra_loss IS NOT NULL AND condition_profile_ref IS NOT NULL)),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));

CREATE TABLE IF NOT EXISTS party_runtime.g5_site_connections (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,from_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,to_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,passage_type_id text NOT NULL,transition_environment_profile_ref jsonb NOT NULL,movement_orientation_profile_ref jsonb NOT NULL,cost_kind text NOT NULL CHECK(cost_kind IN ('action','time')),action_units integer,baseline_movement_method_id text,movement_method_cost_profile_ref jsonb,base_minutes numeric,dynamic_recheck_policy_ref jsonb,capacity integer,risk_profile_ref jsonb,portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,availability_condition_set_ref jsonb,reverse_connection_id text,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,CHECK(base_minutes IS NULL OR party_runtime.integral_numeric(base_minutes)),CHECK((cost_kind='action')=(action_units IS NOT NULL AND baseline_movement_method_id IS NULL AND movement_method_cost_profile_ref IS NULL AND base_minutes IS NULL AND dynamic_recheck_policy_ref IS NULL)),CHECK((portal_entity_id IS NOT NULL)=(availability_condition_set_ref IS NOT NULL)),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
CREATE TABLE IF NOT EXISTS party_runtime.party_site_connection_endpoint_bindings (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,site_connection_id text NOT NULL REFERENCES party_runtime.g5_site_connections(id) ON DELETE CASCADE,endpoint_role text NOT NULL CHECK(endpoint_role IN ('from','to')),g5_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,source_slot_key text NOT NULL,status text NOT NULL CHECK(status IN ('active','inactive','superseded')),state_version bigint NOT NULL CHECK(state_version>=0),activated_change_set_id text NOT NULL,deactivated_change_set_id text,CHECK((status='active')=(deactivated_change_set_id IS NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS site_connection_endpoint_active_uq ON party_runtime.party_site_connection_endpoint_bindings(party_id,site_connection_id,endpoint_role) WHERE status='active';
CREATE TABLE IF NOT EXISTS party_runtime.party_world_route_endpoint_position_bindings (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,source_endpoint_binding_ref jsonb NOT NULL,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,g5_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,status text NOT NULL CHECK(status IN ('active','inactive','superseded')),state_version bigint NOT NULL CHECK(state_version>=0),activated_change_set_id text NOT NULL,deactivated_change_set_id text,CHECK((status='active')=(deactivated_change_set_id IS NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS world_endpoint_position_active_uq ON party_runtime.party_world_route_endpoint_position_bindings(party_id,(source_endpoint_binding_ref->>'entity_id'),(source_endpoint_binding_ref->>'authoring_version')) WHERE status='active';

CREATE TABLE IF NOT EXISTS party_runtime.party_transit_anchors (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,source_route_point_ref jsonb NOT NULL,anchor_role text NOT NULL CHECK(anchor_role IN ('ordinary','boundary','checkpoint')),context_snapshot jsonb NOT NULL,active_side text NOT NULL,allowed_departure_dependency_pins jsonb NOT NULL,status text NOT NULL CHECK(status IN ('active','superseded','retired')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
CREATE UNIQUE INDEX IF NOT EXISTS transit_anchor_active_route_point_uq ON party_runtime.party_transit_anchors(party_id,(source_route_point_ref->>'entity_id'),(source_route_point_ref->>'authoring_version')) WHERE status='active';
CREATE TABLE IF NOT EXISTS party_runtime.party_route_anchor_identities (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,anchor_kind text NOT NULL CHECK(anchor_kind IN ('shared_checkpoint','interruption','migration_checkpoint')),source_transit_anchor_id text REFERENCES party_runtime.party_transit_anchors(id) ON DELETE RESTRICT,source_execution_id text,source_step_ordinal integer,source_segment_progress_ppm integer,source_dependency_pins jsonb NOT NULL,factual_context_snapshot jsonb NOT NULL,status text NOT NULL CHECK(status IN ('active','inactive','superseded','destroyed')),resolution_kind text NOT NULL CHECK(resolution_kind IN ('reusable_checkpoint','ephemeral_resolved','persistent_consequence','unresolved')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,CHECK((anchor_kind='shared_checkpoint')=(source_transit_anchor_id IS NOT NULL)),CHECK((status IN ('active','inactive')) = (terminal_change_set_id IS NULL)));
CREATE TABLE IF NOT EXISTS party_runtime.party_route_anchor_location_bindings (id text PRIMARY KEY,route_anchor_id text NOT NULL REFERENCES party_runtime.party_route_anchor_identities(id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,position_node_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,dependency_pins jsonb NOT NULL,status text NOT NULL CHECK(status IN ('active','inactive','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),activated_change_set_id text NOT NULL,deactivated_change_set_id text,CHECK((status='active')=(deactivated_change_set_id IS NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS route_anchor_location_active_uq ON party_runtime.party_route_anchor_location_bindings(route_anchor_id) WHERE status='active';

CREATE TABLE IF NOT EXISTS party_runtime.entity_placements (party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,entity_kind text NOT NULL,entity_id text NOT NULL,placement_kind text NOT NULL CHECK(placement_kind IN ('scene_position','inside_entity','on_entity','attached_to_entity','moored_at_position','parked_at_position')),position_node_id text REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,host_entity_ref jsonb,occupies_capacity_units integer NOT NULL CHECK(occupies_capacity_units>=0),visibility_modifier_ref jsonb,interaction_profile_ref jsonb,state_version bigint NOT NULL CHECK(state_version>=0),updated_change_set_id text NOT NULL,PRIMARY KEY(party_id,entity_kind,entity_id),CHECK((placement_kind IN ('scene_position','moored_at_position','parked_at_position')) = (position_node_id IS NOT NULL)),CHECK((placement_kind IN ('inside_entity','on_entity','attached_to_entity')) = (host_entity_ref IS NOT NULL)));
CREATE TABLE IF NOT EXISTS party_runtime.relative_positions (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,actor_id text NOT NULL,relation text NOT NULL,target_entity_ref jsonb NOT NULL,against_position_id text REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,direction_context_id text,valid_while_condition_ref jsonb NOT NULL,state_version bigint NOT NULL CHECK(state_version>=0),updated_change_set_id text NOT NULL);
CREATE TABLE IF NOT EXISTS party_runtime.navigation_beliefs (party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,character_id text NOT NULL,perceived_area_ref jsonb,perceived_direction_id text,perceived_bearing_mdeg integer,perceived_vertical_direction text,confidence text NOT NULL CHECK(confidence IN ('exact','approximate','uncertain','lost')),updated_at_turn bigint NOT NULL CHECK(updated_at_turn>=0),state_version bigint NOT NULL CHECK(state_version>=0),updated_change_set_id text NOT NULL,PRIMARY KEY(party_id,character_id),CHECK(confidence <> 'exact' OR perceived_area_ref IS NOT NULL OR perceived_direction_id IS NOT NULL));
CREATE TABLE IF NOT EXISTS party_runtime.world_perception_signals (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,source_spatial_ref jsonb NOT NULL,source_dependency_pins jsonb NOT NULL,signal_type_id text NOT NULL,strength_profile_ref jsonb NOT NULL,weather_dependency_ref jsonb,route_or_direction_context_id text,active_condition_ref jsonb,state_version bigint NOT NULL CHECK(state_version>=0),updated_change_set_id text NOT NULL);
CREATE TABLE IF NOT EXISTS party_runtime.movement_edge_blockers (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,relation_ref jsonb NOT NULL,relation_dependency_pins jsonb NOT NULL,blocker_entity_ref jsonb NOT NULL,block_kind text NOT NULL CHECK(block_kind IN ('full','capacity_reduction')),reduced_capacity integer,activation_condition_ref jsonb,status text NOT NULL CHECK(status IN ('active','removed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,CHECK((block_kind='capacity_reduction')=(reduced_capacity IS NOT NULL)),CHECK((status='active')=(terminal_change_set_id IS NULL)));

-- Cross-row invariants deliberately live in deferred constraints: a materializer
-- may construct a complete scene in one transaction, but cannot commit a mixed
-- party, host or endpoint identity.
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_site_connection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a party_runtime.party_g5_sites%ROWTYPE; b party_runtime.party_g5_sites%ROWTYPE;
BEGIN
 SELECT * INTO a FROM party_runtime.party_g5_sites WHERE id=NEW.from_site_id;
 SELECT * INTO b FROM party_runtime.party_g5_sites WHERE id=NEW.to_site_id;
 IF a.party_id<>NEW.party_id OR b.party_id<>NEW.party_id OR a.parent_g4_id<>b.parent_g4_id THEN RAISE EXCEPTION 'movement_endpoint_kind_invalid: connection endpoints must be same-party sites under one G4'; END IF;
 IF NEW.portal_entity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM party_runtime.portal_entities p WHERE p.id=NEW.portal_entity_id AND p.party_id=NEW.party_id) THEN RAISE EXCEPTION 'portal_state_contract_gap: site connection portal must be same-party'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_world_endpoint_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM party_runtime.party_scene_baselines b WHERE b.id=NEW.scene_baseline_id AND b.party_id=NEW.party_id AND b.host_kind='g5_site' AND b.host_id=NEW.g5_site_id)
    OR NOT EXISTS (SELECT 1 FROM party_runtime.party_g5_sites s WHERE s.id=NEW.g5_site_id AND s.party_id=NEW.party_id)
    OR NOT EXISTS (SELECT 1 FROM party_runtime.scene_position_nodes p JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id WHERE p.id=NEW.position_id AND p.party_id=NEW.party_id AND g.scene_baseline_id=NEW.scene_baseline_id) THEN
   RAISE EXCEPTION 'route_endpoint_invalid: world endpoint binding must join one same-party baseline/site/position identity';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_route_anchor_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source_transit_anchor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM party_runtime.party_transit_anchors a WHERE a.id=NEW.source_transit_anchor_id AND a.party_id=NEW.party_id AND a.status='active') THEN RAISE EXCEPTION 'movement_anchor_unresolved: route anchor source transit anchor must be active and same-party'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_g6() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE baseline party_runtime.party_scene_baselines%ROWTYPE;
BEGIN
 SELECT * INTO baseline FROM party_runtime.party_scene_baselines WHERE id=NEW.scene_baseline_id;
 IF baseline.party_id<>NEW.party_id OR baseline.host_kind<>NEW.host_kind OR baseline.host_id<>NEW.host_id OR (NEW.status='active' AND baseline.status<>'active') THEN RAISE EXCEPTION 'generated_schema_mismatch: G6 must match an active same-party baseline host'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM party_runtime.party_g6_instances g WHERE g.id=NEW.g6_instance_id AND g.party_id=NEW.party_id) THEN RAISE EXCEPTION 'generated_schema_mismatch: position must belong to a same-party G6'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_connection_endpoint() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c party_runtime.g5_site_connections%ROWTYPE;
BEGIN
 SELECT * INTO c FROM party_runtime.g5_site_connections WHERE id=NEW.site_connection_id;
 IF c.party_id<>NEW.party_id OR NOT EXISTS (SELECT 1 FROM party_runtime.party_g5_sites s WHERE s.id=NEW.g5_site_id AND s.party_id=NEW.party_id AND ((NEW.endpoint_role='from' AND s.id=c.from_site_id) OR (NEW.endpoint_role='to' AND s.id=c.to_site_id))) THEN RAISE EXCEPTION 'movement_endpoint_kind_invalid: endpoint role must match its connection site'; END IF;
 IF NOT EXISTS (SELECT 1 FROM party_runtime.scene_position_nodes p WHERE p.id=NEW.position_id AND p.party_id=NEW.party_id) THEN RAISE EXCEPTION 'movement_endpoint_kind_invalid: endpoint position is not same-party'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_placement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.position_node_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM party_runtime.scene_position_nodes p WHERE p.id=NEW.position_node_id AND p.party_id=NEW.party_id AND p.status='active') THEN RAISE EXCEPTION 'journey_location_ownership_mismatch: placement requires active same-party position'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_scene_frontier_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.access_condition_set_ref IS NOT NULL AND (NEW.access_condition_set_ref->>'entity_id' IS NULL OR NEW.access_condition_set_ref->>'authoring_version' IS NULL) THEN
   RAISE EXCEPTION 'generated_schema_mismatch: frontier access condition must be a versioned reference when present';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM party_runtime.expansion_frontiers f WHERE f.id=NEW.frontier_id AND f.party_id=NEW.party_id)
    OR NOT EXISTS (SELECT 1 FROM party_runtime.party_scene_baselines b WHERE b.id=NEW.scene_baseline_id AND b.party_id=NEW.party_id)
    OR NOT EXISTS (SELECT 1 FROM party_runtime.scene_position_nodes p JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id WHERE p.id=NEW.position_id AND p.party_id=NEW.party_id AND g.scene_baseline_id=NEW.scene_baseline_id) THEN
   RAISE EXCEPTION 'movement_anchor_unresolved: frontier binding must join one same-party scene position and baseline';
 END IF;
 IF NEW.status='active' AND (NOT EXISTS (SELECT 1 FROM party_runtime.expansion_frontiers f WHERE f.id=NEW.frontier_id AND f.status='open')
   OR NOT EXISTS (SELECT 1 FROM party_runtime.party_scene_baselines b WHERE b.id=NEW.scene_baseline_id AND b.status='active')
   OR NOT EXISTS (SELECT 1 FROM party_runtime.scene_position_nodes p JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id WHERE p.id=NEW.position_id AND p.status='active' AND g.status='active')) THEN
   RAISE EXCEPTION 'movement_anchor_unresolved: active frontier binding requires open frontier and active scene chain';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_scene_relation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_baseline text; expected_party text;
BEGIN
 expected_baseline:=NEW.scene_baseline_id; expected_party:=NEW.party_id;
 IF TG_TABLE_NAME IN ('scene_movement_edges','visibility_links') THEN
   IF NOT EXISTS (SELECT 1 FROM party_runtime.scene_position_nodes p JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id WHERE p.id=NEW.from_position_id AND p.party_id=expected_party AND g.scene_baseline_id=expected_baseline)
      OR NOT EXISTS (SELECT 1 FROM party_runtime.scene_position_nodes p JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id WHERE p.id=NEW.to_position_id AND p.party_id=expected_party AND g.scene_baseline_id=expected_baseline) THEN RAISE EXCEPTION 'generated_schema_mismatch: scene relation endpoints must belong to its same-party baseline'; END IF;
 ELSE
   IF NOT EXISTS (SELECT 1 FROM party_runtime.party_g6_instances g WHERE g.id=NEW.from_g6_instance_id AND g.party_id=expected_party AND g.scene_baseline_id=expected_baseline)
      OR NOT EXISTS (SELECT 1 FROM party_runtime.party_g6_instances g WHERE g.id=NEW.to_g6_instance_id AND g.party_id=expected_party AND g.scene_baseline_id=expected_baseline) THEN RAISE EXCEPTION 'generated_schema_mismatch: acoustic endpoints must belong to its same-party baseline'; END IF;
 END IF;
 IF NEW.portal_entity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM party_runtime.portal_entities p WHERE p.id=NEW.portal_entity_id AND p.party_id=expected_party AND p.scene_baseline_id=expected_baseline) THEN RAISE EXCEPTION 'portal_state_contract_gap: portal must belong to the relation baseline'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_baseline_host() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.host_kind='g5_site' AND NOT EXISTS (SELECT 1 FROM party_runtime.party_g5_sites s WHERE s.id=NEW.host_id AND s.party_id=NEW.party_id) THEN RAISE EXCEPTION 'generated_schema_mismatch: g5 baseline host is not same-party site'; END IF;
 IF NEW.host_kind='route_anchor_identity' AND NOT EXISTS (SELECT 1 FROM party_runtime.party_route_anchor_identities a WHERE a.id=NEW.host_id AND a.party_id=NEW.party_id) THEN RAISE EXCEPTION 'generated_schema_mismatch: route-anchor baseline host is not same-party identity'; END IF;
 IF NEW.source_kind IN ('canonical_template','generated_template') AND NEW.host_kind<>'g5_site' THEN RAISE EXCEPTION 'generated_schema_mismatch: site template baseline requires G5 host'; END IF;
 IF NEW.source_kind='canonical_template' AND NOT EXISTS (SELECT 1 FROM party_runtime.party_g5_sites s WHERE s.id=NEW.host_id AND s.party_id=NEW.party_id AND s.origin='canonical') THEN RAISE EXCEPTION 'generated_schema_mismatch: canonical template baseline requires canonical G5 site'; END IF;
 IF NEW.source_kind='generated_template' AND NOT EXISTS (SELECT 1 FROM party_runtime.party_g5_sites s WHERE s.id=NEW.host_id AND s.party_id=NEW.party_id AND s.origin='generated') THEN RAISE EXCEPTION 'generated_schema_mismatch: generated template baseline requires generated G5 site'; END IF;
 IF NEW.source_kind IN ('route_checkpoint','interruption_scene') AND NEW.host_kind<>'route_anchor_identity' THEN RAISE EXCEPTION 'generated_schema_mismatch: route scene baseline requires route-anchor host'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_portal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM party_runtime.party_scene_baselines b WHERE b.id=NEW.scene_baseline_id AND b.party_id=NEW.party_id) THEN RAISE EXCEPTION 'portal_state_contract_gap: portal baseline must be same-party'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_route_anchor_location() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM party_runtime.party_route_anchor_identities a WHERE a.id=NEW.route_anchor_id AND a.party_id=(SELECT party_id FROM party_runtime.party_scene_baselines WHERE id=NEW.scene_baseline_id))
    OR NOT EXISTS (SELECT 1 FROM party_runtime.party_g6_instances g WHERE g.id=NEW.g6_instance_id AND g.scene_baseline_id=NEW.scene_baseline_id)
    OR NOT EXISTS (SELECT 1 FROM party_runtime.scene_position_nodes p WHERE p.id=NEW.position_node_id AND p.g6_instance_id=NEW.g6_instance_id) THEN RAISE EXCEPTION 'movement_anchor_unresolved: route anchor binding joins must share party/baseline/G6'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_route_anchor_location_usability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='active' AND (NOT EXISTS (SELECT 1 FROM party_runtime.party_route_anchor_identities a WHERE a.id=NEW.route_anchor_id AND a.status='active')
    OR NOT EXISTS (SELECT 1 FROM party_runtime.party_scene_baselines b WHERE b.id=NEW.scene_baseline_id AND b.status='active')
    OR NOT EXISTS (SELECT 1 FROM party_runtime.party_g6_instances g WHERE g.id=NEW.g6_instance_id AND g.status='active')
    OR NOT EXISTS (SELECT 1 FROM party_runtime.scene_position_nodes p WHERE p.id=NEW.position_node_id AND p.status='active')) THEN
   RAISE EXCEPTION 'movement_anchor_unresolved: active route-anchor location requires active identity, baseline, G6 and position';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_active_anchor_children() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status<>'active' AND EXISTS (SELECT 1 FROM party_runtime.party_route_anchor_location_bindings b WHERE b.route_anchor_id=NEW.id AND b.status='active') THEN RAISE EXCEPTION 'movement_anchor_unresolved: cannot deactivate route anchor with active location binding'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_active_baseline_children() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status<>'active' AND (EXISTS (SELECT 1 FROM party_runtime.party_route_anchor_location_bindings b WHERE b.scene_baseline_id=NEW.id AND b.status='active') OR EXISTS (SELECT 1 FROM party_runtime.scene_frontier_bindings b WHERE b.scene_baseline_id=NEW.id AND b.status='active')) THEN RAISE EXCEPTION 'movement_anchor_unresolved: cannot deactivate baseline with active spatial binding'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_active_g6_children() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status<>'active' AND (EXISTS (SELECT 1 FROM party_runtime.party_route_anchor_location_bindings b WHERE b.g6_instance_id=NEW.id AND b.status='active') OR EXISTS (SELECT 1 FROM party_runtime.scene_frontier_bindings b JOIN party_runtime.scene_position_nodes p ON p.id=b.position_id WHERE p.g6_instance_id=NEW.id AND b.status='active')) THEN RAISE EXCEPTION 'movement_anchor_unresolved: cannot deactivate G6 with active spatial binding'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_active_position_children() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status<>'active' AND (EXISTS (SELECT 1 FROM party_runtime.party_route_anchor_location_bindings b WHERE b.position_node_id=NEW.id AND b.status='active') OR EXISTS (SELECT 1 FROM party_runtime.scene_frontier_bindings b WHERE b.position_id=NEW.id AND b.status='active')) THEN RAISE EXCEPTION 'movement_anchor_unresolved: cannot deactivate position with active spatial binding'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.validate_v3_active_frontier_children() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status<>'open' AND EXISTS (SELECT 1 FROM party_runtime.scene_frontier_bindings b WHERE b.frontier_id=NEW.id AND b.status='active') THEN RAISE EXCEPTION 'movement_anchor_unresolved: cannot resolve frontier with active scene binding'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v3_site_connection_integrity ON party_runtime.g5_site_connections;
CREATE CONSTRAINT TRIGGER v3_site_connection_integrity AFTER INSERT OR UPDATE ON party_runtime.g5_site_connections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_site_connection();
DROP TRIGGER IF EXISTS v3_world_endpoint_integrity ON party_runtime.party_world_route_endpoint_position_bindings;
CREATE CONSTRAINT TRIGGER v3_world_endpoint_integrity AFTER INSERT OR UPDATE ON party_runtime.party_world_route_endpoint_position_bindings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_world_endpoint_binding();
DROP TRIGGER IF EXISTS v3_route_anchor_identity_integrity ON party_runtime.party_route_anchor_identities;
CREATE CONSTRAINT TRIGGER v3_route_anchor_identity_integrity AFTER INSERT OR UPDATE ON party_runtime.party_route_anchor_identities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_route_anchor_identity();
DROP TRIGGER IF EXISTS v3_g6_integrity ON party_runtime.party_g6_instances;
CREATE CONSTRAINT TRIGGER v3_g6_integrity AFTER INSERT OR UPDATE ON party_runtime.party_g6_instances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_g6();
DROP TRIGGER IF EXISTS v3_position_integrity ON party_runtime.scene_position_nodes;
CREATE CONSTRAINT TRIGGER v3_position_integrity AFTER INSERT OR UPDATE ON party_runtime.scene_position_nodes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_position();
DROP TRIGGER IF EXISTS v3_connection_endpoint_integrity ON party_runtime.party_site_connection_endpoint_bindings;
CREATE CONSTRAINT TRIGGER v3_connection_endpoint_integrity AFTER INSERT OR UPDATE ON party_runtime.party_site_connection_endpoint_bindings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_connection_endpoint();
DROP TRIGGER IF EXISTS v3_placement_integrity ON party_runtime.entity_placements;
CREATE CONSTRAINT TRIGGER v3_placement_integrity AFTER INSERT OR UPDATE ON party_runtime.entity_placements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_placement();
DROP TRIGGER IF EXISTS v3_scene_frontier_integrity ON party_runtime.scene_frontier_bindings;
CREATE CONSTRAINT TRIGGER v3_scene_frontier_integrity AFTER INSERT OR UPDATE ON party_runtime.scene_frontier_bindings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_scene_frontier_binding();
DROP TRIGGER IF EXISTS v3_scene_movement_integrity ON party_runtime.scene_movement_edges;
CREATE CONSTRAINT TRIGGER v3_scene_movement_integrity AFTER INSERT OR UPDATE ON party_runtime.scene_movement_edges DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_scene_relation();
DROP TRIGGER IF EXISTS v3_visibility_integrity ON party_runtime.visibility_links;
CREATE CONSTRAINT TRIGGER v3_visibility_integrity AFTER INSERT OR UPDATE ON party_runtime.visibility_links DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_scene_relation();
DROP TRIGGER IF EXISTS v3_acoustic_integrity ON party_runtime.acoustic_edges;
CREATE CONSTRAINT TRIGGER v3_acoustic_integrity AFTER INSERT OR UPDATE ON party_runtime.acoustic_edges DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_scene_relation();
DROP TRIGGER IF EXISTS v3_baseline_host_integrity ON party_runtime.party_scene_baselines;
CREATE CONSTRAINT TRIGGER v3_baseline_host_integrity AFTER INSERT OR UPDATE ON party_runtime.party_scene_baselines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_baseline_host();
DROP TRIGGER IF EXISTS v3_portal_integrity ON party_runtime.portal_entities;
CREATE CONSTRAINT TRIGGER v3_portal_integrity AFTER INSERT OR UPDATE ON party_runtime.portal_entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_portal();
DROP TRIGGER IF EXISTS v3_route_anchor_location_integrity ON party_runtime.party_route_anchor_location_bindings;
CREATE CONSTRAINT TRIGGER v3_route_anchor_location_integrity AFTER INSERT OR UPDATE ON party_runtime.party_route_anchor_location_bindings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_route_anchor_location();
DROP TRIGGER IF EXISTS v3_route_anchor_location_usability ON party_runtime.party_route_anchor_location_bindings;
CREATE CONSTRAINT TRIGGER v3_route_anchor_location_usability AFTER INSERT OR UPDATE ON party_runtime.party_route_anchor_location_bindings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_route_anchor_location_usability();
DROP TRIGGER IF EXISTS v3_active_anchor_children ON party_runtime.party_route_anchor_identities;
CREATE CONSTRAINT TRIGGER v3_active_anchor_children AFTER UPDATE OF status ON party_runtime.party_route_anchor_identities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_active_anchor_children();
DROP TRIGGER IF EXISTS v3_active_baseline_children ON party_runtime.party_scene_baselines;
CREATE CONSTRAINT TRIGGER v3_active_baseline_children AFTER UPDATE OF status ON party_runtime.party_scene_baselines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_active_baseline_children();
DROP TRIGGER IF EXISTS v3_active_g6_children ON party_runtime.party_g6_instances;
CREATE CONSTRAINT TRIGGER v3_active_g6_children AFTER UPDATE OF status ON party_runtime.party_g6_instances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_active_g6_children();
DROP TRIGGER IF EXISTS v3_active_position_children ON party_runtime.scene_position_nodes;
CREATE CONSTRAINT TRIGGER v3_active_position_children AFTER UPDATE OF status ON party_runtime.scene_position_nodes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_active_position_children();
DROP TRIGGER IF EXISTS v3_active_frontier_children ON party_runtime.expansion_frontiers;
CREATE CONSTRAINT TRIGGER v3_active_frontier_children AFTER UPDATE OF status ON party_runtime.expansion_frontiers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.validate_v3_active_frontier_children();

CREATE OR REPLACE FUNCTION party_runtime.reject_placement_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.host_entity_ref IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (WITH RECURSIVE chain(kind,id) AS (
    SELECT NEW.host_entity_ref->>'entity_kind', NEW.host_entity_ref->>'entity_id'
    UNION ALL SELECT p.host_entity_ref->>'entity_kind',p.host_entity_ref->>'entity_id' FROM party_runtime.entity_placements p JOIN chain c ON p.party_id=NEW.party_id AND p.entity_kind=c.kind AND p.entity_id=c.id WHERE p.host_entity_ref IS NOT NULL
  ) SELECT 1 FROM chain WHERE kind=NEW.entity_kind AND id=NEW.entity_id) THEN RAISE EXCEPTION 'attachment_graph_invalid: placement cycle'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS entity_placements_no_cycle ON party_runtime.entity_placements;
CREATE TRIGGER entity_placements_no_cycle BEFORE INSERT OR UPDATE OF host_entity_ref ON party_runtime.entity_placements FOR EACH ROW EXECUTE FUNCTION party_runtime.reject_placement_cycle();
```

### [`003_party_runtime_v3_planning.sql`](../../schemas/party-db/003_party_runtime_v3_planning.sql)

```sql
-- Target-only spatial v3 planning/execution persistence (P14).  This file is
-- deliberately absent from the production migration composition until P28.
CREATE SCHEMA IF NOT EXISTS party_runtime;

CREATE TABLE IF NOT EXISTS party_runtime.preparation_snapshots (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  planning_request_id text NOT NULL, planning_request_digest text NOT NULL,
  immutable_members_digest text NOT NULL, canonical_digest text NOT NULL,
  created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0), created_change_set_id text NOT NULL,
  UNIQUE(party_id, planning_request_id, planning_request_digest, immutable_members_digest)
);
CREATE TABLE IF NOT EXISTS party_runtime.preparation_snapshot_members (
  preparation_snapshot_id text NOT NULL REFERENCES party_runtime.preparation_snapshots(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK(ordinal >= 0), member_kind text NOT NULL CHECK(member_kind IN ('endpoint','transfer_scene')),
  source_authoring_ref jsonb NOT NULL, resolved_endpoint_snapshot jsonb,
  resolved_scene_baseline_id text REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,
  resolved_g6_instance_id text REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,
  resolved_position_id text REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  dependency_pins jsonb NOT NULL, share_mode text NOT NULL CHECK(share_mode IN ('execution_exclusive','reusable')),
  member_digest text NOT NULL, PRIMARY KEY(preparation_snapshot_id, ordinal),
  CHECK ((member_kind='endpoint') = (resolved_endpoint_snapshot IS NOT NULL AND resolved_scene_baseline_id IS NULL AND resolved_g6_instance_id IS NULL AND resolved_position_id IS NULL)),
  CHECK ((member_kind='transfer_scene') = (resolved_endpoint_snapshot IS NULL AND resolved_scene_baseline_id IS NOT NULL AND resolved_g6_instance_id IS NOT NULL AND resolved_position_id IS NOT NULL)),
  UNIQUE(preparation_snapshot_id, member_kind, dependency_pins)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_route_plans (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  journey_owner_ref jsonb NOT NULL, journey_scope text NOT NULL CHECK(journey_scope IN ('world_travel','carrier_local')),
  request_kind text NOT NULL CHECK(request_kind IN ('ordinary','rescue','repair','migration')),
  recovery_binding_id text, administrative_authorization_pins jsonb,
  planning_request_id text NOT NULL, path_query_digest text NOT NULL, option_id text NOT NULL,
  knowledge_scope text NOT NULL CHECK(knowledge_scope IN ('factual','character_known','admin')), knowledge_subject_ref jsonb,
  source_endpoint_snapshot jsonb NOT NULL, target_request jsonb, resolved_factual_target_ref jsonb,
  target_resolution_dependency_pins jsonb, intended_direction_id text,
  world_revision_id text NOT NULL, catalog_digest text NOT NULL, planning_algorithm_version text NOT NULL,
  planning_state_version bigint NOT NULL CHECK(planning_state_version >= 0), planning_context_dependency_pins jsonb NOT NULL,
  preparation_snapshot_id text REFERENCES party_runtime.preparation_snapshots(id) ON DELETE RESTRICT, preparation_snapshot_digest text,
  canonical_serialization_digest text NOT NULL, status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','superseded','retired')),
  superseded_by_plan_id text REFERENCES party_runtime.party_route_plans(id) ON DELETE RESTRICT, retired_reason_code text,
  lifecycle_state_version bigint NOT NULL DEFAULT 1 CHECK(lifecycle_state_version >= 1),
  created_change_set_id text NOT NULL, lifecycle_change_set_id text NOT NULL, created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0),
  CHECK ((target_request IS NULL) <> (intended_direction_id IS NULL)),
  CHECK ((target_request IS NULL) = (resolved_factual_target_ref IS NULL)),
  CHECK ((target_request IS NULL) = (target_resolution_dependency_pins IS NULL)),
  CHECK ((preparation_snapshot_id IS NULL) = (preparation_snapshot_digest IS NULL)),
  CHECK ((request_kind='ordinary') = (recovery_binding_id IS NULL AND administrative_authorization_pins IS NULL)),
  CHECK ((request_kind='rescue') = (recovery_binding_id IS NOT NULL AND administrative_authorization_pins IS NULL)),
  CHECK ((request_kind IN ('repair','migration')) = (recovery_binding_id IS NULL AND administrative_authorization_pins IS NOT NULL)),
  CHECK ((knowledge_scope='character_known') = (knowledge_subject_ref IS NOT NULL)),
  CHECK ((status='ready' AND superseded_by_plan_id IS NULL AND retired_reason_code IS NULL)
      OR (status='superseded' AND superseded_by_plan_id IS NOT NULL AND retired_reason_code IS NULL)
      OR (status='retired' AND superseded_by_plan_id IS NULL AND retired_reason_code IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS party_runtime.party_route_plan_steps (
  route_plan_id text NOT NULL REFERENCES party_runtime.party_route_plans(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK(ordinal >= 0), step_kind text NOT NULL CHECK(step_kind IN ('immediate_action','timed_activity','timed_traversal')),
  departure_endpoint_snapshot jsonb NOT NULL, arrival_endpoint_snapshot jsonb NOT NULL,
  static_contract_snapshot jsonb NOT NULL, PRIMARY KEY(route_plan_id, ordinal),
  CHECK(static_contract_snapshot->>'snapshot_kind'=step_kind)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_route_plan_executions (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  route_plan_id text NOT NULL UNIQUE REFERENCES party_runtime.party_route_plans(id) ON DELETE RESTRICT,
  journey_owner_ref jsonb NOT NULL, journey_scope text NOT NULL CHECK(journey_scope IN ('world_travel','carrier_local')),
  status text NOT NULL CHECK(status IN ('planned','active','waiting_at_anchor','suspended_at_scene','stranded_in_transit','completed','aborted','superseded')),
  current_step_ordinal integer CHECK(current_step_ordinal >= 0), current_endpoint_ref jsonb,
  active_travel_state_id text, active_activity_execution_id text, suspension_endpoint_ref jsonb,
  final_location_snapshot jsonb, abort_reason_code text,
  supersedes_execution_id text UNIQUE, superseded_by_execution_id text UNIQUE,
  started_at_turn bigint CHECK(started_at_turn >= 0), terminal_at_turn bigint CHECK(terminal_at_turn >= 0),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1), updated_change_set_id text NOT NULL,
  CHECK ((status='planned' AND current_step_ordinal=0 AND current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NULL AND terminal_at_turn IS NULL)
    OR (status='active' AND current_step_ordinal IS NOT NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL AND ((current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL) OR (current_endpoint_ref IS NULL AND active_travel_state_id IS NOT NULL)) )
    OR (status='waiting_at_anchor' AND current_step_ordinal IS NOT NULL AND current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL)
    OR (status='suspended_at_scene' AND current_step_ordinal IS NOT NULL AND current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref=current_endpoint_ref AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL)
    OR (status='stranded_in_transit' AND current_step_ordinal IS NOT NULL AND current_endpoint_ref IS NULL AND active_travel_state_id IS NOT NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL)
    OR (status IN ('completed','aborted','superseded') AND current_step_ordinal IS NULL AND current_endpoint_ref IS NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NOT NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NOT NULL)),
  CHECK ((status='aborted') = (abort_reason_code IS NOT NULL)),
  CHECK ((status='superseded') = (superseded_by_execution_id IS NOT NULL)),
  CHECK(terminal_at_turn IS NULL OR started_at_turn IS NULL OR terminal_at_turn >= started_at_turn)
);
ALTER TABLE party_runtime.party_route_plan_executions DROP CONSTRAINT IF EXISTS party_route_plan_executions_supersedes_fk;
ALTER TABLE party_runtime.party_route_plan_executions ADD CONSTRAINT party_route_plan_executions_supersedes_fk FOREIGN KEY(supersedes_execution_id) REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE party_runtime.party_route_plan_executions DROP CONSTRAINT IF EXISTS party_route_plan_executions_superseded_by_fk;
ALTER TABLE party_runtime.party_route_plan_executions ADD CONSTRAINT party_route_plan_executions_superseded_by_fk FOREIGN KEY(superseded_by_execution_id) REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS party_runtime.preparation_claims (
  id text PRIMARY KEY, preparation_snapshot_id text NOT NULL REFERENCES party_runtime.preparation_snapshots(id) ON DELETE RESTRICT,
  preparation_member_ordinal integer NOT NULL CHECK(preparation_member_ordinal>=0), route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  claim_status text NOT NULL CHECK(claim_status IN ('reserved','consumed','released','failed')), state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1),
  reserved_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK ((claim_status='reserved')=(terminal_change_set_id IS NULL)),
  UNIQUE(route_plan_execution_id, preparation_member_ordinal),
  FOREIGN KEY(preparation_snapshot_id,preparation_member_ordinal) REFERENCES party_runtime.preparation_snapshot_members(preparation_snapshot_id,ordinal) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS party_runtime.party_route_plan_execution_events (
  execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE CASCADE,
  event_ordinal integer NOT NULL CHECK(event_ordinal>=0),
  event_kind text NOT NULL CHECK(event_kind IN ('planned','activated','step_progressed','step_paused','step_completed','wait_started','suspended','stranded','resumed','completed','aborted','superseded')),
  from_status text, to_status text NOT NULL, step_ordinal integer NOT NULL CHECK(step_ordinal>=0),
  location_snapshot jsonb NOT NULL, causal_result_ref jsonb, change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0), PRIMARY KEY(execution_id,event_ordinal)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_action_step_runs (
  id text PRIMARY KEY, execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), attempt_ordinal integer NOT NULL CHECK(attempt_ordinal>=0),
  action_snapshot jsonb NOT NULL, departure_endpoint_snapshot jsonb NOT NULL, arrival_endpoint_snapshot jsonb NOT NULL, execution_context_snapshot jsonb NOT NULL,
  result_kind text NOT NULL CHECK(result_kind IN ('completed','blocked','failed')), result_code text NOT NULL,
  result_change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0),
  UNIQUE(execution_id,plan_step_ordinal,attempt_ordinal)
);
CREATE UNIQUE INDEX IF NOT EXISTS party_action_step_one_completed_uq ON party_runtime.party_action_step_runs(execution_id,plan_step_ordinal) WHERE result_kind='completed';

CREATE TABLE IF NOT EXISTS party_runtime.party_timed_activity_executions (
  id text PRIMARY KEY, route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), series_ordinal integer NOT NULL CHECK(series_ordinal>=0), predecessor_activity_execution_id text UNIQUE,
  activity_snapshot jsonb NOT NULL, original_total_minutes numeric NOT NULL CHECK(original_total_minutes>0 AND party_runtime.integral_numeric(original_total_minutes)),
  cumulative_elapsed_numerator numeric NOT NULL CHECK(cumulative_elapsed_numerator>=0 AND party_runtime.integral_numeric(cumulative_elapsed_numerator)), cumulative_elapsed_denominator numeric NOT NULL CHECK(cumulative_elapsed_denominator>0 AND party_runtime.integral_numeric(cumulative_elapsed_denominator)),
  remaining_time_numerator numeric NOT NULL CHECK(remaining_time_numerator>=0 AND party_runtime.integral_numeric(remaining_time_numerator)), remaining_time_denominator numeric NOT NULL CHECK(remaining_time_denominator>0 AND party_runtime.integral_numeric(remaining_time_denominator)),
  next_attempt_ordinal integer NOT NULL DEFAULT 0 CHECK(next_attempt_ordinal>=0), status text NOT NULL CHECK(status IN ('active','paused','completed','failed','aborted')),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1), updated_change_set_id text NOT NULL, terminal_change_set_id text,
  UNIQUE(route_plan_execution_id,plan_step_ordinal,series_ordinal),
  CHECK((status IN ('active','paused'))=(terminal_change_set_id IS NULL)),
  CHECK(gcd(cumulative_elapsed_numerator,cumulative_elapsed_denominator)=1), CHECK(gcd(remaining_time_numerator,remaining_time_denominator)=1), CHECK((status='completed')=(remaining_time_numerator=0))
);
ALTER TABLE party_runtime.party_timed_activity_executions DROP CONSTRAINT IF EXISTS party_activity_predecessor_fk;
ALTER TABLE party_runtime.party_timed_activity_executions ADD CONSTRAINT party_activity_predecessor_fk FOREIGN KEY(predecessor_activity_execution_id) REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX IF NOT EXISTS party_activity_one_nonterminal_uq ON party_runtime.party_timed_activity_executions(route_plan_execution_id,plan_step_ordinal) WHERE status IN ('active','paused');
CREATE TABLE IF NOT EXISTS party_runtime.party_timed_activity_attempts (
  activity_execution_id text NOT NULL REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT, attempt_ordinal integer NOT NULL CHECK(attempt_ordinal>=0),
  remaining_before_numerator numeric NOT NULL CHECK(remaining_before_numerator>0 AND party_runtime.integral_numeric(remaining_before_numerator)), remaining_before_denominator numeric NOT NULL CHECK(remaining_before_denominator>0 AND party_runtime.integral_numeric(remaining_before_denominator)), planned_time_numerator numeric NOT NULL CHECK(planned_time_numerator>0 AND party_runtime.integral_numeric(planned_time_numerator)), planned_time_denominator numeric NOT NULL CHECK(planned_time_denominator>0 AND party_runtime.integral_numeric(planned_time_denominator)), actual_time_numerator numeric NOT NULL CHECK(actual_time_numerator>=0 AND party_runtime.integral_numeric(actual_time_numerator)), actual_time_denominator numeric NOT NULL CHECK(actual_time_denominator>0 AND party_runtime.integral_numeric(actual_time_denominator)), remaining_after_numerator numeric NOT NULL CHECK(remaining_after_numerator>=0 AND party_runtime.integral_numeric(remaining_after_numerator)), remaining_after_denominator numeric NOT NULL CHECK(remaining_after_denominator>0 AND party_runtime.integral_numeric(remaining_after_denominator)), cumulative_time_before_numerator numeric NOT NULL CHECK(cumulative_time_before_numerator>=0 AND party_runtime.integral_numeric(cumulative_time_before_numerator)), cumulative_time_before_denominator numeric NOT NULL CHECK(cumulative_time_before_denominator>0 AND party_runtime.integral_numeric(cumulative_time_before_denominator)), cumulative_time_after_numerator numeric NOT NULL CHECK(cumulative_time_after_numerator>=0 AND party_runtime.integral_numeric(cumulative_time_after_numerator)), cumulative_time_after_denominator numeric NOT NULL CHECK(cumulative_time_after_denominator>0 AND party_runtime.integral_numeric(cumulative_time_after_denominator)), crossed_whole_minute_boundaries numeric NOT NULL CHECK(crossed_whole_minute_boundaries>=0 AND party_runtime.integral_numeric(crossed_whole_minute_boundaries)), clock_commit_mode text NOT NULL CHECK(clock_commit_mode IN ('direct_party_clock','shared_root_transport_clock')), synchronized_time_slice_result_id text, execution_context_snapshot jsonb NOT NULL, result_kind text NOT NULL CHECK(result_kind IN ('progressed','completed','paused','blocked','failed')), result_code text NOT NULL, dynamic_dependency_pins jsonb NOT NULL, result_change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0), PRIMARY KEY(activity_execution_id,attempt_ordinal), CHECK(gcd(remaining_before_numerator,remaining_before_denominator)=1), CHECK(gcd(planned_time_numerator,planned_time_denominator)=1), CHECK(gcd(actual_time_numerator,actual_time_denominator)=1), CHECK(gcd(remaining_after_numerator,remaining_after_denominator)=1), CHECK(gcd(cumulative_time_before_numerator,cumulative_time_before_denominator)=1), CHECK(gcd(cumulative_time_after_numerator,cumulative_time_after_denominator)=1), CHECK((clock_commit_mode='direct_party_clock')=(synchronized_time_slice_result_id IS NULL))
);

CREATE TABLE IF NOT EXISTS party_runtime.traveller_travel_states (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE, route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT, plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), movement_carrier_ref jsonb NOT NULL, segment_progress_ppm integer NOT NULL CHECK(segment_progress_ppm BETWEEN 0 AND 1000000), cumulative_actual_time_numerator numeric NOT NULL CHECK(cumulative_actual_time_numerator>=0 AND party_runtime.integral_numeric(cumulative_actual_time_numerator)), cumulative_actual_time_denominator numeric NOT NULL CHECK(cumulative_actual_time_denominator>0 AND party_runtime.integral_numeric(cumulative_actual_time_denominator)), next_interval_ordinal integer NOT NULL DEFAULT 0 CHECK(next_interval_ordinal>=0), intended_direction_id text, navigation_state text NOT NULL CHECK(navigation_state IN ('on_course','deviating','lost')), last_confirmed_endpoint_ref jsonb NOT NULL, last_dynamic_snapshot_digest text, status text NOT NULL CHECK(status IN ('active','paused_in_transit','stranded_in_transit','closed')), stranded_reason_code text, closed_result text CHECK(closed_result IN ('completed','interrupted_to_anchor','superseded')), state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1), updated_change_set_id text NOT NULL, closed_change_set_id text,
  CHECK(gcd(cumulative_actual_time_numerator,cumulative_actual_time_denominator)=1), CHECK((status='stranded_in_transit')=(stranded_reason_code IS NOT NULL)),
  CHECK((status='closed')=(closed_result IS NOT NULL AND closed_change_set_id IS NOT NULL)),
  CHECK(status<>'closed' OR (closed_result='completed' AND segment_progress_ppm=1000000) OR (closed_result IN ('interrupted_to_anchor','superseded') AND segment_progress_ppm<1000000)),
  UNIQUE(route_plan_execution_id,plan_step_ordinal)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_traversal_interval_results (
  id text PRIMARY KEY, route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT, plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), interval_ordinal integer NOT NULL CHECK(interval_ordinal>=0), progress_before_ppm integer NOT NULL CHECK(progress_before_ppm BETWEEN 0 AND 999999), planned_progress_after_ppm integer NOT NULL CHECK(planned_progress_after_ppm BETWEEN 1 AND 1000000), actual_progress_after_ppm integer NOT NULL CHECK(actual_progress_after_ppm BETWEEN 0 AND 1000000), planned_time_numerator numeric NOT NULL CHECK(planned_time_numerator>0 AND party_runtime.integral_numeric(planned_time_numerator)), planned_time_denominator numeric NOT NULL CHECK(planned_time_denominator>0 AND party_runtime.integral_numeric(planned_time_denominator)), actual_time_numerator numeric NOT NULL CHECK(actual_time_numerator>=0 AND party_runtime.integral_numeric(actual_time_numerator)), actual_time_denominator numeric NOT NULL CHECK(actual_time_denominator>0 AND party_runtime.integral_numeric(actual_time_denominator)), cumulative_time_before_numerator numeric NOT NULL CHECK(cumulative_time_before_numerator>=0 AND party_runtime.integral_numeric(cumulative_time_before_numerator)), cumulative_time_before_denominator numeric NOT NULL CHECK(cumulative_time_before_denominator>0 AND party_runtime.integral_numeric(cumulative_time_before_denominator)), cumulative_time_after_numerator numeric NOT NULL CHECK(cumulative_time_after_numerator>=0 AND party_runtime.integral_numeric(cumulative_time_after_numerator)), cumulative_time_after_denominator numeric NOT NULL CHECK(cumulative_time_after_denominator>0 AND party_runtime.integral_numeric(cumulative_time_after_denominator)), crossed_whole_minute_boundaries numeric NOT NULL CHECK(crossed_whole_minute_boundaries>=0 AND party_runtime.integral_numeric(crossed_whole_minute_boundaries)), clock_commit_mode text NOT NULL CHECK(clock_commit_mode IN ('direct_party_clock','shared_root_transport_clock')), synchronized_time_slice_result_id text, dynamic_snapshot jsonb NOT NULL, result_kind text NOT NULL CHECK(result_kind IN ('progressed','segment_completed','paused_in_transit','interrupted_at_anchor','stranded','blocked_before_progress')), result_code text NOT NULL, navigation_resolution jsonb, hazard_resolution jsonb, outcome_composition_policy_version text NOT NULL, outcome_composition_trace_digest text NOT NULL, interruption_anchor_id text, result_change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0), UNIQUE(route_plan_execution_id,plan_step_ordinal,interval_ordinal), CHECK(gcd(planned_time_numerator,planned_time_denominator)=1), CHECK(gcd(actual_time_numerator,actual_time_denominator)=1), CHECK(gcd(cumulative_time_before_numerator,cumulative_time_before_denominator)=1), CHECK(gcd(cumulative_time_after_numerator,cumulative_time_after_denominator)=1), CHECK(planned_progress_after_ppm>progress_before_ppm), CHECK(actual_progress_after_ppm BETWEEN progress_before_ppm AND planned_progress_after_ppm), CHECK((clock_commit_mode='direct_party_clock')=(synchronized_time_slice_result_id IS NULL)), CHECK((result_kind='segment_completed')=(actual_progress_after_ppm=1000000)), CHECK((result_kind='interrupted_at_anchor')=(interruption_anchor_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS party_runtime.party_recovery_transition_bindings (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  stranded_travel_state_id text NOT NULL REFERENCES party_runtime.traveller_travel_states(id) ON DELETE RESTRICT,
  source_endpoint_snapshot jsonb NOT NULL, target_endpoint_snapshot jsonb NOT NULL, template_ref jsonb NOT NULL,
  executable_cost_step_snapshot jsonb, status text NOT NULL CHECK(status IN ('active','consumed','superseded')),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1), created_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status='active')=(terminal_change_set_id IS NULL))
);
ALTER TABLE party_runtime.party_route_plans DROP CONSTRAINT IF EXISTS party_route_plans_recovery_binding_fk;
ALTER TABLE party_runtime.party_route_plans ADD CONSTRAINT party_route_plans_recovery_binding_fk FOREIGN KEY(recovery_binding_id) REFERENCES party_runtime.party_recovery_transition_bindings(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION party_runtime.v3_planning_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='party_route_plans' THEN
    IF (to_jsonb(NEW)-ARRAY['status','superseded_by_plan_id','retired_reason_code','lifecycle_state_version','lifecycle_change_set_id']) <> (to_jsonb(OLD)-ARRAY['status','superseded_by_plan_id','retired_reason_code','lifecycle_state_version','lifecycle_change_set_id']) THEN RAISE EXCEPTION 'spatial_immutable_payload_violation: route plan payload'; END IF;
    IF OLD.status<>'ready' OR NEW.status='ready' OR NEW.lifecycle_state_version<>OLD.lifecycle_state_version+1 THEN RAISE EXCEPTION 'spatial_plan_lifecycle_invalid'; END IF;
  ELSE
    RAISE EXCEPTION 'spatial_immutable_payload_violation: %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_planning_no_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'spatial_immutable_payload_violation: %', TG_TABLE_NAME; END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_claim_transition_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'spatial_claim_history_immutable'; END IF;
  IF OLD.claim_status<>'reserved' OR NEW.claim_status NOT IN ('consumed','released','failed') OR NEW.state_version<>OLD.state_version+1 OR NEW.terminal_change_set_id IS NULL THEN
    RAISE EXCEPTION 'spatial_preparation_claim_transition_invalid';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['claim_status','state_version','terminal_change_set_id']) <> (to_jsonb(OLD)-ARRAY['claim_status','state_version','terminal_change_set_id']) THEN RAISE EXCEPTION 'spatial_preparation_claim_immutable'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_plan_step_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan_id text:=NEW.route_plan_id; n integer; max_ordinal integer;
BEGIN
  SELECT count(*),max(ordinal) INTO n,max_ordinal FROM party_runtime.party_route_plan_steps WHERE route_plan_id=plan_id;
  IF n=0 OR max_ordinal<>n-1 OR EXISTS(SELECT 1 FROM party_runtime.party_route_plan_steps a JOIN party_runtime.party_route_plan_steps b ON b.route_plan_id=a.route_plan_id AND b.ordinal=a.ordinal+1 WHERE a.route_plan_id=plan_id AND a.arrival_endpoint_snapshot<>b.departure_endpoint_snapshot) THEN RAISE EXCEPTION 'spatial_plan_step_continuity_invalid'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'spatial_append_only_history_violation: %', TG_TABLE_NAME; END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_recovery_binding_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_endpoint_snapshot->>'endpoint_kind'<>'stranded_state' OR NEW.source_endpoint_snapshot->>'endpoint_id'<>NEW.stranded_travel_state_id THEN RAISE EXCEPTION 'spatial_recovery_binding_invalid: exact stranded source'; END IF;
  IF NOT EXISTS(SELECT 1 FROM party_runtime.traveller_travel_states s JOIN party_runtime.party_route_plan_executions e ON e.id=s.route_plan_execution_id WHERE s.id=NEW.stranded_travel_state_id AND s.party_id=NEW.party_id AND s.status='stranded_in_transit' AND e.status='stranded_in_transit') THEN RAISE EXCEPTION 'spatial_recovery_binding_invalid: stranded state'; END IF;
  IF NEW.source_endpoint_snapshot<>NEW.target_endpoint_snapshot AND NEW.executable_cost_step_snapshot IS NULL THEN RAISE EXCEPTION 'spatial_recovery_binding_invalid: missing cost'; END IF;
  IF NEW.source_endpoint_snapshot=NEW.target_endpoint_snapshot AND NEW.executable_cost_step_snapshot IS NOT NULL THEN RAISE EXCEPTION 'spatial_recovery_binding_invalid: unexpected cost'; END IF;
  IF TG_OP='UPDATE' AND (OLD.status<>'active' OR NEW.status NOT IN ('consumed','superseded') OR NEW.state_version<>OLD.state_version+1 OR NEW.terminal_change_set_id IS NULL) THEN RAISE EXCEPTION 'spatial_recovery_binding_transition_invalid'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_event_causal_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE step_kind text; actual_change_set text; actual_idempotency text; actual_kind text; causal_id text; causal_kind text; is_final boolean; positive_nonterminal boolean;
BEGIN
  IF NEW.event_kind NOT IN ('step_progressed','step_paused','step_completed','wait_started','suspended','stranded','completed') THEN RETURN NEW; END IF;
  causal_id:=NEW.causal_result_ref->>'entity_id'; causal_kind:=NEW.causal_result_ref->>'entity_kind';
  SELECT s.step_kind INTO step_kind FROM party_runtime.party_route_plan_executions e JOIN party_runtime.party_route_plan_steps s ON s.route_plan_id=e.route_plan_id AND s.ordinal=NEW.step_ordinal WHERE e.id=NEW.execution_id;
  SELECT NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions e JOIN party_runtime.party_route_plan_steps next_step ON next_step.route_plan_id=e.route_plan_id AND next_step.ordinal=NEW.step_ordinal+1 WHERE e.id=NEW.execution_id) INTO is_final;
  IF step_kind='immediate_action' AND causal_kind='party_action_step_run' THEN SELECT result_change_set_id,idempotency_record_id,result_kind,false INTO actual_change_set,actual_idempotency,actual_kind,positive_nonterminal FROM party_runtime.party_action_step_runs WHERE id=causal_id AND execution_id=NEW.execution_id AND plan_step_ordinal=NEW.step_ordinal;
  ELSIF step_kind='timed_activity' AND causal_kind='party_timed_activity_attempt' THEN SELECT a.result_change_set_id,a.idempotency_record_id,a.result_kind,(a.result_kind='progressed' AND a.actual_time_numerator>0 AND a.remaining_after_numerator>0) INTO actual_change_set,actual_idempotency,actual_kind,positive_nonterminal FROM party_runtime.party_timed_activity_attempts a JOIN party_runtime.party_timed_activity_executions x ON x.id=a.activity_execution_id WHERE a.activity_execution_id=causal_id AND a.attempt_ordinal=(NEW.causal_result_ref->>'attempt_ordinal')::integer AND x.route_plan_execution_id=NEW.execution_id AND x.plan_step_ordinal=NEW.step_ordinal;
  ELSIF step_kind='timed_traversal' AND causal_kind='party_traversal_interval_result' THEN SELECT result_change_set_id,idempotency_record_id,result_kind,(result_kind='progressed' AND actual_progress_after_ppm>progress_before_ppm AND actual_progress_after_ppm<1000000) INTO actual_change_set,actual_idempotency,actual_kind,positive_nonterminal FROM party_runtime.party_traversal_interval_results WHERE id=causal_id AND route_plan_execution_id=NEW.execution_id AND plan_step_ordinal=NEW.step_ordinal;
  ELSE RAISE EXCEPTION 'spatial_execution_event_causal_invalid: typed result'; END IF;
  IF actual_change_set IS NULL OR actual_change_set<>NEW.change_set_id OR actual_idempotency<>NEW.idempotency_record_id THEN RAISE EXCEPTION 'spatial_execution_event_causal_invalid: change set or idempotency'; END IF;
  IF NEW.event_kind='step_progressed' AND NOT positive_nonterminal THEN RAISE EXCEPTION 'spatial_execution_event_causal_invalid: positive nonterminal progress'; END IF;
  IF NEW.event_kind='step_paused' AND NOT ((step_kind='timed_activity' AND actual_kind='paused') OR (step_kind='timed_traversal' AND actual_kind='paused_in_transit')) THEN RAISE EXCEPTION 'spatial_execution_event_causal_invalid: paused result'; END IF;
  IF NEW.event_kind='step_completed' AND (is_final OR actual_kind NOT IN ('completed','segment_completed')) THEN RAISE EXCEPTION 'spatial_execution_event_causal_invalid: nonfinal completed step'; END IF;
  IF NEW.event_kind='completed' AND (NOT is_final OR actual_kind NOT IN ('completed','segment_completed')) THEN RAISE EXCEPTION 'spatial_execution_event_causal_invalid: final completed step'; END IF;
  IF NEW.event_kind='wait_started' AND actual_kind NOT IN ('blocked','failed','blocked_before_progress') THEN RAISE EXCEPTION 'spatial_execution_event_causal_invalid: waiting result'; END IF;
  IF NEW.event_kind='suspended' AND actual_kind<>'interrupted_at_anchor' THEN RAISE EXCEPTION 'spatial_execution_event_causal_invalid: suspension result'; END IF;
  IF NEW.event_kind='stranded' AND actual_kind<>'stranded' THEN RAISE EXCEPTION 'spatial_execution_event_causal_invalid: stranded result'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_execution_transition_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed boolean; expected_kind text;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'planned' THEN RAISE EXCEPTION 'spatial_execution_transition_invalid: creation must be planned'; END IF;
    RETURN NEW;
  END IF;
  -- The execution row is the sole mutable journey-state projection.  Every
  -- update, including an active -> active causal step, is a new version and
  -- is coupled by the deferred check below to one append-only event.
  IF NEW.state_version<>OLD.state_version+1 THEN RAISE EXCEPTION 'spatial_execution_transition_invalid: state version'; END IF;
  IF NEW.status=OLD.status THEN
    IF (to_jsonb(NEW)-ARRAY['state_version','current_step_ordinal','current_endpoint_ref','active_travel_state_id','active_activity_execution_id','updated_change_set_id'])<>(to_jsonb(OLD)-ARRAY['state_version','current_step_ordinal','current_endpoint_ref','active_travel_state_id','active_activity_execution_id','updated_change_set_id']) THEN RAISE EXCEPTION 'spatial_execution_transition_invalid: same-status immutable fields'; END IF;
    RETURN NEW;
  END IF;
  allowed=(OLD.status='planned' AND NEW.status IN ('active','aborted')) OR (OLD.status='active' AND NEW.status IN ('waiting_at_anchor','suspended_at_scene','stranded_in_transit','completed','aborted','superseded')) OR (OLD.status='waiting_at_anchor' AND NEW.status IN ('active','aborted','superseded')) OR (OLD.status='suspended_at_scene' AND NEW.status IN ('aborted','superseded')) OR (OLD.status='stranded_in_transit' AND NEW.status='superseded');
  IF NOT allowed THEN RAISE EXCEPTION 'spatial_execution_transition_invalid: % -> %',OLD.status,NEW.status; END IF;
  IF OLD.status='active' AND NEW.status='superseded' AND OLD.active_travel_state_id IS NOT NULL THEN RAISE EXCEPTION 'spatial_execution_transition_invalid: raw in-transit supersession'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_execution_event_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ok boolean;
BEGIN
  IF NEW.event_ordinal=0 THEN
    IF NEW.event_kind<>'planned' OR NEW.from_status IS NOT NULL OR NEW.to_status<>'planned' OR NEW.causal_result_ref IS NOT NULL THEN RAISE EXCEPTION 'spatial_execution_event_invalid: planned'; END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_execution_events e WHERE e.execution_id=NEW.execution_id AND e.event_ordinal=NEW.event_ordinal-1) THEN RAISE EXCEPTION 'spatial_execution_event_invalid: noncontiguous ordinal'; END IF;
    ok=(NEW.event_kind='activated' AND NEW.from_status='planned' AND NEW.to_status='active' AND NEW.causal_result_ref IS NULL) OR (NEW.event_kind='resumed' AND NEW.from_status='waiting_at_anchor' AND NEW.to_status='active' AND NEW.causal_result_ref IS NULL) OR (NEW.event_kind='wait_started' AND NEW.from_status='active' AND NEW.to_status='waiting_at_anchor' AND NEW.causal_result_ref IS NOT NULL) OR (NEW.event_kind='suspended' AND NEW.from_status='active' AND NEW.to_status='suspended_at_scene' AND NEW.causal_result_ref IS NOT NULL) OR (NEW.event_kind='stranded' AND NEW.from_status='active' AND NEW.to_status='stranded_in_transit' AND NEW.causal_result_ref IS NOT NULL) OR (NEW.event_kind='completed' AND NEW.from_status='active' AND NEW.to_status='completed' AND NEW.causal_result_ref IS NOT NULL) OR (NEW.event_kind='aborted' AND NEW.from_status IN ('planned','active','waiting_at_anchor','suspended_at_scene') AND NEW.to_status='aborted') OR (NEW.event_kind='superseded' AND NEW.from_status IN ('active','waiting_at_anchor','suspended_at_scene','stranded_in_transit') AND NEW.to_status='superseded') OR (NEW.event_kind IN ('step_progressed','step_paused','step_completed') AND NEW.from_status='active' AND NEW.to_status='active' AND NEW.causal_result_ref IS NOT NULL);
    IF NOT ok THEN RAISE EXCEPTION 'spatial_execution_event_invalid: mapping'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_execution_event_ledger_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_execution party_runtime.party_route_plan_executions%ROWTYPE; latest_event party_runtime.party_route_plan_execution_events%ROWTYPE; expected_step integer;
BEGIN
  SELECT * INTO current_execution FROM party_runtime.party_route_plan_executions WHERE id=NEW.execution_id;
  SELECT * INTO latest_event FROM party_runtime.party_route_plan_execution_events WHERE execution_id=NEW.execution_id ORDER BY event_ordinal DESC LIMIT 1;
  IF latest_event.execution_id IS NULL OR EXISTS(SELECT 1 FROM party_runtime.party_route_plan_execution_events e JOIN party_runtime.party_route_plan_execution_events prior ON prior.execution_id=e.execution_id AND prior.event_ordinal=e.event_ordinal-1 WHERE e.execution_id=NEW.execution_id AND e.event_ordinal>0 AND e.from_status<>prior.to_status) THEN RAISE EXCEPTION 'spatial_execution_event_ledger_invalid: status chain'; END IF;
  IF current_execution.state_version<>latest_event.event_ordinal+1 OR current_execution.updated_change_set_id<>latest_event.change_set_id OR current_execution.status<>latest_event.to_status THEN RAISE EXCEPTION 'spatial_execution_event_ledger_invalid: current version/status/change set'; END IF;
  IF current_execution.status IN ('completed','aborted','superseded') THEN
    IF current_execution.current_step_ordinal IS NOT NULL THEN RAISE EXCEPTION 'spatial_execution_event_ledger_invalid: terminal step'; END IF;
  ELSE
    expected_step=latest_event.step_ordinal+CASE WHEN latest_event.event_kind='step_completed' THEN 1 ELSE 0 END;
    IF current_execution.current_step_ordinal<>expected_step THEN RAISE EXCEPTION 'spatial_execution_event_ledger_invalid: current step'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_planning_deferred_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e party_runtime.party_route_plan_executions%ROWTYPE; plan_row party_runtime.party_route_plans%ROWTYPE; exclusive_member boolean; step_kind text;
BEGIN
  IF TG_TABLE_NAME='party_route_plan_executions' THEN
    SELECT * INTO plan_row FROM party_runtime.party_route_plans WHERE id=NEW.route_plan_id;
    IF plan_row.party_id<>NEW.party_id OR plan_row.journey_owner_ref<>NEW.journey_owner_ref OR plan_row.journey_scope<>NEW.journey_scope THEN RAISE EXCEPTION 'spatial_party_or_plan_mismatch'; END IF;
    IF NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_execution_events x WHERE x.execution_id=NEW.id AND x.event_ordinal=0 AND (TG_OP<>'INSERT' OR x.change_set_id=NEW.updated_change_set_id)) THEN RAISE EXCEPTION 'spatial_execution_event_missing: planned'; END IF;
    IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_execution_events x WHERE x.execution_id=NEW.id AND x.event_ordinal=NEW.state_version-1 AND x.from_status=OLD.status AND x.to_status=NEW.status AND x.change_set_id=NEW.updated_change_set_id AND (NEW.status<>OLD.status OR x.step_ordinal=OLD.current_step_ordinal)) THEN RAISE EXCEPTION 'spatial_execution_event_missing: versioned transition'; END IF;
    IF TG_OP='UPDATE' AND NEW.status=OLD.status AND NEW.current_step_ordinal<>OLD.current_step_ordinal AND (NEW.current_step_ordinal<>OLD.current_step_ordinal+1 OR NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_execution_events x WHERE x.execution_id=NEW.id AND x.from_status='active' AND x.to_status='active' AND x.event_kind='step_completed' AND x.step_ordinal=OLD.current_step_ordinal AND x.change_set_id=NEW.updated_change_set_id)) THEN RAISE EXCEPTION 'spatial_execution_state_invalid: same-status step advance'; END IF;
    IF NEW.current_endpoint_ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_steps s WHERE s.route_plan_id=NEW.route_plan_id AND s.ordinal=NEW.current_step_ordinal AND NEW.current_endpoint_ref IN (s.departure_endpoint_snapshot,s.arrival_endpoint_snapshot)) THEN RAISE EXCEPTION 'spatial_execution_state_invalid: endpoint is not an exact step endpoint'; END IF;
    IF plan_row.request_kind='rescue' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_recovery_transition_bindings b JOIN party_runtime.party_route_plan_steps s ON s.route_plan_id=plan_row.id AND s.ordinal=0 JOIN party_runtime.party_route_plan_executions current_execution ON current_execution.id=NEW.id WHERE b.id=plan_row.recovery_binding_id AND b.party_id=plan_row.party_id AND b.status=CASE WHEN current_execution.status='completed' THEN 'consumed' ELSE 'active' END AND b.source_endpoint_snapshot=plan_row.source_endpoint_snapshot AND plan_row.target_request=b.target_endpoint_snapshot AND plan_row.resolved_factual_target_ref=b.target_endpoint_snapshot AND s.departure_endpoint_snapshot=b.source_endpoint_snapshot AND s.arrival_endpoint_snapshot=b.target_endpoint_snapshot AND (b.executable_cost_step_snapshot IS NULL OR s.static_contract_snapshot=b.executable_cost_step_snapshot)) THEN RAISE EXCEPTION 'spatial_recovery_plan_invalid: exact binding target/cost'; END IF;
    IF plan_row.request_kind='rescue' AND EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions current_execution WHERE current_execution.id=NEW.id AND current_execution.status='completed') AND NOT EXISTS(SELECT 1 FROM party_runtime.party_recovery_transition_bindings b JOIN party_runtime.party_route_plan_executions current_execution ON current_execution.id=NEW.id WHERE b.id=plan_row.recovery_binding_id AND b.status='consumed' AND b.terminal_change_set_id=current_execution.updated_change_set_id) THEN RAISE EXCEPTION 'spatial_recovery_plan_invalid: successful binding must be consumed'; END IF;
    IF NEW.status='superseded' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions s WHERE s.id=NEW.superseded_by_execution_id AND s.supersedes_execution_id=NEW.id) THEN RAISE EXCEPTION 'spatial_supersession_invalid: reciprocal successor'; END IF;
    IF NEW.supersedes_execution_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions q WHERE q.id=NEW.supersedes_execution_id AND q.superseded_by_execution_id=NEW.id AND q.party_id=NEW.party_id) THEN RAISE EXCEPTION 'spatial_supersession_invalid: reciprocal predecessor'; END IF;
    IF NEW.supersedes_execution_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions predecessor JOIN party_runtime.party_route_plans successor_plan ON successor_plan.id=NEW.route_plan_id WHERE predecessor.id=NEW.supersedes_execution_id AND successor_plan.source_endpoint_snapshot=predecessor.final_location_snapshot->'handoff_endpoint_snapshot') THEN RAISE EXCEPTION 'spatial_supersession_invalid: exact handoff source'; END IF;
    IF NEW.supersedes_execution_id IS NOT NULL AND EXISTS(WITH RECURSIVE chain(id) AS (SELECT NEW.supersedes_execution_id UNION ALL SELECT q.supersedes_execution_id FROM party_runtime.party_route_plan_executions q JOIN chain c ON q.id=c.id WHERE q.supersedes_execution_id IS NOT NULL) SELECT 1 FROM chain WHERE id=NEW.id) THEN RAISE EXCEPTION 'spatial_supersession_invalid: cycle'; END IF;
    IF NEW.status='active' AND EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions current_execution WHERE current_execution.id=NEW.id AND current_execution.status='active') THEN
      SELECT s.step_kind INTO step_kind FROM party_runtime.party_route_plan_steps s WHERE s.route_plan_id=NEW.route_plan_id AND s.ordinal=NEW.current_step_ordinal;
      IF step_kind='immediate_action' AND (NEW.current_endpoint_ref IS NULL OR NEW.active_activity_execution_id IS NOT NULL OR NEW.active_travel_state_id IS NOT NULL) THEN RAISE EXCEPTION 'spatial_execution_state_invalid: action fields'; END IF;
      IF step_kind='timed_activity' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_timed_activity_executions a WHERE a.id=NEW.active_activity_execution_id AND a.route_plan_execution_id=NEW.id AND a.plan_step_ordinal=NEW.current_step_ordinal AND a.status IN ('active','paused')) THEN RAISE EXCEPTION 'spatial_execution_state_invalid: activity reference'; END IF;
      IF step_kind='timed_traversal' AND NOT EXISTS(SELECT 1 FROM party_runtime.traveller_travel_states t WHERE t.id=NEW.active_travel_state_id AND t.route_plan_execution_id=NEW.id AND t.plan_step_ordinal=NEW.current_step_ordinal AND t.status IN ('active','paused_in_transit')) THEN RAISE EXCEPTION 'spatial_execution_state_invalid: travel reference'; END IF;
    ELSIF NEW.status='stranded_in_transit' AND NOT EXISTS(SELECT 1 FROM party_runtime.traveller_travel_states t WHERE t.id=NEW.active_travel_state_id AND t.route_plan_execution_id=NEW.id AND t.plan_step_ordinal=NEW.current_step_ordinal AND t.status='stranded_in_transit') THEN RAISE EXCEPTION 'spatial_execution_state_invalid: stranded reference'; END IF;
  ELSIF TG_TABLE_NAME='preparation_claims' THEN
    SELECT * INTO e FROM party_runtime.party_route_plan_executions WHERE id=NEW.route_plan_execution_id;
    SELECT m.share_mode='execution_exclusive' INTO exclusive_member FROM party_runtime.preparation_snapshot_members m WHERE m.preparation_snapshot_id=NEW.preparation_snapshot_id AND m.ordinal=NEW.preparation_member_ordinal;
    IF exclusive_member IS NULL THEN RAISE EXCEPTION 'spatial_preparation_claim_invalid: member'; END IF;
    IF NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plans pr WHERE pr.id=e.route_plan_id AND pr.preparation_snapshot_id=NEW.preparation_snapshot_id) THEN RAISE EXCEPTION 'spatial_preparation_claim_invalid: plan pin'; END IF;
    IF exclusive_member AND NEW.claim_status='reserved' AND EXISTS(SELECT 1 FROM party_runtime.preparation_claims c WHERE c.preparation_snapshot_id=NEW.preparation_snapshot_id AND c.preparation_member_ordinal=NEW.preparation_member_ordinal AND c.claim_status='reserved' AND c.id<>NEW.id) THEN RAISE EXCEPTION 'spatial_preparation_claim_conflict'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v3_plan_immutable ON party_runtime.party_route_plans;
CREATE TRIGGER v3_plan_immutable BEFORE UPDATE ON party_runtime.party_route_plans FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_immutable();
DROP TRIGGER IF EXISTS v3_plan_step_immutable ON party_runtime.party_route_plan_steps;
CREATE TRIGGER v3_plan_step_immutable BEFORE UPDATE OR DELETE ON party_runtime.party_route_plan_steps FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_no_update();
DROP TRIGGER IF EXISTS v3_preparation_snapshot_immutable ON party_runtime.preparation_snapshots;
CREATE TRIGGER v3_preparation_snapshot_immutable BEFORE UPDATE OR DELETE ON party_runtime.preparation_snapshots FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_no_update();
DROP TRIGGER IF EXISTS v3_preparation_member_immutable ON party_runtime.preparation_snapshot_members;
CREATE TRIGGER v3_preparation_member_immutable BEFORE UPDATE OR DELETE ON party_runtime.preparation_snapshot_members FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_no_update();
DROP TRIGGER IF EXISTS v3_claim_transition ON party_runtime.preparation_claims;
CREATE TRIGGER v3_claim_transition BEFORE UPDATE OR DELETE ON party_runtime.preparation_claims FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_claim_transition_valid();
DROP TRIGGER IF EXISTS v3_plan_step_continuity ON party_runtime.party_route_plan_steps;
CREATE CONSTRAINT TRIGGER v3_plan_step_continuity AFTER INSERT ON party_runtime.party_route_plan_steps DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_plan_step_integrity();
DROP TRIGGER IF EXISTS v3_execution_transition ON party_runtime.party_route_plan_executions;
CREATE TRIGGER v3_execution_transition BEFORE INSERT OR UPDATE ON party_runtime.party_route_plan_executions FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_execution_transition_valid();
DROP TRIGGER IF EXISTS v3_execution_event_mapping ON party_runtime.party_route_plan_execution_events;
CREATE TRIGGER v3_execution_event_mapping BEFORE INSERT ON party_runtime.party_route_plan_execution_events FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_execution_event_valid();
DROP TRIGGER IF EXISTS v3_execution_event_causal ON party_runtime.party_route_plan_execution_events;
CREATE CONSTRAINT TRIGGER v3_execution_event_causal AFTER INSERT ON party_runtime.party_route_plan_execution_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_event_causal_integrity();
DROP TRIGGER IF EXISTS v3_execution_event_ledger ON party_runtime.party_route_plan_execution_events;
CREATE CONSTRAINT TRIGGER v3_execution_event_ledger AFTER INSERT ON party_runtime.party_route_plan_execution_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_execution_event_ledger_integrity();
DROP TRIGGER IF EXISTS v3_execution_event_append_only ON party_runtime.party_route_plan_execution_events;
CREATE TRIGGER v3_execution_event_append_only BEFORE UPDATE OR DELETE ON party_runtime.party_route_plan_execution_events FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_append_only();
DROP TRIGGER IF EXISTS v3_action_run_append_only ON party_runtime.party_action_step_runs;
CREATE TRIGGER v3_action_run_append_only BEFORE UPDATE OR DELETE ON party_runtime.party_action_step_runs FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_append_only();
DROP TRIGGER IF EXISTS v3_activity_attempt_append_only ON party_runtime.party_timed_activity_attempts;
CREATE TRIGGER v3_activity_attempt_append_only BEFORE UPDATE OR DELETE ON party_runtime.party_timed_activity_attempts FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_append_only();
DROP TRIGGER IF EXISTS v3_interval_append_only ON party_runtime.party_traversal_interval_results;
CREATE TRIGGER v3_interval_append_only BEFORE UPDATE OR DELETE ON party_runtime.party_traversal_interval_results FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_append_only();
DROP TRIGGER IF EXISTS v3_recovery_binding_transition ON party_runtime.party_recovery_transition_bindings;
CREATE TRIGGER v3_recovery_binding_transition BEFORE INSERT OR UPDATE ON party_runtime.party_recovery_transition_bindings FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_recovery_binding_valid();
DROP TRIGGER IF EXISTS v3_execution_integrity ON party_runtime.party_route_plan_executions;
CREATE CONSTRAINT TRIGGER v3_execution_integrity AFTER INSERT OR UPDATE ON party_runtime.party_route_plan_executions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_deferred_integrity();
DROP TRIGGER IF EXISTS v3_claim_integrity ON party_runtime.preparation_claims;
CREATE CONSTRAINT TRIGGER v3_claim_integrity AFTER INSERT OR UPDATE ON party_runtime.preparation_claims DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_deferred_integrity();
```

### [`004_party_runtime_v3_journeys.sql`](../../schemas/party-db/004_party_runtime_v3_journeys.sql)

```sql
-- Target-only spatial v3 journey carriers, exact time and commit envelopes.
-- It is deliberately absent from the production migration composition until P28.
CREATE SCHEMA IF NOT EXISTS party_runtime;

CREATE TABLE IF NOT EXISTS party_runtime.party_v3_change_sets (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  operation_kind text NOT NULL, expected_state_version_set_digest text NOT NULL,
  expected_state_version_set jsonb NOT NULL CHECK(jsonb_typeof(expected_state_version_set) = 'array'),
  committed_state_version_set_digest text NOT NULL, write_plan_digest text NOT NULL,
  parent_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0), committed_at_turn bigint NOT NULL CHECK(committed_at_turn >= 0),
  UNIQUE(party_id, operation_kind, write_plan_digest)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_change_set_write_plans (
  change_set_id text PRIMARY KEY REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  canonical_write_plan jsonb NOT NULL, canonical_write_plan_digest text NOT NULL,
  expected_state_version_set jsonb NOT NULL, expected_state_version_set_digest text NOT NULL, lock_key_set jsonb NOT NULL,
  CHECK(jsonb_typeof(expected_state_version_set) = 'array'), CHECK(jsonb_typeof(lock_key_set) = 'array')
);

CREATE TABLE IF NOT EXISTS party_runtime.party_command_idempotency (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  operation_kind text NOT NULL, idempotency_key text NOT NULL, parent_record_id text REFERENCES party_runtime.party_command_idempotency(id) ON DELETE RESTRICT,
  child_ordinal integer CHECK(child_ordinal >= 0), canonical_input_digest text NOT NULL, expected_state_version_set_digest text NOT NULL,
  status text NOT NULL CHECK(status IN ('leased','committed','failed_terminal')), lease_token text, lease_expires_at timestamptz,
  result_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  terminal_failure_code text, terminal_failure_digest text,
  created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0), finalized_at_turn bigint,
  UNIQUE(party_id, operation_kind, idempotency_key),
  UNIQUE(parent_record_id, child_ordinal),
  CHECK((parent_record_id IS NULL) = (child_ordinal IS NULL)),
  CHECK((status = 'leased') = (result_change_set_id IS NULL AND terminal_failure_code IS NULL AND terminal_failure_digest IS NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK((status = 'committed') = (result_change_set_id IS NOT NULL AND terminal_failure_code IS NULL AND terminal_failure_digest IS NULL AND finalized_at_turn IS NOT NULL)),
  CHECK((status = 'failed_terminal') = (result_change_set_id IS NULL AND terminal_failure_code IS NOT NULL AND terminal_failure_digest IS NOT NULL AND finalized_at_turn IS NOT NULL))
);
ALTER TABLE party_runtime.party_command_idempotency ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1);

CREATE TABLE IF NOT EXISTS party_runtime.party_cohorts (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  pace_rule_ref jsonb NOT NULL, status text NOT NULL CHECK(status IN ('active','split','merged','retired')),
  state_version bigint NOT NULL CHECK(state_version >= 0), created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);

CREATE TABLE IF NOT EXISTS party_runtime.party_cohort_memberships (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  cohort_id text NOT NULL REFERENCES party_runtime.party_cohorts(id) ON DELETE RESTRICT, actor_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('active','left','split','merged')), state_version bigint NOT NULL CHECK(state_version >= 0),
  joined_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS party_cohort_membership_actor_active_uq ON party_runtime.party_cohort_memberships(party_id, actor_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS party_runtime.party_carrier_attachments (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  subject_kind text NOT NULL CHECK(subject_kind IN ('actor','cohort')), subject_id text NOT NULL,
  carrier_kind text NOT NULL CHECK(carrier_kind IN ('cohort','transport')), carrier_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('active','detached')), state_version bigint NOT NULL CHECK(state_version >= 0),
  attached_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK(NOT (subject_kind = carrier_kind AND subject_id = carrier_id)),
  CHECK((subject_kind = 'actor' AND carrier_kind IN ('cohort','transport')) OR (subject_kind = 'cohort' AND carrier_kind = 'transport')),
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS party_carrier_attachment_subject_active_uq ON party_runtime.party_carrier_attachments(party_id, subject_kind, subject_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS party_runtime.party_journey_locations (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  owner_kind text NOT NULL CHECK(owner_kind IN ('actor','cohort','transport')), owner_id text NOT NULL,
  location_kind text NOT NULL CHECK(location_kind IN ('scene','transit_anchor','in_transit')),
  scene_position_id text REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  transit_anchor_id text REFERENCES party_runtime.party_transit_anchors(id) ON DELETE RESTRICT,
  travel_state_id text REFERENCES party_runtime.traveller_travel_states(id) ON DELETE RESTRICT,
  state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL,
  CHECK((location_kind = 'scene') = (scene_position_id IS NOT NULL AND transit_anchor_id IS NULL AND travel_state_id IS NULL)),
  CHECK((location_kind = 'transit_anchor') = (scene_position_id IS NULL AND transit_anchor_id IS NOT NULL AND travel_state_id IS NULL)),
  CHECK((location_kind = 'in_transit') = (scene_position_id IS NULL AND transit_anchor_id IS NULL AND travel_state_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS party_journey_location_root_owner_uq ON party_runtime.party_journey_locations(party_id, owner_kind, owner_id);

CREATE TABLE IF NOT EXISTS party_runtime.party_actor_carrier_positions (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_id text NOT NULL, root_carrier_kind text NOT NULL CHECK(root_carrier_kind IN ('cohort','transport')), root_carrier_id text NOT NULL,
  scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,
  g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,
  position_node_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('active','cleared')), state_version bigint NOT NULL CHECK(state_version >= 0), created_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS party_actor_carrier_position_active_uq ON party_runtime.party_actor_carrier_positions(party_id, actor_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS party_runtime.party_clocks (
  party_id text PRIMARY KEY REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  whole_minutes numeric NOT NULL CHECK(whole_minutes >= 0 AND party_runtime.integral_numeric(whole_minutes)), subminute_numerator numeric NOT NULL CHECK(subminute_numerator >= 0 AND party_runtime.integral_numeric(subminute_numerator)), subminute_denominator numeric NOT NULL CHECK(subminute_denominator > 0 AND party_runtime.integral_numeric(subminute_denominator)),
  clock_owner_kind text NOT NULL CHECK(clock_owner_kind IN ('party','cohort','transport')), clock_owner_id text,
  state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL,
  CHECK(subminute_numerator < subminute_denominator), CHECK(gcd(subminute_numerator, subminute_denominator) = 1),
  CHECK((clock_owner_kind = 'party') = (clock_owner_id IS NULL))
);

CREATE TABLE IF NOT EXISTS party_runtime.party_clock_owner_handoffs (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  old_owner_kind text NOT NULL CHECK(old_owner_kind IN ('party','cohort','transport')), old_owner_id text,
  new_owner_kind text NOT NULL CHECK(new_owner_kind IN ('party','cohort','transport')), new_owner_id text,
  effective_whole_minutes numeric NOT NULL CHECK(effective_whole_minutes >= 0 AND party_runtime.integral_numeric(effective_whole_minutes)), effective_subminute_numerator numeric NOT NULL CHECK(effective_subminute_numerator >= 0 AND party_runtime.integral_numeric(effective_subminute_numerator)), effective_subminute_denominator numeric NOT NULL CHECK(effective_subminute_denominator > 0 AND party_runtime.integral_numeric(effective_subminute_denominator)),
  change_set_id text NOT NULL REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  CHECK(effective_subminute_numerator < effective_subminute_denominator), CHECK(gcd(effective_subminute_numerator,effective_subminute_denominator)=1),
  CHECK((old_owner_kind='party')=(old_owner_id IS NULL)), CHECK((new_owner_kind='party')=(new_owner_id IS NULL)),
  UNIQUE(party_id, change_set_id), UNIQUE(party_id, effective_whole_minutes, effective_subminute_numerator, effective_subminute_denominator, new_owner_kind, new_owner_id)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_synchronized_time_slices (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  root_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  root_travel_state_id text NOT NULL REFERENCES party_runtime.traveller_travel_states(id) ON DELETE RESTRICT,
  clock_owner_kind text NOT NULL CHECK(clock_owner_kind IN ('cohort','transport')), clock_owner_id text NOT NULL,
  elapsed_numerator numeric NOT NULL CHECK(elapsed_numerator > 0 AND party_runtime.integral_numeric(elapsed_numerator)), elapsed_denominator numeric NOT NULL CHECK(elapsed_denominator > 0 AND party_runtime.integral_numeric(elapsed_denominator)),
  clock_before_whole_minutes numeric NOT NULL CHECK(clock_before_whole_minutes >= 0 AND party_runtime.integral_numeric(clock_before_whole_minutes)), clock_before_subminute_numerator numeric NOT NULL CHECK(clock_before_subminute_numerator >= 0 AND party_runtime.integral_numeric(clock_before_subminute_numerator)), clock_before_subminute_denominator numeric NOT NULL CHECK(clock_before_subminute_denominator > 0 AND party_runtime.integral_numeric(clock_before_subminute_denominator)),
  clock_after_whole_minutes numeric NOT NULL CHECK(clock_after_whole_minutes >= 0 AND party_runtime.integral_numeric(clock_after_whole_minutes)), clock_after_subminute_numerator numeric NOT NULL CHECK(clock_after_subminute_numerator >= 0 AND party_runtime.integral_numeric(clock_after_subminute_numerator)), clock_after_subminute_denominator numeric NOT NULL CHECK(clock_after_subminute_denominator > 0 AND party_runtime.integral_numeric(clock_after_subminute_denominator)),
  crossed_whole_minute_boundaries numeric NOT NULL CHECK(crossed_whole_minute_boundaries >= 0 AND party_runtime.integral_numeric(crossed_whole_minute_boundaries)), change_set_id text NOT NULL REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  idempotency_record_id text NOT NULL REFERENCES party_runtime.party_command_idempotency(id) ON DELETE RESTRICT,
  CHECK(gcd(elapsed_numerator, elapsed_denominator) = 1), CHECK(clock_before_subminute_numerator < clock_before_subminute_denominator), CHECK(gcd(clock_before_subminute_numerator, clock_before_subminute_denominator) = 1), CHECK(clock_after_subminute_numerator < clock_after_subminute_denominator), CHECK(gcd(clock_after_subminute_numerator, clock_after_subminute_denominator) = 1),
  UNIQUE(root_execution_id, change_set_id), UNIQUE(change_set_id)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_synchronized_time_slice_results (
  id text PRIMARY KEY, slice_id text NOT NULL REFERENCES party_runtime.party_synchronized_time_slices(id) ON DELETE RESTRICT,
  participant_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  participant_actor_id text, result_kind text NOT NULL CHECK(result_kind IN ('root_traversal','carrier_local_activity','carrier_local_traversal','blocked','paused','failed')),
  elapsed_numerator numeric NOT NULL CHECK(elapsed_numerator >= 0 AND party_runtime.integral_numeric(elapsed_numerator)), elapsed_denominator numeric NOT NULL CHECK(elapsed_denominator > 0 AND party_runtime.integral_numeric(elapsed_denominator)),
  result_ref jsonb NOT NULL, CHECK(gcd(elapsed_numerator, elapsed_denominator) = 1), UNIQUE(slice_id, participant_execution_id)
);

CREATE OR REPLACE FUNCTION party_runtime.v3_journey_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'spatial_immutable_payload_violation: %', TG_TABLE_NAME; END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_journey_deferred_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject_kind_value text; subject_id_value text; party_value text; attachment_depth integer; attachment_cycle boolean;
BEGIN
  IF TG_TABLE_NAME = 'party_journey_locations' THEN
    IF EXISTS(SELECT 1 FROM party_runtime.party_carrier_attachments a WHERE a.party_id=NEW.party_id AND a.subject_kind=NEW.owner_kind AND a.subject_id=NEW.owner_id AND a.status='active') THEN RAISE EXCEPTION 'spatial_root_authority_xor_violation: attached owner has own journey location'; END IF;
    IF NEW.owner_kind='cohort' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c WHERE c.id=NEW.owner_id AND c.party_id=NEW.party_id AND c.status='active') THEN RAISE EXCEPTION 'spatial_journey_location_cohort_owner_invalid'; END IF;
    IF NEW.location_kind='scene' AND NOT EXISTS(SELECT 1 FROM party_runtime.scene_position_nodes p JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id JOIN party_runtime.party_scene_baselines b ON b.id=g.scene_baseline_id WHERE p.id=NEW.scene_position_id AND p.party_id=NEW.party_id AND g.party_id=NEW.party_id AND b.party_id=NEW.party_id AND p.status='active' AND g.status='active' AND b.status='active') THEN RAISE EXCEPTION 'spatial_journey_location_scene_context_invalid'; END IF;
    IF NEW.location_kind='transit_anchor' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_transit_anchors a WHERE a.id=NEW.transit_anchor_id AND a.party_id=NEW.party_id AND a.status='active') THEN RAISE EXCEPTION 'spatial_journey_location_anchor_context_invalid'; END IF;
    IF NEW.location_kind='in_transit' AND NOT EXISTS(SELECT 1 FROM party_runtime.traveller_travel_states t JOIN party_runtime.party_route_plan_executions e ON e.id=t.route_plan_execution_id WHERE t.id=NEW.travel_state_id AND t.party_id=NEW.party_id AND e.party_id=NEW.party_id AND t.status IN ('active','paused_in_transit','stranded_in_transit')) THEN RAISE EXCEPTION 'spatial_journey_location_travel_context_invalid'; END IF;
  ELSIF TG_TABLE_NAME = 'party_carrier_attachments' THEN
    IF NEW.status='active' THEN
      IF NEW.subject_kind='actor' AND NEW.carrier_kind='cohort' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c JOIN party_runtime.party_cohort_memberships m ON m.cohort_id=c.id WHERE c.id=NEW.carrier_id AND c.party_id=NEW.party_id AND c.status='active' AND m.party_id=NEW.party_id AND m.actor_id=NEW.subject_id AND m.status='active') THEN RAISE EXCEPTION 'spatial_actor_cohort_attachment_membership_invalid'; END IF;
      IF NEW.subject_kind='cohort' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c WHERE c.id=NEW.subject_id AND c.party_id=NEW.party_id AND c.status='active') THEN RAISE EXCEPTION 'spatial_cohort_attachment_subject_invalid'; END IF;
      IF EXISTS(SELECT 1 FROM party_runtime.party_journey_locations l WHERE l.party_id=NEW.party_id AND l.owner_kind=NEW.subject_kind AND l.owner_id=NEW.subject_id) THEN RAISE EXCEPTION 'spatial_root_authority_xor_violation: attached subject has own journey location'; END IF;
      WITH RECURSIVE chain(kind,id,depth,path,cycle) AS (
        SELECT NEW.carrier_kind,NEW.carrier_id,1,ARRAY[NEW.subject_kind || ':' || NEW.subject_id, NEW.carrier_kind || ':' || NEW.carrier_id],false
        UNION ALL SELECT a.carrier_kind,a.carrier_id,c.depth+1,c.path || (a.carrier_kind || ':' || a.carrier_id),(a.carrier_kind || ':' || a.carrier_id)=ANY(c.path)
        FROM chain c JOIN party_runtime.party_carrier_attachments a ON a.party_id=NEW.party_id AND a.status='active' AND a.subject_kind=c.kind AND a.subject_id=c.id WHERE c.depth < 3 AND NOT c.cycle
      ) SELECT coalesce(max(depth),1),coalesce(bool_or(cycle),false) INTO attachment_depth,attachment_cycle FROM chain;
      IF attachment_cycle OR attachment_depth > 2 THEN RAISE EXCEPTION 'spatial_carrier_attachment_graph_invalid: cycle or depth'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'party_cohort_memberships' THEN
    IF NEW.status='active' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c WHERE c.id=NEW.cohort_id AND c.party_id=NEW.party_id AND c.status='active') THEN RAISE EXCEPTION 'spatial_cohort_membership_cohort_invalid'; END IF;
    IF NEW.status='active' AND EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions e WHERE e.party_id=NEW.party_id AND e.status IN ('planned','active','waiting_at_anchor','suspended_at_scene','stranded_in_transit') AND e.journey_scope='world_travel' AND e.journey_owner_ref->>'entity_kind'='actor' AND e.journey_owner_ref->>'entity_id'=NEW.actor_id) THEN RAISE EXCEPTION 'spatial_cohort_member_independent_world_travel'; END IF;
  ELSIF TG_TABLE_NAME = 'party_cohorts' THEN
    IF NEW.status<>'active' AND (EXISTS(SELECT 1 FROM party_runtime.party_cohort_memberships m WHERE m.cohort_id=NEW.id AND m.party_id=NEW.party_id AND m.status='active') OR EXISTS(SELECT 1 FROM party_runtime.party_carrier_attachments a WHERE a.party_id=NEW.party_id AND a.status='active' AND ((a.subject_kind='actor' AND a.carrier_kind='cohort' AND a.carrier_id=NEW.id) OR (a.subject_kind='cohort' AND a.subject_id=NEW.id))) OR EXISTS(SELECT 1 FROM party_runtime.party_journey_locations l WHERE l.party_id=NEW.party_id AND l.owner_kind='cohort' AND l.owner_id=NEW.id) OR EXISTS(SELECT 1 FROM party_runtime.party_clocks c WHERE c.party_id=NEW.party_id AND c.clock_owner_kind='cohort' AND c.clock_owner_id=NEW.id) OR EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions e WHERE e.party_id=NEW.party_id AND e.journey_scope='world_travel' AND e.status IN ('planned','active','waiting_at_anchor','suspended_at_scene','stranded_in_transit') AND e.journey_owner_ref->>'entity_kind'='cohort' AND e.journey_owner_ref->>'entity_id'=NEW.id)) THEN RAISE EXCEPTION 'spatial_cohort_terminal_dependents_active'; END IF;
  ELSIF TG_TABLE_NAME = 'party_actor_carrier_positions' THEN
    IF NEW.status='active' AND NEW.root_carrier_kind='cohort' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c WHERE c.id=NEW.root_carrier_id AND c.party_id=NEW.party_id AND c.status='active') THEN RAISE EXCEPTION 'spatial_actor_carrier_position_cohort_root_invalid'; END IF;
    IF NEW.status='active' AND NOT EXISTS(SELECT 1 FROM party_runtime.scene_position_nodes p JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id JOIN party_runtime.party_scene_baselines b ON b.id=g.scene_baseline_id WHERE p.id=NEW.position_node_id AND p.g6_instance_id=NEW.g6_instance_id AND g.scene_baseline_id=NEW.scene_baseline_id AND p.party_id=NEW.party_id AND g.party_id=NEW.party_id AND b.party_id=NEW.party_id AND p.status='active' AND g.status='active' AND b.status='active') THEN RAISE EXCEPTION 'spatial_actor_carrier_position_context_invalid'; END IF;
    IF NEW.status='active' AND NOT EXISTS(WITH RECURSIVE chain(kind,id,depth) AS (SELECT a.carrier_kind,a.carrier_id,1 FROM party_runtime.party_carrier_attachments a WHERE a.party_id=NEW.party_id AND a.subject_kind='actor' AND a.subject_id=NEW.actor_id AND a.status='active' UNION ALL SELECT a.carrier_kind,a.carrier_id,c.depth+1 FROM chain c JOIN party_runtime.party_carrier_attachments a ON a.party_id=NEW.party_id AND a.subject_kind=c.kind AND a.subject_id=c.id AND a.status='active' WHERE c.depth<2) SELECT 1 FROM chain WHERE kind=NEW.root_carrier_kind AND id=NEW.root_carrier_id) THEN RAISE EXCEPTION 'spatial_actor_carrier_position_attachment_invalid'; END IF;
  ELSIF TG_TABLE_NAME = 'party_synchronized_time_slices' THEN
    IF NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions e JOIN party_runtime.traveller_travel_states s ON s.id=NEW.root_travel_state_id JOIN party_runtime.party_clocks c ON c.party_id=NEW.party_id WHERE e.id=NEW.root_execution_id AND e.party_id=NEW.party_id AND s.party_id=NEW.party_id AND e.journey_scope='world_travel' AND s.route_plan_execution_id=e.id AND e.journey_owner_ref->>'entity_kind'=NEW.clock_owner_kind AND e.journey_owner_ref->>'entity_id'=NEW.clock_owner_id AND c.clock_owner_kind=NEW.clock_owner_kind AND c.clock_owner_id=NEW.clock_owner_id AND c.whole_minutes=NEW.clock_after_whole_minutes AND c.subminute_numerator=NEW.clock_after_subminute_numerator AND c.subminute_denominator=NEW.clock_after_subminute_denominator) THEN RAISE EXCEPTION 'spatial_synchronized_slice_root_or_clock_invalid'; END IF;
    IF NEW.clock_after_whole_minutes < NEW.clock_before_whole_minutes OR (NEW.clock_after_whole_minutes=NEW.clock_before_whole_minutes AND NEW.clock_after_subminute_numerator * NEW.clock_before_subminute_denominator < NEW.clock_before_subminute_numerator * NEW.clock_after_subminute_denominator) THEN RAISE EXCEPTION 'spatial_clock_non_monotonic'; END IF;
    IF (((NEW.clock_after_whole_minutes-NEW.clock_before_whole_minutes)*NEW.clock_after_subminute_denominator*NEW.clock_before_subminute_denominator+NEW.clock_after_subminute_numerator*NEW.clock_before_subminute_denominator-NEW.clock_before_subminute_numerator*NEW.clock_after_subminute_denominator)*NEW.elapsed_denominator) <> (NEW.elapsed_numerator*NEW.clock_after_subminute_denominator*NEW.clock_before_subminute_denominator) THEN RAISE EXCEPTION 'spatial_synchronized_slice_clock_delta_invalid'; END IF;
    IF NEW.crossed_whole_minute_boundaries<>(NEW.clock_after_whole_minutes-NEW.clock_before_whole_minutes) THEN RAISE EXCEPTION 'spatial_synchronized_slice_boundary_count_invalid'; END IF;
  ELSIF TG_TABLE_NAME = 'party_synchronized_time_slice_results' THEN
    IF NEW.result_kind='root_traversal' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_synchronized_time_slices s WHERE s.id=NEW.slice_id AND s.root_execution_id=NEW.participant_execution_id) THEN RAISE EXCEPTION 'spatial_synchronized_slice_root_result_invalid'; END IF;
    IF NEW.result_kind IN ('carrier_local_activity','carrier_local_traversal') AND NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions e WHERE e.id=NEW.participant_execution_id AND e.journey_scope='carrier_local') THEN RAISE EXCEPTION 'spatial_synchronized_slice_scope_invalid'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_clock_deferred_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.clock_owner_kind='cohort' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c WHERE c.id=NEW.clock_owner_id AND c.party_id=NEW.party_id AND c.status='active') THEN RAISE EXCEPTION 'spatial_clock_cohort_owner_invalid'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_clock_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.whole_minutes < OLD.whole_minutes OR (NEW.whole_minutes=OLD.whole_minutes AND NEW.subminute_numerator * OLD.subminute_denominator < OLD.subminute_numerator * NEW.subminute_denominator) THEN RAISE EXCEPTION 'spatial_clock_non_monotonic'; END IF;
  IF NEW.state_version<>OLD.state_version+1 THEN RAISE EXCEPTION 'spatial_clock_state_version_invalid'; END IF;
  IF (NEW.clock_owner_kind<>OLD.clock_owner_kind OR NEW.clock_owner_id IS DISTINCT FROM OLD.clock_owner_id) AND NOT EXISTS(SELECT 1 FROM party_runtime.party_clock_owner_handoffs h JOIN party_runtime.party_v3_change_sets c ON c.id=h.change_set_id AND c.party_id=h.party_id WHERE h.party_id=NEW.party_id AND h.change_set_id=NEW.updated_change_set_id AND c.operation_kind='clock_handoff' AND h.old_owner_kind=OLD.clock_owner_kind AND h.old_owner_id IS NOT DISTINCT FROM OLD.clock_owner_id AND h.new_owner_kind=NEW.clock_owner_kind AND h.new_owner_id IS NOT DISTINCT FROM NEW.clock_owner_id AND h.effective_whole_minutes=NEW.whole_minutes AND h.effective_subminute_numerator=NEW.subminute_numerator AND h.effective_subminute_denominator=NEW.subminute_denominator) THEN RAISE EXCEPTION 'spatial_clock_owner_handoff_invalid'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_clock_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'spatial_clock_delete_forbidden'; END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_clock_handoff_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'spatial_clock_handoff_immutable'; END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_change_set_write_plan_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM party_runtime.party_v3_change_sets c WHERE c.id=NEW.change_set_id AND c.write_plan_digest=NEW.canonical_write_plan_digest AND c.expected_state_version_set_digest=NEW.expected_state_version_set_digest AND c.expected_state_version_set=NEW.expected_state_version_set) THEN RAISE EXCEPTION 'spatial_change_set_write_plan_contract_invalid'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_idempotency_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.status IN ('committed','failed_terminal') THEN RAISE EXCEPTION 'spatial_idempotency_terminal_immutable'; END IF;
    IF NEW.party_id<>OLD.party_id OR NEW.operation_kind<>OLD.operation_kind OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.parent_record_id IS DISTINCT FROM OLD.parent_record_id OR NEW.child_ordinal IS DISTINCT FROM OLD.child_ordinal OR NEW.canonical_input_digest<>OLD.canonical_input_digest OR NEW.expected_state_version_set_digest<>OLD.expected_state_version_set_digest THEN RAISE EXCEPTION 'spatial_idempotency_payload_immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_synchronized_slice_result_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM party_runtime.party_synchronized_time_slice_results r WHERE r.slice_id=NEW.id AND r.result_kind='root_traversal' AND r.elapsed_numerator=NEW.elapsed_numerator AND r.elapsed_denominator=NEW.elapsed_denominator) THEN RAISE EXCEPTION 'spatial_synchronized_slice_missing_root_result'; END IF;
  IF EXISTS(SELECT 1 FROM party_runtime.party_synchronized_time_slice_results r WHERE r.slice_id=NEW.id AND r.result_kind IN ('carrier_local_activity','carrier_local_traversal') AND r.elapsed_numerator * NEW.elapsed_denominator > NEW.elapsed_numerator * r.elapsed_denominator) THEN RAISE EXCEPTION 'spatial_synchronized_slice_local_elapsed_invalid'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS v3_idempotency_integrity ON party_runtime.party_command_idempotency;
CREATE TRIGGER v3_idempotency_integrity BEFORE UPDATE ON party_runtime.party_command_idempotency FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_idempotency_integrity();
DROP TRIGGER IF EXISTS v3_clock_integrity ON party_runtime.party_clocks;
CREATE TRIGGER v3_clock_integrity BEFORE UPDATE ON party_runtime.party_clocks FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_clock_integrity();
DROP TRIGGER IF EXISTS v3_clock_no_delete ON party_runtime.party_clocks;
CREATE TRIGGER v3_clock_no_delete BEFORE DELETE ON party_runtime.party_clocks FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_clock_no_delete();
DROP TRIGGER IF EXISTS v3_clock_deferred_integrity ON party_runtime.party_clocks;
CREATE CONSTRAINT TRIGGER v3_clock_deferred_integrity AFTER INSERT OR UPDATE ON party_runtime.party_clocks DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_clock_deferred_integrity();
DROP TRIGGER IF EXISTS v3_clock_handoff_immutable ON party_runtime.party_clock_owner_handoffs;
CREATE TRIGGER v3_clock_handoff_immutable BEFORE UPDATE OR DELETE ON party_runtime.party_clock_owner_handoffs FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_clock_handoff_immutable();
DROP TRIGGER IF EXISTS v3_change_set_write_plan_immutable ON party_runtime.party_change_set_write_plans;
CREATE TRIGGER v3_change_set_write_plan_immutable BEFORE UPDATE OR DELETE ON party_runtime.party_change_set_write_plans FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_immutable();
DROP TRIGGER IF EXISTS v3_change_set_write_plan_integrity ON party_runtime.party_change_set_write_plans;
CREATE CONSTRAINT TRIGGER v3_change_set_write_plan_integrity AFTER INSERT OR UPDATE ON party_runtime.party_change_set_write_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_change_set_write_plan_integrity();
DROP TRIGGER IF EXISTS v3_journey_location_integrity ON party_runtime.party_journey_locations;
CREATE CONSTRAINT TRIGGER v3_journey_location_integrity AFTER INSERT OR UPDATE ON party_runtime.party_journey_locations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_carrier_attachment_integrity ON party_runtime.party_carrier_attachments;
CREATE CONSTRAINT TRIGGER v3_carrier_attachment_integrity AFTER INSERT OR UPDATE ON party_runtime.party_carrier_attachments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_cohort_membership_integrity ON party_runtime.party_cohort_memberships;
CREATE CONSTRAINT TRIGGER v3_cohort_membership_integrity AFTER INSERT OR UPDATE ON party_runtime.party_cohort_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_cohort_integrity ON party_runtime.party_cohorts;
CREATE CONSTRAINT TRIGGER v3_cohort_integrity AFTER INSERT OR UPDATE ON party_runtime.party_cohorts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_actor_carrier_position_integrity ON party_runtime.party_actor_carrier_positions;
CREATE CONSTRAINT TRIGGER v3_actor_carrier_position_integrity AFTER INSERT OR UPDATE ON party_runtime.party_actor_carrier_positions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_sync_slice_integrity ON party_runtime.party_synchronized_time_slices;
CREATE CONSTRAINT TRIGGER v3_sync_slice_integrity AFTER INSERT OR UPDATE ON party_runtime.party_synchronized_time_slices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_sync_slice_result_integrity ON party_runtime.party_synchronized_time_slice_results;
CREATE CONSTRAINT TRIGGER v3_sync_slice_result_integrity AFTER INSERT OR UPDATE ON party_runtime.party_synchronized_time_slice_results DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_sync_slice_results_complete ON party_runtime.party_synchronized_time_slices;
CREATE CONSTRAINT TRIGGER v3_sync_slice_results_complete AFTER INSERT OR UPDATE ON party_runtime.party_synchronized_time_slices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_synchronized_slice_result_integrity();

CREATE INDEX IF NOT EXISTS party_v3_change_sets_party_lock_idx ON party_runtime.party_v3_change_sets(party_id, created_at_turn, id);
CREATE INDEX IF NOT EXISTS party_idempotency_party_lock_idx ON party_runtime.party_command_idempotency(party_id, operation_kind, idempotency_key);
CREATE INDEX IF NOT EXISTS party_route_execution_lock_idx ON party_runtime.party_route_plan_executions(party_id, status, id);
CREATE INDEX IF NOT EXISTS party_journey_location_lock_idx ON party_runtime.party_journey_locations(party_id, owner_kind, owner_id);
CREATE INDEX IF NOT EXISTS party_carrier_attachment_lock_idx ON party_runtime.party_carrier_attachments(party_id, subject_kind, subject_id) WHERE status='active';
```

### [`005_party_runtime_v3_domain.sql`](../../schemas/party-db/005_party_runtime_v3_domain.sql)

```sql
-- Target-only P23 dynamic-domain state. Production v2 composition does not load it before P28.
CREATE TABLE IF NOT EXISTS party_runtime.party_entity_controls (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  entity_kind text NOT NULL, entity_id text NOT NULL,
  owner_ref jsonb NOT NULL, holder_ref jsonb NOT NULL, controller_ref jsonb NOT NULL,
  access_profile_ref jsonb NOT NULL, capacity_units integer NOT NULL CHECK(capacity_units >= 0),
  state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL,
  PRIMARY KEY(party_id,entity_kind,entity_id),
  FOREIGN KEY(party_id,entity_kind,entity_id) REFERENCES party_runtime.entity_placements(party_id,entity_kind,entity_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_spatial_schedules (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL, current_position_node_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  schedule_profile_ref jsonb NOT NULL, dependency_pins jsonb NOT NULL, causal_state_ref jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('active','inactive')), state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS party_npc_spatial_schedule_active_uq ON party_runtime.party_npc_spatial_schedules(party_id,npc_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS party_runtime.party_transport_attached_g6 (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  transport_id text NOT NULL, g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,
  approved_template_ref jsonb NOT NULL, status text NOT NULL CHECK(status IN ('active','inactive')),
  state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS party_transport_attached_g6_active_uq ON party_runtime.party_transport_attached_g6(party_id,transport_id,g6_instance_id) WHERE status='active';
```

### [`006_party_runtime_v3_migration.sql`](../../schemas/party-db/006_party_runtime_v3_migration.sql)

```sql
-- P24 append-only evidence.  This table is target-only and does not read or
-- alter active v2 composition before P28.
CREATE TABLE IF NOT EXISTS party_runtime.spatial_v3_migration_coverage_artifacts (
  artifact_id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE RESTRICT,
  world_revision_id text,
  source_scope text NOT NULL,
  source_digest text NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  source_record_count integer NOT NULL CHECK (source_record_count >= 0),
  inventory_digest text NOT NULL CHECK (inventory_digest ~ '^[a-f0-9]{64}$'),
  inventory_target_digest text NOT NULL CHECK (inventory_target_digest ~ '^[a-f0-9]{64}$'),
  target_digest text NOT NULL CHECK (target_digest ~ '^[a-f0-9]{64}$'),
  acceptance_ok boolean NOT NULL,
  error_codes jsonb NOT NULL,
  source_snapshot jsonb NOT NULL,
  canonical_digest text NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_id, source_digest, target_digest)
);

CREATE OR REPLACE FUNCTION party_runtime.spatial_v3_migration_coverage_artifact_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'spatial_v3_migration_coverage_artifacts are append-only';
END;
$$;

DROP TRIGGER IF EXISTS spatial_v3_migration_coverage_artifact_immutable ON party_runtime.spatial_v3_migration_coverage_artifacts;
CREATE TRIGGER spatial_v3_migration_coverage_artifact_immutable
BEFORE UPDATE OR DELETE ON party_runtime.spatial_v3_migration_coverage_artifacts
FOR EACH ROW EXECUTE FUNCTION party_runtime.spatial_v3_migration_coverage_artifact_immutable();
```

### [`007_party_runtime_temporal_world.sql`](../../schemas/party-db/007_party_runtime_temporal_world.sql)

```sql
-- Temporal World v4 target-only persistence amendment. It is not part of the
-- production-v2 migration composition before P28.

CREATE OR REPLACE FUNCTION party_runtime.game_timestamp_parts_valid(
  whole_minutes numeric,
  subminute_numerator numeric,
  subminute_denominator numeric
) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    whole_minutes IS NOT NULL
    AND subminute_numerator IS NOT NULL
    AND subminute_denominator IS NOT NULL
    AND party_runtime.integral_numeric(whole_minutes)
    AND whole_minutes >= 0
    AND party_runtime.integral_numeric(subminute_numerator)
    AND subminute_numerator >= 0
    AND party_runtime.integral_numeric(subminute_denominator)
    AND subminute_denominator > 0
    AND subminute_numerator < subminute_denominator
    AND gcd(subminute_numerator,subminute_denominator)=1,
    false
  )
$$;

ALTER TABLE party_runtime.party_timed_activity_executions
  ADD COLUMN IF NOT EXISTS started_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS last_processed_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS last_processed_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS last_processed_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS next_boundary_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS next_boundary_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS next_boundary_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS progress jsonb,
  ADD COLUMN IF NOT EXISTS preconditions_digest text,
  ADD COLUMN IF NOT EXISTS terminal_reason_code text;
ALTER TABLE party_runtime.party_timed_activity_executions
  DROP CONSTRAINT IF EXISTS party_activity_active_boundary_valid;
ALTER TABLE party_runtime.party_timed_activity_executions
  ADD CONSTRAINT party_activity_active_boundary_valid CHECK (
    (status = 'active') = (next_boundary_at_whole_minutes IS NOT NULL AND next_boundary_at_subminute_numerator IS NOT NULL AND next_boundary_at_subminute_denominator IS NOT NULL)
    AND party_runtime.game_timestamp_parts_valid(started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator)
    AND party_runtime.game_timestamp_parts_valid(last_processed_at_whole_minutes,last_processed_at_subminute_numerator,last_processed_at_subminute_denominator)
    AND (
      (next_boundary_at_whole_minutes IS NULL AND next_boundary_at_subminute_numerator IS NULL AND next_boundary_at_subminute_denominator IS NULL)
      OR party_runtime.game_timestamp_parts_valid(next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator)
    )
  );

ALTER TABLE party_runtime.party_timed_activity_attempts
  ADD COLUMN IF NOT EXISTS started_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS ended_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS ended_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS ended_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS failure_class text,
  ADD COLUMN IF NOT EXISTS progress_before jsonb,
  ADD COLUMN IF NOT EXISTS progress_after jsonb,
  ADD COLUMN IF NOT EXISTS resource_reservations jsonb,
  ADD COLUMN IF NOT EXISTS resource_consumptions jsonb,
  ADD COLUMN IF NOT EXISTS body_effect_refs jsonb,
  ADD COLUMN IF NOT EXISTS participant_attendance jsonb,
  ADD COLUMN IF NOT EXISTS rule_and_policy_pins jsonb,
  ADD COLUMN IF NOT EXISTS trace jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE party_runtime.party_timed_activity_attempts
  DROP CONSTRAINT IF EXISTS party_activity_attempt_timestamp_valid;
ALTER TABLE party_runtime.party_timed_activity_attempts
  ADD CONSTRAINT party_activity_attempt_timestamp_valid CHECK (
    party_runtime.game_timestamp_parts_valid(started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator)
    AND party_runtime.game_timestamp_parts_valid(ended_at_whole_minutes,ended_at_subminute_numerator,ended_at_subminute_denominator)
    AND progress_before IS NOT NULL
    AND progress_after IS NOT NULL
    AND resource_reservations IS NOT NULL
    AND resource_consumptions IS NOT NULL
    AND body_effect_refs IS NOT NULL
    AND participant_attendance IS NOT NULL
    AND rule_and_policy_pins IS NOT NULL
  );

ALTER TABLE party_runtime.party_npc_spatial_schedules
  ADD COLUMN IF NOT EXISTS next_transition_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS next_transition_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS next_transition_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS current_activity_execution_id text REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS attention_state_ref jsonb,
  ADD COLUMN IF NOT EXISTS body_state_ref jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_state_ref jsonb,
  ADD COLUMN IF NOT EXISTS relationship_state_ref jsonb;
ALTER TABLE party_runtime.party_npc_spatial_schedules
  DROP CONSTRAINT IF EXISTS party_npc_exact_schedule_boundary_valid;
ALTER TABLE party_runtime.party_npc_spatial_schedules
  ADD CONSTRAINT party_npc_exact_schedule_boundary_valid CHECK (
    state_version >= 1
    AND (status='active') = (
      next_transition_at_whole_minutes IS NOT NULL
      AND next_transition_at_subminute_numerator IS NOT NULL
      AND next_transition_at_subminute_denominator IS NOT NULL
    )
    AND (
      (next_transition_at_whole_minutes IS NULL AND next_transition_at_subminute_numerator IS NULL AND next_transition_at_subminute_denominator IS NULL)
      OR party_runtime.game_timestamp_parts_valid(next_transition_at_whole_minutes,next_transition_at_subminute_numerator,next_transition_at_subminute_denominator)
    )
  );

CREATE TABLE IF NOT EXISTS party_runtime.party_activity_participant_bindings (
  activity_execution_id text NOT NULL REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT,
  participant_kind text NOT NULL, participant_id text NOT NULL, role_id text NOT NULL,
  required boolean NOT NULL DEFAULT false, status text NOT NULL CHECK(status IN ('active','left','removed')),
  bound_change_set_id text NOT NULL, terminal_change_set_id text,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  PRIMARY KEY(activity_execution_id,participant_kind,participant_id),
  CHECK((status='active') = (terminal_change_set_id IS NULL))
);
CREATE TABLE IF NOT EXISTS party_runtime.party_activity_resource_bindings (
  activity_execution_id text NOT NULL REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT,
  resource_kind text NOT NULL, resource_id text NOT NULL, binding_kind text NOT NULL CHECK(binding_kind IN ('reserved','consumed')),
  quantity_numerator numeric NOT NULL CHECK(quantity_numerator >= 0 AND party_runtime.integral_numeric(quantity_numerator)),
  quantity_denominator numeric NOT NULL CHECK(quantity_denominator > 0 AND party_runtime.integral_numeric(quantity_denominator) AND gcd(quantity_numerator,quantity_denominator)=1),
  change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  PRIMARY KEY(activity_execution_id,resource_kind,resource_id,binding_kind,change_set_id),
  UNIQUE(activity_execution_id,resource_kind,resource_id,idempotency_record_id)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_temporal_events (
  event_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  event_kind text NOT NULL, status text NOT NULL CHECK(status IN ('pending','resolved','cancelled','blocked')),
  scheduled_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(scheduled_at_whole_minutes)),
  scheduled_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(scheduled_at_subminute_numerator) AND scheduled_at_subminute_numerator >= 0),
  scheduled_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(scheduled_at_subminute_denominator) AND scheduled_at_subminute_denominator > 0),
  rule_ref jsonb NOT NULL, policy_ref jsonb NOT NULL, preconditions_digest text NOT NULL,
  idempotency_key text NOT NULL, change_set_id text NOT NULL, terminal_change_set_id text,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  CHECK(party_runtime.game_timestamp_parts_valid(scheduled_at_whole_minutes,scheduled_at_subminute_numerator,scheduled_at_subminute_denominator)),
  UNIQUE(party_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_temporal_event_subjects (
  event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE CASCADE,
  subject_kind text NOT NULL, subject_id text NOT NULL, subject_role text NOT NULL,
  PRIMARY KEY(event_id,subject_kind,subject_id,subject_role)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_temporal_event_dependencies (
  event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE CASCADE,
  depends_on_event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE RESTRICT,
  PRIMARY KEY(event_id,depends_on_event_id), CHECK(event_id <> depends_on_event_id)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_npc_runtime_transitions (
  transition_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL, transition_kind text NOT NULL, event_id text REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE RESTRICT,
  change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_whole_minutes)),
  occurred_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_numerator) AND occurred_at_subminute_numerator >= 0),
  occurred_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_denominator) AND occurred_at_subminute_denominator > 0),
  trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(party_runtime.game_timestamp_parts_valid(occurred_at_whole_minutes,occurred_at_subminute_numerator,occurred_at_subminute_denominator)), UNIQUE(party_id,idempotency_record_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_perception_records (
  perception_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE RESTRICT,
  perceiver_kind text NOT NULL, perceiver_id text NOT NULL, result_kind text NOT NULL CHECK(result_kind IN ('perceived','misinterpreted','unperceived')),
  perceived_at_whole_minutes numeric NOT NULL,
  perceived_at_subminute_numerator numeric NOT NULL,
  perceived_at_subminute_denominator numeric NOT NULL,
  recognition_policy_ref jsonb NOT NULL, visibility_policy_ref jsonb NOT NULL,
  canonical_digest text NOT NULL, signal_refs jsonb NOT NULL, knowledge_update_refs jsonb NOT NULL,
  change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  CHECK(party_runtime.game_timestamp_parts_valid(perceived_at_whole_minutes,perceived_at_subminute_numerator,perceived_at_subminute_denominator)),
  UNIQUE(party_id,idempotency_record_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_perception_witnesses (
  perception_id text NOT NULL REFERENCES party_runtime.party_perception_records(perception_id) ON DELETE CASCADE,
  witness_kind text NOT NULL, witness_id text NOT NULL, PRIMARY KEY(perception_id,witness_kind,witness_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_decision_traces (
  request_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL, state_version bigint NOT NULL CHECK(state_version >= 1), option_id text NOT NULL, command_token text NOT NULL,
  options_digest text NOT NULL, status text NOT NULL CHECK(status IN ('validated','committed','cancelled')),
  validated_at_whole_minutes numeric NOT NULL,
  validated_at_subminute_numerator numeric NOT NULL,
  validated_at_subminute_denominator numeric NOT NULL,
  idempotency_key text NOT NULL, change_set_id text, trace_digest text NOT NULL,
  CHECK(party_runtime.game_timestamp_parts_valid(validated_at_whole_minutes,validated_at_subminute_numerator,validated_at_subminute_denominator)),
  UNIQUE(party_id,idempotency_key), UNIQUE(party_id,npc_id,options_digest)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_body_temporal_history (
  history_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  subject_kind text NOT NULL, subject_id text NOT NULL, effect_ref jsonb NOT NULL, change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  occurred_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_whole_minutes)),
  occurred_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_numerator) AND occurred_at_subminute_numerator >= 0),
  occurred_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_denominator) AND occurred_at_subminute_denominator > 0),
  CHECK(party_runtime.game_timestamp_parts_valid(occurred_at_whole_minutes,occurred_at_subminute_numerator,occurred_at_subminute_denominator)), UNIQUE(party_id,idempotency_record_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_remote_aggregate_states (
  aggregate_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_ref jsonb NOT NULL, scope_mode text NOT NULL, last_updated_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(last_updated_at_whole_minutes)),
  last_updated_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(last_updated_at_subminute_numerator) AND last_updated_at_subminute_numerator >= 0),
  last_updated_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(last_updated_at_subminute_denominator) AND last_updated_at_subminute_denominator > 0),
  next_boundary_at_whole_minutes numeric, next_boundary_at_subminute_numerator numeric, next_boundary_at_subminute_denominator numeric,
  state_version bigint NOT NULL CHECK(state_version >= 1), canonical_digest text NOT NULL,
  aggregate_process_refs jsonb NOT NULL, pending_incoming_effect_refs jsonb NOT NULL, coarse_rule_versions jsonb NOT NULL,
  CHECK(party_runtime.game_timestamp_parts_valid(last_updated_at_whole_minutes,last_updated_at_subminute_numerator,last_updated_at_subminute_denominator)),
  CHECK(
    (next_boundary_at_whole_minutes IS NULL AND next_boundary_at_subminute_numerator IS NULL AND next_boundary_at_subminute_denominator IS NULL)
    OR party_runtime.game_timestamp_parts_valid(next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator)
  )
);
CREATE TABLE IF NOT EXISTS party_runtime.party_propagation_processes (
  process_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  aggregate_id text REFERENCES party_runtime.party_remote_aggregate_states(aggregate_id) ON DELETE RESTRICT,
  process_kind text NOT NULL, source_ref jsonb NOT NULL, causal_basis_ref jsonb NOT NULL, scope_ref jsonb NOT NULL, path_ref jsonb,
  status text NOT NULL CHECK(status IN ('pending','active','completed','terminated')),
  started_at_whole_minutes numeric NOT NULL, started_at_subminute_numerator numeric NOT NULL, started_at_subminute_denominator numeric NOT NULL,
  next_boundary_at_whole_minutes numeric, next_boundary_at_subminute_numerator numeric, next_boundary_at_subminute_denominator numeric,
  visibility_policy_ref jsonb NOT NULL, termination_policy_ref jsonb NOT NULL,
  rule_pins jsonb NOT NULL, idempotency_key text NOT NULL, state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  UNIQUE(party_id,idempotency_key),
  CHECK(party_runtime.game_timestamp_parts_valid(started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator)),
  CHECK(
    (status IN ('pending','active')) = (
      next_boundary_at_whole_minutes IS NOT NULL
      AND next_boundary_at_subminute_numerator IS NOT NULL
      AND next_boundary_at_subminute_denominator IS NOT NULL
    )
  ),
  CHECK(
    (next_boundary_at_whole_minutes IS NULL AND next_boundary_at_subminute_numerator IS NULL AND next_boundary_at_subminute_denominator IS NULL)
    OR party_runtime.game_timestamp_parts_valid(next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator)
  )
);

CREATE TABLE IF NOT EXISTS party_runtime.party_visible_packages (
  package_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  turn_id text NOT NULL, committed_state_version bigint NOT NULL CHECK(committed_state_version >= 1), change_set_id text NOT NULL,
  package_digest text NOT NULL, visible_payload jsonb NOT NULL,
  presentation_status text NOT NULL CHECK(presentation_status IN ('pending')),
  projection_policy_ref jsonb NOT NULL, dependency_pins jsonb NOT NULL, idempotency_record_id text NOT NULL,
  UNIQUE(party_id,idempotency_record_id), UNIQUE(party_id,change_set_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_narration_jobs (
  job_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  package_id text NOT NULL REFERENCES party_runtime.party_visible_packages(package_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('pending','in_progress','output_ready','delivered','failed_retryable')),
  idempotency_key text NOT NULL, next_attempt_ordinal integer NOT NULL DEFAULT 0 CHECK(next_attempt_ordinal >= 0),
  active_attempt_id text, claim_token text, lease_expires_at timestamptz,
  narration_output jsonb, output_digest text, state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  UNIQUE(party_id,idempotency_key), UNIQUE(package_id),
  CHECK(
    (status IN ('pending','failed_retryable') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NULL AND output_digest IS NULL)
    OR (status='in_progress' AND active_attempt_id IS NOT NULL AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL AND narration_output IS NULL AND output_digest IS NULL)
    OR (status IN ('output_ready','delivered') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NOT NULL AND output_digest IS NOT NULL)
  )
);
CREATE TABLE IF NOT EXISTS party_runtime.party_narration_attempts (
  attempt_id text PRIMARY KEY, job_id text NOT NULL REFERENCES party_runtime.party_narration_jobs(job_id) ON DELETE RESTRICT,
  attempt_ordinal integer NOT NULL CHECK(attempt_ordinal >= 0), outcome text NOT NULL CHECK(outcome IN ('delivered','failed_retryable')),
  output_digest text, failure_code text, failure_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id,attempt_ordinal),
  CHECK((outcome='delivered') = (output_digest IS NOT NULL)),
  CHECK((outcome='delivered') = (failure_code IS NULL))
);

-- Party-owned causal references are composite even though their primary ids are
-- globally unique. This prevents a valid id from silently crossing party state.
CREATE UNIQUE INDEX IF NOT EXISTS party_temporal_events_event_party_uq
  ON party_runtime.party_temporal_events(event_id,party_id);
CREATE UNIQUE INDEX IF NOT EXISTS party_remote_aggregate_states_aggregate_party_uq
  ON party_runtime.party_remote_aggregate_states(aggregate_id,party_id);
CREATE UNIQUE INDEX IF NOT EXISTS party_visible_packages_package_party_uq
  ON party_runtime.party_visible_packages(package_id,party_id);

ALTER TABLE party_runtime.party_npc_runtime_transitions
  DROP CONSTRAINT IF EXISTS party_npc_runtime_transitions_event_id_fkey;
ALTER TABLE party_runtime.party_npc_runtime_transitions
  DROP CONSTRAINT IF EXISTS party_npc_transition_event_party_fk;
ALTER TABLE party_runtime.party_npc_runtime_transitions
  ADD CONSTRAINT party_npc_transition_event_party_fk
  FOREIGN KEY(event_id,party_id) REFERENCES party_runtime.party_temporal_events(event_id,party_id) ON DELETE RESTRICT;

ALTER TABLE party_runtime.party_perception_records
  DROP CONSTRAINT IF EXISTS party_perception_records_event_id_fkey;
ALTER TABLE party_runtime.party_perception_records
  DROP CONSTRAINT IF EXISTS party_perception_event_party_fk;
ALTER TABLE party_runtime.party_perception_records
  ADD CONSTRAINT party_perception_event_party_fk
  FOREIGN KEY(event_id,party_id) REFERENCES party_runtime.party_temporal_events(event_id,party_id) ON DELETE RESTRICT;

ALTER TABLE party_runtime.party_propagation_processes
  DROP CONSTRAINT IF EXISTS party_propagation_processes_aggregate_id_fkey;
ALTER TABLE party_runtime.party_propagation_processes
  DROP CONSTRAINT IF EXISTS party_propagation_aggregate_party_fk;
ALTER TABLE party_runtime.party_propagation_processes
  ADD CONSTRAINT party_propagation_aggregate_party_fk
  FOREIGN KEY(aggregate_id,party_id) REFERENCES party_runtime.party_remote_aggregate_states(aggregate_id,party_id) ON DELETE RESTRICT;

ALTER TABLE party_runtime.party_narration_jobs
  DROP CONSTRAINT IF EXISTS party_narration_jobs_package_id_fkey;
ALTER TABLE party_runtime.party_narration_jobs
  DROP CONSTRAINT IF EXISTS party_narration_package_party_fk;
ALTER TABLE party_runtime.party_narration_jobs
  ADD CONSTRAINT party_narration_package_party_fk
  FOREIGN KEY(package_id,party_id) REFERENCES party_runtime.party_visible_packages(package_id,party_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION party_runtime.temporal_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'temporal history is append-only'; END $$;
CREATE OR REPLACE FUNCTION party_runtime.activity_execution_temporal_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active' OR NEW.state_version<>1 OR NEW.next_attempt_ordinal<>0 OR NEW.terminal_change_set_id IS NOT NULL THEN
      RAISE EXCEPTION 'activity execution initial state is invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state_version<>OLD.state_version+1
    OR NEW.id<>OLD.id OR NEW.route_plan_execution_id<>OLD.route_plan_execution_id
    OR NEW.plan_step_ordinal<>OLD.plan_step_ordinal OR NEW.series_ordinal<>OLD.series_ordinal
    OR NEW.predecessor_activity_execution_id IS DISTINCT FROM OLD.predecessor_activity_execution_id
    OR NEW.activity_snapshot<>OLD.activity_snapshot
    OR NEW.started_at_whole_minutes<>OLD.started_at_whole_minutes
    OR NEW.started_at_subminute_numerator<>OLD.started_at_subminute_numerator
    OR NEW.started_at_subminute_denominator<>OLD.started_at_subminute_denominator THEN
    RAISE EXCEPTION 'activity execution identity, static snapshot or state version changed';
  END IF;
  IF NOT (
    (OLD.status='active' AND NEW.status IN ('active','paused','completed','failed','aborted'))
    OR (OLD.status='paused' AND NEW.status IN ('active','aborted'))
  ) THEN RAISE EXCEPTION 'activity execution lifecycle transition is invalid'; END IF;
  IF NEW.next_attempt_ordinal<OLD.next_attempt_ordinal THEN RAISE EXCEPTION 'activity attempt cursor cannot decrease'; END IF;
  IF OLD.last_processed_at_whole_minutes IS NOT NULL AND (NEW.last_processed_at_whole_minutes < OLD.last_processed_at_whole_minutes OR (NEW.last_processed_at_whole_minutes = OLD.last_processed_at_whole_minutes AND NEW.last_processed_at_subminute_numerator * OLD.last_processed_at_subminute_denominator < OLD.last_processed_at_subminute_numerator * NEW.last_processed_at_subminute_denominator)) THEN
    RAISE EXCEPTION 'activity last_processed_at must be monotonic';
  END IF;
  IF NEW.cumulative_elapsed_numerator*OLD.cumulative_elapsed_denominator < OLD.cumulative_elapsed_numerator*NEW.cumulative_elapsed_denominator THEN
    RAISE EXCEPTION 'activity elapsed time cannot decrease';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.activity_attempt_ordinal_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  execution_id_value text;
  execution_row party_runtime.party_timed_activity_executions%ROWTYPE;
  latest_attempt party_runtime.party_timed_activity_attempts%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='party_timed_activity_executions' THEN
    execution_id_value:=NEW.id;
  ELSE
    execution_id_value:=NEW.activity_execution_id;
  END IF;
  SELECT * INTO execution_row FROM party_runtime.party_timed_activity_executions WHERE id=execution_id_value;
  IF execution_row.id IS NULL OR execution_row.next_attempt_ordinal<>(SELECT count(*) FROM party_runtime.party_timed_activity_attempts a WHERE a.activity_execution_id=execution_id_value) THEN
    RAISE EXCEPTION 'activity attempt ordinal/cursor mismatch';
  END IF;
  SELECT * INTO latest_attempt FROM party_runtime.party_timed_activity_attempts WHERE activity_execution_id=execution_id_value ORDER BY attempt_ordinal DESC LIMIT 1;
  IF latest_attempt.activity_execution_id IS NOT NULL AND (
    execution_row.last_processed_at_whole_minutes<>latest_attempt.ended_at_whole_minutes
    OR execution_row.last_processed_at_subminute_numerator<>latest_attempt.ended_at_subminute_numerator
    OR execution_row.last_processed_at_subminute_denominator<>latest_attempt.ended_at_subminute_denominator
  ) THEN RAISE EXCEPTION 'activity last_processed_at does not match the latest attempt'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_activity_participant_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active' OR NEW.state_version<>1 OR NEW.terminal_change_set_id IS NOT NULL THEN RAISE EXCEPTION 'activity participant must be created active'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'active' OR NEW.status NOT IN ('left','removed') OR NEW.state_version<>OLD.state_version+1 OR NEW.terminal_change_set_id IS NULL THEN
    RAISE EXCEPTION 'activity participant lifecycle transition is invalid';
  END IF;
  IF NEW.activity_execution_id<>OLD.activity_execution_id OR NEW.participant_kind<>OLD.participant_kind OR NEW.participant_id<>OLD.participant_id OR NEW.role_id<>OLD.role_id OR NEW.required<>OLD.required OR NEW.bound_change_set_id<>OLD.bound_change_set_id THEN
    RAISE EXCEPTION 'activity participant identity and binding are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_npc_schedule_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state_version<1 THEN RAISE EXCEPTION 'npc schedule state version is invalid'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.state_version<>OLD.state_version+1
    OR NEW.id<>OLD.id OR NEW.party_id<>OLD.party_id OR NEW.npc_id<>OLD.npc_id
    OR NEW.schedule_profile_ref<>OLD.schedule_profile_ref OR NEW.dependency_pins<>OLD.dependency_pins THEN
    RAISE EXCEPTION 'npc schedule identity, pins or state version changed';
  END IF;
  IF OLD.next_transition_at_whole_minutes IS NOT NULL AND NEW.next_transition_at_whole_minutes IS NOT NULL
    AND (
      NEW.next_transition_at_whole_minutes<OLD.next_transition_at_whole_minutes
      OR (NEW.next_transition_at_whole_minutes=OLD.next_transition_at_whole_minutes
        AND NEW.next_transition_at_subminute_numerator*OLD.next_transition_at_subminute_denominator
          < OLD.next_transition_at_subminute_numerator*NEW.next_transition_at_subminute_denominator)
    ) THEN RAISE EXCEPTION 'npc schedule transition time must be monotonic'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_npc_schedule_party_reference_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM party_runtime.scene_position_nodes position
    WHERE position.id=NEW.current_position_node_id AND position.party_id=NEW.party_id
  ) THEN RAISE EXCEPTION 'npc schedule position belongs to another party'; END IF;
  IF NEW.current_activity_execution_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM party_runtime.party_timed_activity_executions activity
    JOIN party_runtime.party_route_plan_executions execution ON execution.id=activity.route_plan_execution_id
    WHERE activity.id=NEW.current_activity_execution_id AND execution.party_id=NEW.party_id
  ) THEN RAISE EXCEPTION 'npc schedule activity belongs to another party'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.temporal_event_dependency_acyclic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (WITH RECURSIVE walk(event_id,depends_on_event_id,path,cycle) AS (SELECT event_id,depends_on_event_id,ARRAY[event_id,depends_on_event_id],false FROM party_runtime.party_temporal_event_dependencies UNION ALL SELECT d.event_id,d.depends_on_event_id,w.path || d.depends_on_event_id,d.depends_on_event_id=ANY(w.path) FROM walk w JOIN party_runtime.party_temporal_event_dependencies d ON d.event_id=w.depends_on_event_id WHERE NOT w.cycle) SELECT 1 FROM walk WHERE cycle) THEN RAISE EXCEPTION 'temporal event dependency cycle'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.temporal_event_dependency_same_party() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM party_runtime.party_temporal_events event
    JOIN party_runtime.party_temporal_events dependency
      ON dependency.event_id=NEW.depends_on_event_id
    WHERE event.event_id=NEW.event_id AND event.party_id=dependency.party_id
  ) THEN RAISE EXCEPTION 'temporal event dependency crosses party state'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_temporal_event_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'pending' OR NEW.state_version<>1 OR NEW.terminal_change_set_id IS NOT NULL THEN RAISE EXCEPTION 'temporal event must be created pending'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'pending' OR NEW.status NOT IN ('resolved','cancelled','blocked') OR NEW.state_version<>OLD.state_version+1 OR NEW.terminal_change_set_id IS NULL THEN
    RAISE EXCEPTION 'temporal event lifecycle transition is invalid';
  END IF;
  IF NEW.event_id<>OLD.event_id OR NEW.party_id<>OLD.party_id OR NEW.event_kind<>OLD.event_kind
    OR NEW.scheduled_at_whole_minutes<>OLD.scheduled_at_whole_minutes
    OR NEW.scheduled_at_subminute_numerator<>OLD.scheduled_at_subminute_numerator
    OR NEW.scheduled_at_subminute_denominator<>OLD.scheduled_at_subminute_denominator
    OR NEW.rule_ref<>OLD.rule_ref OR NEW.policy_ref<>OLD.policy_ref
    OR NEW.preconditions_digest<>OLD.preconditions_digest OR NEW.idempotency_key<>OLD.idempotency_key
    OR NEW.change_set_id<>OLD.change_set_id THEN
    RAISE EXCEPTION 'temporal event causal input is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_remote_aggregate_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state_version<>1 THEN RAISE EXCEPTION 'remote aggregate must start at state version one'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.state_version<>OLD.state_version+1
    OR NEW.aggregate_id<>OLD.aggregate_id OR NEW.party_id<>OLD.party_id
    OR NEW.scope_ref<>OLD.scope_ref OR NEW.scope_mode<>OLD.scope_mode THEN
    RAISE EXCEPTION 'remote aggregate lifecycle transition is invalid';
  END IF;
  IF NEW.last_updated_at_whole_minutes<OLD.last_updated_at_whole_minutes
    OR (NEW.last_updated_at_whole_minutes=OLD.last_updated_at_whole_minutes
      AND NEW.last_updated_at_subminute_numerator*OLD.last_updated_at_subminute_denominator
        < OLD.last_updated_at_subminute_numerator*NEW.last_updated_at_subminute_denominator) THEN
    RAISE EXCEPTION 'remote aggregate time must be monotonic';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_propagation_process_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status NOT IN ('pending','active') OR NEW.state_version<>1 THEN RAISE EXCEPTION 'propagation process initial state is invalid'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.state_version<>OLD.state_version+1
    OR NEW.process_id<>OLD.process_id OR NEW.party_id<>OLD.party_id
    OR NEW.process_kind<>OLD.process_kind OR NEW.source_ref<>OLD.source_ref
    OR NEW.causal_basis_ref<>OLD.causal_basis_ref OR NEW.scope_ref<>OLD.scope_ref
    OR NEW.path_ref IS DISTINCT FROM OLD.path_ref OR NEW.rule_pins<>OLD.rule_pins
    OR NEW.started_at_whole_minutes<>OLD.started_at_whole_minutes
    OR NEW.started_at_subminute_numerator<>OLD.started_at_subminute_numerator
    OR NEW.started_at_subminute_denominator<>OLD.started_at_subminute_denominator
    OR NEW.visibility_policy_ref<>OLD.visibility_policy_ref
    OR NEW.termination_policy_ref<>OLD.termination_policy_ref
    OR NEW.idempotency_key<>OLD.idempotency_key THEN
    RAISE EXCEPTION 'propagation process identity or pins changed';
  END IF;
  IF NOT (
    (OLD.status='pending' AND NEW.status IN ('active','terminated'))
    OR (OLD.status='active' AND NEW.status IN ('active','completed','terminated'))
  ) THEN RAISE EXCEPTION 'propagation process lifecycle transition is invalid'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_narration_job_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state_version <> OLD.state_version + 1 THEN RAISE EXCEPTION 'narration job state version must advance by one'; END IF;
  IF NOT (
    (OLD.status IN ('pending','failed_retryable') AND NEW.status='in_progress')
    OR (OLD.status='in_progress' AND NEW.status IN ('output_ready','failed_retryable'))
    OR (OLD.status='output_ready' AND NEW.status='delivered')
  ) THEN RAISE EXCEPTION 'narration job lifecycle transition is invalid'; END IF;
  IF NEW.job_id<>OLD.job_id OR NEW.party_id<>OLD.party_id OR NEW.package_id<>OLD.package_id OR NEW.idempotency_key<>OLD.idempotency_key THEN
    RAISE EXCEPTION 'narration job identity is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS party_activity_attempt_ordinal_valid ON party_runtime.party_timed_activity_attempts;
CREATE CONSTRAINT TRIGGER party_activity_attempt_ordinal_valid AFTER INSERT OR UPDATE ON party_runtime.party_timed_activity_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.activity_attempt_ordinal_valid();
DROP TRIGGER IF EXISTS party_activity_execution_attempt_ordinal_valid ON party_runtime.party_timed_activity_executions;
CREATE CONSTRAINT TRIGGER party_activity_execution_attempt_ordinal_valid AFTER INSERT OR UPDATE ON party_runtime.party_timed_activity_executions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.activity_attempt_ordinal_valid();
DROP TRIGGER IF EXISTS party_activity_execution_temporal_valid ON party_runtime.party_timed_activity_executions;
CREATE TRIGGER party_activity_execution_temporal_valid BEFORE INSERT OR UPDATE ON party_runtime.party_timed_activity_executions FOR EACH ROW EXECUTE FUNCTION party_runtime.activity_execution_temporal_valid();
DROP TRIGGER IF EXISTS party_activity_participant_lifecycle_valid ON party_runtime.party_activity_participant_bindings;
CREATE TRIGGER party_activity_participant_lifecycle_valid BEFORE INSERT OR UPDATE ON party_runtime.party_activity_participant_bindings FOR EACH ROW EXECUTE FUNCTION party_runtime.party_activity_participant_lifecycle_valid();
DROP TRIGGER IF EXISTS party_npc_schedule_lifecycle_valid ON party_runtime.party_npc_spatial_schedules;
CREATE TRIGGER party_npc_schedule_lifecycle_valid BEFORE INSERT OR UPDATE ON party_runtime.party_npc_spatial_schedules FOR EACH ROW EXECUTE FUNCTION party_runtime.party_npc_schedule_lifecycle_valid();
DROP TRIGGER IF EXISTS party_npc_schedule_party_reference_valid ON party_runtime.party_npc_spatial_schedules;
CREATE TRIGGER party_npc_schedule_party_reference_valid BEFORE INSERT OR UPDATE ON party_runtime.party_npc_spatial_schedules FOR EACH ROW EXECUTE FUNCTION party_runtime.party_npc_schedule_party_reference_valid();
DROP TRIGGER IF EXISTS temporal_event_dependency_same_party ON party_runtime.party_temporal_event_dependencies;
CREATE TRIGGER temporal_event_dependency_same_party BEFORE INSERT OR UPDATE ON party_runtime.party_temporal_event_dependencies FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_event_dependency_same_party();
DROP TRIGGER IF EXISTS party_temporal_event_dependency_acyclic ON party_runtime.party_temporal_event_dependencies;
CREATE CONSTRAINT TRIGGER party_temporal_event_dependency_acyclic AFTER INSERT OR UPDATE ON party_runtime.party_temporal_event_dependencies DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_event_dependency_acyclic();
DROP TRIGGER IF EXISTS party_temporal_event_lifecycle_valid ON party_runtime.party_temporal_events;
CREATE TRIGGER party_temporal_event_lifecycle_valid BEFORE INSERT OR UPDATE ON party_runtime.party_temporal_events FOR EACH ROW EXECUTE FUNCTION party_runtime.party_temporal_event_lifecycle_valid();
DROP TRIGGER IF EXISTS party_remote_aggregate_lifecycle_valid ON party_runtime.party_remote_aggregate_states;
CREATE TRIGGER party_remote_aggregate_lifecycle_valid BEFORE INSERT OR UPDATE ON party_runtime.party_remote_aggregate_states FOR EACH ROW EXECUTE FUNCTION party_runtime.party_remote_aggregate_lifecycle_valid();
DROP TRIGGER IF EXISTS party_propagation_process_lifecycle_valid ON party_runtime.party_propagation_processes;
CREATE TRIGGER party_propagation_process_lifecycle_valid BEFORE INSERT OR UPDATE ON party_runtime.party_propagation_processes FOR EACH ROW EXECUTE FUNCTION party_runtime.party_propagation_process_lifecycle_valid();
DROP TRIGGER IF EXISTS party_narration_job_lifecycle_valid ON party_runtime.party_narration_jobs;
CREATE TRIGGER party_narration_job_lifecycle_valid BEFORE UPDATE ON party_runtime.party_narration_jobs FOR EACH ROW EXECUTE FUNCTION party_runtime.party_narration_job_lifecycle_valid();

CREATE INDEX IF NOT EXISTS party_temporal_events_due_idx ON party_runtime.party_temporal_events(party_id,scheduled_at_whole_minutes,scheduled_at_subminute_numerator,scheduled_at_subminute_denominator) WHERE status='pending';
CREATE INDEX IF NOT EXISTS party_propagation_processes_due_idx ON party_runtime.party_propagation_processes(party_id,next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator) WHERE status IN ('pending','active');
CREATE INDEX IF NOT EXISTS party_activity_executions_due_idx ON party_runtime.party_timed_activity_executions(route_plan_execution_id,next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator) WHERE status='active';

DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['party_activity_resource_bindings','party_temporal_event_subjects','party_temporal_event_dependencies','party_npc_runtime_transitions','party_perception_records','party_perception_witnesses','party_npc_decision_traces','party_body_temporal_history','party_visible_packages','party_narration_attempts']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS temporal_append_only ON party_runtime.%I', relation_name);
    EXECUTE format('CREATE TRIGGER temporal_append_only BEFORE UPDATE OR DELETE ON party_runtime.%I FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only()', relation_name);
  END LOOP;
END $$;
```

### [`008_party_runtime_pr8_first_entry.sql`](../../schemas/party-db/008_party_runtime_pr8_first_entry.sql)

```sql
-- PR8 migration authored while target-only; activated only as part of the
-- spatial-v3-production-v1 versioned production activation cutover.
ALTER TABLE party_runtime.preparation_snapshot_members
  ADD COLUMN IF NOT EXISTS prepared_scene_materialization jsonb;

ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_check;
ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_check1;
ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_branch_check;
ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_prepared_object_check;

ALTER TABLE party_runtime.preparation_snapshot_members
  ADD CONSTRAINT preparation_snapshot_members_branch_check CHECK (
    (
      member_kind = 'endpoint'
      AND resolved_endpoint_snapshot IS NOT NULL
      AND resolved_scene_baseline_id IS NULL
      AND resolved_g6_instance_id IS NULL
      AND resolved_position_id IS NULL
      AND prepared_scene_materialization IS NULL
    )
    OR
    (
      member_kind = 'transfer_scene'
      AND resolved_endpoint_snapshot IS NULL
      AND (
        (
          resolved_scene_baseline_id IS NOT NULL
          AND resolved_g6_instance_id IS NOT NULL
          AND resolved_position_id IS NOT NULL
          AND prepared_scene_materialization IS NULL
        )
        OR
        (
          resolved_scene_baseline_id IS NULL
          AND resolved_g6_instance_id IS NULL
          AND resolved_position_id IS NULL
          AND prepared_scene_materialization IS NOT NULL
        )
      )
    )
  );

ALTER TABLE party_runtime.preparation_snapshot_members
  ADD CONSTRAINT preparation_snapshot_members_prepared_object_check CHECK (
    prepared_scene_materialization IS NULL
    OR jsonb_typeof(prepared_scene_materialization) = 'object'
  );
```

### [`009_party_runtime_pr8_reaction_knowledge.sql`](../../schemas/party-db/009_party_runtime_pr8_reaction_knowledge.sql)

```sql
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
```

### [`010_party_runtime_pr8_reaction_options.sql`](../../schemas/party-db/010_party_runtime_pr8_reaction_options.sql)

```sql
-- PR8 immutable reaction option proposals, introduced in target-only scope
-- and activated by the spatial-v3-production-v1 cutover. It does not reuse
-- the v2 generic party_decision_requests tables or their wall-clock timestamps.
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_reaction_option_proposals (
  request_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL,
  source_perception_id text NOT NULL,
  state_version bigint NOT NULL CHECK (state_version >= 1),
  options_digest text NOT NULL,
  proposal jsonb NOT NULL CHECK (jsonb_typeof(proposal) = 'object'),
  dependency_pins jsonb NOT NULL
    CHECK (jsonb_typeof(dependency_pins) = 'object'),
  canonical_digest text NOT NULL,
  idempotency_key text NOT NULL,
  change_set_id text NOT NULL,
  FOREIGN KEY (party_id, npc_id)
    REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, source_perception_id)
    REFERENCES party_runtime.party_perception_records(party_id, perception_id)
      ON DELETE RESTRICT,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
      ON DELETE RESTRICT,
  UNIQUE (party_id, request_id),
  UNIQUE (party_id, idempotency_key)
);

DROP TRIGGER IF EXISTS temporal_append_only
  ON party_runtime.party_npc_reaction_option_proposals;
CREATE TRIGGER temporal_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_npc_reaction_option_proposals
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();
```

### [`011_party_runtime_first_playable.sql`](../../schemas/party-db/011_party_runtime_first_playable.sql)

```sql
-- First-playable vertical slice. This migration extends existing spatial-v3
-- owners; it does not introduce a second activity, placement, control, clock,
-- idempotency or save engine.

-- An approved local passage may consume an action unit while carrying no
-- authored minute cost. Its traversal interval still owns exact progress and
-- any approved additive hazard delay.
ALTER TABLE party_runtime.party_traversal_interval_results
  DROP CONSTRAINT
    party_traversal_interval_results_planned_time_numerator_check;
ALTER TABLE party_runtime.party_traversal_interval_results
  ADD CONSTRAINT
    party_traversal_interval_results_planned_time_numerator_check
  CHECK(
    planned_time_numerator >= 0
    AND party_runtime.integral_numeric(planned_time_numerator)
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM party_runtime.party_activity_resource_bindings
  ) THEN
    RAISE EXCEPTION
      'party_activity_resource_binding_repair_required: legacy reserved/consumed rows cannot be mapped automatically';
  END IF;
  IF EXISTS (
    SELECT 1 FROM party_runtime.party_timed_activity_executions
  ) THEN
    RAISE EXCEPTION
      'party_activity_execution_repair_required: existing executions lack approved owner and series identities';
  END IF;
END $$;

ALTER TABLE party_runtime.party_command_idempotency
  ADD COLUMN semantic_command_snapshot jsonb,
  ADD COLUMN semantic_command_digest text,
  ADD COLUMN semantic_dependency_pins jsonb,
  ADD COLUMN request_id text,
  ADD CONSTRAINT party_semantic_command_seal_ck CHECK (
    (semantic_command_snapshot IS NULL
      AND semantic_command_digest IS NULL
      AND semantic_dependency_pins IS NULL
      AND request_id IS NULL)
    OR
    (semantic_command_snapshot IS NOT NULL
      AND jsonb_typeof(semantic_command_snapshot) = 'object'
      AND NULLIF(semantic_command_digest,'') IS NOT NULL
      AND semantic_dependency_pins IS NOT NULL
      AND jsonb_typeof(semantic_dependency_pins) = 'object'
      AND NULLIF(request_id,'') IS NOT NULL)
  );

-- Public screen/session and legacy container projections participate in the
-- same P16 CAS transaction as their authoritative v3 state.  They remain
-- projections/legacy owners; these columns only provide an exact concurrency
-- boundary and change-set evidence.
ALTER TABLE party_runtime.party_server_sessions
  ADD COLUMN state_version bigint NOT NULL DEFAULT 1
    CHECK(state_version >= 1),
  ADD COLUMN updated_change_set_id text;

ALTER TABLE party_runtime.party_containers
  ADD COLUMN state_version bigint NOT NULL DEFAULT 1
    CHECK(state_version >= 1),
  ADD COLUMN updated_change_set_id text;

-- The existing immediate-action owner gains a standalone branch. The row ID
-- remains the canonical action_run_id.
ALTER TABLE party_runtime.party_action_step_runs
  ALTER COLUMN execution_id DROP NOT NULL,
  ALTER COLUMN plan_step_ordinal DROP NOT NULL,
  ADD COLUMN party_id text
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  ADD COLUMN action_scope text,
  ADD COLUMN origin_location_snapshot jsonb,
  ADD COLUMN originating_command_ref jsonb,
  ADD COLUMN originating_command_digest text;

ALTER TABLE party_runtime.party_action_step_runs
  ALTER COLUMN party_id SET NOT NULL,
  ALTER COLUMN action_scope SET NOT NULL,
  ADD CONSTRAINT party_immediate_action_scope_ck CHECK (
    action_scope IN ('route_step','standalone')
    AND (
      (
        action_scope = 'route_step'
        AND execution_id IS NOT NULL
        AND plan_step_ordinal IS NOT NULL
        AND origin_location_snapshot IS NULL
        AND originating_command_ref IS NULL
        AND originating_command_digest IS NULL
      )
      OR
      (
        action_scope = 'standalone'
        AND execution_id IS NULL
        AND plan_step_ordinal IS NULL
        AND jsonb_typeof(origin_location_snapshot) = 'object'
        AND jsonb_typeof(execution_context_snapshot) = 'object'
        AND jsonb_typeof(originating_command_ref) = 'object'
        AND NULLIF(originating_command_digest,'') IS NOT NULL
      )
    )
  );

-- One execution owner and lineage model for route-step and standalone activity.
ALTER TABLE party_runtime.party_timed_activity_executions
  ALTER COLUMN route_plan_execution_id DROP NOT NULL,
  ALTER COLUMN plan_step_ordinal DROP NOT NULL,
  ADD COLUMN execution_scope text,
  ADD COLUMN activity_series_id text,
  ADD COLUMN activity_owner_ref jsonb,
  ADD COLUMN origin_location_snapshot jsonb,
  ADD COLUMN execution_context_snapshot jsonb,
  ADD COLUMN originating_command_ref jsonb,
  ADD COLUMN originating_command_digest text,
  ADD COLUMN idempotency_record_id text
    REFERENCES party_runtime.party_command_idempotency(id) ON DELETE RESTRICT;

ALTER TABLE party_runtime.party_timed_activity_executions
  ALTER COLUMN execution_scope SET NOT NULL,
  ALTER COLUMN activity_series_id SET NOT NULL,
  ALTER COLUMN activity_owner_ref SET NOT NULL;

ALTER TABLE party_runtime.party_timed_activity_executions
  ADD CONSTRAINT party_activity_execution_scope_ck CHECK (
    execution_scope IN ('route_step','standalone')
    AND jsonb_typeof(activity_owner_ref) = 'object'
    AND NULLIF(activity_owner_ref->>'entity_kind','') IS NOT NULL
    AND NULLIF(activity_owner_ref->>'entity_id','') IS NOT NULL
    AND (
      (
        execution_scope = 'route_step'
        AND route_plan_execution_id IS NOT NULL
        AND plan_step_ordinal IS NOT NULL
        AND origin_location_snapshot IS NULL
        AND execution_context_snapshot IS NULL
        AND originating_command_ref IS NULL
        AND originating_command_digest IS NULL
        AND idempotency_record_id IS NULL
      )
      OR
      (
        execution_scope = 'standalone'
        AND route_plan_execution_id IS NULL
        AND plan_step_ordinal IS NULL
        AND jsonb_typeof(origin_location_snapshot) = 'object'
        AND jsonb_typeof(execution_context_snapshot) = 'object'
        AND jsonb_typeof(originating_command_ref) = 'object'
        AND NULLIF(originating_command_digest,'') IS NOT NULL
        AND idempotency_record_id IS NOT NULL
      )
    )
  );

DROP INDEX IF EXISTS party_runtime.party_activity_one_nonterminal_uq;
CREATE UNIQUE INDEX party_activity_series_ordinal_uq
  ON party_runtime.party_timed_activity_executions(
    activity_series_id,
    series_ordinal
  );
CREATE UNIQUE INDEX party_activity_series_one_nonterminal_uq
  ON party_runtime.party_timed_activity_executions(activity_series_id)
  WHERE status IN ('active','paused');

-- ResourceBinding v1. No unit_id is introduced until the formal contract
-- registry defines its exact physical representation.
ALTER TABLE party_runtime.party_activity_resource_bindings
  DROP CONSTRAINT party_activity_resource_bindings_pkey,
  DROP CONSTRAINT party_activity_resource_bindings_binding_kind_check,
  ADD COLUMN consumption_policy_ref jsonb,
  ADD COLUMN state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1);

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid =
      'party_runtime.party_activity_resource_bindings'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format(
      'ALTER TABLE party_runtime.party_activity_resource_bindings DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE party_runtime.party_activity_resource_bindings
  ALTER COLUMN consumption_policy_ref SET NOT NULL,
  ADD CONSTRAINT party_activity_resource_binding_kind_ck CHECK (
    binding_kind IN (
      'required_tool',
      'reserved_input',
      'consumable_input',
      'output_target'
    )
  ),
  ADD CONSTRAINT party_activity_resource_binding_policy_ck CHECK (
    jsonb_typeof(consumption_policy_ref) = 'object'
  ),
  ADD PRIMARY KEY (
    activity_execution_id,
    resource_kind,
    resource_id,
    binding_kind
  );

-- The permanent owner/controller relation must survive transport departure.
ALTER TABLE party_runtime.party_entity_controls
  DROP CONSTRAINT IF EXISTS party_entity_controls_party_id_entity_kind_entity_id_fkey;

CREATE OR REPLACE FUNCTION
party_runtime.validate_first_playable_entity_control()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  affected_party_id text := COALESCE(NEW.party_id, OLD.party_id);
  control_row record;
  root_location record;
  placement_row record;
BEGIN
  FOR control_row IN
    SELECT *
    FROM party_runtime.party_entity_controls
    WHERE party_id = affected_party_id
  LOOP
    IF control_row.entity_kind = 'transport' THEN
      SELECT *
      INTO root_location
      FROM party_runtime.party_journey_locations
      WHERE party_id = control_row.party_id
        AND owner_kind = 'transport'
        AND owner_id = control_row.entity_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION
          'transport_root_location_required: %', control_row.entity_id;
      END IF;

      SELECT *
      INTO placement_row
      FROM party_runtime.entity_placements
      WHERE party_id = control_row.party_id
        AND entity_kind = 'transport'
        AND entity_id = control_row.entity_id;

      IF root_location.location_kind = 'scene' THEN
        IF NOT FOUND
          OR placement_row.placement_kind <> 'moored_at_position'
          OR placement_row.position_node_id
            IS DISTINCT FROM root_location.scene_position_id
        THEN
          RAISE EXCEPTION
            'transport_mooring_location_mismatch: %', control_row.entity_id;
        END IF;
      ELSIF FOUND THEN
        RAISE EXCEPTION
          'transport_transit_placement_forbidden: %', control_row.entity_id;
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM party_runtime.entity_placements placement
      WHERE placement.party_id = control_row.party_id
        AND placement.entity_kind = control_row.entity_kind
        AND placement.entity_id = control_row.entity_id
    ) THEN
      RAISE EXCEPTION
        'controlled_entity_placement_required: %:%',
        control_row.entity_kind,
        control_row.entity_id;
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS first_playable_entity_control_on_control
  ON party_runtime.party_entity_controls;
CREATE CONSTRAINT TRIGGER first_playable_entity_control_on_control
AFTER INSERT OR UPDATE OR DELETE ON party_runtime.party_entity_controls
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  party_runtime.validate_first_playable_entity_control();

DROP TRIGGER IF EXISTS first_playable_entity_control_on_placement
  ON party_runtime.entity_placements;
CREATE CONSTRAINT TRIGGER first_playable_entity_control_on_placement
AFTER INSERT OR UPDATE OR DELETE ON party_runtime.entity_placements
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  party_runtime.validate_first_playable_entity_control();

DROP TRIGGER IF EXISTS first_playable_entity_control_on_location
  ON party_runtime.party_journey_locations;
CREATE CONSTRAINT TRIGGER first_playable_entity_control_on_location
AFTER INSERT OR UPDATE OR DELETE ON party_runtime.party_journey_locations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  party_runtime.validate_first_playable_entity_control();

CREATE TABLE party_runtime.party_actor_profile_bindings (
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_kind text NOT NULL CHECK(actor_kind IN ('player_character','npc')),
  actor_id text NOT NULL,
  role_ref jsonb NOT NULL,
  occupation_ref jsonb NOT NULL,
  skill_profile_snapshot jsonb NOT NULL,
  name_profile_snapshot jsonb NOT NULL,
  language_profile_snapshot jsonb NOT NULL,
  knowledge_profile_snapshot jsonb NOT NULL,
  profile_candidate_set_digest text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  PRIMARY KEY(party_id,actor_kind,actor_id),
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);

CREATE TABLE party_runtime.party_actor_body_states (
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_kind text NOT NULL CHECK(actor_kind IN ('player_character','npc')),
  actor_id text NOT NULL,
  body_profile_ref jsonb NOT NULL,
  health numeric NOT NULL CHECK(health >= 0),
  energy numeric NOT NULL CHECK(energy >= 0),
  satiety numeric NOT NULL CHECK(satiety >= 0),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  updated_change_set_id text NOT NULL,
  PRIMARY KEY(party_id,actor_kind,actor_id),
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);

CREATE TABLE party_runtime.party_actor_active_conditions (
  party_id text NOT NULL,
  actor_kind text NOT NULL,
  actor_id text NOT NULL,
  condition_id text NOT NULL,
  condition_profile_ref jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('active','resolved')),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  terminal_change_set_id text,
  PRIMARY KEY(party_id,actor_kind,actor_id,condition_id),
  FOREIGN KEY(party_id,actor_kind,actor_id)
    REFERENCES party_runtime.party_actor_body_states(
      party_id,actor_kind,actor_id
    ) ON DELETE CASCADE,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);

CREATE TABLE party_runtime.party_resource_nodes (
  resource_node_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  source_resource_ref jsonb NOT NULL,
  position_node_id text NOT NULL
    REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  quantity_numerator numeric NOT NULL
    CHECK(quantity_numerator >= 0
      AND party_runtime.integral_numeric(quantity_numerator)),
  quantity_denominator numeric NOT NULL
    CHECK(quantity_denominator > 0
      AND party_runtime.integral_numeric(quantity_denominator)
      AND gcd(quantity_numerator,quantity_denominator) = 1),
  quantity_unit_ref jsonb NOT NULL,
  quality_ref jsonb NOT NULL,
  access_policy_ref jsonb NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  UNIQUE(party_id,resource_node_id),
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);

CREATE TABLE party_runtime.party_transports (
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  transport_id text NOT NULL,
  transport_category_ref jsonb NOT NULL,
  transport_template_ref jsonb NOT NULL,
  applicability_snapshot jsonb NOT NULL,
  capacity_policy_ref jsonb NOT NULL,
  movement_capability_refs jsonb NOT NULL,
  control_requirement_ref jsonb NOT NULL,
  route_applicability_ref jsonb NOT NULL,
  transport_contract_digest text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  PRIMARY KEY(party_id,transport_id),
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);

CREATE TABLE party_runtime.party_actor_relations (
  relation_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  subject_ref jsonb NOT NULL,
  object_ref jsonb NOT NULL,
  relation_category_ref jsonb NOT NULL,
  relation_state jsonb NOT NULL,
  causal_evidence_kind text NOT NULL CHECK(
    causal_evidence_kind IN (
      'interaction',
      'terminal_activity_attempt',
      'immediate_action',
      'traversal_interval'
    )
  ),
  causal_evidence_ref jsonb NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);
CREATE UNIQUE INDEX party_actor_relation_semantic_identity_uq
  ON party_runtime.party_actor_relations(
    party_id,
    (subject_ref->>'entity_kind'),
    (subject_ref->>'entity_id'),
    (object_ref->>'entity_kind'),
    (object_ref->>'entity_id'),
    (relation_category_ref->>'entity_id')
  );

CREATE TABLE party_runtime.party_check_resolutions (
  check_resolution_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  check_scope_kind text NOT NULL CHECK(
    check_scope_kind IN (
      'immediate_action',
      'timed_activity_attempt',
      'traversal_interval'
    )
  ),
  check_scope_key jsonb NOT NULL,
  check_policy_ref jsonb NOT NULL,
  deterministic_roll_input_digest text NOT NULL,
  roll_value integer NOT NULL,
  modifier_snapshot jsonb NOT NULL,
  target_value integer NOT NULL,
  result_kind text NOT NULL CHECK(result_kind IN ('success','failure')),
  consequence_policy_ref jsonb NOT NULL,
  result_change_set_id text NOT NULL,
  canonical_digest text NOT NULL,
  UNIQUE(party_id,check_scope_kind,check_scope_key),
  FOREIGN KEY(party_id,result_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);

CREATE TABLE party_runtime.party_actor_npc_interactions (
  interaction_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  npc_id text NOT NULL,
  interaction_kind text NOT NULL CHECK(interaction_kind = 'conversation'),
  activity_execution_id text NOT NULL UNIQUE
    REFERENCES party_runtime.party_timed_activity_executions(id)
    ON DELETE RESTRICT,
  started_at jsonb NOT NULL,
  ended_at jsonb,
  location_ref jsonb NOT NULL,
  outcome text NOT NULL CHECK(outcome IN ('completed','failed','aborted')),
  terminal_change_set_id text NOT NULL,
  terminal_evidence_kind text NOT NULL CHECK(
    terminal_evidence_kind IN ('terminal_attempt','lifecycle_abort')
  ),
  terminal_evidence_ref jsonb NOT NULL,
  interaction_policy_ref jsonb NOT NULL,
  canonical_digest text NOT NULL,
  FOREIGN KEY(party_id,npc_id)
    REFERENCES party_runtime.party_npcs(party_id,npc_id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,terminal_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  CHECK((outcome = 'aborted') = (terminal_evidence_kind = 'lifecycle_abort'))
);

CREATE TABLE party_runtime.party_actor_npc_interaction_summaries (
  summary_id text PRIMARY KEY,
  interaction_id text NOT NULL
    REFERENCES party_runtime.party_actor_npc_interactions(interaction_id)
    ON DELETE RESTRICT,
  summary_scope text NOT NULL
    CHECK(summary_scope IN ('player_journal','npc_memory')),
  remembering_subject_kind text NOT NULL,
  remembering_subject_id text NOT NULL,
  summary_text text NOT NULL,
  salience integer NOT NULL CHECK(salience >= 0),
  source_message_digest text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  UNIQUE(interaction_id,summary_scope,remembering_subject_kind,
    remembering_subject_id,source_message_digest)
);

CREATE TRIGGER first_playable_interaction_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_actor_npc_interactions
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();

CREATE TRIGGER first_playable_interaction_summary_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_actor_npc_interaction_summaries
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();

CREATE TRIGGER first_playable_check_resolution_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_check_resolutions
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();
```

### [`012_party_runtime_external_ownership.sql`](../../schemas/party-db/012_party_runtime_external_ownership.sql)

```sql
ALTER TABLE party_runtime.party_ownership
  ADD COLUMN IF NOT EXISTS owner_external_ref JSONB;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
    FROM pg_constraint
   WHERE conrelid = 'party_runtime.party_ownership'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid)
       LIKE '%owner_npc_id IS NULL%owner_character_id IS NULL%owner_party%'
     AND pg_get_constraintdef(oid) NOT LIKE '%owner_external_ref%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE party_runtime.party_ownership DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'party_runtime.party_ownership'::regclass
       AND conname = 'party_ownership_exactly_one_owner_check'
  ) THEN
    ALTER TABLE party_runtime.party_ownership
      ADD CONSTRAINT party_ownership_exactly_one_owner_check CHECK (
        (CASE WHEN owner_npc_id IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN owner_character_id IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN owner_party THEN 1 ELSE 0 END)
        + (CASE WHEN owner_external_ref IS NULL THEN 0 ELSE 1 END) = 1
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'party_runtime.party_ownership'::regclass
       AND conname = 'party_ownership_external_owner_ref_check'
  ) THEN
    ALTER TABLE party_runtime.party_ownership
      ADD CONSTRAINT party_ownership_external_owner_ref_check CHECK (
        owner_external_ref IS NULL OR (
          jsonb_typeof(owner_external_ref) = 'object'
          AND COALESCE(
            NULLIF(btrim(owner_external_ref->>'entity_kind'), ''), ''
          ) <> ''
          AND COALESCE(
            NULLIF(btrim(owner_external_ref->>'entity_id'), ''), ''
          ) <> ''
        )
      );
  END IF;
END $$;
```

### [`013_party_runtime_obligations.sql`](../../schemas/party-db/013_party_runtime_obligations.sql)

```sql
-- General party-scoped obligations.  These rows reuse the P16 change-set and
-- command-idempotency owners; they do not introduce a second runtime engine.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.party_item_placements'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE
          '%physical_position IS NULL%holder_character_id IS NOT NULL%'
        OR pg_get_constraintdef(oid) LIKE
          '%holder_character_id IS NULL%physical_position IS NOT NULL%'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE party_runtime.party_item_placements DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_holder_position_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_holder_position_check CHECK (
    (physical_position IS NOT NULL) = (
      holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION party_runtime.obligation_actor_ref_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND COALESCE(NULLIF(btrim(value->>'entity_kind'), ''), '') <> ''
    AND COALESCE(NULLIF(btrim(value->>'entity_id'), ''), '') <> '';
$$;

CREATE OR REPLACE FUNCTION party_runtime.obligation_actor_refs_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(value) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(value) AS reference(value)
      WHERE NOT party_runtime.obligation_actor_ref_valid(reference.value)
    );
$$;

CREATE TABLE IF NOT EXISTS party_runtime.party_obligations (
  obligation_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  policy_ref jsonb NOT NULL,
  policy_version text NOT NULL,
  promisor_ref jsonb NOT NULL,
  beneficiary_ref jsonb NOT NULL,
  witness_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  scope_snapshot jsonb NOT NULL,
  current_state text NOT NULL,
  current_state_fact text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  last_change_set_id text NOT NULL,
  UNIQUE(party_id, obligation_id),
  CHECK(
    jsonb_typeof(policy_ref) = 'object'
    AND COALESCE(
      NULLIF(btrim(policy_ref->>'entity_id'), ''),
      NULLIF(btrim(policy_ref->>'id'), ''),
      ''
    ) <> ''
    AND NULLIF(btrim(policy_version), '') IS NOT NULL
  ),
  CHECK(party_runtime.obligation_actor_ref_valid(promisor_ref)),
  CHECK(party_runtime.obligation_actor_ref_valid(beneficiary_ref)),
  CHECK(party_runtime.obligation_actor_refs_valid(witness_refs)),
  CHECK(jsonb_typeof(scope_snapshot) = 'object'),
  CHECK(NULLIF(btrim(current_state), '') IS NOT NULL),
  CHECK(NULLIF(btrim(current_state_fact), '') IS NOT NULL),
  FOREIGN KEY(party_id, created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id, last_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS party_runtime.party_obligation_transitions (
  obligation_transition_id text PRIMARY KEY,
  party_id text NOT NULL,
  obligation_id text NOT NULL,
  transition_ordinal integer NOT NULL CHECK(transition_ordinal >= 0),
  from_state text,
  to_state text NOT NULL,
  transition_kind text NOT NULL,
  causal_basis jsonb NOT NULL,
  witness_snapshot jsonb NOT NULL,
  activity_execution_id text
    REFERENCES party_runtime.party_timed_activity_executions(id)
    ON DELETE RESTRICT,
  check_resolution_id text
    REFERENCES party_runtime.party_check_resolutions(check_resolution_id)
    ON DELETE RESTRICT,
  npc_decision_request_id text
    REFERENCES party_runtime.party_npc_decision_traces(request_id)
    ON DELETE RESTRICT,
  change_set_id text NOT NULL,
  idempotency_record_id text
    REFERENCES party_runtime.party_command_idempotency(id)
    ON DELETE RESTRICT,
  occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn >= 0),
  occurred_at_whole_minutes numeric NOT NULL,
  occurred_at_subminute_numerator numeric NOT NULL,
  occurred_at_subminute_denominator numeric NOT NULL,
  UNIQUE(party_id, obligation_id, transition_ordinal),
  UNIQUE(
    party_id,
    obligation_id,
    idempotency_record_id,
    transition_ordinal
  ),
  CHECK(from_state IS NULL OR NULLIF(btrim(from_state), '') IS NOT NULL),
  CHECK(NULLIF(btrim(to_state), '') IS NOT NULL),
  CHECK(NULLIF(btrim(transition_kind), '') IS NOT NULL),
  CHECK(jsonb_typeof(causal_basis) = 'object'),
  CHECK(party_runtime.obligation_actor_refs_valid(witness_snapshot)),
  CHECK(party_runtime.game_timestamp_parts_valid(
    occurred_at_whole_minutes,
    occurred_at_subminute_numerator,
    occurred_at_subminute_denominator
  )),
  FOREIGN KEY(party_id, obligation_id)
    REFERENCES party_runtime.party_obligations(party_id, obligation_id)
    ON DELETE CASCADE,
  FOREIGN KEY(party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION party_runtime.obligation_current_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.party_id IS DISTINCT FROM OLD.party_id
    OR NEW.policy_ref IS DISTINCT FROM OLD.policy_ref
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.promisor_ref IS DISTINCT FROM OLD.promisor_ref
    OR NEW.beneficiary_ref IS DISTINCT FROM OLD.beneficiary_ref
    OR NEW.witness_refs IS DISTINCT FROM OLD.witness_refs
    OR NEW.scope_snapshot IS DISTINCT FROM OLD.scope_snapshot
    OR NEW.created_change_set_id IS DISTINCT FROM OLD.created_change_set_id
  THEN
    RAISE EXCEPTION
      'party_obligation_immutable_identity_or_scope: %', OLD.obligation_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER party_obligation_current_immutable
BEFORE UPDATE ON party_runtime.party_obligations
FOR EACH ROW EXECUTE FUNCTION party_runtime.obligation_current_immutable();

CREATE OR REPLACE TRIGGER party_obligation_transition_append_only
BEFORE UPDATE OR DELETE ON party_runtime.party_obligation_transitions
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();
```

### [`014_party_runtime_activity_resume_terminal.sql`](../../schemas/party-db/014_party_runtime_activity_resume_terminal.sql)

```sql
-- A resumed timed activity may reach its terminal boundary in the same
-- atomic command. The domain owner still performs paused -> active ->
-- completed/failed; the normalized execution row persists the final state,
-- while the new attempt remains append-only proof of the resumed interval.
CREATE OR REPLACE FUNCTION party_runtime.activity_execution_temporal_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active' OR NEW.state_version<>1
      OR NEW.next_attempt_ordinal<>0
      OR NEW.terminal_change_set_id IS NOT NULL THEN
      RAISE EXCEPTION 'activity execution initial state is invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT (
      NEW.state_version=OLD.state_version+1
      OR (OLD.status='paused'
        AND NEW.status IN ('completed','failed')
        AND NEW.state_version=OLD.state_version+2
        AND NEW.next_attempt_ordinal=OLD.next_attempt_ordinal+1
        AND NEW.terminal_change_set_id IS NOT NULL)
    )
    OR NEW.id<>OLD.id
    OR NEW.route_plan_execution_id<>OLD.route_plan_execution_id
    OR NEW.plan_step_ordinal<>OLD.plan_step_ordinal
    OR NEW.series_ordinal<>OLD.series_ordinal
    OR NEW.predecessor_activity_execution_id
      IS DISTINCT FROM OLD.predecessor_activity_execution_id
    OR NEW.activity_snapshot<>OLD.activity_snapshot
    OR NEW.started_at_whole_minutes<>OLD.started_at_whole_minutes
    OR NEW.started_at_subminute_numerator
      <>OLD.started_at_subminute_numerator
    OR NEW.started_at_subminute_denominator
      <>OLD.started_at_subminute_denominator THEN
    RAISE EXCEPTION
      'activity execution identity, static snapshot or state version changed';
  END IF;
  IF NOT (
    (OLD.status='active'
      AND NEW.status IN ('active','paused','completed','failed','aborted'))
    OR (OLD.status='paused' AND NEW.status IN ('active','aborted'))
    OR (OLD.status='paused'
      AND NEW.status IN ('completed','failed')
      AND NEW.state_version=OLD.state_version+2
      AND NEW.next_attempt_ordinal=OLD.next_attempt_ordinal+1
      AND NEW.terminal_change_set_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'activity execution lifecycle transition is invalid';
  END IF;
  IF NEW.next_attempt_ordinal<OLD.next_attempt_ordinal THEN
    RAISE EXCEPTION 'activity attempt cursor cannot decrease';
  END IF;
  IF OLD.last_processed_at_whole_minutes IS NOT NULL
    AND (NEW.last_processed_at_whole_minutes
      < OLD.last_processed_at_whole_minutes
      OR (NEW.last_processed_at_whole_minutes
        = OLD.last_processed_at_whole_minutes
        AND NEW.last_processed_at_subminute_numerator
          * OLD.last_processed_at_subminute_denominator
          < OLD.last_processed_at_subminute_numerator
            * NEW.last_processed_at_subminute_denominator)) THEN
    RAISE EXCEPTION 'activity last_processed_at must be monotonic';
  END IF;
  IF NEW.cumulative_elapsed_numerator*OLD.cumulative_elapsed_denominator
    < OLD.cumulative_elapsed_numerator*NEW.cumulative_elapsed_denominator THEN
    RAISE EXCEPTION 'activity elapsed time cannot decrease';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.activity_attempt_ordinal_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  execution_id_value text;
  execution_row party_runtime.party_timed_activity_executions%ROWTYPE;
  latest_attempt party_runtime.party_timed_activity_attempts%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='party_timed_activity_executions' THEN
    execution_id_value:=NEW.id;
  ELSE
    execution_id_value:=NEW.activity_execution_id;
  END IF;
  SELECT * INTO execution_row
    FROM party_runtime.party_timed_activity_executions
    WHERE id=execution_id_value;
  IF execution_row.id IS NULL
    OR execution_row.next_attempt_ordinal<>(
      SELECT count(*)
        FROM party_runtime.party_timed_activity_attempts a
        WHERE a.activity_execution_id=execution_id_value
    ) THEN
    RAISE EXCEPTION 'activity attempt ordinal/cursor mismatch';
  END IF;
  SELECT * INTO latest_attempt
    FROM party_runtime.party_timed_activity_attempts
    WHERE activity_execution_id=execution_id_value
    ORDER BY attempt_ordinal DESC LIMIT 1;
  IF latest_attempt.activity_execution_id IS NOT NULL AND (
    execution_row.last_processed_at_whole_minutes
      <>latest_attempt.ended_at_whole_minutes
    OR execution_row.last_processed_at_subminute_numerator
      <>latest_attempt.ended_at_subminute_numerator
    OR execution_row.last_processed_at_subminute_denominator
      <>latest_attempt.ended_at_subminute_denominator
  ) THEN
    RAISE EXCEPTION
      'activity last_processed_at does not match the latest attempt';
  END IF;
  IF execution_row.status IN ('completed','failed') AND (
    latest_attempt.activity_execution_id IS NULL
    OR latest_attempt.attempt_ordinal
      <>execution_row.next_attempt_ordinal-1
    OR latest_attempt.result_kind<>execution_row.status
    OR latest_attempt.result_change_set_id
      IS DISTINCT FROM execution_row.terminal_change_set_id
    OR latest_attempt.reason_code
      IS DISTINCT FROM execution_row.terminal_reason_code
    OR latest_attempt.cumulative_time_after_numerator
      * execution_row.cumulative_elapsed_denominator
      <>execution_row.cumulative_elapsed_numerator
        * latest_attempt.cumulative_time_after_denominator
    OR latest_attempt.remaining_after_numerator
      * execution_row.remaining_time_denominator
      <>execution_row.remaining_time_numerator
        * latest_attempt.remaining_after_denominator
    OR latest_attempt.progress_after IS DISTINCT FROM execution_row.progress
  ) THEN
    RAISE EXCEPTION
      'terminal activity execution does not match its append-only attempt';
  END IF;
  RETURN NEW;
END $$;
```

### [`015_party_runtime_turn_step_items.sql`](../../schemas/party-db/015_party_runtime_turn_step_items.sql)

```sql
-- Turn-step direct ordinary actions may create item instances without an
-- authored catalog template.  Such rows carry their complete, immutable
-- inventory mechanics input in party_items.state instead of using placeholder
-- catalog identifiers.

CREATE OR REPLACE FUNCTION
  party_runtime.runtime_item_jsonb_exact_keys(
    value jsonb,
    expected_keys text[]
  )
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(value) = 'object' THEN
      value ?& expected_keys
      AND (
        SELECT count(*) = cardinality(expected_keys)
        FROM jsonb_object_keys(value)
      )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION
  party_runtime.runtime_item_jsonb_exact_text(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(value) = 'string' THEN
      (value #>> '{}') <> ''
      AND btrim(
        value #>> '{}',
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
      ) = value #>> '{}'
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION
  party_runtime.runtime_instance_mechanics_snapshot_valid(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  provenance jsonb;
  mechanics jsonb;
  quantity jsonb;
  source_refs jsonb;
  source_ref jsonb;
  source_ref_text text;
  seen_source_refs text[] := ARRAY[]::text[];
  numeric_value numeric;
BEGIN
  IF value IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      value,
      ARRAY['schema','version','provenance','mechanics']
    )
    OR jsonb_typeof(value->'schema') <> 'string'
    OR value->>'schema'
      <> 'rus.items.runtime_instance_mechanics_snapshot.v1'
  THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(value->'version') <> 'number' THEN
    RETURN false;
  END IF;
  IF (value->>'version')::numeric <> 1 THEN
    RETURN false;
  END IF;

  provenance := value->'provenance';
  IF provenance IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      provenance,
      ARRAY[
        'source_kind','root_turn_id','step_index','operation_ref',
        'origin_kind','source_refs'
      ]
    )
    OR jsonb_typeof(provenance->'source_kind') <> 'string'
    OR provenance->>'source_kind' <> 'ordinary_direct_action_result'
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'root_turn_id'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'operation_ref'
    )
    OR jsonb_typeof(provenance->'origin_kind') <> 'string'
    OR provenance->>'origin_kind' NOT IN (
      'direct_partition','ambient_ordinary','crafted'
    )
  THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(provenance->'step_index') <> 'number' THEN
    RETURN false;
  END IF;
  numeric_value := (provenance->>'step_index')::numeric;
  IF numeric_value <= 0
    OR numeric_value > 8
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;

  source_refs := provenance->'source_refs';
  IF source_refs IS NULL
    OR jsonb_typeof(source_refs) <> 'array'
  THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(source_refs) = 0 THEN
    RETURN false;
  END IF;
  FOR source_ref IN SELECT entry.value
    FROM jsonb_array_elements(source_refs) AS entry(value)
  LOOP
    IF NOT party_runtime.runtime_item_jsonb_exact_text(source_ref) THEN
      RETURN false;
    END IF;
    source_ref_text := source_ref #>> '{}';
    IF source_ref_text = ANY(seen_source_refs) THEN
      RETURN false;
    END IF;
    seen_source_refs := array_append(seen_source_refs, source_ref_text);
  END LOOP;

  mechanics := value->'mechanics';
  IF mechanics IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      mechanics,
      ARRAY[
        'mass_grams','external_hand_cost','carry_form','packing_slot_cost',
        'quantity','container'
      ]
    )
    OR jsonb_typeof(mechanics->'mass_grams') <> 'number'
    OR jsonb_typeof(mechanics->'external_hand_cost') <> 'number'
    OR jsonb_typeof(mechanics->'carry_form') <> 'string'
    OR mechanics->>'carry_form' NOT IN (
      'compact','regular','long','bulky'
    )
    OR jsonb_typeof(mechanics->'packing_slot_cost') <> 'number'
    OR mechanics->'container' <> 'null'::jsonb
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'mass_grams')::numeric;
  IF numeric_value < 0
    OR numeric_value > 9007199254740991
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'external_hand_cost')::numeric;
  IF numeric_value NOT IN (0, 1, 2)
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'packing_slot_cost')::numeric;
  IF numeric_value < 0
    OR numeric_value > 9007199254740991
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;

  quantity := mechanics->'quantity';
  IF quantity <> 'null'::jsonb THEN
    IF NOT party_runtime.runtime_item_jsonb_exact_keys(
        quantity,
        ARRAY['value','unit']
      )
      OR jsonb_typeof(quantity->'value') <> 'number'
      OR NOT party_runtime.runtime_item_jsonb_exact_text(quantity->'unit')
    THEN
      RETURN false;
    END IF;
    numeric_value := (quantity->>'value')::numeric;
    IF numeric_value <= 0
      OR numeric_value > 1.7976931348623157e308
      OR numeric_value < 4.9406564584124654e-324
    THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END $$;

ALTER TABLE party_runtime.party_items
  ALTER COLUMN run_id DROP NOT NULL,
  ALTER COLUMN template_id DROP NOT NULL,
  ALTER COLUMN profile_id DROP NOT NULL,
  ALTER COLUMN category_id DROP NOT NULL;

DO $$
BEGIN
  IF to_regprocedure(
    'party_runtime.ordinary_world_runtime_instance_mechanics_snapshot_valid(jsonb)'
  ) IS NULL THEN
    ALTER TABLE party_runtime.party_items
      DROP CONSTRAINT IF EXISTS party_items_mechanics_source_check;
    ALTER TABLE party_runtime.party_items
      ADD CONSTRAINT party_items_mechanics_source_check CHECK (
        (
          run_id IS NOT NULL
          AND template_id IS NOT NULL
          AND profile_id IS NOT NULL
          AND category_id IS NOT NULL
          AND NOT state ? 'runtime_instance_mechanics_snapshot'
        )
        OR (
          run_id IS NULL
          AND template_id IS NULL
          AND profile_id IS NULL
          AND category_id IS NULL
          AND party_runtime.runtime_instance_mechanics_snapshot_valid(
            state->'runtime_instance_mechanics_snapshot'
          )
        )
      );
  END IF;
END $$;

ALTER TABLE party_runtime.party_item_placements
  ADD COLUMN IF NOT EXISTS attached_item_id text;
ALTER TABLE party_runtime.party_item_placements
  ADD COLUMN IF NOT EXISTS scene_position_id text;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.party_item_placements'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%anchor_id%container_id%holder_npc_id%holder_character_id%'
      AND pg_get_constraintdef(oid) NOT LIKE '%attached_item_id%'
  LOOP
    EXECUTE format(
      'ALTER TABLE party_runtime.party_item_placements DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;

END $$;

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_owner_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_owner_check CHECK (
    (CASE WHEN anchor_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN scene_position_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN container_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN holder_npc_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN holder_character_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN attached_item_id IS NULL THEN 0 ELSE 1 END) = 1
  );

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_attached_item_fk;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_attached_item_fk
  FOREIGN KEY (party_id, attached_item_id)
  REFERENCES party_runtime.party_items(party_id, item_id)
  ON DELETE RESTRICT;

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_no_self_attachment_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_no_self_attachment_check
  CHECK (attached_item_id IS NULL OR attached_item_id <> item_id);
```

### [`016_party_runtime_npc_semantic_conversation.sql`](../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql)

```sql
-- Semantic NPC decisions reuse the existing decision trace owner.  Bounded
-- decisions remain valid while semantic decisions carry their complete replay
-- identity and plan in the same append-only relation.

ALTER TABLE party_runtime.party_npc_decision_traces
  ALTER COLUMN option_id DROP NOT NULL,
  ALTER COLUMN command_token DROP NOT NULL,
  ALTER COLUMN options_digest DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS boundary_id text,
  ADD COLUMN IF NOT EXISTS decision_mode text,
  ADD COLUMN IF NOT EXISTS root_turn_id text,
  ADD COLUMN IF NOT EXISTS working_revision bigint,
  ADD COLUMN IF NOT EXISTS signal_refs jsonb,
  ADD COLUMN IF NOT EXISTS decision_categories jsonb,
  ADD COLUMN IF NOT EXISTS aggregate_significance text,
  ADD COLUMN IF NOT EXISTS same_time_batch_ref jsonb,
  ADD COLUMN IF NOT EXISTS semantic_request jsonb,
  ADD COLUMN IF NOT EXISTS boundary_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS signal_records jsonb,
  ADD COLUMN IF NOT EXISTS semantic_plan jsonb,
  ADD COLUMN IF NOT EXISTS canonical_input_digest text,
  ADD COLUMN IF NOT EXISTS semantic_trace_schema text;

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_decision_mode_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_decision_mode_check CHECK (
    decision_mode IS NULL
    OR decision_mode IN ('autonomous', 'conversation', 'combat')
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_working_revision_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_working_revision_check CHECK (
    working_revision IS NULL OR working_revision >= 0
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_categories_check;

CREATE OR REPLACE FUNCTION party_runtime.npc_semantic_categories_valid(
  categories jsonb
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN categories IS NULL
      OR jsonb_typeof(categories) <> 'array'
      OR jsonb_array_length(categories) = 0 THEN false
    ELSE categories = (
      SELECT jsonb_agg(category ORDER BY ordinal)
      FROM (VALUES
        ('self', 1),
        ('others', 2),
        ('environment', 3),
        ('objective', 4),
        ('communication', 5)
      ) AS allowed(category, ordinal)
      WHERE categories ? category
    )
  END
$$;

ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_categories_check CHECK (
    decision_categories IS NULL
    OR party_runtime.npc_semantic_categories_valid(decision_categories)
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_json_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_json_check CHECK (
    (signal_refs IS NULL OR jsonb_typeof(signal_refs) = 'array')
    AND (same_time_batch_ref IS NULL OR jsonb_typeof(same_time_batch_ref) = 'object')
    AND (semantic_request IS NULL OR jsonb_typeof(semantic_request) = 'object')
    AND (boundary_snapshot IS NULL OR jsonb_typeof(boundary_snapshot) = 'object')
    AND (signal_records IS NULL OR jsonb_typeof(signal_records) = 'array')
    AND (semantic_plan IS NULL OR jsonb_typeof(semantic_plan) = 'object')
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_significance_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_significance_check CHECK (
    aggregate_significance IS NULL
    OR aggregate_significance IN ('material', 'critical')
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_schema_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_schema_check CHECK (
    semantic_trace_schema IS NULL
    OR semantic_trace_schema = 'npc_semantic_decision_trace_v1'
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_branch_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_branch_check CHECK (
    (
      option_id IS NOT NULL
      AND command_token IS NOT NULL
      AND options_digest IS NOT NULL
      AND boundary_id IS NULL
      AND decision_mode IS NULL
      AND root_turn_id IS NULL
      AND working_revision IS NULL
      AND signal_refs IS NULL
      AND decision_categories IS NULL
      AND aggregate_significance IS NULL
      AND same_time_batch_ref IS NULL
      AND semantic_request IS NULL
      AND boundary_snapshot IS NULL
      AND signal_records IS NULL
      AND semantic_plan IS NULL
      AND canonical_input_digest IS NULL
      AND semantic_trace_schema IS NULL
    )
    OR
    (
      option_id IS NULL
      AND command_token IS NULL
      AND options_digest IS NULL
      AND boundary_id IS NOT NULL
      AND decision_mode IS NOT NULL
      AND root_turn_id IS NOT NULL
      AND working_revision IS NOT NULL
      AND signal_refs IS NOT NULL
      AND decision_categories IS NOT NULL
      AND aggregate_significance IS NOT NULL
      AND same_time_batch_ref IS NOT NULL
      AND semantic_request IS NOT NULL
      AND boundary_snapshot IS NOT NULL
      AND signal_records IS NOT NULL
      AND semantic_plan IS NOT NULL
      AND canonical_input_digest IS NOT NULL
      AND semantic_trace_schema IS NOT NULL
      AND change_set_id IS NOT NULL
      AND status = 'committed'
    )
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_change_set_fk;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_change_set_fk
  FOREIGN KEY (party_id, change_set_id)
  REFERENCES party_runtime.party_v3_change_sets(party_id, id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS party_npc_decision_traces_boundary_key
  ON party_runtime.party_npc_decision_traces (party_id, boundary_id)
  WHERE boundary_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS party_npc_decision_traces_batch_npc_key
  ON party_runtime.party_npc_decision_traces (
    party_id,
    npc_id,
    (same_time_batch_ref ->> 'entity_id')
  )
  WHERE boundary_id IS NOT NULL;

-- Conversation sessions are mutable current projections updated through CAS.
CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_sessions (
  conversation_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  state_version bigint NOT NULL CHECK (state_version >= 1),
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'ended')),
  started_at jsonb NOT NULL CHECK (jsonb_typeof(started_at) = 'object'),
  location_ref jsonb NOT NULL CHECK (jsonb_typeof(location_ref) = 'object'),
  initiator_ref jsonb NOT NULL CHECK (jsonb_typeof(initiator_ref) = 'object'),
  active_participant_refs jsonb NOT NULL
    CHECK (jsonb_typeof(active_participant_refs) = 'array'),
  last_contribution_ref jsonb
    CHECK (
      last_contribution_ref IS NULL
      OR jsonb_typeof(last_contribution_ref) = 'object'
    ),
  topic_refs jsonb NOT NULL CHECK (jsonb_typeof(topic_refs) = 'array'),
  status_reason text,
  updated_change_set_id text NOT NULL,
  canonical_digest text NOT NULL,
  session_schema text NOT NULL
    CHECK (session_schema = 'conversation_session_v1'),
  UNIQUE (party_id, conversation_id),
  FOREIGN KEY (party_id, updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION party_runtime.conversation_session_lifecycle_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.party_id IS DISTINCT FROM OLD.party_id
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.initiator_ref IS DISTINCT FROM OLD.initiator_ref
    OR NEW.state_version <> OLD.state_version + 1
  THEN
    RAISE EXCEPTION
      'conversation session identity or state version changed: %',
      OLD.conversation_id;
  END IF;

  IF NOT (
    (OLD.status = 'active' AND NEW.status IN ('active', 'suspended', 'ended'))
    OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'suspended', 'ended'))
  ) THEN
    RAISE EXCEPTION
      'conversation session lifecycle transition is invalid: %',
      OLD.conversation_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS conversation_session_lifecycle_valid
  ON party_runtime.party_conversation_sessions;
CREATE TRIGGER conversation_session_lifecycle_valid
BEFORE UPDATE
ON party_runtime.party_conversation_sessions
FOR EACH ROW EXECUTE FUNCTION
  party_runtime.conversation_session_lifecycle_valid();

-- Statements are the immutable factual transcript of a conversation.
CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_statements (
  statement_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  exchange_id text NOT NULL,
  speaker_ref jsonb NOT NULL CHECK (jsonb_typeof(speaker_ref) = 'object'),
  intended_addressee_refs jsonb NOT NULL
    CHECK (jsonb_typeof(intended_addressee_refs) = 'array'),
  utterance_text text NOT NULL,
  dominant_act text NOT NULL,
  interaction_tags jsonb NOT NULL
    CHECK (jsonb_typeof(interaction_tags) = 'array'),
  topic_refs jsonb NOT NULL CHECK (jsonb_typeof(topic_refs) = 'array'),
  claims jsonb NOT NULL CHECK (jsonb_typeof(claims) = 'array'),
  message_completeness text NOT NULL
    CHECK (message_completeness = 'complete'),
  spoken_at jsonb NOT NULL CHECK (jsonb_typeof(spoken_at) = 'object'),
  duration jsonb NOT NULL CHECK (jsonb_typeof(duration) = 'object'),
  social_delivery_result jsonb
    CHECK (
      social_delivery_result IS NULL
      OR jsonb_typeof(social_delivery_result) = 'object'
    ),
  source_plan_ref jsonb NOT NULL
    CHECK (jsonb_typeof(source_plan_ref) = 'object'),
  audience_projection jsonb NOT NULL
    CHECK (
      jsonb_typeof(audience_projection) = 'object'
      AND audience_projection ->> 'schema'
        = 'conversation_audience_projection_v1'
      AND audience_projection -> 'statement_ref' ->> 'entity_kind'
        = 'conversation_statement'
      AND audience_projection -> 'statement_ref' ->> 'entity_id'
        = statement_id
    ),
  audience_digest text NOT NULL CHECK (length(audience_digest) > 0),
  change_set_id text NOT NULL,
  statement_schema text NOT NULL
    CHECK (statement_schema = 'conversation_statement_event_v1'),
  idempotency_key text NOT NULL,
  canonical_digest text NOT NULL,
  FOREIGN KEY (party_id, conversation_id)
    REFERENCES party_runtime.party_conversation_sessions(
      party_id,
      conversation_id
    )
    ON DELETE CASCADE,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT,
  UNIQUE (party_id, idempotency_key)
);

DROP TRIGGER IF EXISTS temporal_append_only
  ON party_runtime.party_conversation_statements;
CREATE TRIGGER temporal_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_conversation_statements
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();

CREATE INDEX IF NOT EXISTS party_conversation_sessions_party_status_idx
  ON party_runtime.party_conversation_sessions (party_id, status);

CREATE INDEX IF NOT EXISTS party_conversation_statements_conversation_exchange_idx
  ON party_runtime.party_conversation_statements (conversation_id, exchange_id);
```

### [`017_party_runtime_conversation_transcript.sql`](../../schemas/party-db/017_party_runtime_conversation_transcript.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_contributions (
  contribution_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  exchange_id text NOT NULL,
  party_state_version integer NOT NULL CHECK (party_state_version > 0),
  session_state_version integer NOT NULL CHECK (session_state_version > 0),
  contribution_index integer NOT NULL CHECK (contribution_index > 0),
  contribution_schema text NOT NULL CHECK (
    contribution_schema IN (
      'conversation_statement_event_v1',
      'conversation_non_statement_contribution_v1'
    )
  ),
  contribution_payload jsonb NOT NULL
    CHECK (jsonb_typeof(contribution_payload) = 'object'),
  change_set_id text NOT NULL,
  idempotency_key text NOT NULL,
  canonical_digest text NOT NULL,
  FOREIGN KEY (party_id, conversation_id)
    REFERENCES party_runtime.party_conversation_sessions(
      party_id,
      conversation_id
    ) ON DELETE CASCADE,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT,
  UNIQUE (party_id, conversation_id, session_state_version, contribution_index),
  UNIQUE (party_id, idempotency_key)
);

DROP TRIGGER IF EXISTS temporal_append_only
  ON party_runtime.party_conversation_contributions;
CREATE TRIGGER temporal_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_conversation_contributions
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();

CREATE INDEX IF NOT EXISTS party_conversation_contributions_transcript_idx
  ON party_runtime.party_conversation_contributions (
    party_id,
    conversation_id,
    session_state_version,
    contribution_index
  );
```

### [`018_party_runtime_phase7_container_state.sql`](../../schemas/party-db/018_party_runtime_phase7_container_state.sql)

```sql
-- Phase 7 keeps the authored tied closure state on the already materialized
-- road-bag container. No new relation or ownership model is introduced.

ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_closure_state_check;

ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_closure_state_check CHECK (
    closure_state IN ('open', 'closed', 'locked', 'unavailable', 'tied')
  );
```

### [`019_party_runtime_combat_sessions.sql`](../../schemas/party-db/019_party_runtime_combat_sessions.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_combat_sessions (
  combat_id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  state_version bigint NOT NULL CHECK(state_version >= 1),
  status text NOT NULL CHECK(status IN ('active','paused_for_player','paused_for_decisions','ended')),
  started_at jsonb NOT NULL CHECK (jsonb_typeof(started_at) = 'object'),
  scope_ref jsonb NOT NULL CHECK (jsonb_typeof(scope_ref) = 'object'),
  participant_refs jsonb NOT NULL
    CHECK (jsonb_typeof(participant_refs) = 'array'),
  participant_states jsonb NOT NULL
    CHECK (jsonb_typeof(participant_states) = 'array'),
  exchange_ordinal bigint NOT NULL CHECK(exchange_ordinal >= 0),
  last_exchange_ref jsonb
    CHECK (
      last_exchange_ref IS NULL
      OR jsonb_typeof(last_exchange_ref) = 'object'
    ),
  player_response_required boolean NOT NULL,
  last_change_set_id text NOT NULL,
  canonical_digest text NOT NULL,
  session_schema text NOT NULL CHECK(session_schema = 'combat_session_v1'),
  UNIQUE(combat_id, party_id),
  FOREIGN KEY (party_id, last_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION party_runtime.combat_session_lifecycle_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.combat_id IS DISTINCT FROM OLD.combat_id
    OR NEW.party_id IS DISTINCT FROM OLD.party_id
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.scope_ref IS DISTINCT FROM OLD.scope_ref
    OR NEW.state_version <> OLD.state_version + 1
    OR NEW.exchange_ordinal < OLD.exchange_ordinal
  THEN
    RAISE EXCEPTION
      'combat session identity, ordinal or state version changed: %',
      OLD.combat_id;
  END IF;

  IF NOT (
    (OLD.status = 'active'
      AND NEW.status IN (
        'active', 'paused_for_player', 'paused_for_decisions', 'ended'
      ))
    OR (OLD.status = 'paused_for_player'
      AND NEW.status IN ('active', 'paused_for_player', 'ended'))
    OR (OLD.status = 'paused_for_decisions'
      AND NEW.status IN ('active', 'paused_for_decisions', 'ended'))
  ) THEN
    RAISE EXCEPTION
      'combat session lifecycle transition is invalid: %',
      OLD.combat_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS combat_session_lifecycle_valid
  ON party_runtime.party_combat_sessions;
CREATE TRIGGER combat_session_lifecycle_valid
BEFORE UPDATE
ON party_runtime.party_combat_sessions
FOR EACH ROW EXECUTE FUNCTION
  party_runtime.combat_session_lifecycle_valid();

CREATE INDEX IF NOT EXISTS party_combat_sessions_party_idx
  ON party_runtime.party_combat_sessions(party_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS party_combat_sessions_one_open_per_party_uq
  ON party_runtime.party_combat_sessions(party_id)
  WHERE status <> 'ended';
```

### [`020_party_runtime_actor_equipment.sql`](../../schemas/party-db/020_party_runtime_actor_equipment.sql)

```sql
-- Equipment is a placement of an existing item and may be controlled by an
-- NPC or by a player character. Existing rows are not rewritten.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.party_item_placements'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE '%equipment_slot_category_id%'
        OR (
          pg_get_constraintdef(oid) LIKE '%physical_position%'
          AND pg_get_constraintdef(oid) LIKE '%holder_character_id%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE party_runtime.party_item_placements DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_actor_position_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_actor_position_check CHECK (
    (physical_position IS NOT NULL) = (
      holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL
    )
  );

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_equipment_slot_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_equipment_slot_check CHECK (
    equipment_slot_category_id IS NULL
    OR (
      physical_position = 'equipped'
      AND (holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL)
    )
  );

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_equipped_requires_slot_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_equipped_requires_slot_check CHECK (
    physical_position IS DISTINCT FROM 'equipped'
    OR equipment_slot_category_id IS NOT NULL
  );

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.party_containers'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE '%equipment_slot_category_id%'
        OR (
          pg_get_constraintdef(oid) LIKE '%physical_position%'
          AND pg_get_constraintdef(oid) LIKE '%holder_character_id%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE party_runtime.party_containers DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_actor_position_check;
ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_actor_position_check CHECK (
    (physical_position IS NOT NULL) = (
      holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_equipment_slot_check;
ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_equipment_slot_check CHECK (
    equipment_slot_category_id IS NULL
    OR (
      physical_position = 'equipped'
      AND (holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL)
    )
  );

ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_equipped_requires_slot_check;
ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_equipped_requires_slot_check CHECK (
    physical_position IS DISTINCT FROM 'equipped'
    OR equipment_slot_category_id IS NOT NULL
  );
```

### [`021_party_runtime_ordinary_materialization.sql`](../../schemas/party-db/021_party_runtime_ordinary_materialization.sql)

```sql
-- Closed party-scoped ordinary-materialization state; not an event log.
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_aggregates (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('g6', 'scene_position', 'container', 'source')),
  scope_id TEXT NOT NULL CHECK (
    scope_id <> ''
    AND scope_id !~ '^[[:space:]]|[[:space:]]$'
    AND scope_id !~ '[[:cntrl:]]'
  ),
  state_version BIGINT NOT NULL CHECK (state_version >= 0),
  aggregate_payload JSONB NOT NULL CHECK (jsonb_typeof(aggregate_payload) = 'object'),
  PRIMARY KEY (party_id, scope_kind, scope_id)
);
```

### [`022_party_runtime_ordinary_materialization_commit.sql`](../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql)

```sql
ALTER TABLE party_runtime.party_ordinary_materialization_aggregates
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_aggregates_state_version_check;
ALTER TABLE party_runtime.party_ordinary_materialization_aggregates
  ADD CONSTRAINT party_ordinary_materialization_aggregates_state_version_check
  CHECK (state_version >= 0 AND state_version <= 9007199254740991);
ALTER TABLE party_runtime.parties
  DROP CONSTRAINT IF EXISTS party_runtime_parties_state_version_safe_integer_check;
ALTER TABLE party_runtime.parties
  ADD CONSTRAINT party_runtime_parties_state_version_safe_integer_check
  CHECK (state_version <= 9007199254740991);

CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_contexts (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('g6','scene_position','container','source')),
  scope_id TEXT NOT NULL,
  catalog_version BIGINT NOT NULL CHECK (catalog_version >= 0 AND catalog_version <= 9007199254740991),
  property_version BIGINT NOT NULL CHECK (property_version >= 0 AND property_version <= 9007199254740991),
  placement_version BIGINT NOT NULL CHECK (placement_version >= 0 AND placement_version <= 9007199254740991),
  supporting_basis_catalog_version BIGINT NOT NULL DEFAULT 0 CHECK (supporting_basis_catalog_version >= 0 AND supporting_basis_catalog_version <= 9007199254740991),
  supporting_basis_catalog_digest TEXT NOT NULL CHECK (supporting_basis_catalog_digest <> ''),
  property_placement_context_digest TEXT NOT NULL CHECK (property_placement_context_digest <> ''),
  property_placement_base_snapshot JSONB NOT NULL CHECK (jsonb_typeof(property_placement_base_snapshot) = 'object'),
  PRIMARY KEY (party_id,scope_kind,scope_id),
  FOREIGN KEY (party_id,scope_kind,scope_id)
    REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_commits (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  request_identity TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  transition_digest TEXT NOT NULL,
  write_plan_digest TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('materialize','absent','no_change','authority_required')),
  transition_count SMALLINT NOT NULL CHECK (transition_count IN (1,2)),
  from_party_state_version BIGINT NOT NULL CHECK (from_party_state_version >= 0 AND from_party_state_version <= 9007199254740991),
  to_party_state_version BIGINT NOT NULL CHECK (to_party_state_version = from_party_state_version + 1),
  from_ordinary_state_version BIGINT NOT NULL CHECK (from_ordinary_state_version >= 0 AND from_ordinary_state_version <= 9007199254740991),
  to_ordinary_state_version BIGINT NOT NULL CHECK (to_ordinary_state_version = from_ordinary_state_version + transition_count),
  item_id TEXT,
  PRIMARY KEY (party_id,request_identity),
  UNIQUE (party_id,scope_kind,scope_id,request_identity),
  UNIQUE (party_id,request_identity,transition_digest),
  FOREIGN KEY (party_id,scope_kind,scope_id) REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id) ON DELETE CASCADE,
  CHECK ((resolution = 'materialize') = (item_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_basis_catalog (
  party_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  basis_ref TEXT NOT NULL,
  origin_request_identity TEXT,
  basis_snapshot JSONB NOT NULL CHECK (jsonb_typeof(basis_snapshot) = 'object'),
  PRIMARY KEY (party_id,scope_kind,scope_id,basis_ref),
  FOREIGN KEY (party_id,origin_request_identity) REFERENCES party_runtime.party_ordinary_materialization_commits(party_id,request_identity) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id) REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id) ON DELETE CASCADE,
  CHECK (basis_ref <> '' AND basis_snapshot ->> 'basis_ref' = basis_ref),
  CHECK (basis_snapshot ->> 'state' IN ('committed','prepared_seed')),
  CHECK (basis_snapshot -> 'scope_ref' ->> 'entity_kind' = scope_kind),
  CHECK (basis_snapshot -> 'scope_ref' ->> 'entity_id' = scope_id),
  CHECK ((basis_snapshot ->> 'state' = 'prepared_seed') = (origin_request_identity IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_items (
  party_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  request_identity TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  candidate_key TEXT NOT NULL,
  coverage_key TEXT NOT NULL,
  context_version TEXT NOT NULL,
  functional_bucket TEXT NOT NULL,
  admission_class TEXT NOT NULL,
  supporting_basis_ref TEXT NOT NULL,
  causal_basis_refs JSONB NOT NULL CHECK (jsonb_typeof(causal_basis_refs) = 'array'),
  property_basis_ref TEXT NOT NULL,
  position_ref TEXT NOT NULL,
  property_placement_context_digest TEXT NOT NULL,
  property_catalog_version_ref TEXT NOT NULL,
  placement_catalog_version_ref TEXT NOT NULL,
  property_placement_evidence JSONB NOT NULL CHECK (jsonb_typeof(property_placement_evidence) = 'object'),
  mechanics_policy_ref TEXT NOT NULL,
  item_proposal JSONB NOT NULL CHECK (jsonb_typeof(item_proposal) = 'object'),
  mechanics_snapshot JSONB NOT NULL CHECK (jsonb_typeof(mechanics_snapshot) = 'object'),
  PRIMARY KEY (party_id,item_id),
  UNIQUE (party_id,request_identity),
  UNIQUE (party_id,request_identity,item_id),
  UNIQUE (party_id,scope_kind,scope_id,candidate_key,coverage_key,context_version),
  FOREIGN KEY (party_id,request_identity) REFERENCES party_runtime.party_ordinary_materialization_commits(party_id,request_identity) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id) REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id,supporting_basis_ref) REFERENCES party_runtime.party_ordinary_materialization_basis_catalog(party_id,scope_kind,scope_id,basis_ref) ON DELETE RESTRICT,
  CONSTRAINT party_ordinary_materialization_items_item_proposal_schema_check CHECK (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v1'),
  CONSTRAINT party_ordinary_materialization_items_property_placement_evidence_schema_check CHECK (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v2'),
  CHECK (property_placement_evidence ->> 'property_placement_context_digest' = property_placement_context_digest),
  CHECK (property_placement_evidence ->> 'property_catalog_version_ref' = property_catalog_version_ref),
  CHECK (property_placement_evidence ->> 'placement_catalog_version_ref' = placement_catalog_version_ref),
  CHECK (property_placement_evidence ->> 'property_basis_ref' = property_basis_ref),
  CHECK (property_placement_evidence -> 'placement' ->> 'position_ref' = position_ref),
  CHECK (mechanics_snapshot ->> 'schema' = 'rus.items.runtime_instance_mechanics_snapshot.v2'),
  CHECK (mechanics_snapshot -> 'provenance' ->> 'source_kind' = 'ordinary_world_materialization')
);
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_item_fk;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_item_fk
  FOREIGN KEY (party_id,request_identity,item_id)
  REFERENCES party_runtime.party_ordinary_materialization_items(party_id,request_identity,item_id)
  DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_item_basis_refs (
  party_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  basis_ref TEXT NOT NULL,
  PRIMARY KEY (party_id,item_id,basis_ref),
  FOREIGN KEY (party_id,item_id) REFERENCES party_runtime.party_ordinary_materialization_items(party_id,item_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id,basis_ref) REFERENCES party_runtime.party_ordinary_materialization_basis_catalog(party_id,scope_kind,scope_id,basis_ref) ON DELETE CASCADE
);
```

### [`023_party_runtime_ordinary_materialization_enablement.sql`](../../schemas/party-db/023_party_runtime_ordinary_materialization_enablement.sql)

```sql
-- Authored, party-scoped O1 authority. The aggregate and property-placement
-- context remain in 021/022; this row supplies the immutable server objective
-- and policy snapshot required before a model may be called.
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_enablements (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind = 'g6'),
  scope_id TEXT NOT NULL CHECK (scope_id <> ''),
  objective_snapshot JSONB NOT NULL CHECK (jsonb_typeof(objective_snapshot) = 'object'),
  objective_digest TEXT NOT NULL CHECK (objective_digest <> ''),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (party_id, scope_kind, scope_id),
  FOREIGN KEY (party_id, scope_kind, scope_id)
    REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id, scope_kind, scope_id)
    ON DELETE CASCADE,
  FOREIGN KEY (party_id, scope_kind, scope_id)
    REFERENCES party_runtime.party_ordinary_materialization_contexts(party_id, scope_kind, scope_id)
    ON DELETE CASCADE,
  CHECK (objective_snapshot -> 'scope_ref' ->> 'entity_kind' = scope_kind),
  CHECK (objective_snapshot -> 'scope_ref' ->> 'entity_id' = scope_id)
);
```

### [`024_party_runtime_ordinary_world_items.sql`](../../schemas/party-db/024_party_runtime_ordinary_world_items.sql)

```sql
-- O1 ordinary-world materialization persists template-less items in the same
-- normalized item store as other runtime instances. Its provenance remains a
-- separate, closed v2 contract; direct-action v1 is not widened.

CREATE OR REPLACE FUNCTION
  party_runtime.ordinary_world_runtime_instance_mechanics_snapshot_valid(
    value jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  provenance jsonb;
  mechanics jsonb;
  quantity jsonb;
  source_refs jsonb;
  source_ref jsonb;
  source_ref_text text;
  previous_source_ref text := NULL;
  numeric_value numeric;
BEGIN
  IF value IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      value,
      ARRAY['schema','version','provenance','mechanics']
    )
    OR jsonb_typeof(value->'schema') <> 'string'
    OR value->>'schema'
      <> 'rus.items.runtime_instance_mechanics_snapshot.v2'
    OR jsonb_typeof(value->'version') <> 'number'
    OR (value->>'version')::numeric <> 2
  THEN
    RETURN false;
  END IF;

  provenance := value->'provenance';
  IF provenance IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      provenance,
      ARRAY[
        'source_kind','causal_ref','request_id','candidate_key',
        'coverage_key','context_version','policy_ref','source_refs'
      ]
    )
    OR jsonb_typeof(provenance->'source_kind') <> 'string'
    OR provenance->>'source_kind' <> 'ordinary_world_materialization'
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'causal_ref'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'request_id'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'candidate_key'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'coverage_key'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'context_version'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'policy_ref'
    )
  THEN
    RETURN false;
  END IF;

  source_refs := provenance->'source_refs';
  IF source_refs IS NULL
    OR jsonb_typeof(source_refs) <> 'array'
    OR jsonb_array_length(source_refs) = 0
  THEN
    RETURN false;
  END IF;
  FOR source_ref IN SELECT entry.value
    FROM jsonb_array_elements(source_refs) WITH ORDINALITY AS entry(value, n)
    ORDER BY entry.n
  LOOP
    IF NOT party_runtime.runtime_item_jsonb_exact_text(source_ref) THEN
      RETURN false;
    END IF;
    source_ref_text := source_ref #>> '{}';
    IF previous_source_ref IS NOT NULL
      AND previous_source_ref >= source_ref_text
    THEN
      RETURN false;
    END IF;
    previous_source_ref := source_ref_text;
  END LOOP;

  mechanics := value->'mechanics';
  IF mechanics IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      mechanics,
      ARRAY[
        'mass_grams','external_hand_cost','carry_form','packing_slot_cost',
        'quantity','container'
      ]
    )
    OR jsonb_typeof(mechanics->'mass_grams') <> 'number'
    OR jsonb_typeof(mechanics->'external_hand_cost') <> 'number'
    OR jsonb_typeof(mechanics->'carry_form') <> 'string'
    OR mechanics->>'carry_form' NOT IN (
      'compact','regular','long','bulky'
    )
    OR jsonb_typeof(mechanics->'packing_slot_cost') <> 'number'
    OR mechanics->'container' <> 'null'::jsonb
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'mass_grams')::numeric;
  IF numeric_value < 1
    OR numeric_value > 9007199254740991
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'external_hand_cost')::numeric;
  IF numeric_value NOT IN (0, 1, 2)
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'packing_slot_cost')::numeric;
  IF numeric_value < 0
    OR numeric_value > 9007199254740991
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;

  quantity := mechanics->'quantity';
  IF NOT party_runtime.runtime_item_jsonb_exact_keys(
      quantity,
      ARRAY['value','unit']
    )
    OR jsonb_typeof(quantity->'value') <> 'number'
    OR jsonb_typeof(quantity->'unit') <> 'string'
    OR quantity->>'unit' <> 'item'
  THEN
    RETURN false;
  END IF;
  numeric_value := (quantity->>'value')::numeric;
  IF numeric_value < 1
    OR numeric_value > 9007199254740991
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;

  RETURN true;
END $$;

-- O1 concrete content is placed in the active Spatial v3 scene position.
ALTER TABLE party_runtime.party_item_placements
  ADD COLUMN IF NOT EXISTS scene_position_id text;

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_owner_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_owner_check CHECK (
    (CASE WHEN anchor_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN scene_position_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN container_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN holder_npc_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN holder_character_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN attached_item_id IS NULL THEN 0 ELSE 1 END) = 1
  );

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_scene_position_fk;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_scene_position_fk
  FOREIGN KEY (scene_position_id)
  REFERENCES party_runtime.scene_position_nodes(id)
  ON DELETE RESTRICT;

DO $$
BEGIN
  IF to_regprocedure(
    'party_runtime.ordinary_container_runtime_mechanics_snapshot_valid(jsonb)'
  ) IS NULL THEN
    ALTER TABLE party_runtime.party_items
      DROP CONSTRAINT IF EXISTS party_items_mechanics_source_check;
    ALTER TABLE party_runtime.party_items
      ADD CONSTRAINT party_items_mechanics_source_check CHECK (
        (
          run_id IS NOT NULL
          AND template_id IS NOT NULL
          AND profile_id IS NOT NULL
          AND category_id IS NOT NULL
          AND NOT state ? 'runtime_instance_mechanics_snapshot'
        )
        OR (
          run_id IS NULL
          AND template_id IS NULL
          AND profile_id IS NULL
          AND category_id IS NULL
          AND (
            party_runtime.runtime_instance_mechanics_snapshot_valid(
              state->'runtime_instance_mechanics_snapshot'
            )
            OR party_runtime
              .ordinary_world_runtime_instance_mechanics_snapshot_valid(
                state->'runtime_instance_mechanics_snapshot'
              )
          )
        )
      );
  END IF;
END $$;
```

### [`025_party_runtime_finite_resource_transitions.sql`](../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql)

```sql
-- Existing zero rows are historical depletion, never an invitation to reroll.
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_item_proposal_schema_check;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_property_placement_evidence_schema_check;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_item_proposal_schema_check CHECK (
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v1'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb)
    OR
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v2'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal ->> 'causal_basis_kind' IN ('personal_possession','stored_supply','communal_or_service','waste_or_scrap','remnant','finite_source','ambient_source','local_natural_feature'))
    OR
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v3'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal ->> 'causal_basis_kind' IN ('personal_possession','stored_supply','communal_or_service','waste_or_scrap','remnant','finite_source','ambient_source','local_natural_feature')
      AND item_proposal ->> 'condition_state' IN ('serviceable','damaged')
      AND (item_proposal ->> 'condition_state' <> 'damaged' OR item_proposal ->> 'causal_basis_kind' = 'remnant'))
  );
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_property_placement_evidence_schema_check CHECK (
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v2'
      AND property_placement_evidence ->> 'version' = '2'
      AND property_placement_evidence ?& ARRAY['schema','version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','placement_context_ref','placement']
      AND property_placement_evidence - ARRAY['schema','version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','placement_context_ref','placement'] = '{}'::jsonb)
    OR
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v3'
      AND property_placement_evidence ->> 'version' = '3'
      AND property_placement_evidence ->> 'property_context_version' = '2'
      AND property_placement_evidence ?& ARRAY['schema','version','property_context_version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','unowned_cause_kind','placement_context_ref','placement']
      AND property_placement_evidence - ARRAY['schema','version','property_context_version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','unowned_cause_kind','placement_context_ref','placement'] = '{}'::jsonb
      AND (property_placement_evidence ->> 'unowned_cause_kind' IS NULL OR property_placement_evidence ->> 'unowned_cause_kind' IN ('lost','discarded','abandoned','broken_waste','battlefield_or_ruin_remnant')))
  );
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS lifecycle_state text;
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS retired_by_causal_identity text;
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS initial_amount_bounds jsonb;
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS initialization_identity text;
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS initial_amount_evidence jsonb;
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS property_basis_ref text;
UPDATE party_runtime.party_resource_nodes SET lifecycle_state=CASE WHEN quantity_numerator=0 THEN 'depleted' ELSE 'active' END WHERE lifecycle_state IS NULL;
ALTER TABLE party_runtime.party_resource_nodes ALTER COLUMN lifecycle_state SET NOT NULL;
ALTER TABLE party_runtime.party_resource_nodes ALTER COLUMN lifecycle_state SET DEFAULT 'active';
ALTER TABLE party_runtime.party_resource_nodes DROP CONSTRAINT IF EXISTS party_resource_nodes_lifecycle_quantity_check;
ALTER TABLE party_runtime.party_resource_nodes ADD CONSTRAINT party_resource_nodes_lifecycle_quantity_check CHECK ((lifecycle_state='active' AND quantity_numerator>0) OR (lifecycle_state='depleted' AND quantity_numerator=0) OR (lifecycle_state='uninitialized' AND quantity_numerator=0 AND property_basis_ref IS NOT NULL AND initial_amount_bounds IS NOT NULL AND jsonb_typeof(initial_amount_bounds)='object' AND initial_amount_bounds ?& ARRAY['minimum','maximum'] AND initial_amount_bounds - ARRAY['minimum','maximum'] = '{}'::jsonb AND initialization_identity IS NULL AND initial_amount_evidence IS NULL));
ALTER TABLE party_runtime.party_resource_nodes DROP CONSTRAINT IF EXISTS party_resource_nodes_state_version_safe_check;
ALTER TABLE party_runtime.party_resource_nodes ADD CONSTRAINT party_resource_nodes_state_version_safe_check CHECK (state_version >= 1 AND state_version <= 9007199254740991);
ALTER TABLE party_runtime.party_resource_nodes DROP CONSTRAINT IF EXISTS party_resource_nodes_party_id_updated_change_set_id_fkey;
ALTER TABLE party_runtime.party_resource_nodes ADD CONSTRAINT party_resource_nodes_party_id_updated_change_set_id_fkey FOREIGN KEY (party_id,updated_change_set_id) REFERENCES party_runtime.party_v3_change_sets(party_id,id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS party_runtime.party_resource_node_decrements (
  party_id text NOT NULL, resource_node_id text NOT NULL,
  causal_transition_identity text NOT NULL CHECK (causal_transition_identity <> '' AND causal_transition_identity !~ '[[:cntrl:]]'),
  result_item_id text NOT NULL,
  result_item_mechanics_digest text NOT NULL CHECK (result_item_mechanics_digest ~ '^[0-9a-f]{64}$'),
  result_item_property_placement_digest text NOT NULL CHECK (result_item_property_placement_digest ~ '^[0-9a-f]{64}$'),
  expected_state_version bigint NOT NULL CHECK (expected_state_version >= 1 AND expected_state_version <= 9007199254740991),
  quantity_unit_ref jsonb NOT NULL CHECK (jsonb_typeof(quantity_unit_ref) = 'object'),
  before_numerator numeric NOT NULL CHECK (before_numerator >= 0 AND party_runtime.integral_numeric(before_numerator)),
  before_denominator numeric NOT NULL CHECK (before_denominator > 0 AND party_runtime.integral_numeric(before_denominator) AND gcd(before_numerator,before_denominator)=1),
  decrement_numerator numeric NOT NULL CHECK (decrement_numerator > 0 AND party_runtime.integral_numeric(decrement_numerator)),
  decrement_denominator numeric NOT NULL CHECK (decrement_denominator > 0 AND party_runtime.integral_numeric(decrement_denominator) AND gcd(decrement_numerator,decrement_denominator)=1),
  after_numerator numeric NOT NULL CHECK (after_numerator >= 0 AND party_runtime.integral_numeric(after_numerator)),
  after_denominator numeric NOT NULL CHECK (after_denominator > 0 AND party_runtime.integral_numeric(after_denominator) AND gcd(after_numerator,after_denominator)=1),
  lifecycle_state_after text NOT NULL CHECK (lifecycle_state_after IN ('active','depleted')),
  initialization_identity text NULL CHECK (initialization_identity IS NULL OR (initialization_identity <> '' AND initialization_identity !~ '[[:cntrl:]]')),
  initial_amount_evidence jsonb NULL CHECK (initial_amount_evidence IS NULL OR jsonb_typeof(initial_amount_evidence)='object'),
  p16_change_set_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, resource_node_id, causal_transition_identity), UNIQUE (party_id, causal_transition_identity),
  FOREIGN KEY (party_id,resource_node_id) REFERENCES party_runtime.party_resource_nodes(party_id,resource_node_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id,result_item_id) REFERENCES party_runtime.party_ordinary_materialization_items(party_id,item_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (party_id,p16_change_set_id) REFERENCES party_runtime.party_v3_change_sets(party_id,id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (before_numerator * decrement_denominator * after_denominator = decrement_numerator * before_denominator * after_denominator + after_numerator * before_denominator * decrement_denominator),
  CHECK ((lifecycle_state_after='depleted') = (after_numerator=0))
);
```

### [`026_party_runtime_existing_container_ordinary_contents.sql`](../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql)

```sql
-- O2b reuses the ordinary aggregate and the common P16 transaction.
ALTER TABLE party_runtime.party_ordinary_materialization_enablements
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_enablements_scope_kind_check;
ALTER TABLE party_runtime.party_ordinary_materialization_enablements
  ADD CONSTRAINT party_ordinary_materialization_enablements_scope_kind_check
  CHECK (scope_kind IN ('g6','container'));

ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD COLUMN IF NOT EXISTS plan_schema text;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD COLUMN IF NOT EXISTS item_count integer;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD COLUMN IF NOT EXISTS max_new_entities integer DEFAULT 1;
UPDATE party_runtime.party_ordinary_materialization_commits
SET plan_schema='ordinary_materialization_atomic_write_plan_v1'
WHERE plan_schema IS NULL;
UPDATE party_runtime.party_ordinary_materialization_commits
SET item_count=CASE WHEN item_id IS NULL THEN 0 ELSE 1 END
WHERE item_count IS NULL;
UPDATE party_runtime.party_ordinary_materialization_commits
SET max_new_entities=1 WHERE max_new_entities IS NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN plan_schema SET NOT NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN item_count SET NOT NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN max_new_entities SET NOT NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN max_new_entities SET DEFAULT 1;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_batch_limit_check;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_batch_limit_check
  CHECK (max_new_entities BETWEEN 1 AND 8
    AND item_count BETWEEN 0 AND max_new_entities);
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_transition_count_check;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_transition_count_check
  CHECK (transition_count >= 1 AND transition_count <= 128);
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_check;
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='party_runtime.party_ordinary_materialization_commits'::regclass
      AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%resolution%materialize%item_id%IS NOT NULL%'
      AND pg_get_constraintdef(oid) NOT LIKE '%plan_schema%'
  LOOP
    EXECUTE format('ALTER TABLE party_runtime.party_ordinary_materialization_commits DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_item_cardinality_check;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_item_cardinality_check CHECK (
    (plan_schema='ordinary_materialization_atomic_write_plan_v1'
      AND item_count IN (0,1)
      AND max_new_entities=1
      AND ((resolution='materialize')=(item_id IS NOT NULL))
      AND item_count=CASE WHEN item_id IS NULL THEN 0 ELSE 1 END)
    OR
    (plan_schema='ordinary_container_contents_atomic_write_plan_v2'
      AND scope_kind='container' AND item_id IS NULL
      AND item_count <= max_new_entities
      AND resolution IN ('materialize','no_change'))
  );

ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD COLUMN IF NOT EXISTS container_id text;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD COLUMN IF NOT EXISTS resolution_request_identity text;
UPDATE party_runtime.party_ordinary_materialization_items
SET resolution_request_identity=request_identity
WHERE resolution_request_identity IS NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ALTER COLUMN resolution_request_identity SET NOT NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ALTER COLUMN position_ref DROP NOT NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_party_id_request_identity_key;
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='party_runtime.party_ordinary_materialization_items'::regclass
      AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (party_id, request_identity)'
  LOOP
    EXECUTE format('ALTER TABLE party_runtime.party_ordinary_materialization_items DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_placement_xor_check;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_placement_xor_check CHECK (
    (position_ref IS NOT NULL AND container_id IS NULL)
    OR (position_ref IS NULL AND container_id IS NOT NULL AND scope_kind='container')
  );
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_container_fk;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_container_fk
  FOREIGN KEY (party_id,container_id)
  REFERENCES party_runtime.party_containers(party_id,container_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_item_proposal_schema_check;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_item_proposal_schema_check CHECK (
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v1'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb)
    OR
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v2'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal ->> 'causal_basis_kind' IN ('personal_possession','stored_supply','communal_or_service','waste_or_scrap','remnant','finite_source','ambient_source','local_natural_feature'))
    OR
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v3'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal ->> 'causal_basis_kind' IN ('personal_possession','stored_supply','communal_or_service','waste_or_scrap','remnant','finite_source','ambient_source','local_natural_feature')
      AND item_proposal ->> 'condition_state' IN ('serviceable','damaged')
      AND (item_proposal ->> 'condition_state' <> 'damaged'
        OR item_proposal ->> 'causal_basis_kind' = 'remnant'))
    OR
    (item_proposal ->> 'schema' = 'ordinary_existing_container_item_proposal_v1'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal -> 'scope_ref' ->> 'entity_kind'='container'
      AND item_proposal -> 'scope_ref' ->> 'entity_id'=container_id
      AND item_proposal -> 'placement' ->> 'container_id'=container_id
      AND (item_proposal ->> 'causal_basis_kind' IS NULL
        OR item_proposal ->> 'causal_basis_kind' IN
          ('personal_possession','stored_supply','communal_or_service',
           'waste_or_scrap','remnant','finite_source','ambient_source',
           'local_natural_feature'))
      AND item_proposal ->> 'condition_state' IN ('serviceable','damaged')
      AND (item_proposal ->> 'condition_state' <> 'damaged'
        OR item_proposal ->> 'causal_basis_kind' = 'remnant'))
  );
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_property_placement_evidence_schema_check;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_property_placement_evidence_schema_check CHECK (
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v2'
      AND property_placement_evidence ->> 'version' = '2'
      AND property_placement_evidence ?& ARRAY['schema','version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','placement_context_ref','placement']
      AND property_placement_evidence - ARRAY['schema','version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','placement_context_ref','placement'] = '{}'::jsonb)
    OR
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v3'
      AND property_placement_evidence ->> 'version' = '3'
      AND property_placement_evidence ->> 'property_context_version' = '2'
      AND property_placement_evidence ?& ARRAY['schema','version','property_context_version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','unowned_cause_kind','placement_context_ref','placement']
      AND property_placement_evidence - ARRAY['schema','version','property_context_version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','unowned_cause_kind','placement_context_ref','placement'] = '{}'::jsonb
      AND (property_placement_evidence ->> 'unowned_cause_kind' IS NULL OR property_placement_evidence ->> 'unowned_cause_kind' IN ('lost','discarded','abandoned','broken_waste','battlefield_or_ruin_remnant')))
    OR
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_existing_container_property_placement_evidence.v1'
      AND property_placement_evidence ->> 'version' = '1'
      AND property_placement_evidence ?& ARRAY['schema','version','scope_ref','container_id','property_basis_ref','property_context_ref','owner_controller_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref']
      AND property_placement_evidence - ARRAY['schema','version','scope_ref','container_id','property_basis_ref','property_context_ref','owner_controller_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref'] = '{}'::jsonb
      AND property_placement_evidence -> 'scope_ref' ->> 'entity_kind'='container'
      AND property_placement_evidence -> 'scope_ref' ->> 'entity_id'=container_id
      AND property_placement_evidence ->> 'container_id'=container_id)
  );

CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_commit_items (
  party_id text NOT NULL,
  request_identity text NOT NULL,
  item_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  resolution_request_identity text NOT NULL,
  PRIMARY KEY (party_id,request_identity,item_id),
  UNIQUE (party_id,request_identity,ordinal),
  UNIQUE (party_id,resolution_request_identity),
  FOREIGN KEY (party_id,request_identity)
    REFERENCES party_runtime.party_ordinary_materialization_commits(party_id,request_identity)
    ON DELETE CASCADE,
  FOREIGN KEY (party_id,item_id)
    REFERENCES party_runtime.party_ordinary_materialization_items(party_id,item_id)
    ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION
  party_runtime.ordinary_container_runtime_mechanics_snapshot_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE WHEN
    party_runtime.runtime_item_jsonb_exact_keys(
      value,ARRAY['schema','version','provenance','mechanics'])
    AND value->>'schema'='rus.items.runtime_instance_mechanics_snapshot.v1'
    AND jsonb_typeof(value->'version')='number'
    AND (value->>'version')::numeric=1
    AND party_runtime.runtime_item_jsonb_exact_keys(value->'provenance',
      ARRAY['source_kind','root_turn_id','step_index','operation_ref',
        'origin_kind','source_refs'])
    AND value->'provenance'->>'source_kind'='ordinary_world_materialization'
    AND value->'provenance'->>'origin_kind'='existing_container_ordinary'
    AND party_runtime.runtime_item_jsonb_exact_text(
      value->'provenance'->'root_turn_id')
    AND party_runtime.runtime_item_jsonb_exact_text(
      value->'provenance'->'operation_ref')
    AND jsonb_typeof(value->'provenance'->'step_index')='number'
    AND (value->'provenance'->>'step_index')::numeric BETWEEN 1 AND 8
    AND (value->'provenance'->>'step_index')::numeric
      = trunc((value->'provenance'->>'step_index')::numeric)
    AND jsonb_typeof(value->'provenance'->'source_refs')='array'
    AND jsonb_array_length(value->'provenance'->'source_refs')>0
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
      value->'provenance'->'source_refs') AS source(entry)
      WHERE NOT party_runtime.runtime_item_jsonb_exact_text(source.entry))
    AND (SELECT count(*) FROM jsonb_array_elements(
      value->'provenance'->'source_refs'))
      = (SELECT count(DISTINCT source.entry #>> '{}') FROM jsonb_array_elements(
        value->'provenance'->'source_refs') AS source(entry))
    AND party_runtime.runtime_item_jsonb_exact_keys(value->'mechanics',
      ARRAY['mass_grams','external_hand_cost','carry_form',
        'packing_slot_cost','quantity','container'])
    AND jsonb_typeof(value->'mechanics'->'mass_grams')='number'
    AND (value->'mechanics'->>'mass_grams')::numeric>=0
    AND (value->'mechanics'->>'mass_grams')::numeric
      = trunc((value->'mechanics'->>'mass_grams')::numeric)
    AND jsonb_typeof(value->'mechanics'->'external_hand_cost')='number'
    AND (value->'mechanics'->>'external_hand_cost')::numeric IN (0,1,2)
    AND value->'mechanics'->>'carry_form' IN
      ('compact','regular','long','bulky')
    AND jsonb_typeof(value->'mechanics'->'packing_slot_cost')='number'
    AND (value->'mechanics'->>'packing_slot_cost')::numeric>=0
    AND (value->'mechanics'->>'packing_slot_cost')::numeric
      = trunc((value->'mechanics'->>'packing_slot_cost')::numeric)
    AND jsonb_typeof(value->'mechanics'->'quantity')='object'
    AND party_runtime.runtime_item_jsonb_exact_keys(
      value->'mechanics'->'quantity',ARRAY['value','unit'])
    AND jsonb_typeof(value->'mechanics'->'quantity'->'value')='number'
    AND (value->'mechanics'->'quantity'->>'value')::numeric>0
    AND party_runtime.runtime_item_jsonb_exact_text(
      value->'mechanics'->'quantity'->'unit')
    AND jsonb_typeof(value->'mechanics'->'container')='null'
  THEN true ELSE false END;
$$;

ALTER TABLE party_runtime.party_items
  DROP CONSTRAINT IF EXISTS party_items_mechanics_source_check;
ALTER TABLE party_runtime.party_items
  ADD CONSTRAINT party_items_mechanics_source_check CHECK (
    (
      run_id IS NOT NULL AND template_id IS NOT NULL
      AND profile_id IS NOT NULL AND category_id IS NOT NULL
      AND NOT state ? 'runtime_instance_mechanics_snapshot'
    )
    OR (
      run_id IS NULL AND template_id IS NULL
      AND profile_id IS NULL AND category_id IS NULL
      AND (
        party_runtime.runtime_instance_mechanics_snapshot_valid(
          state->'runtime_instance_mechanics_snapshot')
        OR party_runtime
          .ordinary_world_runtime_instance_mechanics_snapshot_valid(
            state->'runtime_instance_mechanics_snapshot')
        OR (
          legal_status='ordinary_container_content'
          AND party_runtime.ordinary_container_runtime_mechanics_snapshot_valid(
            state->'runtime_instance_mechanics_snapshot')
        )
      )
    )
  );
```

### [`027_party_runtime_action_production.sql`](../../schemas/party-db/027_party_runtime_action_production.sql)

```sql
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
```

### [`028_party_runtime_local_exact_fire.sql`](../../schemas/party-db/028_party_runtime_local_exact_fire.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_local_world_processes (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id)
    ON DELETE RESTRICT,
  process_ref text NOT NULL,
  context_ref text NOT NULL CHECK (context_ref<>''),
  rule_ref jsonb NOT NULL,
  policy_ref jsonb NOT NULL,
  process_mode text NOT NULL CHECK (process_mode='local_exact'),
  process_kind text NOT NULL CHECK (process_kind='fire'),
  scope_ref text NOT NULL CHECK (scope_ref<>''),
  causal_basis_ref text NOT NULL CHECK (causal_basis_ref<>''),
  status text NOT NULL CHECK (status IN ('active','completed')),
  started_at jsonb NOT NULL,
  next_boundary_at jsonb,
  process_state jsonb NOT NULL,
  state_version bigint NOT NULL CHECK (
    state_version BETWEEN 1 AND 9007199254740991),
  last_change_set_id text NOT NULL,
  PRIMARY KEY (party_id,process_ref),
  FOREIGN KEY (party_id,last_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK ((status='active')=(next_boundary_at IS NOT NULL)),
  CHECK (jsonb_typeof(rule_ref)='object' AND jsonb_typeof(policy_ref)='object'),
  CHECK (
    party_runtime.runtime_item_jsonb_exact_keys(
      process_state, ARRAY['schema','process_ref','process_mode','process_kind',
        'scope_ref','causal_basis_ref','status','started_at','next_boundary_at',
        'fuel_bindings','state_version'])
    AND process_state->>'schema'='local_world_process_state_v1'
    AND process_state->>'process_ref'=process_ref
    AND process_state->>'process_mode'=process_mode
    AND process_state->>'process_kind'=process_kind
    AND process_state->>'scope_ref'=scope_ref
    AND process_state->>'causal_basis_ref'=causal_basis_ref
    AND process_state->>'status'=status
    AND (process_state->>'state_version')::bigint=state_version
    AND process_state->'started_at'=started_at
    AND ((next_boundary_at IS NULL
          AND process_state->'next_boundary_at'='null'::jsonb)
      OR (next_boundary_at IS NOT NULL
          AND process_state->'next_boundary_at'=next_boundary_at))
    AND jsonb_typeof(process_state->'fuel_bindings')='array'
  )
);

CREATE TABLE IF NOT EXISTS party_runtime.party_local_world_process_fuel_bindings (
  party_id text NOT NULL,
  process_ref text NOT NULL,
  fuel_item_id text NOT NULL,
  binding_ordinal integer NOT NULL CHECK (binding_ordinal>=0),
  bound_at_change_set_id text NOT NULL,
  released_at_change_set_id text,
  PRIMARY KEY (party_id,process_ref,fuel_item_id),
  UNIQUE (party_id,process_ref,binding_ordinal),
  FOREIGN KEY (party_id,process_ref)
    REFERENCES party_runtime.party_local_world_processes(party_id,process_ref)
    ON DELETE RESTRICT,
  FOREIGN KEY (party_id,fuel_item_id)
    REFERENCES party_runtime.party_items(party_id,item_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id,bound_at_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (party_id,released_at_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX IF NOT EXISTS
  party_local_world_process_fuel_active_unique
  ON party_runtime.party_local_world_process_fuel_bindings(party_id,fuel_item_id)
  WHERE released_at_change_set_id IS NULL;
```

### [`029_party_runtime_spatial_semantic_remainder.sql`](../../schemas/party-db/029_party_runtime_spatial_semantic_remainder.sql)

```sql
CREATE TABLE IF NOT EXISTS party_runtime.party_spatial_semantic_envelopes (
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE RESTRICT,
  envelope_ref text NOT NULL CHECK (envelope_ref<>''),
  envelope jsonb NOT NULL,
  capacity_total bigint NOT NULL CHECK (capacity_total>=1),
  consumed_count bigint NOT NULL DEFAULT 0 CHECK (consumed_count BETWEEN 0 AND capacity_total),
  state_version bigint NOT NULL CHECK (state_version>=1),
  status text NOT NULL CHECK (status='committed'),
  created_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY (party_id,envelope_ref),
  CHECK (envelope->>'envelope_ref'=envelope_ref),
  CHECK (party_runtime.runtime_item_jsonb_exact_keys(envelope, ARRAY[
    'envelope_ref','kind','scope_kind','structural_variant','available_mechanics','required_semantic_requirements',
    'baseline_ref','g5_ref','g6_ref',
    'position_ref','property_ref','function_ref','environment_ref','semantic_context','profile_ref',
    'profile_version','policy_ref','policy_version','baseline_state_version','g5_state_version',
    'g6_state_version','position_state_version','topology','capacity_total','consumed_count','state_version'
  ])),
  CHECK ((envelope->>'capacity_total')::bigint=capacity_total
    AND (envelope->>'consumed_count')::bigint=consumed_count
    AND (envelope->>'state_version')::bigint=state_version)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_spatial_semantic_resolutions (
  party_id text NOT NULL,
  request_id text NOT NULL CHECK (request_id<>''),
  local_ref text NOT NULL CHECK (local_ref<>''),
  envelope_ref text NOT NULL,
  position_ref text NOT NULL CHECK (position_ref<>''),
  root_turn_id text NOT NULL CHECK (root_turn_id<>''),
  step_index integer NOT NULL CHECK (step_index BETWEEN 1 AND 8),
  semantics jsonb NOT NULL,
  formal_spatial_refs jsonb NOT NULL,
  from_party_state_version bigint NOT NULL CHECK (from_party_state_version>=0),
  to_party_state_version bigint NOT NULL CHECK (to_party_state_version=from_party_state_version+1),
  p16_change_set_id text NOT NULL REFERENCES party_runtime.party_v3_change_sets(id) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id,request_id),
  UNIQUE (party_id,local_ref),
  FOREIGN KEY (party_id,envelope_ref) REFERENCES party_runtime.party_spatial_semantic_envelopes(party_id,envelope_ref) ON DELETE RESTRICT,
  CHECK (semantics->>'name' IS NOT NULL AND semantics->>'description' IS NOT NULL
    AND formal_spatial_refs->>'schema'='rus.s1_formal_spatial_refs.v1'
    AND formal_spatial_refs->>'status'='materialized')
);
```

### [`030_party_runtime_snapshot_validator_alias.sql`](../../schemas/party-db/030_party_runtime_snapshot_validator_alias.sql)

```sql
-- Fix 015's PL/pgSQL variable/column name conflict for already-migrated DBs.
CREATE OR REPLACE FUNCTION
  party_runtime.runtime_instance_mechanics_snapshot_valid(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  provenance jsonb;
  mechanics jsonb;
  quantity jsonb;
  source_refs jsonb;
  source_ref jsonb;
  source_ref_text text;
  seen_source_refs text[] := ARRAY[]::text[];
  numeric_value numeric;
BEGIN
  IF value IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      value,
      ARRAY['schema','version','provenance','mechanics']
    )
    OR jsonb_typeof(value->'schema') <> 'string'
    OR value->>'schema'
      <> 'rus.items.runtime_instance_mechanics_snapshot.v1'
  THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(value->'version') <> 'number' THEN
    RETURN false;
  END IF;
  IF (value->>'version')::numeric <> 1 THEN
    RETURN false;
  END IF;

  provenance := value->'provenance';
  IF provenance IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      provenance,
      ARRAY[
        'source_kind','root_turn_id','step_index','operation_ref',
        'origin_kind','source_refs'
      ]
    )
    OR jsonb_typeof(provenance->'source_kind') <> 'string'
    OR provenance->>'source_kind' <> 'ordinary_direct_action_result'
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'root_turn_id'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'operation_ref'
    )
    OR jsonb_typeof(provenance->'origin_kind') <> 'string'
    OR provenance->>'origin_kind' NOT IN (
      'direct_partition','ambient_ordinary','crafted'
    )
  THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(provenance->'step_index') <> 'number' THEN
    RETURN false;
  END IF;
  numeric_value := (provenance->>'step_index')::numeric;
  IF numeric_value <= 0
    OR numeric_value > 8
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;

  source_refs := provenance->'source_refs';
  IF source_refs IS NULL
    OR jsonb_typeof(source_refs) <> 'array'
  THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(source_refs) = 0 THEN
    RETURN false;
  END IF;
  FOR source_ref IN SELECT entry.value
    FROM jsonb_array_elements(source_refs) AS entry(value)
  LOOP
    IF NOT party_runtime.runtime_item_jsonb_exact_text(source_ref) THEN
      RETURN false;
    END IF;
    source_ref_text := source_ref #>> '{}';
    IF source_ref_text = ANY(seen_source_refs) THEN
      RETURN false;
    END IF;
    seen_source_refs := array_append(seen_source_refs, source_ref_text);
  END LOOP;

  mechanics := value->'mechanics';
  IF mechanics IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      mechanics,
      ARRAY[
        'mass_grams','external_hand_cost','carry_form','packing_slot_cost',
        'quantity','container'
      ]
    )
    OR jsonb_typeof(mechanics->'mass_grams') <> 'number'
    OR jsonb_typeof(mechanics->'external_hand_cost') <> 'number'
    OR jsonb_typeof(mechanics->'carry_form') <> 'string'
    OR mechanics->>'carry_form' NOT IN (
      'compact','regular','long','bulky'
    )
    OR jsonb_typeof(mechanics->'packing_slot_cost') <> 'number'
    OR mechanics->'container' <> 'null'::jsonb
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'mass_grams')::numeric;
  IF numeric_value < 0
    OR numeric_value > 9007199254740991
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'external_hand_cost')::numeric;
  IF numeric_value NOT IN (0, 1, 2)
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'packing_slot_cost')::numeric;
  IF numeric_value < 0
    OR numeric_value > 9007199254740991
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;

  quantity := mechanics->'quantity';
  IF quantity <> 'null'::jsonb THEN
    IF NOT party_runtime.runtime_item_jsonb_exact_keys(
        quantity,
        ARRAY['value','unit']
      )
      OR jsonb_typeof(quantity->'value') <> 'number'
      OR NOT party_runtime.runtime_item_jsonb_exact_text(quantity->'unit')
    THEN
      RETURN false;
    END IF;
    numeric_value := (quantity->>'value')::numeric;
    IF numeric_value <= 0
      OR numeric_value > 1.7976931348623157e308
      OR numeric_value < 4.9406564584124654e-324
    THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END $$;
```

### [`031_party_runtime_deferred_npc_schedules.sql`](../../schemas/party-db/031_party_runtime_deferred_npc_schedules.sql)

```sql
-- A committed NPC routine may precede materialization of its approved G6.
-- First entry binds the exact position; it does not restart the routine.
ALTER TABLE party_runtime.party_npc_spatial_schedules
  ALTER COLUMN current_position_node_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION party_runtime.party_npc_schedule_party_reference_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE placement jsonb := NEW.causal_state_ref->'deferred_placement';
BEGIN
  IF NEW.current_position_node_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM party_runtime.scene_position_nodes position
      WHERE position.id=NEW.current_position_node_id AND position.party_id=NEW.party_id)
    THEN RAISE EXCEPTION 'npc schedule position belongs to another party'; END IF;
  ELSIF placement->>'kind'='prepared_scene' THEN
    IF NOT EXISTS (SELECT 1 FROM party_runtime.preparation_snapshot_members member
      JOIN party_runtime.preparation_snapshots snapshot ON snapshot.id=member.preparation_snapshot_id
      WHERE snapshot.party_id=NEW.party_id
        AND member.preparation_snapshot_id=placement->>'snapshot_id'
        AND member.ordinal=(placement->>'member_ordinal')::integer)
    THEN RAISE EXCEPTION 'npc schedule prepared scope is absent or belongs to another party'; END IF;
  ELSIF placement->>'kind'='legacy_anchor' THEN
    IF NOT EXISTS (SELECT 1 FROM party_runtime.party_g5_anchors anchor
      WHERE anchor.party_id=NEW.party_id AND anchor.anchor_id=placement->>'anchor_id')
    THEN RAISE EXCEPTION 'npc schedule anchor is absent or belongs to another party'; END IF;
  ELSE
    RAISE EXCEPTION 'npc schedule requires an exact or approved deferred placement';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM party_runtime.party_npcs npc
    WHERE npc.party_id=NEW.party_id AND npc.npc_id=NEW.npc_id)
  THEN RAISE EXCEPTION 'npc schedule actor belongs to another party'; END IF;
  IF NEW.current_activity_execution_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM party_runtime.party_timed_activity_executions activity
    JOIN party_runtime.party_route_plan_executions execution ON execution.id=activity.route_plan_execution_id
    WHERE activity.id=NEW.current_activity_execution_id AND execution.party_id=NEW.party_id)
  THEN RAISE EXCEPTION 'npc schedule activity belongs to another party'; END IF;
  RETURN NEW;
END $$;
```

### [`032_party_runtime_factual_presentation_delivery.sql`](../../schemas/party-db/032_party_runtime_factual_presentation_delivery.sql)

```sql
ALTER TABLE party_runtime.party_narration_jobs
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'narrated',
  ADD COLUMN IF NOT EXISTS factual_screen jsonb;

ALTER TABLE party_runtime.party_narration_jobs
  DROP CONSTRAINT IF EXISTS party_narration_jobs_check,
  DROP CONSTRAINT IF EXISTS party_narration_jobs_delivery_valid;
ALTER TABLE party_runtime.party_narration_jobs
  ADD CONSTRAINT party_narration_jobs_delivery_valid CHECK(
    state_version >= 1 AND next_attempt_ordinal >= 0 AND delivery_mode IN ('narrated','factual') AND (
    (delivery_mode='narrated' AND (
      (status IN ('pending','failed_retryable') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NULL AND output_digest IS NULL AND factual_screen IS NULL)
      OR (status='in_progress' AND active_attempt_id IS NOT NULL AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL AND narration_output IS NULL AND output_digest IS NULL AND factual_screen IS NULL)
      OR (status IN ('output_ready','delivered') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NOT NULL AND output_digest IS NOT NULL AND factual_screen IS NULL)
    ))
    OR (delivery_mode='factual' AND status='delivered' AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NULL AND output_digest IS NULL AND factual_screen IS NOT NULL))
  );

ALTER TABLE party_runtime.party_narration_attempts
  DROP CONSTRAINT IF EXISTS party_narration_attempts_outcome_check,
  DROP CONSTRAINT IF EXISTS party_narration_attempts_check,
  DROP CONSTRAINT IF EXISTS party_narration_attempts_check1,
  DROP CONSTRAINT IF EXISTS party_narration_attempts_delivery_valid;
ALTER TABLE party_runtime.party_narration_attempts
  ADD CONSTRAINT party_narration_attempts_delivery_valid CHECK(
    attempt_ordinal >= 0 AND (
    (outcome='delivered' AND output_digest IS NOT NULL AND failure_code IS NULL)
    OR (outcome='factual_delivered' AND output_digest IS NULL AND failure_code IS NULL)
    OR (outcome='failed_retryable' AND output_digest IS NULL)
    )
  );

CREATE OR REPLACE FUNCTION party_runtime.party_narration_job_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state_version <> OLD.state_version + 1 THEN RAISE EXCEPTION 'narration job state version must advance by one'; END IF;
  IF NOT (
    (OLD.status IN ('pending','failed_retryable') AND NEW.status='in_progress' AND NEW.delivery_mode='narrated')
    OR (OLD.status='in_progress' AND NEW.status IN ('output_ready','failed_retryable') AND NEW.delivery_mode='narrated')
    OR (OLD.status='output_ready' AND NEW.status='delivered' AND NEW.delivery_mode='narrated')
    OR (OLD.status='in_progress' AND NEW.status='delivered' AND NEW.delivery_mode='factual')
  ) THEN RAISE EXCEPTION 'narration job lifecycle transition is invalid'; END IF;
  IF NEW.job_id<>OLD.job_id OR NEW.party_id<>OLD.party_id OR NEW.package_id<>OLD.package_id OR NEW.idempotency_key<>OLD.idempotency_key THEN
    RAISE EXCEPTION 'narration job identity is immutable';
  END IF;
  RETURN NEW;
END $$;
```

### [`033_party_runtime_initial_semantic_decision.sql`](../../schemas/party-db/033_party_runtime_initial_semantic_decision.sql)

```sql
ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_state_version_check;

ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_state_version_check
  CHECK (state_version >= 0);
```

### [`034_party_runtime_actor_base_attributes.sql`](../../schemas/party-db/034_party_runtime_actor_base_attributes.sql)

```sql
ALTER TABLE party_runtime.party_actor_profile_bindings
  ADD COLUMN IF NOT EXISTS attribute_profile_snapshot jsonb;
```
