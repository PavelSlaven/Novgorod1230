import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const urls = {
  candidate: new URL('./candidate.json', import.meta.url),
  approval: new URL('./approval-attestation.json', import.meta.url),
  natural: new URL('../m2c-natural/candidate.json', import.meta.url),
  successor: new URL('../m2c-natural/nature-successor-candidate-v2.json', import.meta.url),
  successorApproval: new URL('../m2c-natural/nature-successor-data-approval.json', import.meta.url)
};
const originals = Object.fromEntries(Object.entries(urls).map(([name, url]) =>
  [name, fs.readFileSync(url)]));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

test('changed approved bytes are revalidated when the stat tuple stays unchanged', async (t) => {
  const realRead = fs.readFileSync;
  const realStat = fs.statSync;
  const namesByPath = new Map(Object.entries(urls).map(([name, url]) => [fileURLToPath(url), name]));
  const bytes = Object.fromEntries(Object.entries(originals).map(([name, value]) =>
    [name, Buffer.from(value)]));
  const fixedStats = Object.fromEntries(Object.entries(urls).map(([name, url]) =>
    [name, realStat(url, { bigint: true })]));
  const statTuples = Object.fromEntries(Object.entries(fixedStats).map(([name, stat]) =>
    [name, [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String)]));
  const pathName = (path) => namesByPath.get(path instanceof URL ? fileURLToPath(path)
    : Buffer.isBuffer(path) ? path.toString() : path);
  let candidateValidations = 0;
  const candidateText = () => bytes.candidate.toString();

  t.mock.method(fs, 'readFileSync', function (path, options) {
    const name = pathName(path);
    if (!name) return realRead.call(this, path, options);
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? bytes[name].toString(encoding) : Buffer.from(bytes[name]);
  });
  t.mock.method(fs, 'statSync', function (path, options) {
    const name = pathName(path);
    if (!name) return realStat.call(this, path, options);
    return fixedStats[name];
  });
  const parse = JSON.parse;
  t.mock.method(JSON, 'parse', function (value, ...args) {
    if (String(value) === candidateText()) candidateValidations += 1;
    return parse.call(this, value, ...args);
  });
  t.mock.method(console, 'warn', () => {});
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });

  const { loadApprovedPlaceLabels } = await import('./approved-labels.mjs?content-key-regression');
  const first = loadApprovedPlaceLabels();
  assert.ok(first instanceof Map);
  assert.equal(first.size, 647);
  const initialStatTuple = [fs.statSync(urls.candidate, { bigint: true }).dev,
    fs.statSync(urls.candidate, { bigint: true }).ino,
    fs.statSync(urls.candidate, { bigint: true }).size,
    fs.statSync(urls.candidate, { bigint: true }).mtimeNs,
    fs.statSync(urls.candidate, { bigint: true }).ctimeNs].map(String);
  assert.equal(candidateValidations, 1);
  const key = first.keys().next().value;
  const changedCandidate = JSON.parse(originals.candidate);
  const changedApproval = JSON.parse(originals.approval);
  const row = changedCandidate.labels.find((entry) => entry.canonical_g5_ref);
  const labelKey = `${row.canonical_g5_ref.id}@${row.canonical_g5_ref.version}`;
  row.display_label = 'Метка после смены байтов';
  const changedCandidateBytes = Buffer.from(JSON.stringify(changedCandidate));
  changedApproval.candidate_sha256 = sha256(changedCandidateBytes);
  changedApproval.approved_rows.find((entry) => entry.canonical_g5_id === row.canonical_g5_ref.id
    && entry.canonical_g5_version === row.canonical_g5_ref.version).display_label = row.display_label;
  bytes.candidate = changedCandidateBytes;
  bytes.approval = Buffer.from(JSON.stringify(changedApproval));

  const validationsBeforeChangedLoad = candidateValidations;
  const second = loadApprovedPlaceLabels();
  assert.ok(second instanceof Map);
  assert.equal(second.get(labelKey).display_label, row.display_label);
  assert.equal(candidateValidations, validationsBeforeChangedLoad + 1,
    'Changed content must run the complete approval validation again');
  assert.equal(second.get(key).display_label, row.display_label);
  assert.deepEqual([fs.statSync(urls.candidate, { bigint: true }).dev,
    fs.statSync(urls.candidate, { bigint: true }).ino,
    fs.statSync(urls.candidate, { bigint: true }).size,
    fs.statSync(urls.candidate, { bigint: true }).mtimeNs,
    fs.statSync(urls.candidate, { bigint: true }).ctimeNs].map(String), initialStatTuple);
  assert.deepEqual(statTuples.candidate, initialStatTuple);
});
