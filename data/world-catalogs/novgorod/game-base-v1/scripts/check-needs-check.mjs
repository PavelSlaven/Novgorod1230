#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog/needs-check-blocker';

const GAME_BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_FILE = path.join(GAME_BASE, 'needs_check_blockers.v1.json');
const QUEUES = [
  'buildings-interiors-containers/authoring/needs_check.csv',
  'buildings-interiors-containers/containers/needs_check.csv',
  'buildings-interiors-containers/landmarks/needs_check.csv',
  'clothing-appearance/authoring/needs_check.csv',
  'crafts-tools-processes/authoring/needs_check.csv',
  'crafts-tools-processes/materials_registry/needs_check.csv',
  'fauna-fish-invertebrates-livestock/fauna/needs_check.csv',
  'flora-herbs-berries-mushrooms/authoring/needs_check.csv',
  'flora-trees-shrubs/authoring/needs_check.csv',
  'food-drink/authoring/needs_check.json',
  'items-household-personal/authoring/needs_check.csv'
];

function parseCsv(text, file) {
  const records = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/u, '')); records.push(row); row = []; field = ''; }
    else field += char;
  }
  if (quoted) throw new Error(`${file}: unterminated CSV quote`);
  if (field || row.length) { row.push(field.replace(/\r$/u, '')); records.push(row); }
  if (!records.length) throw new Error(`${file}: empty queue`);
  const headers = records.shift().map((value) => value.replace(/^\uFEFF/u, '').trim());
  if (new Set(headers).size !== headers.length) throw new Error(`${file}: duplicate CSV header`);
  return records.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function readQueue(file) {
  const absolute = path.join(GAME_BASE, file);
  const text = fs.readFileSync(absolute, 'utf8');
  if (file.endsWith('.json')) {
    const document = JSON.parse(text);
    if (!Array.isArray(document.records)) throw new Error(`${file}: records must be an array`);
    return document.records;
  }
  return parseCsv(text, file);
}

function queueId(row, file) {
  const id = row.archive_id || row.check_id;
  return id ? `${file}#${id}` : null;
}

function findQueues(directory, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...findQueues(path.join(directory, entry.name), `${relative}/`));
    else if (/^needs_check\.(?:csv|json)$/u.test(entry.name)) files.push(relative);
  }
  return files.sort();
}

function queueTitle(row, ledgerById) {
  return row.archive_id ? ledgerById.get(row.archive_id)?.archive_name : row.subject || row.taxon_ru;
}

function archiveNames(file) {
  const ledgerPath = file.startsWith('buildings-interiors-containers/')
    ? 'buildings-interiors-containers/archive_inclusion_ledger.csv'
    : 'crafts-tools-processes/archive_inclusion_ledger.csv';
  return new Map(parseCsv(fs.readFileSync(path.join(GAME_BASE, ledgerPath), 'utf8'), ledgerPath)
    .map((row) => [row.archive_ref?.split(':').at(-1), row]));
}

export function compileQueueRecord(row, file, ledger = new Map()) {
  const rowId = row.archive_id || row.check_id;
  const id = queueId(row, file);
  const title = queueTitle(row, ledger);
  if (!id || !title || ('status' in row && row.status !== 'needs_check')) {
    throw new Error(`${file}: active needs_check row lacks queue ID/name or has non-active status`);
  }
  const source = row.archive_id ? ledger.get(row.archive_id) : null;
  const ru = row.block_pattern_ru;
  const lat = row.block_pattern_lat;
  const scope = row.block_scope;
  let exceptions;
  try {
    exceptions = Array.isArray(row.block_exception)
      ? row.block_exception : JSON.parse(row.block_exception || '');
  } catch {
    throw new Error(`${file}#${rowId}: block_exception must be a JSON array`);
  }
  if (!ru || typeof scope !== 'string' || !scope || !Array.isArray(exceptions)) {
    throw new Error(`${file}#${rowId}: blocker fields are incomplete`);
  }
  if (row.archive_id && (ru !== title || !source?.archive_ref)) {
    throw new Error(`${file}#${rowId}: archive pattern must equal its generated archive title`);
  }
  const patterns = [{ language: 'ru', value: ru }];
  if (lat) patterns.push({ language: 'lat', value: lat });
  if (row.archive_id) patterns.push({ language: 'id', value: row.archive_id });
  if (!row.archive_id && row.name_lat) patterns.push({ language: 'lat', value: row.name_lat });
  return {
    queue_id: id,
    scope,
    source_ref: row.archive_id ? `${source.archive_ref}` : `${file}#${id}`,
    reason: row.note || row.reason || row.source_request || 'Unverified authoring queue entry.',
    patterns,
    exceptions
  };
}

