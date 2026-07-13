import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStage20ReferenceIndex,
  buildStage20VisibilityFilter,
  buildVisibleContextCodePrecheck,
  runStage20VisibleContextBlock,
  validateStage20Input,
  validateVisibleContextPackage
} from '../stages/stage20-visible-context.js';
import { clone, makeStage20Input, makeVisibleContextPackage } from './new-game-pipeline-stage18-stage20-fixtures.mjs';

const noopFormat = async ({ parsed_output }) => parsed_output;
const noRepair = async () => { throw new Error('repair should not be called'); };

test('Stage 20 accepts exact isolated input and all upstream audits', () => {
  assert.deepEqual(validateStage20Input(makeStage20Input()), []);
});

test('Stage 20 rejects failed upstream audit before Builder', async () => {
  const input = makeStage20Input();
  input.npc_placement_audit.pass = false;
  let called = false;
  await assert.rejects(() => runStage20VisibleContextBlock({
    input,
    build: async () => { called = true; return makeVisibleContextPackage(); },
    formatRepair: noopFormat,
    semanticRepair: noRepair,
    seniorRepair: noRepair
  }), /input gate failed/);
  assert.equal(called, false);
});

test('Stage 20 builds mechanical visibility filter from approved flags', () => {
  const input = makeStage20Input();
  const refs = buildStage20ReferenceIndex(input);
  const filter = buildStage20VisibilityFilter(input, refs);
  assert.deepEqual(filter.visible_anchor_ids, ['anchor-1']);
  assert.deepEqual(filter.audible_anchor_ids, ['anchor-2']);
  assert.deepEqual(filter.visible_npc_ids, ['npc-1']);
  assert.deepEqual(filter.visible_item_ids, ['item-1']);
  assert.deepEqual(filter.visible_container_ids, ['container-1']);
  assert.ok(filter.allowed_visible_hint_refs.includes('hidden-npc-1'));
  assert.ok(filter.forbidden_hidden_fact_ids.includes('hidden-container-1'));
});

test('Stage 20 valid package passes complete code precheck', () => {
  const input = makeStage20Input();
  const output = makeVisibleContextPackage();
  const precheck = buildVisibleContextCodePrecheck(output, input);
  assert.equal(precheck.pass, true, JSON.stringify(precheck.concerns));
});

