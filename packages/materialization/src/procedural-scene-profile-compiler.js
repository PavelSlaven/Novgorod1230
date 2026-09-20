import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, MaterializationError } from './core.js';

const LANDSCAPE_FIELDS = Object.freeze({
  surface: 'soil_ground_type', relief: 'relief_type',
  vegetation: 'dominant_vegetation', environment: 'base_environment'
});

export function validateProceduralSceneAuthoringCandidate({ candidate,
  world_pin: worldPin } = {}) {
  if (candidate?.schema !== 'rus.procedural_scene_authoring_candidate.v1'
      || candidate.status !== 'candidate_approval_pending'
      || !text(candidate.candidate_id) || !text(candidate.family)
      || candidate.route_required !== false
      || Object.hasOwn(candidate, 'route_ref')
      || candidate.spatial_closure_ref?.world_revision_id
        !== worldPin?.world_revision_id
      || !text(candidate.spatial_closure_ref?.scene_template_digest)
      || !text(candidate.spatial_closure_ref?.g5_digest)
      || !Array.isArray(candidate.evidence_claims)
      || candidate.evidence_claims.length === 0
      || candidate.evidence_claims.some((claim) =>
        !text(claim.claim_ref) || claim.review_status !== 'approved'
          || !Array.isArray(claim.evidence_refs) || claim.evidence_refs.length === 0)
      || !candidateSemanticsValid(candidate)
      || containsForbiddenField(candidate)) invalid('AUTHORING_CANDIDATE');
  return deepFreeze(structuredClone(candidate));
}

export function compileProceduralSceneProfile({ binding, records_by_table: tables,
  world_pin: worldPin } = {}) {
  if (binding?.schema !== 'rus.procedural_scene_authoring_binding.v1'
      || binding.status !== 'approved' || !text(binding.binding_id)
      || !text(binding.family) || !Array.isArray(binding.required_layers)
      || binding.required_layers.length === 0 || !object(tables)
      || !text(worldPin?.world_revision_id)
      || !text(worldPin?.world_catalog_digest)) invalid('INPUT');
  const components = [];
  const landscape = approved(tables.landscape_templates,
    binding.landscape_template_ref, 'landscape_template');
  for (const [layer, field] of Object.entries(LANDSCAPE_FIELDS)) {
    if (text(landscape[field])) components.push(component({ layer,
      owner: 'landscape_templates', record: landscape, field,
      required: binding.required_layers.includes(layer) }));
  }
  if (binding.water_body_template_ref != null) {
    const water = approved(tables.water_body_templates,
      binding.water_body_template_ref, 'water_body_template');
    components.push(component({ layer: 'water', owner: 'water_body_templates',
      record: water, field: 'water_body_type',
      required: binding.required_layers.includes('water') }));
  }
  for (const ref of binding.land_use_template_refs ?? []) {
    const record = approved(tables.land_use_templates, ref, 'land_use_template');
    components.push(component({ layer: 'work_zone', owner: 'land_use_templates',
      record, field: 'land_use_kind',
      required: binding.required_layers.includes('work_zone') }));
  }
  const place = approved(tables.place_templates, binding.place_template_ref,
    'place_template');
  components.push(component({ layer: 'place_function', owner: 'place_templates',
    record: place, field: 'place_kind',
    required: binding.required_layers.includes('place_function') }));

  const profile = binding.item_profile_ref == null ? null
    : approved(tables.item_profile_sets, binding.item_profile_ref,
      'item_profile_set');
  if (profile != null) {
    const entries = (tables.item_profile_entries ?? []).filter((entry) =>
      entry.profile_id === profile.id).sort(byId);
    if (entries.length === 0) gap('item_profile_entries', profile.id);
    for (const entry of entries) {
      const item = approved(tables.item_templates, entry.item_template_id,
        'item_template');
      const category = approved(tables.universal_categories, item.category_id,
        'item_category');
      components.push(deepFreeze({
        component_ref: `item_profile_entries:${entry.id}`,
        layer: functionalLayer(entry), required: entry.required === true,
        owner_ref: { table: 'item_profile_entries', id: entry.id },
        category_ref: category.id, item_template_ref: item.id,
        profile_ref: profile.id, slot_key: entry.slot_key,
        quantity_bounds: { minimum: entry.min_quantity,
          maximum: entry.max_quantity }, selection_weight: entry.weight,
        quantity_profile_ref: approvedOptional(tables.item_template_quantity_profiles,
          item.id, 'item_template_id')?.id ?? null,
        inventory_profile_ref: approvedOptional(tables.item_template_inventory_profiles,
          item.id, 'item_template_id')?.id ?? null,
        source_refs: (tables.item_template_source_bindings ?? [])
          .filter((row) => row.item_template_id === item.id
            && row.status === 'approved')
          .map(({ id, source_id: sourceId }) => ({ id, source_id: sourceId }))
          .sort((a, b) => a.id.localeCompare(b.id))
      }));
    }
  }
  if (binding.npc_profile_set_ref != null) {
    const npc = approved(tables.region_npc_profile_sets,
      binding.npc_profile_set_ref, 'npc_profile_set');
    components.push(deepFreeze({
      component_ref: `region_npc_profile_sets:${npc.id}`,
      layer: 'npc', required: binding.required_layers.includes('npc'),
      owner_ref: { table: 'region_npc_profile_sets', id: npc.id },
      demographic_profile_ref: npc.demographic_profile_id,
      appearance_profile_ref: npc.appearance_profile_id,
      equipment_profile_ref: npc.equipment_profile_id,
      behavior_profile_ref: npc.behavior_profile_id,
      relationship_profile_ref: npc.relationship_profile_id,
      activity_profile_ref: npc.activity_profile_id,
      schedule_profile_ref: npc.schedule_profile_id
    }));
  }
  const covered = new Set(components.filter(({ required }) => required)
    .map(({ layer }) => layer));
  const missing = [...new Set(binding.required_layers)]
    .filter((layer) => !covered.has(layer)).sort();
  if (missing.length > 0) {
    throw new MaterializationError('PROCEDURAL_SCENE_PROFILE_DATA_GAP',
      'Required applicable scene layers are not covered by approved owner data.',
      { binding_id: binding.binding_id, missing_layers: missing });
  }
  const artifact = { schema: 'rus.compiled_procedural_scene_profile.v1',
    version: 1, binding_id: binding.binding_id, family: binding.family,
    world_pin: structuredClone(worldPin), spatial_closure_ref:
      structuredClone(binding.spatial_closure_ref),
    required_layers: [...new Set(binding.required_layers)].sort(),
    components: components.sort((a, b) =>
      a.layer.localeCompare(b.layer)
        || a.component_ref.localeCompare(b.component_ref)),
    optional_selection_policy: 'source_weighted_candidates_only',
    optional_presence_policy: null,
    gameplay_materialization_llm_calls: 0 };
  return deepFreeze({ ...artifact, artifact_digest: canonicalDigest(artifact) });
}

