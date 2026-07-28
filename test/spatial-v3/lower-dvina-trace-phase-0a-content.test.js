import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createFirstPlayablePublicRuntime
} from '../../apps/game-server/src/runtime/first-playable-public-runtime.js';
import {
  SCENARIO_ID
} from '../../apps/game-server/src/runtime/first-playable/shared.js';
import {
  SPATIAL_V3_PRODUCTION_RELEASE
} from '../../apps/game-server/src/composition/production-spatial-v3.js';

const source = resolve('data/world-catalogs/novgorod/lower-dvina-trace-v1');
const checker = 'tools/world-catalog-workflow/src/lower-dvina-trace-phase-0a-check.mjs';
const check = (directory) => execFileSync(process.execPath, [checker, '--directory', directory], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const mutate = (callback) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'lower-dvina-trace-'));
  cpSync(source, directory, { recursive: true });
  try { callback(directory); assert.throws(() => check(directory)); } finally { rmSync(directory, { recursive: true, force: true }); }
};
const readJson = (directory, name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const writeJson = (directory, name, value) => writeFileSync(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`);

test('lower-dvina trace phase 0A package has reproducible manifest digest', () => {
  const args = ['tools/world-catalog-workflow/src/lower-dvina-trace-phase-0a-check.mjs'];
  const first = execFileSync(process.execPath, args, { encoding: 'utf8' });
  const second = execFileSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(first, second);
});

test('checker rejects fixed-identity and self-consistent manifest tampering', () => {
  mutate((directory) => {
    const profile = readJson(directory, 'player-profile.json');
    profile.schema = 'forged.profile';
    writeJson(directory, 'player-profile.json', profile);
    const manifest = readJson(directory, 'manifest.json');
    manifest.files['player-profile.json'] = createHash('sha256').update(readFileSync(resolve(directory, 'player-profile.json'))).digest('hex');
    writeJson(directory, 'manifest.json', manifest);
  });
  mutate((directory) => {
    const definition = readJson(directory, 'definition.json');
    definition.scenario_id = 'forged_trace';
    writeJson(directory, 'definition.json', definition);
  });
});

test('checker rejects empty, duplicate, unknown, or mismatched name candidates', () => {
  for (const mutateNames of [
    (directory) => { const set = readJson(directory, 'player-profile-set.json'); set.name_candidates = []; writeJson(directory, 'player-profile-set.json', set); },
    (directory) => { const profile = readJson(directory, 'player-profile.json'); profile.name_candidates.push(structuredClone(profile.name_candidates[0])); writeJson(directory, 'player-profile.json', profile); },
    (directory) => { const policy = readJson(directory, 'approved-policy.json'); policy.name_candidate_ids = ['unknown']; writeJson(directory, 'approved-policy.json', policy); },
    (directory) => { const set = readJson(directory, 'player-profile-set.json'); set.name_candidates[0].id = 'nov_name_other'; writeJson(directory, 'player-profile-set.json', set); }
  ]) mutate(mutateNames);
});

test('checker rejects incomplete, duplicate, unknown, resolved, or wrongly owned required gaps', () => {
  for (const mutateDefinition of [
    (definition) => { definition.required_unresolved_refs = []; },
    (definition) => { definition.required_unresolved_refs.pop(); },
    (definition) => { definition.required_unresolved_refs[1].category = definition.required_unresolved_refs[0].category; },
    (definition) => { definition.required_unresolved_refs[0].category = 'unknown_category'; },
    (definition) => { definition.required_unresolved_refs[0].expected_owner = '@rus/actors'; },
    (definition) => { definition.required_unresolved_refs[0].expected_schema = 'wrong.schema'; },
    (definition) => { definition.required_unresolved_refs[0].resolution_status = 'resolved'; }
  ]) {
    mutate((directory) => {
      const definition = readJson(directory, 'definition.json');
      mutateDefinition(definition);
      writeJson(directory, 'definition.json', definition);
    });
  }
});

test('public runtime catalog keeps the boatman binding and does not publish trace', async () => {
  const runtime = createFirstPlayablePublicRuntime({
    partyPool: { connect: () => { throw new Error('catalog test must not access PostgreSQL'); } },
    committer: { commit: () => { throw new Error('catalog test must not commit'); } },
    release: { release_id: 'catalog-test-release' },
    runtimeCatalogPin: { catalog_revision_id: 'catalog-test-revision' }
  });
  const catalog = await runtime.listScenarios();
  assert.equal(SCENARIO_ID, 'lower_dvina_late_summer_open_water_v1');
  assert.equal(SPATIAL_V3_PRODUCTION_RELEASE.scenario_binding_id, SCENARIO_ID);
  assert.deepEqual(catalog, {
    version: 1,
    schema: 'public_scenario_catalog',
    scenarios: [{
      scenario_id: SCENARIO_ID,
      title: 'Нижняя Двина: позднее лето',
      description: 'Лодочник на защищённой высокой площадке у открытой воды.',
      available: true
    }]
  });
  assert.equal(catalog.scenarios.some(({ scenario_id: id }) => id === 'lower_dvina_trace_v1'), false);
});
