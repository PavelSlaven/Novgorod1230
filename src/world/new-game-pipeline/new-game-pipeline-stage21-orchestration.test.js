import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runStage20VisibleContext,
  runStage21VisibleContextAudit
} from '../stages/llm-stages.js';
import { STAGE21_REQUIRED_CHECKS } from '../stages/stage21-visible-context-audit.js';
import { makeStage20Input, makeVisibleContextPackage } from './new-game-pipeline-stage18-stage20-fixtures.mjs';

class FakeContext {
  constructor() {
    this.requestId = 'req-1';
    this.outputs = new Map();
    this.gates = new Map();
    this.lifecycle = new Map();
    this.frozen = [];
    this.notes = [];
  }
  getStageOutput(id) { return this.outputs.get(Number(id)); }
  requireStageOutput(id, label = `stage ${id}`) {
    if (!this.outputs.has(Number(id))) throw new Error(`Missing ${label}`);
    return this.outputs.get(Number(id));
  }
  setStageOutput(id, value) { this.outputs.set(Number(id), structuredClone(value)); }
  setGateResult(id, value) { this.gates.set(Number(id), structuredClone(value)); }
  getGateResult(id) { return this.gates.get(Number(id)); }
  setLifecycleState(id, value) { this.lifecycle.set(Number(id), structuredClone(value)); }
  getLifecycleState(id) { return this.lifecycle.get(Number(id)); }
  freezeArtifact(value) { this.frozen.push(structuredClone(value)); }
  getFrozenArtifactBySchema(schema) { return this.frozen.find((x) => x.schema === schema) ?? null; }
  note(stageId, value) { this.notes.push({ stageId, value }); }
}

function auditFor(input) {
  return {
    version: 1,
    schema: 'visible_context_audit',
    request_id: input.request_id,
    visible_context_package_digest: input.visible_context_package_digest,
    pass: true,
    checks: Object.fromEntries(STAGE21_REQUIRED_CHECKS.map((key) => [key, { pass: true }])),
    concerns: [],
    evidence: [{ kind: 'package_digest_verified' }, { kind: 'hidden_boundary_verified' }],
    repair_route: null,
    commit_permission: {
      can_send_to_narrator: true,
      can_write_visible_context_snapshot: true,
      can_generate_player_facing_prose: true
    }
  };
}

test('Stage 21 wrapper rejects provided output before reading context', async () => {
  await assert.rejects(() => runStage21VisibleContextAudit({}, { providedOutput: {} }), /forbidden/);
});

test('Stage 21 wrapper is isolated and stores a result bundle under key 21', async () => {
  const context = new FakeContext();
  await runStage20VisibleContext(context, {
    input: makeStage20Input(),
    executor: async ({ stage }) => {
      if (stage.role === 'VisibleContextBuilder') return makeVisibleContextPackage();
      throw new Error(`Unexpected Stage 20 role ${stage.role}`);
    }
  });
  const payloads = [];
  const result = await runStage21VisibleContextAudit(context, {
    executor: async (payload) => {
      payloads.push(payload);
      assert.deepEqual(Object.keys(payload).sort(), ['input', 'stage']);
      assert.equal(payload.context, undefined);
      if (payload.stage.role === 'VisibleContextSemanticAuditor') {
        return auditFor(payload.input.visible_context_audit_input);
      }
      throw new Error(`Unexpected Stage 21 role ${payload.stage.role}`);
    }
  });
  assert.equal(result.schema, 'stage21_visible_context_audit_result');
  assert.equal(result.pass, true);
  assert.equal(context.getStageOutput(21).schema, 'stage21_visible_context_audit_result');
  assert.equal(context.getStageOutput(2101).schema, 'visible_context_audit_code_precheck');
  assert.equal(context.getStageOutput(2102).schema, 'visible_context_audit');
  assert.equal(context.getGateResult(21).pass, true);
  assert.equal(context.getStageOutput(20).visible_context_package_digest, result.visible_context_package_digest);
  assert.ok(payloads.length >= 1);
});
