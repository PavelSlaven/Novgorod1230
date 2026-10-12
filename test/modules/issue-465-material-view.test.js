import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import lib from '../../data/world-catalogs/novgorod/game-base-v1/transport-health-recreation/scripts/lib.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OWNER_ROOT = path.resolve(process.env.ISSUE_465_OWNER_ROOT || ROOT);
const GAME_BASE = path.join(OWNER_ROOT, 'data/world-catalogs/novgorod/game-base-v1');
const PRODUCER = path.join(GAME_BASE, 'scripts/build-master-material-view.py');
const JS_READER = path.join(GAME_BASE, 'scripts/material-view.cjs');
const PY_READER = path.join(GAME_BASE, 'scripts/material_view.py');
const FIXTURES = path.join(ROOT, 'test/fixtures/issue-465');
const RUNTIME_PARENT = process.env.FLEET_DIR
  ? path.join(process.env.FLEET_DIR, 'out/mutants/465')
  : path.join(FIXTURES, 'scratch');
const SOURCE_FIXTURE = path.join(FIXTURES, 'source-synthetic.csv');
const OVERLAY_22_FIXTURE = path.join(FIXTURES, 'overlay-22.csv');
const EXTRA_FIXTURES = [
  path.join(FIXTURES, 'extra-overlay-row.csv'),
  path.join(FIXTURES, 'extra-overlay-row-2.csv'),
];
const pythonReaderCode = [
  'import importlib.util,json,pathlib,sys',
  'p=pathlib.Path(sys.argv[1])',
  's=importlib.util.spec_from_file_location("material_view",p)',
  'm=importlib.util.module_from_spec(s)',
  's.loader.exec_module(m)',
  'm.VIEW_PATH=pathlib.Path(sys.argv[2])',
  'm.OVERLAY_PATH=pathlib.Path(sys.argv[3])',
  'm.load_material_overrides.cache_clear()',
  'r=m.load_material_overrides(str(pathlib.Path(sys.argv[4]).resolve()))',
  'print(json.dumps([r[key] for key in sorted(r)],separators=(",",":")))',
].join(';');
const pythonBuildCode = [
  'import importlib.util,pathlib,sys',
  'p=pathlib.Path(sys.argv[1])',
  's=importlib.util.spec_from_file_location("build_material_view",p)',
  'm=importlib.util.module_from_spec(s)',
  's.loader.exec_module(m)',
  'm.build_and_write(sys.argv[2],sys.argv[3],sys.argv[4],expected_source_sha=sys.argv[5])',
].join(';');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function runProducer(source, overlay, view, expectedSourceSha) {
  return spawnSync('python3', ['-B', '-c', pythonBuildCode, PRODUCER, source, overlay, view,
    expectedSourceSha], { encoding: 'utf8', timeout: 30_000 });
}

function runPythonReader(source, overlay, view) {
  return spawnSync('python3', ['-B', '-c', pythonReaderCode, PY_READER, view,
    overlay, source], { encoding: 'utf8', timeout: 30_000 });
}

function assertReaderParity(source, overlay, view, expectedRows) {
  const expectedIds = expectedRows.map(row => row.item_id).sort();
  const requireFromReader = createRequire(JS_READER);
  const { applyMaterialOverrides } = requireFromReader(JS_READER);
  const inputRows = expectedIds.map(item_id => ({ item_id, primary_material: 'source', materials: '[]' }));
  const jsRows = applyMaterialOverrides(inputRows, source,
    { viewPath: view, overlayPath: overlay });
  assert.deepEqual(jsRows.map(({ item_id, primary_material, materials }) =>
    ({ item_id, primary_material, materials })), expectedRows);

  const python = runPythonReader(source, overlay, view);
  assert.equal(python.error, undefined, `Python reader spawn failed: ${python.error?.message}`);
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), expectedRows);
  assert.deepEqual(expectedIds, expectedRows.map(row => row.item_id));
}

function expectedRowsFor(overlayPath, viewRows) {
  const expected = lib.loadCsvObjects(overlayPath, ',')
    .map(({ item_id, primary_material, materials }) => ({ item_id, primary_material, materials }))
    .sort((a, b) => a.item_id.localeCompare(b.item_id));
  const overlayIds = expected.map(({ item_id }) => item_id);
  assert.equal(new Set(overlayIds).size, overlayIds.length, 'overlay fixture IDs must be unique');
  assert.deepEqual(viewRows, expected, 'view values and IDs must match the overlay, independently of the producer');
  return expected;
}

function build(root, overlayBytes, label) {
  const source = path.join(root, 'source.csv');
  const overlay = path.join(root, `${label}.csv`);
  const view = path.join(root, `${label}-view.json`);
  fs.copyFileSync(SOURCE_FIXTURE, source);
  fs.writeFileSync(overlay, overlayBytes);
  const sourceSha = sha256(fs.readFileSync(source));
  return { source, overlay, view, sourceSha };
}

