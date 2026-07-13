-- world_base FK audit queries v1
-- Run after applying world_base_seed_v1.sql to PostgreSQL.
-- Each SELECT should return zero rows. Non-zero rows are audit failures.

SET search_path TO world_base, public;

-- Direct FK checks not relying on constraint metadata.
SELECT 'regions.parent_region_id -> regions.id' AS rule, r.id AS row_id, r.parent_region_id AS missing_id
FROM regions r
LEFT JOIN regions p ON p.id = r.parent_region_id
WHERE r.parent_region_id IS NOT NULL AND p.id IS NULL;

SELECT 'region_neighbors.region_id -> regions.id' AS rule, rn.id AS row_id, rn.region_id AS missing_id
FROM region_neighbors rn
LEFT JOIN regions r ON r.id = rn.region_id
WHERE rn.region_id IS NOT NULL AND r.id IS NULL;

SELECT 'region_neighbors.neighbor_region_id -> regions.id' AS rule, rn.id AS row_id, rn.neighbor_region_id AS missing_id
FROM region_neighbors rn
LEFT JOIN regions r ON r.id = rn.neighbor_region_id
WHERE rn.neighbor_region_id IS NOT NULL AND r.id IS NULL;

SELECT 'region_landscape_templates.landscape_template_id -> landscape_templates.id' AS rule, x.id AS row_id, x.landscape_template_id AS missing_id
FROM region_landscape_templates x
LEFT JOIN landscape_templates t ON t.id = x.landscape_template_id
WHERE x.landscape_template_id IS NOT NULL AND t.id IS NULL;

SELECT 'region_water_body_templates.water_body_template_id -> water_body_templates.id' AS rule, x.id AS row_id, x.water_body_template_id AS missing_id
FROM region_water_body_templates x
LEFT JOIN water_body_templates t ON t.id = x.water_body_template_id
WHERE x.water_body_template_id IS NOT NULL AND t.id IS NULL;

SELECT 'region_land_use_templates.land_use_template_id -> land_use_templates.id' AS rule, x.id AS row_id, x.land_use_template_id AS missing_id
FROM region_land_use_templates x
LEFT JOIN land_use_templates t ON t.id = x.land_use_template_id
WHERE x.land_use_template_id IS NOT NULL AND t.id IS NULL;

SELECT 'region_place_templates.place_template_id -> place_templates.id' AS rule, x.id AS row_id, x.place_template_id AS missing_id
FROM region_place_templates x
LEFT JOIN place_templates t ON t.id = x.place_template_id
WHERE x.place_template_id IS NOT NULL AND t.id IS NULL;

SELECT 'graph_nodes.parent_node_id -> graph_nodes.id' AS rule, n.id AS row_id, n.parent_node_id AS missing_id
FROM graph_nodes n
LEFT JOIN graph_nodes p ON p.id = n.parent_node_id
WHERE n.parent_node_id IS NOT NULL AND p.id IS NULL;

SELECT 'graph_nodes.region_id -> regions.id' AS rule, n.id AS row_id, n.region_id AS missing_id
FROM graph_nodes n
LEFT JOIN regions r ON r.id = n.region_id
WHERE n.region_id IS NOT NULL AND r.id IS NULL;

SELECT 'graph_nodes.primary_landscape_template_id -> landscape_templates.id' AS rule, n.id AS row_id, n.primary_landscape_template_id AS missing_id
FROM graph_nodes n
LEFT JOIN landscape_templates t ON t.id = n.primary_landscape_template_id
WHERE n.primary_landscape_template_id IS NOT NULL AND t.id IS NULL;

SELECT 'graph_nodes.primary_water_body_template_id -> water_body_templates.id' AS rule, n.id AS row_id, n.primary_water_body_template_id AS missing_id
FROM graph_nodes n
LEFT JOIN water_body_templates t ON t.id = n.primary_water_body_template_id
WHERE n.primary_water_body_template_id IS NOT NULL AND t.id IS NULL;

SELECT 'graph_nodes.place_template_id -> place_templates.id' AS rule, n.id AS row_id, n.place_template_id AS missing_id
FROM graph_nodes n
LEFT JOIN place_templates t ON t.id = n.place_template_id
WHERE n.place_template_id IS NOT NULL AND t.id IS NULL;

SELECT 'graph_edges.from_node_id -> graph_nodes.id' AS rule, e.id AS row_id, e.from_node_id AS missing_id
FROM graph_edges e
LEFT JOIN graph_nodes n ON n.id = e.from_node_id
WHERE e.from_node_id IS NOT NULL AND n.id IS NULL;

SELECT 'graph_edges.to_node_id -> graph_nodes.id' AS rule, e.id AS row_id, e.to_node_id AS missing_id
FROM graph_edges e
LEFT JOIN graph_nodes n ON n.id = e.to_node_id
WHERE e.to_node_id IS NOT NULL AND n.id IS NULL;

