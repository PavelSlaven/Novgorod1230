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
//   validators that write reports and depend on the machine or on external files: crafts validate.cjs,
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
  ['buildings-interiors-containers', P, 'scripts/build.py'],
  ['clothing-appearance', P, 'scripts/build.py'],
  ['crafts-tools-processes', N, 'scripts/build.cjs'],
  ['crafts-tools-processes', N, 'scripts/crosswalk.cjs'],
  ['crafts-tools-processes', P, 'scripts/pf_crosswalk.py'],
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

function makeRepoCopy() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'game-base-fresh-'));
  try {
    let real = REPO, copy = tmp;
    const parts = GB.split('/');
    for (const [index, part] of parts.entries()) {
      for (const entry of fs.readdirSync(real, { withFileTypes: true })) {
        if (entry.name === part || !entry.isDirectory() || entry.name === '.git') continue;
        fs.symlinkSync(path.join(real, entry.name), path.join(copy, entry.name), 'junction');
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

test('committed game-base-v1 generated files match a fresh rebuild', { timeout: 900_000 }, () => {
  const py = python();
  const { tmp, copy, real } = makeRepoCopy();
  try {
    const env = { ...process.env, NOVGOROD_MAIN: tmp, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' };
    for (const name of ['MATCULT_CATALOG', 'MATCULT_DIR', 'MASTER_DIR', 'MASTER_TP_DIR', 'NOV1230_DB', 'PR98_ROOT', 'MAIN_ROOT']) delete env[name];
    const failed = [];
    for (const [cwd, kind, script, ...args] of BUILDERS) {
      const command = kind === P ? py : process.execPath;
      if (!command) { failed.push(`${cwd}: ${script} needs python3 or python`); continue; }
      const run = spawnSync(command, [script, ...args], { cwd: path.join(copy, cwd), env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 300_000 });
      if (run.status !== 0) failed.push(`${cwd}: ${script} exited ${run.status}: ${(run.stderr || run.error?.message || '').slice(-300)}`);
    }
    assert.deepEqual(failed, [], `builders failed in the temporary copy:\n${failed.join('\n')}`);

    const changed = differing(real, copy);
    assert.deepEqual(changed, [], `stale or machine-dependent generated files in ${GB}:\n${changed.join('\n')}\n`
      + 'Rebuild them with the builders listed in scripts/generated-freshness.test.mjs and commit the result.');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
