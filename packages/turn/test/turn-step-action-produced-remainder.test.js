import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTurnCommandRegistry,
  createTurnStepExecutionRegistry,
  runTurnWorkflow
} from '../src/index.js';
import { isActionProductionOwnerInScope } from
  '../src/turn-step-admission.js';
import {
  createServices,
  input,
  turnStepPlan
} from './turn-workflow-fixture.js';

test('A1 action-production owner runs only after external and authored owners',
  async () => {
    let externalCalls = 0;
    let authoredCalls = 0;
    let remainderCalls = 0;
    const external = servicesFor({
      bindingMatches() {
        authoredCalls += 1;
        return true;
      },
      resolver() {
        remainderCalls += 1;
        return appliedResult();
      },
      executionRegistry: createTurnStepExecutionRegistry({
        applySemanticActivity: noTimeActivity,
        domain: {
          request_item_use: ({ working_projection: projection }) => {
            externalCalls += 1;
            return appliedResult(projection);
          }
        }
      })
    });
    await runTurnWorkflow(actionInput(), external);
    assert.equal(externalCalls, 1);
    assert.equal(authoredCalls, 0);
    assert.equal(remainderCalls, 0);

    authoredCalls = 0;
    const authored = servicesFor({
      bindingMatches() {
        authoredCalls += 1;
        return true;
      },
      resolver() {
        remainderCalls += 1;
        return appliedResult();
      }
    });
    await runTurnWorkflow(actionInput(), authored);
    assert.equal(authoredCalls, 1);
    assert.equal(remainderCalls, 0);
  });

test('ambiguous authored bindings fail before A1 action-production owner',
  async () => {
    let remainderCalls = 0;
    const services = servicesFor({
      bindingMatches: () => true,
      resolver() {
        remainderCalls += 1;
        return appliedResult();
      }
    });
    const original = services.commandRegistry.get('inspect_cart');
    services.commandRegistry = createTurnCommandRegistry([
      { ...original, semantic_binding: binding('authored-a', () => true) },
      { ...original, command_id: 'inspect_cart_second',
        option_id: 'inspect_cart_second',
        semantic_binding: binding('authored-b', () => true) }
    ]);

    await assert.rejects(() => runTurnWorkflow(actionInput(), services), {
      code: 'TURN_STEP_DOMAIN_BINDING_AMBIGUOUS'
    });
    assert.equal(remainderCalls, 0);
  });

test('unregistered reasonable wordings reach the A1 physical owner',
  async () => {
    const wordings = [
      'Снимаю ножом тонкую стружку с жерди.',
      'Подрезаю ножом неглубокую зарубку на жерди.',
      'Выравниваю ножом сколотый край жерди.'
    ];
    for (const rawText of wordings) {
      let modelCalls = 0;
      let resolverCalls = 0;
      const services = servicesFor({
        resolver(envelope) {
          resolverCalls += 1;
          assert.equal(envelope.request.remaining_intent, rawText);
          return appliedResult(envelope.working_projection);
        }
      });
      const model = services.turnStepModel;
      services.turnStepModel = (request) => {
        modelCalls += 1;
        return model(request);
      };

      const result = await runTurnWorkflow(actionInput(rawText), services);
      assert.equal(result.status, 'partial');
      assert.equal(modelCalls, 1);
      assert.equal(resolverCalls, 1);
    }
  });

test('exact registered recipe handler remains code-first with no model call',
  async () => {
    let stepModelCalls = 0;
    let boundedModelCalls = 0;
    const exactWords = 'Обрабатываю заготовку по известному рецепту.';
    const { services } = createServices([], {
      command: {
        command_id: 'registered_recipe_shape',
        matches: ({ raw_text: rawText }) => rawText === exactWords
      },
      turnStepModel() {
        stepModelCalls += 1;
        throw new Error('semantic step model must not run for exact recipe');
      },
      semanticResolver() {
        boundedModelCalls += 1;
        throw new Error('bounded model must not run for exact recipe');
      }
    });

    const result = await runTurnWorkflow({
      ...input(), raw_text: exactWords
    }, services);
    assert.equal(result.status, 'resolved');
    assert.equal(stepModelCalls, 0);
    assert.equal(boundedModelCalls, 0);
  });

