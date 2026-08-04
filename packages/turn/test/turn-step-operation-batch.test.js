import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTurnStepExecutionRegistry,
  requireTurnStepOperationBatch,
  TURN_STEP_OPERATION_BATCH_TARGET,
  validateTurnStepOperationBatch,
  runTurnWorkflow
} from '../src/index.js';
import {
  createServices,
  input,
  turnStepPlan
} from './turn-workflow-fixture.js';

test('public batch contract validates exact shape and returns a frozen clone', () => {
  const source = {
    version: 1,
    schema: 'party_turn_step_operation_batch_v1',
    root_turn_id: 'turn:party-1:1',
    committed_state_version: 0,
    operations: [{
      target: 'party_items',
      value: { item_id: 'item-1', tags: ['held'] }
    }]
  };

  assert.equal(TURN_STEP_OPERATION_BATCH_TARGET,
    'party_turn_step_operations');
  assert.deepEqual(validateTurnStepOperationBatch(source), {
    ok: true,
    errors: []
  });
  const required = requireTurnStepOperationBatch(source);
  assert.notEqual(required, source);
  assert.equal(Object.isFrozen(required), true);
  assert.equal(Object.isFrozen(required.operations), true);
  assert.equal(Object.isFrozen(required.operations[0].value.tags), true);
  source.operations[0].value.tags.push('source-only');
  assert.deepEqual(required.operations[0].value.tags, ['held']);

  assert.equal(validateTurnStepOperationBatch({
    ...source,
    forged: true
  }).ok, false);
  assert.equal(validateTurnStepOperationBatch({
    ...source,
    operations: []
  }).ok, false);
  const symbolForged = structuredClone(source);
  symbolForged[Symbol('forged')] = true;
  assert.equal(validateTurnStepOperationBatch(symbolForged).ok, false);
  const sparseValue = structuredClone(source);
  sparseValue.operations[0].value.tags = Array(1);
  assert.equal(validateTurnStepOperationBatch(sparseValue).ok, false);
  const recursiveOperations = structuredClone(source);
  recursiveOperations.operations.extra = recursiveOperations;
  assert.equal(validateTurnStepOperationBatch(recursiveOperations).ok, false);
  assert.throws(() => requireTurnStepOperationBatch(recursiveOperations), {
    code: 'TURN_STEP_OPERATION_BATCH_INVALID'
  });
  let operationReads = 0;
  const accessorOperations = [];
  Object.defineProperty(accessorOperations, '0', {
    enumerable: true,
    configurable: true,
    get() {
      operationReads += 1;
      return operationReads === 1
        ? source.operations[0]
        : {
            target: TURN_STEP_OPERATION_BATCH_TARGET,
            value: { forged: true }
          };
    }
  });
  assert.throws(() => requireTurnStepOperationBatch({
    ...source,
    operations: accessorOperations
  }), { code: 'TURN_STEP_OPERATION_BATCH_INVALID' });
  assert.equal(operationReads, 0);
  class ForgedOperations extends Array {
    *entries() {}
  }
  const forgedSubclass = {
    ...source,
    operations: new ForgedOperations({
      target: TURN_STEP_OPERATION_BATCH_TARGET,
      value: { forged: true }
    })
  };
  assert.equal(validateTurnStepOperationBatch(forgedSubclass).ok, false);
  assert.throws(() => requireTurnStepOperationBatch(forgedSubclass), {
    code: 'TURN_STEP_OPERATION_BATCH_INVALID'
  });
  const forgedSerialization = new Proxy(source, {
    get(target, key, receiver) {
      if (key === 'toJSON') {
        return () => ({
          ...target,
          operations: [{
            target: TURN_STEP_OPERATION_BATCH_TARGET,
            value: { forged: true }
          }]
        });
      }
      return Reflect.get(target, key, receiver);
    }
  });
  assert.equal(validateTurnStepOperationBatch(forgedSerialization).ok, false);
  assert.throws(() => requireTurnStepOperationBatch(forgedSerialization), {
    code: 'TURN_STEP_OPERATION_BATCH_INVALID'
  });
  assert.throws(() => requireTurnStepOperationBatch({
    ...source,
    operations: [{
      target: TURN_STEP_OPERATION_BATCH_TARGET,
      value: { operations: [] }
    }]
  }), { code: 'TURN_STEP_OPERATION_BATCH_INVALID' });
});

