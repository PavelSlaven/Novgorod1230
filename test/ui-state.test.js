import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldState } from '../src/world/state.js';
import { buildUiState, buildPlayerUiState, buildDebugUiState } from '../src/ui-state.js';
import { buildInventoryView } from '../src/ui/inventory-view.js';
import { buildNpcProfile, buildPlayerProfile, buildPropertyLedger } from '../src/world/entities.js';
import { recordWorldEvent } from '../src/world/event-log.js';

const centralEurope1241Seed = {
  startText: 'переправа и двор',
  history: {
    year: 1241,
    season: 'весна',
    regionHint: 'Центральная Европа, Силезия'
  },
  region: { name: 'Силезия' },
  historicalFrame: {
    year: 1241,
    regionName: 'Силезия',
    regionHint: 'Центральная Европа, Силезия',
    season: 'весна'
  }
};

test('ui state exposes the current world snapshot for the browser', () => {
  const world = createWorldState(centralEurope1241Seed);
  const ui = buildDebugUiState(world);

  assert.match(ui.clockText, /1241 г\./);
  assert.match(ui.clockText, /\d{2}:\d{2}$/);
  assert.ok(!ui.clockText.startsWith('День 1'));
  assert.ok(ui.place.name.length > 0);
  assert.ok(ui.debug.cluster.graph.nodes.length > 0);
  assert.ok(ui.currentPosition);
  assert.equal('cluster' in ui, false);
  assert.equal('riskAudit' in ui, false);
  assert.equal('lastCheck' in ui, false);
  assert.ok(Array.isArray(ui.visibleNpcs));
  assert.ok(ui.player.health > 0);
  assert.equal(ui.player.satiety, ui.player.states.satiety);
  assert.equal(ui.player.vigor, ui.player.states.vigor);
  assert.equal('hunger' in ui.player, false);
  assert.equal('fatigue' in ui.player, false);
  assert.equal('thirst' in ui.player, false);
  assert.ok(ui.player.states);
  assert.ok(Array.isArray(ui.player.mechanics.attributes));
  assert.ok(ui.player.mechanics.summaryText.includes('Характеристики'));
  assert.ok(ui.player.items);
  assert.equal(ui.player.observedActorProfile.identity.trueStatus, null);
  assert.equal(ui.visibleNpcs[0]?.actorProfile?.identity?.trueStatus ?? null, null);
  assert.ok(ui.visibleNpcs[0]?.actorProfile?.work?.routine);
  assert.ok(ui.visibleNpcs[0]?.actorProfile?.mind?.heard);
  assert.equal(ui.scene, undefined);
  assert.ok(ui.place.profile?.mood ?? ui.visibleScene.mood);
  assert.ok(ui.visibleScene.markup.atmosphere.rhythm);
  assert.ok(Array.isArray(ui.visibleScene.markup.entities));
  assert.ok(Array.isArray(ui.visibleScene.markup.highlights));
  assert.ok(Array.isArray(ui.visibleScene.markup.notes));
  assert.ok(ui.debug.cluster.graph.edges.length >= 0);
  assert.equal(ui.historical.regionalContext.atlasIndex, undefined);
  assert.ok(ui.historical.regionalContext.current.name.length > 0);
  assert.deepEqual(ui.historical.regionalContext.current.historicalTimeline.after1237, []);
  assert.deepEqual(ui.historical.regionalContext.current.sources, []);
  assert.equal('confidence' in ui.historical.regionalContext.current, false);
  assert.equal('catalogSize' in ui.historical.regionalContext, false);
  assert.equal(ui.historical.regionalContext.current.coordinates, null);
  assert.equal('hiddenFromCharacters' in ui.historical.regionalContext.current.knowledgeBoundary, false);
  assert.equal('sourceLog' in ui.historical, false);
  assert.ok(Array.isArray(ui.historical.historicalPeople));
  assert.ok(ui.historical.historicalPeople.some((person) => person.influenceMode));
});

test('ui state hides internal debug data by default', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const ui = buildUiState(world);

  assert.equal('debug' in ui, false);
  assert.equal('technicalJournal' in ui, false);
  assert.equal('relationships' in ui, false);
  assert.equal('propertyLedger' in ui, false);
  assert.equal('social' in ui, false);
  assert.equal('provider' in ui, false);
  assert.equal('currentPosition' in ui, false);
  assert.ok(ui.orientation);
  assert.equal(typeof ui.orientation.locationId === 'string' || ui.orientation.locationId === null, true);
  assert.equal('knowledge_map' in ui.player, false);
  assert.equal('memory_profile' in ui.player, false);
  assert.equal('goals_profile' in ui.player, false);
  assert.equal('property_and_access' in ui.player, false);
  assert.equal('relations' in ui.player, false);
  assert.equal('position' in ui.player, false);
  assert.equal('start_scene' in ui.player, false);
  assert.equal('actorProfile' in ui.player, false);
  assert.ok(ui.routeContext);
  assert.equal(typeof ui.routeContext.lastRouteId === 'string' || ui.routeContext.lastRouteId === null, true);
  assert.ok(ui.propertyView);
  assert.ok(ui.socialSummary);
});

