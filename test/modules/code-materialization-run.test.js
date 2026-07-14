import assert from 'node:assert/strict';
import test from 'node:test';
import { runStage13G5MaterializationBlock } from '@rus/new-game/stages/stage-13/compat';
import { runStage15NpcPlacementBlock } from '@rus/new-game/stages/stage-15/compat';
import { runStage16ItemPlacementBlock } from '@rus/new-game/stages/stage-16/compat';
import { makeStage13Input, makeStage15Audit, makeStage15Input, makeStage16Audit, makeStage16Input } from '../fixtures/stage13-16-fixtures.mjs';
import { canonicalDigest } from '@rus/materialization';

test('Stages 13, 15 and 16 use the built-in code materializers in one deterministic run', async () => {
  const stage13 = await runStage13G5MaterializationBlock({ input: makeStage13Input() });
  assert.equal(stage13.pass, true);
  assert.equal(stage13.output.materialization_run.materializer_version, 'code_materializer_v2');
  assert.equal(stage13.output.g5_edges.length, 2);

  const stage15Input = makeStage15Input();
  stage15Input.g5_scene_graph = stage13.output;
  const stage15 = await runStage15NpcPlacementBlock({ input: stage15Input, audit: async () => makeStage15Audit() });
  assert.equal(stage15.pass, true);
  assert.equal(stage15.draft.placement_status, 'empty_allowed');

  const stage16Input = makeStage16Input();
  stage16Input.g5_scene_graph = stage13.output;
  stage16Input.initial_npc_placement = stage15.draft;
  const stage16 = await runStage16ItemPlacementBlock({ input: stage16Input, audit: async () => makeStage16Audit() });
  assert.equal(stage16.pass, true);
  assert.equal(stage16.draft.placement_status, 'empty_allowed');
});

test('Stage 13 rejects a materialized G5 graph disconnected from the start anchor', async () => {
  const input = makeStage13Input();
  input.allowed_g5_template_set.allowed_g5_templates[0].layout_edges = [];
  const set = input.allowed_g5_template_set;
  set.catalog_digest = canonicalDigest({ version:set.version, schema:set.schema, selected_g4_type_id:set.selected_g4_type_id, world_revision_id:set.world_revision_id, allowed_g5_templates:set.allowed_g5_templates });
  await assert.rejects(() => runStage13G5MaterializationBlock({ input }), (error) => error.code === 'G5_GRAPH_DISCONNECTED');
});

test('Stage 13 rejects a mixed-scope approved snapshot before RNG selection', async () => {
  const input = makeStage13Input();
  const foreign = structuredClone(input.allowed_g5_template_set.allowed_g5_templates[0]);
  foreign.template_id = 'tpl-foreign';
  foreign.region_id = 'foreign-region';
  foreign.materialization_profile.profile_id = 'profile-foreign';
  foreign.materialization_profile.region_id = 'foreign-region';
  foreign.layout_template.layout_template_id = 'layout-foreign';
  foreign.layout_template.region_id = 'foreign-region';
  input.allowed_g5_template_set.allowed_g5_templates.push(foreign);
  const set = input.allowed_g5_template_set;
  set.catalog_digest = canonicalDigest({ version:set.version, schema:set.schema, selected_g4_type_id:set.selected_g4_type_id, world_revision_id:set.world_revision_id, allowed_g5_templates:set.allowed_g5_templates });
  await assert.rejects(() => runStage13G5MaterializationBlock({ input }), (error) => error.code === 'G5_TEMPLATE_SCOPE_MISMATCH');
});

test('Stage 13 rejects mixed approved G4 types before candidate digest and RNG', async () => {
  const input = makeStage13Input();
  const foreignType = structuredClone(input.allowed_g5_template_set.allowed_g5_templates[0]);
  foreignType.template_id = 'tpl-foreign-type';
  foreignType.g4_type_id = 'foreign-type';
  foreignType.materialization_profile.profile_id = 'profile-foreign-type';
  foreignType.layout_template.layout_template_id = 'layout-foreign-type';
  input.allowed_g5_template_set.allowed_g5_templates.push(foreignType);
  const set = input.allowed_g5_template_set;
  set.catalog_digest = canonicalDigest({ version:set.version, schema:set.schema, selected_g4_type_id:set.selected_g4_type_id, world_revision_id:set.world_revision_id, allowed_g5_templates:set.allowed_g5_templates });
  await assert.rejects(() => runStage13G5MaterializationBlock({ input }), (error) => error.code === 'G5_TEMPLATE_SCOPE_MISMATCH');
});