test('A1 action-production owner receives a deeply immutable detached envelope',
  async () => {
    let received = null;
    const projection = actionProjection();
    projection.initial_working_projection = {
      visible_objects: structuredClone(
        projection.player_safe_state.visible_objects)
    };
    const services = servicesFor({
      projection,
      resolver(envelope) {
        received = envelope;
        assert.equal(envelope.schema,
          'turn_step_action_produced_remainder_request_v1');
        for (const key of [
          'operation', 'plan', 'request', 'actor', 'working_projection',
          'committed_state', 'prepared_chain_context',
          'prepared_ordinary_materialization_atomic_write_plan'
        ]) {
          assert.equal(Object.hasOwn(envelope, key), true);
        }
        assert.equal(Object.hasOwn(envelope, 'check_result'), false);
        assert.equal(envelope
          .prepared_ordinary_materialization_atomic_write_plan, null);
        assert.equal(Object.isFrozen(envelope), true);
        assert.equal(Object.isFrozen(envelope.operation), true);
        assert.equal(Object.isFrozen(envelope.operation.target_refs), true);
        assert.equal(Object.isFrozen(envelope.working_projection), true);
        assert.equal(Object.isFrozen(envelope.committed_state), true);
        assert.throws(() => {
          envelope.operation.item_ref = 'item:forged';
        }, TypeError);
        assert.equal(Object.hasOwn(envelope.working_projection,
          'action_production'), false);
        assert.throws(() => {
          envelope.working_projection.visible_objects.push({});
        }, TypeError);
        return appliedResult(envelope.working_projection);
      }
    });

    const result = await runTurnWorkflow(actionInput(), services);
    assert.equal(result.status, 'partial');
    assert.equal(received.operation.item_ref, 'item:pole');
    assert.equal(received.request.remaining_intent,
      'Заостряю жердь доступным ножом.');
  });

test('A1 reuses generic check RNG and prepared semantic activity time owners',
  async () => {
    const calls = { random: 0, resolver: 0, activity: 0, time: 0, body: 0 };
    const registry = createTurnStepExecutionRegistry({
      applySemanticActivity(execution) {
        calls.activity += 1;
        assert.equal(execution.check_result.roll, 11);
        assert.equal(execution.operation.activity.duration_class, 'extended');
        assert.equal('process_kind' in execution.operation.activity, false);
        const activity = {
          version: 1,
          schema: 'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
          activity_id: 'activity:action-produced',
          root_turn_id: execution.request.root_turn_id,
          step_index: execution.plan.step_index,
          profile_ref: 'existing-a1-activity-profile',
          duration_class: execution.operation.activity.duration_class,
          duration_minutes: 90,
          effort: execution.operation.activity.effort
        };
        return {
          working_projection: execution.working_projection,
          summary: 'existing semantic activity owner',
          write_fragments: [{ target: 'party_events', value: activity }],
          consequence_fragment: { duration_minutes: 90,
            state_changes: [{ kind: 'semantic_activity',
              activity_id: activity.activity_id,
              profile_ref: activity.profile_ref,
              profile_pin: { artifact_id: 'a1-activity-profiles', revision: 1,
                digest: 'b'.repeat(64) },
              duration_class: activity.duration_class,
              effort: activity.effort,
              body_effect_profile_ref: 'body:extended:moderate' }] },
          prepared_effect_request: {
            effect_kind: 'semantic_activity',
            owner_ref: 'existing-a1-activity-profile',
            operation_ref: 'activity:action-produced',
            availability: null,
            consequence: { duration_minutes: 90 }
          }
        };
      }
    });
    const services = servicesFor({
      executionRegistry: registry,
      availability: () => ({ version: 1,
        schema: 'turn_availability_decision', status: 'available',
        can_attempt: true, reasons: [], check_requests: [] }),
      resolver(envelope) {
        calls.resolver += 1;
        assert.equal(envelope.schema,
          'turn_step_action_produced_remainder_request_v2');
        assert.equal(envelope.check_result.roll, 11);
        assert.equal(envelope.check_result.difficulty, 15);
        assert.equal(envelope.plan.check.difficulty_id, 'risky');
        assert.equal('difficulty' in envelope.plan.check, false);
        assert.equal(Object.isFrozen(envelope.check_result), true);
        return appliedResult(envelope.working_projection);
      }
    });
    services.randomSource = {
      next() { calls.random += 1; return 0.5; }
    };
    services.turnStepCheckContextResolver = async () => ({
      attribute_value: 10, skill_bonus: 0, state_modifier: 0,
      equipment_modifier: 0, circumstance_modifier: 0,
      policy_profile_ref: 'a1-check-profile',
      policy_profile_pin: { artifact_id: 'a1-check-profile', revision: 1,
        digest: 'a'.repeat(64) },
      check_policy_ref: { entity_kind: 'check_policy',
        entity_id: 'a1-check-profile', authoring_version: '1' },
      consequence_policy_ref: { entity_kind: 'consequence_policy',
        entity_id: 'a1-result', authoring_version: '1' }
    });
    services.turnStepPreparedEffectContext = {
      current_clock: at(0), current_body_state: { fatigue: 0 }
    };
    services.turnStepPreparedEffectTimeOwner = async ({
      prepared_chain_context: context, consequence
    }) => {
      calls.time += 1;
      const duration = consequence.duration_minutes;
      return { version: 2, schema: 'turn_time_update',
        owner: '@rus/time-events-history',
        clock_before: context.current_clock,
        clock_after: at(Number(context.current_clock.whole_minutes) + duration),
        exact_elapsed: minutes(duration), nearest_boundary: null };
    };
    services.turnStepPreparedEffectBodyOwner = async ({
      prepared_chain_context: context
    }) => {
      calls.body += 1;
      return { version: 1, schema: 'turn_body_update', owner: '@rus/body-state',
        applied: false, proposal: null,
        state_after: context.current_body_state };
    };
    services.turnStepModel = (request) => turnStepPlan(request,
      genericA1Plan());

    const result = await runTurnWorkflow(actionInput(), services);
    assert.equal(result.status, 'partial');
    assert.equal(result.summary.duration_minutes, 90);
    assert.deepEqual(calls,
      { random: 1, resolver: 1, activity: 1, time: 1, body: 1 });
  });

