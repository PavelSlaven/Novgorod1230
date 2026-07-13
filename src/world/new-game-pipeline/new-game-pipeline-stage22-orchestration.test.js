import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexPath = new URL('../index.js', import.meta.url);
const stagesPath = new URL('../stages/llm-stages.js', import.meta.url);
const matrixPath = new URL('../llm-matrix.js', import.meta.url);

test('Stage 22 is not executed through createLlmStageAdapter', async () => {
  const source = await readFile(stagesPath, 'utf8');
  const start = source.indexOf('export async function runStage22NarratorProse');
  const end = source.indexOf('export async function repairStage22NarratorProse', start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.equal(block.includes('createLlmStageAdapter'), false);
  assert.ok(block.includes('runStage22NarratorProseBlock'));
  assert.ok(block.includes('input override is forbidden'));
});

test('Stage 22 provided output is blocked and Stage 23 repairs route back through Stage 22', async () => {
  const source = await readFile(indexPath, 'utf8');
  assert.ok(source.includes('[18, 19, 20, 21, 22, 23, 24].includes'));
  assert.ok(source.includes('Provided Stage 22 output is forbidden'));
  assert.ok(source.includes('repairStage22NarratorProse'));
  assert.ok(source.includes('mapStage23RouteToUpstreamTarget'));
  assert.ok(source.includes('buildStage23UpstreamRepairRequest'));
  assert.equal(source.includes('buildStage23UpstreamAuditProxy'), false);
  assert.ok(source.includes("narratorProseResult.narrator_starting_prose"));
});

test('Stage 23 handoff uses safe approval and audit policy, not full Stage 21 audit', async () => {
  const source = await readFile(stagesPath, 'utf8');
  const start = source.indexOf('export function buildStage23NarratorProseAuditInput');
  const end = source.indexOf('function validateNarratorProseAuditOutput', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('visible_context_approval: buildStage21Approval(stage21)'));
  assert.ok(block.includes('audit_policy'));
  assert.equal(block.includes('visible_context_audit: structuredClone(stage21.visible_context_audit)'), false);
});

test('LLM matrix declares Stage 22 isolated result/precheck/repair roles', async () => {
  const source = await readFile(matrixPath, 'utf8');
  assert.ok(source.includes("input_schema: 'narrator_start_input'"));
  assert.ok(source.includes("output_schema: 'stage22_narrator_prose_result'"));
  assert.ok(source.includes("code_precheck_schema: 'narrator_start_code_precheck'"));
  assert.ok(source.includes("format_repairer_role: 'NarratorProseFormatRepairer'"));
  assert.ok(source.includes("semantic_repairer_role: 'NarratorProseSemanticRepairer'"));
  assert.ok(source.includes("provided_output_policy: 'forbidden_all_environments'"));
});

import { runStage22NarratorProse, runStage23NarratorProseAudit } from '../stages/llm-stages.js';
import { computeVisibleContextPackageDigest } from '../stages/visible-context-digest.js';
import { makeVisibleContextPackage } from './new-game-pipeline-stage18-stage20-fixtures.mjs';

class Stage22FakeContext {
  constructor(stage20, stage21) {
    this.requestId = 'req-1';
    this.outputs = new Map([[20, stage20], [21, stage21]]);
    this.gates = new Map();
    this.lifecycle = new Map();
    this.frozen = [];
    this.stageMeta = new Map();
    this.repairs = new Map();
    this.repairBaselines = new Map();
    this.env = { NODE_ENV: 'test' };
  }
  getStageOutput(id) { return this.outputs.get(Number(id)); }
  requireStageOutput(id, label = `stage ${id}`) { if (!this.outputs.has(Number(id))) throw new Error(`Missing ${label}`); return this.outputs.get(Number(id)); }
  setStageOutput(id, value) { this.outputs.set(Number(id), structuredClone(value)); }
  setGateResult(id, value) { this.gates.set(Number(id), structuredClone(value)); }
  getGateResult(id) { return this.gates.get(Number(id)); }
  setLifecycleState(id, value) { this.lifecycle.set(Number(id), structuredClone(value)); }
  getLifecycleState(id) { return this.lifecycle.get(Number(id)); }
  freezeArtifact(value) { this.frozen.push(structuredClone(value)); }
  getFrozenArtifactBySchema(schema) { return this.frozen.find((item) => item.schema === schema) ?? null; }
  getRepairHistory(id) { return this.repairs.get(Number(id)) ?? []; }
  getStageMeta(id) { return this.stageMeta.get(Number(id)); }
  setStageMeta(id, value) { this.stageMeta.set(Number(id), structuredClone(value)); }
  getRepairBaseline(id) { return this.repairBaselines.get(Number(id)) ?? null; }
  clearRepairBaseline(id) { this.repairBaselines.delete(Number(id)); }
  note() {}
}

function stage22Setup() {
  const pkg = makeVisibleContextPackage();
  const digest = computeVisibleContextPackageDigest(pkg);
  const stage20 = {
    version: 1, schema: 'stage20_visible_context_result', request_id: 'req-1',
    visible_context_package: pkg, visible_context_package_digest: digest
  };
  const stage21 = {
    version: 1, schema: 'stage21_visible_context_audit_result', request_id: 'req-1', pass: true,
    visible_context_package_digest: digest,
    audit_code_precheck: { version: 1, schema: 'visible_context_audit_code_precheck', request_id: 'req-1', pass: true },
    visible_context_audit: {
      version: 1, schema: 'visible_context_audit', request_id: 'req-1', pass: true,
      visible_context_package_digest: digest, repair_route: null,
      commit_permission: { can_send_to_narrator: true, can_write_visible_context_snapshot: true, can_generate_player_facing_prose: true }
    },
    commit_permission: { can_send_to_narrator: true, can_write_visible_context_snapshot: true, can_generate_player_facing_prose: true }
  };
  return { context: new Stage22FakeContext(stage20, stage21) };
}

function validWrapperProse() {
  return {
    version: 1,
    schema: 'narrator_starting_prose',
    request_id: 'req-1',
    prose_status: 'drafted',
    prose: 'Ты стоишь у текущего якоря ночью. Рядом виден незнакомый человек и закрытый сундук.',
    action_options: [{ option_id: 'o1', label: 'Обратиться к человеку', action_kind: 'ask', target_ref: { npc_instance_id: 'npc-1' }, basis: 'visible', risk_hint: 'unknown', must_not_reveal_hidden_truth: true }],
    used_visible_context_refs: ['anchor-1', 'npc-1', 'container-1'],
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

test('Stage 22 wrapper stores isolated result bundle and does not pass context to writer', async () => {
  const { context } = stage22Setup();
  const payloads = [];
  const result = await runStage22NarratorProse(context, {
    executor: async (payload) => {
      payloads.push(payload);
      assert.deepEqual(Object.keys(payload).sort(), ['input', 'stage']);
      assert.equal(payload.context, undefined);
      assert.equal(payload.stage.role, 'NarratorStartingProseWriter');
      return validWrapperProse();
    }
  });
  assert.equal(result.schema, 'stage22_narrator_prose_result');
  assert.equal(result.pass, true);
  assert.equal(context.getStageOutput(22).schema, 'stage22_narrator_prose_result');
  assert.equal(context.getStageOutput(2201).schema, 'narrator_start_code_precheck');
  assert.equal(context.getStageOutput(2202).schema, 'narrator_starting_prose');
  assert.equal(context.getGateResult(22).pass, true);
  assert.equal(payloads.length, 1);
});

test('Stage 22 wrapper rejects arbitrary input override', async () => {
  await assert.rejects(() => runStage22NarratorProse({}, { input: {}, executor: async () => validWrapperProse() }), /input override is forbidden/);
});


test('Stage 23 receives safe approval and accepts an evidence-backed audit', async () => {
  const { context } = stage22Setup();
  await runStage22NarratorProse(context, {
    executor: async ({ stage }) => {
      if (stage.role === 'NarratorStartingProseWriter') return validWrapperProse();
      throw new Error(`Unexpected Stage 22 role ${stage.role}`);
    }
  });
  let received;
  const audit = await runStage23NarratorProseAudit(context, {
    executor: async ({ input }) => {
      received = input;
      return {
        version: 1,
        schema: 'narrator_prose_audit',
        request_id: 'req-1',
        pass: true,
        checks: Object.fromEntries([
          'schema_and_structure', 'visible_context_compliance', 'new_fact_check', 'npc_check',
          'item_check', 'container_check', 'door_exit_route_check', 'time_light_weather_check',
          'position_check', 'g5_anchor_check', 'knowledge_boundary_check', 'hidden_state_leak_check',
          'rumor_uncertainty_check', 'action_options_check', 'technical_text_check',
          'must_include_check', 'must_not_include_check', 'commit_readiness'
        ].map((key) => [key, { pass: true }])),
        concerns: [],
        evidence: ['visible context digest and prose references verified'],
        repair_route: null,
        commit_permission: {
          can_show_to_player: true,
          can_write_player_visible_message: true,
          can_mark_opening_scene_presented: true
        }
      };
    }
  });
  assert.equal(audit.pass, true);
  assert.equal(received.visible_context_approval.schema, 'visible_context_audit_approval');
  assert.equal('visible_context_audit' in received, false);
  assert.equal('generation_history' in received, false);
  assert.ok(received.audit_policy.reject_added_facts);
});