test('ui state keeps hidden npc motives out of the public payload', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const npc = buildNpcProfile({
    id: 'npc-key',
    name: 'Степан',
    role: 'староста',
    locationId: world.currentLocationId,
    profileLevel: 'key',
    knowledgeHidden: ['тайный долг'],
    trueStatus: 'тайный союзник',
    reasonHere: 'следит за двором'
  }, world.currentLocationId, 0, world.player);

  world.npcs = [npc];

  const ui = buildUiState(world);

  assert.equal('debug' in ui, false);
  assert.equal('technicalJournal' in ui, false);
  assert.equal('relationships' in ui, false);
  assert.equal('propertyLedger' in ui, false);
  assert.equal('social' in ui, false);
  assert.equal(ui.visibleNpcs[0].profileLevel, 'key');
  assert.equal('trueStatus' in ui.visibleNpcs[0], false);
  assert.equal('trueStatus' in ui.visibleNpcs[0].actorProfile.identity, false);
  assert.equal('hidden' in ui.visibleNpcs[0].actorProfile.mind, false);
  assert.equal('hidden' in ui.visibleNpcs[0].observedActorProfile.mind, false);
});

test('ui state prefers canonical player states over legacy vitals', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.states.satiety = 87;
  world.player.states.vigor = 64;
  world.player.hunger = 1;
  world.player.fatigue = 2;

  const ui = buildUiState(world);

  assert.equal(ui.player.states.satiety, 87);
  assert.equal(ui.player.states.vigor, 64);
  assert.equal('hunger' in ui.player, false);
  assert.equal('fatigue' in ui.player, false);
});

test('ui state exposes character mechanics summaries for the main screen', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.attributes = {
    strength: 14,
    agility: 12,
    endurance: 10,
    reason: 11,
    attention: 13,
    influence: 9
  };
  world.player.skill_bonuses = {
    athletics: 2,
    observation: 1,
    communication: 0
  };

  const ui = buildUiState(world);

  assert.equal(ui.player.mechanics.attributes.length, 6);
  assert.deepEqual(ui.player.mechanics.attributes[0], {
    key: 'strength',
    label: 'Сила',
    value: 14,
    bonus: 2
  });
  assert.equal(ui.player.mechanics.skillBonuses.length, 2);
  assert.match(ui.player.mechanics.summaryText, /Характеристики: Сила 14 \(\+2\)/);
  assert.match(ui.player.mechanics.summaryText, /Навыки: Атлетика \+2, Наблюдательность \+1/);
});

test('ui state exposes npc visible marks and availability windows', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.npcs = [
    buildNpcProfile({
      id: 'npc-visible',
      name: 'Люба',
      role: 'служанка',
      body: {
        visible_marks: ['шрам на щеке'],
        active_conditions: ['устала']
      },
      visibleMarks: ['шрам на щеке'],
      activeConditions: ['устала'],
      availabilityWindow: 'до сумерек',
      movementWindow: 'у печи'
    }, world.currentLocationId ?? world.current_position?.location_id ?? null, 0, world.player, world.current_position)
  ];

  const ui = buildUiState(world);
  const npc = ui.visibleNpcs[0];

  assert.ok(npc.visibleMarks.includes('шрам на щеке'));
  assert.ok(npc.activeConditions.includes('устала'));
  assert.equal(npc.availabilityWindow, 'до сумерек');
  assert.equal(npc.movementWindow, 'у печи');
  assert.ok(npc.actorProfile.body.visible_marks.includes('шрам на щеке'));
  assert.ok(npc.actorProfile.body.active_conditions.includes('устала'));
});

test('ui state surfaces the documented start scene summary', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.start_scene = {
    reason_here: 'ждёт паром у двора',
    visible_situation: 'двор у переправы',
    nearby_people: ['староста', 'конюх'],
    immediate_tension: 'ворота скоро закроют',
    intro_prose: 'Ты стоишь у двора и ждёшь переправу.'
  };

  const ui = buildUiState(world);

  assert.deepEqual(ui.player.startScene, {
    reasonHere: 'ждёт паром у двора',
    visibleSituation: 'двор у переправы',
    nearbyPeople: ['староста', 'конюх'],
    immediateTension: 'ворота скоро закроют',
    introProse: 'Ты стоишь у двора и ждёшь переправу.'
  });
  assert.equal('start_scene' in ui.player, false);
});

