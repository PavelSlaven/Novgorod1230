import test from 'node:test';
import assert from 'node:assert/strict';
import * as baseline from '../fixtures/stage24-baseline/stage24-party-db-write-plan-0.4.0.js';
import * as modular from '@rus/new-game/stages/stage-24/compat';
import { makeStage24Fixture } from '../fixtures/stage24-fixtures.mjs';
import { issueBoundedDecisionRequest, validateBoundedDecisionResult } from '@rus/materialization';

function withFixedNow(value, callback) {
  const original = Date.now;
  Date.now = () => value;
  return Promise.resolve().then(callback).finally(() => { Date.now = original; });
}

test('Stage 24 compatibility API preserves all baseline exports', () => {
  for (const key of Object.keys(baseline)) assert.ok(key in modular, `missing compatibility export ${key}`);
  assert.equal(typeof modular.buildPartyRuntimeV2WritePlan, 'function');
});

test('Stage 24 policy, manifest and input preserve baseline output', () => {
  const f = makeStage24Fixture();
  assert.deepEqual(modular.normalizeStage24WritePolicy(), baseline.normalizeStage24WritePolicy());
  assert.deepEqual(modular.buildApprovedPipelineManifest({ request_id: f.requestId, artifacts: f.approvedPipelineOutputs }), baseline.buildApprovedPipelineManifest({ request_id: f.requestId, artifacts: f.approvedPipelineOutputs }));
  assert.deepEqual(modular.buildStage24Input(f.inputArgs), baseline.buildStage24Input(f.inputArgs));
  assert.deepEqual(modular.validateStage24Input(f.input), baseline.validateStage24Input(f.input));
});

test('Stage 24 precheck, plan and audit validators preserve baseline output', () => {
  const f = makeStage24Fixture();
  const oldPrecheck = baseline.buildPartyDbWritePlanCodePrecheck(f.input);
  const newPrecheck = modular.buildPartyDbWritePlanCodePrecheck(f.input);
  assert.deepEqual(newPrecheck, oldPrecheck);
  assert.deepEqual(modular.validatePartyDbWritePlan(f.plan, f.input, newPrecheck), baseline.validatePartyDbWritePlan(f.plan, f.input, oldPrecheck));
  assert.deepEqual(modular.validatePartyDbWritePlanAudit(f.audit, f.input, f.plan), baseline.validatePartyDbWritePlanAudit(f.audit, f.input, f.plan));
});

test('Stage 24 code builder emits version-pinned party_runtime_v2 batches', () => {
  const f = makeStage24Fixture();
  const plan = modular.buildPartyRuntimeV2WritePlan(f.input);
  const targets = new Set(plan.write_batches.map((batch) => batch.target_table));
  assert.ok(targets.has('parties'));
  assert.ok(targets.has('party_materialization_runs'));
  assert.ok(targets.has('party_catalog_pins'));
  assert.ok(targets.has('party_materialization_run_catalog_pins'));
  assert.ok(targets.has('party_state_snapshots'));
  assert.equal(plan.write_batches.find((batch) => batch.target_table === 'parties').records[0].materializer_version, 'code_materializer_v2');
  assert.equal(
    plan.write_batches.find((batch) => batch.target_table === 'party_materialization_runs').records[0].catalog_digest,
    f.partyCreationContext.domain_catalog_pin.catalog_digest
  );
  assert.equal(
    plan.write_batches.find((batch) => batch.target_table === 'party_catalog_pins').records[0].compatible_world_revision_id,
    f.partyCreationContext.version_pins.world_revision_id
  );
  assert.ok(![...targets].some((target) => ['party_state', 'party_minilocations', 'party_scene_anchors'].includes(target)));
});

