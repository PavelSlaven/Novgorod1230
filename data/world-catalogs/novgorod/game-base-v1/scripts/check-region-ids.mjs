import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../places-binding/scripts/lib.mjs';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
export const GAME_BASE = path.resolve(SCRIPTS, '..');
export const G0_REGISTRY = path.resolve(GAME_BASE, '../spatial-v3/datasets/spatial_v3_nodes.json');
export const PLACES_BINDING_REGION = path.join(GAME_BASE, 'places-binding/inputs/pr98-extract.json');

const directRegionFields = new Set(['region_id', 'presence_region_id', 'region_permission']);
const scopedRegionFields = new Set(['region_scope']);
const idLike = /^[a-z][a-z0-9_]*$/;

function filesUnder(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(target));
    else if (entry.isFile() && /\.(?:csv|json)$/i.test(entry.name)) files.push(target);
  }
  return files.sort();
}

function isDirectRegionField(field) {
  return directRegionFields.has(field) || /(?:^|_)region_id$/.test(field);
}

function addValue(references, malformed, source, field, value) {
  if (value === '' || value === null || value === undefined) return;
  if (typeof value !== 'string') {
    malformed.push({ source, field, value });
    return;
  }
  const normalized = value.trim();
  if (!normalized) return;
  if (scopedRegionFields.has(field) && !idLike.test(normalized)) return;
  references.push({ source, field, region_id: normalized });
}

function walkJson(value, source, pointer, references, malformed) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJson(item, source, `${pointer}/${index}`, references, malformed));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${key}`;
    if (isDirectRegionField(key) || scopedRegionFields.has(key)) {
      addValue(references, malformed, `${source}#${childPointer}`, key, child);
    }
    walkJson(child, source, childPointer, references, malformed);
  }
}

function scanCsv(file, relative, references, malformed) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  rows.forEach((row, index) => {
    for (const [field, value] of Object.entries(row)) {
      const source = `${relative}:${index + 2}`;
      if (isDirectRegionField(field) || scopedRegionFields.has(field)) {
        addValue(references, malformed, source, field, value);
      }
      const trimmed = value.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          walkJson(JSON.parse(trimmed), source, field, references, malformed);
        } catch {
          // JSON-looking domain syntax remains owned by its group validator.
        }
      }
    }
  });
}

export function allowedG0Ids(registryPath = G0_REGISTRY) {
  const nodes = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  if (!Array.isArray(nodes)) throw new Error(`G0 registry must be an array: ${registryPath}`);
  const ids = nodes
    .filter((node) => node?.spatial_level === 'G0' && node?.status === 'approved')
    .map((node) => node.id);
  if (!ids.length || ids.some((id) => typeof id !== 'string' || !id)) {
    throw new Error(`G0 registry has no approved IDs: ${registryPath}`);
  }
  return new Set(ids);
}

export function checkRegionIds({
  gameBase = GAME_BASE,
  registryPath = G0_REGISTRY,
  placesBindingPath = PLACES_BINDING_REGION,
} = {}) {
  const allowed = allowedG0Ids(registryPath);
  const references = [];
  const malformed = [];
  const files = filesUnder(gameBase);
  for (const file of files) {
    const relative = path.relative(gameBase, file).split(path.sep).join('/');
    if (file.endsWith('.csv')) scanCsv(file, relative, references, malformed);
    else walkJson(JSON.parse(fs.readFileSync(file, 'utf8')), relative, '', references, malformed);
  }

  const binding = JSON.parse(fs.readFileSync(placesBindingPath, 'utf8'));
  const registryErrors = allowed.has(binding.region_id)
    ? []
    : [{ source: path.relative(gameBase, placesBindingPath), field: 'region_id', region_id: binding.region_id }];
  const unknown = references.filter((reference) => !allowed.has(reference.region_id));
  return {
    allowed_ids: [...allowed].sort(),
    files_scanned: files.length,
    references_checked: references.length,
    errors: [
      ...registryErrors.map((error) => ({ code: 'PLACES_BINDING_G0_UNKNOWN', ...error })),
      ...malformed.map((error) => ({ code: 'REGION_ID_MALFORMED', ...error })),
      ...unknown.map((error) => ({ code: 'REGION_ID_UNKNOWN', ...error })),
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkRegionIds();
  console.log(JSON.stringify({
    allowed_ids: result.allowed_ids,
    files_scanned: result.files_scanned,
    references_checked: result.references_checked,
    errors: result.errors.length,
  }));
  for (const error of result.errors) {
    console.error(`${error.code} ${error.source} ${error.field}=${error.region_id ?? String(error.value)}`);
  }
  if (result.errors.length) process.exitCode = 1;
}
