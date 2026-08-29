import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNarrationOutput } from '@rus/narration';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

test('narration wires writer, audit, and targeted semantic repair roles', async () => {
  const calls = [];
  const repairedOutput = { version: 1, schema: 'narration_output', output_id: 'narration-1', prose: 'Двор тих.', action_options: [], used_references: [], self_check: {} };
  const narration = createLowerDvinaTraceNarrationService({
    roleRunner: { async run(call) {
      calls.push(call);
      return { output: call.role_id === 'gameplay_narrator'
        ? {}
        : call.role_id === 'gameplay_narrator_format_repair'
          ? repairedOutput
          : call.role_id === 'gameplay_narrator_auditor'
            ? calls.filter(({ role_id }) => role_id === 'gameplay_narrator_auditor').length === 1
              ? { version: 1, schema: 'narration_audit', pass: false, concerns: [{ segment_id: 's1', kind: 'unsupported_fact', reason: 'Не подтверждено.' }], evidence: ['Нет в visible_context.'] }
              : { version: 1, schema: 'narration_audit', pass: true, concerns: [], evidence: ['Подтверждено.'] }
            : call.role_id === 'gameplay_narrator_semantic_repair'
              ? { version: 1, schema: 'narration_semantic_repair', replacements: [{ segment_id: 's1', prose: 'Двор тих.' }] }
              : null };
    } }
  });
  await narration.run({
    version: 1, schema: 'narration_request', request_id: 'narration-1',
    surface: 'turn', visible_context: {
      version: 1, schema: 'visible_context_package', visible_scene: 'Двор тих.',
      visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: []
    }
  });
  const shape = '{"version":1,"schema":"narration_output","output_id":"<request_id>","prose":"<visible-only prose>","action_options":[],"used_references":[],"self_check":{}}';
  const repairShape = shape.replace('<request_id>', '<request.request_id>');
  assert.equal(calls[0].messages[0].content.includes(shape), true);
  assert.equal(calls[0].messages[0].content.includes('Copy request_id exactly into output_id'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'context.player_input only to understand attempted action or speech'), true);
  assert.equal(calls[0].messages[0].content.includes(
    'never evidence of success or a new world fact'), true);
  assert.equal(calls[0].scope, 'turn_runtime');
  assert.equal(calls[0].role_id, 'gameplay_narrator');
  assert.equal(calls[1].role_id, 'gameplay_narrator_format_repair');
  assert.equal(calls[1].messages[0].content.includes(repairShape), true);
  assert.equal(calls[1].messages[0].content.includes('request.visible_context'), true);
  assert.equal(calls[2].role_id, 'gameplay_narrator_auditor');
  assert.equal(calls[2].messages[0].content.includes('full narration output'), true);
  assert.equal(calls[2].messages[0].content.includes('hidden state'), true);
  assert.equal(calls[2].messages[0].content.includes('{"version":1,"schema":"narration_audit","pass":true,"concerns":[],"evidence":["visible facts only"]}'), true);
  assert.equal(calls[2].messages[0].content.includes('{"version":1,"schema":"narration_audit","pass":false,"concerns":[{"segment_id":"<supplied segment_id>","kind":"unsupported_fact","reason":"<brief reason>"}],"evidence":["<brief visible-context evidence>"]}'), true);
  assert.deepEqual(JSON.parse(calls[2].messages[1].content), {
    version: 1, schema: 'narration_semantic_audit_request', phase: 'initial',
    output: repairedOutput, visible_context: {
      version: 1, schema: 'visible_context_package', visible_scene: 'Двор тих.',
      visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: []
    }, style_policy: {}, segments: [{ segment_id: 's1', prose: 'Двор тих.' }]
  });
  assert.equal(calls[3].role_id, 'gameplay_narrator_semantic_repair');
  assert.equal(calls[3].messages[0].content.includes('flagged segments'), true);
  assert.equal(calls[3].messages[0].content.includes('Keep every supplied segment_id immutable'), true);
  assert.deepEqual(JSON.parse(calls[3].messages[1].content).segments, [{ segment_id: 's1', prose: 'Двор тих.', nearby_context: [] }]);
  assert.equal(calls[4].role_id, 'gameplay_narrator_auditor');
  assert.equal(validateNarrationOutput(repairedOutput).ok, true);
  assert.equal(calls.length, 5);
});