function assertBuildSucceeds(built, expectedCount, overlayBytes, label) {
  const result = runProducer(built.source, built.overlay, built.view, built.sourceSha);
  assert.equal(result.error, undefined, `${label}: producer spawn failed: ${result.error?.message}`);
  assert.equal(result.status, 0,
    `${label}: producer must accept ${expectedCount} valid rows; exit=${result.status}; ${result.stderr}`);

  const output = JSON.parse(fs.readFileSync(built.view, 'utf8'));
  assert.equal(output.rows.length, expectedCount);
  assert.equal(output.source_sha256, built.sourceSha);
  assert.equal(output.overlay_sha256, sha256(overlayBytes));
  const expectedRows = expectedRowsFor(built.overlay, output.rows);
  assertReaderParity(built.source, built.overlay, built.view, expectedRows);
  return output;
}

test('material view cardinality follows valid overlay rows through producer and both readers', async t => {
  fs.mkdirSync(RUNTIME_PARENT, { recursive: true });
  const runtimeRoot = fs.mkdtempSync(path.join(RUNTIME_PARENT, 'runtime-'));
  try {
    const base = fs.readFileSync(OVERLAY_22_FIXTURE);
    const extras = EXTRA_FIXTURES.map(filename => fs.readFileSync(filename));
    const scenarios = [
      { count: 23, overlayBytes: Buffer.concat([base, extras[0]]) },
      { count: 24, overlayBytes: Buffer.concat([base, ...extras]) },
    ];

    for (const scenario of scenarios) {
      await t.test(`${scenario.count} valid corrections`, () => {
        const built = build(runtimeRoot, scenario.overlayBytes, `overlay-${scenario.count}`);
        assertBuildSucceeds(built, scenario.count, scenario.overlayBytes, `${scenario.count}-row case`);
      });
    }
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('material view keeps source, overlay, before-value, duplicate and atomic-output guards', () => {
  fs.mkdirSync(RUNTIME_PARENT, { recursive: true });
  const runtimeRoot = fs.mkdtempSync(path.join(RUNTIME_PARENT, 'runtime-'));
  try {
    const base = fs.readFileSync(OVERLAY_22_FIXTURE);
    const built = build(runtimeRoot, base, 'valid-22');
    assertBuildSucceeds(built, 22, base, '22-row control');
    const outputBeforeFailures = fs.readFileSync(built.view);

    const staleSource = path.join(runtimeRoot, 'stale-source.csv');
    fs.writeFileSync(staleSource, Buffer.concat([fs.readFileSync(built.source), Buffer.from('\n')]));
    const staleSourceBuild = runProducer(staleSource, built.overlay, built.view, built.sourceSha);
    assert.notEqual(staleSourceBuild.status, 0);
    assert.match(staleSourceBuild.stderr, /source sha256 mismatch/u);
    assert.deepEqual(fs.readFileSync(built.view), outputBeforeFailures);
    const requireFromReader = createRequire(JS_READER);
    const { applyMaterialOverrides } = requireFromReader(JS_READER);
    assert.throws(() => applyMaterialOverrides([{ item_id: 'OMI00228' }], staleSource,
      { viewPath: built.view, overlayPath: built.overlay }),
    { code: 'MATERIAL_VIEW_SOURCE_STALE' });
    const stalePythonSource = runPythonReader(staleSource, built.overlay, built.view);
    assert.notEqual(stalePythonSource.status, 0);
    assert.match(stalePythonSource.stderr, /material view is stale/u);

    const staleOverlay = path.join(runtimeRoot, 'stale-overlay.csv');
    fs.writeFileSync(staleOverlay, Buffer.concat([base, Buffer.from('\n')]));
    assert.throws(() => applyMaterialOverrides([{ item_id: 'OMI00228' }], built.source,
      { viewPath: built.view, overlayPath: staleOverlay }),
    { code: 'MATERIAL_VIEW_OVERLAY_STALE' });
    const stalePythonOverlay = runPythonReader(built.source, staleOverlay, built.view);
    assert.notEqual(stalePythonOverlay.status, 0);
    assert.match(stalePythonOverlay.stderr, /material view is stale/u);

    const firstExtra = fs.readFileSync(EXTRA_FIXTURES[0], 'utf8');
    const twentyThree = Buffer.concat([base, Buffer.from(firstExtra)]);
    const wrongBefore = twentyThree.toString('utf8')
      .replace(/^OMI00001,wood,iron,/mu, 'OMI00001,not-wood,iron,');
    assert.notEqual(wrongBefore, twentyThree.toString('utf8'));
    fs.writeFileSync(built.overlay, wrongBefore);
    const beforeFailure = runProducer(built.source, built.overlay, built.view, built.sourceSha);
    assert.notEqual(beforeFailure.status, 0);
    assert.match(beforeFailure.stderr, /material correction guard failed for OMI00001/u);
    assert.deepEqual(fs.readFileSync(built.view), outputBeforeFailures);

    const duplicateOverlay = Buffer.concat([base, Buffer.from(firstExtra), Buffer.from(firstExtra)]);
    fs.writeFileSync(built.overlay, duplicateOverlay);
    const duplicateFailure = runProducer(built.source, built.overlay, built.view, built.sourceSha);
    assert.notEqual(duplicateFailure.status, 0);
    assert.match(duplicateFailure.stderr, /duplicate material correction item_id: OMI00001/u);
    assert.deepEqual(fs.readFileSync(built.view), outputBeforeFailures);
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});
