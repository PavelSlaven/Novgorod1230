#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTITY_TABLES = [
  'crafts-tools-processes/materials_registry/material_entities.csv',
  'buildings-interiors-containers/interiors/material_entities.csv',
  'clothing-appearance/garments/material_entities.csv',
  'items-weapons-armour/items/weapons_armour.csv',
];
const LEDGER_FILES = [
  'crafts-tools-processes/archive_inclusion_ledger.csv',
  'buildings-interiors-containers/archive_inclusion_ledger.csv',
  'clothing-appearance/reports/archive_inclusion_ledger.csv',
  'items-weapons-armour/items/archive_inclusion_ledger.csv',
];
const LEDGER_ENTITY_TABLE = new Map([
  [LEDGER_FILES[0], ENTITY_TABLES[0]], [LEDGER_FILES[1], ENTITY_TABLES[1]],
  [LEDGER_FILES[2], ENTITY_TABLES[2]], [LEDGER_FILES[3], ENTITY_TABLES[3]],
]);
const ENTITY_SPECS = [
  { file: 'crafts-tools-processes/materials_registry/materials.csv', key: 'mt_id' },
  { file: 'crafts-tools-processes/materials_registry/material_entities.csv', key: 'item_id' },
  { file: 'crafts-tools-processes/craft_tools_gear/tools_gear.csv', key: 'tl_id' },
  { file: 'crafts-tools-processes/craft_processes/processes.csv', key: 'pc_id' },
  { file: 'buildings-interiors-containers/interiors/material_entities.csv', key: 'item_id' },
  { file: 'clothing-appearance/garments/material_entities.csv', key: 'item_id' },
  { file: 'items-weapons-armour/items/weapons_armour.csv', key: 'wp_id' },
  { file: 'food-drink/food/material_entities.csv', key: 'item_id' },
  { file: 'items-household-personal/items/household.csv', key: 'it_id', refs: 'master_refs' },
  { file: 'items-household-personal/items/personal.csv', key: 'it_id', refs: 'master_refs' },
  { file: 'nature-materials-weather/natural_materials_soils/natural_materials.csv', key: 'nm_id' },
  { file: 'fauna-mammals-birds/fauna/mammals.csv', key: 'fa_id' },
  { file: 'fauna-mammals-birds/fauna/birds.csv', key: 'fa_id' },
  { file: 'fauna-fish-invertebrates-livestock/fauna/fish.csv', key: 'fa_id' },
  { file: 'fauna-fish-invertebrates-livestock/fauna/invertebrates_herps.csv', key: 'fa_id' },
  { file: 'fauna-fish-invertebrates-livestock/fauna/livestock_species.csv', key: 'fa_id' },
  { file: 'fauna-fish-invertebrates-livestock/fauna/livestock_types.csv', key: 'ls_id' },
  { file: 'fauna-fish-invertebrates-livestock/fauna/livestock_products.csv', key: 'lp_id' },
  { file: 'transport-health-recreation/transport_travel/transport_entities.csv', key: 'tr_id' },
];
const ENTITY_SPEC_BY_FILE = new Map(ENTITY_SPECS.map(spec => [spec.file, spec]));
const NATURE_MASTER_CATEGORIES = new Set(['wood_bark_plant_materials', 'clay_ceramic_mineral']);
const HOUSEHOLD_MASTER_CATEGORIES = new Set(['small_household_personal']);
const ITEM_IDS = /\b(?:AC|ACT|AGR|AR|ARC|ARM|CL|CMB|CON|CRF|FG|FOD|FOR|FR|FRN|FSH|FUR|FW|GC|GF|GM|HLM|HNT|HOU|HRS|HW|INT|INV|LIV|LTR|MIL|MSC|MUS|OMI|POT|PRO|RCP|REL|SCN|SHD|SPN|SRC|STA|STR|TRD|WPN|WRT|WTR)\d{3,5}\b/gi;
const CANONICAL_ITEM_REF = /n1230:material_item:([a-z]{2,4}\d{3,5})/gi;
const MODIFIERS = new Set([
  // State and stage.
  'обгорев', 'обуглен', 'горел', 'сгорев', 'слом', 'разбит', 'облом', 'обрез', 'обрыв', 'изнош', 'стар', 'нов', 'сыр', 'сух', 'мокр', 'свеж', 'гнил', 'ржав', 'бит', 'цел', 'заготов', 'обработан', 'необработан', 'запис', 'осторожн',
  // Size and quantity.
  'мал', 'мелк', 'крупн', 'больш', 'длинн', 'коротк', 'тонк', 'толст', 'один', 'дв', 'нескольк', 'много', 'порц', 'куч', 'пачк', 'сноп', 'связк', 'моток', 'объем',
  // Container, purpose, and location.
  'меш', 'корзин', 'короб', 'боч', 'горш', 'ящик', 'упаков', 'для', 'присып', 'подсып', 'корм', 'топлив', 'строительн', 'писч', 'рыболовн', 'домашн', 'полев', 'мастерск', 'дворов', 'погреб', 'бан', 'лодочн', 'ремонтн', 'рыбь',
  // Color, shape, and kind.
  'син', 'зелен', 'зелён', 'красн', 'бел', 'черн', 'бур', 'желт', 'сер', 'кругл', 'плоск', 'плос', 'дроблен', 'крош', 'кварцев', 'стеклян', 'берестян', 'деревян', 'костян', 'железн', 'медн', 'шерстян', 'льнян', 'коноплян',
  // English archive identifiers and names.
  'mt', 'quartz', 'charred', 'burnt', 'blue', 'green', 'for', 'sprinkling', 'small', 'large', 'broken', 'worn',
]);
const EN_RU = new Map([
  ['sand', 'песок'], ['bone', 'кость'], ['glass', 'стекло'], ['drop', 'капля'], ['droplet', 'капля'],
]);

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(value => value.replace(/^\uFEFF/, '').trim());
  return rows.filter(values => values.some(Boolean)).map(values => Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ''])));
}

