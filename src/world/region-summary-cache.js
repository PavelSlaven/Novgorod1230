import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadRegionCatalog } from './region-catalog.js';

const CACHE_VERSION = 1;

export function getRegionalSummaryCachePath(world, catalog = null) {
  const cacheDir = resolve(
    process.cwd(),
    process.env.WORLD_REGION_SUMMARY_CACHE_DIR?.trim() || 'data',
    'regional-summary-cache'
  );
  const packId = sanitizeKey(world?.historical?.packId ?? world?.history?.packId ?? 'default-pack');
  const scopeSignature = buildScopeSignature(world);
  const catalogSignature = buildCatalogSignature(catalog ?? loadRegionCatalog());
  return resolve(cacheDir, `${packId}-${scopeSignature}-${catalogSignature}.json`);
}

export function loadRegionalSummaryCache(world, catalog = null) {
  const path = getRegionalSummaryCachePath(world, catalog);
  if (!existsSync(path)) return null;

  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    if (data.version !== CACHE_VERSION) return null;
    if (data.packId !== sanitizeKey(world?.historical?.packId ?? world?.history?.packId ?? 'default-pack')) return null;
    if (data.scopeSignature !== buildScopeSignature(world)) return null;
    if (data.catalogSignature !== buildCatalogSignature(catalog ?? loadRegionCatalog())) return null;
    if (!data.context || typeof data.context !== 'object') return null;
    return data.context;
  } catch {
    return null;
  }
}

export function saveRegionalSummaryCache(world, context, catalog = null) {
  const path = getRegionalSummaryCachePath(world, catalog);
  const payload = {
    version: CACHE_VERSION,
    generatedAt: new Date().toISOString(),
    packId: sanitizeKey(world?.historical?.packId ?? world?.history?.packId ?? 'default-pack'),
    scopeSignature: buildScopeSignature(world),
    catalogSignature: buildCatalogSignature(catalog ?? loadRegionCatalog()),
    context
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8');
  return path;
}

function buildCatalogSignature(catalog) {
  return hashString(
    (Array.isArray(catalog) ? catalog : [])
      .map((entry) => [
        entry?.id ?? '',
        entry?.name ?? '',
        entry?.coordinates?.x ?? '',
        entry?.coordinates?.y ?? ''
      ].join(':'))
      .join('|')
  ).toString(16);
}

function buildScopeSignature(world) {
  return hashString([
    world?.worldKey ?? 'world',
    world?.current_position?.location_id ?? world?.current_position?.place_id ?? world?.currentLocationId ?? '',
    world?.history?.year ?? '',
    world?.history?.season ?? '',
    world?.history?.regionHint ?? '',
    world?.region?.name ?? '',
    world?.historical?.regionHint ?? ''
  ].join('|')).toString(16);
}

function sanitizeKey(value) {
  return String(value ?? 'default')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'default';
}

function hashString(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}
