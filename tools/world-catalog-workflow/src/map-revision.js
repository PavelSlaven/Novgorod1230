const STATUSES = new Set(['draft', 'staging', 'mask_review', 'approved', 'deprecated', 'rejected']);
const FORBIDDEN_FALLBACK_FIELDS = ['default_control_status', 'default_evidence_status', 'default_playability_status', 'default_subregion_id'];

export function validateMapRevision(value = {}) {
  const errors = [];
  requireExact(value, 'schema_version', 'rus.region_map_revision.v1', errors);
  requireText(value, 'map_revision_id', errors);
  requireText(value, 'region_id', errors);
  if (Number(value?.historical_horizon?.year) !== 1230) errors.push('historical_horizon.year must be 1230');
  requireText(value?.historical_horizon ?? {}, 'mode', errors, 'historical_horizon.mode');
  requireText(value, 'grid_coordinate_system', errors);
  if (Number(value.g1_cell_size_km) !== 32) errors.push('g1_cell_size_km must be 32');
  if (!explicitInteger(value.active_cell_count) || Number(value.active_cell_count) < 0) errors.push('active_cell_count must be a non-negative integer');
  for (const key of ['min_x', 'max_x', 'min_y', 'max_y']) if (!explicitInteger(value?.grid_extent?.[key])) errors.push(`grid_extent.${key} must be an integer`);
  if (Number(value?.grid_extent?.min_x) > Number(value?.grid_extent?.max_x)) errors.push('grid_extent.min_x cannot exceed max_x');
  if (Number(value?.grid_extent?.min_y) > Number(value?.grid_extent?.max_y)) errors.push('grid_extent.min_y cannot exceed max_y');
  requireText(value, 'legacy_id_policy', errors);
  if (!/^[a-f0-9]{64}$/u.test(String(value.source_manifest_digest ?? ''))) errors.push('source_manifest_digest must be a SHA-256 hex digest');
  if (value.graph_digest != null && !/^[a-f0-9]{64}$/u.test(String(value.graph_digest))) errors.push('graph_digest must be null or a SHA-256 hex digest');
  if (!STATUSES.has(String(value.status ?? ''))) errors.push(`status must be one of ${[...STATUSES].join(', ')}`);
  for (const field of FORBIDDEN_FALLBACK_FIELDS) if (Object.hasOwn(value, field)) errors.push(`${field} is forbidden: semantic defaults must not be invented by code`);
  return { ok: errors.length === 0, errors };
}

function explicitInteger(value) { return value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value)); }
function requireExact(value, key, expected, errors) { if (value?.[key] !== expected) errors.push(`${key} must be ${expected}`); }
function requireText(value, key, errors, label = key) { if (!String(value?.[key] ?? '').trim()) errors.push(`${label} is required`); }
