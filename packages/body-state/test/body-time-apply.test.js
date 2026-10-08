import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBodyTimeEffectProposals } from '../src/index.js';

const body = (value = 10) => ({ health: value, satiety: value, energy: value });
const proposal = (metric, numerator, denominator = '1', direction = 'increase') => ({
  proposal_kind: 'body_time_effect',
  metric_changes: [{ metric, direction, amount: { numerator, denominator } }]
});

test('body-time apply aggregates exact proposals and serializes terminating decimals', () => {
  const result = applyBodyTimeEffectProposals(body(1.125), [proposal('satiety', '1', '8')]);
  assert.equal(result.ok, true);
  assert.equal(result.state_after.satiety, 1.25);
  assert.deepEqual(result.exact_changes.satiety, {
    increase: { numerator: '1', denominator: '8' },
    decrease: { numerator: '0', denominator: '1' }
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.state_after), true);
});

test('repeating rational sums are partition invariant within one application', () => {
  const thirds = Array.from({ length: 3 }, () => proposal('energy', '1', '3'));
  const partitioned = applyBodyTimeEffectProposals(body(20), thirds);
  const combined = applyBodyTimeEffectProposals(body(20), [proposal('energy', '1')]);
  assert.equal(partitioned.state_after.energy, combined.state_after.energy);
  assert.deepEqual(partitioned.exact_changes.energy.increase, { numerator: '1', denominator: '1' });
});

test('repeating fractions round to six places on either side of a half-unit', () => {
  const roundsDown = applyBodyTimeEffectProposals(body(0), [proposal('energy', '1', '2000001')]);
  const roundsUp = applyBodyTimeEffectProposals(body(0), [proposal('energy', '1', '1999999')]);
  assert.equal(roundsDown.state_after.energy, 0);
  assert.equal(roundsUp.state_after.energy, 0.000001);
  const exactHalf = applyBodyTimeEffectProposals(body(0), [proposal('energy', '1', '2000000')]);
  assert.equal(exactHalf.state_after.energy, 0);
});

test('commits every body scalar at six places with half-even rounding', () => {
  const boundedTinyDelta = applyBodyTimeEffectProposals(body(100), [
    proposal('health', '1', '200000000000000000', 'decrease')
  ]);
  assert.equal(boundedTinyDelta.state_after.health.toFixed(6), '100.000000');

  const unchanged = applyBodyTimeEffectProposals({ health: 12.5, satiety: 18.75, energy: 0 }, []);
  assert.equal(unchanged.state_after.health, 12.5);
  assert.equal(unchanged.state_after.satiety, 18.75);

  const third = applyBodyTimeEffectProposals(body(0), [proposal('energy', '1', '3')]);
  assert.equal(third.state_after.energy, 0.333333);

  const sixPlaces = applyBodyTimeEffectProposals({ health: 12.345678, satiety: 0, energy: 0 }, []);
  assert.equal(sixPlaces.state_after.health.toString(), '12.345678');
});

test('each scalar commit is within half a micro-unit of its exact aggregate', () => {
  let state = body(0);
  for (let index = 0; index < 12; index += 1) {
    const exactBefore = BigInt(Math.round(state.energy * 1_000_000));
    const result = applyBodyTimeEffectProposals(state, [proposal('energy', '1', '3')]);
    assert.equal(result.ok, true);
    const roundedAfter = BigInt(Math.round(result.state_after.energy * 1_000_000));
    const exactAfterScaled = exactBefore * 3n + 1_000_000n;
    assert.ok((roundedAfter * 3n - exactAfterScaled <= 2n) && (exactAfterScaled - roundedAfter * 3n <= 2n));
    state = result.state_after;
  }
});

test('body-time application clamps exact totals and fails closed on malformed input', () => {
  assert.equal(applyBodyTimeEffectProposals(body(99.5), [proposal('satiety', '10')]).state_after.satiety, 100);
  assert.equal(applyBodyTimeEffectProposals(body(0.5), [proposal('health', '10', '1', 'decrease')]).state_after.health, 0);
  assert.equal(applyBodyTimeEffectProposals({ ...body(), energy: Number.NaN }, []).status, 'hard_block');
  assert.equal(applyBodyTimeEffectProposals(body(), [{ proposal_kind: 'wrong', metric_changes: [] }]).status, 'hard_block');
  assert.equal(applyBodyTimeEffectProposals(body(), [proposal('energy', '1', '0')]).status, 'hard_block');
  assert.equal(applyBodyTimeEffectProposals(body(), [proposal('energy', '2', '4')]).status, 'hard_block');
});
