import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTurnStepExecutionRegistry,
  runTurnStepLoop
} from '../src/turn-step-loop.js';
import {
  buildTurnStepPreparedTimeUpdate,
  requireTurnStepPreparedEffectLedger
} from '../src/turn-step-prepared-effects.js';

test('prepared route and direct activity form one ordered t0-t8-t9 ledger',
  async () => {
    const requests = [];
    const counters = { routeHandler: 0, semanticActivityHandler: 0 };
    const outcome = await runTurnStepLoop(input(), ports({
      executionRegistry: preparedRegistry({ counters }),
      turnStepModel(request) {
        requests.push(request);
        return request.step_index === 1
          ? routePlan(request) : directPlan(request);
      }
    }));

    assert.equal(outcome.working_revision, 2);
    assert.equal(outcome.stop_reason, 'player_response');
    assert.equal(requests[1].player_safe_state.position, 'camp');
    assert.equal(requests[1].player_safe_state.clock.whole_minutes, '8');
    const ledger = outcome.prepared_effect_ledger;
    assert.deepEqual(ledger.slices.map((slice) => ({
      ordinal: slice.ordinal,
      step: slice.step_index,
      kind: slice.effect_kind,
      from: slice.time_update.clock_before.whole_minutes,
      to: slice.time_update.clock_after.whole_minutes
    })), [
      { ordinal: 1, step: 1, kind: 'domain_command', from: '0', to: '8' },
      { ordinal: 2, step: 2, kind: 'semantic_activity', from: '8', to: '9' }
    ]);
    assert.equal(ledger.slices[1].previous_slice_digest,
      ledger.slices[0].slice_digest);
    assert.deepEqual(counters,
      { routeHandler: 1, semanticActivityHandler: 1 });
  });

test('common prepared orchestration chains arbitrary domain and semantic owners',
  async () => {
    const calls = [];
    const registry = createTurnStepExecutionRegistry({
      domain: {
        request_movement: async (execution) => {
          calls.push(['domain', execution.prepared_chain_context]);
          return {
            working_projection: {
              ...execution.working_projection, position: 'camp'
            },
            summary: 'arbitrary domain',
            write_fragments: [],
            prepared_effect_request: {
              effect_kind: 'domain_command',
              owner_ref: 'arbitrary_domain_owner',
              operation_ref: 'request_movement',
              availability: available(),
              consequence: { duration_minutes: 8 }
            }
          };
        }
      },
      applySemanticActivity: async (execution) => {
        calls.push(['semantic', execution.prepared_chain_context]);
        return {
          working_projection: execution.working_projection,
          summary: 'arbitrary semantic',
          write_fragments: [],
          prepared_effect_request: {
            effect_kind: 'semantic_activity',
            owner_ref: 'arbitrary_semantic_owner',
            operation_ref: 'activity:2',
            availability: null,
            consequence: { duration_minutes: 1 }
          }
        };
      }
    });
    const ownerCalls = { time: 0, body: 0 };
    const outcome = await runTurnStepLoop(input(), ports({
      executionRegistry: registry,
      preparedEffectContext: {
        current_clock: at(0), current_body_state: body()
      },
      async preparedEffectTimeOwner({ prepared_chain_context: context,
        consequence }) {
        ownerCalls.time += 1;
        const duration = consequence.duration_minutes;
        return {
          version: 2, schema: 'turn_time_update',
          owner: '@rus/time-events-history',
          clock_before: context.current_clock,
          clock_after: at(Number(context.current_clock.whole_minutes)
            + duration),
          exact_elapsed: minutes(duration), nearest_boundary: null
        };
      },
      async preparedEffectBodyOwner({ prepared_chain_context: context }) {
        ownerCalls.body += 1;
        return {
          version: 1, schema: 'turn_body_update', owner: '@rus/body-state',
          applied: context.prior_effect_count === 0,
          proposal: context.prior_effect_count === 0 ? { id: 'route' } : null,
          state_after: context.current_body_state
        };
      },
      turnStepModel: (request) => request.step_index === 1
        ? routePlan(request) : directPlan(request)
    }));

    assert.deepEqual(calls.map(([owner, context]) => ({
      owner,
      prior: context.prior_effect_count,
      clock: context.current_clock.whole_minutes
    })), [
      { owner: 'domain', prior: 0, clock: '0' },
      { owner: 'semantic', prior: 1, clock: '8' }
    ]);
    assert.deepEqual(ownerCalls, { time: 2, body: 2 });
    assert.equal(outcome.prepared_effect_ledger.slices.length, 2);
  });

