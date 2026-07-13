import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadLocalEnv } from '../src/env.js';
import { resolveServerConfig } from '../src/server-config.js';
import { getProviderConfig } from '../src/world/provider-config.js';
import { classifyIntent } from '../src/world/intent.js';
import { createWorldState } from '../src/world/state.js';
import { buildPlayerProfile } from '../src/world/entities.js';
import { resolveItemAction } from '../src/world/item-resolver.js';
import { parseTravelDirection, travelReturn } from '../src/world/location.js';
import { planMasterTurnSync, buildMasterPromptSync } from '../src/world/master.js';
import { loadDesignBundleSync } from '../src/world/corpus-loader.js';
import {
  findForbiddenPublicKeys,
  sanitizeActorPublicProfile,
  validateActorPublicProfile,
  validateLocationMaterialState,
  validateSocialTissue
} from '../src/world/json-contracts.js';
import { buildUiState } from '../src/ui-state.js';
import { saveNewGameProcessArtifact } from '../src/ui/process-artifacts.js';

const root = resolve(import.meta.dirname, '..');
const SECRET_SENTINEL = 'SECRET_SENTINEL_123';

test('resolveServerConfig reads values from .env.local in cwd', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xiii-env-'));
  try {
    writeFileSync(join(dir, '.env.local'), [
      'PORT=3999',
      'HOST=0.0.0.0',
      'UI_SERVER_TOKEN=test-token',
      'SAVE_PATH=data/custom-save.json',
      'MAX_JSON_BODY_BYTES=1024'
    ].join('\n'), 'utf8');
    const saved = { ...process.env };
    for (const key of ['PORT', 'HOST', 'UI_SERVER_TOKEN', 'SAVE_PATH', 'MAX_JSON_BODY_BYTES']) {
      delete process.env[key];
    }
    try {
      await loadLocalEnv(dir);
      const config = resolveServerConfig(process.env, dir);
      assert.equal(config.port, 3999);
      assert.equal(config.host, '0.0.0.0');
      assert.equal(config.uiServerToken, 'test-token');
      assert.equal(config.savePath, resolve(dir, 'data/custom-save.json'));
      assert.equal(config.maxJsonBodyBytes, 1024);
      assert.equal(config.publicHost, true);
    } finally {
      process.env = saved;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('provider config is not_configured without api key', () => {
  const saved = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const config = getProviderConfig(process.env);
    assert.equal(config.provider, 'not_configured');
    assert.equal(config.enabled, false);
  } finally {
    if (saved === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = saved;
  }
});

test('validateActorPublicProfile rejects hidden motives and trueStatus', () => {
  assert.equal(validateActorPublicProfile({ id: 'npc', hidden_motives: ['убить игрока'] }), null);
  assert.equal(validateActorPublicProfile({ id: 'npc', trueStatus: 'шпион' }), null);
  assert.ok(validateActorPublicProfile({ id: 'npc', visibleStatus: 'стражник' }));
});

test('sanitizeActorPublicProfile strips forbidden keys recursively', () => {
  const clean = sanitizeActorPublicProfile({
    id: 'npc',
    mind: { hidden: [SECRET_SENTINEL], goals: ['работать'] }
  });
  assert.equal(clean.mind.hidden, undefined);
  assert.equal(clean.mind.goals, undefined);
  assert.equal(findForbiddenPublicKeys(clean).length, 0);
});

test('master prompt dossier does not include hidden sentinel', () => {
  const world = createWorldState({ startText: 'двор' });
  world.npcs[0].actorProfile = {
    identity: { name: world.npcs[0].name },
    mind: { hidden: [SECRET_SENTINEL], goals: ['работать'] }
  };
  const plan = planMasterTurnSync(world, 'осматриваюсь');
  const prompt = plan.frame.prompt ?? buildMasterPromptSync(plan.frame);
  assert.doesNotMatch(prompt, new RegExp(SECRET_SENTINEL));
});

test('buildUiState omits hidden sentinel from public npc profile', () => {
  const world = createWorldState({ startText: 'двор' });
  world.npcs[0].actorProfile = {
    identity: { name: world.npcs[0].name },
    mind: { hidden: [SECRET_SENTINEL] }
  };
  const ui = buildUiState(world, { includeDebug: false });
  const payload = JSON.stringify(ui.visibleNpcs ?? ui.npcs ?? []);
  assert.doesNotMatch(payload, new RegExp(SECRET_SENTINEL));
});

test('validateLocationMaterialState requires location id and material fields', () => {
  assert.equal(validateLocationMaterialState({ landmarks: [] }), null);
  assert.ok(validateLocationMaterialState({
    location_id: 'yard',
    material_state: { mood: 'спокойное' },
    visibility: 'visible',
    access: 'open',
    exits: [{ label: 'к реке', to: 'river' }],
    occupants: []
  }));
});

test('validateSocialTissue rejects object facts; accepts string[] only', () => {
  const valid = validateSocialTissue({
    version: 1,
    schema: 'social_tissue',
    formalOwner: 'хозяин',
    actualManager: 'приказчик',
    dependentGroups: [],
    families: ['двор'],
    trade: [],
    rumors: [],
    tensions: [],
    obligations: [],
    rhythm: 'дневной',
    accessRules: []
  });
  const invalid = validateSocialTissue({
    version: 1,
    schema: 'social_tissue',
    formalOwner: 'хозяин',
    actualManager: 'приказчик',
    dependentGroups: [],
    families: [{ label: 'двор', visibility: 'public' }],
    trade: [],
    rumors: [],
    tensions: [],
    obligations: [],
    rhythm: 'дневной',
    accessRules: []
  });
  assert.ok(valid);
  assert.equal(invalid, null);
});

test('item_store moves existing item into existing container', () => {
  const world = createWorldState({ startText: 'двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [{ id: 'item:player:bread:1', label: 'хлеб', type: 'food', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'quick' }],
      equipment: [],
      weapons: [],
      armor: []
    }
  }, { currentLocationId: world.currentLocationId });
  world.microPlace = {
    containers: [{
      id: 'bag:1',
      label: 'сумка',
      type: 'container',
      access: 'quick',
      opened: true,
      contents: []
    }]
  };
  const result = resolveItemAction(world, classifyIntent('кладу хлеб в сумку'));
  assert.equal(result.ok, true);
  assert.match(result.text, /хлеб/);
  assert.ok(world.microPlace.containers[0].contents.some((entry) => String(entry.label).includes('хлеб')));
});

test('item_store blocks closed container', () => {
  const world = createWorldState({ startText: 'двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [{ id: 'item:player:bread:1', label: 'хлеб', type: 'food', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'quick' }],
      equipment: [],
      weapons: [],
      armor: []
    }
  }, { currentLocationId: world.currentLocationId });
  world.microPlace = {
    containers: [{
      id: 'chest:1',
      label: 'сундук',
      type: 'container',
      access: 'closed_container',
      locked: false,
      opened: false,
      contents: []
    }]
  };
  const result = resolveItemAction(world, classifyIntent('кладу хлеб в сундук'));
  assert.equal(result.ok, false);
  assert.match(result.text, /открыть/i);
});

test('item_give creates pending transfer without changing owner', () => {
  const world = createWorldState({ startText: 'двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [{ id: 'item:player:knife:1', label: 'нож', type: 'weapon', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'quick' }],
      equipment: [],
      weapons: [],
      armor: []
    }
  }, { currentLocationId: world.currentLocationId });
  const beforeOwner = world.player.items.carried_items[0].owner_id;
  const result = resolveItemAction(world, classifyIntent('передаю нож стражнику'));
  assert.equal(result.ok, true);
  assert.equal(world.player.items.carried_items[0].owner_id, beforeOwner);
  assert.equal(world.pendingInteractions?.[0]?.type, 'pending_item_transfer');
});

