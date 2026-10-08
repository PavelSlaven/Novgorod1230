import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { findRuntimeToolsBoundaryViolations } from '../../tools/architecture/runtime-tools-boundary.mjs';

// A-boundary-guard-2-r4-replan, D102: CA-4 R3-F1/R3-F2 acceptance.
// Fixture code is scanned as text; its process/filesystem calls never execute.
const architecture = 'tools/architecture';
const app = 'apps/service';
const owners = ['apps/runtime', 'packages/domain', 'tools/worker', architecture];
const tick = String.fromCharCode(96);
const template = (path) => tick + '${root}/' + path + tick;
const imports = [
  "import * as fs from 'node:fs';",
  "import { spawnSync, spawnSync as launch } from 'node:child_process';",
  'const root = process.cwd();',
  'const requestedMode = process.env.OPEN_MODE;'
].join('\n') + '\n';

async function put(root, path, value) {
  const file = resolve(root, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rus-scanner-default-deny space #'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const owner of [...owners, app]) {
    await put(root, owner + '/package.json', {
      name: '@default-deny/' + owner.split('/').at(-1), type: 'module'
    });
    await put(root, owner + '/src/index.mjs', 'export const value = true;\n');
  }
  await put(root, 'tools/worker/run.py', 'print("fixture")\n');
  return root;
}

async function permit(root, owner) {
  await put(root, owner + '/MODULE.md', '# Fixture owner\n\n'
    + tick.repeat(3) + 'architecture-tool-app-dependencies\n'
    + JSON.stringify([{
      source: 'src/probe.mjs', target: app,
      reason: 'Evaluate the production app implementation.'
    }]) + '\n' + tick.repeat(3) + '\n');
}

async function expectBoundary(root, file, denied) {
  const findings = await findRuntimeToolsBoundaryViolations({ root });
  if (!denied) {
    assert.deepEqual(findings, [], 'Allowed reference reported: ' + JSON.stringify(findings));
    return;
  }
  assert.ok(findings.some((finding) => finding.startsWith(file + ':')),
    'Expected boundary finding for ' + file + '; got ' + JSON.stringify(findings));
  assert.ok(findings.every((finding) => finding.startsWith(file + ':')),
    'Fixture has unrelated findings: ' + JSON.stringify(findings));
}

const referenceForms = [
  ['argv-template', (root, path) =>
    'const argv = [' + template(path) + "];\nspawnSync('python3', argv);"],
  ['argv-literal', (root, path) =>
    'const argv = [' + JSON.stringify(resolve(root, path)) + "];\nspawnSync('python3', argv);"],
  ['alias-inline-template', (root, path) =>
    "launch('node', [" + template(path) + ']);'],
  ['object-argv-template', (root, path) =>
    'const command = { argv: [' + template(path) + "] };\nspawnSync('python3', command.argv);"],
  ['direct-process-control', (root, path) =>
    "spawnSync('python3', [" + template(path) + ']);']
];

for (const owner of owners) {
  const isTool = owner.startsWith('tools/');
  for (const [form, source] of referenceForms) {
    for (const mode of isTool ? ['deny', 'exact-MODULE', 'own-owner'] : ['deny', 'own-owner']) {
      test(['R3-F1', owner, form, mode].join(' '), async (t) => {
        const root = await fixture(t);
        const file = owner + '/src/probe.mjs';
        const path = mode === 'own-owner' ? owner + '/src/index.mjs'
          : isTool ? app + '/src/index.mjs' : 'tools/worker/run.py';
        await put(root, file, imports + source(root, path));
        if (mode === 'exact-MODULE') await permit(root, owner);
        await expectBoundary(root, file, mode === 'deny');
      });
    }
  }
}

const openModes = [
  { name: 'literal-r', expression: "'r'", readOnly: true },
  { name: 'literal-r-plus', expression: "'r+'", readOnly: false },
  { name: 'concatenated-mode', expression: "'r' + '+'", readOnly: false },
  { name: 'conditional-mode', expression: "'r' === requestedMode ? 'r' : 'w'", readOnly: false },
  { name: 'variable-mode', setup: "const flags = 'r';\n", expression: 'flags', readOnly: false }
];

for (const operation of ['open', 'openSync']) {
  for (const flags of openModes) {
    for (const mode of ['none', 'exact-MODULE', 'own-owner']) {
      test(['R3-F2', architecture, operation, flags.name, mode].join(' '), async (t) => {
        const root = await fixture(t);
        const file = architecture + '/src/probe.mjs';
        const path = (mode === 'own-owner' ? architecture : app) + '/src/index.mjs';
        const callback = operation === 'open' ? ', () => {}' : '';
        await put(root, file, imports + (flags.setup ?? '')
          + 'fs.' + operation + '(' + JSON.stringify(resolve(root, path)) + ', '
          + flags.expression + callback + ');');
        if (mode === 'exact-MODULE') await permit(root, architecture);
        await expectBoundary(root, file, mode === 'none' && !flags.readOnly);
      });
    }
  }
}

for (const operation of ['readFile', 'readFileSync']) {
  test('CONTROL architecture ' + operation + ' without mode may read app source', async (t) => {
    const root = await fixture(t);
    const file = architecture + '/src/probe.mjs';
    const callback = operation === 'readFile' ? ', () => {}' : '';
    await put(root, file, imports + 'fs.' + operation + '(' + template(app + '/src/index.mjs')
      + callback + ');');
    await expectBoundary(root, file, false);
  });
}
