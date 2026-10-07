import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sources = {
  candidate: new URL('./candidate.json', import.meta.url),
  approval: new URL('./approval-attestation.json', import.meta.url),
  natural: new URL('../m2c-natural/candidate.json', import.meta.url),
  successor: new URL('../m2c-natural/nature-successor-candidate-v2.json', import.meta.url),
  successorApproval: new URL('../m2c-natural/nature-successor-data-approval.json', import.meta.url),
};
const stock = Object.fromEntries(Object.entries(sources).map(([name, url]) =>
  [name, fs.readFileSync(url)]));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
let fixtureSequence = 0;

// Keep canonical files untouched. Builtin mocks expose changed bytes and realistic
// metadata together, so either a content key or a metadata fast path can be tested.
async function fixture(t) {
  const sequence = ++fixtureSequence;
  const realRead = fs.readFileSync;
  const realStat = fs.statSync;
  const byPath = new Map(Object.entries(sources).map(([name, url]) => [fileURLToPath(url), name]));
  const files = Object.fromEntries(Object.entries(stock).map(([name, bytes]) => [name, Buffer.from(bytes)]));
  const revisions = Object.fromEntries(Object.keys(sources).map((name) => [name, sequence * 100]));
  const errors = new Map();
  const reads = Object.fromEntries(Object.keys(sources).map((name) => [name, 0]));
  const statChecks = Object.fromEntries(Object.keys(sources).map((name) => [name, 0]));
  const stats = Object.fromEntries(Object.entries(sources).map(([name, url]) =>
    [name, { normal: realStat(url), bigint: realStat(url, { bigint: true }) }]));
  const pathName = (path) => byPath.get(path instanceof URL ? fileURLToPath(path)
    : Buffer.isBuffer(path) ? path.toString() : path);
  const fail = (name) => { if (errors.has(name)) throw errors.get(name); };
  t.mock.method(fs, 'readFileSync', function (path, options) {
    const name = pathName(path);
    if (!name) return realRead.call(this, path, options);
    reads[name] += 1;
    fail(name);
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? files[name].toString(encoding) : Buffer.from(files[name]);
  });
  t.mock.method(fs, 'statSync', function (path, options) {
    const name = pathName(path);
    if (!name) return realStat.call(this, path, options);
    statChecks[name] += 1;
    if (errors.has(name) && options?.throwIfNoEntry === false && errors.get(name).code === 'ENOENT') {
      return undefined;
    }
    fail(name);
    const bigint = options?.bigint === true;
    const original = stats[name][bigint ? 'bigint' : 'normal'];
    const number = (value) => bigint ? BigInt(value) : value;
    const stamp = 1_800_000_000_000 + revisions[name];
    return Object.assign(Object.create(Object.getPrototypeOf(original)), original, {
      ino: number(Number(stats[name].normal.ino) + sequence), size: number(files[name].length),
      mtimeMs: number(stamp), ctimeMs: number(stamp), mtime: new Date(stamp), ctime: new Date(stamp),
      ...(bigint ? { mtimeNs: BigInt(stamp) * 1_000_000n, ctimeNs: BigInt(stamp) * 1_000_000n } : {}),
    });
  });
  const parse = JSON.parse;
  let candidateChecks = 0;
  t.mock.method(JSON, 'parse', function (bytes, ...args) {
    if (String(bytes) === files.candidate.toString()) candidateChecks += 1;
    return parse.call(this, bytes, ...args);
  });
  t.mock.method(console, 'warn', () => {});
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const { loadApprovedPlaceLabels: load } = await import(`./approved-labels.mjs?cache-acceptance=${sequence}`);
  return {
    load, reads, checks: () => candidateChecks,
    probes: (name) => reads[name] + statChecks[name],
    replace(name, bytes) {
      files[name] = Buffer.from(bytes);
      revisions[name] += 1;
      errors.delete(name);
    },
    reject(name, code) {
      errors.set(name, Object.assign(new Error(`Fixture ${code}`), { code }));
      revisions[name] += 1;
    },
  };
}

function approved(labels) {
  assert.ok(labels instanceof Map);
  assert.equal(labels.size, 647);
  assert.deepEqual(labels.diagnostics, []);
}

test('unchanged verified label bytes are validated once; each call returns an independent copy', async (t) => {
  const { load, checks } = await fixture(t);
  const first = load();
  approved(first);
  const validations = checks();
  assert.equal(validations, 1, 'Counter must observe the cold candidate validation');
  const second = load();
  approved(second);
  assert.equal(checks(), validations, 'Warm call must not reparse and revalidate the approved candidate');
  assert.notStrictEqual(second, first);
  assert.deepEqual([...second], [...first]);
  const key = first.keys().next().value;
  assert.notStrictEqual(second.get(key), first.get(key));
  assert.equal(Object.getOwnPropertyDescriptor(second, 'diagnostics').enumerable, false);
  assert.ok(Object.isFrozen(second.diagnostics));
});

