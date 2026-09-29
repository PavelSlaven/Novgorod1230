import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ACOUSTIC_PACKAGES, buildAcousticRelease, promoteAcousticPackages,
} from '../../scripts/promote-m2c-acoustic-packages.mjs';

const acoustic = 'data/world-catalogs/novgorod/m2c-acoustic';
const historic = '86d87dae';
const showHistoric = (path) => execFileSync('git', ['show', `${historic}:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

test('base + canonical-terminal packages regenerate the historic approved acoustic files byte for byte', async () => {
  const release = await buildAcousticRelease({
    packages: ACOUSTIC_PACKAGES.slice(0, 2),
    authoringVersions: JSON.parse(showHistoric(`${acoustic}/approved/spatial_v3_authoring_versions.json`)),
    manifest: JSON.parse(showHistoric('data/world-catalogs/novgorod/m2c-acoustic-import-manifest.json')),
  });
  assert.equal(release.baselines.length, 71);
  assert.equal(release.baselinesBytes, showHistoric(`${acoustic}/approved/spatial_v3_g6_acoustic_baselines.json`));
  assert.equal(release.authoringVersionsBytes, showHistoric(`${acoustic}/approved/spatial_v3_authoring_versions.json`));
  assert.equal(release.manifestBytes, showHistoric('data/world-catalogs/novgorod/m2c-acoustic-import-manifest.json'));
});

test('approved acoustic dataset is the union of every approved package', async () => {
  assert.deepEqual(ACOUSTIC_PACKAGES, ['', 'canonical-terminal', 'canonical-walk']);
  const raw = [];
  for (const name of ACOUSTIC_PACKAGES) {
    const dir = name ? `${acoustic}/${name}` : acoustic;
    assert.equal((await json(`${dir}/approval.json`)).status, 'approved', dir);
    raw.push(...await json(`${dir}/authoring-rows.json`));
  }
  const rows = await json(`${acoustic}/approved/spatial_v3_g6_acoustic_baselines.json`);
  assert.equal(rows.length, raw.length);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.ok(rows.every((row) => row.status === 'approved'));
  assert.ok(rows.some((row) => row.id.includes('vikhtuy_locality_water_access')));
  const versions = await json(`${acoustic}/approved/spatial_v3_authoring_versions.json`);
  const owned = versions.filter((row) => row.entity_kind === 'g6_acoustic_baseline');
  assert.deepEqual(owned.map((row) => [row.entity_id, row.canonical_digest]),
    rows.map((row) => [row.id, row.canonical_digest]));
});

test('committed acoustic release files, capacity-v2 pins and P12 walk request are exactly regenerated', async () => {
  const result = await promoteAcousticPackages({ check: true });
  assert.equal(result.baselines, 218);
  assert.equal(result.p12.bundle, 'acoustic');
});
