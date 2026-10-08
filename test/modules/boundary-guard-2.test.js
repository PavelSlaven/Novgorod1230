import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { findRuntimeToolsBoundaryViolations } from '../../tools/architecture/runtime-tools-boundary.mjs';
import { createBgeRerankerScorePairs, loadRerankerProfile, rerankerProductionEnabled,
  wireRerankerIfEnabled } from '../../apps/game-server/src/runtime/world-knowledge-reranker.js';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const app = 'apps/service';
const appName = '@acceptance/boundary-service';
const tool = 'tools/unlisted-probe';
const runtimeFile = 'apps/service/src/probe.mjs';
const toolFile = `${tool}/src/probe.mjs`;

async function put(root, path, value) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, typeof value === 'string' ? value : JSON.stringify(value));
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rus-boundary-2 space #'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, name] of [
    [app, appName], ['apps/neighbor', '@acceptance/neighbor'],
    ['packages/domain', '@acceptance/domain'], [tool, '@acceptance/unlisted-probe']
  ]) {
    await put(root, `${path}/package.json`, { name, type: 'module', exports: './src/index.js' });
    await put(root, `${path}/src/index.js`, 'export const value = 1;\n');
  }
  await put(root, `${tool}/src/worker.py`, 'print("fixture")\n');
  return root;
}

// Proposed MODULE declaration contract, to be frozen by the reviewer under D102.
// source is an exact owner-relative file, or '*' for the entire owner.
// target is an exact repository-relative app root. Temporary entries require #N.
async function declare(root, entries, owner = tool) {
  await put(root, `${owner}/MODULE.md`, '# Fixture owner\n\n## App dependencies\n\n'
    + '```architecture-tool-app-dependencies\n' + JSON.stringify(entries, null, 2) + '\n```\n');
}

function permission(overrides = {}) {
  return { source: 'src/probe.mjs', target: app,
    reason: 'Evaluate the production role using its production implementation.', ...overrides };
}

async function expectsEdge(root, sourceFile) {
  const violations = await findRuntimeToolsBoundaryViolations({ root });
  assert.ok(violations.some((entry) => entry.includes(sourceFile)),
    `Expected boundary finding for ${sourceFile}; got ${JSON.stringify(violations)}`);
  return violations;
}

for (const [label, source] of [
  ['new URL', "const worker = new URL('../../../tools/unlisted-probe/src/worker.py', import.meta.url);"],
  ['join segments', "const worker = join(root, 'tools', 'unlisted-probe', 'src', 'worker.py');"],
  ['resolve segments', "const worker = resolve(root, 'tools', 'unlisted-probe', 'src', 'worker.py');"],
  ['file URL from resolve', "const worker = pathToFileURL(resolve(root, 'tools', 'unlisted-probe', 'src', 'worker.py'));"],
  ['joined relative path', "const worker = join(dirname(fileURLToPath(import.meta.url)), '../../../tools/unlisted-probe/src/worker.py');"],
  ['static template', 'const worker = new URL(`../../../tools/unlisted-probe/src/worker.py`, import.meta.url);'],
  ['template path from root', 'const worker = `${root}/tools/unlisted-probe/src/worker.py`;']
]) {
  for (const sourceRoot of ['apps/service', 'packages/domain']) {
    test(`runtime ${sourceRoot} process path: ${label}`, async (t) => {
      const root = await fixture(t);
      const file = `${sourceRoot}/src/probe.mjs`;
      await put(root, file, source);
      await expectsEdge(root, file);
    });
  }
}

test('runtime recognizes an absolute file URL containing space and #', async (t) => {
  const root = await fixture(t);
  const url = pathToFileURL(resolve(root, `${tool}/src/worker.py`)).href;
  await put(root, runtimeFile, `const worker = new URL(${JSON.stringify(url)});`);
  await expectsEdge(root, runtimeFile);
});

test('runtime process path resolves symlinks into tools', async (t) => {
  const root = await fixture(t);
  await symlink(join(root, `${tool}/src/worker.py`), join(root, `${app}/src/worker.py`));
  await put(root, runtimeFile, "const worker = new URL('./worker.py', import.meta.url);");
  await expectsEdge(root, runtimeFile);
});

test('runtime ignores inert text, regex and a non-tools path', async (t) => {
  const root = await fixture(t);
  await put(root, runtimeFile, String.raw`
    // new URL('../../../tools/unlisted-probe/src/worker.py', import.meta.url)
    /* join(root, 'tools', 'unlisted-probe', 'src', 'worker.py') */
    const description = 'Documentation mentions tools/unlisted-probe/src/worker.py';
    const label = 'tools';
    const pattern = /tools\/unlisted-probe\/src\/worker\.py/;
    const data = join(root, 'data', 'toolshed', 'values.json');
  `);
  assert.deepEqual(await findRuntimeToolsBoundaryViolations({ root }), []);
});

