import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadApprovedProceduralCompiledCatalog } from '@rus/runtime-catalog';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a.js';
import { currentWorldBaseReferenceSnapshot, phase1AInstance } from
  './lower-dvina-trace-phase-2-fixture-support.js';

test('Lower Dvina materializes a fishing package before Stage 24', async () => {
  const [bundle, v1, v2] = await Promise.all([
    loadLowerDvinaTraceMaterializationBundle({ scenarioDefinitionRevision: 35 }),
    readCandidate('final-candidate-pack-v1/candidate.json'),
    readCandidate('final-candidate-pack-v2/candidate.json')
  ]);
  const pin = { schema: 'rus.runtime_catalog_pin.v2',
    catalog_revision_id: v2.target_revision_id,
    catalog_digest: v2.target_catalog_digest, import_audit_digest: 'a'.repeat(64),
    compatible_world_revision_id: bundle.location_topology_set.spatial_source_ref.world_revision_id,
    compatible_world_catalog_digest:
      bundle.location_topology_set.spatial_source_ref.world_revision_catalog_digest };
  const catalog = loadApprovedProceduralCompiledCatalog({ pin, verifiedCatalog: {
    schema: 'rus.verified_item_catalog.v2', verified: true, pin: structuredClone(pin),
    import_audit: { approval_attestation_digest:
      '2917b993a9e9c63e1989725cee35e63bd0ed32dfece583a782dfb27f1c3f4772',
    import_audit_digest: pin.import_audit_digest }, records_by_table: {
      procedural_scene_compiled_records: [
        ...v1.candidate_rows_by_table.procedural_scene_compiled_records,
        v2.append_only_delta.record
      ].map((record) => ({ ...record, version: String(record.version) })),
      universal_categories: []
    }
  }});
  const result = phase1AInstance('procedural-scene-wiring', bundle,
    currentWorldBaseReferenceSnapshot(), catalog);
  const fishing = result.procedural_scene_packages.packages.find(({ family }) =>
    family === 'inland_fishing_worksite');
  assert.ok(fishing);
  assert.equal(fishing.allocation_policy?.status,
    'pending_p16_inventory_validation');
  assert.equal(fishing.profile.components.some(({ layer }) => layer === 'work_zone'), true);
});

async function readCandidate(relative) {
  return JSON.parse(await readFile(new URL('../../../data/world-catalogs/novgorod/'
    + `procedural-scene-v2/${relative}`, import.meta.url), 'utf8'));
}
