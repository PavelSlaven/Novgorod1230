import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLowerDvinaTraceNpcAutonomousModel
} from '../src/runtime/lower-dvina-trace-phase-2-llm.js';

const request = Object.freeze({
  schema: 'npc_action_decision_request_v1',
  request_id: 'decision-1',
  npc_ref: 'zhdanko'
});

test('autonomous adapter uses isolated plan and repair roles', async () => {
  const calls = [];
  const output = { schema: 'npc_step_plan_v1' };
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: {
      async run(call) {
        calls.push(call);
        return { output };
      }
    }
  });

  assert.equal(await model(request), output);
  assert.equal(await model(request, {
    repair: {
      original_output: { schema: 'broken' },
      validation_errors: [{ path: '$', code: 'schema' }]
    }
  }), output);
  assert.equal(calls[0].role_id, 'npc_autonomous_decider');
  assert.equal(calls[1].role_id, 'npc_autonomous_decider_format_repair');
  const prompt = calls[0].messages[0].content;
  const repairPrompt = calls[1].messages[0].content;
  for (const phrase of [
    'npc_step_plan_v1',
    'nearest independent intention',
    'subjective knowledge',
    'observable nonverbal action',
    'never put spoken words',
    'hailing, asking, ordering aloud, calling, or replying',
    'use request_conversation',
    'Do not roll RNG',
    'exact time',
    'write plan',
    'another actor'
  ]) assert.equal(prompt.includes(phrase), true, phrase);
  const spokenRoute = prompt.match(/For hailing[^.]+/)?.[0] ?? '';
  for (const intent of ['hailing', 'asking', 'ordering aloud', 'calling', 'replying']) {
    assert.equal(spokenRoute.includes(intent), true, intent);
  }
  assert.equal(spokenRoute.includes('request_conversation'), true);
  assert.equal(spokenRoute.includes('emit_interaction'), false);
  for (const phrase of ['Use this complete valid shape',
    'Use these request-derived operation mappings']) {
    assert.equal(repairPrompt.includes(phrase), true, phrase);
  }
  assert.deepEqual(JSON.parse(calls[0].messages[1].content), request);
  assert.deepEqual(JSON.parse(calls[1].messages[1].content), {
    request,
    original_output: { schema: 'broken' },
    validation_errors: [{ path: '$', code: 'schema' }]
  });
});

test('autonomous prompt maps supplied world-process and generic-check values', async () => {
  let call;
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run(next) { call = next; return { output: {} }; } }
  });
  const requestWithContract = {
    ...request,
    root_turn_id: 'turn-1', boundary_id: 'boundary-1',
    committed_state_version: 1, working_revision: 0, decision_index: 1,
    decision_scope: {
      allowed_attribute_refs: ['attention'], allowed_skill_refs: ['observation'],
      operation_contract: { request_world_process: { allowed: [{
        process_action: 'start', process_ref: null, process_kind: 'fire',
        source_refs: ['fuel'], target_refs: ['flint']
      }] } }
    }
  };

  await model(requestWithContract);

  const prompt = call.messages[0].content;
  for (const value of ['"process_action":"start"', '"process_kind":"fire"',
    '"source_refs":["fuel"]', '"attribute_ref":"<one of allowed_attribute_refs>"',
    '"difficulty_id":"<trivial|ordinary|risky|dangerous|limit|nearly_impossible>"',
    'empty top-level operations']) assert.equal(prompt.includes(value), true, value);
});

test('autonomous adapter fails closed for missing runner or non-object output', async () => {
  assert.throws(
    () => createLowerDvinaTraceNpcAutonomousModel(),
    { code: 'TRACE_PHASE_2_DEPENDENCY_MISSING' }
  );
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run() { return { output: [] }; } }
  });
  await assert.rejects(
    () => model(request),
    { code: 'TRACE_PHASE_2_DEPENDENCY_MISSING' }
  );
});
