import assert from 'node:assert/strict';
import test from 'node:test';
import { runNarrationFlow } from '../src/index.js';

const request = {
  version: 1, schema: 'narration_request', request_id: '613-diagnostic',
  surface: 'turn', visible_context: {
    version: 1, schema: 'visible_context_package', visible_scene: 'У ворот стоит телега.',
    visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
    known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: []
  }, style_policy: { no_new_world_facts: true }, max_repairs: 1
};
const output = (prose) => ({ version: 1, schema: 'narration_output',
  output_id: request.request_id, prose, action_options: [], used_references: [],
  self_check: { no_new_world_facts: true } });

test('writer format repair receives path and offending mixed-script word', async () => {
  let repairInput;
  const result = await runNarrationFlow(request, {
    writer: { async generate() { return output('У ворот стоит протoku.'); } },
    formatRepairer: { async repair(input) {
      repairInput = structuredClone(input);
      return output('У ворот стоит протоку.');
    } },
    auditor: { async audit() { return {
      version: 1, schema: 'narration_audit', artistic_verdict: 'pass',
      technical_verdict: 'pass', coverage: { visible_changes: [], uncertainties: [] },
      pass: true, concerns: [], evidence: ['Text is valid.']
    }; } },
    semanticRepairer: { async repair() {
      assert.fail('format defect must use format repair');
    } }
  });

  assert.equal(result.status, 'approved');
  assert.equal(repairInput.schema, 'narration_format_repair_request');
  assert.deepEqual(repairInput.validation_errors,
    ['$.prose contains a mixed Latin/Cyrillic word: протoku']);
});
