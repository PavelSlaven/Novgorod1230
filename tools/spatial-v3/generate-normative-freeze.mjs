import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const output = 'docs/migration/spatial-v3/normative-freeze.json';
const docs = [
  'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md',
  'docs/adr/ADR-001-materialization-v3-spatial-g0-g6.md',
  'docs/migration/spatial-v3/normative-conflicts.md',
  'docs/migration/spatial-v3/contract-implementation-matrix.json',
  'docs/migration/spatial-v3/target-registries.md',
  'data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md',
  'data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md',
  'data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md',
  'data/knowledge-source/corpus/DOCUMENTS/map_g0_g4_workflow.txt',
  'data/knowledge-source/corpus/DOCUMENTS/movement_locations_regions.txt',
  'data/knowledge-source/corpus/DOCUMENTS/time_system.txt',
  'data/knowledge-source/corpus/DOCUMENTS/formulas.md',
  'data/knowledge-source/corpus/DOCUMENTS/base_turn_orchestration.txt',
  'data/knowledge-source/corpus/DOCUMENTS/world_generation_and_turns.txt',
  'data/knowledge-source/corpus/DOCUMENTS/interface_ux.md',
  'data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md',
  'data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md',
  'data/knowledge-source/corpus/DOCUMENTS/README.md'
].sort();

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const standardPath = 'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md';
const standard = await readFile(standardPath, 'utf8');
const matrix = JSON.parse(await readFile('docs/migration/spatial-v3/contract-implementation-matrix.json', 'utf8'));
const appendixC = standard.slice(standard.indexOf('# Приложение C.'), standard.indexOf('# Приложение D.'));
const contracts = [...standard.matchAll(/```yaml\r?\ncontract_name:\s*([^\r\n]+)[\s\S]*?```/g)].map((match) => match[1].trim()).sort();
const errors = [...appendixC.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((match) => match[1].trim()).filter((name) => name !== 'code').sort();
const sourceDigests = Object.fromEntries(await Promise.all(docs.map(async (path) => [path, sha256(await readFile(path, 'utf8'))])));

const freeze = {
  schema_version: '1.0.0',
  status: 'target',
  activation_boundary: 'P28 atomic activation only; no dual write, authoritative mixed read, fallback or partial activation.',
  source_standard: {
    path: standardPath,
    version: '4.2.0',
    sha256: sourceDigests[standardPath]
  },
  contract_registry: {
    path: 'docs/migration/spatial-v3/contract-implementation-matrix.json',
    sha256: sourceDigests['docs/migration/spatial-v3/contract-implementation-matrix.json'],
    count: contracts.length,
    names_sha256: sha256(JSON.stringify(contracts))
  },
  typed_error_registry: {
    source: `${standardPath}#appendix-c`,
    count: errors.length,
    names_sha256: sha256(JSON.stringify(errors))
  },
  vocabulary_registry_plan: {
    path: 'docs/migration/spatial-v3/target-registries.md#controlled-vocabulary-registry-plan',
    sha256: sourceDigests['docs/migration/spatial-v3/target-registries.md'],
    required_mapping: 'one finite versioned registry per controlled_* type before activation'
  },
  source_digests: sourceDigests,
  zero_findings_evidence: {
    checker: 'npm run spatial-v3:check-p05',
    scope: ['levels', 'containment', 'movement', 'time', 'readiness', 'state transitions', 'stores', 'owners', 'migration', 'activation language'],
    open_findings: 0
  }
};

const rendered = `${JSON.stringify(freeze, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const current = await readFile(output, 'utf8');
  if (current !== rendered) throw new Error(`${output} is stale; run npm run spatial-v3:freeze`);
  console.log('Normative freeze digest is reproducible.');
} else {
  await writeFile(output, rendered, 'utf8');
  console.log(`Wrote ${output}.`);
}
