import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyOrdinaryAggregateTransition,
  createOrdinaryAggregate
} from '@rus/materialization';
import { applyOrdinaryAggregateToTurnWorkingProjection } from
  '../src/turn-step-ordinary-working-projection.js';

const scope_ref = { entity_kind: 'g6', entity_id: 'turn-projection-scope' };

test('turn alone applies an ordinary aggregate result to its working projection', () => {
  const initial = createOrdinaryAggregate({ scope_ref, resolution_record_cap: 3 });
  const seeded = applyOrdinaryAggregateTransition({
    aggregate: initial,
    transition: {
      kind: 'seed', request_identity: 'seed-request', expected_state_version: 0,
      density_band: 'ordinary', identity_budget: 1, background_groups: []
    }
  });
  const working = { position_ref: 'position-a', retained: { value: true } };
  const projected = applyOrdinaryAggregateToTurnWorkingProjection({
    working_projection: working,
    ordinary_aggregate: seeded
  });
  assert.equal(projected.position_ref, 'position-a');
  assert.deepEqual(projected.retained, { value: true });
  assert.equal(projected.ordinary_materialization_aggregate.state_version, 1);
  assert.notStrictEqual(projected.ordinary_materialization_aggregate, seeded);
  assert.ok(Object.isFrozen(projected));
  assert.ok(Object.isFrozen(projected.ordinary_materialization_aggregate));
  assert.equal(Object.hasOwn(projected, 'schema'), false);
});

test('ordinary working-projection hook accepts only detached validated results', () => {
  const aggregate = createOrdinaryAggregate({ scope_ref, resolution_record_cap: 1 });
  assert.throws(() => applyOrdinaryAggregateToTurnWorkingProjection({
    working_projection: {}, ordinary_aggregate: { ...aggregate, state_version: 5 }
  }), { code: 'ORDINARY_AGGREGATE_INVALID' });
  assert.throws(() => applyOrdinaryAggregateToTurnWorkingProjection({
    working_projection: {}, ordinary_aggregate: aggregate, extra: true
  }), { code: 'TURN_ORDINARY_WORKING_PROJECTION_INPUT_INVALID' });
  let reads = 0; const hostile = {};
  Object.defineProperty(hostile, 'working_projection', {
    enumerable: true, get() { reads += 1; return {}; }
  });
  Object.defineProperty(hostile, 'ordinary_aggregate', {
    enumerable: true, value: aggregate
  });
  assert.throws(() => applyOrdinaryAggregateToTurnWorkingProjection(hostile),
    { code: 'TURN_ORDINARY_WORKING_PROJECTION_INPUT_INVALID' });
  assert.equal(reads, 0);
});
