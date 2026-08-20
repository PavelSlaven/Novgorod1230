import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTurnStepExecutionRegistry,
  runTurnStepLoop
} from '../src/turn-step-loop.js';

function input(overrides = {}) {
  return {
    requestId: 'request-1',
    rootTurnId: 'turn-1',
    committedStateVersion: 7,
    rootPlayerAction: 'беру камень и кладу его в сумку',
    actor: { actor_ref: 'actor-1' },
    initialWorkingProjection: {
      actor_ref: 'actor-1',
      visible_entities: [{ entity_ref: 'stone-1' }],
      inventory: [],
      elapsed_minutes: 0
    },
    ...overrides
  };
}

function basePlan(request, overrides = {}) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.remaining_intent,
      grounded_attempt: request.remaining_intent,
      adaptation: 'literal'
    },
    resolution: 'direct',
    goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
    operations: [],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'direct_step',
    reason: 'test plan',
    ...overrides
  };
}

function result(projection, summary, overrides = {}) {
  return {
    working_projection: projection,
    summary,
    write_fragments: [],
    ...overrides
  };
}

function ports(overrides = {}) {
  return {
    turnStepModel: async (request) => basePlan(request),
    projectPlayerSafeState: async ({ working_projection: projection }) => ({
      actor_ref: projection.actor_ref,
      visible_entities: projection.visible_entities,
      inventory: projection.inventory,
      elapsed_minutes: projection.elapsed_minutes
    }),
    revalidateCommittedState: async () => ({ state_version: 7 }),
    executionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection: projection }) =>
        result({ ...projection,
          elapsed_minutes: projection.elapsed_minutes + 1 }, 'прошла минута')
    }),
    ...overrides
  };
}

test('direct continuation sees the updated immutable working projection', async () => {
  const requests = [];
  const seenProjections = [];
  const executionRegistry = createTurnStepExecutionRegistry({
    direct: {
      move_entity: async ({ operation, working_projection: projection }) => {
        seenProjections.push(projection);
        return result({
          ...projection,
          inventory: operation.placement.relation === 'held_by'
            ? [operation.entity_ref]
            : projection.inventory
        }, 'камень взят', {
          write_fragments: [{
            target: 'party_items',
            value: { op: operation.op }
          }]
        });
      }
    },
    applySemanticActivity: async ({ working_projection: projection }) =>
      result({ ...projection,
        elapsed_minutes: projection.elapsed_minutes + 1 }, 'прошла минута')
  });
  const runtimePorts = ports({
    executionRegistry,
    turnStepModel: async (request) => {
      requests.push(request);
      if (request.step_index === 1) {
        return basePlan(request, {
          goal_result: 'pending',
          operations: [{
            op: 'move_entity', entity_ref: 'stone-1',
            placement: { relation: 'held_by', target_ref: 'actor-1' }
          }],
          continuation: {
            remaining_intent: 'положить камень в сумку',
            depends_on_refs: ['stone-1']
          }
        });
      }
      assert.deepEqual(request.player_safe_state.inventory, ['stone-1']);
      return basePlan(request);
    }
  });
  const outcome = await runTurnStepLoop(input(), runtimePorts);
  assert.equal(outcome.stop_reason, 'terminal');
  assert.equal(outcome.working_revision, 2);
  assert.equal(outcome.working_projection.elapsed_minutes, 2);
  assert.deepEqual(requests.map(({ working_revision: revision }) => revision),
    [0, 1]);
  assert.equal(Object.isFrozen(requests[0]), true);
  assert.equal(seenProjections[0].inventory.length, 0);
  assert.equal(outcome.write_fragments.length, 1);
});

