import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_BASE = path.resolve(HERE, '..');
const CHECKER = path.join(HERE, 'check-needs-check.mjs');
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
const TABLES = [
  'items-household-personal/items/item_place_frequency.csv',
  'items-household-personal/items/item_context_relations.csv',
  'items-household-personal/items/item_place_trace_relations.csv',
  'occupations-activities/carried_inventories/carried_inventories.csv',
  'buildings-interiors-containers/interiors/scene_items.csv',
  'places-binding/presence/presence_rules.csv',
  'places-binding/presence/environment_presence_authoring.csv',
  'clothing-appearance/garments/costume_disposition.csv',
  'time-calendar-church/religion/church_practice.csv',
  'items-weapons-armour/items/weapon_source_crosswalk.csv'
];
const ARCHIVE_HEADER = 'archive_id,current_result,current_target_group,current_target_ref,reason_code,finding_ref,cluster_id,note,block_pattern_ru,block_pattern_lat,doubt_kind,block_region,block_period,block_exception';
const SMALL_HEADER = 'check_id,subject,status,block_pattern_ru,block_pattern_lat,doubt_kind,block_region,block_period,block_exception';

function csvRow(values) {
  return values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',') + '\n';
}

function cli(root, mode) {
  return spawnSync(process.execPath, [CHECKER, mode], {
    cwd: GAME_BASE,
    encoding: 'utf8',
    env: { ...process.env, NEEDS_CHECK_GAME_BASE: root }
  });
}

function fixtureBase(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'needs-check-e2e-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const queue of QUEUES) {
    const file = path.join(root, queue);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (queue.endsWith('.json')) fs.writeFileSync(file, '{"records":[]}\n');
    else fs.writeFileSync(file, `${queue.includes('/authoring/needs_check.csv') && !queue.startsWith('items-household-personal/') ? ARCHIVE_HEADER : SMALL_HEADER}\n`);
  }
  const registry = path.join(root, 'scripts/archive-ownership-registry.json');
  fs.mkdirSync(path.dirname(registry), { recursive: true });
  const entityFile = 'fixture_entities.csv';
  fs.writeFileSync(registry, JSON.stringify({ entity_tables: [{ file: entityFile, key: 'entity_id', name: 'name_ru', scope: 'buildings-interiors-containers' }], entity_json_files: [] }));
  fs.writeFileSync(path.join(root, entityFile), 'entity_id,name_ru\n');
  for (const domain of ['buildings-interiors-containers', 'crafts-tools-processes']) {
    const ledger = path.join(root, domain, 'archive_inclusion_ledger.csv');
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(ledger, 'archive_ref,archive_name\n');
  }
  for (const table of TABLES) {
    const file = path.join(root, table);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const header = table.endsWith('/scene_items.csv')
      ? 'sc_id,role,item_ref,resolves_to,name_ru,category,historical_confidence,generation_policy,frequency_class,weight,status\n'
      : 'fixture_id,name_ru,item_ref,item_refs,material_refs,source_item_id,master_item_ref,canonical_existing_item_ids,common_new_item_ids,contextual_new_item_ids,source_id,mapping,items_refs,item_or_category_ref,target_refs,subject_ref,companion_ref,reuse_refs,resolves_to,lat_synonyms,aliases_ru,alt_names_ru,name_ru_alt\n';
    fs.writeFileSync(file, header);
  }
  return root;
}

function queueRow(root, file, record) {
  const target = path.join(root, file);
  const text = fs.readFileSync(target, 'utf8');
  fs.writeFileSync(target, `${text}${csvRow(Object.values(record))}`);
}

function sceneItem(root, itemRef = 'ARC0021', name = 'Жилая клеть') {
  fs.appendFileSync(path.join(root, TABLES[4]), csvRow([
    'sc_scn001', 'required', itemRef, 'matcult_item', name, 'architecture', 'B', 'safe_with_constraints', 'ubiquitous', '8', 'candidate'
  ]));
}

function generatedRow(root, table, values) {
  const file = path.join(root, table);
  const headers = fs.readFileSync(file, 'utf8').split('\n')[0].split(',');
  fs.appendFileSync(file, csvRow(headers.map((header) => values[header] ?? '')));
}

function assertCode(result, code) {
  assert.equal(result.status, code, `${result.stdout}\n${result.stderr}`);
}

