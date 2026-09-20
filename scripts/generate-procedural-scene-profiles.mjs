import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileProceduralSceneProfile, canonicalDigest } from
  '@rus/materialization';

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
    compileProceduralSceneProfile({ binding,
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
