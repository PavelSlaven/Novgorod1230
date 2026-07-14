import test from 'node:test';
import assert from 'node:assert/strict';
import { countOccupiedHands, humanizePhysicalAccess, isQuickAccessibleItem, isUsableOwnedResource, physicalAccessTier } from '../src/world/item-access.js';

test('item access normalizes documented russian placement and access phrases', () => {
  assert.equal(physicalAccessTier({ placement: 'на теле' }), 'quick');
  assert.equal(physicalAccessTier({ placement: 'за поясом' }), 'quick');
  assert.equal(physicalAccessTier({ access: 'глубоко в мешке' }), 'deep_bag');
  assert.equal(physicalAccessTier({ access: 'в закрытом контейнере' }), 'closed_container');
  assert.equal(physicalAccessTier({ access: 'не при персонаже' }), 'not_carried');
});

test('item access humanizes documented russian phrases consistently', () => {
  assert.equal(humanizePhysicalAccess({ placement: 'на теле' }), 'можно быстро достать');
  assert.equal(humanizePhysicalAccess({ access: 'глубоко в мешке' }), 'нужно время на поиск');
  assert.equal(humanizePhysicalAccess({ access: 'в закрытом контейнере' }), 'нужно открыть контейнер');
  assert.equal(isQuickAccessibleItem({ placement: 'за поясом' }), true);
  assert.equal(isQuickAccessibleItem({ access: 'не при персонаже' }), false);
});

test('item access counts spear-like weapons as two-handed for occupied hands', () => {
  const actor = {
    items: {
      weapons: [
        { label: 'копьё', type: 'weapon', placement: 'carried', access: 'immediate' }
      ],
      equipment: [],
      carried_items: []
    }
  };

  assert.equal(countOccupiedHands(actor), 2);
});

test('usable owned resource excludes foreign or disputed quick items', () => {
  assert.equal(isUsableOwnedResource({ placement: 'за поясом', owner_id: 'player', holder_id: 'player' }), true);
  assert.equal(isUsableOwnedResource({ placement: 'за поясом', access: 'borrowed', owner_id: 'npc-1', holder_id: 'player' }), false);
  assert.equal(isUsableOwnedResource({ placement: 'за поясом', legal_status: 'disputed', owner_id: 'npc-1', holder_id: 'player' }), false);
});
