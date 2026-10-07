import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { findRuntimeToolsBoundaryViolations } from '../../tools/architecture/runtime-tools-boundary.mjs';

// REVIEW-boundary-guard-2-r5 / D102: R4-F1, proof of read-only fs options.
// Fixture calls are source text for the guard; no fs call in a payload executes.
const architecture = 'tools/architecture';
const otherTool = 'tools/authoring';
const app = 'apps/service';
const runtime = 'apps/runtime';
const domain = 'packages/domain';
const worker = 'tools/worker';
const owners = [architecture, otherTool, app, runtime, domain, worker];
const prelude = [
  "import { readFile, open } from 'node:fs/promises';",
  "import { readFileSync, createReadStream, openSync } from 'node:fs';",
  "import * as fs from 'node:fs';",
  "const opts = { flag: 'r' };",
  "const requestedMode = 'r';"
].join('\n') + '\n';

async function put(root, path, content) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, typeof content === 'string' ? content : JSON.stringify(content));
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rus-scanner-read-options space #'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const owner of owners) {
    await put(root, owner + '/package.json', {
      name: '@read-options/' + owner.split('/').at(-1), type: 'module'
    });
    await put(root, owner + '/src/index.mjs', 'export const value = true;\n');
  }
  return root;
}

async function permit(root, owner) {
  await put(root, owner + '/MODULE.md', '# Fixture owner\n\n'
    + '```architecture-tool-app-dependencies\n'
    + JSON.stringify([{
      source: 'src/probe.mjs', target: app,
      reason: 'Check the production app source.'
    }]) + '\n```\n');
}

async function checkReference(t, { owner, target, declaration = false, denied }, operation, option) {
  return checkSource(t, { owner, target, declaration, denied }, ({ root, target }) => {
    const path = JSON.stringify(resolve(root, target + '/src/index.mjs'));
    const args = option.expression === undefined ? path : path + ', ' + option.expression;
    return operation.call + '(' + args + ');\n';
  });
}

async function checkSource(t, { owner, target, declaration = false, denied }, source) {
  const root = await fixture(t);
  const file = owner + '/src/probe.mjs';
  await put(root, file, prelude + await source({ root, file, owner, target }));
  if (declaration) await permit(root, owner);
  const findings = await findRuntimeToolsBoundaryViolations({ root });
  if (!denied) {
    assert.deepEqual(findings, [], 'Unexpected finding: ' + JSON.stringify(findings));
    return;
  }
  assert.ok(findings.some((finding) => finding.startsWith(file + ':')),
    'Expected boundary finding for ' + file + '; got ' + JSON.stringify(findings));
  assert.ok(findings.every((finding) => finding.startsWith(file + ':')),
    'Unrelated fixture findings: ' + JSON.stringify(findings));
}

// A-boundary-guard-2-r5b / D102: executable template expressions are code.
const interpolationContexts = [
  { name: 'runtime-to-tools', owner: runtime, target: worker, denied: true },
  { name: 'package-to-tools', owner: domain, target: worker, denied: true },
  { name: 'architecture-to-app', owner: architecture, target: app },
  { name: 'architecture-exact-MODULE', owner: architecture, target: app, declaration: true, denied: false },
  { name: 'other-tool-to-app', owner: otherTool, target: app, denied: true },
  { name: 'other-tool-exact-MODULE', owner: otherTool, target: app, declaration: true, denied: false },
  { name: 'own-owner', owner: runtime, target: runtime, denied: false }
];
for (const operation of ['import', 'readFile']) {
  for (const context of interpolationContexts) {
    test('R5b P2.1 interpolation ' + operation + ' ' + context.name, async (t) => {
      const denied = context.denied ?? operation === 'import';
      await checkSource(t, { ...context, denied }, ({ root, file, target }) => {
        let path = operation === 'import'
          ? relative(dirname(resolve(root, file)), resolve(root, target + '/src/index.mjs'))
          : target + '/src/index.mjs';
        if (operation === 'import' && !path.startsWith('.')) path = './' + path;
        const expression = '(await ' + operation + '(' + JSON.stringify(path) + '))';
        return 'export const value = `result: ${' + expression + '}`;\n';
      });
    });
  }
}

// Fs/process paths have no statically guaranteed working directory. Either
// importer-relative or repository-relative interpretation can expose an edge.
for (const operation of ['readFile', 'writeFileSync', 'spawnSync']) {
  for (const context of interpolationContexts) {
    test('R5b P2.3 dot-relative ' + operation + ' ' + context.name, async (t) => {
      const denied = context.denied ?? operation !== 'readFile';
      await checkSource(t, { ...context, denied }, ({ root, target }) => {
        const path = JSON.stringify('./' + target + '/src/index.mjs');
        if (operation === 'spawnSync') {
          return "import { spawnSync } from 'node:child_process';\n"
            + 'const root = ' + JSON.stringify(root) + ';\n'
            + "spawnSync('node', [" + path + '], { cwd: root });\n';
        }
        return operation === 'readFile'
          ? 'readFile(' + path + ");\n"
          : 'fs.writeFileSync(' + path + ", 'fixture');\n";
      });
    });
  }
}

