import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorldState } from '../src/world/state.js';
import {
  assertPublicUiState,
  buildClientControlState,
  buildUiState,
  sanitizeBootstrapMeta
} from '../src/ui-state.js';
import { PUBLIC_UI_ROOT_KEYS } from '../src/world/json-contracts.js';
import { buildInventoryView } from '../src/ui/inventory-view.js';
import { buildKnowledgeGraph } from '../src/ui/knowledge-graph.js';
import { buildActionHintsInput, buildFallbackActionHints, resolveActionHints } from '../src/ui/action-hints.js';
import { deriveCarriedWeight } from '../src/world/load-model.js';
import { rollD20, RNG_ALGORITHM } from '../src/world/rng.js';

const root = resolve(import.meta.dirname, '..');

test('public UI never exposes key NPC hidden mental profile', () => {
  const world = createWorldState({ startText: 'двор' });
  world.npcs = [{
    id: 'npc:key',
    profileLevel: 'key',
    name: 'Степан',
    locationId: world.currentLocationId,
    current_position: { location_id: world.currentLocationId },
    motivation: 'тайный донос',
    goals: ['донести'],
    fears: ['боится хозяина'],
    memory: ['видел кражу'],
    actorProfile: {
      profileLevel: 'key',
      mind: { goals: ['скрытая цель'], fears: ['скрытый страх'], memory: ['тайная память'] }
    }
  }];

  const ui = buildUiState(world, { includeDebug: false });
  const payload = JSON.stringify(ui);

  assert.doesNotMatch(payload, /тайный|скрыт|донести|боится хозяина/);
  assert.equal(ui.npcs[0].actorProfile?.mind?.goals?.length ?? 0, 0);
  assertPublicUiState(ui);
});

test('public UI state root keys follow allowlist', () => {
  const world = createWorldState({ startText: 'переправа' });
  const ui = buildUiState(world, { includeDebug: false });

  for (const key of Object.keys(ui)) {
    assert.ok(PUBLIC_UI_ROOT_KEYS.has(key), `unexpected public key: ${key}`);
  }
  assert.equal('worldId' in ui, false);
  assert.equal('worldKey' in ui, false);
  assert.equal('scenarioId' in ui, false);
  assert.equal('catalogDirty' in ui, false);
});

test('client control state keeps technical ids separate from player-facing state', () => {
  const world = createWorldState({ startText: 'двор' });
  const client = buildClientControlState(world, { hasSavedGame: true });

  assert.equal(typeof client.worldKey, 'string');
  assert.equal(typeof client.worldId, 'string');
  assert.equal(client.hasSavedGame, true);
});

test('bootstrap meta omits api token outside local mode', () => {
  const meta = sanitizeBootstrapMeta({
    localOnly: false,
    apiToken: 'secret-token',
    csrfToken: 'csrf',
    debugVisible: false
  });
  assert.equal('apiToken' in meta, false);
  assert.equal(meta.csrfToken, 'csrf');
});

test('inventory overlay does not include property_not_carried', () => {
  const view = buildInventoryView({
    items: {
      carried_items: [{ label: 'нож' }],
      weapons: [{ label: 'нож' }],
      property_not_carried: [{ label: 'лодка у пристани' }]
    }
  });
  const text = JSON.stringify(view);
  assert.match(text, /нож/);
  assert.doesNotMatch(text, /лодка у пристани/);
  assert.equal(view.sections.some((section) => section.key === 'property'), false);
});

test('map graph contains only places routes and directions', () => {
  const graph = buildKnowledgeGraph({
    place: { name: 'двор', exits: [{ label: 'к воротам' }] },
    orientation: { locationId: 'loc:yard' },
    knowledgeMap: {
      knownPlaces: [{ id: 'loc:river', label: 'река' }],
      knownRoutes: [{ label: 'тракт' }],
      knownPeople: [{ label: 'Степан' }],
      knownFacts: [{ label: 'свидетели у ворот' }]
    }
  });

  assert.equal(graph.nodes.some((node) => node.id.includes('knowledge:person')), false);
  assert.equal(graph.nodes.some((node) => node.id.includes('knowledge:fact')), false);
  assert.equal(graph.nodes.some((node) => node.type === 'known_place'), true);
});

test('action hints use visible-only input and fallback cap', async () => {
  const input = buildActionHintsInput({
    visibleScene: {
      prose: 'У ворот стоит староста.',
      markup: {
        highlights: Array.from({ length: 8 }, (_, index) => ({
          label: `объект ${index + 1}`,
          action: 'inspect'
        }))
      }
    },
    player: {
      status: 'путник',
      states: { health: 80, satiety: 55, vigor: 40 },
      items: { summaryText: 'В руках: пусто · Груз: лёгкий' }
    }
  });

  const resolved = await resolveActionHints(input);
  assert.equal(resolved.source, 'fallback');
  assert.ok(resolved.hints.length <= 5);
  assert.ok(resolved.hints.every((hint) => typeof hint.text === 'string' && hint.text.length > 0));
  assert.deepEqual(buildFallbackActionHints(input).length, resolved.hints.length);
});

test('deriveCarriedWeight includes weapons armor clothing and containers once by id', () => {
  const shared = { id: 'item:knife', weight: 1.2, label: 'нож' };
  const total = deriveCarriedWeight({
    items: {
      carried_items: [shared],
      equipment: [{ id: 'item:knife', weight: 1.2 }],
      weapons: [{ id: 'item:axe', weight: 2 }],
      armor: [{ id: 'item:coat', weight: 3 }],
      clothing: [{ id: 'item:coat', weight: 3 }],
      containers: [{ id: 'item:bag', weight: 0.5 }]
    }
  });
  assert.equal(total, 6.7);
});

test('production rng is reproducible by world seed and counter', () => {
  const worldA = { rng: { seed: 'abc', counter: 0, algorithm: RNG_ALGORITHM } };
  const worldB = { rng: { seed: 'abc', counter: 0, algorithm: RNG_ALGORITHM } };
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    assert.equal(rollD20({ world: worldA, testMode: false }).value, rollD20({ world: worldB, testMode: false }).value);
    assert.equal(worldA.rng.counter, 1);
  } finally {
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('audit submission --zip checks external archive via release guard', () => {
  const tmp = resolve(root, 'tmp', 'op9-good-submission.zip');
  mkdirSync(resolve(root, 'tmp'), { recursive: true });
  if (process.platform === 'win32') {
    const escaped = tmp.replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -Command "$d=Join-Path $env:TEMP 'op9good'; New-Item -ItemType Directory -Force -Path $d | Out-Null; Set-Content -Path (Join-Path $d 'README.txt') -Value 'ok'; Compress-Archive -Path (Join-Path $d '*') -DestinationPath '${escaped}' -Force"`,
      { stdio: 'pipe' }
    );
  } else {
    const dir = resolve(root, 'tmp', 'op9good');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'README.txt'), 'ok');
    execSync(`zip -r "${tmp}" .`, { cwd: dir, stdio: 'pipe' });
  }
  if (!existsSync(tmp)) {
    assert.fail('test zip was not created');
  }
  execSync(`node scripts/audit-submission.js --zip "${tmp}"`, { cwd: root, stdio: 'pipe' });
});