test('ui state ignores legacy vitals when canonical states are missing', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  delete world.player.states;
  delete world.player.satiety;
  delete world.player.vigor;
  world.player.hunger = 3;
  world.player.fatigue = 7;
  world.player.sleep = 9;

  const ui = buildUiState(world);

  assert.equal(ui.player.states.health, 100);
  assert.equal(ui.player.states.satiety, 100);
  assert.equal(ui.player.states.vigor, 100);
  assert.equal(ui.player.satiety, 100);
  assert.equal(ui.player.vigor, 100);
  assert.equal('hunger' in ui.player, false);
  assert.equal('fatigue' in ui.player, false);
});

test('ui state builds a compact inventory summary for the main screen', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.body = {
    ...(world.player.body ?? {}),
    clothing: 'рубаха'
  };
  world.player.items = {
    carried_items: [{ label: 'монета' }],
    equipment: [{ label: 'плащ' }],
    weapons: [{ label: 'нож' }],
    armor: [],
    total_weight: 4.1,
    load_category: 'moderate',
    property_not_carried: []
  };

  const ui = buildUiState(world);

  assert.equal(ui.player.items.summaryText, 'В руках: нож · На теле: плащ, рубаха · Груз: средний');
  assert.equal(ui.player.items.summary.hands, 'нож');
  assert.equal(ui.player.items.summary.body, 'плащ, рубаха');
  assert.equal(ui.player.items.summary.load, 'средний');
  assert.equal(ui.player.items.weightText, 'Вес: 4.1 кг');
});

test('ui state uses documented overload wording in compact inventory summary', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.items = {
    carried_items: [],
    equipment: [],
    weapons: [{ label: 'тюк' }],
    armor: [],
    total_weight: 30,
    load_category: 'overloaded',
    property_not_carried: []
  };

  const ui = buildUiState(world);

  assert.match(ui.player.items.summaryText, /Груз: сверх предела/);
});

test('ui state prefers canonical items over legacy inventory arrays', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    inventory: ['legacy knife'],
    property: ['legacy chest'],
    items: {
      carried_items: [
        {
          id: 'item:player:topor:1',
          label: 'плотницкий топор',
          type: 'weapon',
          placement: 'carried',
          holder_id: 'player',
          owner_id: 'player',
          access: 'immediate',
          risk: 0,
          visible: true,
          weight: 2
        }
      ],
      property_not_carried: [
        {
          id: 'item:player:chest:1',
          label: 'клеть',
          type: 'container',
          placement: 'property',
          holder_id: null,
          owner_id: 'player',
          access: 'not_carried',
          risk: 1,
          visible: true,
          weight: 12
        }
      ],
      equipment: [],
      weapons: [],
      armor: [],
      total_weight: 2,
      load_category: 'light'
    }
  }, { currentLocationId: world.currentLocationId });

  const ui = buildUiState(world);

  assert.equal(ui.player.inventory[0].label, 'плотницкий топор');
  assert.equal(ui.player.property[0].label, 'клеть');
  assert.equal(ui.player.inventory.some((item) => item === 'legacy knife'), false);
  assert.equal(ui.player.property.some((item) => item === 'legacy chest'), false);
  assert.equal(ui.player.observedActorProfile.property.carried[0].label, 'плотницкий топор');
  assert.equal(ui.player.observedActorProfile.property.outsideAccess[0].label, 'клеть');
});

test('inventory view keeps canonical empty item blocks instead of legacy arrays', () => {
  const view = buildInventoryView({
    items: {
      carried_items: [],
      weapons: [],
      armor: [],
      equipment: [],
      property_not_carried: []
    },
    inventory: ['legacy knife'],
    property: ['legacy chest'],
    body: {
      clothing: 'рубаха'
    }
  });

  assert.equal(view.sections.find((section) => section.key === 'carried')?.lines.length, 0);
  assert.equal(view.sections.some((section) => section.key === 'property'), false);
  assert.ok(view.summaryText.includes('Груз:'));
});

