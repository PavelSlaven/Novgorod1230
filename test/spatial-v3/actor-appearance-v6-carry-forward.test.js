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

test('v6 carry-forward candidate includes exact equipment slots, remains deterministic and runtime-inactive', async () => {
  const candidate = JSON.parse(await readFile(resolve(CARRY_FORWARD_ROOT, 'candidate.json')));
  assert.equal((await validateActorAppearanceV6CarryForward()).pass, true);
  assert.equal(candidate.import_activation, false);
  assert.equal(candidate.status, 'pending_independent_approval');
  assert.equal(candidate.candidate_row_count_by_table.item_template_category_bindings, 20);
  assert.deepEqual(candidate.candidate_rows.item_template_category_bindings
    .filter(({ binding_kind: kind }) => kind === 'equipment_slot')
    .map(({ category_id: id }) => id).sort(), [
      'garment.equipment_slot.base_garment',
      'garment.equipment_slot.outer_garment'
    ]);
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
  ['equipment slot tamper', (candidate) => { candidate.candidate_rows.item_template_category_bindings[1].category_id = 'garment.equipment_slot.invented'; }, 'ACTOR_APPEARANCE_V6_EQUIPMENT_SLOT_DRIFT'],
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