SELECT 'graph_edges.reverse_edge_id -> graph_edges.id' AS rule, e.id AS row_id, e.reverse_edge_id AS missing_id
FROM graph_edges e
LEFT JOIN graph_edges r ON r.id = e.reverse_edge_id
WHERE e.reverse_edge_id IS NOT NULL AND r.id IS NULL;

SELECT 'graph_edges.route_template_id -> route_templates.id' AS rule, e.id AS row_id, e.route_template_id AS missing_id
FROM graph_edges e
LEFT JOIN route_templates t ON t.id = e.route_template_id
WHERE e.route_template_id IS NOT NULL AND t.id IS NULL;

SELECT 'graph_edges.landscape_template_id -> landscape_templates.id' AS rule, e.id AS row_id, e.landscape_template_id AS missing_id
FROM graph_edges e
LEFT JOIN landscape_templates t ON t.id = e.landscape_template_id
WHERE e.landscape_template_id IS NOT NULL AND t.id IS NULL;

SELECT 'graph_edges.water_body_template_id -> water_body_templates.id' AS rule, e.id AS row_id, e.water_body_template_id AS missing_id
FROM graph_edges e
LEFT JOIN water_body_templates t ON t.id = e.water_body_template_id
WHERE e.water_body_template_id IS NOT NULL AND t.id IS NULL;

SELECT 'historical_anchors.region_id -> regions.id' AS rule, h.id AS row_id, h.region_id AS missing_id
FROM historical_anchors h
LEFT JOIN regions r ON r.id = h.region_id
WHERE h.region_id IS NOT NULL AND r.id IS NULL;

-- JSON-array reference checks.
SELECT 'graph_nodes.secondary_landscape_template_ids[] -> landscape_templates.id' AS rule, n.id AS row_id, value AS missing_id
FROM graph_nodes n
CROSS JOIN LATERAL jsonb_array_elements_text(n.secondary_landscape_template_ids) AS value
LEFT JOIN landscape_templates t ON t.id = value
WHERE t.id IS NULL;

SELECT 'graph_nodes.secondary_water_body_template_ids[] -> water_body_templates.id' AS rule, n.id AS row_id, value AS missing_id
FROM graph_nodes n
CROSS JOIN LATERAL jsonb_array_elements_text(n.secondary_water_body_template_ids) AS value
LEFT JOIN water_body_templates t ON t.id = value
WHERE t.id IS NULL;

SELECT 'graph_nodes.land_use_template_ids[] -> land_use_templates.id' AS rule, n.id AS row_id, value AS missing_id
FROM graph_nodes n
CROSS JOIN LATERAL jsonb_array_elements_text(n.land_use_template_ids) AS value
LEFT JOIN land_use_templates t ON t.id = value
WHERE t.id IS NULL;

-- Conditional edge rules from schema reference.
SELECT 'edge_type requires route_template_id' AS rule, id AS row_id, edge_type AS value
FROM graph_edges
WHERE edge_type IN ('road','path','forest_track','winter_road','portage','corridor_segment')
  AND route_template_id IS NULL;

SELECT 'edge_type requires water_body_template_id' AS rule, id AS row_id, edge_type AS value
FROM graph_edges
WHERE edge_type IN ('river','lake_route','sea_route','ford','ferry','bridge')
  AND water_body_template_id IS NULL;

SELECT 'edge_type requires landscape_template_id' AS rule, id AS row_id, edge_type AS value
FROM graph_edges
WHERE edge_type = 'offroad_crossing'
  AND landscape_template_id IS NULL;

-- G1 region_cell required fields.
SELECT 'G1 region_cell required fields' AS rule, id AS row_id,
       concat_ws(',',
         CASE WHEN grid_x IS NULL THEN 'grid_x' END,
         CASE WHEN grid_y IS NULL THEN 'grid_y' END,
         CASE WHEN grid_z IS NULL THEN 'grid_z' END,
         CASE WHEN cell_size_km IS NULL THEN 'cell_size_km' END,
         CASE WHEN crossing_base_gu IS NULL THEN 'crossing_base_gu' END,
         CASE WHEN crossing_base_time_hours IS NULL THEN 'crossing_base_time_hours' END,
         CASE WHEN region_cell_status IS NULL THEN 'region_cell_status' END,
         CASE WHEN primary_landscape_template_id IS NULL THEN 'primary_landscape_template_id' END
       ) AS missing_fields
FROM graph_nodes
WHERE scale_level = 'G1'
  AND node_type = 'region_cell'
  AND (
    grid_x IS NULL OR grid_y IS NULL OR grid_z IS NULL OR cell_size_km IS NULL OR
    crossing_base_gu IS NULL OR crossing_base_time_hours IS NULL OR
    region_cell_status IS NULL OR primary_landscape_template_id IS NULL
  );
