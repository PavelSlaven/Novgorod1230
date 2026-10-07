import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { findRuntimeToolsBoundaryViolations } from '../../tools/architecture/runtime-tools-boundary.mjs';

// REVIEW-boundary-guard-2-02, D102. Fixture operations are scanned as text,
// never executed. Architecture's exemption covers source reads, not mutations.
const app = 'apps/service';
const architecture = 'tools/architecture';
const worker = 'tools/worker';
const tick = String.fromCharCode(96);
const rootTemplate = '$' + '{root}/';
const forms = ['string', 'join', 'resolve', 'inline-template', 'constant-variable', 'file-url'];
const contexts = [
  ...['apps/runtime', 'packages/domain'].flatMap((owner) =>
    [architecture, worker].map((targetOwner) =>
      ({ direction: 'runtime-to-tools', owner, targetOwner }))),
  ...[architecture, worker].map((owner) =>
    ({ direction: 'tools-to-apps', owner, targetOwner: app }))
];
const imports = [
  "import { readFile, writeFile } from 'node:fs/promises';",
  "import { spawnSync } from 'node:child_process';",
  "import { join, resolve } from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
  "import { createRequire } from 'node:module';",
  'const require = createRequire(import.meta.url);',
  'const root = process.cwd();'
].join('\n') + '\n';
const operations = [
  { name: 'readFile', category: 'read', call: (path) => 'await readFile(' + path + ", 'utf8');" },
  { name: 'writeFile', category: 'write-change', call: (path) => 'await writeFile(' + path + ", 'fixture');" },
  { name: 'spawnSync', category: 'process', call: (path) => "spawnSync('python3', [" + path + ']);' },
  { name: 'import', category: 'import-require', call: (path) => 'await import(' + path + ');' },
  { name: 'require', category: 'import-require', call: (path) => 'require(' + path + ');' }
];

async function put(root, path, value) {
  const file = resolve(root, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rus-scanner-matrix space #'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [owner, name] of [
    [app, '@matrix/service'], ['apps/neighbor', '@matrix/neighbor'],
    ['apps/runtime', '@matrix/runtime'], ['packages/domain', '@matrix/domain'],
    [architecture, '@matrix/architecture'], [worker, '@matrix/worker']
  ]) {
    await put(root, owner + '/package.json', { name, type: 'module' });
    await put(root, owner + '/src/index.mjs', 'export const value = true;\n');
    await put(root, owner + '/src/other.mjs', 'export const other = true;\n');
  }
  await put(root, worker + '/run.py', 'print("fixture")\n');
  await put(root, 'data/local.mjs', 'local fixture\n');
  return root;
}

async function permission(root, context, mode) {
  if (mode === 'none') return;
  const reverse = context.direction === 'runtime-to-tools';
  const owner = reverse ? context.targetOwner : context.owner;
  const entry = {
    source: reverse ? 'src/index.mjs' : mode === 'wrong-source' ? 'src/other.mjs' : 'src/probe.mjs',
    target: reverse ? 'apps/runtime' : mode === 'wrong-target' ? 'apps/neighbor' : app,
    reason: 'Explicit app dependency for the source under test.'
  };
  await put(root, owner + '/MODULE.md', '# Fixture owner\n\n'
    + tick.repeat(3) + 'architecture-tool-app-dependencies\n'
    + JSON.stringify([entry]) + '\n' + tick.repeat(3) + '\n');
}

function denied(context, category, mode) {
  if (context.direction === 'runtime-to-tools') return true;
  if (context.owner === architecture && category === 'read') return false;
  return mode !== 'exact';
}

function pathArgument(root, target, form, operation) {
  const template = tick + rootTemplate + target + tick;
  if (form === 'constant-variable') {
    return { setup: 'const targetPath = ' + template + ';\n', expression: 'targetPath' };
  }
  if (form === 'inline-template') return { setup: '', expression: template };
  if (form === 'join' || form === 'resolve') {
    return { setup: '', expression: form + '(root, '
      + target.split('/').map((segment) => JSON.stringify(segment)).join(', ') + ')' };
  }
  if (form === 'file-url') {
    const url = JSON.stringify(pathToFileURL(resolve(root, target)).href);
    if (operation === 'import') return { setup: '', expression: url };
    const expression = 'new URL(' + url + ')';
    return { setup: '', expression: ['spawnSync', 'require'].includes(operation)
      ? 'fileURLToPath(' + expression + ')' : expression };
  }
  return { setup: '', expression: JSON.stringify(resolve(root, target)) };
}

