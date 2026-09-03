import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applyOrdinaryMaterializationProjection,
  bindOrdinaryPlanToCombinedInput, ordinaryPhysicalKeys } from
  '../src/infrastructure/postgres/lower-dvina-trace-ordinary-p16.js';
import { loadLowerDvinaTraceO2bProfile } from
  '../src/internal/lower-dvina-trace-o2b-profile.js';
import { createLowerDvinaTraceO2bContainerResolver } from
  '../src/runtime/lower-dvina-trace-o2b-container-resolver.js';
import { validLowerDvinaTraceO2bPhysicalAttestation } from
  '../src/runtime/lower-dvina-trace-o2b-physical-attestation.js';
import { activeProfile, committedFixture, containerRef, modelPlan,
  operationIdentity, partyId, seedRequest } from
  './lower-dvina-trace-o2b-production-fixture.js';

const artifactRoot = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m8-content';

test('authored revision 20 O2b profile is SHA-pinned, active and drift fails startup', async () => {
  const loaded = await loadLowerDvinaTraceO2bProfile();
  assert.equal(loaded.profile.container_bindings.length,1);
  assert.equal(loaded.profile.scenario_definition_revision,20);
  assert.equal(typeof createLowerDvinaTraceO2bContainerResolver({partyId,
    inputDigest:'active',loadedProfile:loaded,
    loadCommittedContainer:async () => committedFixture(),
    ordinaryMaterializationModel:async () => modelPlan(seedRequest())}),
  'function');
  const root = await mkdtemp(join(tmpdir(),'novgorod-o2b-profile-'));
  try {
    const target = join(root,artifactRoot);
    await mkdir(target,{recursive:true});
    for (const file of ['ordinary-container-contents-profile.json',
      'initial-ordinary-container.json','manifest.json']) {
      await copyFile(join(process.cwd(),artifactRoot,file),join(target,file));
    }
    const profilePath = join(target,'ordinary-container-contents-profile.json');
    const profile = JSON.parse(await readFile(profilePath,'utf8'));
    profile.revision = 2;
    await writeFile(profilePath,JSON.stringify(profile));
    await assert.rejects(loadLowerDvinaTraceO2bProfile({rootDir:root}),
      {code:'TRACE_O2B_PROFILE_INVALID'});
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('active O2b attestation follows current valid actor placement', async () => {
  const loaded = await loadLowerDvinaTraceO2bProfile();
  const actor = 'pc:actor';
  const anchor = 'anchor:current';
  const container = { actor_id:actor,actor_position_ref:anchor,
    placement:{ anchor_id:null, container_id:null,
    holder_npc_id:null, holder_character_id:actor,
    physical_position:'hands', equipment_slot_category_id:null },
  ownership:{ owner_character_id:actor, controller_character_id:actor,
    owner_npc_id:null, controller_npc_id:null, owner_party:false,
    claim_state:loaded.initial_container.first_entry_placement.claim_state },
  state:{ owner_character_id:actor, controller_character_id:actor,
    first_entry_position_ref:'position:entry', semantic_category:
      loaded.initial_container.container_state.semantic_category } };
  assert.equal(validLowerDvinaTraceO2bPhysicalAttestation(container,loaded),true);
  container.placement = {anchor_id:anchor,container_id:null,holder_npc_id:null,
    holder_character_id:null,physical_position:null,
    equipment_slot_category_id:null};
  assert.equal(validLowerDvinaTraceO2bPhysicalAttestation(container,loaded),true);
  container.placement.anchor_id = 'anchor:remote';
  assert.equal(validLowerDvinaTraceO2bPhysicalAttestation(container,loaded),false);
});

test('active O2b pins drift before model and Stage A is phrase-independent', async () => {
  let driftCalls = 0;
  const drifted = committedFixture();
  drifted.container.state.ordinary_contents_context.context_digest = 'b'.repeat(64);
  const driftResolver = resolver({load:async () => drifted,
    model:async () => { driftCalls += 1; }});
  const denied = await driftResolver(call());
  assert.equal(denied.pass,false);
  assert.equal(driftCalls,0);

  const requests = [];
  for (const phraseDigest of ['player-phrase-a','player-phrase-b']) {
    const current = resolver({inputDigest:phraseDigest,
      model:async (request) => { requests.push(JSON.stringify(request));
        return modelPlan(request); }});
    assert.equal((await current(call())).pass,true);
  }
  assert.equal(requests.length,2);
  assert.equal(requests[0],requests[1]);
  assert.equal(JSON.parse(requests[0]).candidate_query,null);
  assert.doesNotMatch(requests[0],/player-phrase|desired|narration|root_action/u);
});

test('generic enabled fixture seals positive and zero outcomes without reroll',
  async () => {
    let positiveCalls = 0;
    const positiveResolver = resolver({model:async (request) => {
      positiveCalls += 1;
      return modelPlan(request);
    }});
    const positive = await positiveResolver(call());
    assert.equal(positive.pass,true);
    assert.equal(positiveCalls,1);
    assert.equal(positive.materialized_items.length,1);
    assert.equal(positive.materialized_items[0].disclosure,'concealed');
    assert.equal(positive.ordinary_materialization_atomic_write_plan.items.length,1);
    const combined = bindOrdinaryPlanToCombinedInput({
      lock_context:{physical_keys:['legacy:key']}
    }, positive.ordinary_materialization_atomic_write_plan, partyId);
    assert.equal(combined.ordinary_materialization_atomic_write_plan.party_id,
      partyId);
    assert.equal(combined.lock_context.physical_keys[0],'legacy:key');
    assert.equal(combined.lock_context.physical_keys.some((key) =>
      key.includes('party_ordinary_materialization_commits')),true);
    let replayCalls = 0;
    const replay = resolver({load:async () => committedFixture({
      ordinary_aggregate:positive.ordinary_materialization_atomic_write_plan
        .next_aggregate}),model:async () => { replayCalls += 1; }});
    const replayed = await replay(call());
    assert.deepEqual(replayed.materialized_items,[]);
    assert.equal(replayed.ordinary_materialization_atomic_write_plan,null);
    assert.equal(replayCalls,0);

    let zeroCalls = 0;
    const zero = await resolver({model:async (request) => {
      zeroCalls += 1;
      return modelPlan(request,[]);
    }})(call());
    assert.equal(zero.pass,true);
    assert.equal(zeroCalls,1);
    assert.equal(zero.ordinary_materialization_atomic_write_plan.items.length,0);
    const zeroReplay = resolver({load:async () => committedFixture({
      ordinary_aggregate:zero.ordinary_materialization_atomic_write_plan
        .next_aggregate}),model:async () => { throw Error('must not reroll'); }});
    assert.equal((await zeroReplay(call()))
      .ordinary_materialization_atomic_write_plan,null);
  });

test('P16 projection hides precommit child and publishes only safe committed view',
  async () => {
    const result = await resolver({model:async (request) => modelPlan(request)})(call());
    const child = result.materialized_items[0];
    const next = {containers:[{container_id:containerRef,state_version:3,
      state:{}}],items:[{item_id:containerRef,state_version:3,state:{},
      visible:true}]};
    const before = {visible_objects:[]};
    assert.equal(before.visible_objects.some((entry) =>
      entry.entity_ref?.entity_id === child.item_id),false);
    const after = applyOrdinaryMaterializationProjection({next,
      visibleContext:before,
      ordinaryPlan:result.ordinary_materialization_atomic_write_plan});
    const persisted = next.items.find(({item_id}) => item_id === child.item_id);
    assert.equal(persisted.visible,true);
    assert.equal(persisted.disclosure,undefined);
    assert.deepEqual(persisted.placement,{container_id:containerRef});
    assert.equal(next.containers[0].state_version,4);
    assert.equal(next.items[0].state_version,4);
    assert.equal(after.visible_objects.length,1);
    assert.equal(after.visible_objects[0].entity_ref.entity_id,child.item_id);
    assert.equal(Object.hasOwn(after.visible_objects[0],'item_proposal'),false);
    const repeated = applyOrdinaryMaterializationProjection({next,
      visibleContext:after,
      ordinaryPlan:result.ordinary_materialization_atomic_write_plan});
    assert.equal(repeated.visible_objects.length,1);
  });

test('O2b physical locks extend but do not alter legacy O1 keys', () => {
  const legacy = ordinaryPhysicalKeys({party_id:'party',scope_ref:{
    entity_kind:'g6',entity_id:'scope'},request_identity:'negative',item:null});
  assert.deepEqual(legacy.slice(-2),[
    'party_runtime.party_ordinary_materialization_items:party:negative',
    'party_runtime.party_ordinary_materialization_item_basis_refs:party:negative'
  ]);
  assert.equal(legacy.some((key) => key.includes('party_runtime.party_items')),
    false);
});

function resolver({load = async () => committedFixture(),model,
  inputDigest = 'input-o2b'} = {}) {
  return createLowerDvinaTraceO2bContainerResolver({partyId,inputDigest,
    loadedProfile:activeProfile(),loadCommittedContainer:load,
    ordinaryMaterializationModel:model});
}
function call() { return {stage_a_request:seedRequest(),
  operation_identity:operationIdentity()}; }