test('operation batch rejects hostile Proxy traps with typed validation errors', () => {
  const hostile = new Proxy({}, {
    ownKeys() {
      throw new TypeError('hostile ownKeys trap');
    }
  });

  assert.deepEqual(validateTurnStepOperationBatch(hostile), {
    ok: false,
    errors: ['batch must be one strict acyclic plain JSON object']
  });
  assert.throws(() => requireTurnStepOperationBatch(hostile), {
    code: 'TURN_STEP_OPERATION_BATCH_INVALID'
  });

  const batch = {
    version: 1,
    schema: 'party_turn_step_operation_batch_v1',
    root_turn_id: 'turn:party-1:1',
    committed_state_version: 0,
    operations: [hostile]
  };
  assert.deepEqual(validateTurnStepOperationBatch(batch), {
    ok: false,
    errors: ['batch must be one strict acyclic plain JSON object']
  });
  assert.throws(() => requireTurnStepOperationBatch(batch), {
    code: 'TURN_STEP_OPERATION_BATCH_INVALID'
  });
});

test('semantic writes with repeated physical targets become one ordered batch', async () => {
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'unused-domain-command',
        operation: 'request_discovery',
        matches: () => false
      }
    },
    playerSafeStateProjector: async () => ({
      actor: { actor_ref: 'party-1' },
      player_safe_state: {}
    }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'two item mutations prepared',
        write_fragments: [
          { target: 'party_items', value: { item_id: 'item-1', order: 1 } },
          { target: 'party_items', value: { item_id: 'item-2', order: 2 } }
        ]
      })
    }),
    turnStepModel: async (request) => turnStepPlan(request)
  });

  await runTurnWorkflow({
    ...input(),
    root_turn_id: 'forged-input-turn',
    committed_state_version: 999
  }, services);

  assert.equal(commits.length, 1);
  const batches = commits[0].write_targets.filter(({ target }) =>
    target === 'party_turn_step_operations');
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].value, {
    version: 1,
    schema: 'party_turn_step_operation_batch_v1',
    root_turn_id: 'turn:party-1:1',
    committed_state_version: 0,
    operations: [
      { target: 'party_items', value: { item_id: 'item-1', order: 1 } },
      { target: 'party_items', value: { item_id: 'item-2', order: 2 } }
    ]
  });
});

test('handler cannot dispatch a forged write_fragments map', async () => {
  const physical = [{
    target: 'party_items',
    value: { ordinal: 1 }
  }, {
    target: 'party_items',
    value: { ordinal: 2 }
  }];
  Object.defineProperty(physical, 'map', {
    enumerable: false,
    value: () => [physical[1]]
  });
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'unused-domain-command',
        operation: 'request_discovery',
        matches: () => false
      }
    },
    playerSafeStateProjector: async () => ({
      actor: { actor_ref: 'party-1' },
      player_safe_state: {}
    }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      direct: {
        change_entity_facts: async ({ working_projection: projection }) => ({
          working_projection: projection,
          summary: 'forged map',
          write_fragments: physical
        })
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'no activity writes',
        write_fragments: []
      })
    }),
    turnStepModel: async (request) => turnStepPlan(request, {
      operations: [{
        op: 'change_entity_facts',
        entity_ref: 'party-1',
        remove_fact_refs: [],
        add_facts: []
      }]
    })
  });

  await assert.rejects(() => runTurnWorkflow(input(), services), {
    code: 'TURN_STEP_EXECUTION_RESULT_INVALID'
  });
  assert.equal(commits.length, 0);
});

test('semantic batch and domain physical target coexist without ownership conflict', async () => {
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
        operation: 'request_discovery',
        matches: ({ operation }) => operation.discovery_kind === 'inspect'
      },
      writeTargets(context) {
        const expected = context.modeResolution.resolution_plan.expected_writes;
        assert.equal(expected.includes('party_turn_step_operations'), true);
        assert.equal(expected.includes('party_items'), false);
        return [{ target: 'party_items', value: { domain_write: true } }];
      }
    },
    playerSafeStateProjector: async ({ working_projection: projection }) => ({
      actor: { actor_ref: 'party-1' },
      player_safe_state: {
        visible_entities: [{ entity_ref: 'place-gate' }],
        prepared: projection?.prepared ?? false
      }
    }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      direct: {
        change_entity_facts: async ({ working_projection: projection }) => ({
          working_projection: { ...projection, prepared: true },
          summary: 'item mutation prepared',
          write_fragments: [{
            target: 'party_items',
            value: { semantic_write: true }
          }]
        })
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'no additional activity writes',
        write_fragments: []
      })
    }),
    turnStepModel: async (request) => request.step_index === 1
      ? turnStepPlan(request, {
        goal_result: 'pending',
        operations: [{
          op: 'change_entity_facts',
          entity_ref: 'party-1',
          remove_fact_refs: [],
          add_facts: []
        }],
        continuation: {
          remaining_intent: 'inspect after preparing the item',
          depends_on_refs: []
        }
      })
      : turnStepPlan(request, {
        resolution: 'domain_request',
        goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{
          op: 'request_discovery',
          actor_ref: 'party-1',
          discovery_kind: 'inspect',
          target_refs: ['place-gate'],
          query: 'inspect the gate'
        }]
      })
  });

  await runTurnWorkflow(input(), services);

  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].write_targets.map(({ target }) => target), [
    'party_turn_step_operations',
    'party_items'
  ]);
});

