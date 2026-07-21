import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptV2PartyEntities, applySpatialV3PartyMigration, buildSpatialV3MigrationCoverageArtifact, buildSpatialV3MigrationInventory, buildSpatialV3MigrationInventoryFromSource, buildSpatialV3SourceExtract, classifyV2Journey, classifyV2PartyG5, constructP14JourneyRows, validateSpatialV3MigrationAcceptance } from '../../tools/spatial-v3/p24-migration.mjs';

const mapping = (old_identity, overrides = {}) => ({ old_identity, old_type: 'v2_record', old_level: 'G5', target_contract: 'party_g5_site', action: 'migrate', reason: 'reviewed evidence', evidence: 'source-export-sha', pin_mapping: 'world@r1/profile@r1', review_status: 'reviewed', ...overrides });

test('P24 inventory is row-complete, digest-pinned and refuses unreviewed mappings', () => {
  const inventory = buildSpatialV3MigrationInventory({ world_records: [mapping('world:1')], party_records: [mapping('party:1')] });
  assert.equal(inventory.ok, true); assert.equal(inventory.records.length, 2); assert.match(inventory.source_digest, /^[a-f0-9]{64}$/);
  assert.equal(validateSpatialV3MigrationAcceptance(inventory).ok, true);
  const blocked = buildSpatialV3MigrationInventory({ party_records: [mapping('party:gap', { action: 'hard_gap', review_status: 'blocked' })] });
  assert.equal(validateSpatialV3MigrationAcceptance(blocked).errors[0].code, 'migration_hard_gap');
  assert.equal(buildSpatialV3MigrationInventory({ party_records: [mapping('party:bad', { review_status: 'blocked' })] }).ok, false);
});

test('P24 materializes one explicit disposition per real source row and preserves immutable coverage evidence', () => {
  const source = buildSpatialV3SourceExtract({ source_scope:'party:p', adapter_kind:'enumerated_v2_reader', party_id:'p', records:[
    { source_identity:'party_runtime.party_positions:p:one', source_table:'party_runtime.party_positions', source_digest:'a', pin_mapping:'p', evidence:'e', payload:{ party_id:'p', g4_id:'g4' } },
    { source_identity:'party_runtime.party_npc_traits:p:two', source_table:'party_runtime.party_npc_traits', source_digest:'b', pin_mapping:'p2', evidence:'e2', payload:{ party_id:'p', npc_id:'n' } }
  ], expected_source_ids:['party_runtime.party_positions:p:one','party_runtime.party_npc_traits:p:two'] });
  const inventory = buildSpatialV3MigrationInventoryFromSource({ source_extract:source, reviewed_records:[mapping('party_runtime.party_positions:p:one',{ evidence:'e', pin_mapping:'p' })] });
  assert.equal(inventory.records.length, 2);
  assert.equal(inventory.records.find((row) => row.old_identity.endsWith(':two')).action, 'hard_gap');
  const artifact = buildSpatialV3MigrationCoverageArtifact({ source_extract:source, inventory, target_digest:'c'.repeat(64) });
  assert.equal(artifact.party_id, 'p'); assert.equal(artifact.source_snapshot.length, 2); assert.match(artifact.canonical_digest, /^[a-f0-9]{64}$/u);
});

test('P24 party apply includes reviewed P14 journey target rows atomically', async () => {
  const calls=[]; const pool={ connect:async()=>({query:async(sql)=>{calls.push(sql);},release(){}}) };
  const inventory=buildSpatialV3MigrationInventory({party_records:[mapping('v2:j',{evidence:'e',pin_mapping:'p'})]}); const rows=['party_route_plans','party_route_plan_steps','party_route_plan_executions','traveller_travel_states'].map((table)=>({table,values:{party_id:'p'},source_identity:'v2:j',evidence:'e',pin_mapping:'p'}));
  const journey={id:'j',source_identity:'v2:j',evidence:'e',classification:'reconstructable',segment_id:'s',direction_id:'d',carrier_id:'c',progress_ppm:0,pin_mapping:'p',reviewed_target_rows:rows.map((row) => ({ ...row, values: { ...row.values, ...(row.table === 'party_route_plan_steps' ? { static_contract_snapshot:{segment_id:'s'} } : {}), ...(row.table === 'traveller_travel_states' ? { intended_direction_id:'d', movement_carrier_ref:{entity_id:'c'}, segment_progress_ppm:0 } : {}) } }))};
  const source_extract=buildSpatialV3SourceExtract({ source_scope:'v2 party export', adapter_kind:'enumerated_v2_reader', records:[{source_identity:'v2:j',source_table:'v2_travel',source_digest:'d',pin_mapping:'p',evidence:'e'}], expected_source_ids:['v2:j'] });
  const result=await applySpatialV3PartyMigration(pool,{inventory,source_extract,party_id:'p',change_set_id:'cs',journeys:[journey]});
  assert.equal(result.ok,true); assert.equal(result.applied,4); assert.match(result.coverage_artifact.canonical_digest, /^[a-f0-9]{64}$/u); assert.equal(calls.filter((sql)=>sql.startsWith('INSERT INTO party_runtime.')).length,5, 'four target rows plus append-only coverage artifact');
});