test('Stage 13 replay is stable and party identity separates seeds and instance IDs', async () => {
  const input = makeStage13Input();
  const replay = await runStage13G5MaterializationBlock({ input: structuredClone(input) });
  const replayAgain = await runStage13G5MaterializationBlock({ input: structuredClone(input) });
  assert.deepEqual(replay.output, replayAgain.output);
  const otherParty = structuredClone(input);
  otherParty.materialization_context.party_id = 'other-party';
  const separated = await runStage13G5MaterializationBlock({ input: otherParty });
  assert.notEqual(replay.output.materialization_run.seed_digest, separated.output.materialization_run.seed_digest);
  assert.notEqual(replay.output.g5_anchors[0].anchor_id, separated.output.g5_anchors[0].anchor_id);
});

test('code materializes concrete NPC and item instances only from approved normalized candidates', async () => {
  const stage13 = await runStage13G5MaterializationBlock({ input: makeStage13Input() });
  const anchor = stage13.output.g5_anchors[0];
  const stage15Input = makeStage15Input();
  stage15Input.g5_scene_graph = stage13.output;
  stage15Input.npc_candidate_set.npc_candidates = [{
    npc_candidate_id: 'npc-candidate-1', status: 'approved', world_revision_id:'revision-1',region_id:'region-1',valid_from_year:1200,valid_to_year:1300,allowed_seasons:['spring'],required: true, slot_rule_id:'npc-slot-1', npc_profile_set_id:'npc-profile-set-1', profile_level:'background',social_role_id:'role-1',npc_archetype_id:'archetype-1',allowed_profile_levels:['background'],
    placement:{g5_anchor_id:anchor.anchor_id,g5_minilocation_id:anchor.minilocation_id,parent_g4_node_id:'g4',presence_reason:'Approved place-function rule.'},
    identity_state:{name_status:'unknown',identity_known_to_player:false},visibility_state:{visible_to_player:true,hidden_from_player:false},machine_state:{attention_and_witness_state:{}},knowledge_scope:{known_facts_now:[],rumors_now:[],mistaken_beliefs:[]},traits:[],knowledge_records:[],schedule_records:[],relations:[{to_npc_candidate_id:'npc-candidate-2',relation_category_id:'known_person',state:{status:'neutral'}}],source_trace:[{source_id:'npc-candidate-1'}]
  }, {
    npc_candidate_id: 'npc-candidate-2', status: 'approved', world_revision_id:'revision-1',region_id:'region-1',valid_from_year:1200,valid_to_year:1300,allowed_seasons:['spring'],required: true, slot_rule_id:'npc-slot-2', npc_profile_set_id:'npc-profile-set-1', profile_level:'background',social_role_id:'role-1',npc_archetype_id:'archetype-1',allowed_profile_levels:['background'],
    placement:{g5_anchor_id:anchor.anchor_id,g5_minilocation_id:anchor.minilocation_id,parent_g4_node_id:'g4',presence_reason:'Approved place-function rule.'},
    identity_state:{name_status:'unknown',identity_known_to_player:false},visibility_state:{visible_to_player:true,hidden_from_player:false},machine_state:{attention_and_witness_state:{}},knowledge_scope:{known_facts_now:[],rumors_now:[],mistaken_beliefs:[]},traits:[],knowledge_records:[],schedule_records:[],source_trace:[{source_id:'npc-candidate-2'}]
  }];
  const stage15 = await runStage15NpcPlacementBlock({ input: stage15Input, audit: async () => makeStage15Audit() });
  assert.equal(stage15.draft.npc_instances.length, 2);
  assert.equal(stage15.draft.npc_relations[0].from_npc_id, stage15.draft.npc_instances[0].npc_instance_id);
  assert.equal(stage15.draft.npc_relations[0].to_npc_id, stage15.draft.npc_instances[1].npc_instance_id);

  const stage16Input = makeStage16Input();
  stage16Input.g5_scene_graph = stage13.output;
  stage16Input.initial_npc_placement = stage15.draft;
  stage16Input.item_profile_candidate_set.item_profile_candidates = [{
    item_profile_candidate_id:'item-candidate-1',item_profile_id:'item-profile-1',item_template_id:'item-template-1',item_category_id:'tool',status:'approved',world_revision_id:'revision-1',region_id:'region-1',valid_from_year:1200,valid_to_year:1300,allowed_seasons:['spring'],required:true,slot_rule_id:'item-slot-1',quantity:1,condition_state:'intact',legal_status:'unowned',property_rule_candidate_ids:['property-rule-1'],
    causal_basis:{causal_basis_type:'place_function',causal_basis_id:'item-rule-1'},placement:{g5_anchor_id:anchor.anchor_id,parent_g4_node_id:'g4'},physical_state:{weight:1,size_band:'small',condition:'intact'},
    visibility_state:{visibility:'visible',visible_to_player_now:true},access_state:{access:'free'},property_state:{property_rule_candidate_id:'property-rule-1',owner_model:'none',holder_model:'place',controller_model:'none',legal_or_social_status:'unowned'},risk_state:{},source_trace:[{source_id:'item-candidate-1'}]
  }];
  stage16Input.item_profile_candidate_set.property_rule_candidates = [{property_rule_candidate_id:'property-rule-1',status:'approved',world_revision_id:'revision-1',region_id:'region-1',valid_from_year:1200,valid_to_year:1300,allowed_seasons:['spring'],materialization_allowed:true}];
  const stage16 = await runStage16ItemPlacementBlock({ input: stage16Input, audit: async () => makeStage16Audit() });
  assert.equal(stage16.draft.item_instances.length, 1);
  assert.equal(stage16.draft.property_bindings[0].property_rule_candidate_id, 'property-rule-1');
  assert.equal(stage16.draft.visibility_state[0].item_instance_id, stage16.draft.item_instances[0].item_instance_id);
});