function archiveIds(value) {
  const text = String(value ?? '');
  const ids = new Set([...text.matchAll(new RegExp(ITEM_IDS.source, 'gi'))].map(match => match[0].toUpperCase()));
  for (const match of text.matchAll(new RegExp(CANONICAL_ITEM_REF.source, 'gi'))) ids.add(match[1].toUpperCase());
  return [...ids];
}

function csvFiles(root) {
  const files = [];
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.isFile() && entry.name.endsWith('.csv')) files.push(`${prefix}${entry.name}`);
    }
  }
  walk(root);
  return files.sort();
}

function normalizeSemanticRoot(value) {
  const tokens = String(value ?? '').replace(/\([^()]*\)/gu, ' ').toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];
  const roots = tokens.flatMap(token => {
    const mapped = EN_RU.get(token) ?? token;
    if ([token, mapped].some(candidate => [...MODIFIERS].some(stem => candidate.startsWith(stem)))) return [];
    if (/^(?:обожж|сломан|кварцев|стеклян|деревян|костян|железн|медн|льнян|коноплян|син|зелен|красн|бел|черн|бур|желт|сер)/u.test(mapped)) return [];
    return [mapped];
  });
  return roots.join(' ');
}

function isLedgerFile(file) {
  return LEDGER_FILES.includes(file);
}

function isEntityTable(file, headers = []) {
  const spec = ENTITY_SPEC_BY_FILE.get(file);
  return Boolean(spec && headers.includes(spec.key) && headers.includes('name_ru'));
}

function isPlacementFile(file) {
  return /(?:^|\/)items-household-personal\/items\/(?:item_place_frequency|item_place_trace_relations|item_context_relations)\.csv$/i.test(file);
}

function rowName(row) {
  return row.name_ru || row.class_name_ru || row.archive_name || row.name || row.item_id || row.entity_id || '';
}

function rowKey(row) {
  return row.item_id || row.entity_id || row.it_id || row.wp_id || row.gm_id || row.tl_id || row.pc_id || row.mt_id || row.fa_id || row.ls_id || row.lp_id || row.tr_id || row.of_id || row.bp_id || row.ct_id || row.id || row.own_id || row.nm_id || '';
}

function primaryArchiveIds(row, targetId) {
  const ids = new Set(archiveIds(targetId));
  for (const [field, value] of Object.entries(row)) {
    if (/^(?:archive_ref|master_item_ref|primary_ref|primary_source_ref|source_item_id|costume|costume_ref)$/i.test(field)) {
      for (const id of archiveIds(value)) ids.add(id);
    }
  }
  for (const match of String(row.source_refs ?? '').matchAll(/\bcostume:((?:CMB|FW|SRC)\d{3,5})\b/gi)) ids.add(match[1].toUpperCase());
  return [...ids];
}

function masterArchiveItems(root) {
  const relative = 'sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv';
  const candidates = [path.resolve(root, '../', relative), path.resolve(root, relative)];
  const source = candidates.find(candidate => fs.existsSync(candidate));
  if (!source) return new Map();
  return new Map(parseCsv(fs.readFileSync(source, 'utf8')).map(row => [String(row.item_id ?? '').toUpperCase(), row]));
}

