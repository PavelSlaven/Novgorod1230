import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNarrationResult } from '../src/index.js';
import { approvedNarration } from './turn-workflow-fixture.js';

test('turn narration boundary rejects malformed audit and foreign prose segments', () => {
  const result = approvedNarration('turn-1', 'У ворот стоит телега.');
  result.final_audit.coverage.visible_changes = [{ source_index: 0, segment_ids: ['s1'] }];
  assert.equal(validateNarrationResult(result).ok, true);
  for (const mutate of [
    (value) => { delete value.final_audit.coverage; },
    (value) => { value.final_audit.coverage.visible_changes[0].segment_ids = ['s2']; },
    (value) => { value.final_audit.artistic_verdict = 'fail'; },
    (value) => { value.surface = 'first_game'; },
    (value) => { value.status = 'blocked'; value.pass = false; }
  ]) {
    const invalid = structuredClone(result);
    mutate(invalid);
    assert.equal(validateNarrationResult(invalid).ok, false);
  }
});
