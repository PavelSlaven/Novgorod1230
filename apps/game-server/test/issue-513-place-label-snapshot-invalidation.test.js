import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const projectRoot = process.cwd();
const sourcePaths = {
  candidate: path.resolve(projectRoot, 'data/world-catalogs/novgorod/m2c-place-labels/candidate.json'),
  approval: path.resolve(projectRoot, 'data/world-catalogs/novgorod/m2c-place-labels/approval-attestation.json'),
  natural: path.resolve(projectRoot, 'data/world-catalogs/novgorod/m2c-natural/candidate.json'),
  successor: path.resolve(projectRoot, 'data/world-catalogs/novgorod/m2c-natural/nature-successor-candidate-v2.json'),
  successorApproval: path.resolve(projectRoot,
    'data/world-catalogs/novgorod/m2c-natural/nature-successor-data-approval.json'),
};
const sourceBytes = Object.fromEntries(Object.entries(sourcePaths).map(([name, file]) =>
  [name, fs.readFileSync(file)]));
let fixtureSequence = 0;

async function fixture(t) {
  const sequence = ++fixtureSequence;
  const realRead = fs.readFileSync;
  const realStat = fs.statSync;
  const namesByPath = new Map(Object.entries(sourcePaths).map(([name, file]) => [file, name]));
  const bytes = Object.fromEntries(Object.entries(sourceBytes).map(([name, value]) =>
    [name, Buffer.from(value)]));
  const metadata = Object.fromEntries(Object.entries(sourcePaths).map(([name, file]) => {
    const stat = realStat(file, { bigint: true });
    return [name, { dev: stat.dev, ino: stat.ino, size: stat.size,
      mtimeNs: stat.mtimeNs, ctimeNs: stat.ctimeNs }];
  }));
  const errors = new Map();
  const reads = Object.fromEntries(Object.keys(sourcePaths).map((name) => [name, 0]));
  const stats = Object.fromEntries(Object.keys(sourcePaths).map((name) => [name, 0]));
  const pathName = (value) => namesByPath.get(value instanceof URL ? path.resolve(fileURLToPath(value))
    : Buffer.isBuffer(value) ? path.resolve(value.toString()) : path.resolve(value));
  const maybeFail = (name) => { if (errors.has(name)) throw errors.get(name); };

  t.mock.method(fs, 'readFileSync', function (file, options) {
    const name = pathName(file);
    if (!name) return realRead.call(this, file, options);
    reads[name] += 1;
    maybeFail(name);
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? bytes[name].toString(encoding) : Buffer.from(bytes[name]);
  });
  t.mock.method(fs, 'statSync', function (file, options) {
    const name = pathName(file);
    if (!name) return realStat.call(this, file, options);
    stats[name] += 1;
    maybeFail(name);
    return metadata[name];
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });

  const moduleUrl = pathToFileURL(path.resolve(projectRoot,
    'data/world-catalogs/novgorod/m2c-place-labels/approved-labels.mjs'));
  const { loadApprovedPlaceLabelsSnapshot: load } = await import(
    `${moduleUrl.href}?issue-513-snapshot=${sequence}`);
  return {
    load, bytes, metadata, reads, stats,
    setBytes(name, value) { bytes[name] = Buffer.from(value); },
    fail(name, code) { errors.set(name, Object.assign(new Error(`Fixture ${code}`), { code })); },
    recover(name) { errors.delete(name); },
    totalReads() { return Object.values(reads).reduce((sum, count) => sum + count, 0); },
  };
}

function approved(labels) {
  assert.ok(labels instanceof Map);
  assert.equal(labels.size, 647);
}

test('snapshot warm hit returns defensive copies without rereading five source files', async (t) => {
  const state = await fixture(t);
  const first = state.load();
  approved(first);
  const readsAfterCold = state.totalReads();
  assert.equal(readsAfterCold, 5);
  const expected = structuredClone([...first]);
  const [key, expectedRow] = expected.find(([, row]) => row.natural_place_ref != null);
  assert.ok(key, 'fixture includes a nested natural place label');
  const expectedDiagnostics = structuredClone(first.diagnostics);
  first.get(key).display_label = 'Повреждённая копия';
  first.get(key).natural_place_ref.natural_profile_ref.id = 'mutated-copy';
  first.delete(key);

  const second = state.load();
  approved(second);
  assert.deepEqual([...second], expected);
  assert.deepEqual(second.diagnostics, expectedDiagnostics);
  assert.equal(state.totalReads(), readsAfterCold, 'warm metadata tuple must skip source reads');
  assert.notStrictEqual(second, first);
  assert.notStrictEqual(second.get(key), expectedRow);
  assert.equal(second.get(key).natural_place_ref.natural_profile_ref.id,
    expectedRow.natural_place_ref.natural_profile_ref.id);
});