test('prepared chain suppresses step-two schema repair and a repaired start',
  async (t) => {
    await t.test('invalid step two makes exactly two model calls', async () => {
      let calls = 0;
      let semanticCalls = 0;
      const registry = preparedRegistry();
      const semantic = registry.semanticActivity();
      const guarded = createTurnStepExecutionRegistry({
        domain: { request_movement: registry.domain({ op: 'request_movement' }) },
        applySemanticActivity: async (execution) => {
          semanticCalls += 1;
          return semantic(execution);
        }
      });
      await assert.rejects(runTurnStepLoop(input(), ports({
        executionRegistry: guarded,
        turnStepModel(request) {
          calls += 1;
          return request.step_index === 1 ? routePlan(request)
            : { ...directPlan(request), request_id: 'forged' };
        }
      })), { code: 'TURN_STEP_PLAN_INVALID' });
      assert.equal(calls, 2);
      assert.equal(semanticCalls, 0);
    });

    await t.test('a repaired pending start fails before a third call', async () => {
      let calls = 0;
      await assert.rejects(runTurnStepLoop(input(), ports({
        executionRegistry: preparedRegistry(),
        turnStepModel(request) {
          calls += 1;
          if (calls === 1) return { ...routePlan(request), request_id: 'forged' };
          return routePlan(request);
        }
      })), { code: 'TURN_STEP_PLAN_INVALID' });
      assert.equal(calls, 2);
    });
  });

test('prepared effect ledger rejects forged, reordered and missing slices',
  async (t) => {
    const outcome = await runTurnStepLoop(input(), ports({
      executionRegistry: preparedRegistry(),
      turnStepModel: (request) => request.step_index === 1
        ? routePlan(request) : directPlan(request)
    }));
    const cases = {
      forged(value) {
        value.slices[1].consequence.duration_minutes = 7;
      },
      reordered(value) {
        value.slices.reverse();
      },
      missing(value) {
        value.slices.pop();
      }
    };
    for (const [name, mutate] of Object.entries(cases)) {
      await t.test(name, () => {
        const value = structuredClone(outcome.prepared_effect_ledger);
        mutate(value);
        assert.throws(() => requireTurnStepPreparedEffectLedger(value), {
          code: 'TURN_STEP_PREPARED_EFFECT_INVALID'
        });
      });
    }
  });