test('Stage 15 and 16 built-ins cannot consume raw candidates rejected by code eligibility filters', async () => {
  const stage13 = await runStage13G5MaterializationBlock({ input: makeStage13Input() });
  const anchor = stage13.output.g5_anchors[0];
  const stage15Input = makeStage15Input();
  stage15Input.g5_scene_graph = stage13.output;
  stage15Input.npc_candidate_set.npc_candidates = [{ npc_candidate_id:'wrong-place-npc',status:'approved',required:true,enabled:true,place_template_ids:['other-place'],slot_rule_id:'npc-slot',npc_profile_set_id:'p',profile_level:'background',social_role_id:'r',npc_archetype_id:'a',placement:{g5_anchor_id:anchor.anchor_id,g5_minilocation_id:anchor.minilocation_id,parent_g4_node_id:'g4',presence_reason:'x'},identity_state:{name_status:'unknown',identity_known_to_player:false},visibility_state:{visible_to_player:true,hidden_from_player:false},machine_state:{attention_and_witness_state:{}},knowledge_scope:{known_facts_now:[],rumors_now:[],mistaken_beliefs:[]},source_trace:[{source_id:'x'}] }];
  const stage15 = await runStage15NpcPlacementBlock({ input: stage15Input, audit: async () => makeStage15Audit() });
  assert.equal(stage15.draft.npc_instances.length, 0);

  const stage16Input = makeStage16Input();
  stage16Input.g5_scene_graph = stage13.output;
  stage16Input.initial_npc_placement = stage15.draft;
  stage16Input.item_profile_candidate_set.item_profile_candidates = [{ item_profile_candidate_id:'disabled-item',item_profile_id:'p',status:'approved',required:true,materialization_allowed:false,slot_rule_id:'slot',quantity:1,condition_state:'intact',legal_status:'unowned',causal_basis:{causal_basis_type:'place_function'},placement:{g5_anchor_id:anchor.anchor_id,parent_g4_node_id:'g4'},physical_state:{weight:1,size_band:'small',condition:'intact'},visibility_state:{visibility:'visible'},access_state:{access:'free'},property_state:{owner_model:'none',holder_model:'place',controller_model:'none'},risk_state:{},source_trace:[{source_id:'x'}] }];
  const stage16 = await runStage16ItemPlacementBlock({ input: stage16Input, audit: async () => makeStage16Audit() });
  assert.equal(stage16.draft.item_instances.length, 0);
});

