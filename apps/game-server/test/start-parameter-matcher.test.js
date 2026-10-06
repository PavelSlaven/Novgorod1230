import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchStartParameters } from '../src/runtime/start-parameter-matcher.js';

const CASES_URL = new URL(
  '../../../data/world-catalogs/novgorod/live-world-runtime-v17/start-parameter-extraction-candidate-v1/bench-cases.json',
  import.meta.url
);
const VALUES_URL = new URL(
  '../../../data/world-catalogs/novgorod/live-world-runtime-v17/start-parameter-extraction-candidate-v1/bench-values.json',
  import.meta.url
);
const cases = JSON.parse(await readFile(CASES_URL, 'utf8')).cases;
const valueCases = JSON.parse(await readFile(VALUES_URL, 'utf8')).cases;
const valueOracle = new Map(valueCases.map((example) => [example.id,
  example.expected_values]));

test('matches the frozen 16 start-parameter cases with source spans', () => {
  assert.equal(cases.length, 16);
  assert.equal(valueCases.length, cases.length);
  for (const example of cases) {
    const result = matchStartParameters(example.input);
    assert.equal(result.schema,
      'rus.game_server.start_parameter_extraction.v1', example.id);
    assert.deepEqual(result.vocabulary_ref, {
      catalog_id: 'start-parameter-extraction-candidate-v1',
      revision: 1
    });
    for (const [slot, expected] of Object.entries(example.expected)) {
      const actual = result.slots[slot];
      assert.equal(actual.state, expected, `${example.id} ${slot}`);
      assert.equal(actual.value === null,
        actual.state !== 'candidate_match', `${example.id} ${slot} value`);
      for (const evidence of actual.evidence) {
        assert.ok(evidence.start >= 0 && evidence.end <= example.input.length);
        assert.equal(example.input.slice(evidence.start, evidence.end),
          evidence.text, `${example.id} ${slot} evidence`);
      }
    }
    const expectedValues = valueOracle.get(example.id);
    assert.deepEqual(Object.keys(expectedValues).sort(),
      ['occupation', 'region', 'season', 'social_position']);
    for (const [slot, expected] of Object.entries(expectedValues)) {
      assert.equal(result.slots[slot].value, expected,
        `${example.id} ${slot} value`);
    }
    assert.deepEqual(Object.keys(result.slots).sort(),
      ['occupation', 'region', 'season', 'social_position']);
    assert.equal(result.compatibility.state, 'no_compatible_start');
    assert.equal(result.compatibility.reason,
      'no_approved_compatible_profile');
    assert.equal(Object.keys(result).some((key) => /_id$/u.test(key)), false);
    assert.equal(JSON.stringify(result).includes('region_novgorod_land'), false);
  }
});

test('value oracle distinguishes different allowed values with the same state',
  () => {
    const forestWorker = matchStartParameters(cases.find(({ id }) =>
      id === 'C13').input);
    const boatman = matchStartParameters(cases.find(({ id }) =>
      id === 'C15').input);
    assert.equal(forestWorker.slots.occupation.state, 'candidate_match');
    assert.equal(boatman.slots.occupation.state, 'candidate_match');
    assert.equal(valueOracle.get('C13').occupation, 'лесной промысловик');
    assert.equal(valueOracle.get('C15').occupation, 'лодочник');
    assert.notEqual(forestWorker.slots.occupation.value,
      boatman.slots.occupation.value);
    assert.equal(forestWorker.slots.occupation.value,
      valueOracle.get('C13').occupation);
    assert.equal(boatman.slots.occupation.value,
      valueOracle.get('C15').occupation);
  });

test('does not extract quoted values and keeps typed gaps out of compatibility', () => {
  const result = matchStartParameters('Отец сказал: «я рыбак»; я хочу иной путь.');
  assert.equal(result.slots.occupation.state, 'missing');
  assert.deepEqual(result.slots.occupation.evidence, []);
  assert.equal(result.compatibility.state, 'no_compatible_start');
});
