import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateNarrationAudit, validateNarrationFlowResult, validateNarrationOutput,
  validateNarrationRequest, validateNarrationSemanticRepair
} from '../src/index.js';

const output = { version: 1, schema: 'narration_output', output_id: 'turn-1',
  prose: 'У ворот видна телега.', action_options: [], used_references: [], self_check: {} };
const audit = { version: 1, schema: 'narration_audit', pass: true,
  artistic_verdict: 'pass', technical_verdict: 'pass',
  coverage: { visible_changes: [], uncertainties: [] }, concerns: [], evidence: ['Телега дана в контексте.'] };
const approved = { version: 1, schema: 'narration_flow_result', request_id: 'turn-1',
  surface: 'turn', status: 'approved', pass: true, approved_output: output, final_audit: audit,
  generation_history: [], audit_history: [], repair_history: [] };

test('public narration rejects coerced strings and nonexact enums at the approved boundary', () => {
  assert.equal(validateNarrationFlowResult(approved).ok, true);
  for (const mutate of [
    (value) => { value.surface = 'first_game '; },
    (value) => { value.surface = ['turn']; },
    (value) => { value.status = 'approved '; },
    (value) => { value.approved_output.prose = { text: output.prose }; },
    (value) => { value.request_id = ['turn-1']; }
  ]) {
    const value = structuredClone(approved);
    mutate(value);
    assert.equal(validateNarrationFlowResult(value).ok, false);
  }
  const value = structuredClone(approved);
  value.approved_output.prose = { toString() { throw new Error('must not coerce prose'); } };
  assert.equal(validateNarrationFlowResult(value).ok, false);
  for (const prose of [null, 42, [output.prose], { text: output.prose }]) {
    assert.equal(validateNarrationOutput({ ...output, prose }).ok, false);
  }
  assert.equal(validateNarrationRequest({ version: 1, schema: 'narration_request',
    request_id: { id: 'turn-1' }, surface: 'turn', visible_context: {} }).ok, false);
});

test('public audit and repair text stays typed and placeholder evidence cannot approve', () => {
  const failed = { ...audit, pass: false, concerns: [
    { segment_id: 's1', kind: 'unsupported_fact', reason: 'Не дано в контексте.' }
  ] };
  assert.equal(validateNarrationAudit(failed, ['s1']).ok, true);
  for (const mutate of [
    (value) => { value.artistic_verdict = ['fail']; },
    (value) => { value.artistic_verdict = 'fail '; },
    (value) => { value.technical_verdict = ['pass']; },
    (value) => { value.concerns[0].reason = { finding: 'Нет основания.' }; },
    (value) => { value.concerns[0].kind = ['unsupported_fact']; },
    (value) => { value.concerns[0].segment_id = ['s1']; }
  ]) {
    const value = structuredClone(failed);
    mutate(value);
    assert.equal(validateNarrationAudit(value, ['s1']).ok, false);
  }
  for (const entry of [42, null, ['Grounded.'], { finding: 'Grounded.' },
    '<specific audit finding>', '<insert a grounded finding>', '  <>  ']) {
    assert.equal(validateNarrationAudit({ ...audit, evidence: [entry] }).ok, false);
  }
  const repair = { version: 1, schema: 'narration_semantic_repair',
    replacements: [{ segment_id: 's1', prose: '' }] };
  assert.equal(validateNarrationSemanticRepair(repair, ['s1']).ok, true);
  repair.replacements[0].segment_id = ['s1'];
  assert.equal(validateNarrationSemanticRepair(repair, ['s1']).ok, false);
});