test('later owner receives the sealed ordinary plan from the same root',
  async () => {
    const ordinaryPlan = { schema:
      'ordinary_container_contents_atomic_write_plan_v2',
    write_plan_digest: 'sha256:ordinary' };
    let received;
    const executionRegistry = createTurnStepExecutionRegistry({
      direct: {
        move_entity: async ({ working_projection: projection }) => result(
          projection, 'ordinary prepared', {
            ordinary_materialization_atomic_write_plan: ordinaryPlan
          }),
        change_entity_facts: async (execution) => {
          received = execution
            .prepared_ordinary_materialization_atomic_write_plan;
          return result(execution.working_projection, 'prepared item used');
        }
      },
      applySemanticActivity: async ({ working_projection: projection }) =>
        result(projection, 'moment')
    });
    const outcome = await runTurnStepLoop(input(), ports({
      executionRegistry,
      turnStepModel: async (request) => request.step_index === 1
        ? basePlan(request, { goal_result: 'pending', operations: [{
          op: 'move_entity', entity_ref: 'stone-1',
          placement: { relation: 'held_by', target_ref: 'actor-1' }
        }], continuation: { remaining_intent: 'обработать найденное',
          depends_on_refs: ['stone-1'] } })
        : basePlan(request, { operations: [{ op: 'change_entity_facts',
          entity_ref: 'stone-1', remove_fact_refs: [], add_facts: [] }] })
    }));
    assert.deepEqual(received, ordinaryPlan);
    assert.deepEqual(outcome.ordinary_materialization_atomic_write_plan,
      ordinaryPlan);
  });

test('generic check uses the shared RNG owner and branch continuation', async () => {
  let rolls = 0;
  const executionRegistry = createTurnStepExecutionRegistry({
    direct: {
      change_entity_facts: async ({ working_projection: projection }) =>
        result({ ...projection, balanced: true }, 'равновесие сохранено')
    },
    applySemanticActivity: async ({ working_projection: projection,
      operation }) => result({ ...projection,
      elapsed_minutes: projection.elapsed_minutes
        + (operation.activity.duration_class === 'brief' ? 2 : 1)
    }, 'применена нагрузка')
  });
  const runtimePorts = ports({
    executionRegistry,
    randomSource: { next: () => { rolls += 1; return 0.95; } },
    resolveCheckContext: async () => ({
      attribute_value: 30,
      skill_bonus: 0,
      ...checkPolicyRefs()
    }),
    turnStepModel: async (request) => basePlan(request, {
      resolution: 'generic_check',
      goal_result: 'pending',
      check: {
        purpose: 'удержать равновесие',
        attribute_ref: 'actor-1',
        skill_ref: null,
        difficulty_id: 'risky',
        outcomes: Object.fromEntries([
          'clean_success', 'success', 'success_with_cost',
          'failure_with_consequence', 'severe_failure'
        ].map((band) => [band, {
          goal_result: band === 'clean_success' ? 'achieved' : 'not_achieved',
          additional_activity: band === 'clean_success'
            ? { duration_class: 'brief', effort: 'light' }
            : null,
          operations: band === 'clean_success' ? [{
            op: 'change_entity_facts',
            entity_ref: 'stone-1',
            remove_fact_refs: [],
            add_facts: []
          }] : [],
          continuation: null
        }]))
      },
      reason_code: 'generic_check',
      reason: 'test check'
    })
  });
  const outcome = await runTurnStepLoop(input(), runtimePorts);
  assert.equal(rolls, 1);
  assert.equal(outcome.check_results[0].outcome.band, 'clean_success');
  assert.equal(outcome.check_requests[0].policy_profile_ref,
    'test_generic_check_profile');
  assert.deepEqual(outcome.check_requests[0].policy_profile_pin,
    policyProfilePin());
  assert.deepEqual(outcome.step_traces[0].check_binding,
    outcome.check_requests[0]);
  assert.equal(outcome.working_projection.balanced, true);
  assert.equal(outcome.working_projection.elapsed_minutes, 3);
});

