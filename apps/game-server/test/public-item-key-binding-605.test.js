import assert from 'node:assert/strict';
import test from 'node:test';
import { successEnvelope } from '../src/http/contracts.js';
import { projectVisibleContextForPlayerPackage } from
  '../src/runtime/lower-dvina-trace-player-safe-visible-context.js';

const item = (entity_id) => ({
  entity_ref: { entity_kind: 'item', entity_id },
  display_label: 'топор'
});

test('issue #605: item public keys bind repeated refs, preserve labels and leave saved context intact', () => {
  // Different instances deliberately share a label: identity belongs to the ref.
  // Separate object values also rule out aliasing as the reason keys agree.
  const raw = {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Во дворе лежат два топора.',
    visible_changes: [],
    sensory_details: [],
    visible_npc: [],
    visible_objects: [
      item('item:known-605'), item('item:independent-605'),
      item('item:known-605'), item('item:independent-605')
    ],
    known_context: [],
    uncertainties: []
  };
  const before = structuredClone(raw);
  const saved = projectVisibleContextForPlayerPackage(raw, { requireScene: true });
  assert.equal(saved.omitted_label_gap_count, 0);
  assert.deepEqual(saved.visible_context.visible_objects, before.visible_objects,
    'named items and their internal refs must survive the existing projection');
  const savedBefore = structuredClone(saved);
  const payload = { screen: { visible_context: saved.visible_context } };
  const response = successEnvelope(payload);
  const [named, independent, repeatedNamed, repeatedIndependent] =
    response.data.screen.visible_context.visible_objects;

  // The oracle is the other occurrence of the same saved ref, not the leaf
  // under assertion. No specific key number or identity across screens is assumed.
  assert.deepEqual(named.entity_ref, repeatedNamed.entity_ref,
    'the named item must keep the key bound to its repeated source ref');
  assert.deepEqual(independent.entity_ref, repeatedIndependent.entity_ref,
    'the independent item must keep the key bound to its repeated source ref');
  assert.notEqual(named.entity_ref.public_key, independent.entity_ref.public_key,
    'different item refs must get distinct keys even when labels match');
  for (const row of [named, independent, repeatedNamed, repeatedIndependent]) {
    assert.deepEqual(Object.keys(row.entity_ref).sort(), ['entity_kind', 'public_key']);
    assert.equal(row.entity_ref.entity_kind, 'item');
    assert.match(row.entity_ref.public_key, /^e[1-9]\d*$/u);
    assert.equal(row.display_label, 'топор', 'the named item label must remain intact');
  }
  assert.doesNotMatch(JSON.stringify(response.data), /item:(?:known|independent)-605/u,
    'internal item IDs must not reach the HTTP copy');
  assert.notStrictEqual(response.data.screen.visible_context, saved.visible_context);
  assert.deepEqual(raw, before, 'the player projection must leave its input intact');
  assert.deepEqual(saved, savedBefore, 'the HTTP boundary must leave saved refs intact');
  assert.deepEqual(successEnvelope(payload).data, response.data,
    'reprojecting the same saved payload must produce the same screen-local keys');
});
