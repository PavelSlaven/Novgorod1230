// Rebuilds every repo-reproducible game-base-v1 generator in a throwaway copy and fails when a committed
// generated file differs. The copy is a "repo" whose top-level directories are symlinks to this checkout except
// the path to game-base-v1, which is a real copy (builders find repo inputs by walking up from their own file).
// Nothing in the working tree is touched. Needs Node and (for the .py builders) python3/python; no network, no Docker.
//
// NOT covered (need inputs outside the repo or the network; run them by hand):
//   places-binding/scripts/build-all.mjs --extract, extract-pr98-inputs.mjs   PR98_ROOT
//   nature-materials-weather/_shared/scripts/refresh-inputs.mjs   PR98_ROOT, MAIN_ROOT
//   flora-trees-shrubs source-table extraction from the Kolchin PDF, flora-herbs extract-sources.py, fauna-mammals-birds
//   extract_regional_bird_sources.py, history-events-knowledge export_novgorod_1230_extract.py   book/PDF extraction
//   fetch-gbif.cjs, check-urls.cjs   network
//   history-events-knowledge knowledge_rumors/scripts/build_knowledge.js, polities_external_relations/scripts/build_polities.js
//     take their input files (incl. a sqlite) from argv, outside the repo
//   items-weapons-armour/scripts/snapshot-master.cjs   takes the MASTER archive path from argv, outside the repo
//   occupations-activities/npc_runtime_profiles/export_pr98.py   exports from a pinned commit of the PR #98 checkout
//   history-events-knowledge/historical_events/scripts/validate_events.cjs   needs an output-dir argument (fails without)
//   validators that write reports and depend on the machine or on external files:
//   items-weapons-armour validate.cjs (sqlite), items-household validate.py
// crafts build.cjs reads MATCULT_CATALOG when set; the env below strips it, so the committed output must not depend on it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const GB = 'data/world-catalogs/novgorod/game-base-v1';

