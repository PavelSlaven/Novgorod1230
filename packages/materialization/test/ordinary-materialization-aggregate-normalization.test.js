import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAndNormalizeOrdinaryAggregate,
  createOrdinaryAggregate,
  MaterializationError
} from '../src/index.js';

test('ordinary aggregate reload normalization reuses the aggregate validator and freezes an independent copy', () => {
  const aggregate = createOrdinaryAggregate({
    scope_ref: { entity_kind: 'g6', entity_id: 'scope-a' },
    resolution_record_cap: 1
  });
  const normalized = assertAndNormalizeOrdinaryAggregate(aggregate);
  assert.deepEqual(normalized, aggregate);
  assert.notStrictEqual(normalized, aggregate);
  assert.ok(Object.isFrozen(normalized));
  assert.throws(() => assertAndNormalizeOrdinaryAggregate({ ...aggregate, unexpected: true }), (error) => error instanceof MaterializationError && error.code === 'ORDINARY_AGGREGATE_INVALID');
});

test('ordinary aggregate boundary rejects accessors and custom prototypes without reading them', () => {
  const aggregate = createOrdinaryAggregate({
    scope_ref: { entity_kind: 'g6', entity_id: 'scope-a' },
    resolution_record_cap: 1
  });
  let reads = 0;
  const accessorAggregate = { ...aggregate };
  Object.defineProperty(accessorAggregate, 'scope_ref', {
    enumerable: true,
    get() { reads += 1; throw new Error('must not run'); }
  });
  assert.throws(() => assertAndNormalizeOrdinaryAggregate(accessorAggregate),
    { code: 'ORDINARY_AGGREGATE_INVALID' });
  assert.equal(reads, 0);
  const nestedAccessorAggregate = structuredClone(aggregate);
  Object.defineProperty(nestedAccessorAggregate.scope_ref, 'entity_kind', {
    enumerable: true,
    get() { reads += 1; throw new Error('must not run'); }
  });
  assert.throws(() => assertAndNormalizeOrdinaryAggregate(nestedAccessorAggregate),
    { code: 'ORDINARY_AGGREGATE_INVALID' });
  assert.equal(reads, 0);
  const inheritedAggregate = Object.assign(Object.create({ inherited: true }), aggregate);
  assert.throws(() => assertAndNormalizeOrdinaryAggregate(inheritedAggregate),
    { code: 'ORDINARY_AGGREGATE_INVALID' });
  const nullPrototypeAggregate = Object.assign(Object.create(null), aggregate);
  assert.deepEqual(assertAndNormalizeOrdinaryAggregate(nullPrototypeAggregate), aggregate);
});
