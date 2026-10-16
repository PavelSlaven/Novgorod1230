import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '../../../../..');
const BUILDER = path.join(REPO, 'data/world-catalogs/novgorod/game-base-v1/buildings-interiors-containers/scripts/build.py');
const MASTER_SOURCE = path.join(REPO, 'data/world-catalogs/novgorod/sources/master-archive-v1/data');
const WORKSHOP_SOURCE = path.join(REPO, 'data/world-catalogs/novgorod/sources/bic-reproducible-inputs-v1/data/master/workshop_profiles.csv');
const MASTER_INPUTS = [
  'normalized_source_tables/material_entities/material_entities.csv',
  'normalized_source_tables/material_entities/state_variants.csv',
  'normalized_source_tables/material_entities/spawn_profiles.csv',
];

function copyMaster(root, complete) {
  for (const relative of MASTER_INPUTS) {
    if (!complete && !relative.endsWith('spawn_profiles.csv')) continue;
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(MASTER_SOURCE, relative), target);
  }
  const workshop = path.join(root, 'normalized_source_tables/technology_processes/workshop_profiles.csv');
  fs.mkdirSync(path.dirname(workshop), { recursive: true });
  fs.copyFileSync(WORKSHOP_SOURCE, workshop);
}

function runBuilder(masterDir) {
  return spawnSync('python3', [BUILDER, '--check'], {
    cwd: REPO,
    env: { ...process.env, MASTER_DIR: masterDir },
    encoding: 'utf8',
  });
}

test('BIC MASTER_DIR uses a complete snapshot and rejects a partial override', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'iss-201-master-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  const complete = path.join(temp, 'complete');
  fs.mkdirSync(complete);
  copyMaster(complete, true);
  const accepted = runBuilder(complete);
  assert.equal(accepted.error, undefined, accepted.error?.message);
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);

  const partial = path.join(temp, 'partial');
  fs.mkdirSync(partial);
  copyMaster(partial, false);
  const rejected = runBuilder(partial);
  const output = rejected.stdout + rejected.stderr;
  assert.equal(rejected.error, undefined, rejected.error?.message);
  assert.notEqual(rejected.status, 0, output);
  assert.match(output, /required BIC input missing/);
  assert.match(output, /material_entities\.csv/);
  assert.match(output, /state_variants\.csv/);
});
