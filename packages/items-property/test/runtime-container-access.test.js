import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitAuthoredItemPlacementTransition,
  applyRuntimeContainerAccess,
  planRuntimeContainerAccess
} from '../src/index.js';

test('formal open reveals only already materialized direct contents', () => {
  const chest = {
    item_id: 'chest', template_id: 'chest-template', visible: true,
    open_state: 'closed', contents_state: 'contents_hidden',
    placement: { location_ref: 'shore' }
  };
  const sword = {
    item_id: 'sword', template_id: 'sword-template', name: 'меч',
    placement: { container_id: 'chest' }
  };
  const plan = planRuntimeContainerAccess({
    container: chest, access_kind: 'open_and_view'
  });
  const applied = applyRuntimeContainerAccess({
    visible_items: [chest], materialized_items: [chest, sword], plan
  });
  assert.equal(plan.pass, true);
  assert.equal(applied.container.open_state, 'open');
  assert.deepEqual(applied.revealed_refs, ['sword']);
  assert.equal(applied.items.some(({ item_id: ref }) => ref === 'sword'), true);
});

test('locked access requires a successful shared check result', () => {
  const chest = {
    item_id: 'chest', template_id: 'chest-template', visible: true,
    open_state: 'locked', placement: { location_ref: 'shore' }
  };
  assert.deepEqual(planRuntimeContainerAccess({
    container: chest, access_kind: 'open_and_view'
  }).errors.map(({ code }) => code), [
    'ITEM_RUNTIME_CONTAINER_CHECK_REQUIRED'
  ]);
  const granted = planRuntimeContainerAccess({
    container: chest,
    access_kind: 'open_and_view',
    check_result: { outcome: { band: 'success' } }
  });
  assert.equal(granted.pass, true);
  assert.equal(granted.reveal_contents, true);
});

test('authored admission exposes placement transition only', () => {
  const result = admitAuthoredItemPlacementTransition({
    item: { item_id: 'sword', template_id: 'sword-template' },
    placement: { holder_character_id: 'actor', physical_position: 'hands' }
  });
  assert.equal(result.pass, true);
  assert.equal(result.transition_kind, 'placement_only');
  assert.deepEqual(Object.keys(result).sort(), [
    'entity_ref', 'errors', 'ownership', 'pass', 'placement',
    'transition_kind'
  ]);
});

test('formal access does not bypass a denied container state', () => {
  const result = planRuntimeContainerAccess({
    container: {
      item_id: 'chest', template_id: 'chest-template', visible: true,
      open_state: 'closed', access_state: { access: 'forbidden' }
    },
    access_kind: 'open_and_view'
  });
  assert.equal(result.pass, false);
  assert.equal(result.errors[0].code, 'ITEM_RUNTIME_CONTAINER_ACCESS_DENIED');
});