// Import specifiers keep exact importer-relative resolution. The ./tools or
// ./apps subtree here is inside the source owner, not the repository target.
for (const owner of [runtime, domain, architecture, otherTool]) {
  const target = owner.startsWith('tools/') ? app : worker;
  for (const nested of [false, true]) {
    test('CONTROL R5b precise-import ' + owner + ' nested=' + nested, async (t) => {
      await checkSource(t, { owner, target, denied: false }, async ({ root, owner, target }) => {
        await put(root, owner + '/src/' + target + '/src/index.mjs', 'export const value = true;\n');
        const expression = 'import(' + JSON.stringify('./' + target + '/src/index.mjs') + ')';
        return nested ? 'export const value = `result: ${' + expression + '}`;\n'
          : expression + ';\n';
      });
    });
  }
}

const options = [
  { name: 'options-absent', readOnly: true },
  { name: 'empty-options', expression: '{}', readOnly: true },
  { name: 'flag-write', expression: "{ flag: 'w' }", readOnly: false },
  { name: 'flags-write', expression: "{ flags: 'w' }", readOnly: false },
  { name: 'flag-read', expression: "{ flag: 'r' }", readOnly: true },
  { name: 'flags-read', expression: "{ flags: 'r' }", readOnly: true },
  { name: 'flag-read-write', expression: "{ flag: 'r+' }", readOnly: false },
  { name: 'encoding-object', expression: "{ encoding: 'utf8' }", readOnly: true },
  { name: 'encoding-string', expression: "'utf8'", readOnly: true },
  { name: 'options-variable', expression: 'opts', readOnly: false },
  { name: 'options-spread', expression: '{ ...opts }', readOnly: false },
  { name: 'flag-variable', expression: '{ flag: requestedMode }', readOnly: false }
];

const operations = [
  { name: 'readFile', call: 'readFile', position: 'options' },
  { name: 'readFileSync', call: 'readFileSync', position: 'options' },
  { name: 'createReadStream', call: 'createReadStream', position: 'options' },
  { name: 'fs.promises.readFile', call: 'fs.promises.readFile', position: 'options' },
  { name: 'open', call: 'open', position: 'flags' },
  { name: 'openSync', call: 'openSync', position: 'flags' }
];

function variants(operation) {
  if (operation.position === 'options') return options;
  // open/openSync take positional flags, not a readFile-style options object.
  // Objects and 'utf8' in this position do not prove literal 'r'.
  return [
    ...options.filter((option) => option.expression !== undefined)
      .map((option) => ({ ...option, readOnly: false })),
    { name: 'positional-mode-absent', readOnly: true },
    { name: 'positional-read', expression: "'r'", readOnly: true },
    { name: 'positional-read-permissions', expression: "'r', 0o600", readOnly: true },
    { name: 'positional-write', expression: "'w'", readOnly: false },
    { name: 'positional-read-write', expression: "'r+'", readOnly: false }
  ];
}

for (const operation of operations) {
  for (const option of variants(operation)) {
    const contexts = [
      { name: 'runtime-to-tools', owner: runtime, target: worker, denied: true },
      { name: 'architecture-to-app', owner: architecture, target: app, denied: !option.readOnly },
      { name: 'architecture-exact-MODULE', owner: architecture, target: app, declaration: true, denied: false },
      { name: 'other-tool-to-app', owner: otherTool, target: app, denied: true },
      { name: 'other-tool-exact-MODULE', owner: otherTool, target: app, declaration: true, denied: false }
    ];
    for (const context of contexts) {
      test(['R4-F1', operation.name, option.name, context.name].join(' '), async (t) => {
        await checkReference(t, context, operation, option);
      });
    }
  }

  const writeOption = operation.position === 'flags'
    ? { expression: "'w'" } : { expression: "{ flag: 'w' }" };
  for (const owner of [runtime, domain, architecture, otherTool]) {
    test('CONTROL own-owner ' + owner + ' ' + operation.name, async (t) => {
      await checkReference(t, { owner, target: owner, denied: false }, operation, writeOption);
    });
  }
  test('CONTROL package-to-tools ' + operation.name, async (t) => {
    const readOption = operation.position === 'flags'
      ? { expression: "'r'" } : { expression: "{ flag: 'r' }" };
    await checkReference(t, { owner: domain, target: worker, denied: true }, operation, readOption);
  });
}
