import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewGamePipelineContext } from '../context.js';
import {
  runNewGameLlmStage,
  runStage23NarratorProseAudit
} from '../stages/llm-stages.js';
import {
  buildStage22NarratorInput,
  runStage22NarratorProseBlock
} from '../stages/stage22-narrator-prose.js';
import { computeVisibleContextPackageDigest } from '../stages/visible-context-digest.js';
import { makeVisibleContextPackage } from './new-game-pipeline-stage18-stage20-fixtures.mjs';

const CHECK_KEYS = [
  'schema_and_structure', 'visible_context_compliance', 'new_fact_check', 'npc_check',
  'item_check', 'container_check', 'door_exit_route_check', 'time_light_weather_check',
  'position_check', 'g5_anchor_check', 'knowledge_boundary_check', 'hidden_state_leak_check',
  'rumor_uncertainty_check', 'action_options_check', 'technical_text_check',
  'must_include_check', 'must_not_include_check', 'commit_readiness'
];

function prose() {
  return {
    version: 1,
    schema: 'narrator_starting_prose',
    request_id: 'req-1',
    prose_status: 'drafted',
    prose: 'Ты стоишь у огня. Рядом видны человек и закрытый сундук.',
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

function auditPass() {
  return {
    version: 1,
    schema: 'narrator_prose_audit',
    request_id: 'req-1',
    pass: true,
    checks: Object.fromEntries(CHECK_KEYS.map((key) => [key, { pass: true }])),
    concerns: [],
    evidence: ['All claims and action labels are grounded in approved visible context.'],
    repair_route: null,
    commit_permission: { can_show_to_player: true, can_write_player_visible_message: true, can_mark_opening_scene_presented: true }
  };
}

async function contextWithStage22() {
  const context = createNewGamePipelineContext({ requestId: 'req-1', env: { NODE_ENV: 'test' } });
  const pkg = makeVisibleContextPackage();
  const digest = computeVisibleContextPackageDigest(pkg);
  const stage20 = {
    version: 1,
    schema: 'stage20_visible_context_result',
    request_id: 'req-1',
    pass: true,
    visible_context_package: pkg,
    visible_context_package_digest: digest,
    visible_context_code_precheck: { version: 1, schema: 'visible_context_code_precheck', pass: true }
  };
  const stage21Audit = {
    version: 1,
    schema: 'visible_context_audit',
    request_id: 'req-1',
    pass: true,
    visible_context_package_digest: digest,
    repair_route: null,
    concerns: [],
    evidence: ['approved'],
    commit_permission: { can_send_to_narrator: true, can_write_visible_context_snapshot: true, can_generate_player_facing_prose: true }
  };
  const stage21 = {
    version: 1,
    schema: 'stage21_visible_context_audit_result',
    request_id: 'req-1',
    pass: true,
    visible_context_package_digest: digest,
    audit_code_precheck: { version: 1, schema: 'visible_context_audit_code_precheck', pass: true },
    visible_context_audit: stage21Audit,
    repair_route: null,
    commit_permission: { can_send_to_narrator: true, can_write_visible_context_snapshot: true, can_generate_player_facing_prose: true }
  };
  const stage22Input = buildStage22NarratorInput({
    request_id: 'req-1',
    visible_context_package: pkg,
    visible_context_package_digest: digest,
    visible_context_approval: {
      version: 1,
      schema: 'visible_context_audit_approval',
      request_id: 'req-1',
      pass: true,
      visible_context_package_digest: digest,
      commit_permission: { can_send_to_narrator: true, can_write_visible_context_snapshot: true, can_generate_player_facing_prose: true }
    }
  });
  const stage22 = await runStage22NarratorProseBlock({
    input: stage22Input,
    writer: async () => prose(),
    formatRepairer: async ({ parsed_writer_response }) => parsed_writer_response,
    seniorWriter: async () => prose()
  });
  context.setStageOutput(20, stage20);
  context.setStageOutput(21, stage21);
  context.setStageOutput(22, stage22);
  return context;
}

test('generic Stage 23 API is blocked because Stage 23 is isolated', async () => {
  const context = await contextWithStage22();
  await assert.rejects(() => runNewGameLlmStage(context, 23, { executor: async () => auditPass() }), /isolated block/);
});

test('Stage 23 wrapper passes no global context and commits result/precheck/audit artifacts', async () => {
  const context = await contextWithStage22();
  let auditorRoleInput;
  const result = await runStage23NarratorProseAudit(context, {
    executor: async () => { throw new Error('base executor must not run when direct callbacks are supplied'); },
    narratorProseSemanticAuditor: async (value) => { auditorRoleInput = value; return auditPass(); },
    narratorProseAuditFormatRepairer: async () => auditPass(),
    seniorNarratorProseSemanticAuditor: async () => auditPass(),
    narratorProseAuditRouter: async () => { throw new Error('router must not run on pass'); }
  });
  assert.equal(result.pass, true);
  assert.equal(context.getStageOutput(23).schema, 'stage23_narrator_prose_audit_result');
  assert.equal(context.getStageOutput(2301).schema, 'narrator_prose_code_precheck');
  assert.equal(context.getStageOutput(2302).schema, 'narrator_prose_audit');
  assert.equal('context' in auditorRoleInput, false);
  assert.equal('full_hidden_scene_state' in auditorRoleInput, false);
  assert.equal('character_knowledge_map' in auditorRoleInput, false);
});

test('Stage 23 input override is forbidden', async () => {
  const context = await contextWithStage22();
  await assert.rejects(() => runStage23NarratorProseAudit(context, { input: {}, executor: async () => auditPass() }), /input override is forbidden/);
});
