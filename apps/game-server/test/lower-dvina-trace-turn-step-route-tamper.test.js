import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTurnStepPreparedEffectLedger } from '@rus/turn';
import {
  assertPublicCommitEnvelope,
  bindStepTraceCopies,
  changeSemanticDurationClass,
  commit,
  movedTime,
  mutateCommittedConsequence,
  preparedProjections,
  rawEffect,
  rebindAggregates,
  routeBeforeProjection,
  routeBoundaryScenario,
  routeDirectScenario,
  shiftedClock
} from './lower-dvina-trace-turn-step-route-fixture.js';
import {
  buildLowerDvinaTracePreparedRouteWorkingProjection
} from '../src/runtime/lower-dvina-trace-turn-step-prepared-effects.js';

const RECONCILIATION_FAILED =
  'TRACE_TURN_STEP_PREPARED_EFFECT_RECONCILIATION_FAILED';

test('prepared route admits only a matching first-entry destination scene',
  async () => {
    const scenario = await routeDirectScenario({ firstEntryOnly: true });
    const route = scenario.factual.time_update.prepared_effect_ledger.slices[0];
    assert.equal(scenario.semantic.commitCount(), 1);

    const missing = structuredClone(scenario.before);
    missing.first_entry_preparation.scene.location_profile_ref =
      'location:other';
    assert.throws(() => buildLowerDvinaTracePreparedRouteWorkingProjection({
      projection: routeBeforeProjection(scenario),
      movement: route.consequence.movement,
      committedState: missing
    }), { code: 'TRACE_TURN_STEP_PREPARED_ROUTE_DESTINATION_INVALID' });
  });

test('prepared lineage keeps stable projection checks with planner overlays',
  async () => {
    const scenario = await routeDirectScenario();
    const overlaid = structuredClone(scenario.writePlan);
    const traces = overlaid.turn_step_commit.loop_trace.step_traces;
    for (const trace of traces) {
      trace.plan_request.player_safe_state.action_production = {
        available: true
      };
      trace.plan_request.player_safe_state.local_world_process = {
        allowed: []
      };
    }
    bindStepTraceCopies(overlaid, traces);
    await commit(overlaid, scenario);

    const forged = structuredClone(overlaid);
    const forgedTraces = forged.turn_step_commit.loop_trace.step_traces;
    forgedTraces[0].plan_request.player_safe_state.position.g5_anchor_id =
      'forged-anchor';
    bindStepTraceCopies(forged, forgedTraces);
    await assertForgedRejected(forged, scenario);
  });

