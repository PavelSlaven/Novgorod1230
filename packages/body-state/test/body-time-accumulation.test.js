import assert from 'node:assert/strict';
import test from 'node:test';
import { accumulateBodyTimeEffects, applyBodyTimeEffectProposals } from '../src/index.js';

const body = (value = 70, active_conditions = []) => ({
  health: value, satiety: value, energy: value, active_conditions
});
const elapsed = (numerator, denominator = '1') => ({ numerator, denominator });
const proposal = (metric, direction, numerator, denominator = '1') => ({
  proposal_kind: 'body_time_effect',
  metric_changes: [{ metric, direction, amount: elapsed(numerator, denominator) }]
});
const slice = (exact_elapsed, component_proposals, fixed_effect_proposals = []) => ({
  exact_elapsed, component_proposals, fixed_effect_proposals
});

test('root body accumulation stays exact across slices and rounds only its scalar outputs', () => {
  const oneMinuteSlices = Array.from({ length: 7 }, () =>
    slice(elapsed('1'), [proposal('satiety', 'decrease', '5', '216')]));
  const sevenMinuteSlice = [slice(elapsed('7'), [
    proposal('satiety', 'decrease', '35', '216')
  ])];
  const split = accumulateBodyTimeEffects({ body_state_before: body(), slices: oneMinuteSlices });
  const whole = accumulateBodyTimeEffects({ body_state_before: body(), slices: sevenMinuteSlice });

  assert.equal(split.ok, true);
  assert.equal(split.slice_results.length, 7);
  assert.equal(split.slice_results[0].state_after.satiety, 69.976852);
  assert.deepEqual(split.slice_results.at(-1).exact_state_after.satiety,
    { numerator: '15085', denominator: '216' });
  assert.deepEqual(split.state_after, whole.state_after);
  assert.deepEqual(split.exact_state_after, whole.exact_state_after);
  assert.deepEqual(split.exact_changes, whole.exact_changes);
});

test('root accumulation preserves half-even rounding and clips after each ordered slice', () => {
  const halfEven = accumulateBodyTimeEffects({ body_state_before: body(0),
    slices: [slice(elapsed('1'), [proposal('energy', 'increase', '1', '2000000')])] });
  assert.equal(halfEven.state_after.energy, 0);
  assert.deepEqual(halfEven.exact_state_after.energy,
    { numerator: '1', denominator: '2000000' });

  const decreaseThenIncrease = accumulateBodyTimeEffects({ body_state_before: body(0),
    slices: [
      slice(elapsed('1'), [proposal('energy', 'decrease', '1')]),
      slice(elapsed('1'), [proposal('energy', 'increase', '1')])
    ] });
  const increaseThenDecrease = accumulateBodyTimeEffects({ body_state_before: body(0),
    slices: [
      slice(elapsed('1'), [proposal('energy', 'increase', '1')]),
      slice(elapsed('1'), [proposal('energy', 'decrease', '1')])
    ] });
  assert.equal(decreaseThenIncrease.state_after.energy, 1);
  assert.equal(increaseThenDecrease.state_after.energy, 0);
});

test('zero-time fixed event keeps its approved metric and condition transition', () => {
  const fixed = {
    profile_ref: 'fixed:test',
    profile_pin: { artifact_id: 'fixed-test', revision: 1, digest: 'a'.repeat(64) },
    selected_context: { kind: 'semantic_activity', duration_class: 'moment', effort: 'none' },
    exact_deltas: { health: -2, satiety: 0, energy: 0 },
    condition_transitions: [{ from: 'steady', to: 'hurt', outcome: 'injured' }],
    selection_policy: 'fixed_approved_effect', rng_consumption: 'forbidden'
  };
  const result = accumulateBodyTimeEffects({ body_state_before: {
    ...body(20, [{ id: 'steady', effect: 'well', cause: 'test' }])
  }, slices: [slice(elapsed('0'), [], [fixed])] });
  assert.equal(result.ok, true);
  assert.equal(result.state_after.health, 18);
  assert.deepEqual(result.state_after.active_conditions, [
    { id: 'hurt', effect: 'injured', cause: 'fixed:test' }
  ]);
  assert.deepEqual(result.exact_changes.health, {
    increase: elapsed('0'), decrease: elapsed('0')
  });
});

test('legacy one-interval apply delegates without changing scalar output', () => {
  const changes = [proposal('energy', 'decrease', '1', '3')];
  const legacy = applyBodyTimeEffectProposals(body(), changes);
  const accumulated = accumulateBodyTimeEffects({ body_state_before: body(),
    slices: [slice(elapsed('0'), changes)] });
  assert.deepEqual(legacy.state_after, accumulated.state_after);
  assert.deepEqual(legacy.exact_changes, accumulated.exact_changes);
});

test('exact prefix state can seed the next accumulator call without rounding loss', () => {
  const first = slice(elapsed('1'), [proposal('satiety', 'decrease', '5', '216')]);
  const next = slice(elapsed('1'), [proposal('satiety', 'decrease', '5', '216')]);
  const prefix = accumulateBodyTimeEffects({ body_state_before: body(), slices: [first] });
  const continued = accumulateBodyTimeEffects({
    body_state_before: prefix.exact_state_after, slices: [next]
  });
  const oneRoot = accumulateBodyTimeEffects({
    body_state_before: body(), slices: [first, next]
  });

  assert.deepEqual(continued.exact_state_after, oneRoot.exact_state_after);
  assert.deepEqual(continued.state_after, oneRoot.state_after);
});