async function expectBoundary(root, sourceFile, expectedDenied) {
  const findings = await findRuntimeToolsBoundaryViolations({ root });
  if (!expectedDenied) {
    assert.deepEqual(findings, [], 'Allowed edge reported: ' + JSON.stringify(findings));
    return;
  }
  assert.ok(findings.some((finding) => finding.startsWith(sourceFile + ':')),
    'Expected boundary finding for ' + sourceFile + '; got ' + JSON.stringify(findings));
  assert.ok(findings.every((finding) => finding.startsWith(sourceFile + ':')),
    'Fixture has unrelated findings: ' + JSON.stringify(findings));
}

for (const context of contexts) {
  const modes = context.direction === 'runtime-to-tools'
    ? ['none', 'reverse-permission'] : ['none', 'exact', 'wrong-source', 'wrong-target'];
  for (const operation of operations) {
    for (const form of forms) {
      for (const mode of modes) {
        const expectedDenied = denied(context, operation.category, mode);
        test(['MATRIX', context.direction, context.owner, context.targetOwner,
          operation.category, operation.name, form, mode, expectedDenied ? 'deny' : 'allow'].join(' '),
        async (t) => {
          const root = await fixture(t);
          const file = context.owner + '/src/probe.mjs';
          const argument = pathArgument(root, context.targetOwner + '/src/index.mjs', form, operation.name);
          await put(root, file, imports + argument.setup + operation.call(argument.expression));
          await permission(root, context, mode);
          await expectBoundary(root, file, expectedDenied);
        });
      }
    }
  }
}

// The write category also has APIs with two path arguments. Both source and
// destination are boundary references; copying/linking is not a read exemption.
const filesystemOperations = [
  ...['access', 'lstat', 'readFile', 'readdir', 'realpath', 'stat'].map((name) =>
    ({ name, category: 'read', call: (path) => 'fs.' + name + '(' + path + ', () => {});' })),
  ...['accessSync', 'existsSync', 'lstatSync', 'readFileSync', 'readdirSync', 'realpathSync', 'statSync',
    'createReadStream'].map((name) =>
    ({ name, category: 'read', call: (path) => 'fs.' + name + '(' + path + ');' })),
  { name: 'open-read', category: 'read', call: (path) => 'fs.open(' + path + ", 'r', () => {});" },
  { name: 'openSync-read', category: 'read', call: (path) => 'fs.openSync(' + path + ", 'r');" },
  ...['writeFile', 'appendFile'].map((name) =>
    ({ name, category: 'write-change', call: (path) => 'fs.' + name + '(' + path + ", 'fixture', () => {});" })),
  ...['writeFileSync', 'appendFileSync'].map((name) =>
    ({ name, category: 'write-change', call: (path) => 'fs.' + name + '(' + path + ", 'fixture');" })),
  ...['mkdir', 'rm', 'unlink', 'rmdir'].map((name) =>
    ({ name, category: 'write-change', call: (path) => 'fs.' + name + '(' + path + ', () => {});' })),
  ...['mkdirSync', 'rmSync', 'unlinkSync', 'rmdirSync', 'createWriteStream'].map((name) =>
    ({ name, category: 'write-change', call: (path) => 'fs.' + name + '(' + path + ');' })),
  { name: 'chmod', category: 'write-change', call: (path) => 'fs.chmod(' + path + ', 0o600, () => {});' },
  { name: 'chmodSync', category: 'write-change', call: (path) => 'fs.chmodSync(' + path + ', 0o600);' },
  ...['w', 'r+'].flatMap((flag) => [
    { name: 'open-' + flag, category: 'write-change',
      call: (path) => 'fs.open(' + path + ', ' + JSON.stringify(flag) + ', () => {});' },
    { name: 'openSync-' + flag, category: 'write-change',
      call: (path) => 'fs.openSync(' + path + ', ' + JSON.stringify(flag) + ');' }
  ]),
  ...['copyFile', 'copyFileSync', 'rename', 'renameSync', 'link', 'linkSync', 'symlink', 'symlinkSync']
    .flatMap((name) => [0, 1].map((slot) => ({
      name: name + '-path-' + slot, category: 'write-change',
      call: (path) => {
        const args = [path, "'data/local.mjs'"];
        if (slot === 1) args.reverse();
        if (!name.endsWith('Sync')) args.push('() => {}');
        return 'fs.' + name + '(' + args.join(', ') + ');';
      }
    })))
];
const apiContexts = contexts.filter((context) =>
  context.direction === 'tools-to-apps' || context.targetOwner === worker);