test('production commit rejects rebuilt valid ledgers forged past owner outputs',
  async (t) => {
    const scenario = await routeDirectScenario();
    await t.test('persisted body arithmetic', async () => {
      const original = scenario.factual.time_update.prepared_effect_ledger;
      const routeBody = structuredClone(original.slices[0].body_update);
      routeBody.state_after.health = 1;
      const directBody = structuredClone(original.slices[1].body_update);
      directBody.state_after = structuredClone(routeBody.state_after);
      const projections = preparedProjections(scenario, original.slices[0]);
      const rebuilt = buildTurnStepPreparedEffectLedger({
        rootTurnId: original.root_turn_id,
        committedStateVersion: original.committed_state_version,
        effects: [
          rawEffect(original.slices[0], {
            bodyStateBefore: scenario.before.body_state,
            bodyUpdate: routeBody,
            projectionBefore: projections.before,
            projectionAfter: projections.afterRoute
          }),
          rawEffect(original.slices[1], {
            bodyStateBefore: routeBody.state_after,
            bodyUpdate: directBody,
            projectionBefore: projections.afterRoute,
            projectionAfter: projections.afterDirect
          })
        ]
      });
      await assertForgedRejected(rebindAggregates(
        scenario.writePlan, rebuilt), scenario);
    });

    await t.test('self-consistent forged body owner proposal', async () => {
      const original = scenario.factual.time_update.prepared_effect_ledger;
      const routeBody = structuredClone(original.slices[0].body_update);
      const originalHealthDelta = routeBody.proposal.exact_deltas.health;
      const forgedHealthDelta = originalHealthDelta === 0 ? -1 : 0;
      routeBody.proposal.exact_deltas.health = forgedHealthDelta;
      routeBody.state_after.health = Math.max(0, Math.min(
        100, scenario.before.body_state.health + forgedHealthDelta));
      const directBody = structuredClone(original.slices[1].body_update);
      directBody.state_after = structuredClone(routeBody.state_after);
      const projections = preparedProjections(scenario, original.slices[0]);
      const rebuilt = buildTurnStepPreparedEffectLedger({
        rootTurnId: original.root_turn_id,
        committedStateVersion: original.committed_state_version,
        effects: [
          rawEffect(original.slices[0], {
            bodyStateBefore: scenario.before.body_state,
            bodyUpdate: routeBody,
            projectionBefore: projections.before,
            projectionAfter: projections.afterRoute
          }),
          rawEffect(original.slices[1], {
            bodyStateBefore: routeBody.state_after,
            bodyUpdate: directBody,
            projectionBefore: projections.afterRoute,
            projectionAfter: projections.afterDirect
          })
        ]
      });
      await assertForgedRejected(rebindAggregates(
        scenario.writePlan, rebuilt), scenario);
    });

    await t.test('reordered owner slices', async () => {
      const original = scenario.factual.time_update.prepared_effect_ledger;
      const route = original.slices[0];
      const direct = original.slices[1];
      const directBody = structuredClone(direct.body_update);
      directBody.state_after = structuredClone(scenario.before.body_state);
      const reordered = buildTurnStepPreparedEffectLedger({
        rootTurnId: original.root_turn_id,
        committedStateVersion: original.committed_state_version,
        effects: [
          rawEffect(direct, {
            stepIndex: 1,
            bodyStateBefore: scenario.before.body_state,
            bodyUpdate: directBody,
            timeUpdate: movedTime(direct.time_update, 0, 1),
            projectionBefore: { revision: 0 },
            projectionAfter: { revision: 1 }
          }),
          rawEffect(route, {
            stepIndex: 2,
            bodyStateBefore: scenario.before.body_state,
            timeUpdate: movedTime(route.time_update, 1, 9),
            projectionBefore: { revision: 1 },
            projectionAfter: { revision: 2 }
          })
        ]
      });
      await assertForgedRejected(rebindAggregates(
        scenario.writePlan, reordered), scenario);
    });

    await t.test('self-consistent non-moment prepared continuation',
      async () => {
        const original = scenario.factual.time_update.prepared_effect_ledger;
        const direct = structuredClone(original.slices[1]);
        changeSemanticDurationClass(direct.consequence, 'brief');
        const projections = preparedProjections(scenario, original.slices[0]);
        const rebuilt = buildTurnStepPreparedEffectLedger({
          rootTurnId: original.root_turn_id,
          committedStateVersion: original.committed_state_version,
          effects: [
            rawEffect(original.slices[0], {
              bodyStateBefore: scenario.before.body_state,
              projectionBefore: projections.before,
              projectionAfter: projections.afterRoute
            }),
            rawEffect(direct, {
              bodyStateBefore: original.slices[0].body_update.state_after,
              projectionBefore: projections.afterRoute,
              projectionAfter: projections.afterDirect
            })
          ]
        });
        const forged = rebindAggregates(scenario.writePlan, rebuilt);
        const batch = forged.write_targets.find(
          ({ target }) => target === 'party_turn_step_operations').value;
        batch.operations[0].value.duration_class = 'brief';
        changeSemanticDurationClass(forged.turn_step_commit.consequence,
          'brief');
        const factual = forged.write_targets.find(
          ({ target }) => target === 'party_state').value;
        factual.consequence = structuredClone(
          forged.turn_step_commit.consequence);
        const traces = structuredClone(
          forged.turn_step_commit.loop_trace.step_traces);
        traces[1].approved_plan.activity.duration_class = 'brief';
        bindStepTraceCopies(forged, traces);
        await assertForgedRejected(forged, scenario);
      });
  });

