import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog';
import { createNeedsCheckMaterializationGuard,
  NEEDS_CHECK_MATERIALIZATION_BLOCKED } from '../src/runtime/needs-check-materialization-guard.js';

const sourceSnapshot = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/game-base-v1/needs_check_blockers.v2.json',
  import.meta.url), 'utf8'));

function calendarProfile(year = '1230') {
  return { profile_id:'test-calendar',version:'1',status:'approved',
    provenance:{source_id:'test',source_version:'1'},
    epoch:{game_timestamp:{whole_minutes:'0',subminute_numerator:'0',
      subminute_denominator:'1'},year,month:'1',day:'1'},
    calendar_system:'test',month_rules:{month_lengths:['30','30']},
    leap_rules:{cycle_years:'4',leap_year_indexes:['3'],leap_month:'2',
      leap_days:'1'},day_start_rule:{local_minute:'360'},
    local_offset_rule:{offset_minutes:'0'},daypart_rule:{ranges:[
      {id:'night',start_minute:'0',end_minute:'360'},
      {id:'day',start_minute:'360',end_minute:'1080'},
      {id:'evening',start_minute:'1080',end_minute:'1440'}]},
    season_rule:{ranges:[{id:'cold',start_day:'1',end_day:'30'},
      {id:'warm',start_day:'31',end_day:'61'}]},
    daylight_rule:{ranges:[{id:'dark',start_day:'1',end_day:'30'},
      {id:'light',start_day:'31',end_day:'61'}]} };
}

function guardFor({ snapshot = sourceSnapshot, region = 'region_novgorod_land',
  year = '1230', g4 = true, required = true } = {}) {
  const worldPin = {world_revision_id:'world-test',
    world_catalog_digest:'a'.repeat(64)};
  const pin = {schema:'rus.runtime_catalog_pin.v2',
    catalog_scope:'item_container_materialization_v2',
    catalog_revision_id:'catalog-test',catalog_digest:'b'.repeat(64),
    activation_event_id:'activation-test',import_id:'import-test',
    import_audit_digest:'c'.repeat(64),record_registry_digest:'d'.repeat(64),
    runtime_contract_digest:'e'.repeat(64),
    compatible_world_revision_id:worldPin.world_revision_id,
    compatible_world_catalog_digest:worldPin.world_catalog_digest,
    compatible_world_pin_manifest_digest:'f'.repeat(64)};
  const guard = createNeedsCheckMaterializationGuard({
    resolveRegion: async () => g4 ? region : null,
    calendarProfile:calendarProfile(year) });
  const catalogContext = { needs_check_blocker_snapshot:snapshot,
    needs_check_blocker_snapshot_required:required,
    world_pin:worldPin,pin };
  return (input) => guard({ ...input,
    catalogContext:input.catalogContext ?? catalogContext });
}

const committed = { world_identity:{world_revision_id:'world-test',
  world_catalog_digest:'a'.repeat(64)},position:{g4_id:'g4-test'},
  clock:{whole_minutes:'0',subminute_numerator:'0',subminute_denominator:'1'} };

test('guard blocks scoped anachronism and preserves queue ID only in typed details', async () => {
  const assertAllowed = guardFor();
  await assert.rejects(assertAllowed({partyId:'party-1',committedState:committed,
    candidate:{name:'железный капкан',path:'test.path'}}), (error) => {
    assert.equal(error.code, NEEDS_CHECK_MATERIALIZATION_BLOCKED);
    assert.equal(error.details.queue_id,
      'crafts-tools-processes/authoring/needs_check.csv#HNT0024');
    assert.deepEqual(error.details.queue_ids, [error.details.queue_id]);
    assert.equal(error.details.path, 'test.path');
    return true;
  });
});

test('guard can report a matching world-presence candidate for filtering without refusing the turn', async () => {
  const guard = guardFor();
  const result = await guard({ partyId:'party-1', committedState:committed,
    candidate:{name:'Колёсная прялка',path:'O1.request.query'},
    matchOnly:true });
  assert.deepEqual(result, [{ queue_id:
    'crafts-tools-processes/materials_registry/needs_check.csv#crafts_spinning_wheel',
  path:'O1.request.query', region:'region_novgorod_land', year:1230 }]);
  assert.deepEqual(await guard({ partyId:'party-1', committedState:committed,
    candidate:{name:'самопрялка',path:'O1.request.query'},matchOnly:true }), [],
  'D59 does not expand blocker names with synonyms');
});

