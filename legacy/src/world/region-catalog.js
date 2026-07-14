import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let cachedCatalog = null;
let cachedCatalogSourceKey = null;

export function loadRegionCatalog() {
  const sourceKey = getRegionCatalogFiles().join('|');
  if (cachedCatalog && cachedCatalogSourceKey === sourceKey) return cachedCatalog;

  for (const candidate of getRegionCatalogFiles()) {
    if (!existsSync(candidate)) continue;
    const text = readFileSync(candidate, 'utf8');
    const regions = parseRegionList(text);
    if (regions.length > 0) {
      cachedCatalog = regions;
      cachedCatalogSourceKey = sourceKey;
      return cachedCatalog;
    }
  }

  cachedCatalog = [];
  cachedCatalogSourceKey = sourceKey;
  return cachedCatalog;
}

export function resetRegionCatalogCache() {
  cachedCatalog = null;
  cachedCatalogSourceKey = null;
}

let lastRegionCatalogMismatch = null;

export function getLastRegionCatalogMismatch() {
  return lastRegionCatalogMismatch;
}

export function resetRegionCatalogMismatch() {
  lastRegionCatalogMismatch = null;
}

export function selectRegionCatalogEntry(world = {}) {
  const catalog = loadRegionCatalog();
  if (catalog.length === 0) return null;

  const hints = [
    world.region?.name,
    world.history?.regionHint,
    world.historical?.regionHint,
    world.place?.name
  ]
    .filter(Boolean)
    .map((value) => normalize(value));

  for (const hint of hints) {
    const match = catalog.find((entry) => normalize(entry.name).includes(hint) || hint.includes(normalize(entry.name)));
    if (match) return match;
  }

  lastRegionCatalogMismatch = {
    event: 'region_catalog_unmatched',
    hints: hints.slice(),
    worldKey: world.worldKey ?? null
  };
  return null;
}

export function pickRandomRusRegion(catalog = loadRegionCatalog(), rng = Math.random) {
  const pool = catalog.filter((entry) => isRusRegionName(entry?.name));
  const source = pool.length > 0 ? pool : catalog;
  if (!Array.isArray(source) || source.length === 0) return null;

  const random = clampRandom(rng);
  const index = Math.min(source.length - 1, Math.floor(random * source.length));
  return source[index] ?? null;
}

function parseRegionList(text) {
  const regions = [];
  const lines = String(text ?? '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.trim().match(/^\d+\.\s*(.+)$/u);
    if (!match) continue;
    const name = match[1].trim();
    if (!name) continue;
    regions.push({
      id: `region:${regions.length + 1}`,
      name,
      index: regions.length
    });
  }
  const total = regions.length;
  for (const entry of regions) {
    entry.coordinates = deriveCoordinates(entry.index, total);
  }
  return regions;
}

function deriveCoordinates(index, total) {
  const ring = Math.floor(index / 16);
  const position = index % 16;
  return {
    x: position - 8,
    y: ring - Math.floor(total / 32),
    ring,
    position
  };
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function isRusRegionName(name) {
  const text = normalize(name);
  if (!text) return false;
  return /новгород|псков|ладож|ижор|карел|заволоч|белозер|ростов|ярослав|владимир|суздаль|москов|твер|муром|рязан|смолен|полоц|витеб|турово|пинск|киев|чернигов|северск|переяслав|галиц|волын|берест|подляш|верхнее поволжье|среднее поволжье|нижнее поволжье|мордов|марий|чуваш|башкир|перм|вятско-камск|югра|булгар|нижнекам/i.test(text);
}

function clampRandom(rng) {
  const value = typeof rng === 'function' ? Number(rng()) : Math.random();
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 0.999999999;
  return value;
}

function getRegionCatalogFiles() {
  return [
    process.env.WORLD_REGIONS_FILE?.trim(),
    resolve(process.cwd(), 'DOCUMENTS', 'documents-kg', 'corpus', 'DOCUMENTS', 'world_regions.txt'),
    resolve(process.cwd(), 'DOCUMENTS', 'all regions.txt'),
    resolve(process.cwd(), 'DOCUMENTS', 'world_regions.txt'),
    resolve(process.cwd(), 'data', 'world-catalogs', 'all regions.txt'),
    resolve(process.cwd(), 'data', 'world-catalogs', 'world_regions.txt'),
    resolve(process.cwd(), 'data', 'all regions.txt'),
    resolve(process.cwd(), 'data', 'world_regions.txt')
  ].filter(Boolean);
}
