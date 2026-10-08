import assert from 'node:assert/strict';
import test from 'node:test';
import { capturePeoplePanel, captureVisibilityConditions } from '../v17-slice-legs.js';
import { publicEvidence } from '../public-playtest.mjs';

test('public NPC diagnostics report screen keys and keep SQL placement IDs separate', () => {
  const screen = { visible_context: { visible_npc: [
    { entity_ref: { entity_kind: 'npc', public_key: 'e1' }, display_label: 'Еремей' }
  ] } };
  const snapshot = { placements_here: [
    { entity_kind: 'npc', entity_id: 'private-placement-42' }
  ] };

  const panel = capturePeoplePanel(screen, snapshot);
  assert.deepEqual(panel.visible_context_npc_keys, ['e1']);
  assert.deepEqual(panel.placement_npc_ids, ['private-placement-42']);
  assert.equal(Object.hasOwn(panel, 'visible_context_npc_ids'), false);

  const visibility = captureVisibilityConditions(screen);
  assert.deepEqual(visibility.admitted_npc_keys, ['e1']);
  assert.equal(Object.hasOwn(visibility, 'admitted_npc_ids'), false);
});

test('blue wool evidence uses the visible approved item label, not its reference', () => {
  const response = (displayLabel) => ({ screen: {
    visible_context: { visible_objects: [{
      entity_ref: { entity_kind: 'item', public_key: 'e2' },
      ...(displayLabel == null ? {} : { display_label: displayLabel })
    }] }
  } });

  assert.deepEqual(publicEvidence('blue_wool_found', response('клочок синей шерсти')),
    { expected: 'blue_wool_found', pass: true });
  assert.deepEqual(publicEvidence('blue_wool_found', response('клочок шерсти')),
    { expected: 'blue_wool_found', pass: false });
  assert.deepEqual(publicEvidence('blue_wool_found', response(null)),
    { expected: 'blue_wool_found', pass: false });
});
