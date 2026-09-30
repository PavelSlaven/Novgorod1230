import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
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
const ARCHIVE_HEADER = 'archive_id,current_result,current_target_group,current_target_ref,reason_code,finding_ref,cluster_id,note,block_pattern_ru,block_pattern_lat,block_scope,block_exception';
const SMALL_HEADER = 'check_id,subject,status,block_pattern_ru,block_pattern_lat,block_scope,block_exception';

function csvRow(values) {
  return values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',') + '\n';
}

test('catalog gate reports archive IDs in item-bearing references as informational only', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'needs-check-id-reference-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const queue of QUEUES) {
    const file = path.join(root, queue);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (queue.endsWith('.json')) fs.writeFileSync(file, '{"records":[]}\n');
    else fs.writeFileSync(file, `${queue.startsWith('buildings-interiors-containers/authoring/') ? ARCHIVE_HEADER : SMALL_HEADER}\n`);
  }
  const registry = path.join(root, 'scripts/archive-ownership-registry.json');
  fs.mkdirSync(path.dirname(registry), { recursive: true });
  fs.writeFileSync(registry, JSON.stringify({ entity_tables: [], entity_json_files: [] }));
  for (const table of TABLES) {
    const file = path.join(root, table);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const header = table.endsWith('/scene_items.csv')
      ? 'sc_id,role,item_ref,resolves_to,name_ru,category,historical_confidence,generation_policy,frequency_class,weight,status\n'
      : 'fixture_id,name_ru,item_ref,item_refs,material_refs,source_item_id,master_item_ref,canonical_existing_item_ids,common_new_item_ids,contextual_new_item_ids,source_id,mapping,items_refs,item_or_category_ref,target_refs,subject_ref,companion_ref,reuse_refs,resolves_to,lat_synonyms,aliases_ru,alt_names_ru,name_ru_alt\n';
    fs.writeFileSync(file, header);
  }
  const scene = path.join(root, TABLES[4]);
  fs.appendFileSync(scene, csvRow(['sc_scn001', 'required', 'OMI12346', 'matcult_item', 'Предмет по ссылке', 'architecture', 'B', 'safe_with_constraints', 'ubiquitous', '8', 'candidate']));
  const ledger = path.join(root, 'buildings-interiors-containers/archive_inclusion_ledger.csv');
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, `archive_ref,archive_name\n${csvRow(['fixture:OMI12346', 'Предмет по ссылке'])}`);
  const craftsLedger = path.join(root, 'crafts-tools-processes/archive_inclusion_ledger.csv');
  fs.mkdirSync(path.dirname(craftsLedger), { recursive: true });
  fs.writeFileSync(craftsLedger, 'archive_ref,archive_name\n');
  const queue = path.join(root, QUEUES[0]);
  fs.appendFileSync(queue, csvRow(['OMI12346', 'routed', 'crafts-tools-processes', '', 'ICA_ROUTE_INVALID', '', '', 'fixture', '', '', 'global', '[]']));

  const oldBase = process.env.NEEDS_CHECK_GAME_BASE;
  process.env.NEEDS_CHECK_GAME_BASE = root;
  let checker;
  try {
    checker = await import('./check-needs-check.mjs?fixture=id-reference');
  } finally {
    if (oldBase === undefined) delete process.env.NEEDS_CHECK_GAME_BASE;
    else process.env.NEEDS_CHECK_GAME_BASE = oldBase;
  }
  const metrics = checker.validateCatalog(checker.compileSnapshot());
  assert.equal(metrics.candidate_count, 1);
  assert.equal(metrics.informational_id_reference_hits, 1);
  assert.equal(metrics.template_hits[0].hits, 0);
});
