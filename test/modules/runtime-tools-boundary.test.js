import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const scannerPath = new URL('../../tools/architecture/runtime-tools-boundary.mjs', import.meta.url);
const toolName = '@acceptance/unlisted-authoring-cli';
const runtimeFile = 'packages/workflow/src/main.js';

async function put(root, path, value) {
  const target = join(root, path);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, typeof value === 'string' ? value : JSON.stringify(value));
}

async function fixture(t, source = '') {
  const root = await mkdtemp(join(tmpdir(), 'rus-runtime-tools-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await put(root, 'package.json', { type: 'module', workspaces: ['apps/*', 'packages/*', 'tools/*'] });
  for (const [path, name] of [
    ['apps/service', '@acceptance/service'],
    ['packages/workflow', '@acceptance/workflow'],
    ['packages/domain', '@acceptance/domain'],
    ['tools/authoring', toolName]
  ]) {
    await put(root, `${path}/package.json`, { name, type: 'module', exports: './src/index.js' });
    await put(root, `${path}/src/index.js`, 'export const value = 1;\n');
  }
  await put(root, runtimeFile, source);
  return root;
}

async function findings(root) {
  const scanner = await import(scannerPath);
  assert.equal(typeof scanner.findRuntimeToolsBoundaryViolations, 'function',
    'the shared guard must expose findRuntimeToolsBoundaryViolations({ root })');
  const violations = await scanner.findRuntimeToolsBoundaryViolations({ root });
  assert.ok(Array.isArray(violations));
  return violations;
}

for (const [name, source] of [
  ['static import', `import { value } from '${toolName}';`],
  ['re-export subpath', `export { value } from '${toolName}/projection';`],
  ['dynamic import', `const loaded = import('${toolName}/projection');`],
  ['side-effect import', `import '${toolName}';`],
  ['literal require', `const loaded = require('${toolName}');`],
  ['relative tools path', "import { value } from '../../../tools/authoring/src/index.js';"]
]) {
  test(`runtime guard detects ${name} for an unlisted tool`, async (t) => {
    const root = await fixture(t, source);
    const result = await findings(root);
    assert.equal(result.length, 1, JSON.stringify(result));
    assert.ok(JSON.stringify(result).includes(runtimeFile));
    assert.match(JSON.stringify(result), /tools|authoring/u);
  });
}

test('apps runtime and .mjs/.cjs files obey the same direction', async (t) => {
  const root = await fixture(t);
  for (const path of ['apps/service/src/main.mjs', 'packages/workflow/src/main.cjs']) {
    await put(root, path, `const loaded = require('${toolName}/projection');`);
  }
  const result = await findings(root);
  assert.equal(result.length, 2, JSON.stringify(result));
  for (const path of ['apps/service/src/main.mjs', 'packages/workflow/src/main.cjs']) {
    assert.ok(JSON.stringify(result).includes(path));
  }
});

for (const field of ['dependencies', 'optionalDependencies']) {
  test(`runtime manifest ${field} cannot depend on tools without a source import`, async (t) => {
    const root = await fixture(t);
    await put(root, 'packages/workflow/package.json', {
      name: '@acceptance/workflow', [field]: { [toolName]: '1.0.0' }
    });
    const result = await findings(root);
    assert.equal(result.length, 1, JSON.stringify(result));
    assert.ok(JSON.stringify(result).includes('packages/workflow/package.json'));
    assert.ok(JSON.stringify(result).includes(toolName));
  });
}

test('package imports, test-only tools usage, devDependencies and inert text are permitted', async (t) => {
  const root = await fixture(t, `
    import { value } from '@acceptance/domain';
    // import '${toolName}';
    /* export { value } from '${toolName}/projection'; */
    const description = "import '${toolName}';";
  `);
  await put(root, 'packages/workflow/package.json', {
    name: '@acceptance/workflow', dependencies: { '@acceptance/domain': '1.0.0' },
    devDependencies: { [toolName]: '1.0.0' }
  });
  await put(root, 'packages/workflow/test/tool.test.js', `import '${toolName}';`);
  await put(root, 'packages/workflow/src/example.test.js', `import '${toolName}';`);
  await put(root, 'tools/authoring/src/cli.js', "import { value } from '@acceptance/domain';");
  assert.deepEqual(await findings(root), []);
});

test('the real repository has no production source or manifest dependency on tools', async () => {
  assert.deepEqual(await findings(repository), []);
});

test('the actual architecture:check entrypoint reports an injected runtime-to-tools edge', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'rus-architecture-tools-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  // Copy only the checker directory: import.meta.url must resolve to this fixture root.
  // Other owners stay read-only links; the injected workspaces are real directories.
  for (const entry of await readdir(repository, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (['apps', 'packages', 'tools'].includes(entry.name)) {
      await mkdir(join(root, entry.name));
      for (const child of await readdir(join(repository, entry.name))) {
        const from = join(repository, entry.name, child);
        const to = join(root, entry.name, child);
        if (entry.name === 'tools' && child === 'architecture') {
          await cp(from, to, { recursive: true });
        } else {
          await symlink(from, to);
        }
      }
    } else {
      await symlink(join(repository, entry.name), join(root, entry.name));
    }
  }
  const injected = 'packages/acceptance-runtime/src/index.js';
  await put(root, 'packages/acceptance-runtime/package.json', {
    name: '@acceptance/runtime', type: 'module', exports: './src/index.js'
  });
  await put(root, 'packages/acceptance-runtime/MODULE.md',
    '# Acceptance runtime\n\n## Назначение\n\nArchitecture guard fixture.\n');
  await put(root, injected, `import { value } from '${toolName}';\nexport { value };\n`);
  await put(root, 'tools/acceptance-authoring/package.json', {
    name: toolName, type: 'module', exports: './src/index.js'
  });
  await put(root, 'tools/acceptance-authoring/src/index.js', 'export const value = 1;\n');
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts['architecture:check'], 'node tools/architecture/check-boundaries.mjs');

  const messages = [];
  const originalError = console.error;
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  let exitCode;
  try {
    // Execute the real command module in-process; capture only its diagnostics/status.
    console.error = (...args) => messages.push(args.join(' '));
    console.log = (...args) => messages.push(args.join(' '));
    process.exitCode = undefined;
    await import(pathToFileURL(join(root, 'tools/architecture/check-boundaries.mjs')));
    exitCode = process.exitCode ?? 0;
  } finally {
    console.error = originalError;
    console.log = originalLog;
    process.exitCode = originalExitCode;
  }
  const diagnostic = messages.join('\n');
  assert.equal(exitCode, 1, diagnostic);
  assert.ok(diagnostic.includes(injected), `missing injected runtime finding:\n${diagnostic}`);
  assert.ok(diagnostic.includes(toolName), diagnostic);
});
