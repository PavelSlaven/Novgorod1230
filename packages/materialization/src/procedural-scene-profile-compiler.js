import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, MaterializationError } from './core.js';

const LANDSCAPE_FIELDS = Object.freeze({
  surface: 'soil_ground_type', relief: 'relief_type',
  vegetation: 'dominant_vegetation', environment: 'base_environment'
});

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
        layer: itemLayer(category), required: entry.required === true,
        owner_ref: { table: 'item_profile_entries', id: entry.id },
        category_ref: category.id, item_template_ref: item.id,
        quantity_bounds: { minimum: entry.min_quantity,
          maximum: entry.max_quantity }, selection_weight: entry.weight
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
function itemLayer(category) {
  const code = String(category.stable_code ?? category.id).toLowerCase();
  if (/container|basket|box|bag|cask|bucket/u.test(code)) return 'storage';
  if (/tool|knife|hook|spear|net|line|spade|hoe/u.test(code)) return 'tool';
  return 'work_material';
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
