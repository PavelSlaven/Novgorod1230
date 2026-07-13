import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runStage18MapKnowledge,
  runStage20VisibleContext
} from '../stages/llm-stages.js';
import {
  makeKnowledgeAudit,
  makeKnowledgeMap,
  makeStage18Input,
  makeStage20Input,
  makeVisibleContextPackage
} from './new-game-pipeline-stage18-stage20-fixtures.mjs';

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

test('Stage 18 wrapper rejects provided output before reading context', async () => {
  await assert.rejects(() => runStage18MapKnowledge({}, { providedOutput: {} }), /forbidden/);
});

test('Stage 20 wrapper rejects provided output before reading context', async () => {
  await assert.rejects(() => runStage20VisibleContext({}, { providedOutput: {} }), /forbidden/);
});

test('Stage 18 wrapper sends executor only role input and stage metadata', async () => {
  const context = new FakeContext();
  const payloads = [];
  const result = await runStage18MapKnowledge(context, {
    input: makeStage18Input(),
    executor: async (payload) => {
      payloads.push(payload);
      assert.deepEqual(Object.keys(payload).sort(), ['input', 'stage']);
      assert.equal(payload.context, undefined);
      if (payload.stage.role === 'CharacterKnowledgeMapBuilder') return makeKnowledgeMap();
      if (payload.stage.role === 'CharacterKnowledgeMapAuditor') return makeKnowledgeAudit(true);
      throw new Error(`Unexpected role ${payload.stage.role}`);
    }
  });
  assert.equal(result.schema, 'character_knowledge_map');
  assert.equal(context.getStageOutput(18).schema, 'character_knowledge_map');
  assert.equal(context.getStageOutput(1802).schema, 'character_knowledge_map_audit');
  assert.ok(payloads.length >= 2);
});

test('Stage 20 wrapper stores one bundle under key 20 and sends no global context', async () => {
  const context = new FakeContext();
  const payloads = [];
  const result = await runStage20VisibleContext(context, {
    input: makeStage20Input(),
    executor: async (payload) => {
      payloads.push(payload);
      assert.deepEqual(Object.keys(payload).sort(), ['input', 'stage']);
      assert.equal(payload.context, undefined);
      if (payload.stage.role === 'VisibleContextBuilder') return makeVisibleContextPackage();
      throw new Error(`Unexpected role ${payload.stage.role}`);
    }
  });
  assert.equal(result.schema, 'stage20_visible_context_result');
  assert.equal(context.getStageOutput(20).schema, 'stage20_visible_context_result');
  assert.equal(context.getStageOutput(2003).schema, 'visible_context_package');
  assert.equal(context.getStageOutput(20).commit_permission.can_send_to_narrator, false);
  assert.ok(payloads.length >= 1);
});

test('Stage 20 wrapper records isolated failure diagnostics', async () => {
  const context = new FakeContext();
  const input = makeStage20Input();
  input.current_position.anchor_id = 'anchor-2';
  await assert.rejects(() => runStage20VisibleContext(context, {
    input,
    executor: async () => makeVisibleContextPackage()
  }), /input gate failed/);
  assert.equal(context.getGateResult(20).pass, false);
  assert.equal(context.getLifecycleState(20).failed_gate, 'stage20_input_gate');
  assert.equal(context.getLifecycleState(20).terminal_status, 'stage_failed');
});
