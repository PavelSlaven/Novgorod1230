import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createWorldState } from './world/state.js';
import { listSavedWorlds, loadWorldByKey, loadWorldState, saveWorldState } from './world/persistence.js';
import { renderOpeningScene } from './world/engine.js';
import { loadLocalEnv } from './env.js';
import { parseEnvBoolean } from './env-boolean.js';
import { resolveServerConfig } from './server-config.js';
import { buildUiBootstrap, buildUiState, buildClientControlState, sanitizeBootstrapMeta } from './ui-state.js';
import { buildActionHintsInput, resolveActionHints } from './ui/action-hints.js';
import { createActionHintsGenerator } from './ui/action-hints-agent.js';
import { buildClientProcessSnapshot, saveNewGameProcessArtifact } from './ui/process-artifacts.js';
import { createDiagnosticJournal } from './ui/diagnostic-events.js';
import { createFreshWorld } from './world/new-game.js';
import { acknowledgeOpeningDelivery } from './world/new-game-pipeline/index.js';
import {
  adaptFirstGameScreenToUiState,
  adaptPartyTurnScreenToUiState,
  applyPartyScreenToUiState,
  buildPartyTurnBootstrapPayloadFromUiState
} from './ui/party-screen-adapter.js';
import { runPartyTurnPipeline } from './world/turn-runtime/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const uiDir = resolve(__dirname, 'ui');
const srcDir = __dirname;

await loadLocalEnv();
const serverConfig = resolveServerConfig();
const savePath = serverConfig.savePath;
const port = serverConfig.port;
const host = serverConfig.host;
const publicHost = serverConfig.publicHost;
const MAX_JSON_BODY_BYTES = serverConfig.maxJsonBodyBytes;
const UI_SERVER_TOKEN = serverConfig.uiServerToken;
const csrfToken = randomBytes(24).toString('hex');
const STATE_CHANGING_POSTS = new Set(['/api/save', '/api/load', '/api/command', '/api/new-game', '/api/new-game/ack-opening']);
const LEGACY_NEW_GAME_PHASES = new Map([
  ['new_game', 'ng_stage_01'],
  ['new_game_local', 'ng_stage_01'],
  ['new_game_seed', 'ng_stage_01'],
  ['new_game_frame', 'ng_stage_03'],
  ['world_base', 'ng_stage_04'],
  ['new_game_historical', 'ng_stage_03'],
  ['new_game_social', 'ng_stage_04'],
  ['new_game_place', 'ng_stage_09'],
  ['new_game_player', 'ng_stage_11'],
  ['new_game_profile', 'ng_stage_15'],
  ['new_game_location_profile', 'ng_stage_13'],
  ['new_game_scene', 'ng_stage_17'],
  ['new_game_memory', 'ng_stage_18'],
  ['new_game_items', 'ng_stage_16'],
  ['new_game_routes', 'ng_stage_18'],
  ['new_game_hidden', 'ng_stage_19'],
  ['new_game_visible_state', 'ng_stage_20'],
  ['new_game_save', 'ng_stage_25'],
  ['commit_gate', 'ng_stage_25']
]);

const assets = {
  html: await readFile(resolve(uiDir, 'index.html'), 'utf8'),
  css: await readFile(resolve(uiDir, 'styles.css'), 'utf8'),
  app: await readFile(resolve(uiDir, 'app.js'), 'utf8')
};

const serverProcess = createServerProcess();
const initial = await initializeWorld();
let partyScreenPayload = initial.partyScreenPayload ?? initial.world?.partyScreenPayload ?? null;
let partyRuntimeState = initial.partyRuntimeState ?? initial.world?.partyRuntimeState ?? null;
let world = initial.world ?? createWorldState({ startText: process.env.START_TEXT });
let openingText = initial.openingText ?? partyScreenPayload?.openingText ?? renderOpeningScene(world);
if (!world.lastNarratorProse) {
  world.lastNarratorProse = openingText;
}
const bootstrapMeta = {
  hasSavedGame: initial.hasSavedGame,
  debugVisible: parseEnvBoolean(process.env.DEBUG_UI, false),
  authRequired: Boolean(UI_SERVER_TOKEN) || publicHost,
  csrfToken: UI_SERVER_TOKEN ? csrfToken : null,
  apiToken: UI_SERVER_TOKEN || null,
  localOnly: !publicHost
};
const uiStateOptions = {
  includeDebug: bootstrapMeta.debugVisible
};
const actionHintsGenerate = createActionHintsGenerator(process.env);

