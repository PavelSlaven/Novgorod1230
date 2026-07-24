import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const REVIEWED_BASELINE_PATH = 'data/contracts/spatial-v3/p05-reviewed-baseline.json';
export const REVIEWED_BASELINE_SHA256 = '7ae611f6db1edc7315272ea8600a3034d2f934675e60c30a8d20a3de23862c8a';

export const EXPECTED_P02_PAIRS = {
  architecture: {
    activePath: 'code_driven_world_materialization_architecture.md',
    activeSource: 'data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md',
    targetPath: 'spatial_v3_target_code_driven_world_materialization_architecture.md',
    targetSource: 'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_code_driven_world_materialization_architecture.md'
  },
  requirements: {
    activePath: 'world_base_materialization_table_requirements.md',
    activeSource: 'data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md',
    targetPath: 'spatial_v3_target_world_base_materialization_table_requirements.md',
    targetSource: 'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_world_base_materialization_table_requirements.md'
  },
  graph: {
    activePath: 'read_only_database_and_graph_architecture.md',
    activeSource: 'data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md',
    targetPath: 'spatial_v3_target_read_only_database_and_graph_architecture.md',
    targetSource: 'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_read_only_database_and_graph_architecture.md'
  },
  workflow: {
    activePath: 'map_g0_g4_workflow.txt',
    activeSource: 'data/knowledge-source/corpus/DOCUMENTS/map_g0_g4_workflow.txt',
    targetPath: 'spatial_v3_target_map_g0_g4_workflow.txt',
    targetSource: 'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_map_g0_g4_workflow.txt'
  }
};

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};

const exactKeys = (value, keys, label) => {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label}: object required`);
  invariant(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
    `${label}: missing or additional properties`
  );
};

export async function loadReviewedBaseline(root = '.') {
  const bytes = await readFile(path.join(root, REVIEWED_BASELINE_PATH), 'utf8');
  invariant(sha256(bytes) === REVIEWED_BASELINE_SHA256, 'P05 reviewed baseline does not match the hardcoded trust anchor');
  return { baseline: JSON.parse(bytes), bytes };
}

export function validateReviewedSourceDigests(sourceDigests, baseline) {
  exactKeys(sourceDigests, Object.keys(baseline.source_digests), 'P05 source digest set');
  for (const [source, reviewedDigest] of Object.entries(baseline.source_digests)) {
    invariant(sourceDigests[source] === reviewedDigest, `${source}: current bytes do not match the independently reviewed P05 baseline`);
  }
}

export function validateP02Declaration(declaration, sourceDigests) {
  const expectedGlobal = {
    schema_version: 'p02-boundary-declaration.v1',
    phase: 'P02',
    active_owner: 'v2',
    target_status: 'inactive_until_P28',
    production_read: 'v2_only',
    production_write: 'v2_only',
    dual_write: false,
    mixed_authority: false,
    fallback: false,
    partial_activation: false,
    canonical_g5: 'world_base',
    generated_g5: 'party_runtime',
    max_level: 'G6'
  };
  exactKeys(declaration, [...Object.keys(expectedGlobal), 'documents'], 'P02 declaration');
  for (const [field, value] of Object.entries(expectedGlobal)) {
    invariant(declaration[field] === value, `P02 declaration.${field}: expected ${JSON.stringify(value)}`);
  }
  invariant(Array.isArray(declaration.documents) && declaration.documents.length === 4, 'P02 declaration must contain exactly four pairs');
  const seen = new Set();
  for (const [index, row] of declaration.documents.entries()) {
    exactKeys(row, ['pair_id', 'active', 'target'], `P02 declaration.documents[${index}]`);
    invariant(!seen.has(row.pair_id), `P02 declaration contains duplicate pair ${row.pair_id}`);
    const expected = EXPECTED_P02_PAIRS[row.pair_id];
    invariant(expected, `P02 declaration contains unknown pair ${row.pair_id}`);
    seen.add(row.pair_id);
    for (const [side, expectedPath, source] of [
      ['active', expected.activePath, expected.activeSource],
      ['target', expected.targetPath, expected.targetSource]
    ]) {
      const pin = row[side];
      exactKeys(pin, ['path', 'sha256', 'section_id', 'section_sha256'], `P02 ${row.pair_id}.${side}`);
      invariant(pin.path === expectedPath, `P02 ${row.pair_id}.${side}: unexpected path`);
      invariant(pin.section_id === 'whole_document', `P02 ${row.pair_id}.${side}: whole_document required`);
      invariant(pin.sha256 === sourceDigests[source], `P02 ${row.pair_id}.${side}: source digest mismatch`);
      invariant(pin.section_sha256 === pin.sha256, `P02 ${row.pair_id}.${side}: section digest mismatch`);
    }
  }
  invariant(
    JSON.stringify([...seen].sort()) === JSON.stringify(Object.keys(EXPECTED_P02_PAIRS).sort()),
    'P02 declaration pair set is incomplete'
  );
}

export function validateReviewedRegistries({
  baseline,
  contracts,
  errors,
  contractOwnership,
  errorOwnership,
  conflictIds,
  conflictsText
}) {
  invariant(contracts.length === baseline.contract_registry.count, 'reviewed contract count changed');
  invariant(sha256(JSON.stringify(contracts)) === baseline.contract_registry.names_sha256, 'reviewed contract name set changed');
  invariant(errors.length === baseline.typed_error_registry.count, 'reviewed typed-error count changed');
  invariant(sha256(JSON.stringify(errors)) === baseline.typed_error_registry.names_sha256, 'reviewed typed-error name set changed');
  invariant(contractOwnership.length === baseline.ownership_registry.contract_rows, 'reviewed contract owner row count changed');
  invariant(sha256(JSON.stringify(contractOwnership)) === baseline.ownership_registry.contract_rows_sha256, 'reviewed contract owner matrix changed');
  invariant(errorOwnership.length === baseline.ownership_registry.error_rows, 'reviewed error owner row count changed');
  invariant(sha256(JSON.stringify(errorOwnership)) === baseline.ownership_registry.error_rows_sha256, 'reviewed error owner matrix changed');
  invariant(JSON.stringify(conflictIds) === JSON.stringify(baseline.conflict_registry.ids), 'reviewed conflict ID set changed');
  invariant(sha256(JSON.stringify(conflictIds)) === baseline.conflict_registry.ids_sha256, 'reviewed conflict ID digest changed');
  invariant(baseline.conflict_registry.open_findings === 0, 'reviewed baseline contains open findings');
  invariant(!/решить позднее|\bopen\b/i.test(conflictsText), 'conflict register contains an unresolved finding');
}
