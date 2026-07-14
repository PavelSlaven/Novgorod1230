import { parseJsonCell } from './tsv.js';

const CONTROL = new Set(['core', 'directly_administered', 'special_status', 'dependent', 'tributary', 'contested', 'influence_zone', 'external']);
const EVIDENCE = new Set(['source_backed', 'archaeologically_supported', 'comparative_reconstruction', 'regional_typology', 'gameplay_abstraction', 'unknown']);
const PLAYABILITY = new Set(['draft', 'usable_with_constraints', 'approved', 'blocked', 'deprecated', 'usable_with_caution']);
const CELL_STATUS = new Set(['active', 'partial', 'border', 'outside_region', 'water_only']);

export function projectLegacyG1Rows(rows = []) {
  return rows.map((row) => ({
    id: text(row.id),
    region_cell_code: text(row.region_cell_code),
    title: text(row.title),
    legacy_g1_type: text(row.g1_type) || null,
    region_id: text(row.region_id),
    node_type: text(row.node_type),
    scale_level: text(row.scale_level),
    global_grid_x: integerOrNull(row.grid_x),
    global_grid_y: integerOrNull(row.grid_y),
    grid_z: 0,
    cell_size_km: numberOrNull(row.cell_size_km),
    cell_active: true,
    region_cell_status: 'active',
    control_status: null,
    subregion_id: null,
    land_fraction: null,
    water_fraction: null,
    evidence_status: null,
    legacy_evidence_status: text(row.evidence_status) || null,
    playability_status: null,
    primary_landscape_template_id: text(row.primary_landscape_template_id) || null,
    secondary_landscape_template_ids: parseJsonCell(row.secondary_landscape_template_ids, []),
    primary_water_body_template_id: text(row.primary_water_body_template_id) || null,
    secondary_water_body_template_ids: parseJsonCell(row.secondary_water_body_template_ids, []),
    known_landmarks: parseJsonCell(row.known_landmarks, []),
    canonical_corridors: parseJsonCell(row.canonical_corridors, []),
    source_ids: parseJsonCell(row.sources, []),
    legacy_status: text(row.status) || null,
    legacy_confidence: text(row.confidence) || null,
    legacy_audit_notes: text(row.audit_notes) || null
  }));
}

export function validateG1Mask(cells = [], revision = {}) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const coordinates = new Map();
  for (const [index, cell] of cells.entries()) {
    const label = text(cell?.id) || `row[${index}]`;
    if (!text(cell?.id)) errors.push(`${label}: id is required`);
    else if (ids.has(cell.id)) errors.push(`${label}: duplicate id`);
    else ids.add(cell.id);
    if (cell?.region_id !== revision.region_id) errors.push(`${label}: region_id must match map revision`);
    if (cell?.node_type !== 'region_cell') errors.push(`${label}: node_type must be region_cell`);
    if (cell?.scale_level !== 'G1') errors.push(`${label}: scale_level must be G1`);
    if (!explicitInteger(cell?.global_grid_x)) errors.push(`${label}: global_grid_x must be an integer`);
    if (!explicitInteger(cell?.global_grid_y)) errors.push(`${label}: global_grid_y must be an integer`);
    if (!explicitInteger(cell?.grid_z) || Number(cell.grid_z) !== 0) errors.push(`${label}: grid_z must be explicitly 0 for surface G1`);
    if (Number(cell?.cell_size_km) !== Number(revision.g1_cell_size_km)) errors.push(`${label}: cell_size_km must match map revision`);
    if (typeof cell?.cell_active !== 'boolean') errors.push(`${label}: cell_active must be boolean`);
    if (!CELL_STATUS.has(text(cell?.region_cell_status))) errors.push(`${label}: invalid region_cell_status`);
    if (!CONTROL.has(text(cell?.control_status))) errors.push(`${label}: control_status is required and must be explicit`);
    if (!EVIDENCE.has(text(cell?.evidence_status))) errors.push(`${label}: evidence_status is required and invalid`);
    if (!PLAYABILITY.has(text(cell?.playability_status))) errors.push(`${label}: playability_status is required and invalid`);
    validateFraction(cell?.land_fraction, `${label}: land_fraction`, errors);
    validateFraction(cell?.water_fraction, `${label}: water_fraction`, errors);
    if (Number.isFinite(Number(cell?.land_fraction)) && Number.isFinite(Number(cell?.water_fraction)) && Number(cell.land_fraction) + Number(cell.water_fraction) > 1.000001) errors.push(`${label}: land_fraction + water_fraction cannot exceed 1`);
    if (!Array.isArray(cell?.source_ids) || cell.source_ids.length === 0) warnings.push(`${label}: source_ids is empty`);
    if (explicitInteger(cell?.global_grid_x) && explicitInteger(cell?.global_grid_y)) {
      const key = `${Number(cell.global_grid_x)}:${Number(cell.global_grid_y)}:${Number(cell.grid_z ?? 0)}`;
      if (coordinates.has(key)) errors.push(`${label}: duplicate coordinate with ${coordinates.get(key)}`);
      else coordinates.set(key, label);
    }
  }
  if (Number.isInteger(Number(revision.active_cell_count))) {
    const active = cells.filter((cell) => cell?.cell_active && cell?.region_cell_status !== 'outside_region' && cell?.control_status !== 'external').length;
    if (active !== Number(revision.active_cell_count)) warnings.push(`active cell count differs: revision=${revision.active_cell_count}, mask=${active}`);
  }
  return { ok: errors.length === 0, errors, warnings, metrics: { row_count: cells.length, unique_ids: ids.size, unique_coordinates: coordinates.size } };
}

export function cellBlockingReasons(cell = {}) {
  const reasons = [];
  if (!CONTROL.has(text(cell.control_status))) reasons.push('missing_control_status');
  if (!EVIDENCE.has(text(cell.evidence_status))) reasons.push('missing_evidence_status');
  if (!PLAYABILITY.has(text(cell.playability_status))) reasons.push('missing_playability_status');
  if (cell.land_fraction == null || cell.land_fraction === '' || !Number.isFinite(Number(cell.land_fraction))) reasons.push('missing_land_fraction');
  if (cell.water_fraction == null || cell.water_fraction === '' || !Number.isFinite(Number(cell.water_fraction))) reasons.push('missing_water_fraction');
  if (!text(cell.subregion_id)) reasons.push('missing_subregion_id');
  return reasons;
}

function explicitInteger(value) { return value !== null && value !== undefined && value !== '' && Number.isInteger(Number(value)); }
function validateFraction(value, label, errors) { const n = value == null || value === '' ? Number.NaN : Number(value); if (!Number.isFinite(n) || n < 0 || n > 1) errors.push(`${label} must be between 0 and 1`); }
function integerOrNull(value) { const number = Number(value); return Number.isInteger(number) ? number : null; }
function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function text(value) { return String(value ?? '').trim(); }
