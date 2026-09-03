import assert from 'node:assert/strict';
import test from 'node:test';
import { spatialResult } from '../src/stages/narration.js';

test('non-movement action does not become narrator scene material', () => {
  assert.deepEqual(spatialResult({ retrievedState: { position: {
    location_ref: 'camp' } }, consequence: { movement: null } }), {

  });
});

test('spatial result recognizes committed active movement shapes', () => {
  for (const consequence of [
    { movement: { destination: { location_ref: 'shed' } } },
    { movement: { destination_location_ref: 'shed' } },
    { phase9: { movement: { destination: { location_ref: 'shed' } } } }
  ]) assert.deepEqual(spatialResult({ retrievedState: { position: {
    location_ref: 'camp' } }, consequence }), {
    movement_committed: true
  });
});

test('spatial result recognizes replayed committed movement from its source', () => {
  assert.deepEqual(spatialResult({ consequence: { movement: {
    source: { location_ref: 'camp' },
    destination: { location_ref: 'shed' }
  } } }), { movement_committed: true });
  assert.deepEqual(spatialResult({ consequence: { movement: {
    source_location_ref: 'camp', destination_location_ref: 'shed'
  } } }), { movement_committed: true });
});
