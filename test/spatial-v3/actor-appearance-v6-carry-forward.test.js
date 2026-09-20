import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { createRandomSource, materializeActorBaseAppearance } from '@rus/materialization';
import {
  CARRY_FORWARD_ROOT,
  writeActorAppearanceV6CarryForward
} from '../../scripts/generate-actor-appearance-v6-carry-forward.mjs';
import { validateActorAppearanceV6CarryForward } from '../../scripts/validate-actor-appearance-v6-carry-forward.mjs';

const source = 'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4';
const target = 'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6';

test('v6 carry-forward candidate is authoring-approved, deterministic and runtime-inactive', async () => {
  const candidate = JSON.parse(await readFile(resolve(CARRY_FORWARD_ROOT, 'candidate.json')));
  assert.equal((await validateActorAppearanceV6CarryForward()).pass, true);
  assert.equal(candidate.import_activation, false);
  assert.equal(candidate.authoring_approved, true);
  assert.equal(candidate.authoring_attestation.exact_row_count, 129);
  assert.equal(candidate.authoring_attestation.semantic_equivalence, true);
  assert.equal(candidate.authoring_attestation.runtime_selectable, false);
  assert.equal(candidate.runtime_status, 'typed_data_gap');
  assert.deepEqual(candidate.runtime_import_rows, []);
  const input = {
    approved_entries: approvedEntries(candidate),
    choice_key_prefix: 'v6-carry-forward',
    random: createRandomSource({ seed: 1230 })
  };
  const left = materializeActorBaseAppearance(input);
  const right = materializeActorBaseAppearance({ ...input,
    random: createRandomSource({ seed: 1230 }) });
  assert.deepEqual(left, right);
});

for (const [name, mutate, code] of [
  ['missing row', (candidate) => candidate.candidate_rows.region_appearance_profile_entries.pop(), 'ACTOR_APPEARANCE_V6_CANDIDATE_COUNT'],
  ['weight drift', (candidate) => { candidate.candidate_rows.region_appearance_profile_entries[0].weight = 2; }, 'ACTOR_APPEARANCE_V6_SEMANTIC_DRIFT'],
  ['authoring attestation tamper', (candidate) => { candidate.authoring_attestation.exact_row_count = 1; }, 'ACTOR_APPEARANCE_V6_AUTHORING_ATTESTATION'],
  ['world tuple tamper', (candidate) => { candidate.target.catalog_digest = '0'.repeat(64); }, 'ACTOR_APPEARANCE_V6_TARGET_TUPLE'],
  ['row status downgrade', (candidate) => { candidate.candidate_rows.region_appearance_profile_entries[0].status = 'draft'; }, 'ACTOR_APPEARANCE_V6_ROW_NOT_APPROVED']
]) {
  test(`v6 carry-forward validator rejects ${name}`, async (t) => {
    const root = await fixtureRoot(t);
    const path = resolve(root, CARRY_FORWARD_ROOT, 'candidate.json');
    const candidate = JSON.parse(await readFile(path));
    mutate(candidate);
    await writeFile(path, `${JSON.stringify(candidate, null, 2)}\n`);
    const result = await validateActorAppearanceV6CarryForward(root);
    assert.equal(result.pass, false);
    assert.ok(result.errors.some((error) => error.code === code));
  });
}

function approvedEntries(candidate) {
  const rows = candidate.candidate_rows;
  const options = new Map(rows.region_category_options.map((row) => [row.id, row]));
  const categories = new Map(rows.universal_categories.map((row) => [row.id, row]));
  return [
    ...rows.region_demographic_profile_entries,
    ...rows.region_appearance_profile_entries
  ].map((row) => ({
    entry_id: row.id,
    facet: row.facet,
    option_value: categories.get(options.get(row.option_id).category_id).stable_code.split('.').at(-1),
    weight: row.weight,
    applicability: row.applicability,
    status: row.status,
    applicable: true
  }));
}

async function fixtureRoot(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'actor-appearance-v6-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(source, resolve(root, source), { recursive: true });
  await cp(target, resolve(root, target), { recursive: true });
  await writeActorAppearanceV6CarryForward(root);
  return root;
}
