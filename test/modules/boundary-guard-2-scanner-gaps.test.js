import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { findRuntimeToolsBoundaryViolations } from '../../tools/architecture/runtime-tools-boundary.mjs';

// REVIEW-boundary-guard-2-01: D102 regression acceptance for CA findings F1–F4.
// Sources are scanned as text; no fixture filesystem/process operation executes.
const app = 'apps/service';
const tool = 'tools/worker';
const appName = '@scanner/service';
const toolName = '@scanner/worker';
const directions = [
  { owner: app, target: tool, packageName: toolName },
  { owner: 'packages/domain', target: tool, packageName: toolName },
  { owner: tool, target: app, packageName: appName }
];

async function put(root, path, value) {
  const file = join(root, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rus-scanner-gaps space #'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [owner, name] of [[app, appName], [tool, toolName],
    ['apps/neighbor', '@scanner/neighbor'], ['packages/domain', '@scanner/domain']]) {
    await put(root, `${owner}/package.json`, { name, type: 'module' });
    await put(root, `${owner}/src/index.mjs`, 'export const value = true;\n');
  }
  return root;
}

async function permit(root, source = 'src/probe.mjs', target = app) {
  await put(root, `${tool}/MODULE.md`, '# Fixture owner\n\n'
    + '```architecture-tool-app-dependencies\n'
    + JSON.stringify([{ source, target, reason: 'Evaluate the production implementation.' }])
    + '\n```\n');
}

async function check(root, file, denied) {
  const findings = await findRuntimeToolsBoundaryViolations({ root });
  if (denied) {
    assert.ok(findings.some((finding) => finding.startsWith(`${file}:`)),
      `Expected a boundary violation for ${file}; got ${JSON.stringify(findings)}`);
  } else {
    assert.deepEqual(findings, [], `Unexpected boundary violation for ${file}`);
  }
}

const ioImports = "import { readFile } from 'node:fs/promises';\n"
  + "import { readFileSync } from 'node:fs';\n"
  + "import { join, resolve } from 'node:path';\n"
  + "import { spawn, spawnSync, execFile } from 'node:child_process';\n";

const operations = [
  ['readFile(join)', (path) => `readFile(join(root, ${JSON.stringify(path)}));`],
  ['readFile(resolve)', (path) => `readFile(resolve(root, ${JSON.stringify(path)}));`],
  ['readFile literal', (path) => `readFile(${JSON.stringify(path)});`],
  ['readFileSync literal', (path) => `readFileSync(${JSON.stringify(path)});`],
  ['spawn literal argv', (path) => `spawn('node', [${JSON.stringify(path)}], { cwd: root });`],
  ['spawnSync literal argv', (path) => `spawnSync('node', [${JSON.stringify(path)}], { cwd: root });`],
  ['execFile literal argv', (path) => `execFile('node', [${JSON.stringify(path)}], { cwd: root });`]
];

for (const direction of directions) {
  for (const [label, operation] of operations) {
    test(`F1 ${direction.owner}: ${label} exposes a forbidden edge`, async (t) => {
      const root = await fixture(t);
      const file = `${direction.owner}/src/probe.mjs`;
      await put(root, file, ioImports + `const root = ${JSON.stringify(root)};\n`
        + operation(`${direction.target}/src/index.mjs`));
      await check(root, file, true);
    });
    if (direction.owner === tool) {
      test(`F1 tools: MODULE permission allows ${label}`, async (t) => {
        const root = await fixture(t);
        const file = `${tool}/src/probe.mjs`;
        await put(root, file, ioImports + `const root = ${JSON.stringify(root)};\n`
          + operation(`${app}/src/index.mjs`));
        await permit(root);
        await check(root, file, false);
      });
    }
  }
  test(`F1 ${direction.owner}: a literal process executable exposes an edge`, async (t) => {
    const root = await fixture(t);
    const file = `${direction.owner}/src/probe.mjs`;
    const executable = resolve(root, `${direction.target}/src/index.mjs`);
    await put(root, file, ioImports + `spawnSync(${JSON.stringify(executable)}, []);`);
    await check(root, file, true);
  });
  test(`F1 ${direction.owner}: ordinary I/O and inert text stay allowed`, async (t) => {
    const root = await fixture(t);
    const file = `${direction.owner}/src/probe.mjs`;
    await put(root, file, ioImports + `const root = ${JSON.stringify(root)};\n`
      + "readFile(join(root, 'data/config.json'));\n"
      + "spawnSync('node', ['scripts/ordinary.mjs'], { cwd: root });\n"
      + `// spawnSync('node', ['${direction.target}/src/index.mjs']);\n`
      + `const description = 'Documentation mentions ${direction.target}/src/index.mjs';\n`);
    await check(root, file, false);
  });
}

for (const builder of ['join', 'resolve']) {
  test(`F1 architecture owner may read app source as data with ${builder}`, async (t) => {
    const root = await fixture(t);
    const file = 'tools/architecture/probe.mjs';
    await put(root, file, ioImports + `const root = ${JSON.stringify(root)};\n`
      + `readFile(${builder}(root, '${app}/src/index.mjs'));`);
    await check(root, file, false);
  });
}