// [cwd relative to game-base-v1, interpreter, script, ...args]. Order: group builders, then places-binding, catalog, status.
const N = 'node', P = 'py';
const BUILDERS = [
  ['.', P, 'scripts/build-master-material-view.py'],
  ['buildings-interiors-containers', P, 'scripts/build.py'],
  ['clothing-appearance', P, 'scripts/build.py'],
  ['crafts-tools-processes', N, 'scripts/build.cjs'],
  ['crafts-tools-processes', N, 'scripts/crosswalk.cjs'],
  ['crafts-tools-processes', P, 'scripts/pf_crosswalk.py'],
  ['crafts-tools-processes', N, 'scripts/validate.cjs'],
  ['economy-trade-measures', N, 'currencies_measures/scripts/build_currencies_measures.mjs'],
  ['economy-trade-measures', N, 'currencies_measures/scripts/build_econ_rates.mjs'],
  ['economy-trade-measures', N, 'price_bands/scripts/build_category_price_bands.mjs'],
  ['economy-trade-measures', N, 'services_hire_labor/scripts/build_services.mjs'],
  ['economy-trade-measures', N, 'trade_goods_markets/scripts/build_trade_goods_markets.mjs'],
  ['economy-trade-measures', N, 'sources/build_books.mjs'],
  ['economy-trade-measures', N, 'price_bands/scripts/derive_price_bands.mjs'],
  ['economy-trade-measures', N, 'currencies_measures/scripts/run_price_bench_c2.mjs'],
  ['economy-trade-measures', N, 'currencies_measures/scripts/run_household_bench_c3.mjs'],
  ['fauna-fish-invertebrates-livestock', P, 'scripts/build.py'],
  ['fauna-mammals-birds', N, 'scripts/build.cjs'],
  ['fauna-mammals-birds', N, 'scripts/validate.cjs'],
  ['flora-herbs-berries-mushrooms', N, 'scripts/build.cjs'],
  ['flora-herbs-berries-mushrooms', N, 'scripts/validate.cjs'],
  ['flora-trees-shrubs', N, 'scripts/build.mjs'],
  ['flora-trees-shrubs', N, 'scripts/validate.mjs'],
  ['food-drink', P, 'scripts/build.py'],
  ['food-drink', P, 'scripts/pf_crosswalk.py'],
  ['history-events-knowledge/historical_events', N, 'scripts/build_events.cjs'],
  ['history-events-knowledge/historical_figures', N, 'scripts/build_figures.cjs'],
  ['households-psychology-speech', P, 'scripts/build.py'],
  ...['items', 'marks', 'ownership', 'frequency', 'household_inventory', 'exclusion_returns', 'evidence_intake', 'trace_relations']
    .map(name => ['items-household-personal', P, `scripts/build_${name}.py`]),
  ['items-weapons-armour', N, 'scripts/build.cjs'],
  ['items-weapons-armour', P, 'scripts/pf_crosswalk.py'],
  ['misc/anachronism_denylist_lexicon', N, 'scripts/build.mjs'],
  ['misc/hazards_dangers', N, 'scripts/build.mjs'],
  ['names-peoples', N, 'scripts/build-b2-name-pool.mjs'],
  ['names-peoples', N, 'scripts/build-name-components.mjs'],
  ['names-peoples', N, 'scripts/build-peoples-origins.mjs'],
  ['names-peoples', N, 'scripts/build-personal-names.mjs'],
  ['names-peoples', N, 'scripts/build-place-names.mjs'],
  ['nature-materials-weather', N, '_shared/scripts/run-all.mjs'],
  ['occupations-activities/activities_observable', P, 'scripts/build_activities_for_new_occupations.py'],
  ['occupations-activities/carried_inventories', P, 'scripts/build_carried_inventories.py'],
  ['occupations-activities/npc_runtime_profiles', P, 'build.py'],
  ['occupations-activities/occupations', P, 'scripts/build_occupations_additions.py'],
  ['occupations-activities/skills_competences', P, 'build.py'],
  ['resource-catalog', N, 'scripts/build.mjs'],
  ['social-strata-law/law_justice_governance', P, 'scripts/build_law.py'],
  ['social-strata-law/social_strata_legal_status', P, 'scripts/build_roles.py'],
  ['social-strata-law/incidents_conflicts', P, 'scripts/build_incidents.py'],
  ['time-calendar-church/religion', P, 'scripts/build_religion.py'],
  ['time-calendar-church/time', P, 'scripts/build_calendar.py'],
  ['time-calendar-church/time', P, 'scripts/build_schedules.py'],
  ['transport-health-recreation/health_body', N, 'scripts/build.cjs'],
  ['transport-health-recreation/recreation_culture', N, 'scripts/build.cjs'],
  ['transport-health-recreation/transport_travel', N, 'scripts/build.cjs'],
  ['places-binding/scripts', N, 'build-all.mjs'],
  ['scripts', N, 'build-catalog.cjs'],
  ['scripts', N, 'build-status.mjs'],
];

function python() {
  return ['python3', 'python'].find(name => spawnSync(name, ['--version']).status === 0);
}

function makeRepoCopy(parent, afterFirstSymlink = () => {}) {
  const tmp = fs.mkdtempSync(path.join(parent, 'game-base-fresh-'));
  try {
    let real = REPO, copy = tmp, injected = false;
    const parts = GB.split('/');
    for (const [index, part] of parts.entries()) {
      for (const entry of fs.readdirSync(real, { withFileTypes: true })) {
        if (entry.name === part || !entry.isDirectory() || entry.name === '.git') continue;
        fs.symlinkSync(path.join(real, entry.name), path.join(copy, entry.name), 'junction');
        if (!injected) { injected = true; afterFirstSymlink(); }
      }
      real = path.join(real, part);
      copy = path.join(copy, part);
      if (index < parts.length - 1) fs.mkdirSync(copy);
    }
    fs.cpSync(real, copy, { recursive: true });
    return { tmp, copy, real };
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}

function files(root) {
  const found = new Map();
  (function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__pycache__') continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else found.set(prefix + entry.name, path.join(dir, entry.name));
    }
  })(root, '');
  return found;
}

function differing(committed, rebuilt) {
  const before = files(committed), after = files(rebuilt);
  return [...new Set([...before.keys(), ...after.keys()])].sort().filter(file => {
    if (!before.has(file) || !after.has(file)) return true;
    const [a, b] = [before.get(file), after.get(file)].map(name => fs.readFileSync(name));
    return !a.equals(b);
  });
}

