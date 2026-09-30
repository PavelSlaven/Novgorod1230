#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog/needs-check-blocker';

const GAME_BASE = path.resolve(process.env.NEEDS_CHECK_GAME_BASE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
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
    if (entry.isDirectory() && entry.name.startsWith('.')) continue;
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
  if (row.archive_id && !source?.archive_ref) throw new Error(`${file}#${rowId}: archive ID is missing from its inclusion ledger`);
  const blockBy = row.archive_id
    ? (row.reason_code === 'unresolved' && /(?:запросить|требуется\s+источник|source\s+request)/iu.test(`${row.note ?? ''} ${row.source_request ?? ''}`) ? 'name' : 'archive_id')
    : 'name';
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
  if ((blockBy === 'name' && !ru) || typeof scope !== 'string' || !scope || !Array.isArray(exceptions)) {
    throw new Error(`${file}#${rowId}: blocker fields are incomplete`);
  }
  const validScopes = new Set(['global', ...fs.readdirSync(GAME_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'scripts')
    .map((entry) => entry.name)]);
  if (!validScopes.has(scope)) throw new Error(`${file}#${rowId}: invalid block_scope ${scope}`);
  const patterns = blockBy === 'name'
    ? [{ language: 'ru', value: ru }, ...(lat || row.name_lat ? [{ language: 'lat', value: lat || row.name_lat }] : []), ...(row.archive_id ? [{ language: 'id', value: row.archive_id }] : [])]
    : [{ language: 'id', value: row.archive_id }];
  return {
    queue_id: id,
    block_by: blockBy,
    scope,
    source_ref: row.archive_id ? `${source.archive_ref}` : id,
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

export function registeredCandidates() {
  const registry = JSON.parse(fs.readFileSync(path.join(GAME_BASE, 'scripts/archive-ownership-registry.json'), 'utf8'));
  const candidates = [];
  const add = (row, spec) => {
    const identity = row[spec.key];
    const ids = typeof identity === 'string'
      ? [...identity.matchAll(/\b[A-Z]{2,4}\d{3,5}\b/giu)].map(([id]) => id) : [];
    const scope = spec.scope ?? spec.file.split('/')[0];
    const aliasesRu = ['alt_names_ru', 'aliases_ru', 'name_ru_alt', 'name_folk', 'name_old_ru']
      .flatMap((key) => String(row[key] ?? '').split(/[;|,]/u)).map((value) => value.trim()).filter(Boolean);
    const latSynonyms = String(row.lat_synonyms ?? '').split(/[;|]/u).map((value) => value.trim()).filter(Boolean);
    candidates.push({ scope, source_kind: 'entity', id: identity, source_file: spec.file, ids, name: row[spec.name], name_lat: row.name_lat || row.scientific_name || '',
      aliases_ru: aliasesRu, lat_synonyms: latSynonyms });
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
  const generatedTables = [
    ['items-household-personal/items/item_place_frequency.csv', ['name_ru'], ['item_or_category_ref']],
    ['items-household-personal/items/item_context_relations.csv', ['name_ru'], ['item_ref', 'target_refs']],
    ['items-household-personal/items/item_place_trace_relations.csv', [], ['source_item_id', 'master_item_ref']],
    ['occupations-activities/carried_inventories/carried_inventories.csv', [], ['canonical_existing_item_ids', 'common_new_item_ids', 'contextual_new_item_ids']],
    ['buildings-interiors-containers/interiors/scene_items.csv', ['name_ru'], ['item_ref']],
    ['places-binding/presence/presence_rules.csv', ['name_ru'], ['subject_ref', 'item_ref', 'item_refs', 'material_refs', 'reuse_refs']],
    ['places-binding/presence/environment_presence_authoring.csv', ['name_ru'], ['companion_ref', 'material_refs', 'item_refs', 'reuse_refs']],
    ['clothing-appearance/garments/costume_disposition.csv', ['name_ru'], ['source_item_id']],
    ['time-calendar-church/religion/church_practice.csv', ['name_ru'], ['items_refs']],
    ['items-weapons-armour/items/weapon_source_crosswalk.csv', ['source_name_ru'], ['source_id', 'mapping']]
  ];
  for (const [relative, nameFields, idFields] of generatedTables) {
    const file = path.join(GAME_BASE, relative);
    if (!fs.existsSync(file)) throw new Error(`${relative}: required needs_check candidate table is missing`);
    for (const [index, row] of parseCsv(fs.readFileSync(file, 'utf8'), relative).entries()) {
      const names = nameFields.flatMap((key) => String(row[key] ?? '').split(/[;|]/u)).filter(Boolean);
      const ids = [...new Set(idFields.flatMap((key) => String(row[key] ?? '').split(/[;|]/u))
        .flatMap((value) => [...value.matchAll(/\b[A-Z]{2,4}\d{3,5}\b/giu)].map(([id]) => id)))];
      if (!names.length && !ids.length) continue;
      candidates.push({ scope: relative.split('/')[0], source_kind: 'item-bearing', source_file: relative, id: row.id || row.item_ref || row.item_or_category_ref || row.source_item_id || `${relative}#${index + 2}`,
        ids, name: names[0] || '', aliases_ru: names.slice(1), name_lat: row.name_lat || row.scientific_name || '',
        lat_synonyms: String(row.lat_synonyms ?? '').split(/[;|]/u).filter(Boolean) });
    }
  }
  return candidates;
}

export function validateCatalog(snapshot, candidates = registeredCandidates()) {
  const hits = [];
  const informationalIdHits = [];
  const templateHits = new Map(snapshot.entries.map(({ queue_id, block_by }) => [queue_id, { queue_id, block_by, hits: 0 }]));
  for (const candidate of candidates) {
    for (const hit of NEEDS_CHECK_BLOCKER.matchesAll({ snapshot, candidate })) {
      if (hit.block_by === 'archive_id' && candidate.source_kind === 'item-bearing') {
        informationalIdHits.push({ queue_id: hit.queue_id, candidate: candidate.name, id: candidate.id, source_file: candidate.source_file });
        continue;
      }
      hits.push({ queue_id: hit.queue_id, block_by: hit.block_by, candidate: candidate.name, id: candidate.id, scope: candidate.scope, source_file: candidate.source_file });
      templateHits.get(hit.queue_id).hits++;
    }
  }
  if (hits.length) {
    const byKind = hits.reduce((counts, hit) => { counts[hit.block_by]++; return counts; }, { name: 0, archive_id: 0 });
    const unique = new Set(hits.map((hit) => `${hit.queue_id}\0${hit.source_file}\0${hit.id}`)).size;
    const nameSamples = hits.filter((hit) => hit.block_by === 'name').slice(0, 20);
    throw new Error(`needs_check blocker hits (${hits.length}; unique queue/table/item=${unique}; name=${byKind.name}; archive_id=${byKind.archive_id}; informational_id_reference_hits=${informationalIdHits.length}; name_samples=${JSON.stringify(nameSamples)}): ${JSON.stringify(hits.slice(0, 30))}`);
  }
  return { candidate_count: candidates.length, template_count: snapshot.entries.length,
    template_hits: [...templateHits.values()], informational_id_reference_hits: informationalIdHits.length };
}

function main() {
  const mode = process.argv[2];
  if (!['--write', '--check'].includes(mode)) throw new Error('usage: node check-needs-check.mjs --write|--check');
  const snapshot = compileSnapshot();
  const metrics = validateCatalog(snapshot);
  if (mode === '--write') {
    fs.writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`);
    process.stdout.write(`needs_check snapshot: ${snapshot.entries.length} entries, ${snapshot.digest}; ${metrics.template_count} templates × ${metrics.candidate_count} records; 0 blocking hits; ID-only refs outside entity inclusion (informational): ${metrics.informational_id_reference_hits}\n`);
    return;
  }
  const current = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  NEEDS_CHECK_BLOCKER.validateSnapshot(current);
  if (current.digest !== snapshot.digest || JSON.stringify(current) !== JSON.stringify(snapshot)) {
    throw new Error('needs_check blocker snapshot is stale; run node check-needs-check.mjs --write');
  }
  process.stdout.write(`needs_check snapshot verified: ${snapshot.entries.length} entries; ${metrics.template_count} templates × ${metrics.candidate_count} records; 0 blocking hits; ID-only refs outside entity inclusion (informational): ${metrics.informational_id_reference_hits}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
