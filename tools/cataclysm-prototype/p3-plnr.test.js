import assert from 'node:assert/strict';
import test from 'node:test';
import { buildP3TurnOperations, mapP3TurnOperationToNative, runP3TurnStep } from './p3-boundary.js';
import { replyFrame } from './p3-test-frames.js';

function scene() {
  return { ...replyFrame({ turn: 3 }), items: [
    { item_ref: 'item:21', item_uid: '21', type: 'flint_steel', label: 'кресало',
      holder: '7', use_methods: ['firestarter'], use_method_label: 'Быстро развести огонь' },
    { item_ref: 'item:22', item_uid: '22', type: 'leather_belt', label: 'кожаный пояс',
      holder: '7', use_methods: ['holster'], use_method_label: 'Использовать кобуру' },
    { item_ref: 'item:23', item_uid: '23', type: 'flint_steel', label: 'кресало',
      position: [61, 60, 0], use_methods: ['firestarter'],
      use_method_label: 'Быстро развести огонь' },
    { item_ref: 'item:24', item_uid: '24', type: 'multi', label: 'инструмент',
      holder: '7', use_methods: ['activate', 'other'], use_method_label: 'Использовать' },
    { item_ref: 'item:25', item_uid: '25', type: 'legacy', label: 'старый предмет',
      holder: '7', use_methods: ['activate'] },
    { item_ref: 'item:26', item_uid: '26', type: 'raw_label', label: 'предмет',
      holder: '7', use_methods: ['activate'], use_method_label: 'activate' }
  ], targets: [
    { target_ref: 'tile:east', position: [61, 60, 0], terrain: 't_floor',
      terrain_label: 'пол' },
    { target_ref: 'tile:west', position: [59, 60, 0], terrain: 't_floor',
      terrain_label: 'пол' }
  ] };
}

test('planner offers one targetless native use for each carried item with one named method', () => {
  const operations = buildP3TurnOperations(scene());
  const uses = operations.filter(({ op }) => op === 'request_item_use');
  assert.deepEqual(uses.map(({ item_ref, target_refs }) => [item_ref, target_refs]),
    [['item:21', []], ['item:22', []]]);
  assert.match(operations.find(({ op }) => op === 'request_activity').description, /[А-Яа-яЁё]/u);
});

test('planner mapper sends method only and refuses preselected item targets', () => {
  const observation = scene();
  const operation = buildP3TurnOperations(observation).find(({ op }) => op === 'request_item_use');
  const mapped = mapP3TurnOperationToNative(operation, observation);
  assert.deepEqual(mapped.args, { method: 'firestarter' });
  assert.deepEqual(mapped.references, { items: 'item:21' });
  assert.throws(() => mapP3TurnOperationToNative({ ...operation,
    target_refs: ['tile:east'] }, observation), /P3_ITEM_TARGET_REFS_INVALID/u);
});

test('planner projection exposes names and holder relation without native identifiers', async () => {
  let seen;
  await assert.rejects(runP3TurnStep({ intent: 'Осмотрись', observation: scene(),
    nativeAdapter: { writeOperationRequest: async () => {},
      readOperationReadback: async () => ({}) }, operationId: 'plnr-projection',
    turnStepModel: async request => { seen = request; throw new Error('captured'); } }),
  /captured/u);
  const state = seen.player_safe_state;
  assert.ok(Array.isArray(state.items), 'P3 player_safe_state.items is missing');
  assert.equal(state.actor_id, seen.actor.actor_ref);
  const carried = state.items.find(({ item_id }) => item_id === 'item:21');
  assert.equal(carried.name, 'кресало');
  assert.equal(carried.use_method_label, 'Быстро развести огонь');
  assert.equal(carried.placement.holder_character_id, seen.actor.actor_ref);
  for (const item of state.items) {
    assert.equal(item.placement.holder_character_id, seen.actor.actor_ref);
  }
  const entities = state.visible_entities;
  assert.equal(entities.some(({ item_ref }) => item_ref === 'item:21'), false);
  assert.equal(entities.some(({ carried_by_ref }) =>
    carried_by_ref === seen.actor.actor_ref), false);
  const ground = entities.find(({ item_ref }) => item_ref === 'item:23');
  assert.equal(ground.entity_ref, '23');
  const target = entities.find(({ target_ref }) => target_ref === 'tile:east');
  assert.equal(target.terrain_label, 'пол');
  for (const entity of [...entities, ...state.items]) {
    for (const key of ['item_uid', 'holder', 'use_methods', 'actor_id', 'terrain', 'type']) {
      assert.equal(Object.hasOwn(entity, key), false, `${key} leaked`);
    }
  }
});
