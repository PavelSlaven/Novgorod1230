import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { findRuntimeToolsBoundaryViolations } from '../runtime-tools-boundary.mjs';

const toolSource = '../../../tools/authoring/src/index.mjs';

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'runtime-tools-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(join(root, 'apps'), { recursive: true }),
    mkdir(join(root, 'packages/probe/src'), { recursive: true }),
    mkdir(join(root, 'tools/authoring/src'), { recursive: true })
  ]);
  await Promise.all([
    writeFile(join(root, 'packages/probe/package.json'), JSON.stringify({ name: '@fixture/runtime-probe' })),
    writeFile(join(root, 'tools/authoring/package.json'), JSON.stringify({ name: '@fixture/authoring' })),
    writeFile(join(root, 'tools/authoring/src/index.mjs'), 'export const value = 1;\n')
  ]);
  return root;
}

test('runtime-tools guard catches imports inside template expressions', async (t) => {
  const root = await createFixture(t);
  await writeFile(join(root, 'packages/probe/src/index.mjs'),
    "export const value = `result: ${(await import('" + toolSource + "')).value}`;\n");

  const violations = await findRuntimeToolsBoundaryViolations({ root });

  assert.equal(violations.length, 1);
  assert.match(violations[0], /packages\/probe\/src\/index\.mjs: runtime import targets tools package @fixture\/authoring/u);
});

test('runtime-tools guard resolves relative imports through symlink targets', async (t) => {
  const root = await createFixture(t);
  await symlink(
    join(root, 'tools/authoring/src/index.mjs'),
    join(root, 'packages/probe/src/vendor.mjs')
  );
  await writeFile(join(root, 'packages/probe/src/index.mjs'), "export { value } from './vendor.mjs';\n");

  const violations = await findRuntimeToolsBoundaryViolations({ root });

  assert.ok(violations.some((entry) => entry.includes('runtime import targets tools package @fixture/authoring')));
});

test('runtime-tools guard scans symlinked source files', async (t) => {
  const root = await createFixture(t);
  await writeFile(join(root, 'packages/probe/shared.mjs'), "import '@fixture/authoring';\n");
  await symlink(
    join(root, 'packages/probe/shared.mjs'),
    join(root, 'packages/probe/src/alias.mjs')
  );

  const violations = await findRuntimeToolsBoundaryViolations({ root });

  assert.ok(violations.some((entry) => entry.includes('runtime import targets tools package @fixture/authoring')));
});

test('runtime-tools guard rejects a runtime source symlink into tools', async (t) => {
  const root = await createFixture(t);
  await symlink(
    join(root, 'tools/authoring/src/index.mjs'),
    join(root, 'packages/probe/src/alias.mjs')
  );

  const violations = await findRuntimeToolsBoundaryViolations({ root });

  assert.ok(violations.some((entry) => entry.includes('runtime source resolves to tools package @fixture/authoring')));
});

for (const [escape, source] of [
  ['Unicode escape', String.raw`export const value = import('@fixture/\u0061uthoring');`],
  ['code point escape', String.raw`export const value = import('@fixture/\u{61}uthoring');`],
  ['hex escape', String.raw`export const value = import('@fixture/\x61uthoring');`]
]) {
  test(`runtime-tools guard decodes ${escape} in import specifiers`, async (t) => {
    const root = await createFixture(t);
    await writeFile(join(root, 'packages/probe/src/index.mjs'), `${source}\n`);

    const violations = await findRuntimeToolsBoundaryViolations({ root });

    assert.equal(violations.length, 1);
    assert.match(violations[0], /runtime import targets tools package @fixture\/authoring/u);
  });
}

test('runtime-tools guard ignores regex literals and member methods named require/import', async (t) => {
  const root = await createFixture(t);
  const source = String.raw`const pattern = /import('@fixture\/authoring')/; thing.require('@fixture/authoring'); thing.import('@fixture/authoring');`;
  await writeFile(join(root, 'packages/probe/src/index.mjs'), `${source}\n`);

  const violations = await findRuntimeToolsBoundaryViolations({ root });

  assert.deepEqual(violations, []);
});

test('runtime-tools guard still catches a direct dynamic import', async (t) => {
  const root = await createFixture(t);
  await writeFile(join(root, 'packages/probe/src/index.mjs'), "export const value = import('@fixture/authoring');\n");

  const violations = await findRuntimeToolsBoundaryViolations({ root });

  assert.equal(violations.length, 1);
  assert.match(violations[0], /runtime import targets tools package @fixture\/authoring/u);
});