test('ui state trims background npc profiles and keeps key profiles observable only', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const currentLocationId = world.currentLocationId;
  const backgroundNpc = buildNpcProfile({
    id: 'npc-bg',
    name: 'Степан',
    role: 'крестьянин',
    locationId: currentLocationId,
    profileLevel: 'background',
    family: ['тайная родня'],
    knowledgeHidden: ['спрятанный долг'],
    memory: ['давний спор'],
    property: ['изба'],
    inventory: ['мешок'],
    schedule: ['стоит у ворот']
  }, currentLocationId, 0, world.player);
  const keyNpc = buildNpcProfile({
    id: 'npc-key',
    name: 'староста',
    role: 'староста',
    locationId: currentLocationId,
    profileLevel: 'key',
    family: ['родня'],
    knowledgeHidden: ['важная тайна'],
    memory: ['помнит долг'],
    property: ['амбар'],
    inventory: ['ключ'],
    schedule: ['разговаривает с людьми']
  }, currentLocationId, 1, world.player);

  world.npcs = [backgroundNpc, keyNpc];

  const ui = buildUiState(world);

  assert.equal(backgroundNpc.profileLevel, 'background');
  assert.equal(keyNpc.profileLevel, 'key');
  assert.equal('kinship' in ui.npcs[0].actorProfile, false);
  assert.equal('kinship' in ui.npcs[1].actorProfile, false);
  assert.equal(ui.npcs[0].actorProfile.mind?.memory?.length ?? 0, 0);
  assert.equal('hidden' in ui.npcs[0].actorProfile.mind, false);
  assert.equal('hidden' in ui.npcs[1].actorProfile.mind, false);
  assert.ok(ui.npcs[1].family.length > 0);
});

test('ui state does not infer npc profile depth from role or location when level is missing', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.npcs = [
    {
      id: 'npc-raw',
      name: 'Степан',
      role: 'староста',
      locationId: world.currentLocationId,
      inventory: ['ключ'],
      memory: ['долг'],
      knowledgeHidden: ['тайна']
    }
  ];

  const ui = buildUiState(world);

  assert.equal(ui.npcs[0].profileLevel, 'background');
  assert.equal('kinship' in ui.npcs[0].actorProfile, false);
  assert.equal('hidden' in ui.npcs[0].actorProfile.mind, false);
});

test('ui state keeps typed property ledger fields in npc previews and journal text', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const currentLocationId = world.currentLocationId;
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    property: ['клеть']
  }, { currentLocationId });
  const npc = buildNpcProfile({
    id: 'npc-ledger',
    name: 'Степан',
    role: 'староста',
    locationId: currentLocationId,
    inventory: [
      {
        id: 'item:npc-ledger:key:1',
        label: 'ключ от амбара',
        type: 'tool',
        material: 'железо',
        condition: 'изношен',
        size: 'малый',
        placement: 'carried',
        holder_id: 'npc-ledger',
        owner_id: 'npc-ledger',
        access: 'immediate',
        visibility: 'visible',
        discoverability: 'obvious',
        legalStatus: 'ordinary',
        function: 'открывает амбар',
        value: 'низкая',
        risk: 'low',
        marks: ['клеймо двора', 'царапина на рукояти'],
        rights: ['носить'],
        weight: 0.2,
        contents: [{ label: 'бирка' }]
      }
    ]
  }, currentLocationId, 0, player);

  world.player = player;
  world.npcs = [npc];
  world.propertyLedger = [
    {
      id: 'item:npc-ledger:key:1',
      label: 'ключ от амбара',
      type: 'tool',
      material: 'железо',
      condition: 'изношен',
      size: 'малый',
      placement: 'carried',
      ownerId: 'npc-ledger',
      ownerName: 'Степан',
      holderId: 'npc-ledger',
      holderName: 'Степан',
      access: 'immediate',
      visibility: 'visible',
      discoverability: 'obvious',
      legalStatus: 'ordinary',
      function: 'открывает амбар',
      value: 'низкая',
      risk: 'low',
      marks: ['клеймо двора', 'царапина на рукояти'],
      rights: ['носить'],
      weight: 0.2,
      contents: [{ label: 'бирка' }]
    }
  ];

  const ui = buildUiState(world);

  assert.ok(Array.isArray(ui.npcs[0].property));
  assert.ok(ui.npcs[0].property.some((item) => item.label === 'ключ от амбара'));
  assert.ok(ui.npcs[0].property.some((item) => item.ownerId === 'npc-ledger'));
  assert.equal(ui.npcs[0].property[0].type, 'tool');
  assert.equal(ui.npcs[0].property[0].material, 'железо');
  assert.equal(ui.npcs[0].property[0].condition, 'изношен');
  assert.deepEqual(ui.npcs[0].property[0].marks, ['клеймо двора', 'царапина на рукояти']);
  assert.equal(ui.npcs[0].property[0].contentsCount, 1);
  assert.match(ui.npcs[0].property[0].summaryText, /метки клеймо двора, царапина на рукояти/);
  assert.match(ui.npcs[0].property[0].summaryText, /владелец Степан/);
  assert.match(ui.npcs[0].property[0].summaryText, /материал железо/);
  assert.match(ui.npcs[0].property[0].summaryText, /риск низкий/);
  assert.match(ui.npcs[0].property[0].summaryText, /содержит 1/);
  assert.match(ui.journalSections.property[0], /ключ от амбара/);
  assert.match(ui.journalSections.property[0], /тип tool/);
  assert.match(ui.journalSections.property[0], /материал железо/);
  assert.match(ui.journalSections.property[0], /правовой статус обычный/);
  assert.match(ui.journalSections.property[0], /риск низкий/);
  assert.match(ui.journalSections.property[0], /доступ можно использовать сразу/);
  assert.match(ui.journalSections.property[0], /метки клеймо двора, царапина на рукояти/);
  assert.match(ui.journalSections.property[0], /содержит 1/);
});

