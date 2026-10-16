import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from './check.mjs';

const original = JSON.parse(readFileSync(new URL('./candidate.json', import.meta.url), 'utf8'));

test('candidate covers all physical pairs and route exits without name conflicts', () => {
  assert.deepEqual(validate(original), []);
});

test('coverage, reciprocal identity, kind and minutes are checked', () => {
  const missing = structuredClone(original);
  missing.local_pairs.pop();
  assert.match(validate(missing).join('\n'), /local coverage/);
  const badRoute = structuredClone(original);
  badRoute.world_routes[0].world_route_ids.reverse();
  assert.match(validate(badRoute).join('\n'), /reciprocal route mismatch/);
  const badKind = structuredClone(original);
  badKind.local_pairs[0].line_kind = 'invented_bridge';
  assert.match(validate(badKind).join('\n'), /invalid line_kind/);
  const badMinutes = structuredClone(original);
  badMinutes.world_routes[0].base_minutes += 1;
  assert.match(validate(badMinutes).join('\n'), /source segment minutes mismatch/);
  const badLocalMinutes = structuredClone(original);
  badLocalMinutes.local_pairs[0].base_minutes = 95;
  assert.match(validate(badLocalMinutes).join('\n'), /local minutes outside kind range/);
  const noBoat = structuredClone(original);
  noBoat.local_pairs.find((x) => x.line_kind === 'river_channel').travel_method = undefined;
  assert.match(validate(noBoat).join('\n'), /water line needs boat method/);
});

test('title words of either endpoint, directions and numbers fail authoring', () => {
  const numbered = structuredClone(original);
  numbered.local_pairs[0].name_ru = 'проход 2';
  assert.match(validate(numbered).join('\n'), /ordinal number/);
  const roman = structuredClone(original);
  roman.local_pairs[0].name_ru = 'Проход II';
  assert.match(validate(roman).join('\n'), /ordinal number/);
  for (const name of ['проход два', 'меж двух речных струй', 'по трём руслам']) {
    const numberWord = structuredClone(original);
    numberWord.local_pairs[0].name_ru = name;
    assert.match(validate(numberWord).join('\n'), /number word in name/);
  }
  for (const name of ['тропой с берега', 'тропой от воды', 'по земле на подъём']) {
    const directional = structuredClone(original);
    directional.local_pairs[0].name_ru = name;
    assert.match(validate(directional).join('\n'), /direction-specific name/);
  }
  const destination = structuredClone(original);
  destination.local_pairs[0].name_ru = 'к Вихтую';
  assert.match(validate(destination).join('\n'), /destination-direction preposition/);
  const toward = structuredClone(original);
  toward.local_pairs[0].name_ru = 'в сторону леса';
  assert.match(validate(toward).join('\n'), /destination-direction preposition/);
  const title = structuredClone(original);
  title.local_pairs.find((x) => x.source_pair_id.endsWith('east_side_channel_3')).name_ru = 'по илистому берегу';
  assert.match(validate(title).join('\n'), /place title word илистый/);
  const bothEnds = structuredClone(original);
  bothEnds.local_pairs.find((x) => x.source_pair_id.endsWith('central_current_split_3')).name_ru = 'по быстрой воде';
  assert.match(validate(bothEnds).join('\n'), /place title word быстрый/);
  bothEnds.local_pairs.find((x) => x.source_pair_id.endsWith('central_current_split_3')).name_ru = 'по тихой воде';
  assert.match(validate(bothEnds).join('\n'), /place title word тихий/);
  const hidden = structuredClone(original);
  hidden.world_routes.find((x) => x.route_pair_id === 'cross_g4_14').name_ru = 'у скрытой протоки';
  assert.match(validate(hidden).join('\n'), /place title word скрытая/);
});

test('qualifiers are optional for unique names and distinct for shared names', () => {
  const unneeded = structuredClone(original);
  unneeded.local_pairs[0].qualifier.from_to = 'вверх по течению';
  assert.match(validate(unneeded).join('\n'), /unneeded qualifier/);
  const numbered = structuredClone(original);
  numbered.local_pairs[0].qualifier.from_to = 'русло 2';
  assert.match(validate(numbered).join('\n'), /ordinal number in from_to qualifier/);
  const numberWord = structuredClone(original);
  numberWord.local_pairs[0].qualifier.from_to = 'меж двух берегов';
  assert.match(validate(numberWord).join('\n'), /number word in from_to qualifier/);
  const target = structuredClone(original);
  target.local_pairs[0].qualifier.from_to = 'к Вихтую';
  assert.match(validate(target).join('\n'), /destination-direction preposition in from_to qualifier/);
  const repeated = structuredClone(original);
  repeated.local_pairs[0].qualifier.from_to = repeated.local_pairs[0].name_ru;
  assert.match(validate(repeated).join('\n'), /qualifier repeats name/);
  const leaked = structuredClone(original);
  leaked.local_pairs.find((x) => x.source_pair_id.endsWith('east_side_channel_3')).qualifier.from_to = 'по илистому берегу';
  assert.match(validate(leaked).join('\n'), /qualifier place title word илистый/);
});

test('shared base name needs directional qualifiers at the shared endpoint', () => {
  const shared = structuredClone(original);
  const first = shared.local_pairs[0];
  const adjacent = shared.local_pairs.find((x) => x.source_pair_id !== first.source_pair_id &&
    [x.from_g5_id, x.to_g5_id].includes(first.from_g5_id));
  assert.ok(adjacent);
  const side = adjacent.from_g5_id === first.from_g5_id ? 'from_to' : 'to_from';
  first.name_ru = 'по неглубокой воде';
  adjacent.name_ru = first.name_ru;
  assert.match(validate(shared).join('\n'), /missing duplicate-name qualifier/);
  first.qualifier.from_to = 'вверх по течению';
  adjacent.qualifier[side] = 'вниз по течению';
  assert.deepEqual(validate(shared), []);
  adjacent.qualifier[side] = 'вверх по течению';
  assert.match(validate(shared).join('\n'), /duplicate displayed name/);
});
