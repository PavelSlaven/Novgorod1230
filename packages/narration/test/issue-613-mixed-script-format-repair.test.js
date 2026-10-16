import test from 'node:test';
import assert from 'node:assert/strict';

import { runNarrationFlow } from '../src/index.js';

function request() {
  return {
    version: 1,
    schema: 'narration_request',
    request_id: 'turn:party-1:1',
    surface: 'turn',
    visible_context: {
      version: 1,
      schema: 'visible_context_package',
      visible_scene: 'У ворот стоит телега.',
      visible_changes: [],
      sensory_details: [],
      visible_npc: [],
      visible_objects: [],
      known_context: [],
      uncertainties: [],
      allowed_tensions: [],
      do_not_imply: []
    },
    style_policy: { no_new_world_facts: true }
  };
}

function output(prose) {
  return {
    version: 1,
    schema: 'narration_output',
    output_id: 'turn:party-1:1',
    prose,
    action_options: [],
    used_references: [],
    self_check: { no_new_world_facts: true }
  };
}

function ports(writerProse, counts) {
  return {
    writer: { async generate() { return output(writerProse); } },
    formatRepairer: { async repair(input) {
      counts.format += 1;
      assert.equal(input.schema, 'narration_format_repair_request');
      assert.equal(input.invalid_output.prose, writerProse);
      assert.ok(input.validation_errors.length > 0);
      return output('У ворот стоит телега.');
    } },
    auditor: { async audit() {
      counts.audit += 1;
      return {
        version: 1,
        schema: 'narration_audit',
        artistic_verdict: 'pass',
        technical_verdict: 'pass',
        coverage: { visible_changes: [], uncertainties: [] },
        pass: true,
        concerns: [],
        evidence: ['Grounded.']
      };
    } },
    semanticRepairer: { async repair() {
      counts.semantic += 1;
      assert.fail('format defect must not be routed to semantic repair');
    } }
  };
}

for (const mixedWord of ['протoku']) {
  test(`routes mixed-script word ${mixedWord} through format repair`, async () => {
    const counts = { format: 0, semantic: 0, audit: 0 };
    const result = await runNarrationFlow(request(), ports(`У ворот было ${mixedWord}.`, counts));

    assert.equal(counts.format, 1);
    assert.equal(counts.semantic, 0);
    assert.equal(counts.audit, 1);
    assert.equal(result.status, 'approved');
    assert.equal(result.repair_history[0].role, 'format_repair');
    assert.equal(result.approved_output.prose, 'У ворот стоит телега.');
  });
}

test('normalizes homoglyph-only mixed word дeрево in code without format repair', async () => {
  const counts = { format: 0, semantic: 0, audit: 0 };
  const calls = [];
  const testPorts = ports('У ворот было дeрево.', counts);
  for (const [role, method] of [
    ['formatRepairer', 'repair'], ['auditor', 'audit'], ['semanticRepairer', 'repair']
  ]) {
    const original = testPorts[role][method];
    testPorts[role][method] = async (input) => {
      calls.push({ role, input: structuredClone(input) });
      return original(input);
    };
  }
  const result = await runNarrationFlow(request(), testPorts);

  assert.equal(counts.format, 0);
  assert.equal(counts.semantic, 0);
  assert.equal(counts.audit, 1);
  assert.equal(result.status, 'approved');
  assert.deepEqual(result.repair_history, []);
  assert.equal(result.approved_output.prose, 'У ворот было дерево.');
  assert.match(result.approved_output.prose, /дерево/u);
  assert.doesNotMatch(result.approved_output.prose, /дeрево/u);
  assert.deepEqual(calls.map((call) => call.role), ['auditor']);
  assert.equal(calls[0].input.output.prose, 'У ворот было дерево.');
  assert.ok(calls.every((call) => !JSON.stringify(call.input).includes('дeрево')),
    'the mixed-script word must not reach any port after the writer');
});

test('does not repair clean Russian prose or schema-allowed Latin words', async () => {
  for (const prose of ['У ворот неподвижно стоит телега.', 'У ворот стоит Erik.']) {
    const counts = { format: 0, semantic: 0, audit: 0 };
    const result = await runNarrationFlow(request(), ports(prose, counts));

    assert.equal(counts.format, 0);
    assert.equal(counts.semantic, 0);
    assert.equal(counts.audit, 1);
    assert.equal(result.status, 'approved');
    assert.equal(result.approved_output.prose, prose);
    assert.equal(result.repair_history.length, 0);
  }
});