test('CLI blocks name and archive inclusion across domains, then passes after review', (t) => {
  const nameRoot = fixtureBase(t);
  sceneItem(nameRoot);
  queueRow(nameRoot, QUEUES[1], { check_id: 'fixture_ballast', subject: 'Незнакомый предмет', status: 'needs_check', block_pattern_ru: 'Незнакомый предмет', block_pattern_lat: '', doubt_kind: 'anachronism', block_region: 'region_novgorod_land', block_period: '1230-1250', block_exception: '[]' });
  assertCode(cli(nameRoot, '--write'), 0);
  queueRow(nameRoot, QUEUES[1], { check_id: 'fixture_scene_item', subject: 'Жилая клеть', status: 'needs_check', block_pattern_ru: 'Жилая клеть', block_pattern_lat: '', doubt_kind: 'anachronism', block_region: 'region_novgorod_land', block_period: '1230-1250', block_exception: '[]' });
  const blockedName = cli(nameRoot, '--check');
  assert.notEqual(blockedName.status, 0);
  assert.match(blockedName.stderr, /fixture_scene_item/u);
  const nameRows = fs.readFileSync(path.join(nameRoot, QUEUES[1]), 'utf8').split('\n');
  fs.writeFileSync(path.join(nameRoot, QUEUES[1]), `${nameRows[0]}\n${nameRows[1]}\n`);
  assertCode(cli(nameRoot, '--check'), 0);

  const idRoot = fixtureBase(t);
  fs.appendFileSync(path.join(idRoot, 'fixture_entities.csv'), csvRow(['OMI12345', 'Предмет из архива']));
  sceneItem(idRoot, 'OMI12345', 'Предмет из архива');
  queueRow(idRoot, QUEUES[1], { check_id: 'fixture_ballast', subject: 'Незнакомый предмет', status: 'needs_check', block_pattern_ru: 'Незнакомый предмет', block_pattern_lat: '', doubt_kind: 'anachronism', block_region: 'region_novgorod_land', block_period: '1230-1250', block_exception: '[]' });
  const ledger = path.join(idRoot, 'buildings-interiors-containers/archive_inclusion_ledger.csv');
  fs.writeFileSync(ledger, `archive_ref,archive_name\n${csvRow(['fixture:OMI12345', 'Предмет из архива'])}`);
  assertCode(cli(idRoot, '--write'), 0);
  queueRow(idRoot, QUEUES[0], { archive_id: 'OMI12345', current_result: 'routed', current_target_group: 'crafts-tools-processes', current_target_ref: '', reason_code: 'ICA_ROUTE_INVALID', finding_ref: '', cluster_id: '', note: 'fixture', block_pattern_ru: '', block_pattern_lat: '', doubt_kind: '', block_region: '', block_period: '', block_exception: '[]' });
  const blockedId = cli(idRoot, '--check');
  assert.notEqual(blockedId.status, 0);
  assert.match(blockedId.stderr, /OMI12345/u);
  assert.match(blockedId.stderr, /informational_id_reference_hits=1/u);
  const idQueue = path.join(idRoot, QUEUES[0]);
  fs.writeFileSync(idQueue, `${fs.readFileSync(idQueue, 'utf8').split('\n')[0]}\n`);
  assertCode(cli(idRoot, '--check'), 0);

  const crossDomainRoot = fixtureBase(t);
  generatedRow(crossDomainRoot, TABLES[5], { fixture_id: 'presence_peacock', name_ru: 'Павлин' });
  queueRow(crossDomainRoot, QUEUES[6], { check_id: 'fixture_peacock', subject: 'Павлин', status: 'needs_check', block_pattern_ru: 'Павлин', block_pattern_lat: '', doubt_kind: 'anachronism', block_region: 'region_novgorod_land', block_period: '1230-1250', block_exception: '[]' });
  const blockedAcrossDomains = cli(crossDomainRoot, '--write');
  assert.notEqual(blockedAcrossDomains.status, 0);
  assert.match(blockedAcrossDomains.stderr, /fixture_peacock/u);

  const nameArchiveRoot = fixtureBase(t);
  fs.appendFileSync(path.join(nameArchiveRoot, 'fixture_entities.csv'), csvRow(['CRF0061', 'Ножной гончарный круг']));
  const archiveLedger = path.join(nameArchiveRoot, 'buildings-interiors-containers/archive_inclusion_ledger.csv');
  fs.writeFileSync(archiveLedger, `archive_ref,archive_name\n${csvRow(['fixture:CRF0061', 'Ножной гончарный круг'])}`);
  queueRow(nameArchiveRoot, QUEUES[0], { archive_id: 'CRF0061', current_result: 'new/include', current_target_group: '', current_target_ref: '', reason_code: 'unresolved', finding_ref: '', cluster_id: '', note: 'Запросить датированную публикацию.', block_pattern_ru: 'Круг гончарный ножной', block_pattern_lat: '', doubt_kind: 'anachronism', block_region: 'region_novgorod_land', block_period: '1230-1250', block_exception: '[]' });
  const blockedNameArchiveId = cli(nameArchiveRoot, '--write');
  assert.notEqual(blockedNameArchiveId.status, 0);
  assert.match(blockedNameArchiveId.stderr, /CRF0061/u);
});