test('A1 qualitative plan cannot provide rolls, difficulty numbers or duration',
  async () => {
    let resolverCalls = 0;
    let randomCalls = 0;
    const services = servicesFor({
      resolver() { resolverCalls += 1; return appliedResult(); }
    });
    services.randomSource = {
      next() { randomCalls += 1; return 0.5; }
    };
    services.turnStepModel = (request) => {
      const plan = turnStepPlan(request, genericA1Plan());
      plan.check.difficulty = 5;
      plan.activity.duration_minutes = 1;
      plan.check.roll = 20;
      return plan;
    };
    await assert.rejects(() => runTurnWorkflow(actionInput(), services), {
      code: 'TURN_STEP_PLAN_INVALID'
    });
    assert.equal(resolverCalls, 0);
    assert.equal(randomCalls, 0);
  });

test('A1 scope gate is exact, visible-only and dormant without its port',
  async () => {
    const cases = [
      { name: 'missing marker', projection: actionProjection(null) },
      { name: 'disabled marker', projection: actionProjection({
        semantic_grounding_available: false
      }) },
      { name: 'extra marker field', projection: actionProjection({
        semantic_grounding_available: true, extra: true
      }) },
      { name: 'wrong use kind', useKind: 'consume' },
      { name: 'known but nonvisible item', itemRef: 'item:hidden',
        projection: actionProjection(undefined, {
          known_refs: [{ item_id: 'item:hidden' }]
        }) },
      { name: 'known but nonvisible target', targetRefs: ['item:hidden'],
        projection: actionProjection(undefined, {
          known_refs: [{ item_id: 'item:hidden' }]
        }) }
    ];
    let calls = 0;
    for (const entry of cases) {
      const services = servicesFor({
        projection: entry.projection,
        useKind: entry.useKind,
        itemRef: entry.itemRef,
        targetRefs: entry.targetRefs,
        resolver() {
          calls += 1;
          return appliedResult();
        }
      });
      await assert.rejects(() => runTurnWorkflow(actionInput(), services), {
        code: 'TURN_STEP_DOMAIN_BINDING_MISSING'
      }, entry.name);
    }
    assert.equal(calls, 0);

    const missingPort = servicesFor({ resolver: null, targetRefs: [] });
    await assert.rejects(() => runTurnWorkflow(actionInput(), missingPort), {
      code: 'TURN_STEP_DOMAIN_BINDING_MISSING'
    });
  });