test('route-only deferred trace rejects a rebuilt two-copy lineage',
  async () => {
    const scenario = await routeBoundaryScenario('generic_check');
    const forged = structuredClone(scenario.writePlan);
    const traces = structuredClone(
      forged.turn_step_commit.loop_trace.step_traces);
    const deferred = traces[1];
    const request = deferred.plan_request;
    request.request_id = 'forged-route-boundary:step:2';
    request.root_player_action = 'поддельное корневое действие';
    request.remaining_intent = 'поддельное продолжение';
    request.actor = { ...request.actor, actor_id: 'forged-actor' };
    request.player_safe_state = {
      ...request.player_safe_state,
      knowledge: [{ fact_id: 'forged-player-safe-fact' }]
    };
    request.completed_steps = [{
      step_index: 1, summary: 'поддельный завершённый шаг'
    }];
    deferred.approved_plan.request_id = request.request_id;
    deferred.approved_plan.interpretation = {
      ...deferred.approved_plan.interpretation,
      player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent
    };
    forged.turn_step_commit.loop_trace.completed_steps =
      structuredClone(request.completed_steps);
    bindStepTraceCopies(forged, traces);
    await assertForgedRejected(forged, scenario);
  });

test('pending prepared route requires one exact deferred step2 trace',
  async () => {
    const scenario = await routeBoundaryScenario('domain_request');
    const forged = structuredClone(scenario.writePlan);
    const traces = forged.turn_step_commit.loop_trace.step_traces.slice(0, 1);
    bindStepTraceCopies(forged, traces);
    forged.turn_step_commit.mode_resolution.decision_trace.step_count = 1;
    forged.command_trace = structuredClone(
      forged.turn_step_commit.mode_resolution.decision_trace);
    const factual = forged.write_targets.find(
      ({ target }) => target === 'party_state').value;
    factual.mode_resolution = structuredClone(
      forged.turn_step_commit.mode_resolution);
    await assertForgedRejected(forged, scenario);
  });

