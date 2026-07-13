import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStage22NarratorInput,
  runStage22NarratorProseBlock,
  runStage22SemanticRepairBlock,
  STAGE22_OUTPUT_SCHEMA
} from '../stages/stage22-narrator-prose.js';
import { computeVisibleContextPackageDigest } from '../stages/visible-context-digest.js';
import { makeVisibleContextPackage } from './new-game-pipeline-stage18-stage20-fixtures.mjs';

function setup() {
  const pkg = makeVisibleContextPackage();
  const digest = computeVisibleContextPackageDigest(pkg);
  const input = buildStage22NarratorInput({
    request_id: 'req-1',
    visible_context_package: pkg,
    visible_context_package_digest: digest,
    visible_context_approval: {
      version: 1, schema: 'visible_context_audit_approval', request_id: 'req-1', pass: true,
      visible_context_package_digest: digest,
      commit_permission: { can_send_to_narrator: true, can_write_visible_context_snapshot: true, can_generate_player_facing_prose: true }
    }
  });
  return { input };
}

function prose(text = 'Ты видишь человека рядом с закрытым сундуком.') {
  return {
    version: 1,
    schema: STAGE22_OUTPUT_SCHEMA,
    request_id: 'req-1',
    prose_status: 'drafted',
    prose: text,
    action_options: [{ option_id: 'o1', label: 'Обратиться к человеку', action_kind: 'ask', target_ref: { npc_instance_id: 'npc-1' }, basis: 'visible', risk_hint: 'unknown', must_not_reveal_hidden_truth: true }],
    used_visible_context_refs: ['npc-1', 'container-1'],
    self_constraints_check: {
      used_only_visible_context: true,
      did_not_add_new_world_facts: true,
      did_not_reveal_hidden_state: true,
      preserved_time_weather_light: true,
      preserved_position: true,
      rumors_remain_rumors: true,
      uncertainty_remains_uncertain: true
    }
  };
}

const format = async ({ parsed_writer_response }) => parsed_writer_response;

test('Stage 23 concerns and evidence are passed into targeted Stage 22 semantic repair', async () => {
  const { input } = setup();
  const failedResult = await runStage22NarratorProseBlock({ input, writer: async () => prose(), formatRepairer: format, seniorWriter: async () => prose() });
  const audit = {
    version: 1,
    schema: 'narrator_prose_audit',
    request_id: 'req-1',
    pass: false,
    concerns: [{ code: 'NARRATOR_PROSE_ADDED_ITEM', severity: 'hard_block', message: 'Added item.' }],
    evidence: ['A phrase is absent from visible context.'],
    repair_route: { return_to_stage: 'narrator_prose_semantic_repair', repair_kind: 'remove_added_item' },
    commit_permission: { can_show_to_player: false, can_write_player_visible_message: false, can_mark_opening_scene_presented: false }
  };
  let repairInput;
  const repaired = await runStage22SemanticRepairBlock({
    input,
    failedResult,
    proseAudit: audit,
    semanticRepairer: async (value) => { repairInput = value; return prose('Ты видишь человека рядом с закрытым сундуком.'); },
    formatRepairer: format,
    seniorRepairer: async () => prose()
  });
  assert.equal(repaired.pass, true);
  assert.deepEqual(repairInput.prose_audit_concerns, audit.concerns);
  assert.deepEqual(repairInput.prose_audit_evidence, audit.evidence);
  assert.equal('full_hidden_scene_state' in repairInput, false);
  assert.equal('character_knowledge_map' in repairInput, false);
  assert.ok(repairInput.allowed_mutable_paths.includes('prose'));
  assert.ok(repairInput.forbidden_mutable_paths.includes('visible_context_package'));
});

test('semantic repair refuses an audit without concerns and evidence', async () => {
  const { input } = setup();
  const failedResult = await runStage22NarratorProseBlock({ input, writer: async () => prose(), formatRepairer: format, seniorWriter: async () => prose() });
  await assert.rejects(() => runStage22SemanticRepairBlock({
    input,
    failedResult,
    proseAudit: { version: 1, schema: 'narrator_prose_audit', request_id: 'req-1', pass: false, concerns: [], evidence: [] },
    semanticRepairer: async () => prose(),
    formatRepairer: format,
    seniorRepairer: async () => prose()
  }), /failed Stage 23 audit/);
});