for (const context of apiContexts) {
  for (const operation of filesystemOperations) {
    const modes = context.direction === 'runtime-to-tools' ? ['none'] : ['none', 'exact'];
    for (const mode of modes) {
      test(['FS-API', context.direction, context.owner, operation.category, operation.name, mode].join(' '),
        async (t) => {
          const root = await fixture(t);
          const file = context.owner + '/src/probe.mjs';
          const target = context.targetOwner + '/src/index.mjs';
          await put(root, file, "import * as fs from 'node:fs';\n"
            + operation.call(JSON.stringify(resolve(root, target))));
          await permission(root, context, mode);
          await expectBoundary(root, file, denied(context, operation.category, mode));
        });
    }
  }
}

// Inline/variable equivalence applies to each process API and both executable
// and argv positions, including architecture's non-exempt process calls.
for (const context of apiContexts) {
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']) {
    for (const slot of ['executable', 'argv']) {
      for (const form of ['inline-template', 'constant-variable']) {
        const modes = context.direction === 'runtime-to-tools' ? ['none'] : ['none', 'exact'];
        for (const mode of modes) {
          test(['PROCESS-API', context.direction, context.owner, name, slot, form, mode].join(' '),
            async (t) => {
              const root = await fixture(t);
              const file = context.owner + '/src/probe.mjs';
              const argument = pathArgument(root, context.targetOwner + '/src/index.mjs', form, name);
              const args = slot === 'executable' ? argument.expression
                : (name === 'fork' ? "'data/local.mjs'" : "'python3'") + ', [' + argument.expression + ']';
              await put(root, file, "import * as childProcess from 'node:child_process';\n"
                + 'const root = process.cwd();\n' + argument.setup
                + 'childProcess.' + name + '(' + args + ');');
              await permission(root, context, mode);
              await expectBoundary(root, file, denied(context, 'process', mode));
            });
        }
      }
    }
  }
}

// An unknown package interpolation is not a resolved filesystem path.
for (const context of contexts) {
  for (const call of ['import', 'require']) {
    for (const expression of ['unknownSpecifier',
      tick + '@matrix/' + '$' + '{unknown}worker' + tick,
      "packagePrefix + '/entry'"]) {
      test(['UNKNOWN-IMPORT', context.direction, context.owner, context.targetOwner, call, expression].join(' '),
        async (t) => {
          const root = await fixture(t);
          const file = context.owner + '/src/probe.mjs';
          await put(root, file, imports + call + '(' + expression + ');');
          await expectBoundary(root, file, false);
        });
    }
  }
}

for (const context of contexts) {
  test(['LOCAL-CONTROL', context.direction, context.owner, context.targetOwner].join(' '), async (t) => {
    const root = await fixture(t);
    const file = context.owner + '/src/probe.mjs';
    await put(root, file, imports + "await readFile('data/local.mjs');\n"
      + "await writeFile('data/local.mjs', 'fixture');\n"
      + "spawnSync('node', ['data/local.mjs']);");
    await expectBoundary(root, file, false);
  });
}

// Exact source excerpts from CA-2 repro-fixtures; only the scanner runs them.
for (const [name, owner, source] of [
  ['CA R2-F1 architecture write', architecture,
    "import { writeFile } from 'node:fs/promises';\nimport { join } from 'node:path';\n"
    + "await writeFile(join(root, 'apps/service/src/index.mjs'), 'overwritten');"],
  ['CA R2-F2 inline process template', 'apps/runtime',
    "import { spawnSync } from 'node:child_process';\nspawnSync('python3', ["
    + tick + rootTemplate + 'tools/worker/run.py' + tick + ']);'],
  ['CA R2-F2 inline read template', 'apps/runtime',
    "import { readFile } from 'node:fs/promises';\nreadFile("
    + tick + rootTemplate + 'tools/worker/run.py' + tick + ');']
]) {
  test(name, async (t) => {
    const root = await fixture(t);
    const file = owner + '/src/probe.mjs';
    await put(root, file, source);
    await expectBoundary(root, file, true);
  });
}