test('two positive prepared domain segments form one ordered ledger',
  async () => {
  let secondDomainCalls = 0;
  const registry = preparedRegistry({ extraDomain: {
    request_activity: async (execution) => {
      secondDomainCalls += 1;
      return {
        working_projection: {
          ...execution.working_projection,
          interaction_status: 'companions_committed'
        },
        summary: 'prepared companion conversation',
        write_fragments: [],
        prepared_effect_request: {
          effect_kind: 'domain_command',
          owner_ref: 'companion_conversation_owner',
          operation_ref: 'request_activity',
          availability: available(),
          consequence: { duration_minutes: 5 }
        }
      };
    }
  } });
  const outcome = await runTurnStepLoop(input(), ports({
    executionRegistry: registry,
    admitPreparedDomainPlan: async () => true,
    preparedEffectContext: {
      current_clock: at(0), current_body_state: body()
    },
    async preparedEffectTimeOwner({ prepared_chain_context: context,
      consequence }) {
      const duration = consequence.duration_minutes;
      const before = Number(context.current_clock.whole_minutes);
      return {
        version: 2, schema: 'turn_time_update',
        owner: '@rus/time-events-history',
        clock_before: context.current_clock,
        clock_after: at(before + duration),
        exact_elapsed: minutes(duration), nearest_boundary: null
      };
    },
    async preparedEffectBodyOwner({ prepared_chain_context: context }) {
      return {
        version: 1, schema: 'turn_body_update', owner: '@rus/body-state',
        applied: false, proposal: null,
        state_after: context.current_body_state
      };
    },
    turnStepModel: (request) => request.step_index === 1
      ? routePlan(request) : secondDomainPlan(request)
  }));

  assert.equal(secondDomainCalls, 1);
  assert.equal(outcome.working_revision, 2);
  assert.equal(outcome.stop_reason, 'player_response');
  assert.equal(outcome.working_projection.interaction_status,
    'companions_committed');
  const aggregateTime = buildTurnStepPreparedTimeUpdate(
    outcome.prepared_effect_ledger);
  assert.deepEqual(aggregateTime.exact_elapsed, minutes(13));
  assert.equal(outcome.prepared_effect_ledger.slices[1]
    .consequence.duration_minutes, 5);
  assert.deepEqual(outcome.prepared_effect_ledger.slices.map((slice) => ({
    ordinal: slice.ordinal,
    kind: slice.effect_kind,
    owner: slice.owner_ref,
    from: slice.time_update.clock_before.whole_minutes,
    to: slice.time_update.clock_after.whole_minutes
  })), [{
    ordinal: 1,
    kind: 'domain_command',
    owner: 'route_owner',
    from: '0',
    to: '8'
  }, {
    ordinal: 2,
    kind: 'domain_command',
    owner: 'companion_conversation_owner',
    from: '8',
    to: '13'
  }]);
});

test('after a prepared route a generic check is a boundary',
  async (t) => {
    for (const resolution of ['generic_check']) {
      await t.test(resolution, async () => {
        let delegated = 0;
        let rolls = 0;
        const registry = preparedRegistry({ extraDomain: {
          request_activity: async () => {
            delegated += 1;
            throw new Error('second domain owner must not run');
          }
        } });
        const outcome = await runTurnStepLoop(input(), ports({
          executionRegistry: registry,
          randomSource: { next() { rolls += 1; return 0.5; } },
          resolveCheckContext: async () => ({
            attribute_value: 10,
            skill_bonus: 0,
            state_modifier: 0,
            equipment_modifier: 0,
            circumstance_modifier: 0,
            policy_profile_ref: 'test_profile',
            policy_profile_pin: {
              artifact_id: 'test_profile', revision: 1,
              digest: 'a'.repeat(64)
            },
            check_policy_ref: { entity_kind: 'check_policy',
              entity_id: 'test_profile', authoring_version: '1' },
            consequence_policy_ref: { entity_kind: 'consequence_policy',
              entity_id: 'test_consequence', authoring_version: '1' }
          }),
          turnStepModel: (request) => request.step_index === 1
            ? routePlan(request)
            : resolution === 'domain_request'
              ? secondDomainPlan(request)
              : genericPlan(request)
        }));
        assert.equal(outcome.working_revision, 1);
        assert.equal(outcome.stop_reason, 'player_response');
        assert.equal(outcome.step_traces[1].applied, false);
        assert.equal(outcome.step_traces[1].player_response_boundary, true);
        assert.equal(outcome.prepared_effect_ledger.slices.length, 1);
        assert.equal(delegated, 0);
        assert.equal(rolls, 0);
      });
    }
  });

test('after a prepared route direct operations stop before every handler',
  async () => {
    let directCalls = 0;
    const counters = { routeHandler: 0, semanticActivityHandler: 0 };
    const outcome = await runTurnStepLoop(input(), ports({
      executionRegistry: preparedRegistry({
        counters,
        extraDirect: {
          move_entity: async () => {
            directCalls += 1;
            throw new Error('direct operation handler must not run');
          }
        }
      }),
      turnStepModel: (request) => request.step_index === 1
        ? routePlan(request) : directOperationPlan(request)
    }));

    assert.equal(outcome.working_revision, 1);
    assert.equal(outcome.step_traces[1].applied, false);
    assert.equal(outcome.step_traces[1].player_response_boundary, true);
    assert.equal(outcome.prepared_effect_ledger.slices.length, 1);
    assert.equal(directCalls, 0);
    assert.deepEqual(counters,
      { routeHandler: 1, semanticActivityHandler: 0 });
  });