function buildStatePayload(currentWorld = world) {
  const baseState = buildUiState(currentWorld, uiStateOptions);
  const activeScreen = partyScreenPayload?.partyTurnScreen
    ?? partyScreenPayload?.party_turn_screen
    ?? partyScreenPayload?.firstGameScreen
    ?? partyScreenPayload?.first_game_screen
    ?? null;
  return {
    state: activeScreen ? applyPartyScreenToUiState(baseState, activeScreen) : baseState,
    client: buildClientControlState(currentWorld, bootstrapMeta),
    ...buildPartyScreenBootstrapPayload()
  };
}

function buildPartyScreenBootstrapPayload() {
  const firstGameScreen = partyScreenPayload?.firstGameScreen ?? partyScreenPayload?.first_game_screen ?? null;
  const partyTurnScreen = partyScreenPayload?.partyTurnScreen ?? partyScreenPayload?.party_turn_screen ?? null;
  return {
    partyScreen: partyScreenPayload,
    party_screen: partyScreenPayload,
    partyUiState: partyTurnScreen
      ? adaptPartyTurnScreenToUiState(partyTurnScreen)
      : (firstGameScreen ? adaptFirstGameScreenToUiState(firstGameScreen) : null),
    firstGameScreen,
    first_game_screen: firstGameScreen,
    partyTurnScreen,
    party_turn_screen: partyTurnScreen
  };
}
let lastNewGameArtifact = null;

function buildProcessPayload(snapshot) {
  return buildClientProcessSnapshot(snapshot, {
    includeDiagnostics: bootstrapMeta.debugVisible,
    artifactMode: process.env.NEW_GAME_ARTIFACT_MODE
  });
}

