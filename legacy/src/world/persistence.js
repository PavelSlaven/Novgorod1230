import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorldCatalog, buildWorldSession, migrateWorldState, restoreWorldState } from './state.js';

function getCatalogPath(worldKey) {
  const catalogDir = process.env.WORLD_CATALOG_DIR
    ? resolve(process.cwd(), process.env.WORLD_CATALOG_DIR)
    : resolve(process.cwd(), 'data', 'world-catalogs');
  const safeKey = encodeURIComponent(String(worldKey ?? 'world'));
  return resolve(catalogDir, `${safeKey}.json`);
}

function getSessionSnapshotPath(worldKey) {
  const sessionDir = process.env.WORLD_SESSION_DIR
    ? resolve(process.cwd(), process.env.WORLD_SESSION_DIR)
    : resolve(process.cwd(), 'data', 'world-sessions');
  const safeKey = encodeURIComponent(String(worldKey ?? 'world'));
  return resolve(sessionDir, `${safeKey}.json`);
}

async function readJson(path) {
  try {
    const text = await readFile(normalizePath(path), 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(path, value) {
  const resolvedPath = normalizePath(path);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, JSON.stringify(value, null, 2), 'utf8');
}

function normalizePath(path) {
  return path instanceof URL ? fileURLToPath(path) : path;
}

function getCatalogDir() {
  return process.env.WORLD_CATALOG_DIR
    ? resolve(process.cwd(), process.env.WORLD_CATALOG_DIR)
    : resolve(process.cwd(), 'data', 'world-catalogs');
}

function summarizeCatalog(catalog, sessionMeta = {}) {
  const sessionSnapshot = sessionMeta.sessionSnapshot && typeof sessionMeta.sessionSnapshot === 'object'
    ? sessionMeta.sessionSnapshot
    : null;
  const viewSource = sessionSnapshot ?? catalog ?? {};
  const title = trimSummaryText(viewSource?.player?.name)
    || trimSummaryText(viewSource?.place?.name)
    || trimSummaryText(viewSource?.region?.name)
    || trimSummaryText(viewSource?.worldKey)
    || 'Сохранение';
  const season = trimSummaryText(viewSource?.history?.season);
  const year = Number.isFinite(viewSource?.history?.year) ? viewSource.history.year : null;
  const clock = viewSource?.clock && typeof viewSource.clock === 'object' ? viewSource.clock : null;
  const clockText = summarizeClock(clock, season, year);
  const lastUpdatedAt = sessionMeta.lastUpdatedAt ?? viewSource?.lastUpdatedAt ?? catalog?.lastUpdatedAt ?? null;
  const lastEventText = summarizeLastEvent(sessionSnapshot, catalog);

  return {
    worldId: viewSource?.worldId ?? null,
    worldKey: viewSource?.worldKey ?? null,
    scenarioId: viewSource?.scenarioId ?? null,
    createdAt: viewSource?.createdAt ?? null,
    lastUpdatedAt,
    clock: clock ? structuredClone(clock) : null,
    clockText,
    history: {
      era: viewSource?.history?.era ?? null,
      year,
      season: season || null
    },
    region: {
      name: viewSource?.region?.name ?? null
    },
    place: {
      name: viewSource?.place?.name ?? null,
      kind: viewSource?.place?.kind ?? null
    },
    player: {
      name: viewSource?.player?.name ?? null,
      role: viewSource?.player?.role ?? null,
      status: viewSource?.player?.status ?? null
    },
    title,
    hasSessionSnapshot: Boolean(sessionMeta.hasSessionSnapshot),
    saveKindText: sessionMeta.hasSessionSnapshot ? 'Сессия' : 'Снимок каталога',
    lastEventText
  };
}

function summarizeClock(clock, season, year) {
  const parts = [];
  if (season || year) {
    parts.push([season, year ? `${year} г.` : null].filter(Boolean).join(' '));
  }
  if (clock && Number.isFinite(clock.hour) && Number.isFinite(clock.minute)) {
    parts.push(`${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`);
  }
  return parts.filter(Boolean).join(' · ') || 'время неизвестно';
}

function trimSummaryText(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^неизвестно$/i.test(text)) return '';
  return text;
}

function summarizeLastEvent(sessionSnapshot, catalog) {
  const candidates = [
    sessionSnapshot?.journal,
    sessionSnapshot?.events,
    catalog?.journal,
    catalog?.events
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length === 0) continue;
    const text = summarizeEventEntry(candidate.at(-1));
    if (text) return text;
  }

  return trimSummaryText(sessionSnapshot?.lastNarratorProse ?? catalog?.lastNarratorProse ?? '');
}

