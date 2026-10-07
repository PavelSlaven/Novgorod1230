import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRuntimeCatalogWorldBaseReader } from '@rus/runtime-catalog';
import * as selectionOwner from '@rus/runtime-catalog/approved-record-snapshots';
import { createRuntimeCatalogCoordinator } from
  '../../apps/game-server/src/runtime/runtime-catalog.js';
import { bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch } from './presence-rules-production-e2e-fixture.js';

const MODE = 'deterministic_from_approved_bindings';
const REPORT_DIR = process.env.NOVGOROD_CR178_REPORT_DIR;
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

function carriers(value) {
  if (value == null || typeof value !== 'object') return [];
  return [...(Object.hasOwn(value, 'material_category_id') ? [value] : []),
    ...Object.values(value).flatMap(carriers)];
}

function selected(state, label) {
  const found = carriers(state);
  assert.equal(found.length, 1, `${label}: persisted state must carry one material selection`);
  const record = found[0];
  return { record, material_category_id: record.material_category_id,
    mode: record.mode ?? record.material_selection?.mode ?? record.variant_selection?.mode };
}

function noFullMaterialList(value, materials, label) {
  if (value == null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!['approved_material_category_ids', 'candidate_material_category_ids'].includes(key),
      `${label}: approved alternatives belong to the catalog, not the instance`);
    if (materials.length > 1 && Array.isArray(child)) {
      assert.notDeepEqual([...child].sort(), materials,
        `${label}: do not persist the complete material alternatives`);
    }
    noFullMaterialList(child, materials, label);
  }
}

async function readStart(env, opening, entry) {
  const transfer = await json(resolve(env.rootDir, entry.transfer.path));
  const start = await json(resolve(env.rootDir, entry.start.path));
  const pin = (await env.partyPool.query(
    `SELECT catalog_revision_id, runtime_contract_digest, catalog_digest,
            compatible_world_revision_id FROM party_runtime.party_catalog_pins
     WHERE party_id=$1 AND catalog_scope='item_container_materialization_v2'`,
    [opening.party_id])).rows[0];
  assert.ok(pin, 'public start must persist its real catalog pin');
  const date = start.initial_environment_inputs.calendar_date;
  const effectiveDate = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  // Read the actual party pin through the production coordinator; no snapshot injection.
  const context = await createRuntimeCatalogCoordinator({
    worldBaseReader: createRuntimeCatalogWorldBaseReader(env.worldPool.query.bind(env.worldPool)),
    partyPool: env.partyPool, itemPin: pin,
  }).loadPartyContext({ partyId: opening.party_id, regionId: 'region_novgorod_land', effectiveDate });
  const bindings = context.applicable_catalog.records_by_table.item_template_category_bindings;
  const materialBindings = bindings.filter((row) =>
    row.status === 'approved' && row.binding_kind === 'material');
  assert.equal(materialBindings.length, 174, 'fixture must read the approved material facet');
  assert.equal(new Set(materialBindings.map((row) => row.item_template_id)).size, 102);
  const items = (await env.partyPool.query(
    `SELECT i.template_id, i.state, p.holder_character_id, p.holder_npc_id,
            p.physical_position FROM party_runtime.party_items i
     JOIN party_runtime.party_item_placements p USING (party_id,item_id)
     WHERE i.party_id=$1 AND i.state ? 'source_equipment_candidate_ref'
     ORDER BY i.item_id`, [opening.party_id])).rows;
  const expectedClothes = transfer.clothing_transfer.equipment_entries
    .map((row) => row.item_template_ref).sort();
  assert.deepEqual(items.filter((item) => item.holder_character_id != null)
    .map((item) => item.template_id).sort(), expectedClothes,
  'public start must create all player clothing through Stage 16');
  assert.ok(items.length > 0);
  return { scenario_id: entry.scenario_id, pin, bindings, items };
}

