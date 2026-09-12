import assert from 'node:assert/strict';
import test from 'node:test';
import { spatialResult } from '../src/stages/narration.js';

test('non-movement action does not become narrator scene material', () => {
  assert.deepEqual(spatialResult({ retrievedState: { position: {
    location_ref: 'camp' } }, consequence: { movement: null } }), {

  });
});

test('narrator receives the committed check degree without RNG internals', () => {
  const outcome = spatialResult({ checks: { results: [{
    check_id: 'check-1', outcome: { band: 'success_with_cost', margin: -2,
      success: false, cost_required: true, severe_failure: false,
      roll_note: null }
  }] }, modeResolution: { decision_trace: { step_traces: [{
    check_binding: { check_id: 'check-1' }, approved_plan: {
      interpretation: { grounded_attempt: 'перепрыгнуть канаву' }
    }
  }] } } });
  assert.deepEqual(outcome, { check_outcomes: [{ ordinal: 1,
    action: 'перепрыгнуть канаву', band: 'success_with_cost', margin: -2,
    success: false, cost_required: true, severe_failure: false,
    roll_note: null }] });
  assert.doesNotMatch(JSON.stringify(outcome),
    /"roll"|difficulty|audit|seed/u);
});

test('narrator distinguishes a grounded qualitative assessment from scene observation', () => {
  assert.deepEqual(spatialResult({ modeResolution: { decision_trace: { step_traces: [{
    applied: true, approved_plan: { resolution: 'direct',
      direct_result_kind: 'player_safe_observation', assessment: {
        text: 'Укрытие сейчас важнее.', support_refs: ['claim:cold']
      } }
  }] } } }), { qualitative_assessment: true });
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