test('each generic outcome resumes its own remaining intent', async (t) => {
  const circumstancesByBand = {
    clean_success: 24,
    success: 14,
    success_with_cost: 13,
    failure_with_consequence: 9,
    severe_failure: 4
  };
  for (const [expectedBand, circumstanceModifier] of
    Object.entries(circumstancesByBand)) {
    await t.test(expectedBand, async () => {
      const requests = [];
      const outcome = await runTurnStepLoop(input(), ports({
        randomSource: { next: () => 0 },
        resolveCheckContext: async () => ({
          attribute_value: 10,
          skill_bonus: 0,
          circumstance_modifier: circumstanceModifier,
          ...checkPolicyRefs()
        }),
        turnStepModel: async (request) => {
          requests.push(structuredClone(request));
          if (request.step_index > 1) return basePlan(request);
          return basePlan(request, {
            resolution: 'generic_check',
            goal_result: 'pending',
            check: {
              purpose: 'определить продолжение попытки',
              attribute_ref: 'actor-1',
              skill_ref: null,
              difficulty_id: 'risky',
              outcomes: Object.fromEntries(Object.keys(
                circumstancesByBand
              ).map((band) => [band, {
                goal_result: 'pending',
                additional_activity: null,
                operations: [],
                continuation: {
                  remaining_intent: `продолжение:${band}`,
                  depends_on_refs: []
                }
              }]))
            },
            reason_code: 'generic_branch_continuation',
            reason: 'Каждый исход сохраняет собственный остаток намерения.'
          });
        }
      }));
      assert.equal(outcome.check_results[0].outcome.band, expectedBand);
      assert.equal(requests[1].remaining_intent,
        `продолжение:${expectedBand}`);
      assert.equal(outcome.stop_reason, 'terminal');
    });
  }
});

test('generic check context cannot override code-owned identity or difficulty', async () => {
  const executionRegistry = createTurnStepExecutionRegistry({
    applySemanticActivity: async ({ working_projection: projection }) =>
      result(projection, 'нагрузка применена')
  });
  const runtimePorts = ports({
    executionRegistry,
    randomSource: { next: () => 0.45 },
    resolveCheckContext: async () => ({
      check_id: 'forged-check-id',
      difficulty: 30,
      attribute_value: 10,
      skill_bonus: 0,
      ...checkPolicyRefs()
    }),
    turnStepModel: async (request) => basePlan(request, {
      resolution: 'generic_check',
      goal_result: 'pending',
      check: {
        purpose: 'проверить устойчивость',
        attribute_ref: 'actor-1',
        skill_ref: null,
        difficulty_id: 'risky',
        outcomes: Object.fromEntries([
          'clean_success', 'success', 'success_with_cost',
          'failure_with_consequence', 'severe_failure'
        ].map((band) => [band, {
          goal_result: band === 'success_with_cost'
            ? 'achieved'
            : 'not_achieved',
          additional_activity: null,
          operations: [],
          continuation: null
        }]))
      },
      reason_code: 'generic_check',
      reason: 'test check'
    })
  });

  const outcome = await runTurnStepLoop(input(), runtimePorts);

  assert.equal(outcome.check_results[0].check_id, 'turn-1:step:1');
  assert.equal(outcome.check_results[0].difficulty, 15);
  assert.equal(outcome.check_results[0].outcome.band,
    'failure_with_consequence');
});

test('domain owner can stop automatic continuation at a player boundary', async () => {
  let domainCalls = 0;
  const executionRegistry = createTurnStepExecutionRegistry({
    domain: {
      request_activity: async ({ working_projection: projection }) => {
        domainCalls += 1;
        return result({ ...projection, treatment_started: true },
          'лечение начато', {
            player_response_boundary: true,
            consequence_fragment: { kind: 'treatment' }
          });
      }
    }
  });
  const outcome = await runTurnStepLoop(input(), ports({
    executionRegistry,
    turnStepModel: async (request) => basePlan(request, {
      resolution: 'domain_request',
      goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{
        op: 'request_activity',
        actor_ref: 'actor-1',
        activity_kind: 'recover',
        target_refs: ['stone-1'],
        description: 'оказать помощь'
      }],
      continuation: {
        remaining_intent: 'продолжить путь',
        depends_on_refs: ['stone-1']
      }
    })
  }));
  assert.equal(domainCalls, 1);
  assert.equal(outcome.stop_reason, 'player_response');
  assert.equal(outcome.working_projection.treatment_started, true);
  assert.deepEqual(outcome.consequence_fragments, [{ kind: 'treatment' }]);
});

