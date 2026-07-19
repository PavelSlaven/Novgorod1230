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