test('ui state does not reveal hidden contents count for closed containers', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const currentLocationId = world.currentLocationId;
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок'
  }, { currentLocationId });
  const npc = buildNpcProfile({
    id: 'npc-box',
    name: 'Степан',
    role: 'староста',
    locationId: currentLocationId,
    inventory: [
      {
        id: 'item:npc-box:1',
        label: 'закрытый ларец',
        type: 'container',
        placement: 'carried',
        holder_id: 'npc-box',
        owner_id: 'npc-box',
        access: 'closed_container',
        visibility: 'visible',
        contents: [{ label: 'перстень', visibility: 'hidden' }]
      }
    ]
  }, currentLocationId, 0, player);

  world.player = player;
  world.npcs = [npc];
  world.propertyLedger = [{
    id: 'item:npc-box:1',
    label: 'закрытый ларец',
    type: 'container',
    placement: 'carried',
    ownerId: 'npc-box',
    ownerName: 'Степан',
    holderId: 'npc-box',
    holderName: 'Степан',
    access: 'closed_container',
    visibility: 'visible',
    contents: [{ label: 'перстень', visibility: 'hidden' }]
  }];

  const ui = buildUiState(world);

  assert.equal(ui.npcs[0].property[0].contentsCount, 0);
  assert.doesNotMatch(ui.npcs[0].property[0].summaryText, /содержит/i);
  assert.doesNotMatch(ui.journalSections.property[0], /содержит/i);
});

test('ui state hides non-visible npc items from public summaries', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const currentLocationId = world.currentLocationId;
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок'
  }, { currentLocationId });
  const npc = buildNpcProfile({
    id: 'npc-hidden',
    name: 'Степан',
    role: 'староста',
    locationId: currentLocationId,
    inventory: [
      {
        id: 'item:npc-hidden:visible:1',
        label: 'ключ от амбара',
        type: 'tool',
        placement: 'carried',
        holder_id: 'npc-hidden',
        owner_id: 'npc-hidden',
        visibility: 'visible',
        discoverability: 'obvious',
        marks: ['клеймо двора']
      },
      {
        id: 'item:npc-hidden:hidden:1',
        label: 'тайный нож',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'npc-hidden',
        owner_id: 'npc-hidden',
        visibility: 'hidden',
        visible: false,
        discoverability: 'hidden',
        marks: ['под подкладкой']
      }
    ]
  }, currentLocationId, 0, player);

  world.player = player;
  world.npcs = [npc];
  world.propertyLedger = [
    {
      id: 'item:npc-hidden:visible:1',
      label: 'ключ от амбара',
      type: 'tool',
      ownerId: 'npc-hidden',
      ownerName: 'Степан',
      holderId: 'npc-hidden',
      holderName: 'Степан',
      placement: 'carried',
      visibility: 'visible',
      discoverability: 'obvious',
      marks: ['клеймо двора']
    },
    {
      id: 'item:npc-hidden:hidden:1',
      label: 'тайный нож',
      type: 'weapon',
      ownerId: 'npc-hidden',
      ownerName: 'Степан',
      holderId: 'npc-hidden',
      holderName: 'Степан',
      placement: 'carried',
      visibility: 'hidden',
      visible: false,
      discoverability: 'hidden',
      marks: ['под подкладкой']
    }
  ];

  const ui = buildUiState(world);

  assert.ok(Array.isArray(ui.npcs[0].property));
  assert.ok(ui.npcs[0].property.some((item) => item.label === 'ключ от амбара'));
  assert.equal(ui.npcs[0].property.some((item) => item.label === 'тайный нож'), false);
  assert.equal(ui.npcs[0].propertyClues.some((line) => line.includes('выпуклость под одеждой')), true);
  assert.equal(ui.journalSections.property.some((line) => line.includes('тайный нож')), false);
  assert.equal(ui.journalSections.propertyClues.some((line) => line.includes('выпуклость под одеждой')), true);
  assert.equal(ui.propertyView.items.some((item) => item.label === 'тайный нож'), false);
});

