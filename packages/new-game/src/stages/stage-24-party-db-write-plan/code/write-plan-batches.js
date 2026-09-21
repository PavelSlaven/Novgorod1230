import { computeStage24ArtifactDigest } from '@rus/contracts';

export function validatedProceduralPackages(trace, packages, pin) {
  const v2 = pin?.catalog_revision_id === 'procedural_scene_final_candidate_v2_001';
  if (packages == null) {
    if (!v2) return null;
    const error = new Error('PROCEDURAL_SCENE_PACKAGES_REQUIRED');
    error.code = 'PROCEDURAL_SCENE_PACKAGES_REQUIRED';
    throw error;
  }
  if ((!v2 && packages != null)
      || trace.catalog_digest !== pin?.catalog_digest
      || packages.schema !== 'rus.procedural_scene_party_packages.v1'
      || !Array.isArray(packages.packages) || packages.packages.length === 0
      || packages.pin?.catalog_digest !== trace.catalog_digest
      || packages.digest !== computeStage24ArtifactDigest(packages.packages)
      || packages.packages.some((entry) => entry.run_id !== trace.run_id
        || entry.pin?.catalog_digest !== trace.catalog_digest
        || entry.scene_package_digest !== computeStage24ArtifactDigest({
          ...entry, scene_package_digest: undefined }))) {
    const error = new Error('PROCEDURAL_SCENE_PACKAGES_INVALID');
    error.code = 'PROCEDURAL_SCENE_PACKAGES_INVALID';
    throw error;
  }
  return structuredClone(packages);
}

export function addBatch(batches, table, records, dependencies, sourceTrace) {
  if (records.length === 0) return;
  batches.push({
    batch_id: `batch-${table}`,
    order: batches.length + 1,
    target_table: table,
    operation_mode: 'insert_only',
    depends_on_batches: dependencies.filter((dependency) => batches.some((batch) =>
      batch.target_table === dependency)).map((dependency) => `batch-${dependency}`),
    records,
    source_trace: sourceTrace
  });
}