test('Stage 24 persists every validated Stage 3/9 bounded decision with full request/options/result trace', () => {
  const f = makeStage24Fixture();
  const input = structuredClone(f.input);
  const partyId = input.party_creation_context.party_id;
  const makeTrace = (requestId, policyId) => {
    const base = { actor_id: 'selector', target_id: 'target', preconditions: [], expected_cost: { kind: 'selection', value: 0 }, known_risks: [], reason_visible_to_actor: 'Approved selection.', state_version: 0, metadata: {} };
    const request = issueBoundedDecisionRequest({ requestId, partyId, actorId: 'selector', policyId, policyVersion: '2', stateVersion: 0, issuedAt: '2029-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:00:00.000Z', secret: 'secret', options: [{ ...base, option_id: 'a', command_id: `${policyId}-a` }, { ...base, option_id: 'b', command_id: `${policyId}-b` }] });
    const raw = { version: 2, schema: 'bounded_decision_result_v2', request_id: request.request_id, state_version: 0, option_id: 'a', command_token: request.options[0].command_token };
    const result = validateBoundedDecisionResult({ request, result: raw, secret: 'secret', now: '2029-01-02T00:00:00.000Z', currentPolicyVersion: '2' });
    return { request, result, validation_report: { pass: true } };
  };
  input.approved_pipeline_outputs.historical_frame.decision_trace = { bounded_decision_trace: structuredClone(makeTrace('stage3-decision', 'stage3')) };
  input.approved_pipeline_outputs.selected_start_node.selection_reasoning = { bounded_decision_trace: structuredClone(makeTrace('stage9-decision', 'stage9')) };
  const plan = modular.buildPartyRuntimeV2WritePlan(input);
  const batch = (table) => plan.write_batches.find((value) => value.target_table === table).records;
  assert.equal(batch('party_decision_requests').length, 2);
  assert.equal(batch('party_decision_options').length, 4);
  assert.equal(batch('party_decision_results').length, 2);
  assert.ok(batch('party_decision_requests').every((record) => record.party_id === partyId && record.issued_at));

  input.approved_pipeline_outputs.historical_frame.decision_trace.bounded_decision_trace.request.party_id = 'other-party';
  assert.throws(() => modular.buildPartyRuntimeV2WritePlan(input), (error) => error.code === 'WRITE_PLAN_DECISION_TRACE_INVALID');
});

test('Stage 24 rejects a materialization trace that differs from party version pins', () => {
  const f = makeStage24Fixture();
  const input = structuredClone(f.input);
  input.approved_pipeline_outputs.g5_scene_graph.materialization_run.rng_version = 'future_rng';
  input.party_db_write_plan_input_digest = modular.computeStage24Digest({ ...input, party_db_write_plan_input_digest: undefined });
  assert.ok(modular.validateStage24Input(input).some((item) => item.code === 'WRITE_PLAN_VERSION_PIN_MISMATCH'));
  assert.throws(() => modular.buildPartyRuntimeV2WritePlan(input), (error) => error.code === 'WRITE_PLAN_VERSION_PIN_MISMATCH');
});

