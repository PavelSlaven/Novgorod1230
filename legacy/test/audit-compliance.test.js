import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnvBoolean } from '../src/env-boolean.js';
import { classifyIntent, isInventoryIntent } from '../src/world/intent.js';
import { formatSourceLocation, loadDesignBundleSync, resolveDesignTask } from '../src/world/corpus-loader.js';
import { buildMasterFrame } from '../src/world/master.js';
import { createWorldState } from '../src/world/state.js';
import { resolveItemAction, validateStateDeltaItemChange } from '../src/world/item-resolver.js';
import { buildRouteReconstruction, findArchivedRoute, isRouteSelectionConfirmed } from '../src/world/routes.js';
import {
  validateContainerRecord,
  validateItemRecord
} from '../src/world/json-contracts.js';
import { buildPlayerProfile } from '../src/world/entities.js';
import { resolveDestination } from '../src/world/location.js';
import { generateMemoryJournalUpdate, generateVisibleContextPackage } from '../src/world/provider.js';
import { applyStateDelta } from '../src/world/delta.js';
import { buildUiState } from '../src/ui-state.js';

const root = resolve(import.meta.dirname, '..');

test('parseEnvBoolean treats false-like values as disabled', () => {
  assert.equal(parseEnvBoolean('false', true), false);
  assert.equal(parseEnvBoolean('0', true), false);
  assert.equal(parseEnvBoolean('no', true), false);
  assert.equal(parseEnvBoolean('true', false), true);
  assert.equal(parseEnvBoolean('1', false), true);
  assert.equal(parseEnvBoolean('', false), false);
});

test('intent classifies item take open search equip use actions', () => {
  assert.equal(classifyIntent('беру нож со стола').type, 'item_take');
  assert.equal(classifyIntent('открываю сундук').type, 'item_open_container');
  assert.equal(classifyIntent('обыскиваю мешок').type, 'item_search_container');
  assert.equal(classifyIntent('надеваю кольчугу').type, 'item_equip');
  assert.equal(classifyIntent('использую верёвку').type, 'item_use');
  assert.equal(classifyIntent('передаю монету стражнику').type, 'item_give');
  assert.ok(isInventoryIntent('item_take'));
});

test('resolveDesignTask routes inventory intents to inventory bundle', () => {
  const world = createWorldState({ startText: 'двор' });
  const frame = buildMasterFrame(world, 'беру нож со стола');
  assert.equal(resolveDesignTask(frame), 'inventory');
  assert.equal(frame.world.inventoryFocus, true);
});

test('item_take cannot create missing item', () => {
  const world = createWorldState({ startText: 'двор' });
  const intent = classifyIntent('беру золотой кубок');
  const result = resolveItemAction(world, intent);
  assert.equal(result.ok, false);
  assert.match(result.text, /не создаёт предмет/i);
});

test('item_open_container uses pre-existing container contents', () => {
  const world = createWorldState({ startText: 'двор' });
  world.microPlace = {
    containers: [{
      id: 'yard:container:0',
      label: 'сундук',
      type: 'container',
      contents: [{ id: 'item:1', label: 'верёвка', type: 'tool', visible: false }]
    }]
  };
  const open = resolveItemAction(world, classifyIntent('открываю сундук'));
  assert.equal(open.ok, true);
  assert.match(open.text, /верёвка/);
  const search = resolveItemAction(world, classifyIntent('обыскиваю сундук'));
  assert.equal(search.ok, true);
  assert.match(search.text, /верёвка/);
});

test('item_equip blocks when hands are already full', () => {
  const world = createWorldState({ startText: 'двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [
        { id: 'item:player:knife:1', label: 'нож', type: 'weapon', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate' },
        { id: 'item:player:torch:1', label: 'факел', type: 'tool', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'immediate' },
        { id: 'item:player:axe:1', label: 'топор', type: 'weapon', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'quick' }
      ],
      equipment: [],
      weapons: [],
      armor: []
    }
  }, { currentLocationId: world.currentLocationId });
  const result = resolveItemAction(world, classifyIntent('надеваю топор'));
  assert.equal(result.ok, false);
  assert.match(result.text, /рук/i);
});