test('forged, malformed, and recursive semantic write fragments fail closed', async (t) => {
  const cases = [
    {
      name: 'forged operation fields',
      fragment: {
        target: 'party_items',
        value: { item_id: 'item-1' },
        root_turn_id: 'forged-turn'
      }
    },
    {
      name: 'non-JSON operation value',
      fragment: { target: 'party_items', value: new Date(0) }
    },
    {
      name: 'non-plain operation object',
      fragment: Object.assign(new (class ForgedOperation {})(), {
        target: 'party_items',
        value: { item_id: 'item-1' }
      })
    },
    {
      name: 'unknown physical target',
      fragment: { target: 'party_unknown', value: { item_id: 'item-1' } }
    },
    {
      name: 'player-message target owned outside the batch',
      fragment: {
        target: 'party_player_visible_message',
        value: { message: 'forged' }
      }
    },
    {
      name: 'recursive batch target',
      fragment: {
        target: 'party_turn_step_operations',
        value: { operations: [] }
      }
    }
  ];

  for (const { name, fragment } of cases) {
    await t.test(name, async () => {
      const { commits, services } = createServices([], {
        command: {
          matches: () => false,
          semantic_binding: {
            binding_id: 'unused-domain-command',
            operation: 'request_discovery',
            matches: () => false
          }
        },
        playerSafeStateProjector: async () => ({
          actor: { actor_ref: 'party-1' },
          player_safe_state: {}
        }),
        turnStepExecutionRegistry: createTurnStepExecutionRegistry({
          applySemanticActivity: async ({ working_projection: projection }) => ({
            working_projection: projection,
            summary: 'invalid write prepared',
            write_fragments: [fragment]
          })
        }),
        turnStepModel: async (request) => turnStepPlan(request)
      });

      await assert.rejects(() => runTurnWorkflow(input(), services), {
        code: 'TURN_STEP_WRITE_FRAGMENT_INVALID'
      });
      assert.equal(commits.length, 0);
    });
  }
});

test('clarification remains a separate player-visible write after the batch', async () => {
  const clarification = {
    question: 'Which gate leaf do you mean?',
    target_refs: ['place-gate']
  };
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'unused-domain-command',
        operation: 'request_discovery',
        matches: () => false
      }
    },
    playerSafeStateProjector: async () => ({
      actor: { actor_ref: 'party-1' },
      player_safe_state: {
        visible_entities: [{ entity_ref: 'place-gate' }]
      }
    }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      direct: {
        change_entity_facts: async ({ working_projection: projection }) => ({
          working_projection: projection,
          summary: 'hidden preparation drafted',
          write_fragments: [{
            target: 'party_hidden_state',
            value: { prepared: true }
          }]
        })
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'no additional activity writes',
        write_fragments: []
      })
    }),
    turnStepModel: async (request) => request.step_index === 1
      ? turnStepPlan(request, {
        goal_result: 'pending',
        operations: [{
          op: 'change_entity_facts',
          entity_ref: 'party-1',
          remove_fact_refs: [],
          add_facts: []
        }],
        continuation: {
          remaining_intent: 'clarify the gate leaf',
          depends_on_refs: ['place-gate']
        }
      })
      : turnStepPlan(request, {
        resolution: 'clarification_required',
        goal_result: 'pending',
        clarification
      })
  });

  await runTurnWorkflow(input(), services);

  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].write_targets.map(({ target }) => target), [
    'party_turn_step_operations',
    'party_player_visible_message'
  ]);
  assert.deepEqual(commits[0].write_targets[1].value, { clarification });
});