test('Stage 24 code builder preserves approved normalized NPC, item, placement and ownership relations', () => {
  const f = makeStage24Fixture();
  const input = structuredClone(f.input);
  const anchorId = input.approved_pipeline_outputs.g5_scene_graph.g5_anchors[0].anchor_id;
  const nodeId = input.approved_pipeline_outputs.g5_scene_graph.g5_minilocations[0].g5_minilocation_id;
  input.approved_pipeline_outputs.initial_npc_placement.npc_instances = [{
    npc_instance_id:'npc-v2-1',npc_candidate_id:'npc-candidate-v2-1',profile_set_id:'npc-profile-v2-1',profile_level:'scene',placement:{g5_anchor_id:anchorId,presence_reason:'approved_rule'},identity:{name_status:'unknown'},machine_state:{attention:'idle'},access_state:{access:'present'},visibility_state:{visibility:'visible'},causal_basis:{causal_basis_type:'approved_rule',causal_basis_id:'npc-rule'},source_trace:[{source_id:'npc-source'}],
    traits:[{trait_domain:'behavior',category_id:'behavior-1',source_profile_id:'npc-profile-v2-1'}],knowledge_records:[{fact_id:'fact-1',knowledge_state:'known'}]
  }];
  input.approved_pipeline_outputs.initial_npc_placement.npc_schedule_state = [{npc_instance_id:'npc-v2-1',time_band:'day',schedule_profile_id:'schedule-1',g5_node_id:nodeId}];
  const container = (id, placement) => ({container_instance_id:id,container_profile_candidate_id:`candidate-${id}`,container_template_id:'container-template-v2-1',placement,physical_state:{condition:'closed'},causal_basis:{causal_basis_type:'approved_rule',causal_basis_id:'container-rule'},access_state:{access:'closed'},visibility_state:{visibility:'visible'},risk_state:{risk_basis:[]},property_state:{owner_model:'party',controller_model:'none',legal_or_social_status:'owned'},source_trace:[{source_id:'container-source'}]});
  const playerId = input.approved_pipeline_outputs.player_character.player_character_id ?? input.approved_pipeline_outputs.player_character.character_id;
  input.approved_pipeline_outputs.initial_item_placement.container_instances = [
    container('container-v2-2', {container_instance_id:'container-v2-1'}),
    container('container-v2-1', {g5_anchor_id:anchorId}),
    container('container-v2-3', {holder_npc_instance_id:'npc-v2-1'}),
    container('container-v2-4', {holder_player_character_id:playerId,physical_position:'worn'})
  ];
  input.approved_pipeline_outputs.initial_item_placement.item_instances = [{item_instance_id:'item-v2-1',item_profile_candidate_id:'item-candidate-v2-1',item_template_id:'item-template-v2-1',item_profile_id:'item-profile-v2-1',item_category_id:'item-category-v2-1',quantity:2,condition_state:'intact',legal_status:'owned',placement:{container_instance_id:'container-v2-1'},physical_state:{condition:'intact'},causal_basis:{causal_basis_type:'approved_rule',causal_basis_id:'item-rule'},access_state:{access:'free'},visibility_state:{visibility:'visible'},risk_state:{risk_basis:[]},property_state:{owner_model:'party',controller_model:'none',legal_or_social_status:'owned'},source_trace:[{source_id:'item-source'}]}];
  const plan = modular.buildPartyRuntimeV2WritePlan(input);
  const targets = new Set(plan.write_batches.map((batch) => batch.target_table));
  for (const target of ['party_npcs','party_npc_traits','party_npc_knowledge','party_npc_schedules','party_containers','party_items','party_item_placements','party_ownership']) assert.ok(targets.has(target), target);
  assert.ok(plan.write_batches.every((batch) => batch.operation_mode === 'insert_only'));
  assert.equal(plan.write_batches.find((batch) => batch.target_table === 'party_items').records[0].quantity, 2);
  const containerRows = plan.write_batches.find((batch) => batch.target_table === 'party_containers').records;
  assert.deepEqual(containerRows.map((row) => row.container_id), ['container-v2-1','container-v2-2','container-v2-3','container-v2-4']);
  assert.equal(containerRows[1].parent_container_id, 'container-v2-1');
  assert.equal(containerRows[2].holder_npc_id, 'npc-v2-1');
  assert.equal(containerRows[3].holder_character_id, playerId);
});

test('Stage 24 blocks an approved item missing quantity instead of applying a fallback', () => {
  const f = makeStage24Fixture();
  const input = structuredClone(f.input);
  input.approved_pipeline_outputs.initial_item_placement.item_instances = [{item_instance_id:'item-incomplete',item_profile_id:'profile',condition_state:'intact',legal_status:'owned',placement:{g5_anchor_id:f.anchorId},physical_state:{condition:'intact'},property_state:{owner_model:'party',controller_model:'none',legal_or_social_status:'owned'}}];
  assert.throws(() => modular.buildPartyRuntimeV2WritePlan(input), (error) => error.code === 'WRITE_PLAN_APPROVED_VALUE_MISSING');
});