test('item_drop moves item from inventory to location state', () => {
  const world = createWorldState({ startText: 'двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [{ id: 'item:player:bread:1', label: 'хлеб', type: 'item', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'quick' }],
      equipment: [],
      weapons: [],
      armor: []
    }
  }, { currentLocationId: world.currentLocationId });
  world.microPlace = { visibleObjects: [] };
  const result = resolveItemAction(world, classifyIntent('бросаю хлеб'));
  assert.equal(result.ok, true);
  assert.ok(world.microPlace.visibleObjects.some((entry) => String(entry).includes('хлеб')));
});

test('formatSourceLocation includes graph line_range', () => {
  const text = formatSourceLocation({
    file: 'DOCUMENTS/README.md',
    section: 'Docs',
    line_range: 'L1-L20'
  });
  assert.match(text, /README\.md#Docs:L1-L20/);
  const fallback = formatSourceLocation({ file: 'a.md', line_start: 3, line_end: 9 });
  assert.match(fallback, /L3-L9/);
});

test('combat bundle contains harm armor injury sections', () => {
  const bundle = loadDesignBundleSync('combat');
  assert.match(bundle, /combat_system\.md/i);
  assert.match(bundle, /(injury|травм|damage|вред|armor|брон)/i);
});

test('inventory bundle contains container discoverability ownership sections', () => {
  const bundle = loadDesignBundleSync('inventory');
  assert.match(bundle, /(container|контейнер)/i);
  assert.match(bundle, /(discoverability|обнаруж|ownership|владен)/i);
});

test('interface bundle contains hidden diagnostics rules', () => {
  const bundle = loadDesignBundleSync('new_game');
  assert.match(bundle, /(hidden|скрыт|diagnostic|диагност|raw)/i);
});

test('movement bundle contains route time weather constraints', () => {
  const bundle = loadDesignBundleSync('movement');
  assert.match(bundle, /(route|маршрут|дорог)/i);
  assert.match(bundle, /(time|время|weather|погод)/i);
  assert.match(bundle, /дальний курс/i);
  assert.match(bundle, /last_route_id/i);
  assert.match(bundle, /карта знаний/i);
});

test('validateItemRecord rejects shallow item objects', () => {
  assert.equal(validateItemRecord({ label: 'нож' }), null);
  const valid = validateItemRecord({
    label: 'нож',
    type: 'weapon',
    material: 'железо',
    condition: 'цел',
    size: 'small',
    placement: 'carried',
    access: 'quick',
    visibility: 'visible',
    legal_status: 'ordinary',
    function: 'режет',
    weight: 0.3,
    discoverability: 5,
    plausibility: 5,
    risk: 1,
    visible: true,
    marks: []
  });
  assert.ok(valid);
});

test('validateContainerRecord accepts container with contents policy', () => {
  const container = validateContainerRecord({
    label: 'сундук',
    type: 'container',
    material: 'дерево',
    condition: 'цел',
    size: 'medium',
    placement: 'property',
    access: 'closed_container',
    visibility: 'visible',
    legal_status: 'ordinary',
    function: 'хранение',
    weight: 2,
    discoverability: 4,
    plausibility: 5,
    risk: 0,
    visible: true,
    marks: [],
    is_container: true,
    contents_policy: 'fixed',
    contents: []
  });
  assert.ok(container);
});

test('state delta item change rejects unreferenced create', () => {
  const world = createWorldState({ startText: 'двор' });
  const result = validateStateDeltaItemChange(world, { op: 'take', item: { label: 'новый меч' } });
  assert.equal(result.ok, false);
});

test('unknown route is not silently treated as confirmed', () => {
  const world = createWorldState({ startText: 'двор' });
  const reconstruction = buildRouteReconstruction(world, classifyIntent('иду в никуда'));
  assert.equal(isRouteSelectionConfirmed(reconstruction.selected), false);
});

test('repeated same route uses archived route facts', () => {
  const world = createWorldState({ startText: 'двор' });
  const reconstruction = buildRouteReconstruction(world, classifyIntent('иду к реке'));
  reconstruction.selected = { ...reconstruction.selected, label: 'путь к реке', confirmed: true };
  world.historical = { routeArchive: [reconstruction] };
  const archived = findArchivedRoute(world, 'реке');
  assert.ok(archived);
  assert.equal(archived.label, 'путь к реке');
});

test('release guard passes on clean repository', () => {
  const env = { ...process.env };
  if (existsSync(resolve(root, '.env.local'))) {
    env.ALLOW_LOCAL_SECRETS = '1';
  }
  execSync('node scripts/release-guard.js', { cwd: root, stdio: 'pipe', env });
});

test('release archive excludes runtime and secret paths', () => {
  execSync('node scripts/build-release.js', { cwd: root, stdio: 'pipe' });
  const releaseDir = resolve(root, 'dist', 'release');
  assert.ok(existsSync(resolve(releaseDir, 'src')));
  assert.ok(!existsSync(resolve(releaseDir, '.env.local')));
  assert.ok(!existsSync(resolve(releaseDir, 'data', 'new-game-process')));
  const manifest = JSON.parse(readFileSync(resolve(releaseDir, 'RELEASE_MANIFEST.json'), 'utf8'));
  assert.ok(manifest.forbidden.includes('tmp'));
});

test('player profile keeps semantic fields null without LLM seed values', () => {
  const player = buildPlayerProfile({ id: 'player', name: 'Игрок' });
  assert.equal(player.role, null);
  assert.equal(player.status, null);
  assert.equal(player.socialClass, null);
  assert.equal(player.language, null);
  assert.equal(player.fear, 0);
  assert.equal(player.thirst, 0);
});

test('resolveDestination ignores unknown locations outside knowledge map', () => {
  const world = createWorldState({ startText: 'двор' });
  const unknownId = Object.keys(world.locations).find((id) => id !== world.currentLocationId);
  assert.ok(unknownId);
  const unknown = world.locations[unknownId];
  world.player.knowledge_map = { known_places: [world.currentLocationId] };
  assert.equal(resolveDestination(world, unknown.name), null);
});

test('item_take blocks foreign owned scene item without holder', () => {
  const world = createWorldState({ startText: 'двор' });
  world.microPlace = {
    visibleObjects: [{
      id: 'item:scene:coin:1',
      label: 'монета',
      type: 'item',
      owner_id: 'npc-1',
      holder_id: null,
      placement: 'scene',
      visible: true
    }]
  };
  const result = resolveItemAction(world, classifyIntent('беру монету'));
  assert.equal(result.ok, false);
  assert.match(result.text, /чужая вещь/i);
});

test('visible context package rejects silent production fallback', async () => {
  const world = createWorldState({ startText: 'двор' });
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    await assert.rejects(
      () => generateVisibleContextPackage(world, { scene: 'двор' }, { DEEPSEEK_API_KEY: '' }),
      /visible_context_package|LLM provider is required/i
    );
  } finally {
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('memory journal marks deterministic path honestly when provider disabled in tests', async () => {
  const world = createWorldState({ startText: 'двор' });
  const result = await generateMemoryJournalUpdate({
    world,
    playerInput: 'жду',
    masterNarrative: { scene: 'тишина', consequence: 'ничего не изменилось' },
    visiblePackage: { visible_scene: 'тишина' }
  }, { DEEPSEEK_API_KEY: '' });
  assert.equal(result.usedFallback, true);
  assert.equal(result.provider, 'deterministic');
});

test('scene delta resolves pending semantic world entries', () => {
  const world = createWorldState({ startText: 'двор' });
  world.pendingSemanticWorld = [{ kind: 'weather', status: 'pending_llm' }];
  applyStateDelta(world, { scene: { weather: 'снег' } });
  assert.equal(world.pendingSemanticWorld[0]?.status, 'resolved_llm');
});

test('observed actor profile excludes operational reference fields', () => {
  const world = createWorldState({ startText: 'двор' });
  world.npcs = [{
    id: 'npc-1',
    name: 'Степан',
    role: 'староста',
    locationId: world.currentLocationId,
    actorProfile: {
      identity: { originDetail: 'тайна', visibleStatus: 'староста' },
      work: { nextTask: 'дозор', dutyWindow: 'ночь' }
    }
  }];
  const ui = buildUiState(world);
  assert.equal('originDetail' in ui.npcs[0].observedActorProfile.identity, false);
  assert.equal('nextTask' in (ui.npcs[0].observedActorProfile.work ?? {}), false);
});