test('Stage 20 rejects visible NPC not present in placement', () => {
  const input = makeStage20Input();
  const output = makeVisibleContextPackage();
  output.visible_npcs.push({ npc_instance_id: 'npc-foreign' });
  const codes = validateVisibleContextPackage(output, input).map((x) => x.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_NPC_REF_NOT_FOUND'));
});

test('Stage 20 rejects private motive leak', () => {
  const input = makeStage20Input();
  const output = makeVisibleContextPackage();
  output.visible_npcs[0].private_motive = 'Secret motive';
  const codes = validateVisibleContextPackage(output, input).map((x) => x.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK'));
});

test('Stage 20 rejects closed container content disclosure', () => {
  const input = makeStage20Input();
  const output = makeVisibleContextPackage();
  output.visible_containers[0].content_summary = 'coins';
  const codes = validateVisibleContextPackage(output, input).map((x) => x.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK'));
});

test('Stage 20 rejects pre-commit route_id', () => {
  const input = makeStage20Input();
  const output = makeVisibleContextPackage();
  output.visible_exits[0].route_id = 'party-route-1';
  const codes = validateVisibleContextPackage(output, input).map((x) => x.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_CREATED_ROUTE'));
});

test('Stage 20 requires rumor and uncertainty markings', () => {
  const input = makeStage20Input();
  const output = makeVisibleContextPackage();
  output.rumor_context = [{ context_id: 'r-1', statement: 'Rumor' }];
  output.uncertain_context = [{ context_id: 'u-1', statement: 'Maybe', confidence: 'high', inference_basis_refs: [] }];
  const codes = validateVisibleContextPackage(output, input).map((x) => x.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_RUMOR_TREATED_AS_FACT'));
  assert.ok(codes.includes('VISIBLE_CONTEXT_UNCERTAIN_TREATED_AS_FACT'));
  assert.ok(codes.includes('VISIBLE_CONTEXT_KNOWLEDGE_BASIS_MISSING'));
});

test('Stage 20 hidden_filtered_out contains only ID and reason', () => {
  const input = makeStage20Input();
  const output = makeVisibleContextPackage();
  output.hidden_filtered_out[0].description = 'Secret motive';
  const codes = validateVisibleContextPackage(output, input).map((x) => x.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_HIDDEN_FACT_LEAK'));
});

test('Stage 20 returns bundle without narrator permission', async () => {
  const input = makeStage20Input();
  let roleInputSeen = null;
  const result = await runStage20VisibleContextBlock({
    input,
    build: async (roleInput) => { roleInputSeen = roleInput; return makeVisibleContextPackage(); },
    formatRepair: noopFormat,
    semanticRepair: noRepair,
    seniorRepair: noRepair
  });
  assert.equal(roleInputSeen.schema, 'visible_context_builder_input');
  assert.equal(roleInputSeen.context, undefined);
  assert.equal(result.schema, 'stage20_visible_context_result');
  assert.equal(result.visible_context_code_precheck.pass, true);
  assert.equal(result.commit_permission.can_continue_to_visible_context_audit, true);
  assert.equal(result.commit_permission.can_send_to_narrator, false);
  assert.equal(result.commit_permission.can_generate_player_facing_prose, false);
});

test('Stage 20 performs semantic repair then repeats precheck', async () => {
  const input = makeStage20Input();
  const broken = makeVisibleContextPackage();
  broken.visible_npcs[0].private_motive = 'secret';
  let repaired = false;
  const result = await runStage20VisibleContextBlock({
    input,
    build: async () => broken,
    formatRepair: noopFormat,
    semanticRepair: async ({ validationErrors, forbidden_mutable_paths }) => {
      assert.ok(validationErrors.some((x) => x.code === 'VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK'));
      assert.ok(forbidden_mutable_paths.includes('full_hidden_scene_state'));
      repaired = true;
      return makeVisibleContextPackage();
    },
    seniorRepair: noRepair
  });
  assert.equal(repaired, true);
  assert.equal(result.repair_history[0].kind, 'semantic');
  assert.equal(result.visible_context_code_precheck.pass, true);
});

test('Stage 20 escalates to senior semantic repair', async () => {
  const input = makeStage20Input();
  const broken = makeVisibleContextPackage();
  broken.visible_containers[0].content_summary = 'coins';
  let seniorCalled = false;
  const result = await runStage20VisibleContextBlock({
    input,
    build: async () => broken,
    formatRepair: noopFormat,
    semanticRepair: async () => clone(broken),
    seniorRepair: async ({ validationErrors }) => {
      assert.ok(validationErrors.some((x) => x.code === 'VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK'));
      seniorCalled = true;
      return makeVisibleContextPackage();
    }
  });
  assert.equal(seniorCalled, true);
  assert.equal(result.repair_history.at(-1).kind, 'senior_semantic');
});

test('Stage 20 rejects current position not sourced from audited Stage 13 G5', () => {
  const input = makeStage20Input();
  input.current_position.anchor_id = 'anchor-2';
  const codes = validateStage20Input(input).map((x) => x.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_POSITION_MISMATCH'));
});

test('Stage 20 rejects inference basis that is not player-safe', () => {
  const input = makeStage20Input();
  const output = makeVisibleContextPackage();
  output.uncertain_context[0].inference_basis_refs = ['hidden-container-1'];
  const codes = validateVisibleContextPackage(output, input).map((x) => x.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_KNOWLEDGE_BASIS_MISSING'));
});

test('Stage 20 rejects visible scene fact without approved source refs', () => {
  const input = makeStage20Input();
  const output = makeVisibleContextPackage();
  output.visible_scene_facts[0].source_refs = [];
  const codes = validateVisibleContextPackage(output, input).map((x) => x.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_CREATED_WORLD_FACT'));
});

test('Stage 20 rejects available action without explicit hidden-truth boundary', () => {
  const input = makeStage20Input();
  const output = makeVisibleContextPackage();
  delete output.available_actions_context[0].must_not_reveal_hidden_truth;
  const codes = validateVisibleContextPackage(output, input).map((x) => x.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_ACTION_LABEL_USES_HIDDEN_TRUTH'));
});

test('Stage 20 rejects raw prompt or system material in visible package', () => {
  const input = makeStage20Input();
  const output = makeVisibleContextPackage();
  output.narrator_scope.system_prompt = 'hidden prompt';
  const codes = validateVisibleContextPackage(output, input).map((x) => x.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_RAW_JSON_TO_NARRATOR'));
});

test('Stage 20 performs targeted semantic repair from Stage 21 concerns without rerunning Builder', async () => {
  const input = makeStage20Input();
  const failed = makeVisibleContextPackage();
  failed.visible_containers[0].content_summary = 'Hidden contents';
  let builderCalls = 0;
  let repairCalls = 0;
  const result = await runStage20VisibleContextBlock({
    input,
    build: async () => { builderCalls += 1; return makeVisibleContextPackage(); },
    formatRepair: async ({ parsed_output }) => parsed_output,
    semanticRepair: async (repairInput) => {
      repairCalls += 1;
      assert.equal(repairInput.schema, 'visible_context_stage21_semantic_repair_input');
      assert.equal(repairInput.stage21_visible_context_audit.pass, false);
      return makeVisibleContextPackage();
    },
    seniorRepair: async () => makeVisibleContextPackage(),
    repairRequest: {
      failed_visible_context_package: failed,
      visible_context_code_precheck: { version: 1, schema: 'visible_context_code_precheck', pass: false },
      stage21_visible_context_audit: {
        version: 1,
        schema: 'visible_context_audit',
        pass: false,
        concerns: [{ code: 'VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK' }],
        evidence: [{ kind: 'field_path', path: 'visible_containers[0].content_summary' }]
      },
      stage21_repair_route: {
        allowed_mutable_paths: ['visible_containers', 'visible_scene_dossier'],
        forbidden_mutable_paths: ['frame', 'position']
      }
    }
  });
  assert.equal(builderCalls, 0);
  assert.equal(repairCalls, 1);
  assert.equal(result.pass, true);
  assert.equal(result.repair_history[0].kind, 'stage21_targeted_semantic');
});