test('ui state hides low-discoverability npc items even when visible', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const currentLocationId = world.currentLocationId;
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок'
  }, { currentLocationId });
  const npc = buildNpcProfile({
    id: 'npc-low-discovery',
    name: 'Степан',
    role: 'староста',
    locationId: currentLocationId,
    inventory: [
      {
        id: 'item:npc-low-discovery:plain-ring:1',
        label: 'простое кольцо',
        type: 'document',
        placement: 'carried',
        holder_id: 'npc-low-discovery',
        owner_id: 'npc-low-discovery',
        visibility: 'visible',
        visible: true,
        discoverability: 1,
        marks: []
      }
    ]
  }, currentLocationId, 0, player);

  world.player = player;
  world.npcs = [npc];
  world.propertyLedger = [
    {
      id: 'item:npc-low-discovery:plain-ring:1',
      label: 'простое кольцо',
      type: 'document',
      ownerId: 'npc-low-discovery',
      ownerName: 'Степан',
      holderId: 'npc-low-discovery',
      holderName: 'Степан',
      placement: 'carried',
      visibility: 'visible',
      visible: true,
      discoverability: 1,
      marks: []
    }
  ];

  const ui = buildUiState(world);

  assert.equal(ui.npcs[0].property, null);
  assert.equal(ui.npcs[0].propertyClues.some((line) => line.includes('есть скрытый признак вещи')), true);
  assert.equal(ui.journalSections.property.some((line) => line.includes('простое кольцо')), false);
  assert.equal(ui.journalSections.propertyClues.some((line) => line.includes('есть скрытый признак вещи')), true);
  assert.equal(ui.propertyView.items.some((item) => item.label === 'простое кольцо'), false);
});

test('ui state hides hidden npc inventory from public inventory snapshots too', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const currentLocationId = world.currentLocationId;
  const player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок'
  }, { currentLocationId });
  const npc = buildNpcProfile({
    id: 'npc-hidden-inventory',
    name: 'Степан',
    role: 'староста',
    locationId: currentLocationId,
    inventory: [
      {
        id: 'item:npc-hidden-inventory:key:1',
        label: 'ключ от амбара',
        type: 'tool',
        placement: 'carried',
        holder_id: 'npc-hidden-inventory',
        owner_id: 'npc-hidden-inventory',
        visibility: 'visible',
        visible: true,
        discoverability: 5
      },
      {
        id: 'item:npc-hidden-inventory:knife:1',
        label: 'тайный нож',
        type: 'weapon',
        placement: 'carried',
        holder_id: 'npc-hidden-inventory',
        owner_id: 'npc-hidden-inventory',
        visibility: 'hidden',
        visible: false,
        discoverability: 1
      }
    ]
  }, currentLocationId, 0, player);

  world.player = player;
  world.npcs = [npc];

  const ui = buildUiState(world);

  assert.ok(Array.isArray(ui.npcs[0].inventory));
  assert.equal(ui.npcs[0].inventory.some((item) => item.label === 'ключ от амбара'), true);
  assert.equal(ui.npcs[0].inventory.some((item) => item.label === 'тайный нож'), false);
  assert.equal(ui.npcs[0].observedActorProfile.property.carried.some((item) => item.label === 'тайный нож'), false);
  assert.equal(ui.npcs[0].observedActorProfile.property.carried.some((item) => item.label === 'ключ от амбара'), true);
});

test('ui state prefers canonical active states over body condition legacy fields', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.activeStates = [
    { id: 'hunger', label: 'голод' },
    { id: 'fatigue', label: 'усталость' }
  ];
  world.player.body = {
    ...(world.player.body ?? {}),
    active_conditions: ['legacy hunger', 'legacy fatigue']
  };

  const ui = buildUiState(world);

  assert.deepEqual(ui.player.body.active_conditions, ['голод', 'усталость']);
});

