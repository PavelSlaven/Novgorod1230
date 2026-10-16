import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalDigest } from '@rus/materialization';

export function generateProceduralSceneProfileCatalog({ bindings,
  approvedRecordBundle }) {
  if (bindings?.schema !== 'rus.procedural_scene_authoring_bindings.v1'
      || bindings.status !== 'approved' || !Array.isArray(bindings.bindings)
      || approvedRecordBundle?.schema
        !== 'rus.procedural_scene_approved_record_bundle.v1'
      || approvedRecordBundle.import_readback?.status !== 'imported'
      || approvedRecordBundle.import_readback.world_revision_id
        !== approvedRecordBundle.world_pin?.world_revision_id
      || approvedRecordBundle.import_readback.world_catalog_digest
        !== approvedRecordBundle.world_pin?.world_catalog_digest
      || approvedRecordBundle.approval?.activation_authorized !== false
      || approvedRecordBundle.activation_event != null) {
    throw new Error('PROCEDURAL_SCENE_GENERATOR_INPUT_INVALID');
  }
  const approvedBindings = bindings.bindings.filter(({ status }) =>
    status === 'approved');
  const profiles = approvedBindings.map((binding) =>
    compileAuthoringProfile({ binding,
      records_by_table: approvedRecordBundle.records_by_table,
      world_pin: approvedRecordBundle.world_pin }))
    .sort((a, b) => a.binding_id.localeCompare(b.binding_id));
  const catalog = { schema: 'rus.compiled_procedural_scene_profile_catalog.v2',
    version: 2, status: profiles.length > 0 ? 'approved' : 'blocked_data_gap',
    import_ref: approvedRecordBundle.import_readback.import_id,
    activation_event_ref: null, activation_authorized: false,
    world_pin: structuredClone(approvedRecordBundle.world_pin), profiles,
    blocked_bindings: bindings.bindings.filter(({ status }) =>
      status !== 'approved').map(({ binding_id, status, data_gap_codes }) => ({
        binding_id, status, data_gap_codes: structuredClone(data_gap_codes ?? [])
      })).sort((a, b) => a.binding_id.localeCompare(b.binding_id)) };
  return Object.freeze({ ...catalog, catalog_digest: canonicalDigest(catalog) });
}

/** Authoring artifact only. Runtime compiles activated V2 rows elsewhere. */
function compileAuthoringProfile({ binding, records_by_table: tables, world_pin: worldPin }) {
  const row = (table, id) => (tables?.[table] ?? []).find((record) =>
    record.id === id && record.status === 'approved');
  const landscape = row('landscape_templates', binding.landscape_template_ref);
  const water = binding.water_body_template_ref == null ? null
    : row('water_body_templates', binding.water_body_template_ref);
  const place = row('place_templates', binding.place_template_ref);
  if (binding?.schema !== 'rus.procedural_scene_authoring_binding.v1'
      || binding.status !== 'approved' || !landscape || !place
      || (binding.water_body_template_ref != null && !water)) {
    throw new Error('PROCEDURAL_SCENE_GENERATOR_PROFILE_INVALID');
  }
  const fields = { surface: 'soil_ground_type', relief: 'relief_type',
    vegetation: 'dominant_vegetation', environment: 'base_environment' };
  const components = Object.entries(fields).filter(([, field]) => landscape[field])
    .map(([layer, field]) => ({ component_ref: `landscape_templates:${landscape.id}:${field}`,
      layer, required: binding.required_layers.includes(layer),
      owner_ref: { table: 'landscape_templates', id: landscape.id },
      source_field: field, source_value: landscape[field] }));
  if (water) components.push({ component_ref: `water_body_templates:${water.id}:water_body_type`,
    layer: 'water', required: binding.required_layers.includes('water'),
    owner_ref: { table: 'water_body_templates', id: water.id },
    source_field: 'water_body_type', source_value: water.water_body_type });
  components.push({ component_ref: `place_templates:${place.id}:place_kind`,
    layer: 'place_function', required: binding.required_layers.includes('place_function'),
    owner_ref: { table: 'place_templates', id: place.id },
    source_field: 'place_kind', source_value: place.place_kind });
  const artifact = { schema: 'rus.compiled_procedural_scene_profile.v1', version: 1,
    binding_id: binding.binding_id, family: binding.family,
    world_pin: structuredClone(worldPin), spatial_closure_ref:
      structuredClone(binding.spatial_closure_ref),
    required_layers: [...new Set(binding.required_layers)].sort(),
    components: components.sort((a, b) => a.layer.localeCompare(b.layer)
      || a.component_ref.localeCompare(b.component_ref)),
    optional_selection_policy: 'source_weighted_candidates_only',
    optional_presence_policy: null, gameplay_materialization_llm_calls: 0 };
  return Object.freeze({ ...artifact, artifact_digest: canonicalDigest(artifact) });
}

async function main(argv) {
  const [bindingsPath, recordsPath, outputPath, mode = 'write'] = argv;
  if (!bindingsPath || !recordsPath || !outputPath
      || !['write', 'check'].includes(mode)) {
    throw new Error('Usage: generate-procedural-scene-profiles <bindings.json> <approved-records.json> <output.json> [write|check]');
  }
  const [bindings, approvedRecordBundle] = await Promise.all(
    [bindingsPath, recordsPath].map(async (path) =>
      JSON.parse(await readFile(resolve(path), 'utf8'))));
  const expected = `${JSON.stringify(generateProceduralSceneProfileCatalog({
    bindings, approvedRecordBundle }), null, 2)}\n`;
  if (mode === 'check') {
    const actual = await readFile(resolve(outputPath), 'utf8');
    if (actual !== expected) throw new Error('PROCEDURAL_SCENE_GENERATED_ARTIFACT_STALE');
  } else {
    await writeFile(resolve(outputPath), expected);
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