function component({ layer, owner, record, field, required }) {
  return deepFreeze({ component_ref: `${owner}:${record.id}:${field}`, layer,
    required, owner_ref: { table: owner, id: record.id },
    source_field: field, source_value: record[field] });
}
function approved(records, id, kind) {
  const matches = (records ?? []).filter((record) => record.id === id
    && record.status === 'approved');
  if (matches.length !== 1) gap(kind, id);
  return matches[0];
}
function functionalLayer(entry) {
  if (!['tool', 'storage', 'work_material'].includes(entry.functional_layer)) {
    gap('item_profile_entry_functional_layer', entry.id);
  }
  return entry.functional_layer;
}
function approvedOptional(records, value, field) {
  const matches = (records ?? []).filter((record) => record[field] === value
    && record.status === 'approved');
  if (matches.length > 1) gap(field, value);
  return matches[0] ?? null;
}
function gap(kind, id) {
  throw new MaterializationError('PROCEDURAL_SCENE_PROFILE_DATA_GAP',
    `Approved ${kind} is missing or ambiguous.`, { kind, id });
}
function invalid(reason) { throw new MaterializationError(
  'PROCEDURAL_SCENE_PROFILE_COMPILER_INVALID', 'Compiler input is invalid.',
  { reason }); }
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function object(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
function byId(a, b) { return String(a.id).localeCompare(String(b.id)); }
function containsForbiddenField(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenField);
  if (!object(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    ['quantity', 'capacity', 'route_ref'].includes(key)
      || containsForbiddenField(child));
}
function candidateSemanticsValid(candidate) {
  const gaps = ['FUNCTIONAL_TOOL_MAPPING_MISSING',
    'FUNCTIONAL_STORAGE_MAPPING_MISSING',
    'FUNCTIONAL_WORK_MATERIAL_MAPPING_MISSING',
    'FUNCTIONAL_CONTAINER_MAPPING_MISSING'];
  if (candidate.family === 'natural_shore') return candidate.requirements
    ?.water_adjacent === true && candidate.data_gap_codes?.length === 0;
  if (candidate.family === 'inland_fishing_worksite') return candidate.requirements
    ?.water_adjacent === true
      && candidate.requirements.mandatory_context_refs?.includes(
        'claim:medieval-novgorod-fishing-attests-major-occupation-food-context')
      && gaps.every((gapCode) => candidate.data_gap_codes?.includes(gapCode));
  if (candidate.family === 'drying_storage_workspace') return candidate.authority
    === 'editorial_reconstruction' && candidate.confidence === 'medium'
      && candidate.requirements?.water_adjacent === false
      && gaps.every((gapCode) => candidate.data_gap_codes?.includes(gapCode))
      && candidate.variants?.some(({ id, process_owned_requirements: refs }) =>
        id === 'active' && refs?.includes('material_ref')
          && refs?.includes('tool_ref'));
  return false;
}
