import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const checker = path.resolve('tools/spatial-v3/check-p05.mjs');
const generator = path.resolve('tools/spatial-v3/generate-normative-freeze.mjs');
const baselineSource = path.resolve('data/contracts/spatial-v3/p05-reviewed-baseline.json');
const freezeSource = path.resolve('docs/migration/spatial-v3/normative-freeze.json');
const baseline = JSON.parse(await readFile(baselineSource, 'utf8'));
const declarationPath = 'docs/migration/spatial-v3/evidence/p02-boundary-declaration.json';
const schemaPath = 'data/contracts/spatial-v3/p02-boundary-declaration.schema.json';
const matrixPath = 'docs/migration/spatial-v3/contract-implementation-matrix.json';
const conflictsPath = 'docs/migration/spatial-v3/normative-conflicts.md';

function execute(script, root, args = []) {
  return spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' });
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'p05-reviewed-'));
  for (const source of [...Object.keys(baseline.source_digests), 'data/contracts/spatial-v3/p05-reviewed-baseline.json']) {
    const destination = path.join(root, source);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.resolve(source), destination);
  }
  const freezeDestination = path.join(root, 'docs/migration/spatial-v3/normative-freeze.json');
  await mkdir(path.dirname(freezeDestination), { recursive: true });
  await cp(freezeSource, freezeDestination);
  return root;
}

async function readJson(root, relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}

