import assert from 'node:assert/strict';
import test from 'node:test';
import { addElapsedTime, normalizeElapsedTime } from '@rus/time-events-history';
import { bindTurnStepPreparedConsequence, buildTurnStepPreparedEffectLedger } from
  '../src/turn-step-prepared-effects.js';
import { buildTimeUpdateStage } from '../src/stages/time-update.js';
import { validateConsequencePackage } from '../src/validators.js';

function prepared(numerator = '1', denominator = '3') {
  const elapsed = normalizeElapsedTime({ exact_minutes: { numerator, denominator } });
  const before = { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' };
  const after = addElapsedTime(before, elapsed);
  const body = { health: 80, satiety: 60, energy: 40, active_conditions: [] };
  const ledger = buildTurnStepPreparedEffectLedger({
    rootTurnId: 'turn:exact:1', committedStateVersion: 3,
    effects: [{ effect: {
      step_index: 1, effect_kind: 'semantic_activity', owner_ref: 'profile:wait',
      operation_ref: 'activity:wait', availability: null,
      consequence: { duration_minutes: 1, body_effect_ref: null },
      time_update: { version: 2, schema: 'turn_time_update', owner: '@rus/time-events-history',
        clock_before: before, clock_after: after, exact_elapsed: elapsed,
        temporal_results: [{ trace: { stopped_after_current_batch: denominator !== '1' } }] },
      body_update: { version: 1, schema: 'turn_body_update', owner: '@rus/body-state',
        applied: false, proposal: null, state_after: body }, body_state_before: body,
    }, working_projection_before: { clock: before }, working_projection_after: { clock: after } }],
  });
  const unbound = { version: 1, schema: 'turn_consequence_package', status: 'resolved',
    duration_minutes: 1, visible_seed: {}, hidden_update: {}, state_changes: [], suggested_actions: [] };
  const consequence = bindTurnStepPreparedConsequence(unbound, ledger);
  const run = (value = consequence) => buildTimeUpdateStage({
    retrievedState: { clock: before }, consequence: value, preparedEffectLedger: ledger });
  return { consequence, unbound, elapsed, after, run };
}

test('prepared consequence retains exact integer and fractional time across JSON serialization', async () => {
  for (const [numerator, denominator] of [['1', '1'], ['1', '3']]) {
    const fixture = prepared(numerator, denominator);
    const copied = JSON.parse(JSON.stringify(fixture.consequence));
    assert.deepEqual(copied.prepared_effect_elapsed, fixture.elapsed);
    assert.equal(validateConsequencePackage(copied).ok, true);
    const update = await fixture.run(copied);
    assert.deepEqual(update.exact_elapsed, fixture.elapsed);
    assert.deepEqual(update.clock_after, fixture.after);
  }
});

test('exact binding accepts equivalent rational values', async () => {
  const fixture = prepared();
  const copied = structuredClone(fixture.consequence);
  copied.prepared_effect_elapsed = { exact_minutes: { numerator: '2', denominator: '6' } };
  assert.deepEqual((await fixture.run(copied)).exact_elapsed, fixture.elapsed);
});

test('exact binding rejects missing or changed elapsed, digest and numeric projection', async () => {
  const fixture = prepared();
  const variants = [
    (value) => { delete value.prepared_effect_elapsed; },
    (value) => { value.prepared_effect_elapsed.exact_minutes.denominator = '0'; },
    (value) => { value.prepared_effect_elapsed.exact_minutes.numerator = '2'; },
    (value) => { value.prepared_effect_ledger_digest = '0'.repeat(64); },
    (value) => { value.duration_minutes = 0.75; },
  ];
  for (const mutate of variants) {
    const copied = structuredClone(fixture.consequence);
    mutate(copied);
    await assert.rejects(fixture.run(copied), { code: 'TURN_STEP_PREPARED_EFFECT_INVALID' });
  }
});

test('distinct exact elapsed values with identical Number projections cannot share a binding', async () => {
  const first = prepared('9007199254740992', '27021597764222977');
  const second = prepared('9007199254740993', '27021597764222977');
  assert.equal(first.consequence.duration_minutes, second.consequence.duration_minutes,
    'the control demonstrates why numeric equality alone is insufficient');
  assert.notDeepEqual(first.elapsed, second.elapsed);
  assert.deepEqual((await first.run(JSON.parse(JSON.stringify(first.consequence)))).exact_elapsed, first.elapsed);
  const forged = structuredClone(first.consequence);
  forged.prepared_effect_elapsed = structuredClone(second.elapsed);
  await assert.rejects(first.run(forged), { code: 'TURN_STEP_PREPARED_EFFECT_INVALID' });
});

test('consequence validator requires paired, well-formed prepared metadata and preserves unprepared packages', () => {
  const fixture = prepared();
  assert.equal(validateConsequencePackage(fixture.unbound).ok, true);
  for (const mutate of [
    (value) => { delete value.prepared_effect_elapsed; },
    (value) => { delete value.prepared_effect_ledger_digest; },
    (value) => { value.prepared_effect_ledger_digest = 'invalid'; },
    (value) => { value.prepared_effect_elapsed.exact_minutes.numerator = 1; },
    (value) => { value.prepared_effect_elapsed.exact_minutes.denominator = '0'; },
  ]) {
    const copied = structuredClone(fixture.consequence);
    mutate(copied);
    assert.equal(validateConsequencePackage(copied).ok, false);
  }
});