test('F1 architecture source-reading allowance does not allow a process edge', async (t) => {
  const root = await fixture(t);
  const file = 'tools/architecture/probe.mjs';
  await put(root, file, ioImports + `spawnSync('node', ['${app}/src/index.mjs']);`);
  await check(root, file, true);
});

for (const direction of directions) {
  for (const call of ['import', 'require']) {
    for (const [label, literal] of [
      ['ordinary string control', JSON.stringify(direction.packageName)],
      ['constant template', '`' + direction.packageName + '/entry`'],
      ['cooked template escape', '`' + direction.packageName.replace('/', '\\u002f') + '`']
    ]) {
      test(`F2 ${direction.owner}: ${call} ${label} exposes a forbidden edge`, async (t) => {
        const root = await fixture(t);
        const file = `${direction.owner}/src/probe.mjs`;
        await put(root, file, `${call}( ${literal} );`);
        await check(root, file, true);
      });
      if (direction.owner === tool && label !== 'ordinary string control') {
        test(`F2 tools: MODULE permission allows ${call} ${label}`, async (t) => {
          const root = await fixture(t);
          const file = `${tool}/src/probe.mjs`;
          await put(root, file, `${call}( ${literal} );`);
          await permit(root);
          await check(root, file, false);
        });
      }
    }
    test(`F2 ${direction.owner}: ${call} does not join unknown interpolation into a package name`, async (t) => {
      const root = await fixture(t);
      const file = `${direction.owner}/src/probe.mjs`;
      const literal = '`' + direction.packageName.replace('/', '/${unknown}') + '`';
      await put(root, file, `${call}(${literal});`);
      await check(root, file, false);
    });
  }
}

for (const direction of directions) {
  for (const [label, expression] of [
    ['repository data subtree', (root, target) => `resolve(root, 'data/${target}/src/index.mjs')`],
    ['absolute data path', (root, target) => `new URL(${JSON.stringify(pathToFileURL(resolve(root, `data/${target}/src/index.mjs`)).href)})`],
    ['static relative data URL', (root, target) => `new URL('../../../data/${target}/src/index.mjs', import.meta.url)`],
    ['external absolute path', (root, target) => `resolve(${JSON.stringify(resolve(dirname(root), 'outside', `${target}/src/index.mjs`))})`],
    ['external file URL', (root, target) => `new URL(${JSON.stringify(pathToFileURL(resolve(dirname(root), 'outside', `${target}/src/index.mjs`)).href)})`],
    ['remote URL control', (root, target) => `new URL('https://example.invalid/${target}/src/index.mjs')`]
  ]) {
    test(`F3 ${direction.owner}: ${label} preserves its actual target`, async (t) => {
      const root = await fixture(t);
      const file = `${direction.owner}/src/probe.mjs`;
      // Existing files make these real data targets rather than unresolved guesses.
      await put(root, `data/${direction.target}/src/index.mjs`, 'data fixture\n');
      await put(root, file, "import { resolve } from 'node:path';\n"
        + `const root = ${JSON.stringify(root)};\n`
        + `const path = ${expression(root, direction.target)};`);
      await check(root, file, false);
    });
  }
  for (const [label, expression] of [
    ['known repo file URL', (root, target) => `new URL(${JSON.stringify(pathToFileURL(resolve(root, `${target}/src/index.mjs`)).href)})`],
    ['root-relative resolve control', (root, target) => `resolve(root, '${target}/src/index.mjs')`],
    ['repository-root template control', (root, target) => '`' + '${root}/' + target + '/src/index.mjs`']
  ]) {
    test(`F3 ${direction.owner}: ${label} still exposes a forbidden edge`, async (t) => {
      const root = await fixture(t);
      const file = `${direction.owner}/src/probe.mjs`;
      await put(root, file, "import { resolve } from 'node:path';\n"
        + `const root = ${JSON.stringify(root)};\n`
        + `const path = ${expression(root, direction.target)};`);
      await check(root, file, true);
    });
  }
}

for (const [label, source, target, denied] of [
  ['exact permission', 'src/probe.mjs', app, false],
  ['owner-wide permission', '*', app, false],
  ['undeclared source', null, app, true],
  ['permission for another source', 'src/other.mjs', app, true],
  ['permission for another app', 'src/probe.mjs', 'apps/neighbor', true]
]) {
  test(`F4 tool source symlink: ${label}`, async (t) => {
    const root = await fixture(t);
    const file = `${tool}/src/probe.mjs`;
    await put(root, `${tool}/src/other.mjs`, 'export const other = true;\n');
    await symlink(resolve(root, `${app}/src/index.mjs`), join(root, file));
    if (source !== null) await permit(root, source, target);
    await check(root, file, denied);
  });
}

for (const owner of [app, 'packages/domain']) {
  test(`F4 ${owner}: tools permission cannot allow a runtime source symlink`, async (t) => {
    const root = await fixture(t);
    const file = `${owner}/src/probe.mjs`;
    await symlink(resolve(root, `${tool}/src/index.mjs`), join(root, file));
    await permit(root, '*');
    await check(root, file, true);
  });
}