test('ui state splits journal content into visible sections', () => {
  const world = createWorldState(centralEurope1241Seed);
  const currentLocationId = world.currentLocationId;

  world.npcs = [buildNpcProfile({
    id: 'npc-journal',
    name: 'Степан',
    role: 'староста',
    locationId: currentLocationId,
    profileLevel: 'scene'
  }, currentLocationId, 0, world.player)];
  world.player.obligations = ['Вернуть долг'];
  world.player.claims = ['Право на клеть'];
  world.player.knowledge_map = {
    known_facts: ['Местный порядок держится на свидетелях'],
    known_routes: ['тракт к переправе'],
    known_people: ['Степан'],
    known_places: ['двор у переправы']
  };
  world.memory.sceneNotes = [{ at: { day: 1, hour: 9, minute: 10 }, note: 'След у ворот' }];
  world.memory.heardRumors = ['Слух о стражниках'];
  world.memory.visitedPlaces = {
    [currentLocationId]: {
      visits: 2,
      firstSeenAt: { day: 1, hour: 8, minute: 0 },
      lastSeenAt: { day: 1, hour: 9, minute: 0 },
      notes: []
    }
  };
  world.historical.activeHistoricalEvents = [
    {
      title: 'Монгольское вторжение в Польшу и Венгрию',
      activePhase: {
        label: 'Pressure',
        dateHint: 'поздняя весна 1241',
        visibleSigns: ['Беженцы, проверки и вооружённое движение становятся видимыми.']
      },
      visibleSigns: ['Местная власть жёстче давит на чужих, а путь становится рискованнее.']
    }
  ];
  world.propertyLedger = [
    {
      id: 'item:ledger:key',
      label: 'Ключ от амбара',
      ownerName: 'Игрок',
      holderName: 'Игрок',
      placement: 'carried',
      access: 'immediate',
      risk: 'low'
    }
  ];
  world.historical.anchorEvents = ['Старое событие'];
  world.delayedEvents = [
    {
      id: 'delayed:note',
      reason: 'Ожидание приказа',
      dueAt: { day: 1, hour: 10, minute: 0 },
      result: 'Приказ дошёл',
      status: 'pending',
      visibility: 'known',
      characterKnowledge: 'known'
    }
  ];

  recordWorldEvent(world, {
    at: { day: 1, hour: 9, minute: 15 },
    intent: 'test',
    result: 'Игровое событие',
    source: 'scene',
    relatedIds: ['npc-journal']
  });
  recordWorldEvent(world, {
    at: { day: 1, hour: 9, minute: 15 },
    kind: 'memory',
    result: 'Факт у ворот',
    source: 'memory'
  });
  recordWorldEvent(world, {
    at: { day: 1, hour: 9, minute: 15 },
    kind: 'assumption',
    result: 'Предположение о слухе',
    source: 'memory'
  });
  recordWorldEvent(world, {
    at: { day: 1, hour: 9, minute: 16 },
    intent: 'audit',
    result: 'Техническое событие'
  });

  const ui = buildUiState(world);

  assert.ok(ui.journalSections.events.some((item) => item.includes('Игровое событие')));
  assert.equal(ui.journalSections.events.some((item) => item.includes('Техническое событие')), false);
  assert.ok(ui.journalSections.facts.some((item) => item.includes('Факт у ворот')));
  assert.ok(ui.journalSections.assumptions.some((item) => item.includes('Предположение о слухе')));
  assert.equal(ui.journalSections.memory.some((item) => item.includes('След у ворот')), false);
  assert.ok(ui.journalSections.obligations.some((item) => item.includes('Вернуть долг')));
  assert.ok(ui.journalSections.people.length > 0);
  assert.ok(ui.journalSections.places.some((item) => item.includes('2 раз')));
  assert.ok(Array.isArray(ui.memory.knownPlaces));
  assert.ok(ui.memory.knownPlaces.some((item) => item.label));
  assert.ok(ui.memory.knownPlaces.some((item) => item.summaryText.includes('2 раз')));
  assert.ok(ui.memory.knownRoutes.some((item) => item.summaryText.includes('тракт к переправе')));
  assert.ok(ui.memory.knownPeople.some((item) => item.summaryText.includes('Степан')));
  assert.ok(ui.memory.knownFacts.some((item) => item.summaryText.includes('свидетел')));
  assert.ok(Array.isArray(ui.knowledgeMap.knownPlaces));
  assert.ok(ui.knowledgeMap.summaryText.includes('путей') || ui.knowledgeMap.summaryText.includes('мест'));
  assert.ok(ui.journalSections.knowledgeMap.length > 0);
  assert.ok(ui.journalSections.knowledge.some((item) => item.includes('тракт к переправе')));
  assert.ok(ui.journalSections.history.some((item) => item.includes('Монгольское вторжение в Польшу и Венгрию')));
  assert.ok(ui.journalSections.history.some((item) => item.includes('поздняя весна 1241')));
  assert.ok(ui.journalSections.history.some((item) => item.includes('Нарастание')));
  assert.ok(ui.journalSections.property.some((item) => item.includes('Ключ от амбара')));
  assert.ok(ui.delayedEvents.some((item) => item.includes('Ожидание приказа')));
  assert.ok(ui.journalSections.delayedEvents.some((item) => item.includes('Ожидание приказа')));
  assert.ok(ui.journalSections.rumorsHistory.some((item) => item.includes('Слух о стражниках')));
  assert.ok(ui.journalSections.rumorsHistory.some((item) => item.includes('Старое событие')));
  assert.ok(Array.isArray(ui.historical.activeHistoricalEventsSummary));
  assert.equal(ui.historical.activeHistoricalEventsSummary[0].activePhase.label, 'Нарастание');
  assert.ok(Array.isArray(ui.historical.historicalEventsSummary));
  assert.equal(ui.historical.historicalEventsSummary[0].title, 'Монгольское вторжение в Польшу и Венгрию');
  assert.equal(ui.historical.historicalEvents, undefined);
  assert.equal(ui.historical.activeHistoricalEvents, undefined);
  assert.equal('relatedIds' in ui.journal[0], false);
});

