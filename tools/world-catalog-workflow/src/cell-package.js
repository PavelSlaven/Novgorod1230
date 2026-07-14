import { validateBoundaryContract } from './boundary-contract.js';

const FORBIDDEN_INSTANCE_KEYS = new Set(['npcs', 'items', 'containers', 'npc_instances', 'item_instances', 'container_instances', 'current_occupants', 'specific_npcs', 'specific_items', 'g5_scenes']);
const REQUIRED_ARRAYS = ['source_ledger', 'g2_zones', 'g3_places', 'g4_locations', 'graph_nodes', 'graph_edges', 'boundary_contracts', 'population_profiles', 'item_profiles', 'container_profiles', 'property_profiles', 'fauna_profiles', 'toponymy_register', 'id_migration_map', 'change_log'];

export function validateG1CellPackage(value = {}) {
  const errors = [];
  if (value.schema_version !== 'rus.g1_cell_package.v1') errors.push('schema_version must be rus.g1_cell_package.v1');
  for (const field of ['package_id', 'map_revision_id', 'g1_id', 'package_status']) if (!text(value[field])) errors.push(`${field} is required`);
  if (!value.g1_dossier || value.g1_dossier.id !== value.g1_id) errors.push('g1_dossier.id must match g1_id');
  for (const field of REQUIRED_ARRAYS) if (!Array.isArray(value[field])) errors.push(`${field} must be an array`);
  rejectConcreteInstances(value, '$', errors);

  const nodes = Array.isArray(value.graph_nodes) ? value.graph_nodes : [];
  const nodeIds = new Set(nodes.map((node) => text(node.id)).filter(Boolean));
  const nodeById = new Map(nodes.map((node) => [text(node.id), node]));
  const ranks = new Map([['G1', 1], ['G2', 2], ['G3', 3], ['G4', 4], ['G5', 5]]);
  for (const node of nodes) {
    if (node.scale_level === 'G5') errors.push(`node ${node.id ?? '?'}: G5 is forbidden in world catalog packages`);
    if (node.scale_level !== 'G1') {
      const parent = nodeById.get(text(node.parent_node_id));
      if (!parent) errors.push(`node ${node.id ?? '?'}: missing parent ${node.parent_node_id ?? ''}`);
      else if (ranks.get(parent.scale_level) >= ranks.get(node.scale_level)) errors.push(`node ${node.id ?? '?'}: parent scale_level must be above child scale_level`);
    }
  }
  const expectedScales = { g2_zones: 'G2', g3_places: 'G3', g4_locations: 'G4' };
  for (const collection of Object.keys(expectedScales)) {
    for (const item of Array.isArray(value[collection]) ? value[collection] : []) {
      if (!nodeIds.has(text(item.id))) errors.push(`${collection} ${item.id ?? '?'}: matching graph node is required`);
      else if (nodeById.get(text(item.id))?.scale_level !== expectedScales[collection]) errors.push(`${collection} ${item.id ?? '?'}: graph node scale_level must be ${expectedScales[collection]}`);
      if (!nodeIds.has(text(item.parent_node_id))) errors.push(`${collection} ${item.id ?? '?'}: missing parent ${item.parent_node_id ?? ''}`);
    }
  }
  for (const edge of Array.isArray(value.graph_edges) ? value.graph_edges : []) {
    if (!nodeIds.has(text(edge.from_node_id))) errors.push(`edge ${edge.id ?? '?'}: missing from_node_id`);
    if (!nodeIds.has(text(edge.to_node_id))) errors.push(`edge ${edge.id ?? '?'}: missing to_node_id`);
    if (edge.edge_type === 'contains' && edge.physical !== false) errors.push(`edge ${edge.id ?? '?'}: contains cannot be a physical route`);
  }
  for (const contract of Array.isArray(value.boundary_contracts) ? value.boundary_contracts : []) {
    const result = validateBoundaryContract(contract);
    for (const issue of result.errors) errors.push(`boundary ${contract.boundary_id ?? '?'}: ${issue}`);
  }
  return { ok: errors.length === 0, errors };
}
function rejectConcreteInstances(value, path, errors) {
  if (Array.isArray(value)) { value.forEach((item, index) => rejectConcreteInstances(item, `${path}[${index}]`, errors)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_INSTANCE_KEYS.has(key) && Array.isArray(entry) && entry.length > 0) errors.push(`${path}.${key}: concrete world instances are forbidden in canonical G1 packages`);
    rejectConcreteInstances(entry, `${path}.${key}`, errors);
  }
}
function text(value) { return String(value ?? '').trim(); }
