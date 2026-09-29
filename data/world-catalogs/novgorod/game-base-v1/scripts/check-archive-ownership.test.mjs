import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { archiveIds, checkArchiveOwnership, checkArchiveOwnershipRegistry, normalizeSemanticRoot, parseCsv } from './check-archive-ownership.mjs';

const gameBase = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-ownership-'));
  const files = [
    'crafts-tools-processes/materials_registry/material_entities.csv',
    'buildings-interiors-containers/interiors/material_entities.csv',
    'clothing-appearance/garments/material_entities.csv',
    'clothing-appearance/outfits_by_role/outfits.csv',
    'items-weapons-armour/items/weapons_armour.csv',
    'crafts-tools-processes/archive_inclusion_ledger.csv',
    'buildings-interiors-containers/archive_inclusion_ledger.csv',
    'clothing-appearance/reports/archive_inclusion_ledger.csv',
    'items-weapons-armour/items/archive_inclusion_ledger.csv',
    'items-household-personal/items/item_place_frequency.csv',
    'items-household-personal/items/household.csv',
    'items-household-personal/items/personal.csv',
    'nature-materials-weather/natural_materials_soils/natural_materials.csv',
    'sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv',
    'crafts-tools-processes/sources/crosswalk.csv',
  ];
  for (const file of files) fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  for (const file of files.filter(file => file.endsWith('.csv'))) fs.writeFileSync(path.join(root, file), '');
  const entityHeader = 'item_id,name_ru,family_key,source_refs\n';
  for (const file of files.filter(file => file.endsWith('material_entities.csv'))) fs.writeFileSync(path.join(root, file), entityHeader);
  fs.writeFileSync(path.join(root, 'items-weapons-armour/items/weapons_armour.csv'), 'wp_id,name_ru,source_refs,archive_ref,archive_refs\n');
  fs.writeFileSync(path.join(root, 'clothing-appearance/outfits_by_role/outfits.csv'), 'of_id,class_name_ru\n');
  for (const file of files.filter(file => file.endsWith('archive_inclusion_ledger.csv'))) {
    fs.writeFileSync(path.join(root, file), 'archive_ref,archive_name,disposition,game_base_ref,family_key,period,generation_policy,decision,reason,record_type,source_action,target_group,target_ref,status,semantic_result\n');
  }
  fs.writeFileSync(path.join(root, 'items-household-personal/items/item_place_frequency.csv'), 'ipf_id,item_or_category_ref,ref_kind\n');
  for (const file of ['household.csv', 'personal.csv']) {
    fs.writeFileSync(path.join(root, `items-household-personal/items/${file}`), 'it_id,name_ru,technique,quantity_unit,master_refs,source_refs,note\n');
  }
  fs.writeFileSync(path.join(root, 'sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv'), 'item_id,name_ru,category\nOMI00007,Ложка,small_household_personal\nOMI00008,Другая вещь,small_household_personal\n');
  fs.writeFileSync(path.join(root, 'nature-materials-weather/natural_materials_soils/natural_materials.csv'), 'nm_id,name_ru,source_refs\n');
  return root;
}

function append(root, relative, line) {
  fs.appendFileSync(path.join(root, relative), `${line}\n`);
}

function gameBaseCopy() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-ownership-live-'));
  const root = path.join(parent, 'game-base-v1');
  fs.cpSync(gameBase, root, { recursive: true });
  const masterRelative = 'sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv';
  const source = path.resolve(gameBase, '../', masterRelative);
  const target = path.join(parent, masterRelative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return { parent, root };
}

function updateLedger(root, id, field, value, ledgerPath) {
  const file = path.join(root, ledgerPath);
  const text = fs.readFileSync(file, 'utf8');
  const headers = text.slice(0, text.indexOf('\n')).replace(/^\uFEFF/, '').split(',');
  const rows = text.trimEnd().split(/\r?\n/).slice(1).map(line => {
    const cells = [];
    let cell = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quoted && char === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { cells.push(cell); cell = ''; }
      else cell += char;
    }
    cells.push(cell);
    return cells;
  });
  const archiveIndex = headers.indexOf('archive_ref');
  const fieldIndex = headers.indexOf(field);
  const row = rows.find(cells => String(cells[archiveIndex] ?? '').endsWith(`:${id}`));
  assert.ok(row, `missing ${id} in ${ledgerPath}`);
  row[fieldIndex] = value;
  const quote = value => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  fs.writeFileSync(file, `${headers.join(',')}\n${rows.map(cells => headers.map((_, index) => quote(cells[index] ?? '')).join(',')).join('\n')}\n`);
}

function appendCsvObject(root, relative, values) {
  const file = path.join(root, relative);
  const headers = fs.readFileSync(file, 'utf8').split(/\r?\n/, 1)[0].replace(/^\uFEFF/, '').split(',');
  const quote = value => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  fs.appendFileSync(file, `${headers.map(header => quote(values[header])).join(',')}\n`);
}

test('semantic roots ignore the shared modifier classes but retain common object identity', () => {
  assert.equal(normalizeSemanticRoot('Песок для присыпки'), normalizeSemanticRoot('Кварцевый песок'));
  assert.equal(normalizeSemanticRoot('Обгоревшая кость'), normalizeSemanticRoot('Кость'));
  assert.equal(normalizeSemanticRoot('Синяя стеклянная капля'), normalizeSemanticRoot('Зелёная стеклянная капля'));
  assert.equal(normalizeSemanticRoot('sand'), normalizeSemanticRoot('mt_quartz_sand'));
  assert.equal(normalizeSemanticRoot('charred bone'), normalizeSemanticRoot('mt_bone'));
  assert.equal(normalizeSemanticRoot('blue glass drop'), normalizeSemanticRoot('green glass drop'));
});

test('archive identifier parsing includes the full reviewed vocabulary, including MUS', () => {
  assert.deepEqual(archiveIds('MUS0007 and OMI00001'), ['MUS0007', 'OMI00001']);
});

