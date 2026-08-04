import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertBodyCommitted,
  commit,
  minutesBetween,
  routeBoundaryScenario,
  routeDirectScenario,
  submit
} from './lower-dvina-trace-turn-step-route-fixture.js';

test('revision 13 route then direct semantic activity commits one ordered t9 root',
  async () => {
    const scenario = await routeDirectScenario();
    const { semantic, input, first, writePlan, factual } = scenario;
    const ledger = factual.time_update.prepared_effect_ledger;
    assert.equal(semantic.turnStepCount(), 2);
    assert.deepEqual(ledger.slices.map(({ step_index: stepIndex }) => stepIndex),
      [1, 2]);
    assert.equal(factual.consequence.duration_minutes, 9);
    assert.equal(minutesBetween(factual.time_update.clock_before,
      factual.time_update.clock_after), 9);

    const plans = [];
    await commit(writePlan, scenario, plans);
    assert.equal(plans.length, 1);
    const snapshot = plans[0].inserts.find(
      ({ target_table: table }) => table === 'party_state_snapshots')
      .record.state_payload;
    assert.equal(minutesBetween(factual.time_update.clock_before,
      snapshot.route_history.at(-1).ended_at), 8);
    assert.deepEqual(snapshot.clock, factual.time_update.clock_after);
    assertBodyCommitted(snapshot.body_state, factual.body_update.state_after);
    const direct = snapshot.turn_step_activity_history.at(-1);
    assert.equal(minutesBetween(factual.time_update.clock_before,
      direct.owner_resolution.execution.started_at), 8);
    assert.equal(minutesBetween(factual.time_update.clock_before,
      direct.owner_resolution.execution.ended_at), 9);

    const replayed = await submit(semantic, input);
    assert.deepEqual(replayed, first);
    assert.equal(semantic.turnStepCount(), 2);
    assert.equal(semantic.commitCount(), 1);
  });

test('route-only commit preserves one exact deferred second-step boundary',
  async (t) => {
    for (const resolution of ['domain_request', 'generic_check']) {
      await t.test(resolution, async () => {
        const scenario = await routeBoundaryScenario(resolution);
        const { semantic, writePlan, factual } = scenario;
        const ledger = factual.time_update.prepared_effect_ledger;
        const traces = writePlan.turn_step_commit.loop_trace.step_traces;
        assert.equal(semantic.turnStepCount(), 2);
        assert.equal(semantic.rollCount(), 0);
        assert.equal(ledger.slices.length, 1);
        assert.equal(traces.length, 2);
        assert.equal(traces[1].resolution, resolution);
        assert.equal(traces[1].applied, false);
        assert.equal(traces[1].player_response_boundary, true);
        assert.equal(writePlan.write_targets.some(
          ({ target }) => target === 'party_turn_step_operations'), false);

        const plans = [];
        await commit(writePlan, scenario, plans);
        const snapshot = plans[0].inserts.find(
          ({ target_table: table }) => table === 'party_state_snapshots')
          .record.state_payload;
        assert.equal(minutesBetween(factual.time_update.clock_before,
          snapshot.route_history.at(-1).ended_at), 8);
        assert.equal(minutesBetween(factual.time_update.clock_before,
          snapshot.clock), 8);
      });
    }
  });