test('every field in each five-file stat tuple invalidates snapshot and reloads sources', async (t) => {
  const state = await fixture(t);
  approved(state.load());
  for (const field of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) {
    state.metadata.candidate[field] += 1n;
    const before = state.totalReads();
    approved(state.load());
    assert.equal(state.totalReads(), before + 5, `${field} change must invalidate cached snapshot`);
  }
  for (const name of Object.keys(sourcePaths)) {
    state.metadata[name].ctimeNs += 1n;
    const before = state.totalReads();
    approved(state.load());
    assert.equal(state.totalReads(), before + 5, `${name} metadata change must invalidate snapshot`);
  }
});

test('changed approved bytes are rejected after metadata invalidation, retried, and recover exactly', async (t) => {
  const state = await fixture(t);
  const initial = state.load();
  approved(initial);
  const exactApprovedLabels = structuredClone([...initial]);
  const approvedBytes = Buffer.from(state.bytes.approval);
  const invalidBytes = Buffer.from(approvedBytes);
  const originalDigest = Buffer.from('ad7576d2436077c78e87b1ea3294326d7bd07b6e15d97d060e9e2f50c39eb3a8');
  const rejectedDigest = Buffer.from('0'.repeat(originalDigest.length));
  const digestOffset = invalidBytes.indexOf(originalDigest);
  assert.notEqual(digestOffset, -1, 'approval fixture contains its pinned candidate digest');
  rejectedDigest.copy(invalidBytes, digestOffset);
  assert.equal(invalidBytes.length, approvedBytes.length);

  state.setBytes('approval', invalidBytes);
  invalidBytes.fill(0);
  state.metadata.approval.ctimeNs += 1n;
  const beforeReject = state.totalReads();
  assert.equal(state.load(), null, 'bytes that fail the candidate approval digest expose no labels');
  assert.equal(state.totalReads(), beforeReject + 5, 'changed metadata forces all source bytes to be reloaded');

  const beforeRetry = state.totalReads();
  assert.equal(state.load(), null, 'invalid candidate remains rejected on retry');
  assert.equal(state.totalReads(), beforeRetry + 5, 'rejected candidates are not cached as valid snapshots');

  state.setBytes('approval', approvedBytes);
  state.metadata.approval.ctimeNs += 1n;
  const recovered = state.load();
  approved(recovered);
  assert.deepEqual([...recovered], exactApprovedLabels,
    'restoring the exact approved bytes restores the exact approved label set');
});

test('missing source invalidates warm snapshot, retries, and recovers when restored', async (t) => {
  const state = await fixture(t);
  approved(state.load());
  state.fail('successor', 'ENOENT');
  const reduced = state.load();
  assert.ok(reduced instanceof Map);
  assert.equal(reduced.size, 327, 'missing optional lineage source keeps approved base labels');
  assert.deepEqual(reduced.diagnostics, [{ code: 'natural_successor_lineage_unverified' }]);
  const afterFirstFailure = state.totalReads();
  const retried = state.load();
  assert.equal(retried.size, 327);
  assert.ok(state.totalReads() > afterFirstFailure, 'missing source must be retried');
  state.recover('successor');
  approved(state.load());
});

test('stat/read errors never retain stale labels, retry, and recover', async (t) => {
  const state = await fixture(t);
  approved(state.load());
  state.fail('successor', 'EACCES');
  assert.throws(() => state.load(), { code: 'EACCES' });
  const afterFirstFailure = state.stats.successor;
  assert.throws(() => state.load(), { code: 'EACCES' });
  assert.ok(state.stats.successor > afterFirstFailure, 'failed metadata lookup must be retried');
  state.recover('successor');
  approved(state.load());
});
