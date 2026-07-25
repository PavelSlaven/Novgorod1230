import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const checker = path.resolve('tools/spatial-v3/check-p05.mjs');
const generator = path.resolve('tools/spatial-v3/generate-normative-freeze.mjs');
const baselinePath = 'data/contracts/spatial-v3/p05-reviewed-baseline.json';
const freezePath = 'docs/migration/spatial-v3/normative-freeze.json';
const declarationPath = 'docs/migration/spatial-v3/evidence/p02-boundary-declaration.json';
const schemaPath = 'data/contracts/spatial-v3/p02-boundary-declaration.schema.json';
const currentDocumentPath = 'data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md';

function execute(script, root, args = []) {
  return spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' });
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'p05-historical-'));
  for (const source of [baselinePath, freezePath, declarationPath, schemaPath, currentDocumentPath]) {
    const destination = path.join(root, source);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.resolve(source), destination);
  }
  return root;
}

function assertBothReject(root, pattern) {
  const checked = execute(checker, root);
  const generated = execute(generator, root, ['--output', 'generated-freeze.json']);
  assert.notEqual(checked.status, 0, 'checker accepted tampered historical evidence');
  assert.notEqual(generated.status, 0, 'generator copied tampered historical evidence');
  assert.match(`${checked.stderr}${checked.stdout}`, pattern);
  assert.match(`${generated.stderr}${generated.stdout}`, pattern);
}

test('P05 checker verifies immutable history and generator copies exact historical bytes', async () => {
  const root = await fixture();
  assert.equal(execute(checker, root).status, 0);
  assert.equal(execute(generator, root, ['--output', 'generated-freeze.json']).status, 0);
  assert.equal(
    await readFile(path.join(root, 'generated-freeze.json'), 'utf8'),
    await readFile(path.join(root, freezePath), 'utf8')
  );
});

test('current normative evolution does not rewrite or invalidate historical P05 evidence', async () => {
  const root = await fixture();
  await appendFile(path.join(root, currentDocumentPath), '\nCurrent post-P28 status clarification.\n');
  assert.equal(execute(checker, root).status, 0);
});

test('tampered historical freeze is rejected', async () => {
  const root = await fixture();
  const freeze = JSON.parse(await readFile(path.join(root, freezePath), 'utf8'));
  freeze.status = 'active';
  await writeFile(path.join(root, freezePath), `${JSON.stringify(freeze, null, 2)}\n`);
  assertBothReject(root, /immutable trust anchor/);
});

test('tampered independently reviewed baseline is rejected', async () => {
  const root = await fixture();
  const baseline = JSON.parse(await readFile(path.join(root, baselinePath), 'utf8'));
  baseline.review_status = 'self-approved';
  await writeFile(path.join(root, baselinePath), `${JSON.stringify(baseline, null, 2)}\n`);
  assertBothReject(root, /hardcoded trust anchor/);
});

test('tampered historical P02 declaration is rejected', async () => {
  const root = await fixture();
  const declaration = JSON.parse(await readFile(path.join(root, declarationPath), 'utf8'));
  declaration.active_owner = 'v3';
  await writeFile(path.join(root, declarationPath), `${JSON.stringify(declaration, null, 2)}\n`);
  assertBothReject(root, /historical P02 declaration digest mismatch/);
});

test('tampered historical P02 schema is rejected', async () => {
  const root = await fixture();
  const schema = JSON.parse(await readFile(path.join(root, schemaPath), 'utf8'));
  schema.properties.active_owner.const = 'v3';
  await writeFile(path.join(root, schemaPath), `${JSON.stringify(schema, null, 2)}\n`);
  assertBothReject(root, /historical P02 schema digest mismatch/);
});