test('compound intent resumes from the committed domain boundary without replay',
  async () => {
    let inspections = 0;
    let moves = 0;
    let rolls = 0;
    const firstRegistry = createTurnStepExecutionRegistry({
      domain: {
        request_discovery: async ({ working_projection: projection }) => {
          inspections += 1;
          return result({ ...projection, inspected: true }, 'осмотр завершён', {
            player_response_boundary: true
          });
        }
      }
    });
    const first = await runTurnStepLoop(input({
      rootPlayerAction: 'осмотреть, взять ткань и идти'
    }), ports({
      executionRegistry: firstRegistry,
      randomSource: { next: () => { rolls += 1; return 0.5; } },
      turnStepModel: async (request) => basePlan(request, {
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_discovery', actor_ref: 'actor-1',
          discovery_kind: 'inspect', target_refs: ['stone-1'],
          query: 'осмотреть берег' }],
        continuation: { remaining_intent: 'взять ткань и идти',
          depends_on_refs: ['stone-1'] }
      })
    }));
    assert.equal(first.stop_reason, 'player_response');
    assert.equal(first.remaining_intent, 'взять ткань и идти');
    assert.equal(first.working_projection.inspected, true);

    const secondRegistry = createTurnStepExecutionRegistry({
      direct: {
        move_entity: async ({ operation,
          working_projection: projection }) => {
          moves += 1;
          return result({ ...projection,
            inventory: [...projection.inventory, operation.entity_ref]
          }, 'ткань взята');
        }
      },
      domain: {
        request_movement: async ({ working_projection: projection }) =>
          result({ ...projection, moved: true }, 'путь начат', {
            player_response_boundary: true
          })
      },
      applySemanticActivity: async ({ working_projection: projection }) =>
        result(projection, 'короткое действие')
    });
    const second = await runTurnStepLoop(input({
      requestId: 'request-2', rootTurnId: 'turn-2',
      committedStateVersion: 8,
      rootPlayerAction: first.remaining_intent,
      initialWorkingProjection: first.working_projection
    }), ports({
      executionRegistry: secondRegistry,
      revalidateCommittedState: async () => ({ state_version: 8 }),
      projectPlayerSafeState: async ({ working_projection: projection }) =>
        structuredClone(projection),
      randomSource: { next: () => { rolls += 1; return 0.5; } },
      turnStepModel: async (request) => {
        assert.equal(request.player_safe_state.inspected, true);
        if (request.step_index === 1) return basePlan(request, {
          goal_result: 'pending',
          operations: [{ op: 'move_entity', entity_ref: 'stone-1',
            placement: { relation: 'held_by', target_ref: 'actor-1' } }],
          continuation: { remaining_intent: 'идти дальше',
            depends_on_refs: ['stone-1'] }
        });
        assert.deepEqual(request.player_safe_state.inventory, ['stone-1']);
        return basePlan(request, {
          resolution: 'domain_request', goal_result: 'pending',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operations: [{ op: 'request_movement', actor_ref: 'actor-1',
            movement_kind: 'local', target_ref: 'stone-1' }]
        });
      }
    }));
    assert.equal(second.stop_reason, 'player_response');
    assert.equal(second.working_projection.moved, true);
    assert.deepEqual(second.working_projection.inventory, ['stone-1']);
    assert.equal(inspections, 1);
    assert.equal(moves, 1);
    assert.equal(rolls, 0);
  });

