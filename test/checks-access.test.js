import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldState } from '../src/world/state.js';
import { buildActionCheck } from '../src/world/checks.js';
import { planMasterTurnSync, buildMasterFrame } from '../src/world/master.js';
import { summarizeArmorProtection } from '../src/world/combat-model.js';

test('combat ignores weapon buried in a container', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.items = {
    carried_items: [
      {
        id: 'item:player:bag:1',
        label: 'мешок',
        type: 'container',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 1,
        contents: [
          {
            id: 'item:player:knife:1',
            label: 'нож',
            type: 'weapon',
            placement: 'contained',
            holder_id: 'player',
            owner_id: 'player',
            access: 'contained',
            weight: 0.2
          }
        ]
      }
    ],
    equipment: [],
    weapons: [
      {
        id: 'item:player:knife:1',
        label: 'нож',
        type: 'weapon',
        placement: 'contained',
        holder_id: 'player',
        owner_id: 'player',
        access: 'contained',
        weight: 0.2
      }
    ],
    armor: [],
    total_weight: 1.2,
    load_category: 'light',
    property_not_carried: []
  };

  const frame = buildMasterFrame(world, 'Я нападаю');
  const check = buildActionCheck(world, planMasterTurnSync(world, 'Я нападаю').frame);

  assert.deepEqual(frame.combat.playerWeapons, []);
  assert.equal(check.profile.equipmentLabel, 'нет');
  assert.ok(!check.modifiers.some((item) => item.label.startsWith('оружие (')));
});

test('healing suffers when both hands are occupied', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.bleeding = 1;
  world.player.items = {
    carried_items: [
      {
        id: 'item:player:spear:1',
        label: 'копьё',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 2
      },
      {
        id: 'item:player:bag:1',
        label: 'мешок',
        type: 'container',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 1,
        contents: [
          {
            id: 'item:player:bandage:1',
            label: 'бинт',
            type: 'tool',
            placement: 'contained',
            holder_id: 'player',
            owner_id: 'player',
            access: 'contained',
            weight: 0.1
          }
        ]
      }
    ],
    equipment: [
      {
        id: 'item:player:shield:1',
        label: 'щит',
        type: 'armor',
        placement: 'equipped',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 3
      }
    ],
    weapons: [
      {
        id: 'item:player:spear:1',
        label: 'копьё',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 2
      }
    ],
    armor: [
      {
        id: 'item:player:shield:1',
        label: 'щит',
        type: 'armor',
        placement: 'equipped',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 3
      }
    ],
    total_weight: 6,
    load_category: 'light',
    property_not_carried: []
  };

  const check = buildActionCheck(world, planMasterTurnSync(world, 'Лечу рану').frame);

  assert.equal(check.profile.occupiedHands, 2);
  assert.equal(check.profile.equipmentLabel, 'нет');
  assert.ok(check.modifiers.some((item) => item.label === 'обе руки заняты' && item.value === -2));
});

test('healing check ignores bandages sealed in a closed container', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.bleeding = 1;
  world.player.items = {
    carried_items: [
      {
        id: 'item:player:box:1',
        label: 'ларец',
        type: 'container',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 1
      },
      {
        id: 'item:player:bandage:1',
        label: 'бинт',
        type: 'tool',
        placement: 'contained',
        holder_id: 'player',
        owner_id: 'player',
        access: 'closed_container',
        visible: false,
        weight: 0.1
      }
    ],
    equipment: [],
    weapons: [],
    armor: [],
    total_weight: 1.1,
    load_category: 'light',
    property_not_carried: []
  };

  const check = buildActionCheck(world, planMasterTurnSync(world, 'Лечу рану').frame);

  assert.equal(check.profile.equipmentLabel, 'нет');
  assert.ok(check.modifiers.some((item) => item.label === 'нехватка лечебных средств' && item.value === -1));
  assert.ok(!check.modifiers.some((item) => item.label === 'есть перевязочный материал'));
});

test('combat check gives a small bonus for a ready suitable weapon', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.items = {
    carried_items: [],
    equipment: [],
    weapons: [
      {
        id: 'item:player:spear:1',
        label: 'копьё',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'player',
        owner_id: 'player',
        access: 'immediate',
        weight: 2
      }
    ],
    armor: [],
    total_weight: 2,
    load_category: 'light',
    property_not_carried: []
  };

  const check = buildActionCheck(world, planMasterTurnSync(world, 'Я нападаю').frame);

  assert.equal(check.profile.equipmentLabel, 'копьё');
  assert.equal(check.profile.equipmentModifier, 1);
});

test('plain clothing does not count as armor but padded clothing does', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const target = world.npcs.find((npc) => (npc.locationId ?? npc.homeLocation) === world.currentLocationId);
  assert.ok(target);

  target.items = {
    carried_items: [],
    equipment: [],
    weapons: [],
    armor: [
      {
        id: 'item:npc:cloth:1',
        label: 'рубаха',
        type: 'clothing',
        placement: 'equipped',
        holder_id: target.id,
        owner_id: target.id,
        access: 'immediate',
        weight: 1
      }
    ],
    total_weight: 1,
    load_category: 'light'
  };

  const plainFrame = buildMasterFrame(world, 'Я бью');
  assert.equal(summarizeArmorProtection(target, plainFrame.world.combat.attackFocus).value, 0);

  target.items.armor[0].label = 'стёганая рубаха';
  const paddedFrame = buildMasterFrame(world, 'Я бью');

  assert.equal(summarizeArmorProtection(target, paddedFrame.world.combat.attackFocus).value, 2);
  assert.equal(paddedFrame.world.combat.target?.armorProtection, 2);
});