test('clarification after a prepared route is one persisted boundary trace',
  async () => {
    const outcome = await runTurnStepLoop(input(), ports({
      executionRegistry: preparedRegistry(),
      turnStepModel: (request) => request.step_index === 1
        ? routePlan(request) : clarificationPlan(request)
    }));

    assert.equal(outcome.stop_reason, 'clarification_required');
    assert.equal(outcome.working_revision, 1);
    assert.equal(outcome.step_traces.length, 2);
    assert.equal(outcome.step_traces[1].applied, false);
    assert.equal(outcome.step_traces[1].player_response_boundary, true);
    assert.deepEqual(outcome.clarification,
      { question: 'Где именно осматриваться?', target_refs: ['camp'] });
    assert.equal(outcome.prepared_effect_ledger.slices.length, 1);
  });

test('prepared world-process continuation sees evolving state before terminal step',
  async () => {
    const requests = [];
    const outcome = await runTurnStepLoop(input(), ports({
      executionRegistry: preparedRegistry({
        semanticBoundary: false,
        extraDomain: {
          request_world_process: async ({ plan,
            working_projection: projection }) => ({
            working_projection: {
              ...projection,
              local_fire_processes: [{ process_ref: 'fire-1',
                status: 'active', fuel_refs: ['fuel-1'] }]
            },
            summary: 'fuel added to fire',
            write_fragments: []
          })
        }
      }),
      admitPreparedDomainPlan: async ({ plan }) =>
        plan.operations[0]?.op === 'request_world_process',
      turnStepModel(request) {
        requests.push(request);
        if (request.step_index === 1) return routePlan(request);
        if (request.step_index === 2) return worldProcessPlan(request);
        return directPlan(request);
      }
    }));

    assert.equal(requests.length, 3);
    assert.equal(outcome.stop_reason, 'player_response');
    assert.equal(outcome.working_revision, 3);
    assert.equal(outcome.step_traces[1].player_response_boundary, false);
    assert.deepEqual(requests[2].player_safe_state.local_fire_processes,
      [{ process_ref: 'fire-1', status: 'active', fuel_refs: ['fuel-1'] }]);
    assert.equal(outcome.prepared_effect_ledger.slices.length, 2);
    assert.deepEqual(outcome.prepared_effect_ledger.slices.map((slice) =>
      slice.time_update.clock_after.whole_minutes), ['8', '9']);
  });

function preparedRegistry({
  extraDomain = {},
  extraDirect = {},
  counters = null,
  semanticDuration = 1,
  semanticBoundary = true
} = {}) {
  return createTurnStepExecutionRegistry({
    direct: extraDirect,
    domain: {
      request_movement: async ({ plan,
        working_projection: projection }) => {
        increment(counters, 'routeHandler');
        return {
          working_projection: {
            ...projection, position: 'camp', clock: at(8)
          },
          summary: 'route',
          write_fragments: [],
          prepared_effect: effect({
            step: plan.step_index,
            kind: 'domain_command',
            owner: 'route_owner',
            operation: 'request_movement',
            availability: available(),
            duration: 8,
            before: 0,
            after: 8
          })
        };
      },
      ...extraDomain
    },
    applySemanticActivity: async ({ plan,
      working_projection: projection }) => {
      increment(counters, 'semanticActivityHandler');
      const before = Number(projection.clock.whole_minutes);
      return {
        working_projection: {
          ...projection, clock: at(before + semanticDuration)
        },
        summary: 'direct activity',
        write_fragments: [],
        consequence_fragment: { duration_minutes: semanticDuration },
        player_response_boundary: semanticBoundary,
        prepared_effect: effect({
          step: plan.step_index,
          kind: 'semantic_activity',
          owner: 'moment_none',
          operation: 'activity:2',
          availability: null,
          duration: semanticDuration,
          before,
          after: before + semanticDuration
        })
      };
    }
  });
}