test('pair-specific ledger decisions allow only the named semantic-root collision pairs', () => {
  const root = fixture();
  try {
    const groups = [
      ['crafts-tools-processes/materials_registry/material_entities.csv', 'OMI00001', 'sand', 'sand_use', 'OMI00002 is mineral sand; OMI00001 is writing sand used for ink drying.'],
      ['buildings-interiors-containers/interiors/material_entities.csv', 'OMI00002', 'mt_quartz_sand', 'quartz_sand', 'OMI00001 is writing sand; OMI00002 is loose quartz mineral stock.'],
      ['crafts-tools-processes/materials_registry/material_entities.csv', 'OMI00003', 'charred bone', 'bone_burnt', 'OMI00004 is raw bone; OMI00003 is burnt bone with distinct waste use.'],
      ['buildings-interiors-containers/interiors/material_entities.csv', 'OMI00004', 'mt_bone', 'bone', 'OMI00003 is burnt bone waste; OMI00004 is unburned bone material.'],
      ['crafts-tools-processes/materials_registry/material_entities.csv', 'OMI00005', 'blue glass drop', 'glass_drop_blue', 'OMI00006 is green glass; OMI00005 has a distinct blue color identity.'],
      ['buildings-interiors-containers/interiors/material_entities.csv', 'OMI00006', 'green glass drop', 'glass_drop_green', 'OMI00005 is blue glass; OMI00006 has a distinct green color identity.'],
    ];
    const ledgers = new Map();
    for (const [index, [file, id, name, family, reason]] of groups.entries()) {
      append(root, file, `n1230:material_item:${id.toLowerCase()},${name},${family},sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:${id}`);
      const ledger = file.startsWith('crafts-')
        ? 'crafts-tools-processes/archive_inclusion_ledger.csv'
        : 'buildings-interiors-containers/archive_inclusion_ledger.csv';
      if (!ledgers.has(ledger)) ledgers.set(ledger, []);
      ledgers.get(ledger).push(`${id},${name},new,,${family},1180–1260,,distinct,${reason}`);
    }
    for (const [file, rows] of ledgers) for (const row of rows) append(root, file, row);
    const result = checkArchiveOwnership(root);
    assert.deepEqual(result.errors, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('sand, charred bone, and colored glass collisions fail without an authored reason', () => {
  const root = fixture();
  try {
    const pairs = [
      ['OMI00011', 'sand', 'OMI00012', 'mt_quartz_sand'],
      ['OMI00013', 'charred bone', 'OMI00014', 'mt_bone'],
      ['OMI00015', 'blue glass drop', 'OMI00016', 'green glass drop'],
    ];
    for (const [leftId, left, rightId, right] of pairs) {
      append(root, 'crafts-tools-processes/materials_registry/material_entities.csv', `n1230:material_item:${leftId.toLowerCase()},${left},left,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:${leftId}`);
      append(root, 'buildings-interiors-containers/interiors/material_entities.csv', `n1230:material_item:${rightId.toLowerCase()},${right},right,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:${rightId}`);
      append(root, 'crafts-tools-processes/archive_inclusion_ledger.csv', `${leftId},${left},new,,left,1180–1260,,unique,`);
      append(root, 'buildings-interiors-containers/archive_inclusion_ledger.csv', `${rightId},${right},new,,right,1180–1260,,unique,`);
    }
    const errors = checkArchiveOwnership(root).errors.join('\n');
    assert.match(errors, /semantic-root collision “песок”/);
    assert.match(errors, /semantic-root collision “кость”/);
    assert.match(errors, /semantic-root collision “стекло капля”/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('placement references may resolve through D39 master fallback and are not entity owners', () => {
  const root = fixture();
  try {
    append(root, 'crafts-tools-processes/materials_registry/material_entities.csv', 'n1230:material_item:omi00007,Ложка,spoon,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00007');
    append(root, 'crafts-tools-processes/archive_inclusion_ledger.csv', 'OMI00007,Ложка,new,,spoon,1180–1260,,unique,New candidate');
    append(root, 'items-household-personal/items/item_place_frequency.csv', 'ipf_1,n1230:material_item:omi00007,master');
    append(root, 'crafts-tools-processes/sources/crosswalk.csv', 'archive_ref,match_type\nOMI00007,source mention');
    assert.deepEqual(checkArchiveOwnership(root).errors, []);
    append(root, 'items-household-personal/items/item_place_frequency.csv', 'ipf_2,n1230:material_item:omi00008,master');
    assert.deepEqual(checkArchiveOwnership(root).errors, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('placement references without entity or master fallback fail, and duplicate entity owners fail', () => {
  const root = fixture();
  try {
    append(root, 'items-household-personal/items/item_place_frequency.csv', 'ipf_missing,n1230:material_item:omi00017,master');
    append(root, 'items-household-personal/items/item_place_frequency.csv', 'ipf_missing_it,it_hh_missing,it');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /placement ref n1230:material_item:omi00017 resolves to neither an entity nor a D39 master archive ID/);
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /placement ref it_hh_missing resolves to neither an entity nor a D39 master archive ID/);

    append(root, 'crafts-tools-processes/materials_registry/material_entities.csv', 'n1230:material_item:omi00018,Обломок,fragment,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00018');
    append(root, 'buildings-interiors-containers/interiors/material_entities.csv', 'n1230:material_item:omi00018,Обломок,fragment,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00018');
    append(root, 'items-household-personal/items/item_place_frequency.csv', 'ipf_duplicate,n1230:material_item:omi00018,master');
    const errors = checkArchiveOwnership(root).errors.join('\n');
    assert.match(errors, /OMI00018: entity owner appears 2 times/);
    assert.match(errors, /placement ref n1230:material_item:omi00018 resolves to 2 entity owners/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('IHP ownership uses only the primary master ref; secondary refs and documented set components are support', () => {
  const root = fixture();
  try {
    const table = 'items-household-personal/items/household.csv';
    append(root, table, 'it_hh_storage_pot,Большой горшок,handmade,piece,n1230:material_item:pot0018;n1230:material_item:pot0023,,');
    append(root, table, 'it_hh_fat_vessel,Сосуд для жира,wheel_thrown,piece,n1230:material_item:pot0023,,');
    append(root, table, 'it_hh_flint,Кресало,forged,piece,n1230:material_item:hou0011,,');
    append(root, table, 'it_hh_firesteel,Огниво,forged,piece,n1230:material_item:hou0012,,');
    append(root, 'items-household-personal/items/personal.csv', 'it_ps_fire_kit,Огнивный набор,assembled,set,n1230:material_item:hou0011;n1230:material_item:hou0012,,Набор как сочетание засвидетельствованных вещей; сам комплект — вывод.');
    append(root, 'items-household-personal/items/household.csv', 'it_hh_kindling,Растопка,split;wrapped,bundle,n1230:material_item:omi01803,,');
    append(root, 'nature-materials-weather/natural_materials_soils/natural_materials.csv', 'nm_birch_bark,Береста,OMI01803;OMI01299');
    append(root, 'sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv', 'OMI01803,Берестяная стружка для растопки,small_household_personal\nOMI01299,Береста,wood_bark_plant_materials');
    const duplicates = checkArchiveOwnership(root).errors.filter(error => error.includes('entity owner appears'));
    assert.deepEqual(duplicates, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('new entity period rule rejects any proven period that excludes 1230', () => {
  const root = fixture();
  try {
    const file = path.join(root, 'crafts-tools-processes/archive_inclusion_ledger.csv');
    fs.appendFileSync(file, 'OMI00009,Поздний инструмент,new,,,1450–1700,,include,ошибка решения\n');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00009: new entity period excludes 1230/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('research_only entity exception follows explicit ledger restrictions, without ID allowlists', () => {
  const root = fixture();
  try {
    append(root, 'items-weapons-armour/items/weapons_armour.csv', 'wp_helmet_kettle_hat,Железная шапель,,downloads/catalog_items.csv:HLM0091,HLM0091');
    append(root, 'items-weapons-armour/items/weapons_armour.csv', 'wp_helmet_unreviewed,Unreviewed helmet,,downloads/catalog_items.csv:HLM0092,HLM0092');
    append(root, 'items-weapons-armour/items/archive_inclusion_ledger.csv', 'HLM0091,Железная шапель,new,,kettle_hat,1180–1260,research_only,restricted:denylist:deny_kettle_hat,Generation restricted by denylist; research only.');
    append(root, 'items-weapons-armour/items/archive_inclusion_ledger.csv', 'HLM0092,Unreviewed helmet,new,,helmet,1180–1260,research_only,restricted:denylist:deny_unreviewed_helmet,Generation restricted by denylist; research only.');
    assert.deepEqual(checkArchiveOwnership(root).errors, []);
    append(root, 'items-weapons-armour/items/weapons_armour.csv', 'wp_helmet_missing_guard,Missing guard helmet,,downloads/catalog_items.csv:HLM0093,HLM0093');
    append(root, 'items-weapons-armour/items/archive_inclusion_ledger.csv', 'HLM0093,Missing restriction,new,,great_helm,1180–1260,research_only,,No generation limitation given.');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /HLM0093: research_only material cannot be a new entity/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('variant targets require a stable resolvable identity and reject substitutions', () => {
  const root = fixture();
  try {
    const table = 'crafts-tools-processes/materials_registry/material_entities.csv';
    fs.appendFileSync(path.join(root, table), 'base_item,Деревянная пробка-затычка,wooden_bung,\nother_item,Другая вещь,container,\nresin_stopper,Пробка обмазанная смолой,resin_sealed_stopper,\n');
    append(root, 'crafts-tools-processes/archive_inclusion_ledger.csv', 'OMI00008,Вариант цели,variant,crafts-tools-processes/materials_registry/material_entities.csv#base_item,wooden_bung,1180–1260,,variant,Stable target');
    assert.deepEqual(checkArchiveOwnership(root).errors, []);
    const ledger = path.join(root, 'crafts-tools-processes/archive_inclusion_ledger.csv');
    fs.appendFileSync(ledger, 'OMI00009,Подмена цели,variant,crafts-tools-processes/materials_registry/material_entities.csv#other_item,wooden_stopper_conical,1180–1260,,variant,Wrong target\n');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00009: variant target family container does not match ledger family wooden_stopper_conical/);
    fs.appendFileSync(ledger, 'OMI00010,Цель по номеру,variant,crafts-tools-processes/materials_registry/material_entities.csv#row-2,tool,1180–1260,,variant,No row number\n');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00010: variant target is empty or row-number based/);
    fs.appendFileSync(path.join(root, table), 'OMI00019,Самоссылка,tool,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00019\n');
    fs.appendFileSync(ledger, 'OMI00019,Самоссылка,variant,crafts-tools-processes/materials_registry/material_entities.csv#OMI00019,tool,1180–1260,,variant,Self-target is invalid.\n');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00019: variant target resolves to the archive item itself/);

    append(root, 'clothing-appearance/outfits_by_role/outfits.csv', 'of_warrior_male_cold_any,Воинский зимний комплект');
    fs.appendFileSync(ledger, 'OMI00020,Вариант по профилю,variant,outfits_by_role/outfits.csv#of_warrior_male_cold_any,tool,1180–1260,,variant,Stable outfit target\n');
    assert.equal(checkArchiveOwnership(root).errors.some(error => error.startsWith('OMI00020:')), false);
    fs.appendFileSync(ledger, 'OMI00022,Коническая деревянная пробка,variant,crafts-tools-processes/materials_registry/material_entities.csv#base_item,wooden_stopper_conical,1180–1260,,variant,"Семантическое решение: variant; коническая форма пробки вариативна."\n');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00022: variant target family wooden_bung does not match ledger family wooden_stopper_conical/);
    fs.appendFileSync(ledger, 'OMI00023,Коническая деревянная пробка без основания,variant,crafts-tools-processes/materials_registry/material_entities.csv#base_item,wooden_stopper_conical,1180–1260,,variant,No reason\n');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00023: variant target family wooden_bung does not match ledger family wooden_stopper_conical/);
    fs.appendFileSync(ledger, 'OMI00024,Смоляная замазка у пробки,variant,crafts-tools-processes/materials_registry/material_entities.csv#resin_stopper,stopper_resin_residue,1180–1260,,variant,"Семантическое решение: variant; смоляная замазка относится к пробке."\n');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00024: variant target family resin_sealed_stopper does not match ledger family stopper_resin_residue/);
    fs.appendFileSync(ledger, 'OMI00021,Маршрут к владельцу,routed,,,,,,Routed to existing owner.,routed,add_variant\n');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00021: terminal routed decision is missing target_group/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('unmapped archive material gets its own stable code', () => {
  const root = fixture();
  try {
    const materials = 'crafts-tools-processes/materials_registry/materials.csv';
    fs.mkdirSync(path.dirname(path.join(root, materials)), { recursive: true });
    fs.writeFileSync(path.join(root, materials), 'mt_id,name_ru,name_en,material_family,aliases_ru\nmt_flax,лён,flax,textile,лен;льнян\n');
    append(root, 'crafts-tools-processes/archive_inclusion_ledger.csv', 'OMI00007,Ложка,variant,crafts-tools-processes/materials_registry/materials.csv#mt_flax,tool,1180–1260,,variant,Material resolution probe.');
    const result = checkArchiveOwnership(root);
    assert.equal(result.error_counts.ICA_MATERIAL_UNMAPPED, 1);
    assert.equal(result.issues.find(issue => issue.code === 'ICA_MATERIAL_UNMAPPED')?.message.includes('OMI00007'), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('terminal references resolve a stable target without requiring a new entity row', () => {
  const root = fixture();
  try {
    const component = path.join(root, 'clothing-appearance/garments/garment_components.csv');
    fs.mkdirSync(path.dirname(component), { recursive: true });
    fs.writeFileSync(component, 'gm_id,name_ru,source_refs\ngm_fw021,Кожаные ремешки и завязки обуви,costume:FW021\n');
    append(root, 'clothing-appearance/reports/archive_inclusion_ledger.csv',
      'FW021,Кожаные ремешки и завязки обуви,new,,,1180–1260,,ref,Existing clothing component.,new,,clothing-appearance,clothing-appearance/garments/garment_components.csv#gm_fw021,candidate,ref');
    assert.deepEqual(checkArchiveOwnership(root).errors, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('terminal routed decisions agree on owner group and stable target reference', () => {
  const root = fixture();
  try {
    const routeRow = (id, group, ref) => [id, 'Routed item', 'routed', '', '', '', '', '', 'Route to authoritative owner.', 'routed', '', group, ref, 'routed', ''].join(',');
    append(root, 'buildings-interiors-containers/archive_inclusion_ledger.csv', routeRow('MUS0007', 'crafts-tools-processes', 'crafts-tools-processes/materials_registry/material_entities.csv#mt_gusli'));
    append(root, 'crafts-tools-processes/archive_inclusion_ledger.csv', routeRow('MUS0007', 'transport-health-recreation', 'transport-health-recreation/recreation_culture/recreation_entities.csv#rec_032'));
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /MUS0007: terminal routed decisions disagree on target_group/);

    const alignedRoot = fixture();
    try {
      append(alignedRoot, 'crafts-tools-processes/materials_registry/material_entities.csv', 'base_target,Target,tool,');
      const target = 'crafts-tools-processes/materials_registry/material_entities.csv#base_target';
      append(alignedRoot, 'buildings-interiors-containers/archive_inclusion_ledger.csv', routeRow('MUS0011', 'crafts-tools-processes', target));
      assert.deepEqual(checkArchiveOwnership(alignedRoot).errors, []);

      append(alignedRoot, 'crafts-tools-processes/archive_inclusion_ledger.csv', routeRow('MUS0011', 'crafts-tools-processes', ''));
      assert.match(checkArchiveOwnership(alignedRoot).errors.join('\n'), /MUS0011: terminal routed decision is missing the agreed target_ref/);
    } finally { fs.rmSync(alignedRoot, { recursive: true, force: true }); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('routes require entity targets, match receiving variants, and cannot target their own group', () => {
  const root = fixture();
  try {
    const targetTable = 'crafts-tools-processes/materials_registry/material_entities.csv';
    append(root, targetTable, 'n1230:material_item:target_one,Target one,tool,');
    append(root, targetTable, 'n1230:material_item:target_two,Target two,tool,');
    append(root, 'crafts-tools-processes/archive_inclusion_ledger.csv', [
      'OMI00007', 'Probe variant', 'variant', `${targetTable}#n1230:material_item:target_one`, 'tool', '1180–1260', '', 'variant', 'Receiving owner chose target one.', '', '', '', '', '',
    ].join(','));
    const route = ['OMI00007', 'Probe route', 'routed', '', '', '', '', '', 'routed', 'routed', '', 'crafts-tools-processes', `${targetTable}#n1230:material_item:target_two`, 'routed', ''].join(',');
    append(root, 'buildings-interiors-containers/archive_inclusion_ledger.csv', route);
    let errors = checkArchiveOwnership(root);
    assert.ok(errors.error_counts.ICA_ROUTE_TARGET_MISMATCH > 0);

    const wrongKind = fixture();
    try {
      append(wrongKind, 'buildings-interiors-containers/archive_inclusion_ledger.csv', ['OMI00008', 'Wrong kind', 'routed', '', '', '', '', '', 'routed', 'routed', '', 'crafts-tools-processes', 'crafts-tools-processes/archive_inclusion_ledger.csv#OMI00007', 'routed', ''].join(','));
      assert.ok(checkArchiveOwnership(wrongKind).error_counts.ICA_ROUTE_INVALID > 0);
    } finally { fs.rmSync(wrongKind, { recursive: true, force: true }); }

    const selfRoute = fixture();
    try {
      append(selfRoute, targetTable, 'n1230:material_item:self_target,Self target,tool,');
      append(selfRoute, 'crafts-tools-processes/archive_inclusion_ledger.csv', ['OMI00008', 'Self route', 'routed', '', '', '', '', '', 'routed', 'routed', '', 'crafts-tools-processes', `${targetTable}#n1230:material_item:self_target`, 'routed', ''].join(','));
      assert.ok(checkArchiveOwnership(selfRoute).error_counts.ICA_ROUTE_SELF_GROUP > 0);
    } finally { fs.rmSync(selfRoute, { recursive: true, force: true }); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('routes match the entity accepted by the receiving group', () => {
  const targetTable = 'crafts-tools-processes/materials_registry/material_entities.csv';
  const receivingLedger = 'crafts-tools-processes/archive_inclusion_ledger.csv';
  const routeLedger = 'buildings-interiors-containers/archive_inclusion_ledger.csv';
  const expectedId = 'n1230:material_item:omi00008';
  const otherId = 'n1230:material_item:other_target';

  const prepare = () => {
    const root = fixture();
    appendCsvObject(root, targetTable, {
      item_id: expectedId,
      name_ru: 'Accepted entity',
      family_key: 'tool',
      source_refs: 'sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00008',
    });
    appendCsvObject(root, targetTable, {
      item_id: otherId,
      name_ru: 'Other entity',
      family_key: 'tool',
    });
    appendCsvObject(root, receivingLedger, {
      archive_ref: 'OMI00008',
      archive_name: 'Accepted entity',
      disposition: 'new',
      family_key: 'tool',
      period: '1180–1260',
      decision: 'entity',
      reason: 'Receiving group accepts this archive id as its entity.',
      record_type: 'new',
      status: 'candidate',
    });
    return root;
  };

  const correctRoot = prepare();
  try {
    appendCsvObject(correctRoot, routeLedger, {
      archive_ref: 'OMI00008',
      archive_name: 'Accepted entity route',
      disposition: 'routed',
      decision: 'routed',
      reason: 'Route to the authoritative owner.',
      record_type: 'routed',
      target_group: 'crafts-tools-processes',
      target_ref: `${targetTable}#${expectedId}`,
      status: 'routed',
    });
    assert.equal(checkArchiveOwnership(correctRoot).error_counts.ICA_ROUTE_TARGET_MISMATCH ?? 0, 0);
  } finally { fs.rmSync(correctRoot, { recursive: true, force: true }); }

  const wrongRoot = prepare();
  try {
    appendCsvObject(wrongRoot, routeLedger, {
      archive_ref: 'OMI00008',
      archive_name: 'Wrong entity route',
      disposition: 'routed',
      decision: 'routed',
      reason: 'Route to the authoritative owner.',
      record_type: 'routed',
      target_group: 'crafts-tools-processes',
      target_ref: `${targetTable}#${otherId}`,
      status: 'routed',
    });
    assert.ok(checkArchiveOwnership(wrongRoot).error_counts.ICA_ROUTE_TARGET_MISMATCH > 0);
  } finally { fs.rmSync(wrongRoot, { recursive: true, force: true }); }
});

test('semantic normalization does not fold й into и', () => {
  assert.notEqual(normalizeSemanticRoot('йод'), normalizeSemanticRoot('иод'));
});

test('semantic roots strip parenthetical qualifiers', () => {
  assert.equal(normalizeSemanticRoot('кость (трубчатая, крупный рогатый скот)'), normalizeSemanticRoot('кость'));
});

for (const [modified, plain] of [
  ['длинный брус', 'брус'],
  ['обугленная кость', 'кость'],
  ['рыбьи отходы', 'отходы'],
  ['ремонтная смола', 'смола'],
  ['песок для присыпки', 'песок'],
]) test(`semantic normalization strips modifier stem in ${modified}`, () => {
  assert.equal(normalizeSemanticRoot(modified), normalizeSemanticRoot(plain));
});

test('materials.csv participates in semantic collisions with material entities', () => {
  const root = fixture();
  try {
    const materials = path.join(root, 'crafts-tools-processes/materials_registry/materials.csv');
    fs.mkdirSync(path.dirname(materials), { recursive: true });
    fs.writeFileSync(materials, 'mt_id,name_ru\nmt_quartz_sand,Кварцевый песок\n');
    append(root, 'crafts-tools-processes/materials_registry/material_entities.csv', 'n1230:material_item:omi00031,Песок для присыпки,writing_sand,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00031');
    const errors = checkArchiveOwnership(root).errors.join('\n');
    assert.match(errors, /semantic-root collision “песок”/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('all game-base entity families participate in semantic collision scanning', () => {
  const root = fixture();
  try {
    const rows = [
      ['crafts-tools-processes/materials_registry/material_entities.csv', 'item_id,name_ru,family_key,source_refs', 'n1230:material_item:omi00035,Сено,hay,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00035'],
      ['food-drink/food/material_entities.csv', 'item_id,name_ru,family_key,source_refs', 'n1230:material_item:omi00036,Сено,hay,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00036'],
      ['items-household-personal/items/household.csv', 'it_id,name_ru,technique,quantity_unit,master_refs,source_refs,note', 'it_hh_hay,Сено,handmade,bundle,n1230:material_item:omi00037,,'],
      ['items-household-personal/items/personal.csv', 'it_id,name_ru,technique,quantity_unit,master_refs,source_refs,note', 'it_ps_hay,Сено,handmade,bundle,n1230:material_item:omi00037,,'],
      ['nature-materials-weather/natural_materials_soils/natural_materials.csv', 'nm_id,name_ru,source_refs', 'nm_hay,Сено,OMI00035'],
      ['fauna-fish-invertebrates-livestock/fauna/livestock_products.csv', 'lp_id,species_ref,name_ru,product_kind,food_or_material_refs,source_refs', 'lp_hay,fa_dom_cattle,Сено,material,OMI00035,OMI00035'],
      ['transport-health-recreation/transport_travel/transport_entities.csv', 'tr_id,kind,name_ru,source_refs', 'trv_hay,other,Сено,OMI00035'],
    ];
    fs.appendFileSync(path.join(root, 'sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv'), 'OMI00035,Сено,wood_bark_plant_materials\nOMI00036,Сено,wood_bark_plant_materials\nOMI00037,Сено,small_household_personal\n');
    for (const [file, header, row] of rows) {
      const fullPath = path.join(root, file);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, `${header}\n${row}\n`);
    }
    const errors = checkArchiveOwnership(root).errors.join('\n');
    const missing = rows.map(([file]) => file).filter(file => !errors.includes(file));
    assert.deepEqual(missing, [], `checker omitted entity-family collisions: ${missing.join(', ')}`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('registered garment entity gm_gm001 participates in archive-name collision checks', () => {
  const root = fixture();
  try {
    const garments = path.join(root, 'clothing-appearance/garments/garments.csv');
    fs.mkdirSync(path.dirname(garments), { recursive: true });
    fs.writeFileSync(garments, 'gm_id,source_item_id,name_ru,source_refs\ngm_gm001,GM001,Пробная одежда,costume:GM001\n');
    append(root, 'crafts-tools-processes/materials_registry/material_entities.csv', 'n1230:material_item:omi00045,Пробная одежда,garment,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00045');
    append(root, 'crafts-tools-processes/archive_inclusion_ledger.csv', 'OMI00045,Пробная одежда,new,,garment,1180–1260,,new entity,Added collision probe.');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /semantic-root collision “пробная одежда”/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('review authoring and bridge CSVs are excluded from entity and ledger scans', () => {
  const root = fixture();
  try {
    const excluded = [
      ['crafts-tools-processes/authoring/review_expectations.csv', 'item_id,name_ru,source_refs', 'n1230:material_item:omi00041,Пробная сущность,OMI00041'],
      ['crafts-tools-processes/authoring/review_disagreements.csv', 'item_id,name_ru,source_refs', 'n1230:material_item:omi00042,Пробная сущность,OMI00042'],
      ['crafts-tools-processes/authoring/archive_inclusion_ledger.csv', 'archive_ref,archive_name,disposition', 'OMI00043,Пробная сущность,routed'],
      ['bridge_outputs/material_entities.csv', 'item_id,name_ru,source_refs', 'n1230:material_item:omi00044,Пробная сущность,OMI00044'],
    ];
    for (const [file, header, row] of excluded) {
      const fullPath = path.join(root, file);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, `${header}\n${row}\n`);
    }
    const result = checkArchiveOwnership(root);
    assert.equal(result.counts.entity_records, 0);
    assert.equal(result.counts.archive_ids, 0);
    assert.deepEqual(result.errors, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('one unique unrelated ledger reason does not waive a same-name entity collision', () => {
  const root = fixture();
  try {
    append(root, 'crafts-tools-processes/materials_registry/material_entities.csv', 'n1230:material_item:omi00032,Деревянная пробка-затычка,wooden_bung,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00032');
    append(root, 'buildings-interiors-containers/interiors/material_entities.csv', 'n1230:material_item:omi00033,Деревянная пробка-затычка,wooden_bung,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00033');
    append(root, 'crafts-tools-processes/archive_inclusion_ledger.csv', 'OMI00032,Деревянная пробка-затычка,new,,wooden_bung,1180–1260,,distinct,Separate source record; retain independent ownership for unrelated provenance evidence.');
    append(root, 'buildings-interiors-containers/archive_inclusion_ledger.csv', 'OMI00033,Деревянная пробка-затычка,new,,wooden_bung,1180–1260,,distinct,Reviewed semantic roots; no object identity collapsed after checking modifiers.');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /semantic-root collision “пробка затычка”/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('variant self-target through a prefixed owner ID fails', () => {
  const root = fixture();
  try {
    const garments = path.join(root, 'clothing-appearance/garments/garments.csv');
    fs.mkdirSync(path.dirname(garments), { recursive: true });
    fs.writeFileSync(garments, 'gm_id,source_item_id,name_ru,source_refs\ngm_cmb021,CMB021,Одеяние служителя,costume:CMB021\n');
    append(root, 'clothing-appearance/reports/archive_inclusion_ledger.csv', 'CMB021,Одеяние служителя,variant,clothing-appearance/garments/garments.csv#gm_cmb021,garment,1180–1260,,variant,Primary costume provenance is CMB021.');
    const components = path.join(root, 'clothing-appearance/garments/garment_components.csv');
    fs.mkdirSync(path.dirname(components), { recursive: true });
    fs.writeFileSync(components, 'gm_id,name_ru,source_refs\ngm_fw021,Кожаные ремешки и завязки обуви,costume:FW021\n');
    append(root, 'clothing-appearance/reports/archive_inclusion_ledger.csv', 'FW021,Кожаные ремешки и завязки обуви,variant,clothing-appearance/garments/garment_components.csv#gm_fw021,clothing-appearance,1180–1260,,variant,Primary costume provenance is FW021.');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /CMB021: variant target resolves to the archive item itself/);
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /FW021: variant target resolves to the archive item itself/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('cross-ID material variants do not count aggregated source_refs as self-targets', () => {
  const root = fixture();
  try {
    const table = 'crafts-tools-processes/materials_registry/material_entities.csv';
    append(root, table, 'n1230:material_item:omi00056,Короткая деревянная рукоять,short_handle,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00056;OMI00057');
    append(root, table, 'n1230:material_item:omi00953,Скорлупа куриного яйца,chicken_eggshell,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00953;OMI00954');
    append(root, 'crafts-tools-processes/archive_inclusion_ledger.csv', 'OMI00057,Сломанная деревянная рукоять,variant,crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00056,short_handle,1180–1260,,variant,Broken-state variant of the canonical handle.');
    append(root, 'crafts-tools-processes/archive_inclusion_ledger.csv', 'OMI00954,Кучка измельчённой яичной скорлупы,variant,crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00953,chicken_eggshell,1180–1260,,variant,Eggshell residue variant of canonical eggshell waste.');
    const selfErrors = checkArchiveOwnership(root).errors.filter(error => /^(?:OMI00057|OMI00954): variant target resolves to the archive item itself/.test(error));
    assert.deepEqual(selfErrors, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('research_only variant is rejected', () => {
  const root = fixture();
  try {
    append(root, 'clothing-appearance/outfits_by_role/outfits.csv', 'of_warrior_male_cold_any,Воинский зимний комплект');
    append(root, 'clothing-appearance/reports/archive_inclusion_ledger.csv', 'CMB022,Служебное одеяние,variant,clothing-appearance/outfits_by_role/outfits.csv#of_warrior_male_cold_any,garment,1180–1260,research_only,variant,Research-only material cannot be a variant.');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /CMB022: research_only material cannot be a variant/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('single routed row requires target_group', () => {
  const root = fixture();
  try {
    append(root, 'buildings-interiors-containers/archive_inclusion_ledger.csv', 'OMI00034,Трут,routed,,,,,,Route to the existing household item.,routed,,,,');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00034: terminal routed decision is missing target_group/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('single routed row with empty target_ref requires awaits_owner even if a matching entity exists', () => {
  const root = fixture();
  try {
    append(root, 'items-household-personal/items/household.csv', 'it_hh_tinder,Трут,handmade,piece,n1230:material_item:omi00034,,');
    append(root, 'buildings-interiors-containers/archive_inclusion_ledger.csv', 'OMI00034,Трут,routed,,,,,,Route to the existing household item.,routed,,items-household-personal,,');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00034: empty routed target_ref requires reason token awaits_owner:items-household-personal/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('routed target_ref must resolve to a stable target in the receiving group', () => {
  const root = fixture();
  try {
    const route = (id, group, ref) => [id, 'Routed item', 'routed', '', '', '', '', '', 'Route to crafts owner.', 'routed', '', group, ref, 'routed', ''].join(',');
    append(root, 'buildings-interiors-containers/archive_inclusion_ledger.csv', route('OMI00091', 'crafts-tools-processes', 'crafts-tools-processes/materials_registry/material_entities.csv#missing_target'));
    let errors = checkArchiveOwnership(root).errors.join('\n');
    assert.match(errors, /OMI00091: routed target_ref does not resolve/);

    const receiving = fixture();
    try {
      append(receiving, 'items-household-personal/items/household.csv', 'it_hh_target,Целевая вещь,handmade,piece,,,');
      append(receiving, 'buildings-interiors-containers/archive_inclusion_ledger.csv', route('OMI00092', 'crafts-tools-processes', 'items-household-personal/items/household.csv#it_hh_target'));
      assert.match(checkArchiveOwnership(receiving).errors.join('\n'), /OMI00092: routed target_ref resolves in items-household-personal, not target_group crafts-tools-processes/);
    } finally { fs.rmSync(receiving, { recursive: true, force: true }); }

    const aligned = fixture();
    try {
      append(aligned, 'crafts-tools-processes/materials_registry/material_entities.csv', 'base_target,Целевая вещь,tool,');
      append(aligned, 'buildings-interiors-containers/archive_inclusion_ledger.csv', route('OMI00092', 'crafts-tools-processes', 'crafts-tools-processes/materials_registry/material_entities.csv#base_target'));
      assert.deepEqual(checkArchiveOwnership(aligned).errors, []);
    } finally { fs.rmSync(aligned, { recursive: true, force: true }); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('empty routed target_ref requires exact awaits_owner token and no receiving decision', () => {
  const root = fixture();
  try {
    append(root, 'buildings-interiors-containers/archive_inclusion_ledger.csv', ['OMI00093', 'Pending owner', 'routed', '', '', '', '', '', 'awaits_owner:crafts-tools-processes', 'routed', '', 'crafts-tools-processes', '', 'routed', ''].join(','));
    assert.deepEqual(checkArchiveOwnership(root).errors, []);
    append(root, 'crafts-tools-processes/archive_inclusion_ledger.csv', 'OMI00093,Receiving decision,rejected,,,,,,,rejected,,,,,');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00093: empty routed target_ref is invalid because receiving group crafts-tools-processes has a decision/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('awaits_owner is invalid when receiving group already owns the archive ID', () => {
  const root = fixture();
  try {
    append(root, 'crafts-tools-processes/materials_registry/material_entities.csv', 'n1230:material_item:omi00093,Already owned,tool,sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:OMI00093');
    append(root, 'buildings-interiors-containers/archive_inclusion_ledger.csv', ['OMI00093', 'Pending route', 'routed', '', '', '', '', '', 'awaits_owner:crafts-tools-processes', 'routed', '', 'crafts-tools-processes', '', 'routed', ''].join(','));
    assert.ok(checkArchiveOwnership(root).error_counts.ICA_ROUTE_AWAITS_OWNER_CONFLICT > 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('entity archive owner requires a new/entity decision in the same group', () => {
  const root = fixture();
  try {
    append(root, 'crafts-tools-processes/materials_registry/material_entities.csv', 'n1230:material_item:omi00094,Orphan entity,tool,');
    assert.match(checkArchiveOwnership(root).errors.join('\n'), /OMI00094: entity owner .* has no new\/entity ledger decision in owner group crafts-tools-processes/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('live game-base probes detect pair collision, category/material mismatch, and parenthetical roots', () => {
  const { parent, root } = gameBaseCopy();
  const bicLedger = 'buildings-interiors-containers/archive_inclusion_ledger.csv';
  const bicEntities = 'buildings-interiors-containers/interiors/material_entities.csv';
  const sourceRef = 'sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:';
  try {
    const ledgerHeader = 'archive_ref,archive_name,archive_action,match_type,record_type,disposition,game_base_ref,target_ref,target_group,family_key,period,generation_policy,decision,reason,dedup_result,dedup_reason,semantic_result,inclusion_result\n';
    for (const [relative, header] of [
      [bicEntities, 'item_id,name_ru,family_key,primary_material,category,source_refs\n'],
      [bicLedger, ledgerHeader],
      ['crafts-tools-processes/materials_registry/material_entities.csv', 'item_id,name_ru,family_key,primary_material,category,source_refs\n'],
      ['crafts-tools-processes/archive_inclusion_ledger.csv', ledgerHeader],
    ]) if (!fs.existsSync(path.join(root, relative))) {
      fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      fs.writeFileSync(path.join(root, relative), header);
    }
    appendCsvObject(root, bicEntities, {
      item_id: 'n1230:material_item:omi01504', name_ru: 'Деревянная пробка-затычка',
      family_key: 'wooden_stopper', primary_material: 'wood', category: 'wood_bark_plant_materials',
      source_refs: `${sourceRef}OMI01504`,
    });
    appendCsvObject(root, bicEntities, {
      item_id: 'n1230:material_item:omi01505', name_ru: 'Деревянная пробка-затычка',
      family_key: 'wooden_stopper', primary_material: 'wood', category: 'wood_bark_plant_materials',
      source_refs: `${sourceRef}OMI01505`,
    });
    appendCsvObject(root, bicLedger, {
      archive_ref: `${sourceRef}OMI01505`, archive_name: 'Деревянная пробка-затычка',
      archive_action: 'include_d39', match_type: 'new', period: '1180–1260', dedup_result: 'distinct',
      dedup_reason: 'Reviewed semantic roots; no object identity collapsed after checking modifiers.',
    });
    appendCsvObject(root, bicLedger, {
      archive_ref: `${sourceRef}OMI01504`, archive_name: 'Деревянная пробка-затычка',
      archive_action: 'add_variant', match_type: 'variant', period: '1180–1260',
      game_base_ref: 'crafts-tools-processes/materials_registry/materials.csv#mt_bone',
      family_key: 'wooden_stopper', reason: 'Probe target before substitution.',
    });

    const craftsEntities = 'crafts-tools-processes/materials_registry/material_entities.csv';
    const craftsLedger = 'crafts-tools-processes/archive_inclusion_ledger.csv';
    appendCsvObject(root, craftsLedger, {
      archive_ref: `${sourceRef}OMI00990`, archive_name: 'Обгоревшая кость',
      archive_action: 'include_d39', match_type: 'new', record_type: 'new', disposition: 'new',
      period: '1180–1260', family_key: 'bone_waste', reason: 'Live collision probe.',
    });
    appendCsvObject(root, craftsLedger, {
      archive_ref: `${sourceRef}OMI01687`, archive_name: 'Песок для присыпки',
      archive_action: 'add_variant', match_type: 'variant', period: '1180–1260',
      game_base_ref: 'crafts-tools-processes/materials_registry/materials.csv#mt_quartz_sand',
      family_key: 'writing_sand', reason: 'Live material mismatch probe.',
    });
    updateLedger(root, 'OMI00990', 'record_type', 'new', craftsLedger);
    updateLedger(root, 'OMI00990', 'disposition', 'new', craftsLedger);
    appendCsvObject(root, craftsEntities, {
      item_id: 'n1230:material_item:omi00990', name_ru: 'Обгоревшая кость',
      family_key: 'bone_waste', primary_material: 'bone', category: 'bone_antler_horn_shell',
      source_refs: `${sourceRef}OMI00990`,
    });

    const correctTargetErrors = checkArchiveOwnership(root).errors.filter(error => error.includes('OMI01687'));
    assert.deepEqual(correctTargetErrors, [], correctTargetErrors.join('\n'));
    updateLedger(root, 'OMI01687', 'game_base_ref', 'crafts-tools-processes/materials_registry/materials.csv#mt_bone',
      craftsLedger);
    updateLedger(root, 'OMI01504', 'game_base_ref', 'crafts-tools-processes/materials_registry/materials.csv#mt_plinfa', bicLedger);

    const materials = fs.readFileSync(path.join(root, 'crafts-tools-processes/materials_registry/materials.csv'), 'utf8');
    const boneName = parseCsv(materials).find(row => row.mt_id === 'mt_bone')?.name_ru;
    assert.ok(boneName);
    assert.equal(normalizeSemanticRoot(boneName), normalizeSemanticRoot('кость'));
    const errors = checkArchiveOwnership(root).errors;
    assert.ok(errors.some(error => /semantic-root collision “пробка затычка”/.test(error)));
    assert.ok(errors.some(error => /semantic-root collision “кость”/.test(error)));
    assert.ok(errors.some(error => /OMI01687: variant target material mt_bone is not among archive material candidates/.test(error)), errors.filter(error => error.includes('OMI01687')).join('\n'));
    assert.ok(errors.some(error => /OMI01504: variant target material mt_plinfa is not among archive material candidates/.test(error)), errors.filter(error => error.includes('OMI01504')).join('\n'));
    const result = checkArchiveOwnership(root);
    assert.ok(result.error_counts.ICA_VARIANT_MATERIAL_MISMATCH >= 2);
    assert.ok(result.counts.mapped_archive_values > 0);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('registry covers catalog entity tables and detects an unregistered entity table', () => {
  assert.deepEqual(checkArchiveOwnershipRegistry(gameBase), []);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-ownership-registry-'));
  const root = path.join(parent, 'game-base-v1');
  try {
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(gameBase, 'catalog.json'), path.join(root, 'catalog.json'));
    fs.copyFileSync(path.join(gameBase, 'scripts/archive-ownership-registry.json'), path.join(root, 'scripts/archive-ownership-registry.json'));
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'scripts/archive-ownership-registry.json'), 'utf8'));
    for (const spec of registry.entity_tables) {
      const source = path.join(gameBase, spec.file);
      if (!fs.existsSync(source)) continue;
      const target = path.join(root, spec.file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    const unexpected = path.join(root, 'crafts-tools-processes/materials_registry/unregistered_materials.csv');
    fs.mkdirSync(path.dirname(unexpected), { recursive: true });
    fs.writeFileSync(unexpected, 'mt_id,name_ru\nmt_extra,Новый материал\n');
    assert.ok(checkArchiveOwnershipRegistry(root).some(error => /unregistered_materials\.csv: CSV with entity IDs/.test(error)));
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('unknown ID prefixes are detected, then indexed for target resolution and name collisions when registered', () => {
  const { parent, root } = gameBaseCopy();
  try {
    const file = 'crafts-tools-processes/materials_registry/probe_entities.csv';
    const table = path.join(root, file);
    fs.mkdirSync(path.dirname(table), { recursive: true });
    fs.writeFileSync(table, 'xq_id,name_ru,archive_ref\nxq_new,Серебро,OMI00001\n');
    assert.ok(checkArchiveOwnershipRegistry(root).some(error => error.includes(`${file}: CSV with entity IDs`)));

    const registryPath = path.join(root, 'scripts/archive-ownership-registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    registry.entity_tables.push({ file, key: 'xq_id', name: 'name_ru', owner: true, track_archive_ids: false });
    fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    assert.deepEqual(checkArchiveOwnershipRegistry(root), []);

    appendCsvObject(root, 'clothing-appearance/reports/archive_inclusion_ledger.csv', {
      archive_ref: 'OMI00002', archive_name: 'Проверка нового префикса', record_type: 'routed',
      target_group: 'crafts-tools-processes', target_ref: `${file}#xq_new`,
    });
    const errors = checkArchiveOwnership(root).errors;
    assert.ok(errors.some(error => /semantic-root collision “серебро”/.test(error)));
    assert.ok(!errors.some(error => error.includes('OMI00002') && /routed target_ref/.test(error)), errors.filter(error => error.includes('OMI00002')).join('\n'));
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('base-name probes keep material and item identities in the collision index', () => {
  const probes = [
    ['серебро', 'серебро'],
    ['сыромять', 'сыромять'],
    ['чернила', 'чернила'],
    ['серп', 'серп'],
    ['Сырная крошка', 'сырная крошка'],
    ['Деревянная мешалка', 'мешалка'],
    ['Малый бочонок', 'бочонок'],
    ['Берестяной короб', 'короб'],
  ];
  for (const [name, expected] of probes) assert.equal(normalizeSemanticRoot(name), expected, name);
});