function summarizeEventEntry(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return trimSummaryText(entry);
  if (typeof entry !== 'object') return '';

  const fields = [
    entry.summary,
    entry.result,
    entry.detail,
    entry.message,
    entry.text,
    entry.title,
    entry.input
  ];

  for (const field of fields) {
    const text = trimSummaryText(field);
    if (text) {
      return text.length > 140 ? `${text.slice(0, 137).trimEnd()}…` : text;
    }
  }

  return '';
}

export async function loadWorldState(sessionPath, seed = {}) {
  const session = await readJson(sessionPath);
  const catalogKey = session?.worldKey ?? seed.worldKey ?? null;
  const catalog = catalogKey ? await readJson(getCatalogPath(catalogKey)) : null;

  if (!session) {
    if (catalog) {
      return restoreWorldState(catalog, {});
    }
    return null;
  }

  if (catalog) {
    return restoreWorldState(catalog, session ?? {});
  }

  if (isLegacyFullSession(session)) {
    const world = migrateWorldState(session);
    await saveInitialWorld(sessionPath, world);
    return world;
  }

  return null;
}

export async function listSavedWorlds() {
  const catalogDir = getCatalogDir();
  let entries = [];
  try {
    entries = await readdir(catalogDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }

  const saves = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const catalog = await readJson(resolve(catalogDir, entry.name));
    if (!catalog || typeof catalog !== 'object' || !catalog.worldKey) continue;
    const sessionSnapshot = await readJson(getSessionSnapshotPath(catalog.worldKey));
    saves.push(summarizeCatalog(catalog, {
      hasSessionSnapshot: Boolean(sessionSnapshot),
      lastUpdatedAt: sessionSnapshot?.lastUpdatedAt ?? null,
      sessionSnapshot
    }));
  }

  saves.sort((left, right) => compareDates(right.lastUpdatedAt ?? right.createdAt, left.lastUpdatedAt ?? left.createdAt));
  return saves;
}

export async function loadWorldByKey(worldKey) {
  const catalog = await readJson(getCatalogPath(worldKey));
  if (!catalog || typeof catalog !== 'object') return null;
  const session = await readJson(getSessionSnapshotPath(worldKey));
  return restoreWorldState(catalog, session ?? {});
}

export async function saveInitialWorld(sessionPath, world) {
  const catalogPath = getCatalogPath(world.worldKey);
  const snapshotPath = getSessionSnapshotPath(world.worldKey);
  await writeJson(catalogPath, buildWorldCatalog(world));
  await writeJson(snapshotPath, buildWorldSession(world));
  await writeJson(sessionPath, buildWorldSession(world));
  world.catalogDirty = false;
  world.lastCommit = world.lastCommit ?? null;
}

export async function saveWorldState(sessionPath, world) {
  const catalogPath = getCatalogPath(world.worldKey);
  const snapshotPath = getSessionSnapshotPath(world.worldKey);
  if (world.catalogDirty || !(await readJson(catalogPath))) {
    await writeJson(catalogPath, buildWorldCatalog(world));
    world.catalogDirty = false;
  }
  await writeJson(snapshotPath, buildWorldSession(world));
  await writeJson(sessionPath, buildWorldSession(world));
}

function isLegacyFullSession(session) {
  return Boolean(session && typeof session === 'object' && session.locations && session.npcs && !session.locationStates && !session.npcStates);
}

function compareDates(left, right) {
  const leftTime = Date.parse(left ?? '') || 0;
  const rightTime = Date.parse(right ?? '') || 0;
  return leftTime - rightTime;
}