function effect({ step, kind, owner, operation, availability, duration,
  before, after }) {
  return {
    step_index: step,
    effect_kind: kind,
    owner_ref: owner,
    operation_ref: operation,
    availability,
    consequence: { duration_minutes: duration },
    time_update: {
      version: 2,
      schema: 'turn_time_update',
      owner: '@rus/time-events-history',
      clock_before: at(before),
      clock_after: at(after),
      exact_elapsed: minutes(duration),
      nearest_boundary: null
    },
    body_update: {
      version: 1,
      schema: 'turn_body_update',
      owner: '@rus/body-state',
      applied: false,
      proposal: null,
      state_after: body()
    },
    body_state_before: body()
  };
}

function input() {
  return {
    requestId: 'request-1',
    rootTurnId: 'turn-1',
    committedStateVersion: 7,
    rootPlayerAction: 'идти к стану и осмотреться',
    actor: { actor_id: 'actor-1' },
    initialWorkingProjection: {
      actor_id: 'actor-1', position: 'shore', destination_refs: ['camp'],
      clock: at(0),
      visible_entities: [
        { entity_ref: 'fire-1', kind: 'local_world_process' },
        { entity_ref: 'fuel-1', kind: 'item' }
      ]
    },
    maxInternalSteps: 8
  };
}

function ports(overrides) {
  return {
    projectPlayerSafeState: async ({ working_projection: value }) =>
      structuredClone(value),
    revalidateCommittedState: async () => ({ state_version: 7 }),
    ...overrides
  };
}

function routePlan(request) {
  return plan(request, {
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_movement', actor_ref: 'actor-1',
      movement_kind: 'local', target_ref: 'camp' }],
    continuation: { remaining_intent: 'осмотреться', depends_on_refs: ['camp'] }
  });
}

function directPlan(request, overrides = {}) {
  return plan(request, {
    resolution: 'direct',
    goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    ...overrides
  });
}

function directOperationPlan(request) {
  return directPlan(request, {
    operations: [{ op: 'move_entity', entity_ref: 'camp',
      placement: { relation: 'held_by', target_ref: 'actor-1' } }]
  });
}

function clarificationPlan(request) {
  return plan(request, {
    resolution: 'clarification_required',
    goal_result: 'pending',
    operations: [],
    clarification: {
      question: 'Где именно осматриваться?', target_refs: ['camp']
    }
  });
}

function secondDomainPlan(request) {
  return plan(request, {
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_activity', actor_ref: 'actor-1',
      activity_kind: 'wait', target_refs: [], description: 'ждать' }]
  });
}

function worldProcessPlan(request) {
  return plan(request, {
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'request_world_process',
      actor_ref: 'actor-1',
      process_action: 'affect',
      process_ref: 'fire-1',
      process_kind: 'fire',
      source_refs: ['fuel-1'],
      target_refs: [],
      description: 'положить топливо в огонь'
    }],
    continuation: {
      remaining_intent: 'осмотреть результат',
      depends_on_refs: ['fire-1']
    }
  });
}

function genericPlan(request) {
  const branch = {
    goal_result: 'achieved', additional_activity: null,
    operations: [], continuation: null
  };
  return plan(request, {
    resolution: 'generic_check',
    goal_result: 'pending',
    check: {
      purpose: 'осмотреться', attribute_ref: 'actor-1', skill_ref: null,
      difficulty_id: 'ordinary',
      outcomes: Object.fromEntries([
        'clean_success', 'success', 'success_with_cost',
        'failure_with_consequence', 'severe_failure'
      ].map((band) => [band, branch]))
    }
  });
}

function plan(request, overrides) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null, continuation: null, clarification: null,
    reason_code: 'test_prepared_effect', reason: 'test',
    ...overrides
  };
}

function available() {
  return { version: 1, schema: 'turn_availability_decision',
    status: 'available', can_attempt: true, reasons: [], check_requests: [] };
}

function at(minutes) {
  return { whole_minutes: String(minutes), subminute_numerator: '0',
    subminute_denominator: '1' };
}

function minutes(value) {
  return { exact_minutes: { numerator: String(value), denominator: '1' } };
}

function body() {
  return { health: 100, satiety: 100, energy: 100,
    active_conditions: [] };
}

function increment(counters, key) {
  if (counters != null) counters[key] += 1;
}