async function writeJson(root, relative, value) {
  await writeFile(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
}

async function coordinatedFreezeRepin(root, source, extra = () => {}) {
  const freeze = await readJson(root, 'docs/migration/spatial-v3/normative-freeze.json');
  const digest = (await import('node:crypto')).createHash('sha256').update(await readFile(path.join(root, source))).digest('hex');
  freeze.source_digests[source] = digest;
  extra(freeze, digest);
  await writeJson(root, 'docs/migration/spatial-v3/normative-freeze.json', freeze);
}

function assertBothReject(root, pattern) {
  const checked = execute(checker, root);
  const generated = execute(generator, root, ['--output', 'generated-freeze.json']);
  assert.notEqual(checked.status, 0, 'checker accepted an unreviewed coordinated change');
  assert.notEqual(generated.status, 0, 'generator blessed an unreviewed coordinated change');
  if (pattern) {
    assert.match(`${checked.stderr}${checked.stdout}`, pattern);
    assert.match(`${generated.stderr}${generated.stdout}`, pattern);
  }
}

test('P05 checker and generator accept only the canonical independently reviewed baseline', async () => {
  const root = await fixture();
  assert.equal(execute(checker, root).status, 0);
  assert.equal(execute(generator, root, ['--output', 'generated-freeze.json']).status, 0);
});

test('coordinated target source, declaration and freeze repin is rejected', async () => {
  const root = await fixture();
  const target = 'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_code_driven_world_materialization_architecture.md';
  await appendFile(path.join(root, target), '\nUnreviewed semantic drift.\n');
  const declaration = await readJson(root, declarationPath);
  const targetDigest = (await import('node:crypto')).createHash('sha256').update(await readFile(path.join(root, target))).digest('hex');
  declaration.documents.find((row) => row.pair_id === 'architecture').target.sha256 = targetDigest;
  declaration.documents.find((row) => row.pair_id === 'architecture').target.section_sha256 = targetDigest;
  await writeJson(root, declarationPath, declaration);
  const declarationDigest = (await import('node:crypto')).createHash('sha256').update(await readFile(path.join(root, declarationPath))).digest('hex');
  await coordinatedFreezeRepin(root, target, (freeze) => {
    freeze.source_digests[declarationPath] = declarationDigest;
    freeze.active_target_boundary.declaration_sha256 = declarationDigest;
  });
  assertBothReject(root, /independently reviewed P05 baseline/);
});

test('coordinated schema, declaration and freeze repin is rejected', async () => {
  const root = await fixture();
  const schema = await readJson(root, schemaPath);
  schema.properties.active_owner.const = 'v3';
  await writeJson(root, schemaPath, schema);
  const declaration = await readJson(root, declarationPath);
  declaration.active_owner = 'v3';
  await writeJson(root, declarationPath, declaration);
  const declarationDigest = (await import('node:crypto')).createHash('sha256').update(await readFile(path.join(root, declarationPath))).digest('hex');
  await coordinatedFreezeRepin(root, schemaPath, (freeze, digest) => {
    freeze.active_target_boundary.schema_sha256 = digest;
    freeze.source_digests[declarationPath] = declarationDigest;
    freeze.active_target_boundary.declaration_sha256 = declarationDigest;
    freeze.active_target_boundary.active_owner = 'v3';
  });
  assertBothReject(root, /active_owner/);
});

test('coordinated owner matrix and freeze repin is rejected', async () => {
  const root = await fixture();
  const matrix = await readJson(root, matrixPath);
  matrix.contracts[0].owner_package = '@rus/unauthorized-owner';
  await writeJson(root, matrixPath, matrix);
  const ownership = matrix.contracts.map((entry) => ({
    contract_name: entry.contract_name,
    owner_package: entry.owner_package,
    json_schema_or_dto: entry.json_schema_or_dto,
    ddl_table_or_value: entry.ddl_table_or_value,
    validator: entry.validator,
    repository: entry.repository,
    tests: entry.tests,
    migration_step: entry.migration_step
  })).sort((left, right) => left.contract_name.localeCompare(right.contract_name));
  const ownershipDigest = (await import('node:crypto')).createHash('sha256').update(JSON.stringify(ownership)).digest('hex');
  await coordinatedFreezeRepin(root, matrixPath, (freeze, digest) => {
    freeze.contract_registry.sha256 = digest;
    freeze.ownership_registry.contract_rows_sha256 = ownershipDigest;
  });
  assertBothReject(root, /independently reviewed P05 baseline/);
});

for (const [name, mutate, pattern] of [
  ['duplicate pair', (declaration) => { declaration.documents = declaration.documents.map(() => structuredClone(declaration.documents[0])); }, /duplicate pair architecture/],
  ['omitted pair', (declaration) => { declaration.documents.pop(); }, /exactly four pairs/],
  ['unknown pair', (declaration) => { declaration.documents[3].pair_id = 'unknown'; }, /unknown pair/]
]) {
  test(`P02 declaration rejects ${name} in both checker and generator`, async () => {
    const root = await fixture();
    const declaration = await readJson(root, declarationPath);
    mutate(declaration);
    await writeJson(root, declarationPath, declaration);
    assertBothReject(root, pattern);
  });
}

for (const [name, mutate] of [
  ['contract count', (matrix) => { matrix.contracts.pop(); }],
  ['error count', (matrix) => { matrix.errors.pop(); }]
]) {
  test(`reviewed baseline rejects ${name} mutation with coordinated repin`, async () => {
    const root = await fixture();
    const matrix = await readJson(root, matrixPath);
    mutate(matrix);
    await writeJson(root, matrixPath, matrix);
    await coordinatedFreezeRepin(root, matrixPath);
    assertBothReject(root, /independently reviewed P05 baseline/);
  });
}

test('reviewed baseline rejects NC change with coordinated freeze repin', async () => {
  const root = await fixture();
  const conflicts = path.join(root, conflictsPath);
  const text = await readFile(conflicts, 'utf8');
  await writeFile(conflicts, text.replace('NC-10', 'NC-11'));
  const ids = (await readFile(conflicts, 'utf8')).split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\|\s*(NC-\d+)\s*\|/);
    return match ? [match[1]] : [];
  }).sort();
  const idsDigest = (await import('node:crypto')).createHash('sha256').update(JSON.stringify(ids)).digest('hex');
  await coordinatedFreezeRepin(root, conflictsPath, (freeze) => {
    freeze.conflict_registry.ids_sha256 = idsDigest;
  });
  assertBothReject(root, /independently reviewed P05 baseline/);
});

test('tampered reviewed baseline itself is rejected by its hardcoded whole-file SHA', async () => {
  const root = await fixture();
  const trustPath = path.join(root, 'data/contracts/spatial-v3/p05-reviewed-baseline.json');
  const trust = JSON.parse(await readFile(trustPath, 'utf8'));
  trust.review_status = 'self-approved';
  await writeFile(trustPath, `${JSON.stringify(trust, null, 2)}\n`);
  assertBothReject(root, /hardcoded trust anchor/);
});
