import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNarrationOutput } from '@rus/narration';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';
import { assembleNarrationRoleOutput,
  createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

test('narration assembly does not default omitted semantic fields', () => {
  const output = assembleNarrationRoleOutput('gameplay_narrator', {
    prose: 'Двор тих.' }, { request_id: 'narration-1' });
  assert.equal(output.action_options, undefined);
  assert.equal(output.used_references, undefined);
  assert.equal(output.self_check, undefined);
  assert.equal(validateNarrationOutput(output).ok, false);
});

test('narration wires writer, audit, and targeted semantic repair roles', async () => {
  const calls = [];
  const repairedOutput = { version: 1, schema: 'narration_output', output_id: 'narration-1', prose: 'Двор тих.', action_options: [], used_references: [], self_check: {} };
  const turnBudget = createLlmTurnBudget();
  const narration = createLowerDvinaTraceNarrationService({
    roleRunner: createLlmRoleRunnerAdapter({ turnBudget,
      env: { DEEPSEEK_API_KEY: 'test-key' }, async execute(call) {
      calls.push(call);
      const output = call.roleId === 'gameplay_narrator'
        ? {}
        : call.roleId === 'gameplay_narrator_format_repair'
          ? { prose: repairedOutput.prose, action_options: [],
              used_references: [], self_check: {} }
          : call.roleId === 'gameplay_narrator_auditor'
            ? calls.filter(({ roleId }) => roleId === 'gameplay_narrator_auditor').length === 1
              ? { pass: false, concerns: [{ segment_choice: 'segment_1', kind: 'unsupported_fact', reason: 'Не подтверждено.' }], evidence: ['Нет в visible_context.'] }
              : { pass: true, concerns: [], evidence: ['Подтверждено.'] }
            : call.roleId === 'gameplay_narrator_semantic_repair'
              ? { replacements: [{ prose: 'Двор тих.' }] }
              : null;
      return { status: 'ok', parsed_json: output, provider: 'deepseek',
        model: 'deepseek-v4-flash', scope: call.scope, role_id: call.roleId,
        durationMs: 1, config_hash: 'test' };
    } })
  });
  const result = await turnBudget.runTurn(() => narration.run({
    version: 1, schema: 'narration_request', request_id: 'narration-1',
    surface: 'turn', visible_context: {
      version: 1, schema: 'visible_context_package', visible_scene: 'Двор тих.',
      visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: []
    }
  }));
  assert.equal(result.status, 'approved');
  const shape = '{"prose":"<visible-only prose>","action_options":[],"used_references":[],"self_check":{}}';
  const repairShape = shape;
  assert.equal(calls[0].messages[0].content.includes(shape), true);
  assert.equal(calls[0].messages[0].content.includes(
    'server assembles version, schema, and output_id'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'context.player_input only to understand attempted action or speech'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'never evidence of success or a new world fact'), true);
  assert.equal(calls[0].scope, 'turn_runtime');
  assert.equal(calls[0].roleId, 'gameplay_narrator');
  assert.equal(calls[1].roleId, 'gameplay_narrator_format_repair');
  assert.equal(calls[1].messages[0].content.includes(repairShape), true);
  assert.equal(calls[1].messages[0].content.includes('request.visible_context'), true);
  assert.equal(calls[2].roleId, 'gameplay_narrator_auditor');
  assert.equal(calls[2].messages[0].content.includes('full narration output'), true);
  assert.equal(calls[2].messages[0].content.includes('hidden state'), true);
  assert.equal(calls[2].messages[0].content.includes('{"pass":true,"concerns":[],"evidence":["visible facts only"]}'), true);
  assert.equal(calls[2].messages[0].content.includes('{"pass":false,"concerns":[{"segment_choice":"<supplied segment choice>","kind":"unsupported_fact","reason":"<brief reason>"}],"evidence":["<brief visible-context evidence>"]}'), true);
  assert.equal(calls[2].messages[0].content.includes(
    '"segment_choice":"segment_1"'), true);
  assert.deepEqual(JSON.parse(calls[2].messages[1].content), {
    version: 1, schema: 'narration_semantic_audit_request', phase: 'initial',
    output: repairedOutput, visible_context: {
      version: 1, schema: 'visible_context_package', visible_scene: 'Двор тих.',
      visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: []
    }, style_policy: {}, segments: [{ segment_id: 's1', prose: 'Двор тих.' }]
  });
  assert.equal(calls[3].roleId, 'gameplay_narrator_semantic_repair');
  assert.equal(calls[3].messages[0].content.includes('flagged segments'), true);
  assert.equal(calls[3].messages[0].content.includes(
    'server assembles version, schema, and immutable segment_id'), true);
  assert.deepEqual(JSON.parse(calls[3].messages[1].content).segments, [{ segment_id: 's1', prose: 'Двор тих.', nearby_context: [] }]);
  assert.equal(calls[4].roleId, 'gameplay_narrator_auditor');
  assert.equal(validateNarrationOutput(repairedOutput).ok, true);
  assert.equal(calls.length, 5);
});
