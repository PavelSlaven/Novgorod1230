import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBoundaryContract, validateG1CellPackage } from '../src/index.js';

function basePackage() {
  return {
    schema_version: 'rus.g1_cell_package.v1',
    package_id: 'cell-a-v1',
    map_revision_id: 'rev',
    g1_id: 'cell-a',
    package_status: 'approved_local',
    source_ledger: [{ source_id: 'src', title: 'Source', evidence_type: 'regional_typology' }],
    g1_dossier: { id: 'cell-a', evidence_status: 'regional_typology', playability_status: 'approved' },
    g2_zones: [{ id: 'g2', parent_node_id: 'cell-a', scale_level: 'G2' }],
    g3_places: [{ id: 'g3', parent_node_id: 'g2', scale_level: 'G3' }],
    g4_locations: [{ id: 'g4', parent_node_id: 'g3', scale_level: 'G4', interior_spaces: [], g5_anchor_rules: [] }],
    graph_nodes: [
      { id: 'cell-a', scale_level: 'G1', node_type: 'region_cell' },
      { id: 'g2', scale_level: 'G2', parent_node_id: 'cell-a' },
      { id: 'g3', scale_level: 'G3', parent_node_id: 'g2' },
      { id: 'g4', scale_level: 'G4', parent_node_id: 'g3' }
    ],
    graph_edges: [],
    boundary_contracts: [],
    population_profiles: [],
    item_profiles: [],
    container_profiles: [],
    property_profiles: [],
    fauna_profiles: [],
    toponymy_register: [],
    id_migration_map: [],
    change_log: []
  };
}

test('valid local cell package passes', () => {
  assert.deepEqual(validateG1CellPackage(basePackage()), { ok: true, errors: [] });
});

test('cell package rejects G5, concrete NPCs and concrete item instances', () => {
  const value = basePackage();
  value.graph_nodes.push({ id: 'g5', scale_level: 'G5', parent_node_id: 'g4' });
  value.npcs = [{ id: 'npc-1', name: 'Иван' }];
  value.items = [{ id: 'item-1', title: 'Конкретный нож' }];
  const result = validateG1CellPackage(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /G5/);
  assert.match(result.errors.join('\n'), /\.npcs: concrete world instances/);
  assert.match(result.errors.join('\n'), /\.items: concrete world instances/);
});

test('cell package rejects orphan hierarchy and contains as physical edge', () => {
  const value = basePackage();
  value.g4_locations[0].parent_node_id = 'missing';
  value.graph_edges.push({ id: 'e', from_node_id: 'g3', to_node_id: 'g4', edge_type: 'contains', physical: true });
  const result = validateG1CellPackage(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing parent/);
  assert.match(result.errors.join('\n'), /contains.*physical/);
});

test('boundary contract requires explicit unresolved state before neighbor approval', () => {
  const pending = {
    schema_version: 'rus.g1_boundary_contract.v1',
    boundary_id: 'a-b',
    from_g1_id: 'a',
    to_g1_id: 'b',
    from_exit_node_id: 'a-exit',
    expected_to_entry: null,
    boundary_side: 'east',
    route_type: 'road',
    evidence_status: 'regional_typology',
    status: 'pending_neighbor_confirmation'
  };
  assert.deepEqual(validateBoundaryContract(pending), { ok: true, errors: [] });
  const matched = { ...pending, status: 'matched' };
  assert.equal(validateBoundaryContract(matched).ok, false);
});


test('cell package rejects nested concrete world instances', () => {
  const value = basePackage();
  value.g4_locations[0].current_occupants = [{ name: 'Specific person' }];
  value.g4_locations[0].item_instances = [{ title: 'Specific item' }];
  const result = validateG1CellPackage(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /current_occupants/);
  assert.match(result.errors.join('\n'), /item_instances/);
});


test('cell collections must correspond to graph nodes at the same scale', () => {
  const value = basePackage();
  value.g3_places[0].id = 'not-in-graph';
  value.graph_nodes.find((node) => node.id === 'g4').scale_level = 'G3';
  const result = validateG1CellPackage(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /not-in-graph.*graph node/);
  assert.match(result.errors.join('\n'), /g4.*scale_level/);
});
