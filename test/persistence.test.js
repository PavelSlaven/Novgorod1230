import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createWorldState } from '../src/world/state.js';
import { restoreWorldState } from '../src/world/state.js';
import { listSavedWorlds, loadWorldByKey, loadWorldState, saveInitialWorld, saveWorldState } from '../src/world/persistence.js';

test('world state survives save and load', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-world-'));
  const file = pathToFileURL(join(dir, 'save.json'));
  const previousCatalogDir = process.env.WORLD_CATALOG_DIR;
  process.env.WORLD_CATALOG_DIR = dir;

  try {
    const world = createWorldState({ startText: 'лесная деревня' });
    world.playerSeed = structuredClone(world.player);
    world.events.push({
      at: { day: 2, hour: 9, minute: 10 },
      input: 'проверка',
      intent: 'observe',
      result: 'ok'
    });
    world.journal.push({
      at: { day: 2, hour: 9, minute: 10 },
      input: 'проверка',
      intent: 'observe',
      result: 'ok',
      detail: 'full-log'
    });
    world.delayedEvents = [
      {
        id: 'delayed:rumor',
        reason: 'ожидание слуха',
        dueAt: { day: 2, hour: 10, minute: 0 },
        result: 'слух дошёл до места',
        effect: {
          memory: {
            rumors_add: ['Слух о назначенном человеке']
          }
        }
      }
    ];

    await saveWorldState(file, world);
    const sessionData = JSON.parse(await readFile(file, 'utf8'));
    const catalogPath = join(dir, `${encodeURIComponent(world.worldKey)}.json`);
    const catalogData = JSON.parse(await readFile(catalogPath, 'utf8'));
    const loaded = await loadWorldState(file);

    assert.equal(loaded.worldId, world.worldId);
    assert.equal(loaded.place.name, world.place.name);
    assert.deepEqual(loaded.events[0], world.events[0]);
    assert.deepEqual(loaded.journal[0], world.journal[0]);
    assert.equal(loaded.history.era, 'XIII век');
    assert.ok(sessionData.player.states);
    assert.ok(sessionData.player.body);
    assert.equal(sessionData.player.hunger, undefined);
    assert.equal(sessionData.player.fatigue, undefined);
    assert.equal(sessionData.player.sleep, undefined);
    assert.equal(sessionData.player.inventory, undefined);
    assert.equal(sessionData.player.property, undefined);
    assert.equal(sessionData.player.needs.hunger, undefined);
    assert.equal(sessionData.player.needs.fatigue, undefined);
    assert.equal(sessionData.player.needs.sleep, undefined);
    assert.equal(sessionData.player.legacy_vitals, undefined);
    assert.equal(sessionData.player.legacy_needs, undefined);
    assert.equal(sessionData.delayedEvents.length, 1);
    assert.equal(sessionData.delayedEvents[0].status, 'pending');
    assert.ok(sessionData.party_state);
    assert.ok(sessionData.party_state.visible_state);
    assert.ok(sessionData.party_state.hidden_state);
    assert.ok(Array.isArray(sessionData.party_state.deferred_events));
    assert.ok(Array.isArray(sessionData.party_state.recent_changes_log));
    assert.ok(catalogData.player.states);
    assert.ok(catalogData.player.body);
    assert.equal(catalogData.player.hunger, undefined);
    assert.equal(catalogData.player.fatigue, undefined);
    assert.equal(catalogData.player.sleep, undefined);
    assert.equal(catalogData.player.inventory, undefined);
    assert.equal(catalogData.player.property, undefined);
    assert.equal(catalogData.player.legacy_vitals, undefined);
    assert.equal(catalogData.player.legacy_needs, undefined);
    assert.equal(catalogData.playerSeed?.legacy_vitals, undefined);
    assert.equal(catalogData.playerSeed?.legacy_needs, undefined);
    assert.ok(catalogData.party_state);
    assert.ok(catalogData.party_state.visible_state);
    assert.ok(catalogData.party_state.hidden_state);
    assert.ok(Array.isArray(catalogData.npcs));
    assert.equal(catalogData.npcs[0]?.inventory, undefined);
    assert.equal(catalogData.npcs[0]?.property, undefined);
    assert.equal(catalogData.npcs[0]?.legacy_vitals, undefined);
    assert.equal(catalogData.npcs[0]?.legacy_needs, undefined);
    assert.ok(loaded.player.items);
    assert.equal(loaded.player.inventory, undefined);
    assert.equal(loaded.player.property, undefined);
    assert.equal(loaded.player.legacy_vitals, undefined);
    assert.equal(loaded.player.legacy_needs, undefined);
    assert.equal(loaded.delayedEvents.length, 1);
    assert.equal(loaded.delayedEvents[0].reason, 'ожидание слуха');
    assert.equal(loaded.delayedEvents[0].status, 'pending');
  } finally {
    if (previousCatalogDir === undefined) {
      delete process.env.WORLD_CATALOG_DIR;
    } else {
      process.env.WORLD_CATALOG_DIR = previousCatalogDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('saved session derives current ids from canonical current_position', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-world-pos-'));
  const file = pathToFileURL(join(dir, 'save.json'));
  const previousCatalogDir = process.env.WORLD_CATALOG_DIR;
  process.env.WORLD_CATALOG_DIR = dir;

  try {
    const world = createWorldState({ startText: 'лесная деревня' });
    world.currentLocationId = 'stale-yard';
    world.currentMicroLocationId = 'stale-yard:entry';
    world.current_position = {
      ...world.current_position,
      location_id: 'yard',
      place_id: 'yard',
      minilocation_id: 'yard:center'
    };

    await saveWorldState(file, world);

    const sessionData = JSON.parse(await readFile(file, 'utf8'));
    const catalogPath = join(dir, `${encodeURIComponent(world.worldKey)}.json`);
    const catalogData = JSON.parse(await readFile(catalogPath, 'utf8'));

    assert.equal(sessionData.currentLocationId, 'yard');
    assert.equal(sessionData.currentMicroLocationId, 'yard:center');
    assert.equal(catalogData.currentLocationId, 'yard');
    assert.equal(catalogData.currentMicroLocationId, 'yard:center');
    assert.equal(sessionData.currentLocationId, sessionData.current_position.location_id);
    assert.equal(sessionData.currentMicroLocationId, sessionData.current_position.minilocation_id);
  } finally {
    if (previousCatalogDir === undefined) {
      delete process.env.WORLD_CATALOG_DIR;
    } else {
      process.env.WORLD_CATALOG_DIR = previousCatalogDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('legacy session is normalized during load', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-legacy-'));
  const file = pathToFileURL(join(dir, 'save.json'));
  const legacy = createWorldState({ startText: 'лесная деревня' });

  legacy.history.macroForces = undefined;
  legacy.region.tensions = undefined;
  legacy.memory.heardRumors = undefined;
  legacy.social.recentWitnesses = undefined;
  legacy.social.socialMemory = undefined;
  legacy.place.landmarks = undefined;
  legacy.place.exits = undefined;
  legacy.place.occupants = undefined;
  legacy.scene.pressure = undefined;
  legacy.scene.sounds = undefined;
  if (legacy.currentLocationId && legacy.locations?.[legacy.currentLocationId]) {
    legacy.locations[legacy.currentLocationId].landmarks = undefined;
    legacy.locations[legacy.currentLocationId].exits = undefined;
    legacy.locations[legacy.currentLocationId].occupants = undefined;
    legacy.locations[legacy.currentLocationId].recentTraces = undefined;
    legacy.locations[legacy.currentLocationId].pressure = undefined;
    legacy.locations[legacy.currentLocationId].sounds = undefined;
  }

  await writeFile(file, JSON.stringify(legacy), 'utf8');

  try {
    const loaded = await loadWorldState(file);

    assert.deepEqual(loaded.history.macroForces, []);
    assert.deepEqual(loaded.region.tensions, []);
    assert.deepEqual(loaded.place.landmarks, []);
    assert.deepEqual(loaded.place.exits, []);
    assert.deepEqual(loaded.scene.pressure, []);
    assert.deepEqual(loaded.scene.sounds, []);
    assert.deepEqual(loaded.memory.heardRumors, []);
    assert.deepEqual(loaded.social.recentWitnesses, []);
    assert.deepEqual(loaded.social.socialMemory, []);
    assert.deepEqual(loaded.locations[loaded.currentLocationId].landmarks, []);
    assert.deepEqual(loaded.locations[loaded.currentLocationId].exits, []);
    assert.ok(Array.isArray(loaded.locations[loaded.currentLocationId].occupants));
    assert.deepEqual(loaded.locations[loaded.currentLocationId].recentTraces, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadWorldState ignores legacy sidecar catalog when worldKey catalog is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-legacy-sidecar-'));
  const file = pathToFileURL(join(dir, 'save.json'));
  const legacySidecar = createWorldState({ startText: 'лесная деревня' });
  const session = { worldKey: 'slot-sidecar' };

  await writeFile(file, JSON.stringify(session), 'utf8');
  await writeFile(join(dir, 'save.catalog.json'), JSON.stringify(legacySidecar), 'utf8');

  const previousCatalogDir = process.env.WORLD_CATALOG_DIR;
  delete process.env.WORLD_CATALOG_DIR;

  try {
    const loaded = await loadWorldState(file);
    assert.equal(loaded, null);
  } finally {
    if (previousCatalogDir === undefined) {
      delete process.env.WORLD_CATALOG_DIR;
    } else {
      process.env.WORLD_CATALOG_DIR = previousCatalogDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('restoreWorldState returns a fresh world when catalog is absent', () => {
  const world = restoreWorldState(null, { worldKey: 'slot-empty' });

  assert.ok(world);
  assert.ok(world.current_position);
  assert.ok(typeof world.worldKey === 'string');
  assert.notEqual(world.worldKey, 'slot-empty');
  assert.equal(world.catalogDirty, false);
});

test('restoreWorldState prefers canonical current_position over legacy ids', () => {
  const world = restoreWorldState({
    worldId: 'world:test',
    worldKey: 'slot-canonical',
    scenarioId: 'default',
    createdAt: '2026-06-25T00:00:00.000Z',
    current_position: {
      region_id: 'region-1',
      place_id: 'yard',
      location_id: 'yard',
      minilocation_id: 'yard:center',
      anchor_id: 'yard:center',
      last_route_id: 'route:yard'
    },
    currentLocationId: 'stale-yard',
    currentMicroLocationId: 'stale-yard:entry',
    locations: {
      yard: {
        id: 'yard',
        name: 'Двор',
        kind: 'двор',
        landmarks: [],
        exits: [],
        occupants: [],
        activity: [],
        recentTraces: [],
        pressure: [],
        sounds: [],
        weather: null,
        light: null,
        profile: {}
      }
    },
    player: { name: 'Феофил', role: 'путник', status: 'чужой' }
  }, {
    current_position: {
      region_id: 'region-1',
      place_id: 'yard',
      location_id: 'yard',
      minilocation_id: 'yard:center',
      anchor_id: 'yard:center',
      last_route_id: 'route:yard'
    },
    currentLocationId: 'stale-session-yard',
    currentMicroLocationId: 'stale-session-yard:entry'
  });

  assert.ok(world.current_position);
  assert.equal(world.current_position.location_id, 'yard');
  assert.equal(world.currentLocationId, 'yard');
  assert.equal(world.currentMicroLocationId, 'yard:center');
});

test('real legacy save.json loads as a v2 world shape', async () => {
  const file = pathToFileURL(join(process.cwd(), 'data', 'save.json'));
  const loaded = await loadWorldState(file);

  assert.ok(loaded);
  assert.equal(loaded.version, 2);
  assert.equal(loaded.schema, 'world_state');
  assert.ok(loaded.current_position);
  assert.equal(loaded.current_position.location_id, loaded.currentLocationId);
  assert.equal(loaded.current_position.minilocation_id, loaded.currentMicroLocationId);
  assert.ok(loaded.player.identity);
  assert.ok(loaded.player.body);
  assert.ok(loaded.player.states);
  assert.ok(loaded.player.items);
  assert.ok(loaded.player.position);
  assert.equal(loaded.player.position.location_id, loaded.currentLocationId);
  assert.equal(loaded.player.body.health, loaded.player.states.health);
  assert.ok(Number.isFinite(loaded.player.states.health));
  assert.ok(Number.isFinite(loaded.player.states.satiety));
  assert.ok(Number.isFinite(loaded.player.states.vigor));
  assert.equal(loaded.player.hunger, undefined);
  assert.equal(loaded.player.fatigue, undefined);
  assert.equal(loaded.player.sleep, undefined);
  assert.equal(loaded.player.legacy_vitals, undefined);
  assert.equal(loaded.player.legacy_needs, undefined);
});

test('re-saved v2 snapshots keep legacy vitals only as load-time adapters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-resave-v2-'));
  const file = pathToFileURL(join(dir, 'save.json'));
  const legacyFile = pathToFileURL(join(process.cwd(), 'data', 'save.json'));
  const loaded = await loadWorldState(legacyFile);
  const previousCatalogDir = process.env.WORLD_CATALOG_DIR;
  process.env.WORLD_CATALOG_DIR = dir;

  try {
    await saveWorldState(file, loaded);

    const sessionData = JSON.parse(await readFile(file, 'utf8'));
    const catalogPath = join(dir, `${encodeURIComponent(loaded.worldKey)}.json`);
    const catalogData = JSON.parse(await readFile(catalogPath, 'utf8'));

    assert.equal(sessionData.player.legacy_vitals, undefined);
    assert.equal(sessionData.player.legacy_needs, undefined);
    assert.equal(catalogData.player.legacy_vitals, undefined);
    assert.equal(catalogData.player.legacy_needs, undefined);
    assert.equal(loaded.player.legacy_vitals, undefined);
    assert.equal(loaded.player.legacy_needs, undefined);
  } finally {
    if (previousCatalogDir === undefined) {
      delete process.env.WORLD_CATALOG_DIR;
    } else {
      process.env.WORLD_CATALOG_DIR = previousCatalogDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('saved games can be listed and loaded by worldKey', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-slots-'));
  const catalogDir = join(dir, 'catalogs');
  const sessionDir = join(dir, 'sessions');
  const previousCatalogDir = process.env.WORLD_CATALOG_DIR;
  const previousSessionDir = process.env.WORLD_SESSION_DIR;
  process.env.WORLD_CATALOG_DIR = catalogDir;
  process.env.WORLD_SESSION_DIR = sessionDir;

  try {
    const first = createWorldState({ worldKey: 'slot-alpha', startText: 'лесная деревня' });
    first.createdAt = '2026-06-22T09:00:00.000Z';
    first.clock.day = 2;
    first.clock.hour = 9;
    first.lastUpdatedAt = '2026-06-22T10:00:00.000Z';
    await saveInitialWorld(pathToFileURL(join(dir, 'alpha-save.json')), first);

    const second = createWorldState({ worldKey: 'slot-beta', startText: 'городской двор' });
    second.createdAt = '2026-06-22T12:00:00.000Z';
    second.clock.day = 5;
    second.clock.hour = 14;
    second.lastUpdatedAt = '2026-06-22T11:00:00.000Z';
    await saveInitialWorld(pathToFileURL(join(dir, 'beta-save.json')), second);

    first.clock.day = 7;
    first.clock.hour = 18;
    first.clock.minute = 30;
    first.player.states.satiety = 41;
    first.player.name = 'Андрей';
    first.place.name = 'Новый двор';
    first.catalogDirty = true;
    first.lastUpdatedAt = '2026-06-22T13:00:00.000Z';
    await saveWorldState(pathToFileURL(join(dir, 'alpha-save.json')), first);

    const saves = await listSavedWorlds();
    assert.equal(saves.length, 2);
    assert.equal(saves[0].worldKey, 'slot-alpha');
    assert.equal(saves[1].worldKey, 'slot-beta');
    assert.equal(saves[0].title, 'Андрей');
    assert.match(saves[0].clockText, /18:30/);
    assert.match(saves[1].clockText, /14:/);
    assert.equal(saves[0].saveKindText, 'Сессия');

    const loaded = await loadWorldByKey('slot-alpha');
    assert.ok(loaded);
    assert.equal(loaded.worldKey, 'slot-alpha');
    assert.equal(loaded.clock.day, 7);
    assert.equal(loaded.clock.hour, 18);
    assert.equal(loaded.clock.minute, 30);
    assert.equal(loaded.place.name, first.place.name);
    assert.equal(loaded.player.states.satiety, 41);
  } finally {
    if (previousCatalogDir === undefined) {
      delete process.env.WORLD_CATALOG_DIR;
    } else {
      process.env.WORLD_CATALOG_DIR = previousCatalogDir;
    }
    if (previousSessionDir === undefined) {
      delete process.env.WORLD_SESSION_DIR;
    } else {
      process.env.WORLD_SESSION_DIR = previousSessionDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('mutable npc session changes survive save and load without catalog rewrite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-npc-session-'));
  const catalogDir = join(dir, 'catalogs');
  const sessionDir = join(dir, 'sessions');
  const previousCatalogDir = process.env.WORLD_CATALOG_DIR;
  const previousSessionDir = process.env.WORLD_SESSION_DIR;
  process.env.WORLD_CATALOG_DIR = catalogDir;
  process.env.WORLD_SESSION_DIR = sessionDir;

  try {
    const world = createWorldState({ worldKey: 'slot-npc-session', startText: 'лесная деревня' });
    const sessionFile = pathToFileURL(join(dir, 'slot-npc-session.json'));
    await saveInitialWorld(sessionFile, world);

    world.catalogDirty = false;
    world.npcs[0].health = 63;
    world.npcs[0].bleeding = 2;
    world.npcs[0].states = {
      ...(world.npcs[0].states ?? {}),
      health: 63,
      satiety: 54,
      vigor: 41
    };
    world.npcs[0].satiety = 54;
    world.npcs[0].vigor = 41;
    world.npcs[0].pain = 3;
    world.npcs[0].intoxication = 1;
    world.npcs[0].fear = 17;
    world.npcs[0].items = {
      ...(world.npcs[0].items ?? {}),
      carried_items: [{ label: 'перевязь' }],
      property_not_carried: [{ label: 'ключ от клети' }]
    };

    await saveWorldState(sessionFile, world);
    const restored = await loadWorldByKey('slot-npc-session');

    assert.ok(restored);
    assert.equal(restored.npcs[0].health, 63);
    assert.equal(restored.npcs[0].bleeding, 2);
    assert.equal(restored.npcs[0].states.health, 63);
    assert.equal(restored.npcs[0].states.satiety, 54);
    assert.equal(restored.npcs[0].states.vigor, 41);
    assert.equal(restored.npcs[0].satiety, 54);
    assert.equal(restored.npcs[0].vigor, 41);
    assert.equal(restored.npcs[0].pain, 3);
    assert.equal(restored.npcs[0].intoxication, 1);
    assert.equal(restored.npcs[0].fear, 17);
    assert.equal(restored.npcs[0].items.carried_items[0].label, 'перевязь');
    assert.equal(restored.npcs[0].items.carried_items[0].placement, 'carried');
    assert.equal(restored.npcs[0].items.property_not_carried[0].label, 'ключ от клети');
    assert.ok(restored.npcs[0].items.property_not_carried[0].placement);
  } finally {
    if (previousCatalogDir === undefined) {
      delete process.env.WORLD_CATALOG_DIR;
    } else {
      process.env.WORLD_CATALOG_DIR = previousCatalogDir;
    }
    if (previousSessionDir === undefined) {
      delete process.env.WORLD_SESSION_DIR;
    } else {
      process.env.WORLD_SESSION_DIR = previousSessionDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('saved game list includes the last important event fragment', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-slot-event-'));
  const catalogDir = join(dir, 'catalogs');
  const sessionDir = join(dir, 'sessions');
  const previousCatalogDir = process.env.WORLD_CATALOG_DIR;
  const previousSessionDir = process.env.WORLD_SESSION_DIR;
  process.env.WORLD_CATALOG_DIR = catalogDir;
  process.env.WORLD_SESSION_DIR = sessionDir;

  try {
    const world = createWorldState({ worldKey: 'slot-event', startText: 'лесная деревня' });
    world.createdAt = '2026-06-23T09:00:00.000Z';
    world.lastUpdatedAt = '2026-06-23T10:00:00.000Z';
    world.journal.push({
      at: { day: 2, hour: 11, minute: 30 },
      input: 'осмотреть двор',
      intent: 'observe',
      result: 'Появился дозорный у ворот'
    });

    await saveInitialWorld(pathToFileURL(join(dir, 'event-save.json')), world);

    world.journal.push({
      at: { day: 2, hour: 12, minute: 5 },
      input: 'спросить про дорогу',
      intent: 'ask',
      detail: 'Староста велел подождать у крыльца'
    });
    world.lastUpdatedAt = '2026-06-23T11:00:00.000Z';
    await saveWorldState(pathToFileURL(join(dir, 'event-save.json')), world);

    const saves = await listSavedWorlds();
    assert.equal(saves.length, 1);
    assert.equal(saves[0].worldKey, 'slot-event');
    assert.equal(saves[0].lastEventText, 'Староста велел подождать у крыльца');
  } finally {
    if (previousCatalogDir === undefined) {
      delete process.env.WORLD_CATALOG_DIR;
    } else {
      process.env.WORLD_CATALOG_DIR = previousCatalogDir;
    }
    if (previousSessionDir === undefined) {
      delete process.env.WORLD_SESSION_DIR;
    } else {
      process.env.WORLD_SESSION_DIR = previousSessionDir;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
