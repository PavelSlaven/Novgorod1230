import assert from 'node:assert/strict';
import test from 'node:test';
import { createTraceRouteBodyEffect } from '../src/runtime/lower-dvina-trace-route-body-effects.js';

const exact = (id, minutes, deltas, outcomes) => ({
  effect_profile_id: id, elapsed_minutes: minutes, exact_deltas: deltas,
  condition_outcomes: outcomes, selection_policy: 'fixed_approved_effect',
  rng_consumption: 'forbidden'
});

const conditions = () => [
  { storage_condition_id: 'wet', id: 'wet', condition_profile_ref: { state: 'wet' }, state_version: 1 },
  { storage_condition_id: 'cold', id: 'mild_shivering', condition_profile_ref: { state: 'mild_shivering' }, state_version: 1 },
  { storage_condition_id: 'bruise', id: 'shoulder_bruise', condition_profile_ref: { state: 'shoulder_bruise' }, state_version: 1 }
];

test('exact approved route effects preserve canonical body continuity into Phase 6', () => {
  const phase3 = exact('trace_ld_v1_body_open_route_8m', 8,
    { health: -1, satiety: -1, energy: -1 }, [
      { from: 'wet', to: 'wet', outcome: 'persists' },
      { from: 'mild_shivering', to: 'strong_shivering', outcome: 'worsens' }
    ]);
  const phase4 = exact('trace_ld_v1_body_open_route_12m', 12,
    { health: 0, satiety: -1, energy: -1 }, [
      { from: 'wet', to: 'wet', outcome: 'persists' },
      { from: 'strong_shivering', to: 'strong_shivering', outcome: 'persists' }
    ]);
  const effect = createTraceRouteBodyEffect({
    phase2BodyEffect: { apply: () => assert.fail('route must not delegate') },
    phase3Contracts: { routeBodyEffect: phase3 }, phase4Contracts: { routeBodyEffect: phase4 }
  });
  const initial = { health: 80, satiety: 60, energy: 39, active_conditions: conditions() };
  const afterCamp = effect.apply(input('phase3_kind', initial, 8));
  const afterShed = effect.apply(input('phase4_kind', afterCamp.state_after, 12));
  assert.deepEqual([afterShed.state_after.health, afterShed.state_after.energy, afterShed.state_after.satiety], [79, 37, 58]);
  assert.deepEqual(afterShed.state_after.active_conditions.map(({ id }) => id), ['wet', 'strong_shivering', 'shoulder_bruise']);
  assert.equal(afterShed.proposal.rng_consumption, 'forbidden');
});

test('route without an approved effect leaves body state untouched', () => {
  const effect = createTraceRouteBodyEffect({ phase2BodyEffect: {
    apply: () => assert.fail('route must not receive a retroactive Phase 2 charge') },
    phase3Contracts: { routeBodyEffect: null }, phase4Contracts: null });
  const value = input('phase3_kind', { health: 80, satiety: 38, energy: 60, active_conditions: conditions() }, 8);
  assert.deepEqual(effect.apply(value), { owner: '@rus/body-state', applied: false,
    proposal: null, state_after: value.committed_state.body_state });
});

function input(kind, bodyState, minutes) {
  return {
    consequence: { [kind]: 'movement', activity_attempt_id: `attempt:${minutes}` },
    committed_state: { body_state: bodyState },
    time_update: { exact_elapsed: { exact_minutes: { numerator: String(minutes), denominator: '1' } } }
  };
}