test('A1 scope predicate rejects hostile marker data without reading getters',
  () => {
    const operation = itemUseOperation();
    const enabled = actionProjection().player_safe_state;
    assert.equal(isActionProductionOwnerInScope({
      operation, playerSafeState: enabled,
      remainingIntent: 'заострить жердь'
    }), true);
    assert.equal(isActionProductionOwnerInScope({
      operation: { ...operation, target_refs: [] },
      playerSafeState: enabled, remainingIntent: 'заострить жердь'
    }), true);
    for (const marker of [null,
      { semantic_grounding_available: false },
      { semantic_grounding_available: true, extra: true }]) {
      assert.equal(isActionProductionOwnerInScope({
        operation,
        playerSafeState: actionProjection(marker).player_safe_state,
        remainingIntent: 'заострить жердь'
      }), false);
    }

    let reads = 0;
    const topAccessor = actionProjection().player_safe_state;
    Object.defineProperty(topAccessor, 'action_production', {
      enumerable: true,
      get() {
        reads += 1;
        return { semantic_grounding_available: true };
      }
    });
    const nestedAccessor = {};
    Object.defineProperty(nestedAccessor, 'semantic_grounding_available', {
      enumerable: true,
      get() {
        reads += 1;
        return true;
      }
    });
    for (const playerSafeState of [
      topAccessor,
      actionProjection(nestedAccessor).player_safe_state,
      Object.assign(Object.create({ action_production: {
        semantic_grounding_available: true
      } }), { visible_objects: enabled.visible_objects })
    ]) {
      assert.equal(isActionProductionOwnerInScope({
        operation, playerSafeState, remainingIntent: 'заострить жердь'
      }), false);
    }
    assert.equal(reads, 0);

    const hostileOperation = itemUseOperation();
    Object.defineProperty(hostileOperation, 'item_ref', {
      enumerable: true,
      get() {
        reads += 1;
        return 'item:pole';
      }
    });
    assert.equal(isActionProductionOwnerInScope({
      operation: hostileOperation, playerSafeState: enabled,
      remainingIntent: 'заострить жердь'
    }), false);
    assert.equal(reads, 0);
    assert.equal(isActionProductionOwnerInScope({
      operation, playerSafeState: enabled, remainingIntent: ''
    }), false);
    assert.equal(isActionProductionOwnerInScope({
      operation: { ...operation, target_refs: ['item:knife', 'item:knife'] },
      playerSafeState: enabled, remainingIntent: 'заострить жердь'
    }), false);
  });

test('A1 resolver result keeps the existing execution-result validation',
  async () => {
    const services = servicesFor({ resolver: () => ({
      working_projection: null,
      write_fragments: []
    }) });
    await assert.rejects(() => runTurnWorkflow(actionInput(), services), {
      code: 'TURN_STEP_EXECUTION_RESULT_INVALID'
    });
  });

function servicesFor({ bindingMatches = () => false, resolver = () =>
  appliedResult(), executionRegistry, projection = actionProjection(),
  useKind = 'other', itemRef = 'item:pole',
  targetRefs = ['item:knife'], availability = null } = {}) {
  return createServices([], {
    command: {
      matches: () => false,
      ...(availability == null ? {} : { availability }),
      semantic_binding: binding('unmatched-item-owner', bindingMatches)
    },
    playerSafeStateProjector: () => projection,
    turnStepExecutionRegistry: executionRegistry ??
      createTurnStepExecutionRegistry({ applySemanticActivity: noTimeActivity }),
    ...(resolver == null ? {} : {
      turnStepActionProductionOwner: resolver
    }),
    turnStepModel: (request) => turnStepPlan(request, {
      resolution: 'domain_request',
      goal_result: 'pending',
      activity: useKind === 'other'
        ? { owner: 'semantic', duration_class: 'brief', effort: 'light' }
        : { owner: 'domain', duration_class: null, effort: null },
      operations: [itemUseOperation({ useKind, itemRef, targetRefs })],
      continuation: null
    })
  }).services;
}