function normalizeErrorMessage(error, fallback = 'Ошибка не указана') {
  if (error instanceof Error) {
    return error.message?.trim() || fallback;
  }
  if (typeof error === 'string') {
    return error.trim() || fallback;
  }
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return error.message.trim() || fallback;
  }
  return fallback;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const authError = verifyRequestAuth(req, url);
    if (authError) {
      return sendJson(res, { ok: false, error: authError.error }, authError.status);
    }

    if (req.method === 'GET' && url.pathname === '/') {
      return sendHtml(res, renderHtml(buildUiBootstrap(world, openingText, bootstrapMeta, buildPartyScreenBootstrapPayload())));
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      return sendJson(res, {
        ok: true,
        meta: sanitizeBootstrapMeta(bootstrapMeta),
        openingText,
        ...buildStatePayload()
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/process') {
      return sendJson(res, {
        ok: true,
        process: buildProcessPayload(serverProcess.snapshot()),
        artifact: lastNewGameArtifact
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/saves') {
      const saves = await listSavedWorlds();
      return sendJson(res, {
        ok: true,
        saves,
        currentWorldKey: world.worldKey
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/save') {
      serverProcess.start({
        phase: 'manual_save',
        label: 'Сохранение',
        message: 'Записываю текущий единственный слот.',
        progress: 75,
        items: [
          { label: 'Текущий мир', meta: 'Готов к записи', state: 'done' },
          { label: 'Сессия', meta: 'Записываю на диск', state: 'active' },
          { label: 'Каталог', meta: 'Доступен через worldKey', state: 'idle' }
        ]
      });
      world.lastUpdatedAt = new Date().toISOString();
      world.catalogDirty = true;
      await saveWorldState(savePath, world);
      serverProcess.done('Игра сохранена.');
      return sendJson(res, {
        ok: true,
        message: 'Игра сохранена в один слот.',
        ...buildStatePayload(),
        process: buildProcessPayload(serverProcess.snapshot())
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/load') {
      const body = await readJsonBody(req);
      const worldKey = String(body?.worldKey ?? '').trim();
      if (!worldKey) {
        return sendJson(res, { ok: false, error: 'Не выбран слот сохранения.' }, 400);
      }

      serverProcess.start({
        phase: 'load',
        label: 'Загрузка сохранения',
        message: 'Открываю выбранную игру.',
        progress: 20,
        items: [
          { label: 'Слот', meta: worldKey, state: 'active' },
          { label: 'Мир', meta: 'Восстановление состояния', state: 'idle' },
          { label: 'Сохранение', meta: 'Запись текущего слота', state: 'idle' }
        ]
      });

      const loaded = await loadWorldByKey(worldKey);
      if (!loaded) {
        serverProcess.fail('Слот не найден.');
        return sendJson(res, { ok: false, error: 'Сохранение не найдено.' }, 404);
      }

      world = loaded;
      partyScreenPayload = loaded.partyScreenPayload ?? null;
      partyRuntimeState = loaded.partyRuntimeState ?? null;
      openingText = world.lastNarratorProse ?? renderOpeningScene(world);
      if (!world.lastNarratorProse) {
        world.lastNarratorProse = openingText;
      }
      await saveWorldState(savePath, world);
      bootstrapMeta.hasSavedGame = true;
      serverProcess.done('Сохранение загружено.');
      return sendJson(res, {
        ok: true,
        message: `Загружено: ${world.player?.name ?? world.worldKey}`,
        openingText,
        ...buildStatePayload(),
        process: buildProcessPayload(serverProcess.snapshot()),
        currentWorldKey: world.worldKey
      });
    }

    if (req.method === 'GET' && url.pathname === '/styles.css') {
      return sendText(res, assets.css, 'text/css; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/app.js') {
      return sendText(res, assets.app, 'application/javascript; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname.endsWith('.js')) {
      const moduleText = await readPublicJsModule(url.pathname);
      if (moduleText != null) {
        return sendText(res, moduleText, 'application/javascript; charset=utf-8');
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/command') {
      const body = await readJsonBody(req);
      const text = String(body?.text ?? '').trim();
      if (!text) {
        return sendJson(res, { ok: false, error: 'Пустая команда.' }, 400);
      }

      if (isRestartCommand(text)) {
        const restarted = await restartWorldWithProcessArtifact(text, '', serverProcess, 'command');
        world = restarted.world;
        openingText = restarted.openingText;
        return sendJson(res, {
          ok: true,
          text: restarted.text,
          openingText,
          ...buildStatePayload(),
          process: buildProcessPayload(serverProcess.snapshot()),
          artifact: restarted.artifact ?? null
        });
      }

      serverProcess.start({
        phase: 'command',
        label: 'Разбор команды',
        message: 'Получен ввод игрока.',
        progress: 15,
        items: [
          { label: 'Ввод', meta: 'Получен от игрока', state: 'active' },
          { label: 'Аудит риска', meta: 'LLM решает, нужна ли проверка', state: 'idle' },
          { label: 'Бросок d20', meta: 'Кодовый бросок d20', state: 'idle' },
          { label: 'Ответ мира', meta: 'LLM и применение хода', state: 'idle' },
          { label: 'Сохранение', meta: 'Каталог и сессия', state: 'idle' }
        ]
      });
      const result = await runCommandThroughActiveRuntime(text);
      serverProcess.update({
        phase: 'command_save',
        label: 'Сохранение',
        message: 'Записываю прогресс игрока и каталог мира.',
        progress: 85,
        items: [
          { label: 'Ввод', meta: 'Получен от игрока', state: 'done' },
          { label: 'Разбор намерения', meta: 'Завершён', state: 'done' },
          { label: 'Ответ мира', meta: 'Применён', state: 'done' },
          { label: 'Сохранение', meta: 'Запись на диск', state: 'active' }
        ]
      });
      await saveWorldState(savePath, world);
      serverProcess.done('Команда обработана.');

      return sendJson(res, {
        ok: true,
        text: result.text,
        ...buildStatePayload(),
        process: buildProcessPayload(serverProcess.snapshot())
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/new-game') {
      const body = await readJsonBody(req);
      const restarted = await restartWorldWithProcessArtifact(body?.text ?? process.env.START_TEXT, body?.playerName ?? '', serverProcess, 'api');
      if (restarted.world) world = restarted.world;
      openingText = restarted.openingText;
      partyScreenPayload = restarted.partyScreenPayload ?? null;
      partyRuntimeState = restarted.partyRuntimeState ?? null;
      bootstrapMeta.hasSavedGame = true;
      return sendJson(res, {
        ok: true,
        text: restarted.text,
        openingText,
        ...buildStatePayload(),
        meta: sanitizeBootstrapMeta(bootstrapMeta),
        process: buildProcessPayload(serverProcess.snapshot()),
        artifact: restarted.artifact ?? null
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/new-game/ack-opening') {
      const body = await readJsonBody(req);
      const firstGameScreen = partyScreenPayload?.firstGameScreen ?? null;
      if (!firstGameScreen) {
        return sendJson(res, { ok: false, error: 'No first_game_screen pending acknowledgement.' }, 409);
      }
      const acknowledged = acknowledgeOpeningDelivery(firstGameScreen, {
        clientAckId: body?.clientAckId ?? body?.client_ack_id ?? `ack:${firstGameScreen.delivery_state?.message_id ?? Date.now()}`,
        shownAt: body?.shownAt ?? body?.shown_at ?? new Date().toISOString()
      });
      partyScreenPayload = {
        ...partyScreenPayload,
        openingText: acknowledged.main_prose,
        firstGameScreen: acknowledged,
        first_game_screen: acknowledged,
        delivery_state: acknowledged.delivery_state
      };
      if (world && typeof world === 'object') {
        world.partyScreenPayload = structuredClone(partyScreenPayload);
        world.catalogDirty = true;
      }
      return sendJson(res, {
        ok: true,
        partyScreen: partyScreenPayload,
        party_screen: partyScreenPayload,
        firstGameScreen: acknowledged,
        first_game_screen: acknowledged
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/action-hints') {
      const playerState = buildUiState(world, uiStateOptions);
      const input = buildActionHintsInput(playerState);
      const resolved = await resolveActionHints(input, { generate: actionHintsGenerate });
      return sendJson(res, {
        ok: true,
        source: resolved.source,
        hints: resolved.hints
      });
    }

    if (req.method === 'GET' && url.pathname === '/healthz') {
      return sendJson(res, { ok: true });
    }

    return sendJson(res, { ok: false, error: 'Not found' }, 404);
  } catch (error) {
    console.error(error);
    serverProcess.fail(normalizeErrorMessage(error));
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return sendJson(res, {
      ok: false,
      error: normalizeErrorMessage(error)
    }, statusCode);
  }
});

server.listen(port, host, () => {
  const address = server.address();
  const listenPort = typeof address === 'object' && address ? address.port : port;
  const listenHost = typeof address === 'object' && address ? address.address : host;
  console.log(`UI server is running at http://${listenHost}:${listenPort}`);
  console.log(`Save file: ${savePath}`);
});

function renderHtml(bootstrap) {
  const serialized = safeJson(bootstrap);
  return assets.html.replace('__UI_BOOTSTRAP__', serialized);
}

function isPathInside(root, candidate) {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function resolvePublicJsPath(pathname) {
  const clean = String(pathname ?? '').replace(/^\//, '').replace(/\\/g, '/');
  if (!clean.endsWith('.js') || clean.includes('..') || clean.startsWith('api/')) {
    return null;
  }

  if (!clean.includes('/')) {
    const uiFile = resolve(uiDir, clean);
    if (isPathInside(uiDir, uiFile)) {
      return uiFile;
    }
    return null;
  }

  const srcFile = resolve(srcDir, clean);
  if (isPathInside(srcDir, srcFile)) {
    return srcFile;
  }
  return null;
}

async function readPublicJsModule(pathname) {
  const filePath = resolvePublicJsPath(pathname);
  if (!filePath) return null;
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return null;
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendText(res, text, contentType) {
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(text);
}

function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    const error = new Error('Content-Type must be application/json');
    error.statusCode = 400;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      const error = new Error('Payload too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function verifyRequestAuth(req, url) {
  if (publicHost && !UI_SERVER_TOKEN) {
    return { status: 503, error: 'UI_SERVER_TOKEN required for non-local host' };
  }

  const isApi = url.pathname.startsWith('/api/');
  const needsToken = publicHost && isApi;
  const needsPostAuth = req.method === 'POST' && STATE_CHANGING_POSTS.has(url.pathname);

  if (!needsToken && !needsPostAuth) return null;
  if (needsPostAuth && !UI_SERVER_TOKEN && !publicHost) return null;

  const token = extractUiToken(req);
  if (!token || !safeEqual(token, UI_SERVER_TOKEN)) {
    return { status: 401, error: 'Unauthorized' };
  }

  if (needsPostAuth) {
    const csrf = req.headers['x-csrf-token'];
    if (typeof csrf !== 'string' || !safeEqual(csrf.trim(), csrfToken)) {
      return { status: 403, error: 'Invalid CSRF token' };
    }
  }

  return null;
}

function extractUiToken(req) {
  const header = req.headers['x-ui-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</gu, '\\u003c')
    .replace(/\u2028|\u2029/g, (char) => (char === '\u2028' ? '\\u2028' : '\\u2029'));
}

async function initializeWorld() {
  serverProcess.start({
    phase: 'boot',
    label: 'Загрузка мира',
    message: 'Читаю сохранение и каталог.',
    items: [
      { label: 'Чтение данных', meta: 'Сохранение и каталог', state: 'active' },
      { label: 'Сбор мира', meta: 'Сценарий, регион, персонажи', state: 'idle' },
      { label: 'Готовность', meta: 'Ожидание первого экрана', state: 'idle' }
    ]
  });
  serverProcess.note({
    kind: 'restore',
    phase: 'boot',
    label: 'Восстановление',
    message: 'Проверяю существующий каталог мира и сессии.'
  });
  const seed = createWorldState({ startText: globalThis.process.env.START_TEXT });
  serverProcess.update({
    phase: 'boot_seed',
    label: 'Создание основы',
    message: 'Собираю начальный мир из сценария.',
    progress: 35,
    items: [
      { label: 'Чтение данных', meta: 'Сохранение и каталог', state: 'done' },
      { label: 'Сбор мира', meta: 'Сценарий, регион, персонажи', state: 'active' },
      { label: 'Готовность', meta: 'Ожидание первого экрана', state: 'idle' }
    ]
  });
  const loaded = await loadWorldState(savePath, seed);

  if (loaded) {
    serverProcess.note({
      kind: 'restore',
      phase: 'boot_restore',
      label: 'Загрузка сохранения',
      message: 'Мир восстановлен из диска без пересборки.'
    });
    serverProcess.done('Мир загружен из сохранения.');
    return {
      world: loaded,
      hasSavedGame: true,
      partyScreenPayload: loaded.partyScreenPayload ?? null,
      partyRuntimeState: loaded.partyRuntimeState ?? null
    };
  }

  serverProcess.note({
    kind: 'new_game',
    phase: 'boot_new_game',
    label: 'Новая игра',
    message: 'Сохранения нет, поэтому собираю полноценную стартовую партию.'
  });
  const created = await createFreshWorld({
    startText: globalThis.process.env.START_TEXT,
    playerName: globalThis.process.env.PLAYER_NAME ?? '',
    enableNewGamePipeline: true,
    savePath,
    env: process.env,
    tracker: serverProcess
  });
  if (!created.world && created.partyScreenPayload) {
    created.world = createWorldState({ startText: globalThis.process.env.START_TEXT });
    created.world.lastNarratorProse = created.openingText ?? '';
    created.world.partyScreenPayload = structuredClone(created.partyScreenPayload);
    created.world.pipeline_runtime = created.pipeline_runtime ?? 'new_lifecycle';
    created.world.legacy_provider_runtime_used = false;
  }
  serverProcess.done('Новый мир создан.');
  return {
    world: created.world ?? null,
    openingText: created.openingText ?? null,
    partyScreenPayload: created.partyScreenPayload ?? null,
    partyRuntimeState: created.world?.partyRuntimeState ?? null,
    hasSavedGame: true
  };
}


async function restartWorldWithProcessArtifact(text, playerName = '', tracker = null, source = 'api') {
  const startedAt = new Date();
  const request = {
    source,
    text: String(text ?? ''),
    playerName: String(playerName ?? '')
  };

  try {
    const result = await restartWorld(text, playerName, tracker);
    const artifactWorld = result.world ?? world;
    const artifact = await saveNewGameProcessArtifact({
      status: 'success',
      startedAt,
      completedAt: new Date(),
      request,
      savePath,
      artifactMode: process.env.NEW_GAME_ARTIFACT_MODE,
      process: tracker?.snapshot?.(),
      pipelineRuntime: result.pipeline_runtime ?? result.newGamePipeline?.pipeline_runtime ?? result.newGamePipeline?.snapshot?.pipeline_runtime ?? null,
      legacyProviderRuntimeUsed: result.legacy_provider_runtime_used ?? false,
      world: artifactWorld,
      state: buildUiState(artifactWorld, { includeDebug: Boolean(process.env.DEBUG_UI?.trim()) }),
      openingText: result.openingText,
      partyScreen: result.partyScreenPayload ?? null,
      first_game_screen: result.firstGameScreen ?? null
    });
    lastNewGameArtifact = artifact;
    tracker?.note?.({
      kind: 'artifact',
      phase: 'new_game_artifact',
      label: 'HTML-снимок',
      message: `Процесс создания мира сохранён: ${artifact.relativePath}`
    });
    return { ...result, artifact };
  } catch (error) {
    tracker?.fail?.(normalizeErrorMessage(error));
    const artifact = await saveNewGameProcessArtifact({
      status: 'error',
      startedAt,
      completedAt: new Date(),
      request,
      savePath,
      artifactMode: process.env.NEW_GAME_ARTIFACT_MODE,
      process: tracker?.snapshot?.(),
      pipelineRuntime: 'new_lifecycle',
      legacyProviderRuntimeUsed: false,
      error
    });
    lastNewGameArtifact = artifact;
    tracker?.note?.({
      kind: 'artifact',
      phase: 'new_game_artifact',
      label: 'HTML-снимок',
      message: `Процесс создания мира с ошибкой сохранён: ${artifact.relativePath}`
    });
    throw error;
  }
}

async function restartWorld(text, playerName = '', tracker = null) {
  tracker?.start?.({
    phase: 'ng_stage_01',
    label: 'Новая игра',
    message: 'Создаю новую стартовую ситуацию.',
    items: [
      { label: 'Проверка формы', meta: 'Имя и стартовый текст', state: 'active' },
      { label: 'Сбор мира', meta: 'Создание карты и NPC', state: 'idle' },
      { label: 'Сохранение', meta: 'Каталог и сессия', state: 'idle' }
    ]
  });
  tracker?.note?.({
    kind: 'new_game',
    phase: 'ng_stage_01',
    label: 'Сбор стартовой ситуации',
    message: 'Формирую стартовый мир, NPC, карту и первые связи.'
  });
  tracker?.note?.({
    kind: 'new_game',
    phase: 'ng_stage_01',
    label: 'Общий pipeline',
    message: 'Переключаюсь на shared createFreshWorld pipeline.'
  });
  const created = await createFreshWorld({
    startText: text,
    playerName,
    enableNewGamePipeline: true,
    savePath,
    env: process.env,
    tracker
  });
  if (!created.world && created.partyScreenPayload) {
    created.world = createWorldState({ startText: text });
    created.world.lastNarratorProse = created.openingText ?? '';
    created.world.pipeline_runtime = created.pipeline_runtime ?? 'new_lifecycle';
    created.world.legacy_provider_runtime_used = false;
  }
  tracker?.done?.(created.firstGameScreen ? 'Стартовый экран партии собран.' : 'Стартовый мир собран и сохранён.');
  if (created.world && created.partyScreenPayload) {
    created.world.partyScreenPayload = structuredClone(created.partyScreenPayload);
    created.world.partyRuntimeState = created.world.partyRuntimeState ?? null;
    created.world.catalogDirty = true;
  }
  return {
    world: created.world ?? null,
    openingText: created.openingText ?? (created.world ? renderOpeningScene(created.world) : ''),
    text: created.text ?? 'Новая игра создана. Мир сброшен к исходной точке.',
    partyScreenPayload: created.partyScreenPayload ?? null,
    partyRuntimeState: created.world?.partyRuntimeState ?? null,
    firstGameScreen: created.firstGameScreen ?? null,
    first_game_screen: created.first_game_screen ?? created.firstGameScreen ?? null,
    partyStartCommitted: created.partyStartCommitted ?? null,
    newGamePipeline: created.newGamePipeline ?? null
  };
}

async function runCommandThroughActiveRuntime(text) {
  const result = await runPartyTurnPipeline({
    world,
    partyScreenPayload,
    partyRuntimeState,
    bootstrapPayload: ensurePartyRuntimeBootstrapPayload(),
    rawText: text,
    env: process.env
  });
  partyRuntimeState = result.partyRuntimeState;
  partyScreenPayload = result.partyScreenPayload;
  openingText = result.text;
  return { world, text: result.text };
}

function ensurePartyRuntimeBootstrapPayload() {
  if (partyScreenPayload) return partyScreenPayload;
  const playerState = buildUiState(world, uiStateOptions);
  const bootstrapPayload = buildPartyTurnBootstrapPayloadFromUiState(playerState, {
    partyId: world?.partyScreenPayload?.party_id ?? world?.worldKey ?? 'party_runtime',
    turnNumber: Number(world?.partyRuntimeState?.current_turn_number ?? 0),
    messageId: `bootstrap:${world?.worldKey ?? 'world'}:${Date.now()}`
  });
  partyScreenPayload = bootstrapPayload;
  if (world && typeof world === 'object') {
    world.partyScreenPayload = structuredClone(bootstrapPayload);
    world.catalogDirty = true;
  }
  return bootstrapPayload;
}

function isRestartCommand(text) {
  return /^(новая игра|начать заново|новая сессия|restart|reset)$/iu.test(text);
}

function normalizeServerProcessPhase(phase) {
  const value = String(phase ?? '');
  if (/^ng_stage_(0[1-9]|1[0-9]|2[0-6])$/u.test(value)) return value;
  return LEGACY_NEW_GAME_PHASES.get(value) ?? value;
}

function createServerProcess() {
  const diagnosticJournal = createDiagnosticJournal({ maxEntries: 500 });
  const state = {
    busy: false,
    phase: 'idle',
    label: 'Ожидание',
    message: 'Сервер готов.',
    progress: 0,
    items: [],
    journal: [],
    updatedAt: new Date().toISOString(),
    finishedAt: null
  };

  return {
    start(next = {}) {
      state.busy = true;
      state.progress = 10;
      apply(next);
      recordJournal('start', next);
    },
    update(next = {}) {
      state.busy = true;
      if (Number.isFinite(next.progress)) state.progress = next.progress;
      apply(next);
      recordJournal('update', next);
    },
    fail(message = 'Ошибка.') {
      state.busy = false;
      state.phase = 'error';
      state.label = 'Ошибка';
      state.message = message;
      state.progress = 100;
      state.finishedAt = new Date().toISOString();
      state.updatedAt = state.finishedAt;
      pushJournal({
        kind: 'error',
        phase: 'error',
        label: 'Ошибка',
        message,
        includeRawDetails: true
      });
    },
    done(message = 'Готово.') {
      state.busy = false;
      state.phase = 'done';
      state.label = 'Готово';
      state.message = message;
      state.progress = 100;
      state.finishedAt = new Date().toISOString();
      state.items = (Array.isArray(state.items) ? state.items : []).map((item) => ({
        ...item,
        state: 'done',
        progress: 100
      }));
      pushJournal({
        kind: 'done',
        phase: state.phase,
        label: state.label,
        message
      });
      state.updatedAt = new Date().toISOString();
    },
    note(entry = {}) {
      pushJournal(entry);
    },
    snapshot() {
      const diagnosticJournalSnapshot = diagnosticJournal.snapshot({
        includeDiagnostics: true,
        includeRawDetails: true
      });
      return structuredClone({
        ...state,
        diagnosticJournal: diagnosticJournalSnapshot,
        journal: diagnosticJournalSnapshot
      });
    },
    telemetry({ onStart, provider = null, model = null } = {}) {
      return {
        diagnosticJournal,
        onStage(stage) {
          if (!stage) return;
          if (stage.phase === 'llm_request' && typeof onStart === 'function') {
            onStart(stage);
          }
          const phase = normalizeServerProcessPhase(stage.phase ?? state.phase);
          state.busy = true;
          state.phase = phase;
          state.label = stage.label ?? state.label;
          state.message = stage.message ?? state.message;
          if (Array.isArray(stage.items)) {
            state.items = stage.items.map((item) => structuredClone(item));
          }
          state.progress = Number.isFinite(stage.progress)
            ? stage.progress
            : stage.phase === 'llm_request'
              ? 55
              : stage.phase === 'llm_response'
                ? 90
                : stage.phase === 'llm_retry'
                  ? Math.min(85, state.progress + 5)
                  : state.progress;
          syncJournal();
          state.updatedAt = new Date().toISOString();
        },
        onCall() {
          syncJournal();
          state.updatedAt = new Date().toISOString();
        }
      };
    }
  };

  function apply(next = {}) {
    state.phase = normalizeServerProcessPhase(next.phase ?? state.phase);
    state.label = next.label ?? state.label;
    state.message = next.message ?? state.message;
    if (Number.isFinite(next.progress)) state.progress = next.progress;
    if (Array.isArray(next.items)) {
      state.items = next.items.map((item) => structuredClone(item));
    }
    state.updatedAt = new Date().toISOString();
  }

  function recordJournal(kind, next = {}) {
    pushJournal({
      kind,
      phase: normalizeServerProcessPhase(next.phase ?? state.phase),
      label: next.label ?? state.label,
      message: next.message ?? state.message,
      items: Array.isArray(next.items) ? next.items.map((item) => structuredClone(item)) : null,
      progress: Number.isFinite(next.progress) ? next.progress : state.progress,
      requestPreview: next.requestPreview ?? null,
      requestRaw: next.requestRaw ?? null,
      responsePreview: next.responsePreview ?? null,
      responseRaw: next.responseRaw ?? null,
      requestSections: next.requestSections ?? null,
      responseSections: next.responseSections ?? null
    });
  }

  function pushJournal(entry = {}) {
    diagnosticJournal.record({
      at: new Date().toISOString(),
      kind: entry.kind ?? 'info',
      phase: normalizeServerProcessPhase(entry.phase ?? state.phase),
      label: entry.label ?? state.label,
      message: entry.message ?? state.message,
      progress: Number.isFinite(entry.progress) ? entry.progress : state.progress,
      attempt: entry.attempt ?? null,
      maxAttempts: entry.maxAttempts ?? null,
      provider: entry.provider ?? null,
      model: entry.model ?? null,
      temperature: entry.temperature ?? null,
      maxTokens: entry.maxTokens ?? null,
      durationMs: entry.durationMs ?? null,
      requestPreview: entry.requestPreview ?? null,
      requestRaw: entry.requestRaw ?? null,
      responsePreview: entry.responsePreview ?? null,
      responseRaw: entry.responseRaw ?? null,
      requestSections: entry.requestSections ?? null,
      responseSections: entry.responseSections ?? null,
      parsed: entry.parsed ?? entry.parsedJson ?? null,
      validation: entry.validation ?? entry.validationResult ?? null,
      audit: entry.audit ?? entry.auditResult ?? null,
      repair: entry.repair ?? null,
      error: entry.error ?? null,
      stack: entry.stack ?? null,
      retry: entry.retry ?? null,
      includeRawDetails: entry.includeRawDetails ?? false
    });
    syncJournal();
  }

  function syncJournal() {
    state.journal = diagnosticJournal.snapshot({ includeDiagnostics: true, includeRawDetails: true });
  }
}