function assertMaterials(run) {
  for (const item of run.items) {
    const label = `${run.scenario_id}/${item.template_id}`;
    // Independent oracle over the real approved rows, not the function under test.
    const materials = [...new Set(run.bindings.filter((row) => row.status === 'approved'
      && row.binding_kind === 'material' && row.item_template_id === item.template_id)
      .map((row) => row.category_id))].sort();
    const material = selected(item.state, label);
    if (materials.length) {
      assert.equal(material.material_category_id, materials[0], `${label}: first sorted approved material`);
      assert.equal(material.mode, MODE, `${label}: explicit selection method`);
      assert.equal(typeof selectionOwner.selectApprovedItemMaterial, 'function');
      assert.deepEqual(selectionOwner.selectApprovedItemMaterial({
        item_template_id: item.template_id, bindings: run.bindings,
      }), { material_category_id: material.material_category_id, mode: material.mode });
    } else {
      assert.equal(material.material_category_id, null, `${label}: explicit unknown`);
      assert.equal(material.mode, 'unknown');
      assert.equal(material.record.data_gap?.code, 'ITEM_MATERIAL_BINDING_MISSING');
    }
    noFullMaterialList(item.state, materials, label);
  }
}

// Seven public scenarios; one additional real start proves repeat selection.
test('D102: real v17 Stage 16 persists approved material for player and NPC equipment',
  { timeout: 1_800_000 }, async (t) => {
    const report = { schema: 'cr178-p0-d102-stage16/v1', cases: [], timings: [] };
    const runs = [];
    let runtime;
    try {
      let begin = performance.now();
      const env = await bootstrapV17PresenceE2e(t);
      report.bootstrap_ms = Math.round(performance.now() - begin);
      console.log(`CR178_D102 bootstrap_ms=${report.bootstrap_ms}`);
      t.after(installPresenceProductionE2eFetch());
      ({ runtime } = await createPresenceProductionRoot(env));
      t.after(() => runtime.close());
      const manifest = await json(resolve(env.rootDir,
        'data/world-catalogs/novgorod/live-world-runtime-v17/target-starts-manifest.v1.json'));
      assert.equal(manifest.starts.length, 7);
      // Collect every public start before material assertions, so RED does not hide cases.
      for (const [index, entry] of [...manifest.starts, manifest.starts[0]].entries()) {
        begin = performance.now();
        const opening = await runtime.startNewGame({ scenario_id: entry.scenario_id,
          request_id: `cr178-d102-${index}` });
        const start_ms = Math.round(performance.now() - begin);
        report.timings.push({ scenario_id: entry.scenario_id, start_ms });
        console.log(`CR178_D102 scenario=${entry.scenario_id} start_ms=${start_ms}`);
        assert.equal(opening.screen.schema, 'first_game_screen');
        const run = await readStart(env, opening, entry);
        runs.push(run);
        report.cases.push({ scenario_id: run.scenario_id, pin: run.pin,
          items: run.items.map((item) => ({ template_id: item.template_id,
            actor_kind: item.holder_npc_id != null ? 'npc' : 'player',
            physical_position: item.physical_position,
            material_selections: carriers(item.state) })) });
      }
      await t.test('all seven scenarios exercise real NPC equipment as well as player clothing', () => {
        assert.ok(runs.slice(0, 7).some((run) => run.items.some((item) => item.holder_npc_id != null)),
          'fixture must exercise NPC equipment, not merely player clothing');
      });
      for (const run of runs.slice(0, 7)) {
        await t.test(`${run.scenario_id}: approved material and method in persisted state`, () => {
          assertMaterials(run);
        });
      }
      await t.test('repeat public start preserves the material selected for each shared template', () => {
        const first = runs[0];
        const repeat = runs[7];
        assertMaterials(repeat);
        const repeated = new Map(repeat.items.map((item) =>
          [item.template_id, selected(item.state, `repeat/${item.template_id}`)]));
        for (const item of first.items) {
          if (!repeated.has(item.template_id)) continue;
          const a = selected(item.state, `first/${item.template_id}`);
          const b = repeated.get(item.template_id);
          assert.equal(a.material_category_id, b.material_category_id);
          assert.equal(a.mode, b.mode);
        }
      });
    } finally {
      if (REPORT_DIR) {
        try {
          await mkdir(REPORT_DIR, { recursive: true });
          await writeFile(resolve(REPORT_DIR, 'd102-stage16-material-readback.json'),
            `${JSON.stringify(report, null, 2)}\n`);
        } catch (error) {
          console.error('CR178_D102 optional report write failed:', error);
        }
      }
    }
  });
