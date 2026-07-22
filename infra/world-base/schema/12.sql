-- Spatial architecture v3 / P09 target-only canonical core.
-- These tables coexist with legacy v2 rows until the P28 atomic activation gate.
-- Runtime writers must not use this authoring schema.

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_world_revisions (
  id TEXT PRIMARY KEY,
  parent_revision_id TEXT REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  catalog_digest TEXT NOT NULL CHECK (catalog_digest ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deprecated_at TIMESTAMPTZ,
  CHECK ((status IN ('deprecated', 'retired')) = (deprecated_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_authoring_versions (
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deprecated_at TIMESTAMPTZ,
  PRIMARY KEY (entity_kind, entity_id, version),
  UNIQUE (entity_kind, entity_id, version, world_revision_id),
  CHECK ((status IN ('deprecated', 'retired')) = (deprecated_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_nodes (
  entity_kind TEXT NOT NULL DEFAULT 'spatial_node' CHECK (entity_kind = 'spatial_node'),
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  spatial_level TEXT NOT NULL CHECK (spatial_level IN ('G0', 'G1', 'G2', 'G3', 'G4', 'G5')),
  stable_label_id TEXT,
  primary_class_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('draft', 'reviewed', 'rejected', 'comparative_reconstruction', 'source_backed_with_localization_uncertainty', 'archaeologically_supported_with_access_limit', 'regional_typology')),
  traversal_model TEXT CHECK (traversal_model IN ('enclosed', 'bounded', 'through_area')),
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  canonical_digest TEXT NOT NULL CHECK (canonical_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id),
  FOREIGN KEY (entity_kind, id, version, world_revision_id) REFERENCES world_base.spatial_v3_authoring_versions(entity_kind, entity_id, version, world_revision_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((spatial_level = 'G4') = (traversal_model IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_node_parents (
  child_id TEXT NOT NULL,
  child_version INTEGER NOT NULL,
  parent_id TEXT NOT NULL,
  parent_version INTEGER NOT NULL,
  world_revision_id TEXT NOT NULL REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  PRIMARY KEY (child_id, child_version),
  FOREIGN KEY (child_id, child_version, world_revision_id) REFERENCES world_base.spatial_v3_nodes(id, version, world_revision_id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_id, parent_version, world_revision_id) REFERENCES world_base.spatial_v3_nodes(id, version, world_revision_id) ON DELETE RESTRICT,
  CHECK (child_id <> parent_id)
);

CREATE OR REPLACE FUNCTION world_base.validate_spatial_v3_node_parent()
RETURNS TRIGGER AS $$
DECLARE
  child_level TEXT;
  parent_level TEXT;
  parent_revision TEXT;
BEGIN
  SELECT spatial_level INTO child_level FROM world_base.spatial_v3_nodes WHERE id = NEW.child_id AND version = NEW.child_version;
  SELECT spatial_level, world_revision_id INTO parent_level, parent_revision FROM world_base.spatial_v3_nodes WHERE id = NEW.parent_id AND version = NEW.parent_version;
  IF parent_revision IS DISTINCT FROM NEW.world_revision_id THEN
    RAISE EXCEPTION 'spatial_v3 parent revision must equal child relation revision';
  END IF;
  IF (child_level = 'G1' AND parent_level <> 'G0')
    OR (child_level = 'G2' AND parent_level <> 'G1')
    OR (child_level = 'G3' AND parent_level <> 'G2')
    OR (child_level = 'G4' AND parent_level <> 'G3')
    OR (child_level = 'G5' AND parent_level <> 'G4')
    OR child_level = 'G0' THEN
    RAISE EXCEPTION 'spatial_v3 parent level % is incompatible with child level %', parent_level, child_level;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'spatial_v3_node_parent_compatibility' AND tgrelid = 'world_base.spatial_v3_node_parents'::regclass) THEN
CREATE CONSTRAINT TRIGGER spatial_v3_node_parent_compatibility
    AFTER INSERT OR UPDATE ON world_base.spatial_v3_node_parents
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION world_base.validate_spatial_v3_node_parent();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION world_base.assert_spatial_v3_node_containment(p_node_id TEXT, p_node_version INTEGER)
RETURNS VOID AS $$
DECLARE
  parent_count INTEGER;
  node_row world_base.spatial_v3_nodes%ROWTYPE;
BEGIN
  SELECT * INTO node_row FROM world_base.spatial_v3_nodes WHERE id = p_node_id AND version = p_node_version;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*) INTO parent_count FROM world_base.spatial_v3_node_parents WHERE child_id = p_node_id AND child_version = p_node_version;
  IF (node_row.spatial_level = 'G0' AND parent_count <> 0) OR (node_row.spatial_level <> 'G0' AND parent_count <> 1) THEN
    RAISE EXCEPTION 'spatial_v3 node %/% requires exact direct-parent cardinality for level %', p_node_id, p_node_version, node_row.spatial_level;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM world_base.spatial_v3_node_classes WHERE node_id = p_node_id AND node_version = p_node_version AND category_id = node_row.primary_class_id) THEN
    RAISE EXCEPTION 'spatial_v3 primary_class_id must be a normalized node class';
  END IF;
  IF node_row.spatial_level = 'G1' AND NOT EXISTS (SELECT 1 FROM world_base.spatial_v3_g1_grid_cells WHERE node_id = p_node_id AND node_version = p_node_version AND world_revision_id = node_row.world_revision_id) THEN
    RAISE EXCEPTION 'spatial_v3 G1 node requires exactly one grid cell';
  END IF;
  IF node_row.spatial_level = 'G1' AND EXISTS (
    SELECT 1 FROM world_base.spatial_v3_g1_grid_cells grid
    WHERE grid.node_id = p_node_id AND grid.node_version = p_node_version AND grid.world_revision_id = node_row.world_revision_id
      AND NOT EXISTS (SELECT 1 FROM world_base.spatial_v3_node_parents parent WHERE parent.child_id = p_node_id AND parent.child_version = p_node_version AND parent.world_revision_id = node_row.world_revision_id AND parent.parent_id = grid.root_g0_id AND parent.parent_version = grid.root_g0_version)
  ) THEN
    RAISE EXCEPTION 'spatial_v3 G1 grid root must equal its exact direct parent';
  END IF;
  IF node_row.spatial_level <> 'G1' AND EXISTS (SELECT 1 FROM world_base.spatial_v3_g1_grid_cells WHERE node_id = p_node_id AND node_version = p_node_version AND world_revision_id = node_row.world_revision_id) THEN
    RAISE EXCEPTION 'spatial_v3 grid cell is allowed only for G1';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION world_base.validate_spatial_v3_node_containment()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM world_base.assert_spatial_v3_node_containment(NEW.id, NEW.version);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION world_base.validate_spatial_v3_g1_grid_cell()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM world_base.spatial_v3_nodes WHERE id = NEW.node_id AND version = NEW.node_version AND world_revision_id = NEW.world_revision_id AND spatial_level = 'G1') THEN
    RAISE EXCEPTION 'spatial_v3 grid cell node must be G1 in its pinned revision';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM world_base.spatial_v3_nodes WHERE id = NEW.root_g0_id AND version = NEW.root_g0_version AND world_revision_id = NEW.world_revision_id AND spatial_level = 'G0') THEN
    RAISE EXCEPTION 'spatial_v3 grid root must be G0 in its pinned revision';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM world_base.spatial_v3_node_parents WHERE child_id = NEW.node_id AND child_version = NEW.node_version AND parent_id = NEW.root_g0_id AND parent_version = NEW.root_g0_version AND world_revision_id = NEW.world_revision_id) THEN
    RAISE EXCEPTION 'spatial_v3 grid root must be the exact direct G0 parent';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION world_base.queue_spatial_v3_node_validation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'spatial_v3_node_parents' THEN
    IF TG_OP IN ('DELETE', 'UPDATE') THEN PERFORM world_base.assert_spatial_v3_node_containment(OLD.child_id, OLD.child_version); END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM world_base.assert_spatial_v3_node_containment(NEW.child_id, NEW.child_version); END IF;
  ELSE
    IF TG_OP IN ('DELETE', 'UPDATE') THEN PERFORM world_base.assert_spatial_v3_node_containment(OLD.node_id, OLD.node_version); END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM world_base.assert_spatial_v3_node_containment(NEW.node_id, NEW.node_version); END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION world_base.validate_spatial_v3_inventory_target()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mapping_status = 'reviewed' AND NOT EXISTS (SELECT 1 FROM world_base.spatial_v3_nodes WHERE id = NEW.target_spatial_node_id AND version = NEW.target_spatial_node_version AND world_revision_id = NEW.target_world_revision_id AND spatial_level = NEW.target_spatial_level) THEN
    RAISE EXCEPTION 'spatial_v3 reviewed migration target must have the declared exact level';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_node_classes (
  node_id TEXT NOT NULL,
  node_version INTEGER NOT NULL,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  class_ordinal INTEGER NOT NULL CHECK (class_ordinal >= 0),
  PRIMARY KEY (node_id, node_version, category_id),
  UNIQUE (node_id, node_version),
  UNIQUE (node_id, node_version, class_ordinal),
  FOREIGN KEY (node_id, node_version) REFERENCES world_base.spatial_v3_nodes(id, version) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_node_facets (
  node_id TEXT NOT NULL,
  node_version INTEGER NOT NULL,
  facet_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  facet_ordinal INTEGER NOT NULL CHECK (facet_ordinal >= 0),
  PRIMARY KEY (node_id, node_version, facet_category_id),
  UNIQUE (node_id, node_version, facet_ordinal),
  FOREIGN KEY (node_id, node_version) REFERENCES world_base.spatial_v3_nodes(id, version) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_g1_grid_cells (
  node_id TEXT NOT NULL,
  node_version INTEGER NOT NULL,
  world_revision_id TEXT NOT NULL REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  root_g0_id TEXT NOT NULL,
  root_g0_version INTEGER NOT NULL,
  grid_convention TEXT NOT NULL CHECK (grid_convention = 'grid_east_north_v1'),
  grid_x INTEGER NOT NULL,
  grid_y INTEGER NOT NULL,
  cell_code TEXT NOT NULL,
  PRIMARY KEY (node_id, node_version),
  UNIQUE (world_revision_id, root_g0_id, root_g0_version, grid_x, grid_y),
  UNIQUE (world_revision_id, root_g0_id, root_g0_version, cell_code),
  FOREIGN KEY (node_id, node_version, world_revision_id) REFERENCES world_base.spatial_v3_nodes(id, version, world_revision_id) ON DELETE CASCADE,
  FOREIGN KEY (root_g0_id, root_g0_version, world_revision_id) REFERENCES world_base.spatial_v3_nodes(id, version, world_revision_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_controlled_vocabulary_bindings (
  pseudo_type TEXT NOT NULL,
  registry_id TEXT NOT NULL,
  registry_path TEXT NOT NULL,
  registry_version TEXT NOT NULL,
  registry_digest TEXT NOT NULL CHECK (registry_digest ~ '^[a-f0-9]{64}$'),
  world_revision_id TEXT NOT NULL REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  PRIMARY KEY (world_revision_id, pseudo_type),
  UNIQUE (world_revision_id, registry_id, registry_version, registry_digest)
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_authoring_dependency_edges (
  source_entity_kind TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  world_revision_id TEXT NOT NULL REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  dependency_role TEXT NOT NULL,
  target_entity_kind TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  target_version INTEGER NOT NULL,
  canonical_ordinal INTEGER NOT NULL CHECK (canonical_ordinal >= 0),
  provenance_ref TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  PRIMARY KEY (source_entity_kind, source_entity_id, source_version, dependency_role, target_entity_kind, target_entity_id, target_version),
  UNIQUE (source_entity_kind, source_entity_id, source_version, dependency_role, canonical_ordinal),
  FOREIGN KEY (source_entity_kind, source_entity_id, source_version, world_revision_id) REFERENCES world_base.spatial_v3_authoring_versions(entity_kind, entity_id, version, world_revision_id) ON DELETE RESTRICT,
  FOREIGN KEY (target_entity_kind, target_entity_id, target_version, world_revision_id) REFERENCES world_base.spatial_v3_authoring_versions(entity_kind, entity_id, version, world_revision_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS world_base.spatial_v3_graph_node_migration_inventory (
  legacy_graph_node_id TEXT PRIMARY KEY REFERENCES world_base.graph_nodes(id) ON DELETE RESTRICT,
  legacy_scale_level TEXT NOT NULL CHECK (legacy_scale_level IN ('G0', 'G1', 'G2', 'G3', 'G4')),
  target_spatial_level TEXT NOT NULL CHECK (target_spatial_level IN ('G0', 'G1', 'G2', 'G3', 'G4', 'G5')),
  target_spatial_node_id TEXT,
  target_spatial_node_version INTEGER,
  target_world_revision_id TEXT REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  mapping_status TEXT NOT NULL CHECK (mapping_status IN ('reviewed', 'gap', 'ambiguous', 'not_applicable')),
  source_digest TEXT NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  mapping_digest TEXT NOT NULL CHECK (mapping_digest ~ '^[a-f0-9]{64}$'),
  reviewed_source_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  review_reason TEXT,
  gap_code TEXT,
  FOREIGN KEY (target_spatial_node_id, target_spatial_node_version, target_world_revision_id) REFERENCES world_base.spatial_v3_nodes(id, version, world_revision_id) ON DELETE RESTRICT,
  CHECK ((mapping_status = 'reviewed') = (target_spatial_node_id IS NOT NULL AND target_spatial_node_version IS NOT NULL AND target_world_revision_id IS NOT NULL AND reviewed_source_ref IS NOT NULL AND review_reason IS NOT NULL)),
  CHECK ((mapping_status IN ('gap', 'ambiguous')) = (gap_code IS NOT NULL AND review_reason IS NOT NULL)),
  CHECK ((mapping_status = 'not_applicable') = (target_spatial_node_id IS NULL AND target_spatial_node_version IS NULL AND target_world_revision_id IS NULL AND reviewed_source_ref IS NOT NULL AND review_reason IS NOT NULL)),
  CHECK (target_spatial_level <> 'G5' OR mapping_status = 'reviewed')
);

-- Upgrade a previously applied P09 part in place.  Only the exact superseded
-- literal has an approved replacement; every other legacy value is a data gap.
DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM world_base.spatial_v3_g1_grid_cells
    WHERE grid_convention NOT IN ('novgorod_g1_cardinal_grid_v1', 'grid_east_north_v1')
  ) THEN
    RAISE EXCEPTION 'P09 grid convention migration blocked: unknown legacy value';
  END IF;
  IF EXISTS (
    SELECT 1 FROM world_base.spatial_v3_node_classes
    GROUP BY node_id, node_version HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'P09 primary spatial class migration blocked: node/version has multiple legacy classes';
  END IF;
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'world_base.spatial_v3_g1_grid_cells'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%grid_convention%'
  LOOP
    EXECUTE format('ALTER TABLE world_base.spatial_v3_g1_grid_cells DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
  UPDATE world_base.spatial_v3_g1_grid_cells
    SET grid_convention = 'grid_east_north_v1'
    WHERE grid_convention = 'novgorod_g1_cardinal_grid_v1';
  SET CONSTRAINTS ALL IMMEDIATE;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'world_base.spatial_v3_g1_grid_cells'::regclass AND conname = 'spatial_v3_g1_grid_cells_convention_canonical') THEN
    ALTER TABLE world_base.spatial_v3_g1_grid_cells
      ADD CONSTRAINT spatial_v3_g1_grid_cells_convention_canonical CHECK (grid_convention = 'grid_east_north_v1');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'world_base.spatial_v3_node_classes'::regclass AND conname = 'spatial_v3_node_classes_one_primary') THEN
    ALTER TABLE world_base.spatial_v3_node_classes
      ADD CONSTRAINT spatial_v3_node_classes_one_primary UNIQUE (node_id, node_version);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'spatial_v3_node_containment' AND tgrelid = 'world_base.spatial_v3_nodes'::regclass) THEN
    CREATE CONSTRAINT TRIGGER spatial_v3_node_containment
    AFTER INSERT OR UPDATE ON world_base.spatial_v3_nodes
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION world_base.validate_spatial_v3_node_containment();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'spatial_v3_g1_grid_cell_compatibility' AND tgrelid = 'world_base.spatial_v3_g1_grid_cells'::regclass) THEN
    CREATE CONSTRAINT TRIGGER spatial_v3_g1_grid_cell_compatibility
    AFTER INSERT OR UPDATE ON world_base.spatial_v3_g1_grid_cells
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION world_base.validate_spatial_v3_g1_grid_cell();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'spatial_v3_parent_relation_validation' AND tgrelid = 'world_base.spatial_v3_node_parents'::regclass) THEN
    CREATE CONSTRAINT TRIGGER spatial_v3_parent_relation_validation
    AFTER INSERT OR UPDATE OR DELETE ON world_base.spatial_v3_node_parents
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION world_base.queue_spatial_v3_node_validation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'spatial_v3_class_relation_validation' AND tgrelid = 'world_base.spatial_v3_node_classes'::regclass) THEN
    CREATE CONSTRAINT TRIGGER spatial_v3_class_relation_validation
    AFTER INSERT OR UPDATE OR DELETE ON world_base.spatial_v3_node_classes
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION world_base.queue_spatial_v3_node_validation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'spatial_v3_grid_relation_validation' AND tgrelid = 'world_base.spatial_v3_g1_grid_cells'::regclass) THEN
    CREATE CONSTRAINT TRIGGER spatial_v3_grid_relation_validation
    AFTER INSERT OR UPDATE OR DELETE ON world_base.spatial_v3_g1_grid_cells
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION world_base.queue_spatial_v3_node_validation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'spatial_v3_inventory_target_level' AND tgrelid = 'world_base.spatial_v3_graph_node_migration_inventory'::regclass) THEN
    CREATE CONSTRAINT TRIGGER spatial_v3_inventory_target_level
    AFTER INSERT OR UPDATE ON world_base.spatial_v3_graph_node_migration_inventory
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION world_base.validate_spatial_v3_inventory_target();
  END IF;
END;
$$;

GRANT SELECT ON ALL TABLES IN SCHEMA world_base TO world_reader;
