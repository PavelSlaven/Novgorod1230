-- Target-only spatial v3 foundation.  It is deliberately not part of the
-- production migration composition before the P28 atomic cutover.
CREATE SCHEMA IF NOT EXISTS party_runtime;

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
CREATE TABLE IF NOT EXISTS party_runtime.scene_movement_edges (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,source_scene_template_ref jsonb NOT NULL,source_edge_slot_key text NOT NULL,from_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,to_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,passage_type_id text NOT NULL,transition_environment_profile_ref jsonb NOT NULL,movement_orientation_profile_ref jsonb NOT NULL,cost_kind text NOT NULL CHECK(cost_kind IN ('action','time')),action_units integer,baseline_movement_method_id text,movement_method_cost_profile_ref jsonb,base_minutes integer,dynamic_recheck_policy_ref jsonb,capacity integer,portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,availability_condition_set_ref jsonb,reverse_edge_id text,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,UNIQUE(scene_baseline_id,source_edge_slot_key),CHECK((cost_kind='action')=(action_units IS NOT NULL AND baseline_movement_method_id IS NULL AND movement_method_cost_profile_ref IS NULL AND base_minutes IS NULL AND dynamic_recheck_policy_ref IS NULL)),CHECK((portal_entity_id IS NOT NULL)=(availability_condition_set_ref IS NOT NULL)),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
CREATE TABLE IF NOT EXISTS party_runtime.visibility_links (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,source_scene_template_ref jsonb NOT NULL,source_link_slot_key text NOT NULL,from_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,to_position_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,quality text NOT NULL CHECK(quality IN ('clear','partial')),distance_band text NOT NULL,portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,condition_profile_ref jsonb,reverse_link_id text,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,UNIQUE(scene_baseline_id,source_link_slot_key),CHECK((portal_entity_id IS NULL) OR condition_profile_ref IS NOT NULL),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
CREATE TABLE IF NOT EXISTS party_runtime.g6_acoustic_profiles (party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE CASCADE,ambient_noise integer NOT NULL CHECK(ambient_noise>=0),acoustic_uniformity text NOT NULL,state_version bigint NOT NULL CHECK(state_version>=0),updated_change_set_id text NOT NULL,PRIMARY KEY(party_id,g6_instance_id));
CREATE TABLE IF NOT EXISTS party_runtime.acoustic_edges (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,source_scene_template_ref jsonb NOT NULL,source_edge_slot_key text NOT NULL,from_g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,to_g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,base_loss integer NOT NULL CHECK(base_loss BETWEEN 0 AND 2),portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,closed_extra_loss text,reverse_edge_id text,condition_profile_ref jsonb,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,UNIQUE(scene_baseline_id,source_edge_slot_key),CHECK((portal_entity_id IS NULL AND closed_extra_loss IS NULL) OR (portal_entity_id IS NOT NULL AND closed_extra_loss IS NOT NULL AND condition_profile_ref IS NOT NULL)),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));

CREATE TABLE IF NOT EXISTS party_runtime.g5_site_connections (id text PRIMARY KEY,party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,from_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,to_site_id text NOT NULL REFERENCES party_runtime.party_g5_sites(id) ON DELETE RESTRICT,passage_type_id text NOT NULL,transition_environment_profile_ref jsonb NOT NULL,movement_orientation_profile_ref jsonb NOT NULL,cost_kind text NOT NULL CHECK(cost_kind IN ('action','time')),action_units integer,baseline_movement_method_id text,movement_method_cost_profile_ref jsonb,base_minutes integer,dynamic_recheck_policy_ref jsonb,capacity integer,risk_profile_ref jsonb,portal_entity_id text REFERENCES party_runtime.portal_entities(id) ON DELETE RESTRICT,availability_condition_set_ref jsonb,reverse_connection_id text,status text NOT NULL CHECK(status IN ('active','superseded','destroyed')),state_version bigint NOT NULL CHECK(state_version>=0),created_change_set_id text NOT NULL,updated_change_set_id text NOT NULL,terminal_change_set_id text,CHECK((cost_kind='action')=(action_units IS NOT NULL AND baseline_movement_method_id IS NULL AND movement_method_cost_profile_ref IS NULL AND base_minutes IS NULL AND dynamic_recheck_policy_ref IS NULL)),CHECK((portal_entity_id IS NOT NULL)=(availability_condition_set_ref IS NOT NULL)),CHECK(party_runtime.spatial_v3_lifecycle_valid(status,terminal_change_set_id)));
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
