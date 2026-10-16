import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { validateControlledVocabularyRegistry } from '../src/spatial-v3/controlled-vocabularies.js';

const load = async (version) => JSON.parse(await readFile(`data/contracts/spatial-v3/controlled-vocabularies.v${version}.json`, 'utf8'));
const idsOf = (registry, pseudoType) => registry.vocabularies.find((row) => row.pseudo_type === pseudoType).values.map(({ id }) => id);

test('registry v5 is valid and reproduced by its generator', async () => {
  const v5 = await load(5);
  assert.equal(v5.version, '5.0.0');
  assert.deepEqual(validateControlledVocabularyRegistry(v5), { ok: true, errors: [] });
  assert.equal(v5.vocabulary_count, 23);
  assert.equal(v5.value_count, 531);
  const check = spawnSync(process.execPath, ['tools/spatial-v3/generate-line-vocabularies.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
});

test('registry v5 only adds to v4 and keeps v1-v4 immutable', async () => {
  const [v4, v5] = [await load(4), await load(5)];
  assert.equal(v4.version, '4.0.0');
  assert.equal(v4.vocabulary_count, 21);
  assert.equal(v4.value_count, 501);
  const added = { controlled_direction_context: 3, controlled_movement_method: 1, controlled_entity_kind: 3 };
  for (const row of v4.vocabularies) {
    const before = idsOf(v4, row.pseudo_type);
    const after = idsOf(v5, row.pseudo_type);
    assert.deepEqual(after.filter((id) => before.includes(id)), before, `${row.pseudo_type}: v4 values preserved in order`);
    assert.equal(after.length - before.length, added[row.pseudo_type] ?? 0, `${row.pseudo_type}: additions`);
  }
  assert.deepEqual(idsOf(v5, 'controlled_direction_context').filter((id) => !idsOf(v4, 'controlled_direction_context').includes(id)),
    ['direction.along_road', 'direction.along_shore', 'direction.toward_landmark']);
  assert.deepEqual(idsOf(v5, 'controlled_movement_method').filter((id) => !idsOf(v4, 'controlled_movement_method').includes(id)), ['movement_method.improvised_float']);
  assert.deepEqual(idsOf(v5, 'controlled_entity_kind').filter((id) => !idsOf(v4, 'controlled_entity_kind').includes(id)),
    ['canonical_g5_connection_binding', 'line_kind_alternative_method', 'line_kind_profile']);
  assert.equal(idsOf(v5, 'controlled_line_kind').length, 18);
  assert.ok(idsOf(v5, 'controlled_line_kind').every((id) => id.startsWith('line.')));
  assert.ok(idsOf(v5, 'controlled_line_kind').includes('line.winter_road') && idsOf(v5, 'controlled_line_kind').includes('line.open_water'));
  assert.deepEqual(idsOf(v5, 'controlled_duration_band'),
    ['duration_band.about_hour', 'duration_band.few_minutes', 'duration_band.half_day', 'duration_band.several_hours', 'duration_band.short_while']);
  for (const version of [1, 2, 3]) {
    const older = await load(version);
    assert.equal(older.version, `${version}.0.0`);
    assert.deepEqual(validateControlledVocabularyRegistry(older), { ok: true, errors: [] });
  }
});