test('prepared route binds authoritative target time and activity',
  async (t) => {
    await t.test('destination anchor', async () => {
      const scenario = await routeBoundaryScenario('domain_request');
      const original = scenario.factual.time_update.prepared_effect_ledger;
      const route = structuredClone(original.slices[0]);
      route.consequence.movement.destination.g5_anchor_id =
        'forged-camp-anchor';
      const before = routeBeforeProjection(scenario);
      const afterRoute = buildLowerDvinaTracePreparedRouteWorkingProjection({
        projection: before,
        movement: route.consequence.movement,
        committedState: scenario.before,
        clockAfter: route.time_update.clock_after
      });
      const rebuilt = buildTurnStepPreparedEffectLedger({
        rootTurnId: original.root_turn_id,
        committedStateVersion: original.committed_state_version,
        effects: [rawEffect(route, {
          bodyStateBefore: scenario.before.body_state,
          projectionBefore: before,
          projectionAfter: afterRoute
        })]
      });
      const forged = rebindAggregates(scenario.writePlan, rebuilt);
      mutateCommittedConsequence(forged, (consequence) => {
        consequence.movement.destination.g5_anchor_id =
          'forged-camp-anchor';
      });
      const traces = structuredClone(
        forged.turn_step_commit.loop_trace.step_traces);
      traces[1].plan_request.player_safe_state.position.g5_anchor_id =
        'forged-camp-anchor';
      bindStepTraceCopies(forged, traces);
      await assertForgedRejected(forged, scenario);
    });

    await t.test('route duration and clock', async () => {
      const scenario = await routeBoundaryScenario('domain_request');
      const original = scenario.factual.time_update.prepared_effect_ledger;
      const route = structuredClone(original.slices[0]);
      route.consequence.duration_minutes += 1;
      route.consequence.movement.result.elapsed_minutes += 1;
      route.time_update.clock_after = shiftedClock(
        route.time_update.clock_after, 1);
      route.time_update.exact_elapsed.exact_minutes.numerator = '9';
      route.body_update.proposal.exact_elapsed =
        structuredClone(route.time_update.exact_elapsed);
      const before = routeBeforeProjection(scenario);
      const afterRoute = buildLowerDvinaTracePreparedRouteWorkingProjection({
        projection: before,
        movement: route.consequence.movement,
        committedState: scenario.before,
        clockAfter: route.time_update.clock_after
      });
      const rebuilt = buildTurnStepPreparedEffectLedger({
        rootTurnId: original.root_turn_id,
        committedStateVersion: original.committed_state_version,
        effects: [rawEffect(route, {
          bodyStateBefore: scenario.before.body_state,
          projectionBefore: before,
          projectionAfter: afterRoute
        })]
      });
      const forged = rebindAggregates(scenario.writePlan, rebuilt);
      mutateCommittedConsequence(forged, (consequence) => {
        consequence.duration_minutes += 1;
        consequence.movement.result.elapsed_minutes += 1;
      });
      const traces = structuredClone(
        forged.turn_step_commit.loop_trace.step_traces);
      const projected = traces[1].plan_request.player_safe_state;
      projected.clock = structuredClone(route.time_update.clock_after);
      projected.clock_weather_light.clock =
        structuredClone(route.time_update.clock_after);
      bindStepTraceCopies(forged, traces);
      await assertForgedRejected(forged, scenario);
    });

    await t.test('movement activity profile', async () => {
      const scenario = await routeBoundaryScenario('domain_request');
      const original = scenario.factual.time_update.prepared_effect_ledger;
      const route = structuredClone(original.slices[0]);
      route.consequence.movement.activity_ref = 'forged-route-activity';
      const projections = preparedProjections(scenario, route);
      const rebuilt = buildTurnStepPreparedEffectLedger({
        rootTurnId: original.root_turn_id,
        committedStateVersion: original.committed_state_version,
        effects: [rawEffect(route, {
          bodyStateBefore: scenario.before.body_state,
          projectionBefore: projections.before,
          projectionAfter: projections.afterRoute
        })]
      });
      const forged = rebindAggregates(scenario.writePlan, rebuilt);
      mutateCommittedConsequence(forged, (consequence) => {
        consequence.movement.activity_ref = 'forged-route-activity';
      });
      await assertForgedRejected(forged, scenario);
    });
  });

test('prepared direct rejects an extra rebuilt body component', async () => {
  const scenario = await routeDirectScenario();
  const original = scenario.factual.time_update.prepared_effect_ledger;
  const direct = structuredClone(original.slices[1]);
  const extra = {
    kind: 'direct_body_event', operation_id: 'forged-body-operation',
    body_effect_profile_ref: 'forged-body-profile',
    profile_pin: { artifact_id: 'forged', revision: 1,
      digest: 'f'.repeat(64) },
    body_effect_context: { kind: 'direct_body_event', mechanism: 'impact',
      severity: 'minor', body_part_ref: null }
  };
  direct.consequence.state_changes.unshift(extra);
  const projections = preparedProjections(scenario, original.slices[0]);
  const rebuilt = buildTurnStepPreparedEffectLedger({
    rootTurnId: original.root_turn_id,
    committedStateVersion: original.committed_state_version,
    effects: [
      rawEffect(original.slices[0], {
        bodyStateBefore: scenario.before.body_state,
        projectionBefore: projections.before,
        projectionAfter: projections.afterRoute
      }),
      rawEffect(direct, {
        bodyStateBefore: original.slices[0].body_update.state_after,
        projectionBefore: projections.afterRoute,
        projectionAfter: projections.afterDirect
      })
    ]
  });
  const forged = rebindAggregates(scenario.writePlan, rebuilt);
  forged.turn_step_commit.consequence.state_changes.unshift(extra);
  const factual = forged.write_targets.find(
    ({ target }) => target === 'party_state').value;
  factual.consequence = structuredClone(forged.turn_step_commit.consequence);
  await assertForgedRejected(forged, scenario);
});

async function assertForgedRejected(forged, scenario) {
  assertPublicCommitEnvelope(forged);
  await assert.rejects(() => commit(forged, scenario), {
    code: RECONCILIATION_FAILED
  });
}
