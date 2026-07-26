import assert from 'node:assert/strict';
import test from 'node:test';

import {
  recognizeFirstPlayableSemanticCommand
} from '../src/runtime/first-playable-semantic-recognizer.js';

const base = {
  partyId: 'party',
  actorId: 'player',
  baseStateVersion: 3,
  requestId: 'request',
  idempotencyKey: 'idem',
  dependencyPins: [{ id: 'world', version: 2 }],
  visibleEntityRefs: ['npc:fisher', 'resource:visible', 'transport:player_boat']
};

test('recognizer seals deterministic Russian command', () => {
  const result = recognizeFirstPlayableSemanticCommand({
    ...base,
    rawText: 'Набрать 1000 мл воды'
  });

  assert.equal(result.ok, true);
  assert.equal(result.command.verb, 'collect_resource');
  assert.deepEqual(result.command.quantity, {
    numerator: 1000,
    denominator: 1,
    unit: 'millilitre'
  });
  assert.match(result.command.canonical_digest, /^[a-f0-9]{64}$/u);
});

test('hidden target and unknown input fail without time or mutation', () => {
  const hidden = recognizeFirstPlayableSemanticCommand({
    ...base,
    visibleEntityRefs: [],
    rawText: 'Поговорить с рыбаком'
  });
  const unknown = recognizeFirstPlayableSemanticCommand({
    ...base,
    rawText: 'Телепортироваться'
  });

  assert.equal(hidden.code, 'semantic_target_not_visible');
  assert.equal(hidden.elapsed_minutes, 0);
  assert.deepEqual(hidden.mutations, []);
  assert.equal(unknown.code, 'semantic_command_unrecognized');
});

test('rest accepts only approved bounded durations', () => {
  assert.equal(recognizeFirstPlayableSemanticCommand({
    ...base,
    rawText: 'Отдохнуть 60 минут'
  }).ok, true);
  assert.equal(recognizeFirstPlayableSemanticCommand({
    ...base,
    rawText: 'Отдохнуть 45 минут'
  }).ok, false);
});