test('item_use consumes bandage-like item', () => {
  const world = createWorldState({ startText: 'двор' });
  world.player = buildPlayerProfile({
    id: 'player',
    name: 'Игрок',
    items: {
      carried_items: [{ id: 'item:player:bandage:1', label: 'бинт', type: 'medical', placement: 'carried', holder_id: 'player', owner_id: 'player', access: 'quick' }],
      equipment: [],
      weapons: [],
      armor: []
    }
  }, { currentLocationId: world.currentLocationId });
  const result = resolveItemAction(world, classifyIntent('использую бинт'));
  assert.equal(result.ok, true);
  assert.match(result.text, /израсходован/i);
  assert.equal(world.player.items.carried_items.length, 0);
});

test('parseTravelDirection detects northern long course phrase', () => {
  assert.equal(parseTravelDirection('иду на север'), 'север');
});

test('travelReturn uses last_route_id archive entry', () => {
  const world = createWorldState({ startText: 'двор' });
  const originId = world.currentLocationId;
  const destinationId = Object.keys(world.locations).find((id) => id !== originId);
  world.current_position.last_route_id = 'route:test:1';
  world.historical.routeArchive = [{
    id: 'route:test:1',
    originLocationId: originId,
    selected: { id: 'route:test:1', minutes: 30 },
    target: 'река'
  }];
  syncCurrentPlace(world, { location_id: destinationId, last_route_id: 'route:test:1' });
  const result = travelReturn(world);
  assert.equal(result.ok, true);
  assert.equal(world.current_position.location_id, originId);
});

