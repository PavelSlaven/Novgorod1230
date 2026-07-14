-- Materialization v2: G4 instance rules and controlled catalog imports.
CREATE TABLE world_base.g4_npc_materialization_rules (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  graph_node_id TEXT NOT NULL REFERENCES world_base.graph_nodes(id) ON DELETE CASCADE,
  slot_rule_id TEXT NOT NULL REFERENCES world_base.materialization_slot_rules(id) ON DELETE RESTRICT,
  npc_profile_set_id TEXT NOT NULL REFERENCES world_base.region_npc_profile_sets(id) ON DELETE RESTRICT,
  min_count INTEGER NOT NULL DEFAULT 0 CHECK (min_count >= 0),
  max_count INTEGER NOT NULL CHECK (max_count >= min_count),
  presence_reason TEXT NOT NULL,
  causal_basis_type TEXT NOT NULL,
  causal_basis_id TEXT NOT NULL,
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb,
  valid_from DATE,
  valid_to DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high')),
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.g4_item_materialization_rules (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  graph_node_id TEXT NOT NULL REFERENCES world_base.graph_nodes(id) ON DELETE CASCADE,
  slot_rule_id TEXT NOT NULL REFERENCES world_base.materialization_slot_rules(id) ON DELETE RESTRICT,
  item_profile_id TEXT NOT NULL REFERENCES world_base.item_profile_sets(id) ON DELETE RESTRICT,
  property_profile_id TEXT REFERENCES world_base.property_profiles(id) ON DELETE RESTRICT,
  min_count INTEGER NOT NULL DEFAULT 0 CHECK (min_count >= 0),
  max_count INTEGER NOT NULL CHECK (max_count >= min_count),
  economic_basis TEXT NOT NULL,
  causal_basis_type TEXT NOT NULL,
  causal_basis_id TEXT NOT NULL,
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb,
  valid_from DATE,
  valid_to DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high')),
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.g4_container_materialization_rules (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  graph_node_id TEXT NOT NULL REFERENCES world_base.graph_nodes(id) ON DELETE CASCADE,
  slot_rule_id TEXT NOT NULL REFERENCES world_base.materialization_slot_rules(id) ON DELETE RESTRICT,
  container_template_id TEXT NOT NULL REFERENCES world_base.container_templates(id) ON DELETE RESTRICT,
  content_profile_id TEXT REFERENCES world_base.container_content_profiles(id) ON DELETE RESTRICT,
  property_profile_id TEXT REFERENCES world_base.property_profiles(id) ON DELETE RESTRICT,
  min_count INTEGER NOT NULL DEFAULT 0 CHECK (min_count >= 0),
  max_count INTEGER NOT NULL CHECK (max_count >= min_count),
  causal_basis_type TEXT NOT NULL,
  causal_basis_id TEXT NOT NULL,
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb,
  valid_from DATE,
  valid_to DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high')),
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);

CREATE TABLE world_base.catalog_imports (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  manifest_schema_version TEXT NOT NULL,
  manifest_digest TEXT NOT NULL CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
  approval_status TEXT NOT NULL CHECK (approval_status IN ('proposed','approved','rejected')),
  deletion_mode TEXT NOT NULL CHECK (deletion_mode IN ('none','explicit_only')),
  provenance JSONB NOT NULL,
  validation_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ
);
CREATE TABLE world_base.catalog_import_tables (
  import_id TEXT NOT NULL REFERENCES world_base.catalog_imports(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  payload_digest TEXT NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  dependency_order INTEGER NOT NULL CHECK (dependency_order >= 0),
  PRIMARY KEY (import_id, table_name)
);

CREATE UNIQUE INDEX g4_materialization_binding_active_priority
  ON world_base.g4_materialization_bindings (
    COALESCE(graph_node_id, ''), COALESCE(node_type, ''), COALESCE(place_template_id, ''),
    COALESCE(building_template_id, ''), priority
  )
  WHERE status = 'approved';
CREATE UNIQUE INDEX region_npc_profile_set_revision
  ON world_base.region_npc_profile_sets (world_revision_id, id)
  WHERE status = 'approved';

GRANT SELECT ON ALL TABLES IN SCHEMA world_base TO world_reader;