function entityArchiveIds(file, row, ledgerArchiveIds, masterItems) {
  const ids = new Set();
  const key = String(rowKey(row)).trim();
  for (const id of archiveIds(key)) ids.add(id);
  for (const [field, value] of Object.entries(row)) {
    if (/^master_refs$/i.test(field)) {
      const refs = String(value ?? '').split(';').map(ref => ref.trim()).filter(Boolean);
      const compositeSet = /assembled/i.test(row.technique ?? '')
        && /^(?:set|kit|bundle)$/i.test(String(row.quantity_unit ?? '').trim())
        && /набор как сочетание/i.test(row.note ?? '')
        && /сам комплект\s*[—–-]\s*вывод/i.test(row.note ?? '');
      if (refs.length && !compositeSet) for (const id of archiveIds(refs[0])) {
        const category = masterItems.get(id)?.category;
        if (!category || HOUSEHOLD_MASTER_CATEGORIES.has(category)) ids.add(id);
      }
    } else if (file === 'nature-materials-weather/natural_materials_soils/natural_materials.csv') {
      if (/^source_refs$/i.test(field)) for (const id of archiveIds(value)) {
        if (NATURE_MASTER_CATEGORIES.has(masterItems.get(id)?.category)) ids.add(id);
      }
    } else if (/^(?:master_item_refs|archive_ref|archive_refs)$/i.test(field)) {
      for (const id of archiveIds(value)) ids.add(id);
    } else if (/^source_refs$/i.test(field)) {
      const householdSourceReference = /(?:^|\/)items-household-personal\/items\/(?:household|personal)\.csv$/i.test(file);
      const natureSourceReference = /(?:^|\/)nature-materials-weather\/natural_materials_soils\/natural_materials\.csv$/i.test(file);
      if (!householdSourceReference && !natureSourceReference) for (const id of archiveIds(value)) if (ledgerArchiveIds.has(id)) ids.add(id);
    }
  }
  return ids;
}

function entitySelfArchiveIds(file, row) {
  const keyIds = archiveIds(rowKey(row));
  if (keyIds.length) return keyIds;
  const values = Object.entries(row)
    .filter(([field]) => /^(?:archive_ref|archive_refs|master_item_ref|primary_ref|primary_source_ref|source_item_id|costume|costume_ref)$/i.test(field))
    .map(([, value]) => value);
  return [...new Set(values.flatMap(archiveIds))];
}

function isEntityRow(file, headers, row) {
  const spec = ENTITY_SPEC_BY_FILE.get(file);
  if (!spec || !isEntityTable(file, headers) || isLedgerFile(file) || !headers.includes(spec.key) || !headers.includes('name_ru') || !rowKey(row)) return false;
  if (spec.refs && !headers.includes(spec.refs)) return false;
  return true;
}

function isNewLedgerRow(row) {
  if (Object.values(row).some(value => /\b(?:rejected|reject|routed|variant|reference|ref|game_base_ref)\b/i.test(value))) {
    if (/\b(?:rejected|reject|routed|variant|reference|ref)\b/i.test(Object.entries(row).filter(([key]) => /disposition|decision|match_type|type|result|action/i.test(key)).map(([, value]) => value).join(' '))) return false;
  }
  return Object.entries(row).some(([key, value]) =>
    /^(?:record_type|disposition|type|match_type|semantic_result|inclusion_result|decision)$/i.test(key) && /^(?:new|entity|included|include)$/i.test(String(value).trim()));
}

function isRejectedLedgerRow(row) {
  return Object.entries(row).some(([key, value]) =>
    /^(?:type|disposition|decision|match_type|inclusion_result|selected_action|archive_action)$/i.test(key) && /^(?:rejected|reject|excluded)$/i.test(String(value).trim()));
}

function isTerminalRoutedRow(row) {
  return Object.entries(row).some(([key, value]) =>
    /^(?:record_type|disposition|status|semantic_result|inclusion_result|match_type|decision|archive_action|selected_action)$/i.test(key)
      && /^(?:routed|routed_to_owner|routed_to_existing_owner)$/i.test(String(value).trim()));
}

function isTerminalReferenceRow(row) {
  return Object.entries(row).some(([key, value]) =>
    /^(?:record_type|type|disposition|status|semantic_result|inclusion_result|match_type|decision|archive_action|selected_action)$/i.test(key)
      && /^(?:ref|reference)$/i.test(String(value).trim()));
}

