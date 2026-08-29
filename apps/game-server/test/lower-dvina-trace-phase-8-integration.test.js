import assert from 'node:assert/strict';
import test from 'node:test';
import { createTracePhase8Runtime } from
  '../src/runtime/lower-dvina-trace-phase-8-runtime.js';
import { bundle } from './lower-dvina-trace-phase-8-integration-helpers.js';

export { actorIds, combatPlan, phase8CampState, phase8Plan } from
  './lower-dvina-trace-phase-8-integration-helpers.js';

test('revision 16 does not construct Phase 8 before an escort commits', () => {
  assert.equal(createTracePhase8Runtime({
    state: { route_participant_commitments: [] }, bundle
  }), null);
});