function installOrderHooks(root) {
const nodeHook = path.join(root, 'readdir-hook.cjs');
const pythonHook = path.join(root, 'sitecustomize.py');
  fs.writeFileSync(nodeHook, `
const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
if (process.env.GAME_BASE_HOOK_MARKER) fs.appendFileSync(process.env.GAME_BASE_HOOK_MARKER, 'node\\t' + process.env.TMPDIR + '\\n');
const order = (entries) => {
  const sorted = [...entries].sort((a, b) => String(a.name ?? a) < String(b.name ?? b) ? -1 : String(a.name ?? a) > String(b.name ?? b) ? 1 : 0);
  return process.env.GAME_BASE_READDIR_ORDER === 'reverse' ? sorted.reverse() : sorted;
};
const readdirSync = fs.readdirSync.bind(fs);
fs.readdirSync = (...args) => order(readdirSync(...args));
const readdir = fs.promises.readdir.bind(fs.promises);
fs.promises.readdir = async (...args) => order(await readdir(...args));
syncBuiltinESMExports();
`);
  fs.writeFileSync(pythonHook, `
import os

if os.environ.get("GAME_BASE_HOOK_MARKER"):
    with open(os.environ["GAME_BASE_HOOK_MARKER"], "a", encoding="utf-8") as marker:
        marker.write("python\\t" + os.environ.get("TMPDIR", "") + "\\n")

_listdir = os.listdir
_scandir = os.scandir

def _ordered(entries):
    result = sorted(entries, key=lambda entry: entry.name if hasattr(entry, "name") else entry)
    return list(reversed(result)) if os.environ.get("GAME_BASE_READDIR_ORDER") == "reverse" else result

def listdir(path="."):
    return _ordered(_listdir(path))

class _Scandir:
    def __init__(self, path):
        self.entries = iter(_ordered(list(_scandir(path))))
    def __iter__(self):
        return self
    def __next__(self):
        return next(self.entries)
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False

def scandir(path="."):
    return _Scandir(path)

os.listdir = listdir
os.scandir = scandir
`);
  return { nodeHook, pythonHook };
}

function environment(profile, hooks, mainRoot) {
  const env = { ...process.env, NOVGOROD_MAIN: mainRoot, LC_ALL: profile.locale, LANG: profile.locale, TZ: profile.timezone,
    PYTHONHASHSEED: profile.hashSeed, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8',
    GAME_BASE_READDIR_ORDER: profile.order, PYTHONPATH: path.dirname(hooks.pythonHook),
    TMPDIR: mainRoot, GAME_BASE_HOOK_MARKER: hooks.marker,
    NODE_OPTIONS: `--require="${hooks.nodeHook}"` };
  for (const name of ['MATCULT_CATALOG', 'MATCULT_DIR', 'MASTER_DIR', 'MASTER_TP_DIR', 'NOV1230_DB', 'PR98_ROOT', 'MAIN_ROOT']) delete env[name];
  return env;
}

function runBuilders(copy, cwdMode, env, py) {
  const failed = [];
  for (const [group, kind, script, ...args] of BUILDERS) {
    const command = kind === P ? py : process.execPath;
    if (!command) { failed.push(`${group}: ${script} needs python3 or python`); continue; }
    const scriptPath = path.join(copy, group, script);
    const cwd = cwdMode === 'group' ? path.join(copy, group) : copy;
    const run = spawnSync(command, [scriptPath, ...args], { cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 300_000 });
    if (run.status !== 0) failed.push(`${group}: ${script} exited ${run.status}: ${(run.stderr || run.error?.message || '').slice(-300)}`);
  }
  return failed;
}