function decisionReasons(row) {
  return Object.entries(row)
    .filter(([key]) => /^(?:reason|dedup_reason|semantic_note)$/i.test(key))
    .map(([, value]) => String(value ?? '').trim())
    .filter(Boolean);
}

function ownerGroup(file) {
  return file.split('/')[0];
}

function isTerminalDecision(row) {
  return isNewLedgerRow(row) || isRejectedLedgerRow(row) || isTerminalReferenceRow(row)
    || Object.entries(row).some(([key, value]) =>
      /^(?:record_type|disposition|status|semantic_result|inclusion_result|match_type|decision|archive_action|selected_action)$/i.test(key)
      && /^(?:variant|add_variant)$/i.test(String(value).trim()));
}

function hasResearchOnlyRestriction(row) {
  const values = Object.values(row).map(value => String(value ?? '')).join(' ');
  const reasons = Object.entries(row)
    .filter(([key]) => /(?:reason|note)$/i.test(key))
    .map(([, value]) => String(value ?? '')).join(' ');
  return /research_only/i.test(values)
    && /restricted:denylist:[a-z0-9_-]+/i.test(values)
    && /(?:generation|генерац).*(?:restricted|огранич|research.only|исследовательск)|(?:restricted|огранич|research.only|исследовательск).*(?:generation|генерац)/iu.test(reasons);
}

