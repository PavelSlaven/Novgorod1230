import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import childProcess from 'node:child_process';
import fsPromises from 'node:fs/promises';
import test from 'node:test';

const requiredDataTests = [
  'data/world-catalogs/novgorod/m2c-line-names/check.test.mjs',
  'data/world-catalogs/novgorod/m2c-local-edge-labels/candidate.test.mjs',
  'data/world-catalogs/novgorod/m2c-place-coordinates/derive.test.mjs',
  'data/world-catalogs/novgorod/m2c-place-labels/approved-labels.test.mjs',
  'data/world-catalogs/novgorod/m2c-place-labels/candidate.test.mjs',
  'data/world-catalogs/novgorod/m2c-scene-movement-edges/candidate.test.mjs',
];
const virtualDirectoryName = 'm2c-issue-535-virtual';
const virtualDataTest =
  `data/world-catalogs/novgorod/${virtualDirectoryName}/virtual.test.mjs`;

test('issue #535 runner discovers data m2c tests and retains explicit exclusions', async (t) => {
  const sourceRoot = resolve(process.env.ISSUE535_SOURCE_ROOT ?? process.cwd());
  const runnerSource = resolve(process.env.ISSUE535_RUNNER_SOURCE
    ?? resolve(sourceRoot, 'scripts/run-spatial-ci-tests.mjs'));
  const runnerRoot = resolve(dirname(runnerSource), '..');
  const runnerUrl = pathToFileURL(runnerSource);
  runnerUrl.searchParams.set('issue535', `${process.pid}-${Date.now()}`);
  const dataRoot = resolve(runnerRoot, 'data/world-catalogs/novgorod');
  const virtualDirectory = resolve(dataRoot, virtualDirectoryName);
  const originalReaddir = fsPromises.readdir;
  const originalExitCode = process.exitCode;
  const calls = [];

  t.mock.method(childProcess, 'spawnSync', (...args) => {
    calls.push(args);
    return { status: 0 };
  });
  t.mock.method(fsPromises, 'readdir', async (path, options) => {
    const absolutePath = resolve(path.toString());
    if (absolutePath === virtualDirectory) return ['virtual.test.mjs'];
    const entries = await originalReaddir(path, options);
    if (absolutePath === dataRoot && options?.withFileTypes === true) {
      return [...entries, { name: virtualDirectoryName, isDirectory: () => true }];
    }
    return entries;
  });
  syncBuiltinESMExports();
  try {
    await import(runnerUrl.href);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    process.exitCode = originalExitCode;
  }

  assert.equal(calls.length, 1, 'runner launches exactly one child test process');
  const [nodePath, childArgs, options] = calls[0];
  assert.equal(nodePath, process.execPath);
  assert.deepEqual(childArgs.slice(0, 2), ['--test', '--test-concurrency=1']);
  assert.equal(options.cwd, runnerRoot);

  const selected = new Set(childArgs.slice(2));
  const missingDataTests = requiredDataTests.filter((path) => !selected.has(path));
  assert.deepEqual(missingDataTests, [],
    'runner must pass all six currently omitted data m2c tests to its child');
  assert.ok(selected.has(virtualDataTest),
    'runner must discover a new data m2c test without a hand-written path');
  assert.ok(selected.has('scripts/m2c-capacity-v2-start-successors.test.mjs'),
    'existing scripts m2c discovery remains active');

  const sourceManifest = await readFile(resolve(sourceRoot,
    'test/spatial-v3/ci-exclusions.json'), 'utf8');
  const runnerManifest = await readFile(resolve(runnerRoot,
    'test/spatial-v3/ci-exclusions.json'), 'utf8');
  assert.equal(runnerManifest, sourceManifest,
    'isolated mutant runner retains exact exclusion entries and reasons');
  const exclusions = JSON.parse(runnerManifest).exceptions;
  for (const exclusion of exclusions) {
    assert.ok(exclusion.reason.trim(), `missing reason for ${exclusion.path}`);
    assert.ok(exclusion.reference, `missing issue/LW reference for ${exclusion.path}`);
    assert.ok(!selected.has(exclusion.path),
      `explicitly excluded test must not be passed to child: ${exclusion.path}`);
  }
});