for (const [label, source] of [
  ['static import', "import { value } from '../../../apps/service/src/index.js';"],
  ['dynamic package import', `const module = import('${appName}');`],
  ['re-export', "export { value } from '../../../apps/service/src/index.js';"],
  ['require subpath', `const module = require('${appName}/production');`],
  ['process path', "const server = new URL('../../../apps/service/src/index.js', import.meta.url);"],
  ['join process path', "const server = join(root, 'apps', 'service', 'src', 'index.js');"]
]) {
  test(`undeclared tools → apps ${label} is denied`, async (t) => {
    const root = await fixture(t);
    await put(root, toolFile, source);
    await expectsEdge(root, toolFile);
  });
}

test('tools root-level launcher files are scanned', async (t) => {
  const root = await fixture(t);
  const file = `${tool}/launch.cjs`;
  await put(root, file, `require('${appName}');`);
  await expectsEdge(root, file);
});

for (const field of ['dependencies', 'optionalDependencies']) {
  test(`tools manifest ${field} to app needs declaration`, async (t) => {
    const root = await fixture(t);
    await put(root, `${tool}/package.json`, {
      name: '@acceptance/unlisted-probe', [field]: { [appName]: '1.0.0' }
    });
    await expectsEdge(root, `${tool}/package.json`);
  });
}

test('tools source symlink into an app is an edge', async (t) => {
  const root = await fixture(t);
  await symlink(join(root, `${app}/src/index.js`), join(root, toolFile));
  await expectsEdge(root, toolFile);
});

test('MODULE permission with reason allows exactly its source and app', async (t) => {
  const root = await fixture(t);
  await put(root, toolFile, `import '${appName}';`);
  await declare(root, [permission()]);
  assert.deepEqual(await findRuntimeToolsBoundaryViolations({ root }), []);
  await put(root, `${tool}/src/unlisted.mjs`, `import '${appName}';`);
  await put(root, toolFile, "import '../../../apps/neighbor/src/index.js';");
  await expectsEdge(root, `${tool}/src/unlisted.mjs`);
  await expectsEdge(root, toolFile);
});

test('owner-wide permission is taken from MODULE, not a guard name list', async (t) => {
  const root = await fixture(t);
  const file = `${tool}/launch.mjs`;
  await put(root, file, `import '${appName}';`);
  await declare(root, [permission({ source: '*' })]);
  assert.deepEqual(await findRuntimeToolsBoundaryViolations({ root }), []);
  await put(root, 'tools/another-owner/package.json', { name: '@acceptance/another-owner' });
  await put(root, 'tools/another-owner/src/index.mjs', `import '${appName}';`);
  await expectsEdge(root, 'tools/another-owner/src/index.mjs');
});

for (const entry of [permission({ reason: '' }), permission({ reason: '   ' }),
  permission({ temporary: true }), permission({ temporary: true, issue: 'later' }),
  permission({ temporary: true, issue: '#0' })]) {
  test(`invalid MODULE permission fails closed: ${JSON.stringify(entry)}`, async (t) => {
    const root = await fixture(t);
    await put(root, toolFile, `import '${appName}';`);
    await declare(root, [entry]);
    const violations = await findRuntimeToolsBoundaryViolations({ root });
    assert.ok(violations.some((finding) => finding.includes(`${tool}/MODULE.md`)),
      `Invalid declaration must report its MODULE: ${JSON.stringify(violations)}`);
  });
}

test('temporary MODULE dependency with reason and #488 is allowed', async (t) => {
  const root = await fixture(t);
  await put(root, toolFile, `import '${appName}';`);
  await declare(root, [permission({ temporary: true, issue: '#488' })]);
  assert.deepEqual(await findRuntimeToolsBoundaryViolations({ root }), []);
});

test('a tools permission never allows runtime → tools', async (t) => {
  const root = await fixture(t);
  await declare(root, [permission({ source: '*' })]);
  await put(root, runtimeFile, "import '../../../tools/unlisted-probe/src/index.js';");
  await expectsEdge(root, runtimeFile);
});

test('test-only app use, devDependencies and ordinary package imports stay allowed', async (t) => {
  const root = await fixture(t);
  await put(root, `${tool}/test/app.test.js`, `import '${appName}';`);
  await put(root, `${tool}/src/example.spec.mjs`, `import '${appName}';`);
  await put(root, `${tool}/package.json`, {
    name: '@acceptance/unlisted-probe', devDependencies: { [appName]: '1.0.0' }
  });
  await put(root, toolFile, "import '@acceptance/domain';");
  assert.deepEqual(await findRuntimeToolsBoundaryViolations({ root }), []);
});

