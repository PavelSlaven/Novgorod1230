const FINAL_DISPOSITIONS = new Set([
  'approved_source',
  'approved_with_limits',
  'duplicate',
  'superseded',
  'irrelevant_to_pack',
  'rejected_incorrect',
  'rejected_unreliable',
  'disputed',
  'unresolved_after_research'
]);

const UNRELIABLE_SOURCE_CARDS = new Set([
  'assets/source_cards/s0081.md',
  'assets/source_cards/s0089.md'
]);

export function buildArchiveDispositions(inventory) {
  if (inventory?.schema !== 'world_knowledge_archive_inventory_v1'
      || !Array.isArray(inventory.records)) {
    throw new TypeError('world_knowledge_archive_inventory_v1 is required');
  }
  const records = inventory.records.map(dispositionFor);
  const paths = records.map(({ archive_relative_path }) => archive_relative_path);
  if (new Set(paths).size !== paths.length) throw new TypeError('archive inventory paths must be unique');
  const counts = Object.fromEntries([...FINAL_DISPOSITIONS].map((status) => [
    status, records.filter((record) => record.disposition === status).length
  ]));
  return {
    schema: 'world_knowledge_archive_dispositions_v1',
    archive_name: inventory.archive_name,
    archive_version: inventory.archive_version,
    source_inventory_schema: inventory.schema,
    file_count: records.length,
    policy: {
      reviewed_at: '2026-09-03',
      license_review_required: false,
      source_cards: 'Source metadata may be reused only inside the stated period, region, and claim limits; every production claim still needs approved evidence.',
      snapshots: 'Archive snapshots are superseded by independently reopened current sources and are not production evidence by themselves.',
      structured_data: 'Bulk model-normalized archive tables are superseded by the independently verified compositional production pack.',
      model_material: 'Prompts and LLM-generated material are not factual evidence.'
    },
    counts,
    records
  };
}
function dispositionFor(record) {
  const path = record?.archive_relative_path;
  if (typeof path !== 'string' || !path) throw new TypeError('archive_relative_path is required');
  let disposition;
  let reason;
  if (path === 'assets/source_cards/s0031.md') {
    disposition = 'approved_source';
    reason = 'Primary Gramota 73 source card was independently reopened and verified for the 1220-1240 debt-record claim.';
  } else if (UNRELIABLE_SOURCE_CARDS.has(path)) {
    disposition = 'rejected_unreliable';
    reason = 'Wikipedia is navigation only and is not accepted as production evidence.';
  } else if (record.provenance_status === 'source_card') {
    disposition = 'approved_with_limits';
    reason = 'Reusable source lead and metadata only; no archive-derived claim is approved without independent candidate verification.';
  } else if (record.duplicate_cluster && record.file_type === 'csv') {
    disposition = 'duplicate';
    reason = `CSV duplicate of the retained JSON-side archive representation in cluster ${record.duplicate_cluster}`;
  } else if (record.content_class === 'LLM-GENERATED MATERIAL') {
    disposition = 'rejected_unreliable';
    reason = 'Model-generated prompts or output are not factual evidence.';
  } else if (record.processing_status === 'RAW_ASSET_NOT_NEEDED') {
    disposition = 'irrelevant_to_pack';
    reason = 'Image/reference asset is not consumed by the runtime factual pack.';
  } else if (record.content_class === 'OLD GAME DESIGN NOTE') {
    disposition = 'irrelevant_to_pack';
    reason = 'Historical design or schema material is not factual evidence and is superseded by current project contracts.';
  } else if (record.content_class === 'STRUCTURED_DATASET') {
    disposition = 'superseded';
    reason = 'Bulk archive normalization is replaced by independently verified compositional claims; archive rows are not promoted wholesale.';
  } else if (record.content_class === 'PRIMARY/SECONDARY SOURCE MATERIAL') {
    disposition = 'superseded';
    reason = 'Archived snapshot is provenance-only; current sources were independently reopened for production candidates.';
  } else if (path.startsWith('data/audit/') || path.startsWith('docs/')) {
    disposition = 'superseded';
    reason = 'Archive audit/editorial result is replaced by the PR92 coverage, verification, and readiness artifacts.';
  } else {
    disposition = 'irrelevant_to_pack';
    reason = 'Archive manifest, editorial note, script, or auxiliary file is not runtime factual evidence.';
  }
  if (!FINAL_DISPOSITIONS.has(disposition)) throw new TypeError(`invalid disposition for ${path}`);
  return {
    archive_relative_path: path,
    disposition,
    reason
  };
}