test('incomplete legacy Stage 7/8 candidates hard-block instead of receiving invented semantics', async () => {
  const stage13Input = makeStage13Input();
  const template = stage13Input.allowed_g5_template_set.allowed_g5_templates[0];
  template.slot_rules.push(
    { rule_id: 'npc-runtime-slot', profile_id: 'profile-1', slot_key: 'npc-runtime', slot_domain: 'npc', min_count: 1, max_count: 1, required: true, anchor_slot_key: 'entry', npc_profile_set_id: 'npc-profile-set-legacy', presence_reason: 'approved place function', candidate_ids: ['npc-legacy'] },
    { rule_id: 'item-runtime-slot', profile_id: 'profile-1', slot_key: 'item-runtime', slot_domain: 'item', min_count: 1, max_count: 1, required: true, anchor_slot_key: 'center', candidate_ids: ['item-legacy'] },
    { rule_id: 'container-runtime-slot', profile_id: 'profile-1', slot_key: 'container-runtime', slot_domain: 'container', min_count: 1, max_count: 1, required: true, anchor_slot_key: 'side', candidate_ids: ['container-legacy'] }
  );
  const set = stage13Input.allowed_g5_template_set;
  set.catalog_digest = canonicalDigest({ version: set.version, schema: set.schema, selected_g4_type_id: set.selected_g4_type_id, world_revision_id: set.world_revision_id, allowed_g5_templates: set.allowed_g5_templates });
  const stage13 = await runStage13G5MaterializationBlock({ input: stage13Input });

  const stage15Input = makeStage15Input();
  stage15Input.g5_scene_graph = stage13.output;
  stage15Input.npc_candidate_set = { version: 1, schema: 'npc_candidate_set', request_id: stage15Input.request_id, selection_status: 'ready', catalog_digest: 'stage7-catalog', empty_allowed: false, npc_candidates: [{
    npc_candidate_id: 'npc-legacy', candidate_status: 'allowed', profile_level: 'background', npc_archetype: { npc_archetype_id: 'archetype-legacy' }, social_role: { social_role_id: 'role-legacy' }, occupation: { occupation_id: 'occupation-legacy' }, key_seed: { key_npc_seed_id: 'seed-legacy' }, name_pool_compatibility: { allowed_name_pool_ids: ['names-legacy'] }, source_trace: [{ source_id: 'stage7-row' }]
  }] };
  await assert.rejects(() => runStage15NpcPlacementBlock({ input: stage15Input, audit: async () => makeStage15Audit() }), (error) => error.code === 'PLACEMENT_RULE_CANDIDATES_EMPTY');

  const stage16Input = makeStage16Input();
  stage16Input.g5_scene_graph = stage13.output;
  stage16Input.initial_npc_placement = makeStage15Input().initial_npc_placement ?? stage16Input.initial_npc_placement;
  stage16Input.item_profile_candidate_set = { version: 1, schema: 'item_profile_candidate_set', request_id: stage16Input.request_id, selection_status: 'ready', catalog_digest: 'stage8-catalog', empty_allowed: false,
    item_profile_candidates: [{ item_profile_candidate_id: 'item-legacy', item_profile_id: 'item-profile-legacy', item_template_id: 'item-template-legacy', item_category_id: 'tool-category', default_condition: 'intact', legal_status: 'unassigned', item_type: 'tool', weight: 1, size_band: 'small', source_trace: [{ source_id: 'stage8-item-row' }] }],
    container_profile_candidates: [{ container_profile_candidate_id: 'container-legacy', container_profile_id: 'container-profile-legacy', container_template_id: 'container-template-legacy', container_category_id: 'storage-category', default_condition: 'intact', container_type: 'box', weight_empty: 2, capacity_band: 'small', content_state: { content_materialized: false, content_causal_basis: null }, source_trace: [{ source_id: 'stage8-container-row' }] }],
    property_rule_candidates: [] };
  await assert.rejects(() => runStage16ItemPlacementBlock({ input: stage16Input, audit: async () => makeStage16Audit() }), (error) => error.code === 'PLACEMENT_RULE_CANDIDATES_EMPTY');
});