test('Map and nested row mutations never poison later label calls, including successor aliases', async (t) => {
  const { load } = await fixture(t);
  const first = load();
  approved(first);
  const expected = structuredClone([...first]);
  const g5Key = [...first.keys()].find((key) => !key.startsWith('natural:'));
  first.get(g5Key).display_label = 'Подменённая метка';
  first.get(g5Key).canonical_g5_ref.id = 'foreign-g5';
  const aliasKey = [...first.keys()].find((key) => key.startsWith('natural:') && key.includes('@2|'));
  assert.ok(aliasKey, 'Fixture must exercise an approved successor alias');
  first.get(aliasKey).natural_place_ref.natural_profile_ref.id = 'foreign-profile';
  first.get(aliasKey).natural_place_ref.scene_template_ref.version = 999;
  first.delete(g5Key);
  first.set('foreign@1', { display_label: 'Чужая метка' });
  assert.deepEqual([...load()], expected);
  first.clear();
  const third = load();
  approved(third);
  assert.deepEqual([...third], expected);
});

test('changed candidate and matching attestation produce a new validated result', async (t) => {
  const state = await fixture(t);
  const first = state.load();
  approved(first);
  const candidate = JSON.parse(stock.candidate);
  const approval = JSON.parse(stock.approval);
  const row = candidate.labels.find((entry) => entry.canonical_g5_ref);
  const key = `${row.canonical_g5_ref.id}@${row.canonical_g5_ref.version}`;
  row.display_label = 'Новая утверждённая метка';
  const bytes = JSON.stringify(candidate);
  approval.candidate_sha256 = sha256(bytes);
  approval.approved_rows.find((entry) => entry.canonical_g5_id === row.canonical_g5_ref.id
    && entry.canonical_g5_version === row.canonical_g5_ref.version).display_label = row.display_label;
  state.replace('candidate', bytes);
  state.replace('approval', JSON.stringify(approval));
  const before = state.checks();
  const second = state.load();
  approved(second);
  assert.equal(second.get(key).display_label, row.display_label);
  assert.notEqual(first.get(key).display_label, row.display_label);
  assert.equal(state.checks(), before + 1);
  state.load();
  assert.equal(state.checks(), before + 1, 'The newly approved candidate also gets a warm hit');
});

for (const name of ['candidate', 'approval']) {
  test(`changed ${name} rejects a previously warm result and retries invalid attestation`, async (t) => {
    const state = await fixture(t);
    approved(state.load());
    if (name === 'candidate') {
      state.replace(name, `${stock[name].toString()}\n`); // Same JSON, different attested bytes.
    } else {
      const approval = JSON.parse(stock.approval);
      approval.decision = 'REJECT';
      state.replace(name, JSON.stringify(approval));
    }
    const before = state.checks();
    assert.equal(state.load(), null);
    assert.equal(state.load(), null);
    assert.equal(state.checks(), before + 2, 'Invalid attestation must be verified again on each call');
    state.replace(name, stock[name]);
    approved(state.load());
  });
}

for (const name of ['natural', 'successor', 'successorApproval']) {
  test(`changed ${name} invalidates approved successor aliases and preserves diagnostics`, async (t) => {
    const state = await fixture(t);
    approved(state.load());
    state.replace(name, '{}');
    const reduced = state.load();
    assert.ok(reduced instanceof Map);
    assert.equal(reduced.size, 327, 'An unverified lineage retains only the approved base labels');
    assert.deepEqual(reduced.diagnostics, [{ code: 'natural_successor_lineage_unverified' }]);
    assert.ok(Object.isFrozen(reduced.diagnostics));
    assert.ok(Object.isFrozen(reduced.diagnostics[0]));
    assert.equal(Object.getOwnPropertyDescriptor(reduced, 'diagnostics').enumerable, false);
    const again = state.load();
    assert.notStrictEqual(again, reduced);
    assert.deepEqual(again.diagnostics, reduced.diagnostics);
    state.replace(name, stock[name]);
    approved(state.load());
  });
}

for (const name of ['candidate', 'approval']) {
  for (const failure of ['ENOENT', 'SyntaxError']) {
    test(`${name}: ${failure} remains null, is retried, and recovers without module reload`, async (t) => {
      const state = await fixture(t);
      approved(state.load());
      if (failure === 'ENOENT') state.reject(name, 'ENOENT');
      else state.replace(name, '{ invalid JSON');
      const before = state.probes(name);
      assert.equal(state.load(), null);
      const afterFirst = state.probes(name);
      assert.ok(afterFirst > before, 'Changed or missing input must be checked');
      assert.equal(state.load(), null);
      assert.ok(state.probes(name) > afterFirst, 'Failure must be checked again, including ENOENT');
      state.replace(name, stock[name]);
      approved(state.load());
    });
  }
}

for (const name of ['candidate', 'natural']) {
  test(`${name}: exceptions other than ENOENT or SyntaxError still propagate on every call`, async (t) => {
    const state = await fixture(t);
    approved(state.load());
    state.reject(name, 'EACCES');
    assert.throws(() => state.load(), { code: 'EACCES' });
    assert.throws(() => state.load(), { code: 'EACCES' });
    state.replace(name, stock[name]);
    approved(state.load());
  });
}
