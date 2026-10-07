#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { applyMaterialOverrides } from './material-view.cjs';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_FILE = 'scripts/archive-ownership-registry.json';
const MATERIAL_RESOLUTION_FILE = 'crafts-tools-processes/materials_registry/material_resolution.csv';
const MATERIALS_FILE = 'crafts-tools-processes/materials_registry/materials.csv';
const registryAt = root => JSON.parse(fs.readFileSync(path.join(root, REGISTRY_FILE), 'utf8'));
const registry = registryAt(base);
const ENTITY_SPECS = registry.entity_tables;
const ENTITY_SPEC_BY_FILE = new Map(ENTITY_SPECS.map(spec => [spec.file, spec]));
const LEDGER_FILES = registry.ledger_files;
const LEDGER_ENTITY_TABLES = [
  'crafts-tools-processes/materials_registry/material_entities.csv',
  'buildings-interiors-containers/interiors/material_entities.csv',
  'clothing-appearance/garments/material_entities.csv',
  'items-weapons-armour/items/weapons_armour.csv',
];
const NATURE_MASTER_CATEGORIES = new Set(['wood_bark_plant_materials', 'clay_ceramic_mineral']);
const ITEM_IDS = /\b(?:AC|ACT|AGR|AR|ARC|ARM|CL|CMB|CON|CRF|FG|FOD|FOR|FR|FRN|FSH|FUR|FW|GC|GF|GM|HLM|HNT|HOU|HRS|HW|INT|INV|LIV|LTR|MIL|MSC|MUS|OMI|POT|PRO|RCP|REL|SCN|SHD|SPN|SRC|STA|STR|TRD|WPN|WRT|WTR)\d{3,5}\b/gi;
const CANONICAL_ITEM_REF = /n1230:material_item:([a-z]{2,4}\d{3,5})/gi;
const MODIFIERS = new Set([
  // State and stage.
  'обгорев', 'обуглен', 'горел', 'сгорев', 'слом', 'разбит', 'облом', 'обрез', 'обрыв', 'изнош', 'стар', 'нов', 'сух', 'мокр', 'свеж', 'гнил', 'ржав', 'бит', 'цел', 'заготов', 'обработан', 'необработан', 'запис', 'осторожн',
  // Size and quantity.
  'мал', 'мелк', 'крупн', 'больш', 'длинн', 'коротк', 'тонк', 'толст', 'один', 'дв', 'нескольк', 'много', 'порц', 'куч', 'пачк', 'сноп', 'связк', 'моток', 'объем',
  // Container, purpose, and location.
  'мешок', 'мешка', 'мешке', 'мешком', 'мешки', 'мешков', 'корзин', 'горш', 'ящик', 'упаков', 'для', 'присып', 'подсып', 'корм', 'топлив', 'строительн', 'писч', 'рыболовн', 'домашн', 'полев', 'мастерск', 'дворов', 'погреб', 'бан', 'лодочн', 'ремонтн', 'рыбь',
  // Color, shape, and kind.
  'син', 'зелен', 'зелён', 'красн', 'белый', 'белая', 'белое', 'белые', 'белых', 'черный', 'черная', 'черное', 'черные', 'черных', 'бур', 'желт', 'серый', 'серая', 'серое', 'серые', 'серых', 'кругл', 'плоск', 'плос', 'дроблен', 'кварцев', 'стеклян', 'берестян', 'деревян', 'костян', 'железн', 'медн', 'шерстян', 'льнян', 'коноплян',
  // English archive identifiers and names.
  'mt', 'quartz', 'charred', 'burnt', 'blue', 'green', 'for', 'sprinkling', 'small', 'large', 'broken', 'worn',
]);
const EN_RU = new Map([
  ['sand', 'песок'], ['bone', 'кость'], ['glass', 'стекло'], ['drop', 'капля'], ['droplet', 'капля'],
  ['rope', 'cordage'],
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
      else if (entry.isFile() && entry.name.endsWith('.csv')) {
        const relative = `${prefix}${entry.name}`;
        if (relative !== 'source-overlays/master-material-materials.csv') files.push(relative);
      }
    }
  }
  walk(root);
  return files.sort();
}

