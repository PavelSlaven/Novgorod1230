ALTER TABLE world_base.graph_nodes
  ADD CONSTRAINT graph_nodes_scale_level_canonical_check
  CHECK (
    scale_level IS NULL
    OR scale_level = ANY (
      ARRAY['G0'::text, 'G1'::text, 'G2'::text, 'G3'::text, 'G4'::text]
    )
  ) NOT VALID;
ALTER TABLE world_base.graph_nodes
  VALIDATE CONSTRAINT graph_nodes_scale_level_canonical_check;
ALTER TABLE world_base.graph_nodes
  DROP CONSTRAINT graph_nodes_scale_level_check;
ALTER TABLE world_base.graph_nodes
  RENAME CONSTRAINT graph_nodes_scale_level_canonical_check
  TO graph_nodes_scale_level_check;

ALTER TABLE world_base.graph_edges
  ADD CONSTRAINT graph_edges_scale_level_canonical_check
  CHECK (
    scale_level IS NULL
    OR scale_level = ANY (
      ARRAY['G0'::text, 'G1'::text, 'G2'::text, 'G3'::text, 'G4'::text]
    )
  ) NOT VALID;
ALTER TABLE world_base.graph_edges
  VALIDATE CONSTRAINT graph_edges_scale_level_canonical_check;
ALTER TABLE world_base.graph_edges
  DROP CONSTRAINT graph_edges_scale_level_check;
ALTER TABLE world_base.graph_edges
  RENAME CONSTRAINT graph_edges_scale_level_canonical_check
  TO graph_edges_scale_level_check;

GRANT SELECT
  ON world_base.spatial_v3_migration_coverage_artifacts
  TO world_reader;