export function compileSnapshot() {
  const discovered = findQueues(GAME_BASE);
  if (JSON.stringify(discovered) !== JSON.stringify([...QUEUES].sort())) {
    throw new Error(`needs_check queue inventory changed: ${JSON.stringify(discovered)}`);
  }
  const entries = [];
  for (const file of QUEUES) {
    const rows = readQueue(file);
    const ledger = file.includes('/authoring/needs_check.csv')
      && (file.startsWith('buildings-interiors-containers/') || file.startsWith('crafts-tools-processes/'))
      ? archiveNames(file) : new Map();
    entries.push(...rows.map((row) => compileQueueRecord(row, file, ledger)));
  }
  return NEEDS_CHECK_BLOCKER.createSnapshot(entries);
}

function registeredCandidates() {
  const registry = JSON.parse(fs.readFileSync(path.join(GAME_BASE, 'scripts/archive-ownership-registry.json'), 'utf8'));
  const candidates = [];
  const add = (row, spec) => {
    const identity = row[spec.key];
    const ids = typeof identity === 'string'
      ? [...identity.matchAll(/\b[A-Z]{2,4}\d{3,5}\b/giu)].map(([id]) => id) : [];
    const scope = spec.scope ?? spec.file.split('/')[0];
    candidates.push({ scope, id: row[spec.key], ids,
      name: row[spec.name], name_lat: row.name_lat || row.scientific_name || '' });
  };
  for (const spec of registry.entity_tables) {
    const file = path.join(GAME_BASE, spec.file);
    if (!fs.existsSync(file)) {
      if (spec.optional) continue;
      throw new Error(`${spec.file}: required registered catalog entity file is missing`);
    }
    for (const row of parseCsv(fs.readFileSync(file, 'utf8'), spec.file)) add(row, spec);
  }
  function addJsonEntities(value, spec) {
    if (Array.isArray(value)) { for (const item of value) addJsonEntities(item, spec); return; }
    if (!value || typeof value !== 'object') return;
    if (typeof value[spec.key] === 'string' && typeof value[spec.name] === 'string') add(value, spec);
    for (const child of Object.values(value)) addJsonEntities(child, spec);
  }
  for (const spec of registry.entity_json_files ?? []) {
    const file = path.join(GAME_BASE, spec.file);
    addJsonEntities(JSON.parse(fs.readFileSync(file, 'utf8')), spec);
  }
  return candidates;
}

export function validateCatalog(snapshot, candidates = registeredCandidates()) {
  const hits = [];
  for (const candidate of candidates) {
    const hit = NEEDS_CHECK_BLOCKER.matches({ snapshot, candidate });
    if (hit) hits.push({ queue_id: hit.queue_id, candidate: candidate.name, id: candidate.id });
  }
  if (hits.length) {
    throw new Error(`needs_check blocker hit: ${JSON.stringify(hits)}`);
  }
  return { candidate_count: candidates.length, template_count: snapshot.entries.length,
    template_hits: snapshot.entries.map(({ queue_id }) => ({ queue_id, hits: 0 })) };
}

function main() {
  const mode = process.argv[2];
  if (!['--write', '--check'].includes(mode)) throw new Error('usage: node check-needs-check.mjs --write|--check');
  const snapshot = compileSnapshot();
  const metrics = validateCatalog(snapshot);
  if (mode === '--write') {
    fs.writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`);
    process.stdout.write(`needs_check snapshot: ${snapshot.entries.length} entries, ${snapshot.digest}; ${metrics.template_count} templates × ${metrics.candidate_count} registered records; 0 hits each\n`);
    return;
  }
  const current = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  NEEDS_CHECK_BLOCKER.validateSnapshot(current);
  if (current.digest !== snapshot.digest || JSON.stringify(current) !== JSON.stringify(snapshot)) {
    throw new Error('needs_check blocker snapshot is stale; run node check-needs-check.mjs --write');
  }
  process.stdout.write(`needs_check snapshot verified: ${snapshot.entries.length} entries; ${metrics.template_count} templates × ${metrics.candidate_count} registered records; 0 hits each\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
