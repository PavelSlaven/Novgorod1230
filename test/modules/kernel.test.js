import test from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze, err, ok, sha256, stableStringify } from '@rus/kernel';

test('kernel returns explicit results', () => {
  assert.deepEqual(ok(7), { ok: true, value: 7 });
  assert.equal(err('x', 'bad').error.code, 'x');
});

test('stable digest ignores object key order', () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(sha256({ b: 2, a: 1 }), sha256({ a: 1, b: 2 }));
});

test('deepFreeze recursively freezes values', () => {
  const value = deepFreeze({ nested: { value: 1 } });
  assert.equal(Object.isFrozen(value.nested), true);
});