test('real repository has no undeclared tools/process owner edges', async () => {
  assert.deepEqual(await findRuntimeToolsBoundaryViolations({ root: repository }), []);
});

test('actual architecture:check reports both kinds of injected edge', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'rus-architecture space #'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const entry of await readdir(repository, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (['apps', 'packages', 'tools'].includes(entry.name)) {
      await mkdir(join(root, entry.name));
      for (const child of await readdir(join(repository, entry.name))) {
        if (entry.name === 'tools' && child === 'architecture') {
          await cp(join(repository, entry.name, child), join(root, entry.name, child), { recursive: true });
        } else {
          await symlink(join(repository, entry.name, child), join(root, entry.name, child));
        }
      }
    } else {
      await symlink(join(repository, entry.name), join(root, entry.name));
    }
  }
  const runtime = 'packages/boundary-acceptance/src/probe.mjs';
  const caller = 'tools/boundary-acceptance/launch.mjs';
  await put(root, 'packages/boundary-acceptance/package.json', { name: '@acceptance/runtime' });
  await put(root, 'packages/boundary-acceptance/MODULE.md',
    '# Acceptance runtime\n\n## Назначение\n\nProcess-path architecture fixture.\n');
  await put(root, runtime, "const worker = new URL('../../../tools/boundary-acceptance/worker.py', import.meta.url);");
  await put(root, 'tools/boundary-acceptance/package.json', { name: '@acceptance/tool' });
  await put(root, 'tools/boundary-acceptance/MODULE.md',
    '# Acceptance tool\n\n## Назначение\n\nUndeclared app dependency fixture.\n');
  await put(root, caller, "import '../../apps/game-server/src/index.js';");
  await put(root, 'tools/boundary-acceptance/worker.py', '# fixture\n');
  const messages = [];
  const previous = { error: console.error, log: console.log, exitCode: process.exitCode };
  let exitCode;
  try {
    console.error = console.log = (...args) => messages.push(args.join(' '));
    process.exitCode = undefined;
    await import(pathToFileURL(resolve(root, 'tools/architecture/check-boundaries.mjs')).href);
    exitCode = process.exitCode ?? 0;
  } finally {
    console.error = previous.error;
    console.log = previous.log;
    process.exitCode = previous.exitCode;
  }
  const diagnostics = messages.join('\n');
  assert.equal(exitCode, 1, diagnostics);
  assert.ok(diagnostics.includes(runtime), diagnostics);
  assert.ok(diagnostics.includes(caller), diagnostics);
});

test('BGE default argv points to the single unchanged game-server worker; production stays OFF', async () => {
  const worker = resolve(repository, 'apps/game-server/src/infrastructure/embedding/bge-reranker-worker.py');
  let captured;
  const scorePairs = createBgeRerankerScorePairs({ rootDir: repository, modelPath: 'fixture-model',
    spawnSyncImpl(command, args) {
      captured = { command, args };
      writeFileSync(args[args.indexOf('--output') + 1], JSON.stringify({ scores: [] }));
      return { status: 0, stdout: '', stderr: '' };
    }
  });
  assert.deepEqual(await scorePairs({ queryText: 'fixture', candidates: [] }), new Map());
  assert.equal(captured.args[1], worker, 'DEFAULT_WORKER must resolve relative to import.meta.url inside game-server');
  const bytes = await readFile(worker);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    'e3d6892e9b994db8e8311f25889db747bb83852c427c107847d3cdbd18660002', 'mechanical worker move preserves all bytes');
  await assert.rejects(readFile(join(repository, 'tools/world-catalog-workflow/src/bge-reranker.py')), { code: 'ENOENT' });
  const profile = await loadRerankerProfile({ rootDir: repository });
  assert.equal(profile.production_enabled, false);
  assert.equal(rerankerProductionEnabled(profile), false);
  assert.equal(wireRerankerIfEnabled({ profile, scorePairs }), null);
});

test('all four tooling/script callers consume the active-pin package subpath', async () => {
  for (const file of ['tools/runtime-catalog-activation/src/procedural-final-disposable-bootstrap.js',
    'tools/local-play/local-play.js', 'tools/local-play/production-setup.js',
    'scripts/run-procedural-final-candidate-disposable-import.mjs']) {
    const source = await readFile(join(repository, file), 'utf8');
    assert.match(source, /from\s*['"]@rus\/runtime-catalog\/active-pin['"]/u, file);
    assert.ok(!source.includes('runtime-catalog-pin-loader.js'), `${file}: old private app import remains`);
  }
});
