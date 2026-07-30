import {
  canonicalDigest,
  LOWER_DVINA_TRACE_APPROVED_WORLD_COMPATIBILITY_DIGEST
} from '@rus/materialization';

export async function assertLowerDvinaTracePhase1BWorldLineage({
  rootDir,
  compatibility,
  readJson
}) {
  if (canonicalDigest(compatibility)
      !== LOWER_DVINA_TRACE_APPROVED_WORLD_COMPATIBILITY_DIGEST
    || compatibility?.source_world_revision_id
      !== 'novgorod_spatial_v3_target_contract_approval_001'
    || compatibility.source_world_catalog_digest
      !== '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e'
    || compatibility.production_world_revision_id
      !== 'novgorod_spatial_v3_production_v3_candidate_001'
    || compatibility.production_world_catalog_digest
      !== '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e'
    || compatibility.source_status !== 'approved'
    || compatibility.production_status !== 'approved'
    || !Array.isArray(compatibility.lineage)
    || compatibility.lineage.length !== 2) {
    fail(
      'TRACE_PHASE_1B_WORLD_COMPATIBILITY_INVALID',
      'Exact approved source-to-production world lineage is required.'
    );
  }
  let parent = compatibility.source_world_revision_id;
  for (const ref of compatibility.lineage) {
    const loaded = await readJson(rootDir, ref?.path);
    if (loaded.digest !== ref?.digest
      || loaded.value.world_revision_id !== ref.world_revision_id
      || ref.parent_revision_id !== parent
      || loaded.value.parent_revision_id !== parent
      || loaded.value.catalog_digest !== ref.world_catalog_digest
      || ref.status !== 'approved'
      || loaded.value.status !== ref.status) {
      fail(
        'TRACE_PHASE_1B_WORLD_LINEAGE_MISMATCH',
        'Pinned production world lineage is stale or incompatible.'
      );
    }
    parent = ref.world_revision_id;
  }
  if (parent !== compatibility.production_world_revision_id) {
    fail(
      'TRACE_PHASE_1B_WORLD_LINEAGE_MISMATCH',
      'Pinned world lineage does not reach the production revision.'
    );
  }
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code, status: 409 });
}