function mentionsIdentity(reason, entity) {
  const refs = [...(entity.archiveIds ?? []), entity.key].filter(Boolean);
  return refs.some(ref => {
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}_:-])${escaped}(?:$|[^\\p{L}\\p{N}_:-])`, 'iu').test(reason);
  });
}

function pairSpecificDecision(entity, counterpart, ledgerByArchiveId) {
  for (const id of entity.archiveIds ?? []) {
    for (const row of ledgerByArchiveId.get(id) ?? []) {
      for (const reason of decisionReasons(row)) {
        const detail = reason
          .replace(/n1230:material_item:[a-z0-9_:-]+/giu, ' ')
          .replace(/\b(?:OMI|CON|STA|HLM|WTR|MIL|FSH|MSC|REL|CRF|WPN|FW|CMB|GM|AR|TRD|WRT|SRC|FUR|POT|HOU|LIV|INV|FG|FOD|FRN|SHD|SPN|ACT|ARC|AGR|RCP|STR|INT|HRS|HW|HNT|MUS|GC|GF|CL|PRO|ARM|TR|LTR)\d{3,5}\b/giu, ' ')
          .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        if (mentionsIdentity(reason, counterpart) && detail.length >= 16
          && !/^(?:reviewed semantic roots|no object identity collapsed|distinct|same name different entity)$/iu.test(detail)) {
          const counterpartId = (counterpart.archiveIds ?? []).find(candidate => archiveIds(reason).includes(candidate)) || counterpart.key;
          return { id, counterpart: counterpartId, reason };
        }
      }
    }
  }
  return null;
}

function normalizedMaterial(value) {
  let text = String(value ?? '').trim().toLowerCase();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) text = parsed.map(item => String(item).toLowerCase()).join(' | ');
  } catch {}
  const classes = [
    [/\bglass\b|стекл/u, 'glass'],
    [/\btextile\b|текстил|шерст|(?<!\p{L})л[её]н|коноп/u, 'textile'],
    [/\b(?:bone|horn|antler)\b|кост|рог/u, 'bone_horn'],
    [/\b(?:clay|ceramic|masonry)\b|глин|керамик|плинф|кирпич/u, 'clay_ceramic'],
    [/\bwood\b|дерев|берест|лыко/u, 'wood'],
    [/\b(?:iron|steel)\b|желез|стал/u, 'iron'],
    [/\b(?:copper|bronze)\b|мед|бронз/u, 'copper_alloy'],
    [/\bleather\b|кож/u, 'leather'],
    [/\bfur\b|мех|пушнин/u, 'fur'],
    [/\bwax\b|воск/u, 'wax'],
    [/\bresin\b|смол/u, 'resin'],
    [/\bstone\b|камен/u, 'stone'],
  ].filter(([pattern]) => pattern.test(text)).map(([, name]) => name);
  return classes.length ? [...new Set(classes)].sort().join('|') : text.replace(/\s*\|\s*/g, '|');
}

function variantIdentityErrors(archiveId, source, target) {
  const errors = [];
  const sourceCategory = String(source?.category ?? '').trim().toLowerCase();
  const targetCategory = String(target?.category ?? '').trim().toLowerCase();
  if (sourceCategory && targetCategory && sourceCategory !== targetCategory) {
    errors.push(`${archiveId}: variant target category ${targetCategory} does not match source category ${sourceCategory}`);
  }
  const sourceMaterial = normalizedMaterial(source?.primary_material || source?.material || '');
  const targetMaterial = normalizedMaterial(target?.primary_material || target?.material || target?.material_family || target?.materials || '');
  if (sourceMaterial && targetMaterial && sourceMaterial !== targetMaterial) {
    errors.push(`${archiveId}: variant target material ${targetMaterial} does not match source material ${sourceMaterial}`);
  }
  return errors;
}

function placementTarget(file, row) {
  if (/item_place_frequency\.csv$/i.test(file)) {
    const kind = String(row.ref_kind ?? '').toLowerCase();
    if (kind !== 'master' && kind !== 'it') return null;
    return { ref: String(row.item_or_category_ref ?? '').trim(), allowMaster: kind === 'master' };
  }
  if (/item_place_trace_relations\.csv$/i.test(file)) return { ref: String(row.master_item_ref ?? '').trim(), allowMaster: true };
  if (/item_context_relations\.csv$/i.test(file)) return { ref: String(row.item_ref ?? '').trim(), allowMaster: true };
  return null;
}

function placementArchiveId(ref) {
  return archiveIds(ref)[0] ?? '';
}

function masterArchiveIds(root) {
  const relative = 'sources/master-archive-v1/data/normalized_source_tables/material_entities';
  const candidates = [path.resolve(root, '../', relative), path.resolve(root, relative)];
  const directory = candidates.find(candidate => fs.existsSync(candidate));
  if (!directory) return new Set();
  const ids = new Set();
  for (const file of ['material_entities.csv', 'item_location_links.csv', 'state_variants.csv', 'spawn_profiles.csv', 'inventory_profiles.csv']) {
    const source = path.join(directory, file);
    if (!fs.existsSync(source)) continue;
    for (const row of parseCsv(fs.readFileSync(source, 'utf8'))) {
      for (const field of ['item_id', 'base_item_id', 'canonical_item_id']) {
        const id = String(row[field] ?? '').trim().toUpperCase();
        if (ITEM_IDS.test(id)) ids.add(id);
        ITEM_IDS.lastIndex = 0;
      }
    }
  }
  return ids;
}

function periodContains1230(period) {
  const years = [...String(period ?? '').matchAll(/(?:^|\D)(\d{3,4})(?=\D|$)/g)].map(match => Number(match[1]));
  if (!years.length) return null;
  return years.length === 1 ? years[0] === 1230 : Math.min(...years) <= 1230 && Math.max(...years) >= 1230;
}

function jsonObjects(value, result = []) {
  if (Array.isArray(value)) for (const item of value) jsonObjects(item, result);
  else if (value && typeof value === 'object') {
    result.push(value);
    for (const item of Object.values(value)) jsonObjects(item, result);
  }
  return result;
}

function resolveTarget(root, ref, rowsByFile, idRows) {
  const value = String(ref ?? '').trim();
  if (!value || /(?:^|[#:/])(?:row[-_ ]?\d+)(?:$|\b)/i.test(value)) return { error: 'variant target is empty or row-number based' };
  const hash = value.lastIndexOf('#');
  const targetId = hash >= 0 ? value.slice(hash + 1).trim() : value;
  if (!targetId || !/^[a-z][a-z0-9_:-]*$/i.test(targetId)) return { error: `variant target has no stable ID: ${value}` };
  if (hash >= 0) {
    const relative = value.slice(0, hash);
    const exact = path.resolve(root, relative);
    if (fs.existsSync(exact) && path.extname(exact).toLowerCase() === '.json') {
      let objects;
      try { objects = jsonObjects(JSON.parse(fs.readFileSync(exact, 'utf8'))); }
      catch { return { error: `target JSON cannot be read: ${relative}` }; }
      const matches = objects.filter(candidate => Object.values(candidate).some(cell => String(cell).trim() === targetId));
      if (matches.length !== 1) return { error: `variant target ID ${targetId} resolves to ${matches.length} objects in ${relative}` };
      const row = matches[0];
      return { id: targetId, name: rowName(row), family: row.family_key || '', file: relative, row, archiveIds: primaryArchiveIds(row, rowKey(row) || targetId) };
    }
    let file = fs.existsSync(exact) ? path.relative(root, exact).split(path.sep).join('/') : null;
    if (!file) {
      const suffixMatches = [...rowsByFile.keys()].filter(candidate => candidate === relative || candidate.endsWith(`/${relative}`));
      if (suffixMatches.length === 1) file = suffixMatches[0];
      else if (suffixMatches.length > 1) return { error: `variant target path ${relative} matches multiple tables` };
    }
    if (file) {
      const rows = rowsByFile.get(file) ?? [];
      const keyed = rows.filter(candidate => rowKey(candidate).trim() === targetId);
      const matches = keyed.length ? keyed : rows.filter(candidate => Object.values(candidate).some(cell => cell.trim() === targetId));
      if (matches.length !== 1) return { error: `variant target ID ${targetId} resolves to ${matches.length} rows in ${file}` };
      const row = matches[0];
      return { id: targetId, name: rowName(row), family: row.family_key || '', file, row, archiveIds: primaryArchiveIds(row, rowKey(row) || targetId) };
    }
  }
  const matches = idRows.get(targetId) ?? [];
  if (matches.length !== 1) return { error: `variant target ID ${targetId} resolves to ${matches.length} rows` };
  return { id: targetId, name: rowName(matches[0].row), family: matches[0].row.family_key || '', file: matches[0].file, row: matches[0].row, archiveIds: primaryArchiveIds(matches[0].row, rowKey(matches[0].row) || targetId) };
}

export function checkArchiveOwnership(root = base) {
  const errors = [];
  const files = csvFiles(root);
  const masterIds = masterArchiveIds(root);
  const masterItems = masterArchiveItems(root);
  const rowsByFile = new Map(files.map(file => [file, parseCsv(fs.readFileSync(path.join(root, file), 'utf8'))]));
  const ledgerArchiveIds = new Set();
  for (const [file, rows] of rowsByFile) if (isLedgerFile(file)) {
    for (const row of rows) for (const id of archiveIds(row.archive_ref || row.master_item_ref || '')) ledgerArchiveIds.add(id);
  }
  const owners = new Map();
  const idRows = new Map();
  const entityIdRows = new Map();
  const placementRefs = [];
  const ledgers = [];
  const entityRecords = [];
  const pairExceptions = [];

  for (const [file, rows] of rowsByFile) {
    if (isLedgerFile(file)) {
      for (const [index, row] of rows.entries()) {
        const line = index + 2;
        const archiveId = archiveIds(row.archive_ref || row.master_item_ref || '')[0];
        ledgers.push({ file, line, row, archiveId });
      }
      continue;
    }
    const headers = Object.keys(rows[0] ?? {});
    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      const key = rowKey(row);
      const idEntry = { file, line, row, entityArchiveIds: [] };
      if (key) {
        const entries = idRows.get(key) ?? [];
        entries.push(idEntry);
        idRows.set(key, entries);
      }
      if (isEntityRow(file, headers, row)) {
        const ids = entityArchiveIds(file, row, ledgerArchiveIds, masterItems);
        idEntry.entityArchiveIds = [...ids];
        const record = { file, line, row, name: rowName(row), key, selfArchiveIds: entitySelfArchiveIds(file, row) };
        if (key) {
          const matches = entityIdRows.get(key) ?? [];
          matches.push(record);
          entityIdRows.set(key, matches);
        }
        for (const id of ids) {
          const entries = owners.get(id) ?? [];
          entries.push(record);
          owners.set(id, entries);
        }
        entityRecords.push({ ...record, archiveIds: [...ids] });
      }
      if (isPlacementFile(file)) {
        const target = placementTarget(file, row);
        if (target) placementRefs.push({ file, line, ...target, archiveId: placementArchiveId(target.ref), row });
      }
    }
  }

  for (const [id, rows] of owners) {
    if (rows.length > 1) errors.push(`${id}: entity owner appears ${rows.length} times: ${rows.map(row => `${row.file}:${row.line}`).join(', ')}`);
  }

  const ledgerByArchiveId = new Map();
  for (const item of ledgers) if (item.archiveId) {
    const rows = ledgerByArchiveId.get(item.archiveId) ?? [];
    rows.push(item.row);
    ledgerByArchiveId.set(item.archiveId, rows);
  }

  for (const entity of entityRecords) {
    if (!ENTITY_TABLES.includes(entity.file)) continue;
    const group = ownerGroup(entity.file);
    for (const id of entity.selfArchiveIds) {
      const hasOwnNewDecision = (ledgerByArchiveId.get(id) ?? []).some(row =>
        ledgers.some(item => item.archiveId === id && ownerGroup(item.file) === group && isNewLedgerRow(row)));
      if (!hasOwnNewDecision) errors.push(`${id}: entity owner ${entity.file}:${entity.line} has no new/entity ledger decision in owner group ${group}`);
    }
  }

  for (const item of ledgers) {
    if (!item.archiveId) continue;
    const { row, file, line, archiveId } = item;
    if (isNewLedgerRow(row)) {
      const existingOwners = owners.get(archiveId) ?? [];
      const ownTable = LEDGER_ENTITY_TABLE.get(file);
      const foreignOwners = existingOwners.filter(entry => entry.file !== ownTable);
      const localOwners = existingOwners.filter(entry => entry.file === ownTable);
      if (foreignOwners.length) errors.push(`${archiveId}: ledger marks new entity but archive ID already has entity owner(s): ${foreignOwners.map(entry => `${entry.file}:${entry.line}`).join(', ')}`);
      if (localOwners.length !== 1) errors.push(`${archiveId}: new ledger row resolves to ${localOwners.length} entities in its owner table ${ownTable}`);
      const inPeriod = periodContains1230(row.period);
      if (inPeriod === false) errors.push(`${archiveId}: new entity period excludes 1230 (${row.period})`);
      const researchOnly = Object.values(row).some(value => /research_only/i.test(String(value ?? '')));
      if (researchOnly && !hasResearchOnlyRestriction(row)) errors.push(`${archiveId}: research_only material cannot be a new entity`);
    }
    if (isTerminalReferenceRow(row)) {
      const ref = row.game_base_ref || row.target_ref || '';
      const target = resolveTarget(root, ref, rowsByFile, idRows);
      if (target.error) errors.push(`${archiveId}: reference ${target.error.replace(/^variant /, '')} (${ref || 'missing target'})`);
      else if (!target.name) errors.push(`${archiveId}: reference target ${target.id} has no resolvable identity`);
    }
    const variantDisposition = !isTerminalRoutedRow(row) && Object.entries(row).some(([key, value]) =>
      /^(?:record_type|type|match_type|disposition|inclusion_result|semantic_result|archive_action|selected_action)$/i.test(key)
        && /^(?:variant|add_variant)$/i.test(String(value).trim()));
    if (variantDisposition) {
      const target = resolveTarget(root, row.game_base_ref || row.target_ref || '', rowsByFile, idRows);
      if (target.error) errors.push(`${archiveId}: ${target.error} (${row.game_base_ref || row.target_ref || 'missing target'})`);
      else if (!target.name) errors.push(`${archiveId}: variant target ${target.id} has no resolvable identity`);
      else if (target.archiveIds.includes(archiveId) || archiveIds(target.id).includes(archiveId)) errors.push(`${archiveId}: variant target resolves to the archive item itself`);
      else {
        errors.push(...variantIdentityErrors(archiveId, masterItems.get(archiveId), target.row));
        if (row.family_key && target.family && row.family_key !== target.family) errors.push(`${archiveId}: variant target family ${target.family} does not match ledger family ${row.family_key}`);
      }
      if (Object.values(row).some(value => /research_only/i.test(String(value ?? '')))) errors.push(`${archiveId}: research_only material cannot be a variant`);
    }
    if (archiveId === 'WTR0024') {
      const inPeriod = periodContains1230(row.period);
      if (!isRejectedLedgerRow(row) || inPeriod !== false) errors.push(`WTR0024: must be rejected because period excludes 1230`);
    }
  }

  for (const ref of placementRefs) {
    const matches = ref.archiveId ? owners.get(ref.archiveId) ?? [] : entityIdRows.get(ref.ref) ?? [];
    const masterFallback = ref.allowMaster && Boolean(ref.archiveId) && masterIds.has(ref.archiveId);
    if (matches.length > 1) errors.push(`${ref.file}:${ref.line}: placement ref ${ref.ref} resolves to ${matches.length} entity owners`);
    else if (matches.length === 0 && !masterFallback) errors.push(`${ref.file}:${ref.line}: placement ref ${ref.ref} resolves to neither an entity nor a D39 master archive ID`);
  }

  const routedByArchiveId = new Map();
  for (const item of ledgers) {
    if (!item.archiveId || !isTerminalRoutedRow(item.row)) continue;
    const routes = routedByArchiveId.get(item.archiveId) ?? [];
    routes.push(item);
    routedByArchiveId.set(item.archiveId, routes);
  }
  for (const [id, routes] of routedByArchiveId) {
    const groups = routes.map(({ file, line, row }) => ({ file, line, value: String(row.target_group ?? '').trim() }));
    const nonEmptyGroups = new Set(groups.map(route => route.value).filter(Boolean));
    if (nonEmptyGroups.size > 1) errors.push(`${id}: terminal routed decisions disagree on target_group: ${groups.map(route => `${route.file}:${route.line}=${route.value || '(empty)'}`).join(', ')}`);
    else if (groups.some(route => !route.value)) errors.push(`${id}: terminal routed decision is missing target_group: ${groups.filter(route => !route.value).map(route => `${route.file}:${route.line}`).join(', ')}`);

    const refs = routes.map(({ file, line, row }) => ({ file, line, value: String(row.target_ref ?? '').trim() }));
    const nonEmptyRefs = new Set(refs.map(route => route.value).filter(Boolean));
    if (nonEmptyRefs.size > 1) errors.push(`${id}: terminal routed decisions disagree on target_ref: ${refs.map(route => `${route.file}:${route.line}=${route.value || '(empty)'}`).join(', ')}`);
    else if (nonEmptyRefs.size === 1 && refs.some(route => !route.value)) errors.push(`${id}: terminal routed decision is missing the agreed target_ref: ${refs.filter(route => !route.value).map(route => `${route.file}:${route.line}`).join(', ')}`);

    for (const route of routes) {
      const group = String(route.row.target_group ?? '').trim();
      const ref = String(route.row.target_ref ?? '').trim();
      const receivingLedgerDecision = (ledgerByArchiveId.get(id) ?? []).some(decision => {
        const decisionItem = ledgers.find(candidate => candidate.archiveId === id && candidate.row === decision);
        return decisionItem && ownerGroup(decisionItem.file) === group && isTerminalDecision(decision);
      });
      if (ref) {
        const target = resolveTarget(root, ref, rowsByFile, idRows);
        if (target.error) errors.push(`${id}: routed target_ref does not resolve (${ref}): ${target.error}`);
        else if (group && ownerGroup(target.file) !== group) errors.push(`${id}: routed target_ref resolves in ${ownerGroup(target.file)}, not target_group ${group}`);
      } else {
        const awaitsOwner = new RegExp(`(?:^|[\\s(])awaits_owner:${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s.,;)])`, 'u').test(String(route.row.reason ?? ''));
        if (!awaitsOwner) errors.push(`${id}: empty routed target_ref requires reason token awaits_owner:${group}`);
        if (receivingLedgerDecision) errors.push(`${id}: empty routed target_ref is invalid because receiving group ${group} has a decision`);
      }
    }
  }

  const roots = new Map();
  for (const entity of entityRecords) {
    const rootKey = normalizeSemanticRoot(entity.name);
    if (!rootKey) continue;
    for (const previous of roots.get(rootKey) ?? []) {
      if (!ENTITY_TABLES.includes(previous.file) && !ENTITY_TABLES.includes(entity.file)) continue;
      if (!(previous.selfArchiveIds?.length || entity.selfArchiveIds?.length)) continue;
      const waiver = pairSpecificDecision(previous, entity, ledgerByArchiveId)
        || pairSpecificDecision(entity, previous, ledgerByArchiveId);
      if (!waiver) errors.push(`semantic-root collision “${rootKey}”: ${previous.file}:${previous.line} (${previous.archiveIds.join('|') || previous.key}; ${previous.name}) <> ${entity.file}:${entity.line} (${entity.archiveIds.join('|') || entity.key}; ${entity.name}); add an explicit decision and reason to a ledger`);
      else pairExceptions.push({ semanticRoot: rootKey, ...waiver });
    }
    const current = roots.get(rootKey) ?? [];
    current.push(entity);
    roots.set(rootKey, current);
  }

  const archiveIdsSeen = new Set([...owners.keys(), ...ledgers.map(item => item.archiveId).filter(Boolean)]);
  return { errors, pairExceptions, counts: { csv_files: files.length, archive_ids: archiveIdsSeen.size, entity_owners: owners.size, entity_records: entityRecords.length } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkArchiveOwnership(process.argv[2] ? path.resolve(process.argv[2]) : base);
  if (result.errors.length) {
    const limit = 20;
    console.error(`check-archive-ownership: ${result.errors.length} errors; showing ${Math.min(limit, result.errors.length)} examples`);
    console.error(result.errors.slice(0, limit).join('\n'));
    process.exitCode = 1;
  } else console.log(JSON.stringify(result.counts));
}

export { archiveIds, normalizeSemanticRoot, parseCsv };