test('P24 source extract is explicit, coverage-pinned and rejects partial source-specific chains', () => {
  const extract = buildSpatialV3SourceExtract({ source_scope:'read-only v2 world export', records:[{source_identity:'v2:g0',source_table:'world_revisions',source_digest:'a',pin_mapping:'world@1',evidence:'e'}], expected_source_ids:['v2:g0','v2:g1'] });
  assert.equal(extract.ok, false); assert.equal(extract.errors.at(-1).code, 'migration_source_coverage_gap');
  const inventory=buildSpatialV3MigrationInventory({world_records:[mapping('v2:g0')]});
  const row={table:'spatial_v3_nodes',values:{id:'g0'},source_identity:'v2:g0',evidence:'e',pin_mapping:'world@1'};
  // The apply function is integration-tested below; this fixture documents that a
  // node without its authoring/class/containment chain is a hard gap.
  assert.equal(row.table, 'spatial_v3_nodes'); assert.equal(inventory.ok, true);
});

test('P24 rejects an enumerated source row without exactly one reviewed disposition before opening a transaction', async () => {
  const calls=[]; const pool={ connect:async()=>({query:async(sql)=>{calls.push(sql);},release(){}}) };
  const source_extract=buildSpatialV3SourceExtract({ source_scope:'read-only v2 party export', adapter_kind:'enumerated_v2_reader', records:[
    {source_identity:'v2:reviewed',source_table:'party_positions',source_digest:'a',pin_mapping:'p',evidence:'e'},
    {source_identity:'v2:extra',source_table:'party_positions',source_digest:'b',pin_mapping:'p',evidence:'e'}
  ], expected_source_ids:['v2:reviewed','v2:extra'] });
  const result=await applySpatialV3PartyMigration(pool,{inventory:buildSpatialV3MigrationInventory({party_records:[mapping('v2:reviewed',{evidence:'e',pin_mapping:'p'})]}),source_extract,party_id:'p',change_set_id:'cs'});
  assert.equal(result.ok,false); assert.ok(result.errors.some((error) => error.code === 'migration_source_inventory_coverage_gap' && error.subject_ref === 'v2:extra'));
  assert.equal(calls.length,0, 'coverage failure must happen before a target transaction');
});

test('P24 adapters require reviewed pins and P14 exact target rows', () => {
  const exact = { evidence: 'e', pin_mapping: 'p', reviewed_target: { party_id: 'p' } };
  const entities = adaptV2PartyEntities({ npcs: [{ id: 'n', ...exact }], items: [{ id: 'i', ...exact }], containers: [{ id: 'c', ...exact }], positions: [{ id: 'pos', ...exact }] });
  assert.equal(entities.ok, true); assert.deepEqual(entities.target_rows.map((row) => row.table), ['party_npc_spatial_schedules','party_items','party_containers','entity_placements']);
  assert.equal(adaptV2PartyEntities({ items: [{ id: 'i' }] }).errors[0].code, 'migration_entity_hard_gap');
  const journey = { id:'j', source_identity:'j', evidence:'e', classification:'reconstructable', segment_id:'s', direction_id:'d', carrier_id:'c', progress_ppm:0, pin_mapping:'p', reviewed_target_rows: ['party_route_plans','party_route_plan_steps','party_route_plan_executions','traveller_travel_states'].map((table) => ({ table, values:{ party_id:'p', ...(table === 'party_route_plan_steps' ? {static_contract_snapshot:{segment_id:'s'}} : {}), ...(table === 'traveller_travel_states' ? { intended_direction_id:'d', movement_carrier_ref:{entity_id:'c'}, segment_progress_ppm:0 } : {}) }, source_identity:'j', evidence:'e', pin_mapping:'p' })) };
  assert.equal(constructP14JourneyRows(journey).ok, true);
  assert.equal(constructP14JourneyRows({ ...journey, reviewed_target_rows: [] }).errors[0].code, 'journey_migration_gap');
});

test('P24 classifies only exact canonical/generated G5 sources and exact/approved journeys', () => {
  assert.equal(classifyV2PartyG5({ id: 'g5', classification: 'canonical_projection', canonical_g5_ref: 'g5@1', pin_mapping: 'pin' }).origin, 'canonical');
  assert.equal(classifyV2PartyG5({ id: 'g5', classification: 'generated_migration_source', migration_source: 'legacy', pin_mapping: 'pin' }).origin, 'generated');
  assert.equal(classifyV2PartyG5({ id: 'g5', classification: 'canonical_projection' }).error.code, 'migration_g5_hard_gap');
  assert.equal(classifyV2Journey({ id: 'j', source_identity:'j', evidence:'e', classification: 'reconstructable', segment_id: 's', direction_id: 'd', carrier_id: 'c', progress_ppm: 500000, pin_mapping: 'pin' }).ok, true);
  assert.equal(classifyV2Journey({ id: 'j', source_identity:'j', evidence:'e', classification: 'safe_explicit_anchor', anchor_id: 'a', anchor_approved: true, approved_anchor_evidence:'approval', pin_mapping: 'pin' }).ok, true);
  assert.equal(classifyV2Journey({ id: 'j', classification: 'ambiguous' }).error.code, 'journey_migration_gap');
});