test('NPC A1 source delta ignores blocker already present on source', async () => {
  await guardFor()({ partyId:'party-1', committedState:committed,
    candidate:{ name:'щепка', physical_description:'деревянная щепка',
      source_fact_delta:{ physical_description:
        'Колёсная прялка с отделённой щепкой', qualitative_facts:[],
        removed_physical_fact_refs:[], physical_form:'regular' },
      source_fact_delta_baseline:{ name:'Колёсная прялка',
        display_name:'Колёсная прялка', qualitative_facts:[] },
      path:'NPC.A1.result_descriptor' } });
});

test('NPC A1 source delta blocks a newly introduced forbidden concept', async () => {
  await assert.rejects(guardFor()({ partyId:'party-1',
    committedState:committed, candidate:{ name:'щепка',
      physical_description:'деревянная щепка', source_fact_delta:{
        physical_description:'рубаха стала Колёсной прялкой',
        qualitative_facts:[], removed_physical_fact_refs:[],
        physical_form:'regular' }, source_fact_delta_baseline:{
        name:'нижняя рубаха', display_name:'нижняя рубаха',
        qualitative_facts:[] }, path:'NPC.A1.result_descriptor' } }),
  (error) => error.code === NEEDS_CHECK_MATERIALIZATION_BLOCKED
    && error.details.queue_id ===
      'crafts-tools-processes/materials_registry/needs_check.csv#crafts_spinning_wheel'
    && error.details.path === 'NPC.A1.result_descriptor');
});

test('guard scopes known region and committed calendar year, while unknown region fails closed', async () => {
  const otherRegionSnapshot = NEEDS_CHECK_BLOCKER.createSnapshot(
    sourceSnapshot.entries, [...sourceSnapshot.regions,'region_other']);
  await guardFor({snapshot:otherRegionSnapshot,region:'region_other'})({
    partyId:'party-1',committedState:committed,candidate:{name:'железный капкан'} });
  await guardFor({year:'1251'})({partyId:'party-1',committedState:committed,
    candidate:{name:'железный капкан'} });
  await assert.rejects(guardFor({region:'region_unknown'})({partyId:'party-1',
    committedState:committed,candidate:{name:'железный капкан'} }),
    {code:NEEDS_CHECK_MATERIALIZATION_BLOCKED});
});

test('regional-presence doubt remains informational and missing region checks all names', async () => {
  const assertAllowed = guardFor({g4:false});
  await assertAllowed({partyId:'party-1',committedState:{...committed,
    position:{}},candidate:{name:'мельничное колесо водяное'}});
  await assert.rejects(assertAllowed({partyId:'party-1',
    committedState:{...committed,position:{}},
    candidate:{name:'железный капкан'}}),
    {code:NEEDS_CHECK_MATERIALIZATION_BLOCKED});
});

test('requires snapshot only when the exact activated binding requires it', async () => {
  await assert.rejects(guardFor({snapshot:null})({partyId:'party-1',
    committedState:committed,candidate:{name:'мельничное колесо водяное'}}),
    {code:'NEEDS_CHECK_BLOCKER_CATALOG_REQUIRED'});
  await guardFor({snapshot:null,required:false})({
    partyId:'party-1',committedState:committed,candidate:{name:'железный капкан'} });
});

test('uses the supplied turn catalog context without validating its pin contract digest again', async () => {
  const assertAllowed = guardFor();
  const turnContext = { schema:'rus.runtime_catalog_context.v2',
    needs_check_blocker_snapshot:sourceSnapshot,
    world_pin:{world_revision_id:'world-test',world_catalog_digest:'a'.repeat(64)},
    pin:{schema:'rus.runtime_catalog_pin.v2',
      catalog_revision_id:'catalog-test',import_id:'import-test',
      catalog_digest:'b'.repeat(64),runtime_contract_digest:'not-the-loader-digest'},
    needs_check_blocker_snapshot_required:true };
  await assert.rejects(assertAllowed({partyId:'party-1',committedState:committed,
    catalogContext:turnContext,candidate:{name:'железный капкан'}}),
    {code:NEEDS_CHECK_MATERIALIZATION_BLOCKED});
});
