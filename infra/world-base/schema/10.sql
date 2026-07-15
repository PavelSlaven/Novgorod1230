-- Materialization v2: G4/G5, items, containers and property profiles.
CREATE TABLE world_base.room_templates (
  id TEXT PRIMARY KEY,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE CASCADE,
  room_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  access_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.building_layout_templates (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  building_template_id TEXT NOT NULL REFERENCES world_base.building_templates(id) ON DELETE RESTRICT,
  valid_from DATE,
  valid_to DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.building_layout_nodes (
  id TEXT PRIMARY KEY,
  layout_template_id TEXT NOT NULL REFERENCES world_base.building_layout_templates(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,
  room_template_id TEXT NOT NULL REFERENCES world_base.room_templates(id) ON DELETE RESTRICT,
  required BOOLEAN NOT NULL DEFAULT true,
  ordinal INTEGER NOT NULL,
  UNIQUE (layout_template_id, slot_key)
);
CREATE TABLE world_base.building_layout_edges (
  id TEXT PRIMARY KEY,
  layout_template_id TEXT NOT NULL REFERENCES world_base.building_layout_templates(id) ON DELETE CASCADE,
  from_node_id TEXT NOT NULL REFERENCES world_base.building_layout_nodes(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES world_base.building_layout_nodes(id) ON DELETE CASCADE,
  passage_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  access_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (layout_template_id, from_node_id, to_node_id)
);
CREATE TABLE world_base.g5_minilocation_templates (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  access_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  initial_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.g5_anchor_templates (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  can_hold_npc BOOLEAN NOT NULL DEFAULT false,
  can_hold_item BOOLEAN NOT NULL DEFAULT false,
  can_hold_container BOOLEAN NOT NULL DEFAULT false,
  npc_capacity INTEGER NOT NULL DEFAULT 0 CHECK (npc_capacity >= 0),
  item_capacity INTEGER NOT NULL DEFAULT 0 CHECK (item_capacity >= 0),
  container_capacity INTEGER NOT NULL DEFAULT 0 CHECK (container_capacity >= 0),
  access_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  initial_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.g5_edge_templates (
  id TEXT PRIMARY KEY,
  passage_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  access_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  initial_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.g4_materialization_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  layout_template_id TEXT NOT NULL REFERENCES world_base.building_layout_templates(id) ON DELETE RESTRICT,
  maximum_g5_nodes INTEGER NOT NULL CHECK (maximum_g5_nodes > 0),
  player_start_anchor_slot_key TEXT NOT NULL,
  visibility_model JSONB NOT NULL,
  access_model JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.g4_materialization_bindings (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES world_base.g4_materialization_profiles(id) ON DELETE CASCADE,
  graph_node_id TEXT REFERENCES world_base.graph_nodes(id) ON DELETE CASCADE,
  node_type TEXT,
  place_template_id TEXT REFERENCES world_base.place_templates(id) ON DELETE RESTRICT,
  building_template_id TEXT REFERENCES world_base.building_templates(id) ON DELETE RESTRICT,
  priority INTEGER NOT NULL DEFAULT 0,
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  CHECK (num_nonnulls(graph_node_id, node_type, place_template_id, building_template_id) = 1)
);
CREATE TABLE world_base.materialization_slot_rules (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES world_base.g4_materialization_profiles(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,
  slot_domain TEXT NOT NULL CHECK (slot_domain IN ('g5_node','anchor','npc','item','container')),
  min_count INTEGER NOT NULL DEFAULT 0 CHECK (min_count >= 0),
  max_count INTEGER NOT NULL CHECK (max_count >= min_count),
  g5_minilocation_template_id TEXT REFERENCES world_base.g5_minilocation_templates(id) ON DELETE RESTRICT,
  g5_anchor_template_id TEXT REFERENCES world_base.g5_anchor_templates(id) ON DELETE RESTRICT,
  g5_edge_template_id TEXT REFERENCES world_base.g5_edge_templates(id) ON DELETE RESTRICT,
  parent_node_slot_key TEXT,
  entry_role TEXT NOT NULL DEFAULT 'none' CHECK (entry_role IN ('none','start','exit','start_and_exit')),
  required BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (profile_id, slot_key)
);
CREATE TABLE world_base.g4_materialization_layout_edges (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES world_base.g4_materialization_profiles(id) ON DELETE CASCADE,
  from_anchor_slot_key TEXT NOT NULL,
  to_anchor_slot_key TEXT NOT NULL,
  g5_edge_template_id TEXT NOT NULL REFERENCES world_base.g5_edge_templates(id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  CHECK (from_anchor_slot_key <> to_anchor_slot_key),
  UNIQUE (profile_id, from_anchor_slot_key, to_anchor_slot_key)
);

ALTER TABLE world_base.item_templates
  ADD COLUMN category_id TEXT REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT;

CREATE TABLE world_base.container_templates (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  packing_slot_cost INTEGER NOT NULL CHECK (packing_slot_cost > 0),
  capacity_policy JSONB NOT NULL CHECK (
    jsonb_typeof(capacity_policy) = 'object'
    AND capacity_policy = '{"version":1,"mode":"packing_slots","unit":"packing_slot"}'::jsonb
  ),
  access_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.item_profile_sets (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE CASCADE,
  context_domain TEXT NOT NULL,
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.item_profile_entries (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES world_base.item_profile_sets(id) ON DELETE CASCADE,
  item_template_id TEXT REFERENCES world_base.item_templates(id) ON DELETE RESTRICT,
  item_category_id TEXT REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  slot_key TEXT NOT NULL,
  min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity >= 0),
  max_quantity INTEGER NOT NULL DEFAULT 1 CHECK (max_quantity >= min_quantity),
  required BOOLEAN NOT NULL DEFAULT false,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  CHECK ((item_template_id IS NULL) <> (item_category_id IS NULL))
);
CREATE TABLE world_base.container_content_profiles (
  id TEXT PRIMARY KEY,
  container_template_id TEXT NOT NULL REFERENCES world_base.container_templates(id) ON DELETE CASCADE,
  empty_allowed BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.container_content_profile_entries (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES world_base.container_content_profiles(id) ON DELETE CASCADE,
  item_template_id TEXT REFERENCES world_base.item_templates(id) ON DELETE RESTRICT,
  item_category_id TEXT REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  min_quantity INTEGER NOT NULL DEFAULT 1 CHECK (min_quantity >= 0),
  max_quantity INTEGER NOT NULL DEFAULT 1 CHECK (max_quantity >= min_quantity),
  required BOOLEAN NOT NULL DEFAULT false,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  CHECK ((item_template_id IS NULL) <> (item_category_id IS NULL))
);
CREATE TABLE world_base.item_template_category_bindings (
  id TEXT PRIMARY KEY,
  item_template_id TEXT NOT NULL REFERENCES world_base.item_templates(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  binding_kind TEXT NOT NULL CHECK (binding_kind IN (
    'object_type','primary_function','secondary_function','material',
    'manufacturing_technique','component_type','physical_form','condition',
    'quality_band','size_band','mass_band','use_context'
  )),
  packing_slot_cost INTEGER,
  packing_bundle_size INTEGER,
  exclusivity_group TEXT,
  requires_regional_permission BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  CHECK (exclusivity_group IS NULL OR (binding_kind = 'primary_function' AND exclusivity_group = 'primary_function')),
  CHECK (
    (binding_kind = 'size_band' AND packing_slot_cost IS NOT NULL AND packing_slot_cost > 0 AND packing_bundle_size IS NOT NULL AND packing_bundle_size > 0)
    OR
    (binding_kind <> 'size_band' AND packing_slot_cost IS NULL AND packing_bundle_size IS NULL)
  ),
  UNIQUE (item_template_id, category_id, binding_kind)
);
CREATE UNIQUE INDEX item_template_one_active_primary_function
  ON world_base.item_template_category_bindings (item_template_id)
  WHERE binding_kind = 'primary_function' AND status = 'approved';
CREATE UNIQUE INDEX item_template_one_active_size_band
  ON world_base.item_template_category_bindings (item_template_id)
  WHERE binding_kind = 'size_band' AND status = 'approved';

CREATE TABLE world_base.container_template_facet_bindings (
  id TEXT PRIMARY KEY,
  container_template_id TEXT NOT NULL REFERENCES world_base.container_templates(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  facet TEXT NOT NULL CHECK (facet IN (
    'container_form','capacity_band','closure_type','access_model',
    'portability','content_compatibility','condition','material'
  )),
  requires_regional_permission BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (container_template_id, category_id, facet)
);
CREATE TABLE world_base.container_content_category_relations (
  id TEXT PRIMARY KEY,
  container_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  content_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  compatibility TEXT NOT NULL CHECK (compatibility IN ('allowed','forbidden')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (container_category_id, content_category_id)
);
CREATE TABLE world_base.item_classification_migration_inventory (
  id TEXT PRIMARY KEY,
  legacy_table_name TEXT NOT NULL CHECK (legacy_table_name IN ('item_templates','container_templates')),
  legacy_record_id TEXT NOT NULL,
  legacy_field_name TEXT NOT NULL,
  legacy_value TEXT NOT NULL,
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('mapped','data_gap','migration_conflict','deferred')),
  resolved_category_id TEXT REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  report_note TEXT,
  CHECK ((resolution_status = 'mapped') = (resolved_category_id IS NOT NULL)),
  UNIQUE (legacy_table_name, legacy_record_id, legacy_field_name)
);
CREATE TABLE world_base.property_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE CASCADE,
  property_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.property_profile_rules (
  id TEXT PRIMARY KEY,
  property_profile_id TEXT NOT NULL REFERENCES world_base.property_profiles(id) ON DELETE CASCADE,
  owner_kind TEXT NOT NULL,
  holder_kind TEXT NOT NULL,
  controller_kind TEXT NOT NULL,
  access_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  claim_conditions JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE world_base.transport_templates (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  route_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  equipment_profile_id TEXT REFERENCES world_base.region_equipment_profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);

ALTER TABLE world_base.g5_minilocation_templates ADD COLUMN valid_from DATE, ADD COLUMN valid_to DATE, ADD COLUMN confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'));
ALTER TABLE world_base.g5_anchor_templates ADD COLUMN valid_from DATE, ADD COLUMN valid_to DATE, ADD COLUMN confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'));
ALTER TABLE world_base.g5_edge_templates ADD COLUMN valid_from DATE, ADD COLUMN valid_to DATE, ADD COLUMN confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'));
ALTER TABLE world_base.g4_materialization_profiles ADD COLUMN valid_from DATE, ADD COLUMN valid_to DATE, ADD COLUMN confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'));
ALTER TABLE world_base.g4_materialization_bindings ADD COLUMN valid_from DATE, ADD COLUMN valid_to DATE, ADD COLUMN confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'));
ALTER TABLE world_base.materialization_slot_rules ADD COLUMN valid_from DATE, ADD COLUMN valid_to DATE, ADD COLUMN applicability JSONB NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'));
