import assert from 'node:assert/strict';
import test from 'node:test';
import { spatialResult } from '../src/stages/narration.js';

test('spatial result does not invent movement without a committed destination', () => {
  assert.deepEqual(spatialResult({ retrievedState: { position: {
    location_ref: 'camp' } }, consequence: { movement: null } }), {
    position_changed: false, current_location_ref: 'camp'
  });
});

test('spatial result recognizes committed active movement shapes', () => {
  for (const consequence of [
    { movement: { destination: { location_ref: 'shed' } } },
    { movement: { destination_location_ref: 'shed' } },
    { phase9: { movement: { destination: { location_ref: 'shed' } } } }
  ]) assert.deepEqual(spatialResult({ retrievedState: { position: {
    location_ref: 'camp' } }, consequence }), {
    position_changed: true, current_location_ref: 'shed'
  });
});
