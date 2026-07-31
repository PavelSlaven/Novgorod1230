import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateInventoryArchetypes } from '@rus/items-property';

export const INVENTORY_ARCHETYPE_LOOKUP_PATH =
  'data/world-catalogs/common/inventory-archetypes.json';

const cache = new Map();

export class CommonCatalogLookupError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CommonCatalogLookupError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export async function loadCommonCatalogLookupRecords({
  rootDir = process.cwd()
} = {}) {
  const path = resolve(rootDir, INVENTORY_ARCHETYPE_LOOKUP_PATH);
  if (!cache.has(path)) {
    const pending = load(path).catch((error) => {
      cache.delete(path);
      throw error;
    });
    cache.set(path, pending);
  }
  return cache.get(path);
}

async function load(path) {
  try {
    const source = JSON.parse(await readFile(path, 'utf8'));
    return Object.freeze({
      inventory_archetypes: validateInventoryArchetypes(source)
    });
  } catch (error) {
    if (error instanceof CommonCatalogLookupError) throw error;
    throw new CommonCatalogLookupError(
      'INVENTORY_ARCHETYPE_CATALOG_INVALID',
      'The common inventory archetype catalog is missing or invalid.',
      { cause: error.code ?? error.message }
    );
  }
}