function registryCoverageErrors(root, files, rowsByFile) {
  const errors = [];
  if (!fs.existsSync(path.join(root, 'catalog.json'))) return [];
  const current = registryAt(root);
  const known = new Map(current.entity_tables.map(spec => [spec.file, spec]));
  const excluded = new Map(current.excluded_entity_tables.map(spec => [spec.file, spec]));
  for (const decision of current.pair_decisions ?? []) {
    const waives = decision.waives;
    if (!archiveIds(decision.archive_id).includes(String(decision.archive_id ?? '').toUpperCase())
      || !decision.target_file || !decision.target_id || String(decision.reason ?? '').trim().length < 16
      || !/\.test\.(?:mjs|js)(?:#|:|$)/i.test(String(decision.verification ?? ''))
      || (waives !== undefined && (!Array.isArray(waives) || waives.length === 0
        || new Set(waives).size !== waives.length
        || waives.some(scope => !['category', 'material'].includes(scope))))) {
      errors.push(`${REGISTRY_FILE}: pair decision must name an archive ID, target file/ID, specific reason, test verification, and valid waiver scopes`);
    }
  }
  let catalogGroups;
  try { catalogGroups = new Set(JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8')).groups.map(group => group.id)); }
  catch (error) { return [`${REGISTRY_FILE}: cannot read catalog group registrations: ${error.message}`]; }
  const pathIsRegistered = file => catalogGroups.has(file.split('/')[0]);
  for (const spec of current.entity_tables) {
    const rows = rowsByFile.get(spec.file);
    if (!pathIsRegistered(spec.file) || (!rows && !spec.optional)) errors.push(`${spec.file}: registry entity table is missing or outside catalog groups`);
    else if (!rows) continue;
    else {
      const headers = Object.keys(rows[0] ?? {});
      if (!headers.includes(spec.key) || !headers.includes(spec.name)) errors.push(`${spec.file}: registry fields ${spec.key}/${spec.name} do not match CSV headers`);
    }
  }
  for (const spec of current.entity_json_files ?? []) {
    const source = path.join(root, spec.file);
    if (!pathIsRegistered(spec.file) || !fs.existsSync(source)) errors.push(`${spec.file}: registry JSON entity file is missing or outside catalog groups`);
    else {
      let objects = [];
      try { objects = jsonObjects(JSON.parse(fs.readFileSync(source, 'utf8'))); }
      catch (error) { errors.push(`${spec.file}: registry JSON entity file cannot be read: ${error.message}`); }
      if (!objects.some(row => row[spec.key] && row[spec.name])) errors.push(`${spec.file}: registry JSON fields ${spec.key}/${spec.name} do not match any object`);
    }
  }
  for (const exclusion of current.excluded_entity_tables) {
    if (!pathIsRegistered(exclusion.file) || !exclusion.reason.trim() || !rowsByFile.has(exclusion.file)) errors.push(`${exclusion.file}: registry exclusion needs an existing CSV in a catalog group and a reason`);
  }
  for (const file of known.keys()) if (excluded.has(file)) errors.push(`${file}: CSV cannot be both an entity table and an explicit exclusion`);
  for (const file of files) {
    if (!pathIsRegistered(file)) continue;
    const rows = rowsByFile.get(file) ?? [];
    if (!rows.length) continue;
    const headers = Object.keys(rows[0]);
    const key = headers.find(header => /^(?:[a-z][a-z0-9_]*_id|id)$/i.test(header));
    const hasNamedEntity = headers.some(header => /^(?:name_ru|class_name_ru|title_ru)$/i.test(header));
    const hasStableIds = key && rows.some(row => String(row[key] ?? '').trim());
    if (hasNamedEntity && hasStableIds && !known.has(file) && !excluded.has(file)) {
      errors.push(`${file}: CSV with entity IDs from catalog group is absent from entity registry and exclusions`);
    }
  }
  return errors;
}

function normalizeSemanticRoot(value) {
  const tokens = String(value ?? '').replace(/\([^()]*\)/gu, ' ').toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];
  const roots = tokens.flatMap(token => {
    const mapped = EN_RU.get(token) ?? token;
    if ([token, mapped].some(candidate => [...MODIFIERS].some(stem => candidate.startsWith(stem)))) return [];
    return [mapped];
  });
  return (roots.length ? roots : tokens.map(token => EN_RU.get(token) ?? token)).join(' ');
}

function isLedgerFile(file, ledgerFiles) {
  return ledgerFiles.includes(file);
}

function isEntityTable(file, headers = [], specs = ENTITY_SPEC_BY_FILE) {
  const spec = specs.get(file);
  return Boolean(spec && headers.includes(spec.key) && headers.includes(spec.name));
}

function isPlacementFile(file) {
  return /(?:^|\/)items-household-personal\/items\/(?:item_place_frequency|item_place_trace_relations|item_context_relations)\.csv$/i.test(file);
}

function rowName(row) {
  return row.name_ru || row.class_name_ru || row.title_ru || row.name || row.archive_name || row.item_id || row.entity_id || '';
}

function rowKey(row, file = '', specs = ENTITY_SPEC_BY_FILE) {
  const spec = specs.get(file);
  if (spec && row[spec.key]) return row[spec.key];
  return row.item_id || row.entity_id || row.product_ref || row.it_id || row.wp_id || row.gm_id || row.gc_id || row.ad_id || row.fd_id || row.tl_id || row.pc_id || row.mt_id || row.fa_id || row.ls_id || row.lp_id || row.tr_id || row.of_id || row.bp_id || row.bt_id || row.mat_id || row.ct_id || row.sf_id || row.sc_id || row.lm_id || row.hl_id || row.rc_id || row.ws_id || row.id || row.own_id || row.nm_id || '';
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
  const rows = parseCsv(fs.readFileSync(source, 'utf8'));
  let projected = rows;
  try {
    projected = applyMaterialOverrides(rows, source);
  } catch (error) {
    const repositorySource = path.resolve(base, '../', relative);
    if (path.resolve(source) === repositorySource || !String(error.message).startsWith('material view is stale')) throw error;
  }
  return new Map(projected.map(row => [String(row.item_id ?? '').toUpperCase(), row]));
}

function entityArchiveIds(file, row, ledgerArchiveIds, masterItems, specs = ENTITY_SPEC_BY_FILE) {
  const ids = new Set();
  const key = String(rowKey(row, file, specs)).trim();
  for (const id of archiveIds(key)) ids.add(id);
  for (const [field, value] of Object.entries(row)) {
    if (/^master_refs$/i.test(field)) {
      const refs = String(value ?? '').split(';').map(ref => ref.trim()).filter(Boolean);
      const compositeSet = /assembled/i.test(row.technique ?? '')
        && /^(?:set|kit|bundle)$/i.test(String(row.quantity_unit ?? '').trim())
        && /набор как сочетание/i.test(row.note ?? '')
        && /сам комплект\s*[—–-]\s*вывод/i.test(row.note ?? '');
      if (refs.length && !compositeSet) for (const id of archiveIds(refs[0])) ids.add(id);
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

function entitySelfArchiveIds(file, row, specs = ENTITY_SPEC_BY_FILE) {
  const keyIds = archiveIds(rowKey(row, file, specs));
  if (keyIds.length) return keyIds;
  const values = Object.entries(row)
    .filter(([field]) => /^(?:archive_ref|archive_refs|master_item_ref|primary_ref|primary_source_ref|source_item_id|costume|costume_ref)$/i.test(field))
    .map(([, value]) => value);
  return [...new Set(values.flatMap(archiveIds))];
}

function isEntityRow(file, headers, row, specs = ENTITY_SPEC_BY_FILE, ledgerFiles = LEDGER_FILES) {
  const spec = specs.get(file);
  if (!spec || !isEntityTable(file, headers, specs) || isLedgerFile(file, ledgerFiles) || !headers.includes(spec.key) || !row[spec.key]) return false;
  if (spec.refs && !headers.includes(spec.refs)) return false;
  return true;
}

function isNewLedgerRow(row) {
  if (Object.entries(row).some(([key, value]) => /^(?:record_type|disposition|type|match_type|semantic_result|inclusion_result|decision)$/i.test(key) && /^needs_check$/i.test(String(value).trim()))) return false;
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

function pairSpecificDecision(entity, counterpart, decisions) {
  for (const decision of decisions ?? []) {
    const entityMatches = (entity.archiveIds ?? []).includes(decision.archive_id);
    const targetMatches = decision.target_file === counterpart.file
      && [counterpart.key, ...(counterpart.archiveIds ?? [])].includes(decision.target_id);
    if (entityMatches && targetMatches && String(decision.reason ?? '').trim().length >= 16
      && mentionsIdentity(decision.reason, counterpart)
      && /\.test\.(?:mjs|js)(?:#|:|$)/i.test(String(decision.verification ?? ''))) {
      return { id: decision.archive_id, counterpart: decision.target_id, reason: decision.reason, verification: decision.verification };
    }
  }
  for (const reason of entity.ledgerReasons ?? []) {
    if (reason.length >= 16 && mentionsIdentity(reason, entity) && mentionsIdentity(reason, counterpart)) {
      return {
        id: entity.archiveIds[0], counterpart: counterpart.archiveIds[0] ?? counterpart.key,
        reason, verification: 'scripts/check-archive-ownership.test.mjs#ledger-pair-reason',
      };
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
    [/\b(?:textile|fabric|hemp|flax|wool)\b|текстил|ткан|шерст|(?<!\p{L})л[её]н|коноп/u, 'textile'],
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

function materialText(value) {
  let text = String(value ?? '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.flatMap(materialText);
  } catch {}
  return text.split(/[|;,/]+/u).map(part => part.trim()).filter(Boolean);
}

function materialWords(value) {
  return String(value ?? '').toLowerCase().normalize('NFC').replace(/\([^()]*\)/gu, ' ')
    .match(/[\p{L}\p{N}_]+/gu) ?? [];
}

function materialValueIsUnknown(value) {
  return /^(?:mixed|unknown|various|n\/a|none|разное|неизвестно|смешанн\w*)$/iu.test(String(value ?? '').trim());
}

function materialTokens(value) {
  return materialText(value).flatMap(part => part.split(/\s+and\s+|\s+or\s+/iu))
    .map(part => part.trim()).filter(part => part && !materialValueIsUnknown(part));
}

function buildArchiveMaterialMap(root, masterItems) {
  const vocabularyFile = path.join(root, MATERIALS_FILE);
  const resolutionFile = path.join(root, MATERIAL_RESOLUTION_FILE);
  if (!fs.existsSync(vocabularyFile) || !fs.existsSync(resolutionFile)) {
    return { byArchiveId: new Map(), unmapped: new Map(), mapped_values: 0 };
  }
  const vocabulary = parseCsv(fs.readFileSync(vocabularyFile, 'utf8'));
  const resolution = parseCsv(fs.readFileSync(resolutionFile, 'utf8'));
  const aliases = new Map();
  const specificAliases = new Map();
  const materialMetadata = new Map();
  const addAlias = (mtId, phrase) => {
    for (const part of materialText(phrase)) {
      const words = materialWords(part);
      if (!words.length || words.every(word => ['mixed', 'материал', 'материалы', 'possibly', 'possible'].includes(word))) continue;
      const key = words.join(' ');
      if (key.length < 3) continue;
      const ids = aliases.get(key) ?? new Set();
      ids.add(mtId);
      aliases.set(key, ids);
    }
  };
  const addSpecificAlias = (mtId, phrase) => {
    for (const part of materialText(phrase)) {
      const words = materialWords(part);
      if (!words.length || (words.length === 1 && words[0].length < 3)) continue;
      const key = words.join(' ');
      const ids = specificAliases.get(key) ?? new Set();
      ids.add(mtId);
      specificAliases.set(key, ids);
    }
  };
  for (const row of vocabulary) {
    const id = String(row.mt_id ?? '').trim();
    if (!id) continue;
    materialMetadata.set(id, {
      family: String(row.material_family ?? '').trim(),
      terms: new Set(['name_ru', 'name_en', 'aliases_ru'].flatMap(field => materialWords(row[field]))),
      sourceTaxon: String(row.source_taxon_or_mineral_ref ?? '').trim(),
    });
    for (const field of ['mt_id', 'name_ru', 'name_en', 'aliases_ru']) addAlias(id, row[field]);
    addSpecificAlias(id, row.aliases_ru);
    addAlias(id, id.replace(/^mt_/, '').replace(/_/g, ' '));
  }
  const resolvedValues = new Map();
  for (const row of resolution) {
    const ids = String(row.mt_ids ?? '').split(';').map(value => value.trim()).filter(Boolean);
    const key = materialWords(row.value).join(' ');
    if (key && ids.length) {
      const resolved = resolvedValues.get(key) ?? new Set();
      for (const id of ids) resolved.add(id);
      resolvedValues.set(key, resolved);
    }
  }

  const materialSuffixes = ['евого', 'ового', 'евому', 'овому', 'евыми', 'овыми', 'евым', 'овым', 'евую', 'овую', 'евой', 'овой', 'яными', 'яными', 'яного', 'яной', 'яную', 'яным', 'яных', 'яное', 'яная', 'яные', 'овое', 'ого', 'его', 'ему', 'ому', 'ыми', 'ими', 'ами', 'ями', 'ях', 'ах', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ый', 'ий', 'ой', 'ых', 'их', 'ым', 'им', 'ую', 'юю', 'ов', 'ев', 'ей', 'ам', 'ям', 'ом', 'ем', 'а', 'я', 'ы', 'и', 'е', 'у', 'ю', 'о', 'ь'];
  const materialStem = word => {
    for (const suffix of materialSuffixes) {
      if (word.length > suffix.length + 2 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
    }
    return word;
  };
  const specificNameMaterials = (value, singleAliasOnly = false) => {
    const words = materialWords(value).map(materialStem);
    if (!words.length) return new Set();
    const specific = new Set();
    for (const [alias, ids] of specificAliases) {
      const needle = alias.split(' ').map(materialStem);
      if (needle.length === 1) {
        if (needle[0].length >= 3 && ids.size === 1 && words.includes(needle[0])) {
          for (const id of ids) specific.add(id);
        }
        continue;
      }
      if (singleAliasOnly) continue;
      const discriminating = needle.filter(part => part.length >= 4);
      if (discriminating.length && needle.every(part => words.includes(part))) {
        for (const id of ids) specific.add(id);
      }
    }
    return specific;
  };
  const fromMaterialValues = value => {
    const ids = new Set();
    const fullKey = materialWords(value).join(' ');
    const fullResolution = resolvedValues.get(fullKey);
    if (fullResolution?.size) return new Set(fullResolution);
    for (const token of materialTokens(value)) {
      if (/^mt_[a-z0-9_]+$/i.test(token)) ids.add(token);
      else {
        const key = materialWords(token).join(' ');
        for (const id of aliases.get(key) ?? []) ids.add(id);
        for (const id of resolvedValues.get(key) ?? []) ids.add(id);
      }
    }
    return ids;
  };

  // A material family alone is symmetric and too broad. These edges record
  // only structured raw-input -> prepared-product relations.
  const directedProductsByRaw = new Map();
  const addDirectedRelation = (rawId, productId) => {
    if (!rawId || !productId || rawId === productId) return;
    const products = directedProductsByRaw.get(rawId) ?? new Set();
    products.add(productId);
    directedProductsByRaw.set(rawId, products);
  };
  for (const [productId, product] of materialMetadata) {
    const sourceTokens = materialWords(product.sourceTaxon).flatMap(token => token.split('_')).map(token => EN_RU.get(token) ?? token);
    if (!sourceTokens.length) continue;
    const rawMatches = [...materialMetadata].filter(([rawId, raw]) => rawId !== productId
      && sourceTokens.every(token => raw.terms.has(token)));
    if (rawMatches.length === 1) addDirectedRelation(rawMatches[0][0], productId);
  }
  for (const row of resolution) {
    if (!/^mat_[a-z0-9_]+$/i.test(String(row.value ?? '').trim())) continue;
    const ids = String(row.mt_ids ?? '').split(';').map(value => value.trim()).filter(id => materialMetadata.has(id));
    if (ids.length < 2) continue;
    const valueTokens = materialWords(row.value)
      .flatMap(token => token.split('_').filter(part => !['mat', 'mt', 'material'].includes(part)))
      .map(token => EN_RU.get(token) ?? token);
    const products = ids.filter(id => {
      const terms = materialMetadata.get(id).terms;
      return valueTokens.some(token => terms.has(token));
    });
    if (products.length !== 1) continue;
    const productId = products[0];
    for (const rawId of ids) if (rawId !== productId) addDirectedRelation(rawId, productId);
  }

  const byArchiveId = new Map();
  const unmapped = new Map();
  let mappedValues = 0;
  for (const [archiveId, source] of masterItems) {
    const rawMaterialValues = ['primary_material', 'materials'].flatMap(field => materialText(source[field]));
    const meaningful = rawMaterialValues.flatMap(value => materialTokens(value));
    const matches = new Set(meaningful.flatMap(value => [...fromMaterialValues(value)]));
    const mixedOnly = rawMaterialValues.length > 0 && !meaningful.length;
    const nameMatches = specificNameMaterials(mixedOnly ? source.name_ru ?? '' : `${source.name_ru ?? ''} ${source.function ?? ''}`, mixedOnly);
    const explicitAmbiguousAlloy = rawMaterialValues.some(value => /alloy|сплав/iu.test(value));
    // A name may only refine explicit material evidence within its existing
    // vocabulary family. Exact Russian stems prevent common 4-character
    // prefixes from turning an ordinary name into a broad candidate set.
    const sourceCategoryTerms = String(source.category ?? '').toLowerCase().split(/[^a-z0-9]+/u);
    const familyMatches = [...nameMatches].filter(nameId => {
      const family = materialMetadata.get(nameId)?.family;
      return family && ([...matches].some(baseId => family === materialMetadata.get(baseId)?.family)
        || sourceCategoryTerms.includes(family));
    });
    if (mixedOnly && nameMatches.size === 1) {
      matches.add([...nameMatches][0]);
    } else if (!explicitAmbiguousAlloy && familyMatches.length === 1) {
      matches.clear();
      matches.add(familyMatches[0]);
    } else if (!explicitAmbiguousAlloy && familyMatches.length > 1) {
      matches.clear();
      for (const id of familyMatches) matches.add(id);
    }
    if (matches.size) {
      byArchiveId.set(archiveId, matches);
      mappedValues += meaningful.length || 1;
    } else if (meaningful.length) unmapped.set(archiveId, meaningful);
  }
  return { byArchiveId, unmapped, mapped_values: mappedValues, fromMaterialValues, materialMetadata, directedProductsByRaw };
}

function hasVariantPairDecision(archiveId, target, decisions, scope) {
  return (decisions ?? []).some(decision => decision.archive_id === archiveId
    && decision.target_file === target.file && decision.target_id === target.id
    && (decision.waives ?? ['material']).includes(scope)
    && String(decision.reason ?? '').trim().length >= 16
    && mentionsIdentity(decision.reason, { archiveIds: [archiveId], key: archiveId })
    && mentionsIdentity(decision.reason, { archiveIds: target.archiveIds, key: target.id })
    && /\.test\.(?:mjs|js)(?:#|:|$)/i.test(String(decision.verification ?? '')));
}

function variantIdentityErrors(archiveId, source, target, materialMap, pairDecisions = []) {
  const errors = [];
  const targetRow = target?.row ?? target;
  const waivesCategory = hasVariantPairDecision(archiveId, target, pairDecisions, 'category');
  const waivesMaterial = hasVariantPairDecision(archiveId, target, pairDecisions, 'material');
  const sourceCategory = String(source?.category ?? '').trim().toLowerCase();
  const targetCategory = String(targetRow?.category ?? '').trim().toLowerCase();
  if (sourceCategory && targetCategory && sourceCategory !== targetCategory && !waivesCategory) {
    errors.push(`${archiveId}: variant target category ${targetCategory} does not match source category ${sourceCategory}`);
  }
  const sourceMaterials = materialMap.byArchiveId.get(archiveId) ?? new Set();
  if (!sourceMaterials.size) {
    const unresolved = materialMap.unmapped.get(archiveId) ?? [];
    if (unresolved.length) errors.push(`${archiveId}: archive material could not be mapped to crafts materials (${unresolved.join('; ')})`);
    return errors;
  }
  const targetId = String(targetRow?.mt_id ?? '').trim();
  const targetValues = ['primary_material', 'material', 'materials', 'material_family']
    .map(field => targetRow?.[field]).filter(Boolean);
  const targetMaterials = targetId.startsWith('mt_')
    ? new Set([targetId])
    : new Set(targetValues.flatMap(value => [...materialMap.fromMaterialValues(value)]));
  const hasDirectionalMatch = [...sourceMaterials].some(sourceId => [...targetMaterials].some(targetId =>
    materialMap.directedProductsByRaw.get(sourceId)?.has(targetId)));
  if (targetMaterials.size && ![...sourceMaterials].some(value => targetMaterials.has(value))
    && !hasDirectionalMatch && !waivesMaterial) {
    errors.push(`${archiveId}: variant target material ${[...targetMaterials].sort().join('|')} does not match archive material candidates ${[...sourceMaterials].sort().join('|')}`);
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

function resolveTarget(root, ref, rowsByFile, entityIdRows, { entityOnly = false, specs = ENTITY_SPEC_BY_FILE, jsonSpecs = new Map() } = {}) {
  const value = String(ref ?? '').trim();
  if (!value || /(?:^|[#:/])(?:row[-_ ]?\d+)(?:$|\b)/i.test(value)) return { error: 'variant target is empty or row-number based' };
  const hash = value.lastIndexOf('#');
  const targetId = hash >= 0 ? value.slice(hash + 1).trim() : value;
  if (!targetId || !/^[a-z][a-z0-9_:-]*$/i.test(targetId)) return { error: `variant target has no stable ID: ${value}` };
  if (hash >= 0) {
    const relative = value.slice(0, hash);
    const exact = path.resolve(root, relative);
    if (fs.existsSync(exact) && path.extname(exact).toLowerCase() === '.json') {
      const jsonSpec = jsonSpecs.get(relative);
      if (entityOnly && !jsonSpec) return { error: `target path ${relative} is JSON data, not a registered entity table` };
      let objects;
      try { objects = jsonObjects(JSON.parse(fs.readFileSync(exact, 'utf8'))); }
      catch { return { error: `target JSON cannot be read: ${relative}` }; }
      const matches = jsonSpec
        ? objects.filter(candidate => String(candidate[jsonSpec.key] ?? '').trim() === targetId)
        : objects.filter(candidate => Object.values(candidate).some(cell => String(cell).trim() === targetId));
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
      if (!isEntityTable(file, Object.keys(rows[0] ?? {}), specs)) return { error: `target path ${relative} is not an entity table` };
      const spec = specs.get(file);
      const keyed = rows.filter(candidate => String(candidate[spec.key] ?? '').trim() === targetId);
      const matches = keyed.length ? keyed : rows.filter(candidate => Object.values(candidate).some(cell => cell.trim() === targetId));
      if (matches.length !== 1) return { error: `variant target ID ${targetId} resolves to ${matches.length} rows in ${file}` };
      const row = matches[0];
      return { id: targetId, name: rowName(row), family: row.family_key || '', file, row, archiveIds: primaryArchiveIds(row, rowKey(row, file, specs) || targetId) };
    }
  }
  const matches = entityIdRows.get(targetId) ?? [];
  if (matches.length !== 1) return { error: `variant target ID ${targetId} resolves to ${matches.length} rows` };
    return { id: targetId, name: rowName(matches[0].row), family: matches[0].row.family_key || '', file: matches[0].file, row: matches[0].row, archiveIds: primaryArchiveIds(matches[0].row, rowKey(matches[0].row, matches[0].file, specs) || targetId) };
}

function errorCode(message) {
  if (/archive material could not be mapped/i.test(message)) return 'ICA_MATERIAL_UNMAPPED';
  if (/variant target material/i.test(message)) return 'ICA_VARIANT_MATERIAL_MISMATCH';
  if (/variant target category|variant target family/i.test(message)) return 'ICA_VARIANT_IDENTITY_MISMATCH';
  if (/variant period excludes 1230|new entity period excludes 1230/i.test(message)) return 'ICA_PERIOD_EXCLUDES_1230';
  if (/research_only/i.test(message)) return 'ICA_RESEARCH_ONLY_INVALID';
  if (/semantic-root collision/i.test(message)) return 'ICA_NAME_COLLISION';
  if (/routed target_ref .* disagrees with (?:receiving (?:variant|reference|target|decision)|existing archive owner)/i.test(message)) return 'ICA_ROUTE_TARGET_MISMATCH';
  if (/route targets its own group/i.test(message)) return 'ICA_ROUTE_SELF_GROUP';
  if (/awaits_owner/i.test(message) && /already has an entity|receiving group .* has a decision/i.test(message)) return 'ICA_ROUTE_AWAITS_OWNER_CONFLICT';
  if (/routed target_ref|target_group|routed decision/i.test(message)) return 'ICA_ROUTE_INVALID';
  if (/reference /i.test(message)) return 'ICA_REFERENCE_INVALID';
  if (/placement ref/i.test(message)) return 'ICA_PLACEMENT_UNRESOLVED';
  if (/entity owner appears|already has entity owner/i.test(message)) return 'ICA_ARCHIVE_MULTIPLE_OWNERS';
  if (/no new\/entity ledger decision/i.test(message)) return 'ICA_ENTITY_NO_LEDGER_DECISION';
  if (/new ledger row resolves to/i.test(message)) return 'ICA_ENTITY_ROW_MISSING';
  if (/variant target|archive item itself/i.test(message)) return 'ICA_VARIANT_TARGET_INVALID';
  if (/registry|catalog group|CSV with entity IDs/i.test(message)) return 'ICA_REGISTRY_COVERAGE';
  return 'ICA_OWNERSHIP_INVALID';
}

export function checkArchiveOwnership(root = base) {
  const errors = [];
  const currentRegistry = fs.existsSync(path.join(root, REGISTRY_FILE)) ? registryAt(root) : registry;
  const specs = new Map(currentRegistry.entity_tables.map(spec => [spec.file, spec]));
  const jsonSpecs = new Map((currentRegistry.entity_json_files ?? []).map(spec => [spec.file, spec]));
  const ownerTables = new Set(currentRegistry.entity_tables.filter(spec => spec.owner).map(spec => spec.file));
  const collisionTables = new Set(currentRegistry.entity_tables.filter(spec => spec.collision_scan !== false).map(spec => spec.file));
  const ledgerFiles = currentRegistry.ledger_files;
  const ledgerEntityTable = new Map(ledgerFiles.map((file, index) => [file, LEDGER_ENTITY_TABLES[index]]));
  const files = csvFiles(root);
  const masterIds = masterArchiveIds(root);
  const masterItems = masterArchiveItems(root);
  const archiveMaterialMap = buildArchiveMaterialMap(root, masterItems);
  const rowsByFile = new Map(files.map(file => [file, parseCsv(fs.readFileSync(path.join(root, file), 'utf8'))]));
  errors.push(...registryCoverageErrors(root, files, rowsByFile));
  const ledgerArchiveIds = new Set();
  const ledgerReasonsByArchiveId = new Map();
  for (const [file, rows] of rowsByFile) if (isLedgerFile(file, ledgerFiles)) {
    for (const row of rows) for (const id of archiveIds(row.archive_ref || row.master_item_ref || '')) {
      ledgerArchiveIds.add(id);
      const reasons = ledgerReasonsByArchiveId.get(id) ?? [];
      reasons.push(...decisionReasons(row));
      ledgerReasonsByArchiveId.set(id, reasons);
    }
  }
  const owners = new Map();
  const entityIdRows = new Map();
  const placementRefs = [];
  const ledgers = [];
  const entityRecords = [];
  const pairExceptions = [];

  for (const [file, rows] of rowsByFile) {
    if (isLedgerFile(file, ledgerFiles)) {
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
      const key = rowKey(row, file, specs);
      if (isEntityRow(file, headers, row, specs, ledgerFiles)) {
        const ids = specs.get(file)?.track_archive_ids !== false ? entityArchiveIds(file, row, ledgerArchiveIds, masterItems, specs) : new Set();
        const record = {
          file, line, row, name: rowName(row), key, selfArchiveIds: entitySelfArchiveIds(file, row, specs),
          ledgerReasons: [...ids].flatMap(id => ledgerReasonsByArchiveId.get(id) ?? []),
        };
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
    if (!ownerTables.has(entity.file)) continue;
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
      const ownTable = ledgerEntityTable.get(file);
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
      const target = resolveTarget(root, ref, rowsByFile, entityIdRows, { specs, jsonSpecs });
      if (target.error) errors.push(`${archiveId}: reference ${target.error.replace(/^variant /, '')} (${ref || 'missing target'})`);
      else if (!target.name) errors.push(`${archiveId}: reference target ${target.id} has no resolvable identity`);
    }
    const variantDisposition = !isTerminalRoutedRow(row) && Object.entries(row).some(([key, value]) =>
      /^(?:record_type|type|match_type|disposition|inclusion_result|semantic_result|archive_action|selected_action)$/i.test(key)
        && /^(?:variant|add_variant)$/i.test(String(value).trim()));
    if (variantDisposition) {
      const target = resolveTarget(root, row.game_base_ref || row.target_ref || '', rowsByFile, entityIdRows, { specs, jsonSpecs });
      if (target.error) errors.push(`${archiveId}: ${target.error} (${row.game_base_ref || row.target_ref || 'missing target'})`);
      else if (!target.name) errors.push(`${archiveId}: variant target ${target.id} has no resolvable identity`);
      else if (target.archiveIds.includes(archiveId) || archiveIds(target.id).includes(archiveId)) errors.push(`${archiveId}: variant target resolves to the archive item itself`);
      else {
        errors.push(...variantIdentityErrors(archiveId, masterItems.get(archiveId), target, archiveMaterialMap, currentRegistry.pair_decisions));
        if (row.family_key && target.family && row.family_key !== target.family) errors.push(`${archiveId}: variant target family ${target.family} does not match ledger family ${row.family_key}`);
      }
      if (periodContains1230(row.period) === false) errors.push(`${archiveId}: variant period excludes 1230 (${row.period})`);
      if (Object.values(row).some(value => /research_only/i.test(String(value ?? '')))) errors.push(`${archiveId}: research_only material cannot be a variant`);
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
      const existingGroupOwners = (owners.get(id) ?? []).filter(entity => ownerGroup(entity.file) === group);
      const receivingLedgerDecision = (ledgerByArchiveId.get(id) ?? []).some(decision => {
        const decisionItem = ledgers.find(candidate => candidate.archiveId === id && candidate.row === decision);
        return decisionItem && ownerGroup(decisionItem.file) === group && isTerminalDecision(decision);
      });
      if (ref) {
        const target = resolveTarget(root, ref, rowsByFile, entityIdRows, { entityOnly: true, specs, jsonSpecs });
        if (target.error) errors.push(`${id}: routed target_ref does not resolve (${ref}): ${target.error}`);
        else if (group && ownerGroup(target.file) !== group) errors.push(`${id}: routed target_ref resolves in ${ownerGroup(target.file)}, not target_group ${group}`);
        else if (existingGroupOwners.length === 1
          && (existingGroupOwners[0].file !== target.file || existingGroupOwners[0].key !== target.id)) {
          errors.push(`${id}: routed target_ref ${ref} disagrees with existing archive owner ${existingGroupOwners[0].file}#${existingGroupOwners[0].key} in ${group}`);
        }
        else {
          const receivingTargets = (ledgerByArchiveId.get(id) ?? []).filter(decision => {
            const decisionItem = ledgers.find(candidate => candidate.archiveId === id && candidate.row === decision);
            return decisionItem && ownerGroup(decisionItem.file) === group
              && (isNewLedgerRow(decision) || isTerminalReferenceRow(decision)
                || Object.entries(decision).some(([key, value]) => /^(?:record_type|type|match_type|disposition|inclusion_result|semantic_result|archive_action|selected_action)$/i.test(key) && /^(?:variant|add_variant)$/i.test(String(value).trim())));
          });
          for (const decision of receivingTargets) {
            const expectedRef = String(decision.game_base_ref || decision.target_ref || '').trim();
            const expectedTarget = expectedRef
              ? resolveTarget(root, expectedRef, rowsByFile, entityIdRows, { specs, jsonSpecs })
              : null;
            const receivingEntities = existingGroupOwners;
            const newEntityTarget = isNewLedgerRow(decision) && !expectedRef && receivingEntities.length === 1
              ? receivingEntities[0]
              : null;
            if ((expectedRef && (expectedTarget.error || expectedTarget.id !== target.id || expectedTarget.file !== target.file))
              || (newEntityTarget && (newEntityTarget.key !== target.id || newEntityTarget.file !== target.file))
              || (isNewLedgerRow(decision) && !expectedRef && receivingEntities.length !== 1)) {
              errors.push(`${id}: routed target_ref ${ref} disagrees with receiving decision target ${expectedRef} in ${group}`);
            }
          }
        }
      } else {
        const awaitsOwner = new RegExp(`(?:^|[\\s(])awaits_owner:${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s.,;)])`, 'u').test(String(route.row.reason ?? ''));
        if (!awaitsOwner) errors.push(`${id}: empty routed target_ref requires reason token awaits_owner:${group}`);
        if (receivingLedgerDecision) errors.push(`${id}: empty routed target_ref is invalid because receiving group ${group} has a decision`);
        if ((owners.get(id) ?? []).some(entity => ownerGroup(entity.file) === group)) errors.push(`${id}: awaits_owner is invalid because receiving group ${group} already has an entity`);
      }
      if (group && group === ownerGroup(route.file)) errors.push(`${id}: route targets its own group ${group}`);
    }
  }

  const roots = new Map();
  for (const entity of entityRecords) {
    const rootKey = normalizeSemanticRoot(entity.name);
    if (!rootKey) continue;
    for (const previous of roots.get(rootKey) ?? []) {
      if (!collisionTables.has(previous.file) || !collisionTables.has(entity.file)) continue;
      if (!ownerTables.has(previous.file) && !ownerTables.has(entity.file)) continue;
      if (!(previous.selfArchiveIds?.length || entity.selfArchiveIds?.length)) continue;
      const waiver = pairSpecificDecision(previous, entity, currentRegistry.pair_decisions)
        || pairSpecificDecision(entity, previous, currentRegistry.pair_decisions);
      if (!waiver) errors.push(`semantic-root collision “${rootKey}”: ${previous.file}:${previous.line} (${previous.archiveIds.join('|') || previous.key}; ${previous.name}) <> ${entity.file}:${entity.line} (${entity.archiveIds.join('|') || entity.key}; ${entity.name}); add an explicit pair decision with reason and test verification`);
      else pairExceptions.push({ semanticRoot: rootKey, ...waiver });
    }
    const current = roots.get(rootKey) ?? [];
    current.push(entity);
    roots.set(rootKey, current);
  }

  const archiveIdsSeen = new Set([...owners.keys(), ...ledgers.map(item => item.archiveId).filter(Boolean)]);
  const error_counts = {};
  for (const message of errors) {
    const code = errorCode(message);
    error_counts[code] = (error_counts[code] ?? 0) + 1;
  }
  const materialMappingCounts = {
    mapped_archive_values: archiveMaterialMap.mapped_values,
    unmapped_archive_ids: archiveMaterialMap.unmapped.size,
    unmapped_values_by_frequency: [...archiveMaterialMap.unmapped.values()].flat().reduce((counts, value) => {
      const key = String(value).toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
  };
  return {
    errors,
    issues: errors.map(message => ({ code: errorCode(message), message })),
    error_counts,
    pairExceptions,
    counts: { csv_files: files.length, archive_ids: archiveIdsSeen.size, entity_owners: owners.size, entity_records: entityRecords.length, ...materialMappingCounts },
  };
}

export function checkArchiveOwnershipRegistry(root = base) {
  const files = csvFiles(root);
  const rowsByFile = new Map(files.map(file => [file, parseCsv(fs.readFileSync(path.join(root, file), 'utf8'))]));
  return registryCoverageErrors(root, files, rowsByFile);
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