function syncCurrentPlace(world, patch) {
  world.current_position = { ...(world.current_position ?? {}), ...patch };
  world.currentLocationId = world.current_position.location_id ?? world.currentLocationId;
}

test('movement bundle contains long course and knowledge map rules', () => {
  const bundle = loadDesignBundleSync('movement');
  assert.match(bundle, /дальний курс/i);
  assert.match(bundle, /last_route_id/i);
  assert.match(bundle, /карта знаний/i);
});

test('inventory bundle contains ownership access container rules', () => {
  const bundle = loadDesignBundleSync('inventory');
  assert.match(bundle, /(контейнер|container)/i);
  assert.match(bundle, /(владел|ownership)/i);
  assert.match(bundle, /(доступ|access)/i);
  assert.match(bundle, /(риск|risk)/i);
  assert.match(bundle, /(нельзя создавать|не создаёт предмет|fixed items)/i);
});

test('release guard fails when .env.local exists without allow flag', () => {
  if (!existsSync(resolve(root, '.env.local'))) return;
  assert.throws(() => {
    execSync('node scripts/release-guard.js', {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, ALLOW_LOCAL_SECRETS: '' }
    });
  });
});

test('release guard passes locally only with ALLOW_LOCAL_SECRETS', () => {
  const env = { ...process.env };
  if (existsSync(resolve(root, '.env.local'))) {
    env.ALLOW_LOCAL_SECRETS = '1';
  }
  execSync('node scripts/release-guard.js', { cwd: root, stdio: 'pipe', env });
});

test('release verify rejects archive containing .env.local', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xiii-bad-zip-'));
  const zipPath = join(dir, 'bad.zip');
  try {
    if (process.platform === 'win32') {
      const staging = join(dir, 'staging');
      const badFile = join(staging, '.env.local');
      execSync(`mkdir "${staging}"`);
      writeFileSync(badFile, 'DEEPSEEK_API_KEY=your_key_here\n', 'utf8');
      execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force"`, { stdio: 'pipe' });
    } else {
      writeFileSync(join(dir, '.env.local'), 'DEEPSEEK_API_KEY=your_key_here\n', 'utf8');
      execSync(`zip -r "${zipPath}" .env.local`, { cwd: dir, stdio: 'pipe' });
    }
    assert.throws(() => {
      execSync(`node scripts/verify-release-archive.js "${zipPath}"`, { cwd: root, stdio: 'pipe' });
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('release zip and verify pass on clean dist release', () => {
  const env = { ...process.env };
  if (existsSync(resolve(root, '.env.local'))) env.ALLOW_LOCAL_SECRETS = '1';
  execSync('node scripts/build-release.js', { cwd: root, stdio: 'pipe', env });
  execSync('node scripts/zip-release.js', { cwd: root, stdio: 'pipe', env });
  execSync('node scripts/verify-release-archive.js', { cwd: root, stdio: 'pipe' });
});

test('docs graph verify passes for bundled corpus graph', () => {
  execSync('node scripts/docs-graph-verify.js', { cwd: root, stdio: 'pipe' });
});

test('developer_safe artifact hides hidden motive and raw llm fields', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xiii-safe-artifact-'));
  const previousMode = process.env.NEW_GAME_ARTIFACT_MODE;
  process.env.NEW_GAME_ARTIFACT_MODE = 'developer_safe';
  try {
    const artifact = await saveNewGameProcessArtifact({
      artifactDir: dir,
      status: 'success',
      completedAt: new Date('2026-06-21T10:00:00.000Z'),
      process: {
        phase: 'done',
        label: 'Готово',
        message: 'ok',
        progress: 100,
        items: [],
        journal: [{
          at: '2026-06-21T10:00:02.000Z',
          kind: 'done',
          label: 'Готово',
          message: 'ok',
          requestRaw: [{ role: 'system', content: 'raw' }],
          responseRaw: '{"sourceDossier":"leak"}'
        }]
      },
      state: { provider: { provider: 'deepseek', model: 'test' } },
      world: {
        worldId: 'w1',
        worldKey: 'k1',
        scenarioId: 's1',
        hidden_motives: [SECRET_SENTINEL],
        sourceDossier: 'leak'
      }
    });
    const html = readFileSync(artifact.filePath, 'utf8');
    assert.doesNotMatch(html, new RegExp(SECRET_SENTINEL));
    assert.doesNotMatch(html, /sourceDossier/);
    assert.doesNotMatch(html, /Запрос · raw/);
    assert.doesNotMatch(html, /Ответ · raw/);
  } finally {
    if (previousMode === undefined) delete process.env.NEW_GAME_ARTIFACT_MODE;
    else process.env.NEW_GAME_ARTIFACT_MODE = previousMode;
    rmSync(dir, { recursive: true, force: true });
  }
});
