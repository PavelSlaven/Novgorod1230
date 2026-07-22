import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  REVIEWED_BASELINE_PATH,
  REVIEWED_BASELINE_SHA256,
  invariant,
  loadReviewedBaseline,
  sha256,
  validateP02Declaration,
  validateReviewedRegistries,
  validateReviewedSourceDigests
} from './p05-reviewed-baseline.mjs';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  invariant(process.argv[index + 1], `${name} requires a value`);
  return process.argv[index + 1];
};
const root = path.resolve(argument('--root', '.'));
const outputRelative = argument('--output', 'docs/migration/spatial-v3/normative-freeze.json');
const output = path.resolve(root, outputRelative);
const read = (relativePath) => readFile(path.resolve(root, relativePath), 'utf8');
const standardPath = 'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md';
const matrixPath = 'docs/migration/spatial-v3/contract-implementation-matrix.json';
const declarationPath = 'docs/migration/spatial-v3/evidence/p02-boundary-declaration.json';
const declarationSchemaPath = 'data/contracts/spatial-v3/p02-boundary-declaration.schema.json';
const conflictsPath = 'docs/migration/spatial-v3/normative-conflicts.md';

const { baseline } = await loadReviewedBaseline(root);
invariant(baseline.schema_version === 'p05-reviewed-baseline.v1', 'unsupported reviewed P05 baseline');
invariant(baseline.review_status === 'reviewed', 'P05 baseline is not reviewed');
const docs = Object.keys(baseline.source_digests).sort();
const sourceDigests = Object.fromEntries(await Promise.all(docs.map(async (source) => [source, sha256(await read(source))])));

const standard = await read(standardPath);
const matrix = JSON.parse(await read(matrixPath));
const declaration = JSON.parse(await read(declarationPath));
const conflictsText = await read(conflictsPath);
validateP02Declaration(declaration, sourceDigests);
validateReviewedSourceDigests(sourceDigests, baseline);

const appendixC = standard.slice(standard.indexOf('# Приложение C.'), standard.indexOf('# Приложение D.'));
const contracts = [...standard.matchAll(/```yaml\r?\ncontract_name:\s*([^\r\n]+)[\s\S]*?```/g)].map((match) => match[1].trim()).sort();
const errors = [...appendixC.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((match) => match[1].trim()).filter((name) => name !== 'code').sort();
const conflictIds = conflictsText.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^\|\s*(NC-\d+)\s*\|/);
  return match ? [match[1]] : [];
}).sort();
const contractOwnership = matrix.contracts.map((entry) => ({
  contract_name: entry.contract_name,
  owner_package: entry.owner_package,
  json_schema_or_dto: entry.json_schema_or_dto,
  ddl_table_or_value: entry.ddl_table_or_value,
  validator: entry.validator,
  repository: entry.repository,
  tests: entry.tests,
  migration_step: entry.migration_step
})).sort((left, right) => left.contract_name.localeCompare(right.contract_name));
const errorOwnership = matrix.errors.map((entry) => ({
  error_code: entry.error_code,
  owner_package: entry.owner_package,
  json_schema_or_dto: entry.json_schema_or_dto,
  validator: entry.validator,
  tests: entry.tests,
  migration_step: entry.migration_step
})).sort((left, right) => left.error_code.localeCompare(right.error_code));
invariant(contractOwnership.every((row) => Object.values(row).every(Boolean)), 'incomplete contract ownership');
invariant(errorOwnership.every((row) => Object.values(row).every(Boolean)), 'incomplete typed-error ownership');
validateReviewedRegistries({
  baseline,
  contracts,
  errors,
  contractOwnership,
  errorOwnership,
  conflictIds,
  conflictsText
});

const freeze = {
  schema_version: '1.2.0',
  status: 'target',
  activation_boundary: 'P28 atomic activation only; no dual write, authoritative mixed read, fallback or partial activation.',
  reviewed_baseline: {
    path: REVIEWED_BASELINE_PATH,
    sha256: REVIEWED_BASELINE_SHA256
  },
  active_target_boundary: {
    declaration_path: declarationPath,
    declaration_sha256: sourceDigests[declarationPath],
    schema_path: declarationSchemaPath,
    schema_sha256: sourceDigests[declarationSchemaPath],
    active_owner: declaration.active_owner,
    target_status: declaration.target_status,
    production_read: declaration.production_read,
    production_write: declaration.production_write,
    document_pair_count: declaration.documents.length
  },
  source_standard: {
    path: standardPath,
    version: '4.2.0',
    sha256: sourceDigests[standardPath]
  },
  contract_registry: {
    path: matrixPath,
    sha256: sourceDigests[matrixPath],
    count: contracts.length,
    names_sha256: sha256(JSON.stringify(contracts))
  },
  typed_error_registry: {
    source: `${standardPath}#appendix-c`,
    count: errors.length,
    names_sha256: sha256(JSON.stringify(errors))
  },
  ownership_registry: {
    contract_rows: contractOwnership.length,
    contract_rows_sha256: sha256(JSON.stringify(contractOwnership)),
    error_rows: errorOwnership.length,
    error_rows_sha256: sha256(JSON.stringify(errorOwnership))
  },
  conflict_registry: {
    path: conflictsPath,
    count: conflictIds.length,
    ids_sha256: sha256(JSON.stringify(conflictIds)),
    open_findings: 0
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
    conflict_register: conflictsPath,
    boundary_declaration: declarationPath,
    open_findings: 0
  }
};

const rendered = `${JSON.stringify(freeze, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const current = await readFile(output, 'utf8');
  invariant(current === rendered, `${outputRelative} is stale; run npm run spatial-v3:freeze`);
  console.log('Normative freeze digest is reproducible and matches the independently reviewed baseline.');
} else {
  await writeFile(output, rendered, 'utf8');
  console.log(`Wrote ${outputRelative} from the independently reviewed baseline.`);
}
