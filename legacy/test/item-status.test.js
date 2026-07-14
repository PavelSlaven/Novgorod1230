import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayerProfile, buildPropertyLedger } from '../src/world/entities.js';
import { buildInventoryView } from '../src/ui/inventory-view.js';
import { buildPropertyView } from '../src/ui/property-view.js';

test('canonical item statuses use stable enum values in profile and ledger', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [
        {
          id: 'item:player:ring:1',
          label: 'чужое кольцо',
          type: 'item',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'npc-1',
          access: 'restricted',
          discoverability: 'obvious',
          plausibility: 3
        }
      ],
      property_not_carried: [
        {
          id: 'item:player:chest:1',
          label: 'клеть',
          type: 'container',
          placement: 'property',
          owner_id: 'player',
          plausibility: 5
        }
      ],
      equipment: [],
      weapons: [],
      armor: []
    }
  }, { currentLocationId: 'yard' });

  assert.equal(player.items.carried_items[0].legal_status, 'disputed');
  assert.equal(player.items.carried_items[0].discoverability, 5);
  assert.equal(player.items.carried_items[0].plausibility, 3);
  assert.equal(player.items.property_not_carried[0].legal_status, 'ordinary');

  const ledger = buildPropertyLedger([], player);
  assert.equal(ledger.find((item) => item.label === 'чужое кольцо')?.legalStatus, 'disputed');
  assert.equal(ledger.find((item) => item.label === 'чужое кольцо')?.discoverability, 5);
  assert.equal(ledger.find((item) => item.label === 'чужое кольцо')?.plausibility, 3);
  assert.equal(ledger.find((item) => item.label === 'клеть')?.legalStatus, 'ordinary');
});

test('views humanize documented visibility and numeric risk consistently', () => {
  const inventoryView = buildInventoryView({
    items: {
      carried_items: [
        {
          label: 'ключ',
          type: 'tool',
          placement: 'carried',
          access: 'immediate',
          visibility: 'documented',
          discoverability: 'obvious',
          plausibility: 5,
          risk: 3
        }
      ],
      equipment: [],
      weapons: [],
      armor: [],
      property_not_carried: []
    }
  });
  const propertyView = buildPropertyView([
    {
      label: 'клеть',
      type: 'container',
      placement: 'property',
      access: 'not_carried',
      visibility: 'documented',
      discoverability: 'hidden',
      plausibility: 5,
      risk: 3
    }
  ]);

  assert.match(inventoryView.sections[2].lines[0], /видимость известен по владению/);
  assert.match(inventoryView.sections[2].lines[0], /обнаружимость очевидный/);
  assert.match(inventoryView.sections[2].lines[0], /правдоподобие 5\/5/);
  assert.match(inventoryView.sections[2].lines[0], /риск высокий/);
  assert.match(propertyView.items[0].summary, /видимость известен по владению/);
  assert.match(propertyView.items[0].summary, /обнаружимость скрытый/);
  assert.match(propertyView.items[0].summary, /правдоподобие 5\/5/);
  assert.match(propertyView.items[0].summary, /риск высокий/);
});

test('closed containers keep known contents hidden until opened', () => {
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [
        {
          id: 'item:player:box:1',
          label: 'закрытый ларец',
          type: 'container',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'closed_container',
          visible: true,
          weight: 1,
          contents: [
            {
              id: 'item:player:box:ring:1',
              label: 'перстень',
              type: 'item',
              weight: 0.1
            }
          ]
        }
      ],
      equipment: [],
      weapons: [],
      armor: []
    }
  }, { currentLocationId: 'yard' });

  const box = player.items.carried_items[0];
  const ring = box.contents[0];
  const ledger = buildPropertyLedger([], player);
  const ledgerRing = ledger.find((item) => item.label === 'перстень');

  assert.equal(ring.visible, false);
  assert.equal(ring.access, 'closed_container');
  assert.equal(ring.visibility, 'hidden');
  assert.equal(player.items.total_weight, 1.1);
  assert.ok(ledgerRing);
  assert.equal(ledgerRing.visible, false);
  assert.equal(ledgerRing.access, 'closed_container');
  assert.equal(ledgerRing.visibility, 'hidden');
});
