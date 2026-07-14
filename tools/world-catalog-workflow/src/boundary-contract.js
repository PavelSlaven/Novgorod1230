const STATUS = new Set(['pending_neighbor_confirmation', 'matched', 'conflict', 'deprecated']);
const SIDE = new Set(['north', 'east', 'south', 'west']);

export function validateBoundaryContract(value = {}) {
  const errors = [];
  if (value.schema_version !== 'rus.g1_boundary_contract.v1') errors.push('schema_version must be rus.g1_boundary_contract.v1');
  for (const field of ['boundary_id', 'from_g1_id', 'to_g1_id', 'from_exit_node_id', 'route_type', 'evidence_status']) if (!text(value[field])) errors.push(`${field} is required`);
  if (!SIDE.has(text(value.boundary_side))) errors.push('boundary_side is invalid');
  if (!STATUS.has(text(value.status))) errors.push('status is invalid');
  if (value.status === 'matched' && !text(value.expected_to_entry)) errors.push('matched boundary requires expected_to_entry');
  if (value.from_g1_id === value.to_g1_id && text(value.from_g1_id)) errors.push('boundary must connect different G1 cells');
  return { ok: errors.length === 0, errors };
}
function text(value) { return String(value ?? '').trim(); }