test('one structural repair is allowed before any execution', async () => {
  let calls = 0;
  const seenRepair = [];
  const runtimePorts = ports({
    turnStepModel: async (request, repair) => {
      calls += 1;
      seenRepair.push(repair ?? null);
      return calls === 1
        ? { ...basePlan(request), request_id: 'forged' }
        : basePlan(request);
    }
  });
  const outcome = await runTurnStepLoop(input(), runtimePorts);
  assert.equal(calls, 2);
  assert.equal(seenRepair[0], null);
  assert.equal(seenRepair[1].schema, 'turn_step_repair_context_v1');
  assert.equal(outcome.step_traces[0].repaired, true);

  let executions = 0;
  await assert.rejects(() => runTurnStepLoop(input(), ports({
    turnStepModel: async (request) => ({
      ...basePlan(request), request_id: 'always-forged'
    }),
    executionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async () => { executions += 1; }
    })
  })), { code: 'TURN_STEP_PLAN_INVALID' });
  assert.equal(executions, 0);
});

test('the cap applies eight steps without a ninth planner call', async () => {
  let calls = 0;
  const runtimePorts = ports({
    turnStepModel: async (request) => {
      calls += 1;
      return basePlan(request, {
        goal_result: 'pending',
        continuation: {
          remaining_intent: `продолжить шаг ${request.step_index + 1}`,
          depends_on_refs: []
        }
      });
    }
  });
  const outcome = await runTurnStepLoop(input(), runtimePorts);
  assert.equal(calls, 8);
  assert.equal(outcome.working_revision, 8);
  assert.equal(outcome.stop_reason, 'step_limit');
});

test('stale committed state stops before RNG or domain effects', async () => {
  let effects = 0;
  const executionRegistry = createTurnStepExecutionRegistry({
    domain: {
      request_activity: async () => { effects += 1; return {}; }
    }
  });
  await assert.rejects(() => runTurnStepLoop(input(), ports({
    executionRegistry,
    revalidateCommittedState: async () => ({ state_version: 8 }),
    turnStepModel: async (request) => basePlan(request, {
      resolution: 'domain_request',
      goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{
        op: 'request_activity', actor_ref: 'actor-1',
        activity_kind: 'wait', target_refs: [], description: 'ждать'
      }]
    })
  })), { code: 'TURN_STEP_STATE_STALE' });
  assert.equal(effects, 0);
});

test('execution registry exposes only contracts backed by registered handlers', () => {
  const registry = createTurnStepExecutionRegistry({
    domain: { request_movement: async () => ({}) },
    operationContract: {
      request_movement: { owner: '@rus/movement-routes',
        movement_kinds: ['local'] }
    }
  });
  const contract = registry.operationContract();
  assert.deepEqual(contract, {
    request_movement: { owner: '@rus/movement-routes',
      movement_kinds: ['local'] }
  });
  contract.request_movement.movement_kinds.push('remote');
  assert.deepEqual(registry.operationContract().request_movement
    .movement_kinds, ['local']);
  assert.throws(() => createTurnStepExecutionRegistry({
    operationContract: { request_activity: { owner: '@rus/turn' } }
  }), /registered handler/u);
});

function checkPolicyRefs() {
  return {
    policy_profile_ref: 'test_generic_check_profile',
    policy_profile_pin: policyProfilePin(),
    check_policy_ref: {
      entity_kind: 'check_policy', entity_id: 'test_check_policy',
      authoring_version: '1'
    },
    consequence_policy_ref: {
      entity_kind: 'consequence_policy',
      entity_id: 'test_consequence_policy', authoring_version: '1'
    }
  };
}

function policyProfilePin() {
  return {
    artifact_id: 'test_turn_step_owner_profiles',
    revision: 1,
    digest: 'a'.repeat(64)
  };
}