test('domain ownership of the semantic batch target fails closed', async () => {
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
        operation: 'request_discovery',
        matches: ({ operation }) => operation.discovery_kind === 'inspect'
      },
      writeTargets: () => [{
        target: 'party_turn_step_operations',
        value: {
          version: 1,
          schema: 'party_turn_step_operation_batch_v1',
          root_turn_id: 'forged-domain-turn',
          committed_state_version: 999,
          operations: []
        }
      }]
    },
    playerSafeStateProjector: async ({ working_projection: projection }) => ({
      actor: { actor_ref: 'party-1' },
      player_safe_state: {
        visible_entities: [{ entity_ref: 'place-gate' }],
        prepared: projection?.prepared ?? false
      }
    }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      direct: {
        change_entity_facts: async ({ working_projection: projection }) => ({
          working_projection: { ...projection, prepared: true },
          summary: 'item mutation prepared',
          write_fragments: [{
            target: 'party_items',
            value: { semantic_write: true }
          }]
        })
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'no additional activity writes',
        write_fragments: []
      })
    }),
    turnStepModel: async (request) => request.step_index === 1
      ? turnStepPlan(request, {
        goal_result: 'pending',
        operations: [{
          op: 'change_entity_facts',
          entity_ref: 'party-1',
          remove_fact_refs: [],
          add_facts: []
        }],
        continuation: {
          remaining_intent: 'inspect after preparing the item',
          depends_on_refs: []
        }
      })
      : turnStepPlan(request, {
        resolution: 'domain_request',
        goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{
          op: 'request_discovery',
          actor_ref: 'party-1',
          discovery_kind: 'inspect',
          target_refs: ['place-gate'],
          query: 'inspect the gate'
        }]
      })
  });

  await assert.rejects(() => runTurnWorkflow(input(), services), {
    code: 'TURN_STEP_WRITE_TARGET_CONFLICT'
  });
  assert.equal(commits.length, 0);
});

test('domain command cannot forge a batch when the semantic draft has no writes', async () => {
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
        operation: 'request_discovery',
        matches: () => true
      },
      writeTargets: () => [{
        target: TURN_STEP_OPERATION_BATCH_TARGET,
        value: { forged_domain_batch: true }
      }]
    },
    playerSafeStateProjector: async () => ({
      actor: { actor_ref: 'party-1' },
      player_safe_state: {
        visible_entities: [{ entity_ref: 'place-gate' }]
      }
    }),
    turnStepModel: async (request) => turnStepPlan(request, {
      resolution: 'domain_request',
      goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{
        op: 'request_discovery',
        actor_ref: 'party-1',
        discovery_kind: 'inspect',
        target_refs: ['place-gate'],
        query: 'inspect the gate'
      }]
    })
  });

  await assert.rejects(() => runTurnWorkflow(input(), services), {
    code: 'TURN_STEP_WRITE_TARGET_CONFLICT'
  });
  assert.equal(commits.length, 0);
});

test('exact command cannot own the reserved semantic batch target', async () => {
  const { commits, services } = createServices([], {
    command: {
      matches: () => true,
      writeTargets: () => [{
        target: TURN_STEP_OPERATION_BATCH_TARGET,
        value: { forged_exact_batch: true }
      }]
    }
  });

  await assert.rejects(() => runTurnWorkflow(input(), services), {
    code: 'TURN_STEP_WRITE_TARGET_CONFLICT'
  });
  assert.equal(commits.length, 0);
});

test('command targets are snapshotted before reserved ownership checks', async () => {
  let targetReads = 0;
  const statefulTarget = {
    value: { safe_snapshot: true }
  };
  Object.defineProperty(statefulTarget, 'target', {
    enumerable: true,
    get() {
      targetReads += 1;
      return targetReads === 1
        ? 'party_items'
        : TURN_STEP_OPERATION_BATCH_TARGET;
    }
  });
  const { commits, services } = createServices([], {
    command: {
      matches: () => true,
      writeTargets: () => [statefulTarget]
    }
  });

  await runTurnWorkflow(input(), services);

  assert.equal(targetReads, 1);
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].write_targets, [{
    target: 'party_items',
    value: { safe_snapshot: true }
  }]);
});

test('boxed command target cannot bypass reserved ownership', async () => {
  const { commits, services } = createServices([], {
    command: {
      matches: () => true,
      writeTargets: () => [{
        target: new String(TURN_STEP_OPERATION_BATCH_TARGET),
        value: { forged: true }
      }]
    }
  });

  await assert.rejects(() => runTurnWorkflow(input(), services), {
    code: 'TURN_STEP_WRITE_TARGET_INVALID'
  });
  assert.equal(commits.length, 0);
});