function noTimeActivity({ working_projection: projection }) {
  return { working_projection: projection, write_fragments: [],
    consequence_fragment: null };
}

function actionProjection(marker = undefined, extra = {}) {
  const resolvedMarker = marker === undefined ? {
    semantic_grounding_available: true,
    max_new_entities: 4,
    allowed_identity_modes: [
      'preserve_source', 'independent_outputs', 'no_useful_result'
    ],
    allowed_origins: ['direct_partition', 'crafted'],
    allowed_result_classes: [
      'ordinary_physical_result', 'partial_transformation',
      'nonworking_construction', 'waste', 'written_carrier',
      'no_useful_result'
    ],
    allowed_output_classes: [
      'ordinary_mundane', 'weapon_capable', 'money_like_token',
      'written_carrier'
    ],
    allowed_physical_forms: ['compact', 'regular', 'long', 'bulky']
  } : marker;
  return {
    actor: { actor_ref: 'party-1' },
    player_safe_state: {
      visible_objects: [
        visibleObject('item:pole'),
        visibleObject('item:knife')
      ],
      ...(resolvedMarker == null ? {} : {
        action_production: resolvedMarker
      }),
      ...extra
    }
  };
}

function visibleObject(entityId) {
  return {
    entity_ref: { entity_kind: 'item', entity_id: entityId },
    display_label: entityId,
    recognition: 'recognized',
    visible_status: 'visible'
  };
}

function itemUseOperation({ useKind = 'other', itemRef = 'item:pole',
  targetRefs = ['item:knife'], actionProduction = undefined } = {}) {
  return {
    op: 'request_item_use',
    actor_ref: 'party-1',
    item_ref: itemRef,
    use_kind: useKind,
    target_refs: targetRefs,
    ...(useKind !== 'other' ? {} : { action_production:
      actionProduction ?? {
        source_refs: [itemRef], tool_refs: targetRefs, output_count: 0,
        identity_mode: 'preserve_source', origin: null,
        result_class: 'partial_transformation',
        material_extent: null,
        result_descriptor: { display_name: null,
          physical_description: 'Жердь физически обработана.',
          qualitative_facts: ['на конце жерди видны свежие срезы'],
          removed_physical_fact_refs: [],
          inscription_text: null, physical_form: 'long' },
        output_class: 'ordinary_mundane'
      } })
  };
}

function binding(bindingId, matches) {
  return {
    binding_id: bindingId,
    operation: 'request_item_use',
    matches
  };
}

function actionInput(rawText = 'Заостряю жердь доступным ножом.') {
  return {
    ...input(),
    raw_text: rawText
  };
}

function appliedResult(projection = actionProjection().player_safe_state) {
  return {
    working_projection: projection,
    summary: 'action produced semantic remainder resolved',
    write_fragments: [{
      target: 'party_hidden_state',
      value: { action_produced_remainder: true }
    }],
    player_response_boundary: true
  };
}

function genericA1Plan() {
  const operation = itemUseOperation();
  const outcome = () => ({
    goal_result: 'achieved', additional_activity: null,
    operations: [operation], continuation: null
  });
  return {
    resolution: 'generic_check', goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'extended',
      effort: 'moderate' },
    operations: [],
    check: {
      purpose: 'risk of an uncertain physical transformation',
      attribute_ref: 'party-1', skill_ref: null, difficulty_id: 'risky',
      outcomes: {
        clean_success: outcome(), success: outcome(),
        success_with_cost: outcome(),
        failure_with_consequence: outcome(), severe_failure: outcome()
      }
    },
    continuation: null, reason_code: 'generic_uncertainty',
    reason: 'Existing generic check and activity owners apply.'
  };
}

function at(minutesValue) {
  return { whole_minutes: String(minutesValue), subminute_numerator: '0',
    subminute_denominator: '1' };
}

function minutes(value) {
  return { exact_minutes: { numerator: String(value), denominator: '1' } };
}