test('ui state shows only known routes in the visible route archive', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.historical.routeArchive = [
    {
      id: 'route:hidden',
      summary: 'Скрытый путь к лесу',
      route: {
        id: 'route:hidden',
        known_to_character: false,
        known_to_player: false
      }
    },
    {
      id: 'route:known',
      summary: 'Известный путь к переправе',
      route: {
        id: 'route:known',
        known_to_character: true,
        known_to_player: false
      }
    },
    {
      id: 'route:player-known',
      summary: 'Путь, известный игроку',
      route: {
        id: 'route:player-known',
        known_to_character: false,
        known_to_player: true
      }
    }
  ];

  const ui = buildUiState(world);

  assert.equal(ui.historical.routeArchive.length, 3);
  assert.equal(ui.historical.routeArchiveVisible.length, 2);
  assert.deepEqual(
    ui.historical.routeArchiveVisible.map((entry) => entry.summary),
    ['Известный путь к переправе', 'Путь, известный игроку']
  );
  assert.equal(ui.historical.routeArchiveVisible.some((entry) => entry.summary === 'Скрытый путь к лесу'), false);
});

test('ui state does not offer move highlights when scene access is closed', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.scene.access = 'закрыто';
  world.place.exits = ['ворота во двор', 'к переправе'];

  const ui = buildUiState(world);
  const exitEntities = ui.visibleScene.markup.entities.filter((item) => item.kind === 'exit');
  const moveHighlights = ui.visibleScene.markup.highlights.filter((item) => item.kind === 'exit' && item.action === 'move');

  assert.ok(exitEntities.length > 0);
  assert.equal(exitEntities.every((item) => item.accessible === false), true);
  assert.equal(moveHighlights.length, 0);
  assert.ok(ui.visibleScene.markup.notes.some((item) => item.includes('Доступ: закрыто')));
});

test('ui state does not offer move highlights when scene access is controlled or permission-based', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.scene.access = 'по приглашению и под надзором хозяина';
  world.place.exits = ['ворота во двор', 'к переправе'];

  const ui = buildUiState(world);
  const exitEntities = ui.visibleScene.markup.entities.filter((item) => item.kind === 'exit');
  const moveHighlights = ui.visibleScene.markup.highlights.filter((item) => item.kind === 'exit' && item.action === 'move');

  assert.ok(exitEntities.length > 0);
  assert.equal(exitEntities.every((item) => item.accessible === false), true);
  assert.equal(moveHighlights.length, 0);
  assert.ok(ui.visibleScene.markup.notes.some((item) => item.includes('Доступ: по приглашению и под надзором хозяина')));
});

test('buildPlayerUiState matches production payload without debug internals', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const ui = buildPlayerUiState(world);

  assert.equal('debug' in ui, false);
  assert.ok(ui.orientation);
  assert.equal('knowledge_map' in ui.player, false);
  assert.deepEqual(ui, buildUiState(world));
});

test('ui state keeps place landmarks as notes instead of inspectable scene objects', () => {
  const world = createWorldState({
    locations: {
      yard: {
        id: 'yard',
        name: 'Двор',
        kind: 'двор',
        landmarks: ['мешки у стен', 'склады с досками', 'грязная дорога'],
        exits: [{ label: 'к реке', to: 'river' }],
        occupants: []
      },
      river: {
        id: 'river',
        name: 'Река',
        kind: 'берег',
        landmarks: [],
        exits: [{ label: 'к двору', to: 'yard' }],
        occupants: []
      }
    },
    current_position: {
      location_id: 'yard',
      place_id: 'yard',
      minilocation_id: null,
      region_id: 'Тестовый регион'
    }
  });

  world.place = world.locations.yard;
  world.microPlace = {
    id: 'yard:none',
    name: 'Двор',
    kind: 'двор',
    visibleObjects: [],
    containers: [],
    doors: [],
    entryPoints: [],
    occupants: [],
    traces: []
  };

  const ui = buildUiState(world);
  const objectEntities = ui.visibleScene.markup.entities.filter((item) => item.kind === 'object');
  const objectHighlights = ui.visibleScene.markup.highlights.filter((item) => item.kind === 'object');

  assert.equal(objectEntities.length, 0);
  assert.equal(objectHighlights.length, 0);
  assert.ok(ui.visibleScene.markup.notes.some((item) => item.includes('Ориентиры места: мешки у стен / склады с досками / грязная дорога')));
});