function assertOrderHooks(hooks, root, py) {
  assert.ok(py, 'determinism test needs python3 or python');
  const fixture = path.join(root, 'order-fixture');
  fs.mkdirSync(fixture);
  for (const name of ['m', 'z', 'a']) fs.writeFileSync(path.join(fixture, name), '');
  const observed = [];
  for (const profile of [
    { locale: 'C', timezone: 'UTC', hashSeed: '1', order: 'sorted' },
    { locale: 'sv_SE.UTF-8', timezone: 'Pacific/Honolulu', hashSeed: '8675309', order: 'reverse' },
  ]) {
    const env = environment(profile, hooks);
    const js = spawnSync(process.execPath, ['-e', 'process.stdout.write(require("node:fs").readdirSync(process.argv[1]).join(","))', fixture], { env, encoding: 'utf8' });
    const pythonResult = spawnSync(py, ['-c', 'import os,sys; print(",".join(os.listdir(sys.argv[1])), end="")', fixture], { env, encoding: 'utf8' });
    const scandirResult = spawnSync(py, ['-c', 'import os,sys; first=next(os.scandir(sys.argv[1])).name; files=next(os.walk(sys.argv[1]))[2]; print(first+"|"+",".join(files), end="")', fixture], { env, encoding: 'utf8' });
    const localeResult = spawnSync(process.execPath, ['-e', 'process.stdout.write(Intl.Collator().resolvedOptions().locale + ":" + ["ä","z"].sort((a,b)=>a.localeCompare(b)).join(""))'], { env, encoding: 'utf8' });
    assert.equal(js.status, 0, js.stderr);
    assert.equal(pythonResult.status, 0, pythonResult.stderr);
    assert.equal(scandirResult.status, 0, scandirResult.stderr);
    assert.equal(localeResult.status, 0, localeResult.stderr);
    observed.push([js.stdout, pythonResult.stdout, scandirResult.stdout, localeResult.stdout]);
  }
  assert.deepEqual(observed, [['a,m,z', 'a,m,z', 'a|a,m,z', 'en-US:äz'], ['z,m,a', 'z,m,a', 'z|z,m,a', 'sv-SE:zä']],
    'test profiles must change Node locale and force opposite Node/Python directory orders');
}

function assertByteEqualOutputs(first, second) {
  for (const output of [
    'crafts-tools-processes/materials_registry/material_resolution.csv',
    'crafts-tools-processes/validation-report.json',
  ]) {
    const a = fs.readFileSync(path.join(first, output));
    const b = fs.readFileSync(path.join(second, output));
    assert.ok(a.equals(b), `${output} differs byte-for-byte between identical inputs`);
  }
}

test('game-base-v1 builders produce identical bytes across machine-like environments', { timeout: 1_800_000 }, () => {
  const py = python();
  let root, hooks, first, second;
  try {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'game base determinism-'));
    hooks = installOrderHooks(root);
    hooks.marker = path.join(root, 'hook-loads.log');
    const beforeFaultInjection = fs.readdirSync(root).sort();
    assert.throws(() => makeRepoCopy(root, () => { throw new Error('injected partial-copy failure'); }), /injected partial-copy failure/);
    assert.deepEqual(fs.readdirSync(root).sort(), beforeFaultInjection, 'makeRepoCopy removes its partial copy after setup failure');
    first = makeRepoCopy(root);
    second = makeRepoCopy(root);
    assertOrderHooks(hooks, root, py);
    const profiles = [
      { locale: 'C', timezone: 'UTC', hashSeed: '1', order: 'sorted', cwd: 'group' },
      { locale: 'sv_SE.UTF-8', timezone: 'Pacific/Honolulu', hashSeed: '8675309', order: 'reverse', cwd: 'root' },
    ];
    const outcomes = profiles.map((profile, index) => {
      const env = environment(profile, hooks, index === 0 ? first.tmp : second.tmp);
      const copy = index === 0 ? first.copy : second.copy;
      const failed = runBuilders(copy, profile.cwd, env, py);
      assert.deepEqual(failed, [], `builders failed in ${profile.locale}/${profile.timezone}/${profile.order}:\n${failed.join('\n')}`);
      return copy;
    });
    assertByteEqualOutputs(outcomes[0], outcomes[1]);
    const hookLoads = fs.readFileSync(hooks.marker, 'utf8').trim().split('\n');
    assert.ok(hookLoads.some(line => line.startsWith(`node\t${root}${path.sep}`)), 'Node preload ran with TMPDIR containing spaces');
    assert.ok(hookLoads.some(line => line.startsWith(`python\t${root}${path.sep}`)), 'Python sitecustomize ran with TMPDIR containing spaces');
    const different = differing(outcomes[0], outcomes[1]);
    assert.deepEqual(different, [], `machine-dependent generated files in ${GB}:\n${different.slice(0, 100).join('\n')}`);

    const stale = differing(second.real, outcomes[1]);
    assert.deepEqual(stale, [], `stale generated files in ${GB}:\n${stale.join('\n')}\n`
      + 'Rebuild them with the builders listed in scripts/generated-freshness.test.mjs and commit the result.');
  } finally {
    for (const copy of [first, second]) if (copy) fs.rmSync(copy.tmp, { recursive: true, force: true });
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});