test('Stage 24 blocks player-held items and containers without physical position', () => {
  const f = makeStage24Fixture();
  const input = structuredClone(f.input);
  const playerId = input.approved_pipeline_outputs.player_character.player_character_id ?? input.approved_pipeline_outputs.player_character.character_id;
  input.approved_pipeline_outputs.initial_item_placement.item_instances = [{item_instance_id:'item-held',item_template_id:'item-template',item_profile_id:'item-profile',item_category_id:'item-category',quantity:1,condition_state:'intact',legal_status:'owned',placement:{holder_player_character_id:playerId},physical_state:{condition:'intact'},causal_basis:{causal_basis_type:'approved_rule',causal_basis_id:'item-rule'},access_state:{access:'free'},visibility_state:{visibility:'visible'},risk_state:{risk_basis:[]},property_state:{owner_model:'party',controller_model:'none',legal_or_social_status:'owned'},source_trace:[{source_id:'item-source'}]}];
  assert.throws(() => modular.buildPartyRuntimeV2WritePlan(input), (error) => error.code === 'WRITE_PLAN_PHYSICAL_POSITION_REQUIRED');
});

test('Stage 24 full successful orchestration uses immutable code plan and preserves approval contract', async () => {
  const f = makeStage24Fixture();
  const newResult = await withFixedNow(1700000000000, () => modular.runStage24PartyDbWritePlanBlock({ input: structuredClone(f.input), ...f.executors }));
  assert.equal(newResult.pass, true);
  assert.equal(newResult.diagnostics.semantic_repair_attempts, 0);
  assert.equal(newResult.party_db_write_plan_digest, modular.computePartyDbWritePlanDigest(f.plan));
  assert.equal(modular.buildStage24Approval(newResult).party_db_write_plan_digest, newResult.party_db_write_plan_digest);
});

test('Stage 24 manifest digest mismatch preserves concerns and order', () => {
  const f = makeStage24Fixture();
  const input = structuredClone(f.input);
  input.approved_pipeline_manifest.artifacts[0].artifact_digest = 'sha256:' + '0'.repeat(64);
  input.approved_pipeline_manifest_digest = modular.computeStage24Digest(input.approved_pipeline_manifest);
  input.party_db_write_plan_input_digest = modular.computeStage24Digest({ ...input, party_db_write_plan_input_digest: undefined });
  assert.deepEqual(modular.validateStage24Input(input), baseline.validateStage24Input(input));
});

test('Stage 24 rejects malformed code plan without LLM plan repair', async () => {
  const f = makeStage24Fixture();
  const createExecutors = () => {
    let first = true;
    return {
      ...f.executors,
      builder: async () => first ? (first = false, '{broken') : structuredClone(f.plan),
      planFormatRepairer: async () => structuredClone(f.plan)
    };
  };
  await assert.rejects(withFixedNow(1700000000100, () => modular.runStage24PartyDbWritePlanBlock({ input: structuredClone(f.input), ...createExecutors() })), /code-generated plan failed validation/u);
});

test('Stage 24 successful result passes the modular Stage 25 input boundary', async () => {
  const stage25 = await import('@rus/new-game/stages/stage-25/compat');
  const f = makeStage24Fixture();
  const result = await withFixedNow(1700000000200, () => modular.runStage24PartyDbWritePlanBlock({ input: structuredClone(f.input), ...f.executors }));
  assert.deepEqual(modular.validateStage24ToStage25Handoff({
    stage24_result: result,
    party_database_schema: f.partyDatabaseSchema,
    approved_pipeline_manifest: f.approvedPipelineManifest
  }), []);
  const stage25Input = stage25.buildStage25CommitInput({
    request_id: f.requestId,
    party_creation_context: f.partyCreationContext,
    stage24_result: result,
    party_database_schema: f.partyDatabaseSchema,
    world_base_reference_snapshot: f.worldBaseReferenceSnapshot,
    approved_pipeline_manifest: f.approvedPipelineManifest
  });
  assert.deepEqual(stage25.validateStage25CommitInput(stage25Input), []);
});
