import test from 'node:test';
import assert from 'node:assert/strict';
import { attributeBonus, createSeededRandomSource, evaluateCheckOutcome, executeCheck } from '../src/index.js';

test('checks-rng uses injected deterministic source and canonical formula', () => {
  assert.equal(attributeBonus(14), 2);
  const a = executeCheck({ check_id:'c', attribute_value:14, skill_bonus:3, difficulty:10 }, createSeededRandomSource('seed'));
  const b = executeCheck({ check_id:'c', attribute_value:14, skill_bonus:3, difficulty:10 }, createSeededRandomSource('seed'));
  assert.equal(a.roll, b.roll);
  assert.equal(a.total, a.roll + 5);
  assert.equal(evaluateCheckOutcome(10, 5, 15).band, 'severe_failure');
});
