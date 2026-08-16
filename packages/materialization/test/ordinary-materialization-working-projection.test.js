import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createOrdinaryAggregate,
  createOrdinaryMaterializationWorkingProjection,
  refreshOrdinaryMaterializationWorkingProjection
} from '../src/index.js';

const scope_ref = { entity_kind: 'g6', entity_id: 'projection-scope' };

test('ordinary working projection accepts only a validated aggregate and returns immutable copies', () => {
  const aggregate = createOrdinaryAggregate({ scope_ref, resolution_record_cap: 3 });
  const projection = createOrdinaryMaterializationWorkingProjection({
    ordinary_aggregate: aggregate
  });
  assert.deepEqual(Object.keys(projection), ['schema', 'ordinary_aggregate']);
  assert.equal(projection.schema, 'ordinary_materialization_working_projection_v1');
  assert.notStrictEqual(projection.ordinary_aggregate, aggregate);
  assert.ok(Object.isFrozen(projection));
  assert.ok(Object.isFrozen(projection.ordinary_aggregate));
  assert.throws(() => createOrdinaryMaterializationWorkingProjection({
    ordinary_aggregate: { ...aggregate, identity_budget: 'invalid' }
  }), { code: 'ORDINARY_AGGREGATE_INVALID' });
  assert.throws(() => createOrdinaryMaterializationWorkingProjection({
    ordinary_aggregate: aggregate,
    extra: true
  }), { code: 'ORDINARY_WORKING_PROJECTION_CREATE_INPUT_INVALID' });
  let reads = 0;
  const accessorInput = {};
  Object.defineProperty(accessorInput, 'ordinary_aggregate', {
    enumerable: true,
    get() { reads += 1; throw new Error('must not run'); }
  });
  assert.throws(() => createOrdinaryMaterializationWorkingProjection(accessorInput),
    { code: 'ORDINARY_WORKING_PROJECTION_CREATE_INPUT_INVALID' });
  assert.equal(reads, 0);
});

test('ordinary working projection refresh reduces exact transitions and has no runtime wiring', async () => {
  const aggregate = createOrdinaryAggregate({ scope_ref, resolution_record_cap: 3 });
  const projection = createOrdinaryMaterializationWorkingProjection({ ordinary_aggregate: aggregate });
  const seed = {
    kind: 'seed', request_identity: 'seed-request', expected_state_version: 0,
    density_band: 'ordinary', identity_budget: 1, background_groups: []
  };
  const seeded = refreshOrdinaryMaterializationWorkingProjection({
    working_projection: projection,
    ordinary_transition: seed
  });
  assert.equal(seeded.ordinary_aggregate.state_version, 1);
  assert.equal(seeded.ordinary_aggregate.last_committed_request_identity, 'seed-request');
  const resolve = {
    kind: 'resolve_presence', request_identity: 'resolve-request', expected_state_version: 1,
    resolution_ref: 'resolution-a', candidate_key: 'candidate-a', coverage_key: 'coverage-a',
    category_key: 'category-a', context_version: 'context-a', resolution: 'absent'
  };
  const resolved = refreshOrdinaryMaterializationWorkingProjection({
    working_projection: seeded,
    ordinary_transition: resolve
  });
  assert.equal(resolved.ordinary_aggregate.state_version, 2);
  assert.equal(resolved.ordinary_aggregate.presence_resolutions.length, 1);
  const replayed = refreshOrdinaryMaterializationWorkingProjection({
    working_projection: resolved,
    ordinary_transition: resolve
  });
  assert.deepEqual(replayed, resolved);
  assert.throws(() => refreshOrdinaryMaterializationWorkingProjection({
    working_projection: seeded,
    ordinary_transition: { ...resolve, expected_state_version: 0 }
  }), { code: 'ORDINARY_AGGREGATE_STATE_STALE' });
  assert.throws(() => refreshOrdinaryMaterializationWorkingProjection({
    working_projection: projection,
    ordinary_aggregate: aggregate
  }), { code: 'ORDINARY_WORKING_PROJECTION_REFRESH_INPUT_INVALID' });
  const inheritedInput = Object.assign(Object.create({ inherited: true }), {
    working_projection: projection,
    ordinary_transition: seed
  });
  assert.throws(() => refreshOrdinaryMaterializationWorkingProjection(inheritedInput),
    { code: 'ORDINARY_WORKING_PROJECTION_REFRESH_INPUT_INVALID' });
  assert.throws(() => refreshOrdinaryMaterializationWorkingProjection({
    working_projection: projection,
    ordinary_transition: seed,
    extra: true
  }), { code: 'ORDINARY_WORKING_PROJECTION_REFRESH_INPUT_INVALID' });
  const source = await readFile(new URL('../src/ordinary-materialization-working-projection.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /@rus\/turn|apps\/game-server|lower-dvina/i);
});
