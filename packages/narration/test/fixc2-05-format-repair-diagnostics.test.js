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

function portsFor(writerText, {
  formatRepair = async () => output('У ворот стоит телега.'),
  semanticRepair = async () => ({ version: 1, schema: 'narration_semantic_repair',
    replacements: [{ segment_id: 's1', prose: 'У ворот стоит телега.' }] })
} = {}) {
  return {
    writer: { async generate() { return output(writerText); } },
    formatRepairer: { async repair(input) { return formatRepair(input); } },
    auditor: { async audit() { return {
      version: 1, schema: 'narration_audit', artistic_verdict: 'pass',
      technical_verdict: 'pass', coverage: { visible_changes: [], uncertainties: [] },
      pass: true, concerns: [], evidence: ['Text is valid.']
    }; } },
    semanticRepairer: { async repair() { return semanticRepair(); } }
  };
}

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

test('writer homoglyphs normalize before output validation', async () => {
  let formatRepairCalls = 0;
  const result = await runNarrationFlow(request, portsFor('У ворот стоит телегa.', {
    formatRepair: async () => { formatRepairCalls += 1; return output('У ворот стоит телега.'); }
  }));

  assert.equal(result.status, 'approved');
  assert.equal(formatRepairCalls, 0);
  assert.equal(result.approved_output.prose, 'У ворот стоит телега.');
  assert.equal(result.generation_history[0].value.prose, 'У ворот стоит телега.');
});

test('non-homoglyph mixed script still gets one format repair', async () => {
  let formatRepairCalls = 0;
  const result = await runNarrationFlow(request, portsFor('У ворот стоит протoku.', {
    formatRepair: async () => { formatRepairCalls += 1; return output('У ворот стоит телега.'); }
  }));

  assert.equal(formatRepairCalls, 1);
  assert.equal(result.status, 'approved');
});

test('format repair homoglyphs normalize before output validation and history', async () => {
  const result = await runNarrationFlow(request, portsFor('У ворот стоит протoku.', {
    formatRepair: async () => output('У ворот стоит телегa.')
  }));

  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, 'У ворот стоит телега.');
  assert.equal(result.generation_history[1].value.prose, 'У ворот стоит телега.');
  assert.equal(result.repair_history[0].value.prose, 'У ворот стоит телега.');
});

test('pure Latin prose stays unchanged', async () => {
  const result = await runNarrationFlow(request, portsFor('У ворот стоит Linux.'));

  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, 'У ворот стоит Linux.');
});

test('semantic repair homoglyphs normalize before reassembled output validation', async () => {
  let admissionCalls = 0;
  const result = await runNarrationFlow(request, portsFor('У ворот стоит телега.', {
    semanticRepair: async () => ({ version: 1, schema: 'narration_semantic_repair',
      replacements: [{ segment_id: 's1', prose: 'У ворот стоит телегa.' }] })
  }), { outputAdmission: () => admissionCalls++ === 0
    ? { category: 'test_admission' } : null });

  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, 'У ворот стоит телега.');
  assert.equal(result.generation_history[1].value.replacements[0].prose, 'У ворот стоит телега.');
});
