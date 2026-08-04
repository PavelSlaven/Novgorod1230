import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTurnStepExecutionRegistry,
  runTurnWorkflow
} from '../src/index.js';
import {
  committedTurnState,
  createServices,
  input,
  turnStepPlan
} from './turn-workflow-fixture.js';

test('direct preparation and a later clarification are persisted in one commit', async () => {
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
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
          summary: 'preparation drafted',
          write_fragments: [{
            target: 'party_hidden_state', value: { prepared: true }
          }]
        })
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'activity drafted',
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
            remaining_intent: 'уточнить створку',
            depends_on_refs: ['place-gate']
          }
        })
      : turnStepPlan(request, {
          resolution: 'clarification_required',
          goal_result: 'pending',
          clarification: {
            question: 'Какую створку ты имеешь в виду?',
            target_refs: ['place-gate']
          }
        })
  });

  const result = await runTurnWorkflow({
    ...input(), raw_text: 'Подготавливаю ворота, затем осматриваю створку.'
  }, services);

  assert.equal(result.status, 'partial');
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].write_targets, [{
    target: 'party_turn_step_operations',
    value: {
      version: 1,
      schema: 'party_turn_step_operation_batch_v1',
      root_turn_id: 'turn:party-1:1',
      committed_state_version: 0,
      operations: [{
        target: 'party_hidden_state', value: { prepared: true }
      }]
    }
  }, {
    target: 'party_player_visible_message',
    value: {
      clarification: {
        question: 'Какую створку ты имеешь в виду?',
        target_refs: ['place-gate']
      }
    }
  }]);
});

test('semantic draft consequence fragments cannot overwrite hidden updates', async () => {
  let effects = 0;
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
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
          summary: 'conflicting consequence drafted',
          write_fragments: [],
          consequence_fragment: {
            hidden_update: { prepared: ++effects }
          }
        })
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'activity drafted',
        write_fragments: []
      })
    }),
    turnStepModel: async (request) => turnStepPlan(request, {
      goal_result: request.step_index === 1 ? 'pending' : 'achieved',
      operations: [{
        op: 'change_entity_facts',
        entity_ref: 'party-1',
        remove_fact_refs: [],
        add_facts: []
      }],
      continuation: request.step_index === 1 ? {
        remaining_intent: 'повторить подготовку',
        depends_on_refs: ['place-gate']
      } : null
    })
  });

  await assert.rejects(() => runTurnWorkflow({
    ...input(), raw_text: 'Дважды меняю одну скрытую подготовку.'
  }, services), { code: 'TURN_STEP_CONSEQUENCE_CONFLICT' });
  assert.equal(commits.length, 0);
});

test('semantic draft rejects an invalid consequence duration before commit', async () => {
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
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
          summary: 'invalid duration drafted',
          write_fragments: [],
          consequence_fragment: { duration_minutes: -1 }
        })
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'activity drafted',
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

  await assert.rejects(() => runTurnWorkflow({
    ...input(), raw_text: 'Пытаюсь выполнить действие с неверной длительностью.'
  }, services), { code: 'TURN_STEP_CONSEQUENCE_FRAGMENT_INVALID' });
  assert.equal(commits.length, 0);
});

test('stale committed base on the second semantic step prevents a partial commit', async () => {
  let effects = 0;
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
        operation: 'request_discovery',
        matches: () => false
      }
    },
    stateReader: {
      async read(request) {
        return committedTurnState(
          request.turn_step === true && request.step_index === 2 ? 1 : 0
        );
      }
    },
    playerSafeStateProjector: async ({ working_projection: projection }) => ({
      actor: { actor_ref: 'party-1' },
      player_safe_state: {
        visible_entities: [{ entity_ref: 'place-gate' }],
        applied_steps: projection?.applied_steps ?? 0
      }
    }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      direct: {
        change_entity_facts: async ({ working_projection: projection }) => {
          effects += 1;
          return {
            working_projection: {
              ...projection,
              applied_steps: (projection.applied_steps ?? 0) + 1
            },
            summary: 'draft effect prepared',
            write_fragments: [{
              target: 'party_state', value: { applied_steps: effects }
            }]
          };
        }
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'activity prepared',
        write_fragments: []
      })
    }),
    turnStepModel: async (request) => turnStepPlan(request, {
      goal_result: request.step_index === 1 ? 'pending' : 'achieved',
      operations: [{
        op: 'change_entity_facts',
        entity_ref: 'party-1',
        remove_fact_refs: [],
        add_facts: []
      }],
      continuation: request.step_index === 1 ? {
        remaining_intent: 'подготовить второй эффект',
        depends_on_refs: ['party-1']
      } : null
    })
  });

  await assert.rejects(() => runTurnWorkflow({
    ...input(), raw_text: 'Выполняю два связанных действия.'
  }, services), { code: 'TURN_STEP_STATE_STALE' });
  assert.equal(effects, 1);
  assert.equal(commits.length, 0);
});

test('semantic workflow applies at most eight drafts and commits once', async () => {
  let plannerCalls = 0;
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
        operation: 'request_discovery',
        matches: () => false
      }
    },
    playerSafeStateProjector: async ({ working_projection: projection }) => ({
      actor: { actor_ref: 'party-1' },
      player_safe_state: {
        visible_entities: [{ entity_ref: 'place-gate' }],
        applied_steps: projection?.applied_steps ?? 0
      }
    }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ request,
        working_projection: projection }) => ({
        working_projection: {
          ...projection,
          applied_steps: (projection.applied_steps ?? 0) + 1
        },
        summary: `prepared step ${request.step_index}`,
        write_fragments: request.step_index === 1 ? [{
          target: 'party_state', value: { capped_loop: true }
        }] : []
      })
    }),
    turnStepModel: async (request) => {
      plannerCalls += 1;
      return turnStepPlan(request, {
        goal_result: 'pending',
        continuation: {
          remaining_intent: `продолжить шаг ${request.step_index + 1}`,
          depends_on_refs: []
        }
      });
    }
  });

  const result = await runTurnWorkflow({
    ...input(), raw_text: 'Продолжаю сложное действие.'
  }, services);

  assert.equal(plannerCalls, 8);
  assert.equal(result.status, 'partial');
  assert.equal(commits.length, 1);
  assert.equal(commits[0].command_trace.stop_reason, 'step_limit');
});

test('an invalid second plan gets one repair and leaves zero partial commits', async () => {
  const calls = [];
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
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
      applySemanticActivity: async ({ request,
        working_projection: projection }) => ({
        working_projection: { ...projection, first_step_prepared: true },
        summary: 'draft prepared',
        write_fragments: request.step_index === 1 ? [{
          target: 'party_state', value: { first_step_prepared: true }
        }] : []
      })
    }),
    turnStepModel: async (request, repairContext) => {
      calls.push({ step: request.step_index, repair: repairContext != null });
      if (request.step_index === 1) {
        return turnStepPlan(request, {
          goal_result: 'pending',
          continuation: {
            remaining_intent: 'завершить второй шаг',
            depends_on_refs: []
          }
        });
      }
      return { ...turnStepPlan(request), request_id: 'forged-request' };
    }
  });

  await assert.rejects(() => runTurnWorkflow({
    ...input(), raw_text: 'Подготавливаю и завершаю действие.'
  }, services), (error) =>
    error.code === 'TURN_STEP_PLAN_INVALID'
    && error.details.repair_attempted === true);
  assert.deepEqual(calls, [
    { step: 1, repair: false },
    { step: 2, repair: false },
    { step: 2, repair: true }
  ]);
  assert.equal(commits.length, 0);
});

test('semantic draft revalidates its committed base immediately before commit', async () => {
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
        operation: 'request_discovery',
        matches: () => false
      }
    },
    stateReader: {
      async read(request) {
        return committedTurnState(request.final_commit === true ? 1 : 0);
      }
    },
    playerSafeStateProjector: async () => ({
      actor: { actor_ref: 'party-1' },
      player_safe_state: {
        visible_entities: [{ entity_ref: 'place-gate' }]
      }
    }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'terminal draft prepared',
        write_fragments: [{
          target: 'party_state', value: { prepared: true }
        }]
      })
    }),
    turnStepModel: async (request) => turnStepPlan(request)
  });

  await assert.rejects(() => runTurnWorkflow({
    ...input(), raw_text: 'Завершаю действие.'
  }, services), { code: 'TURN_SEMANTIC_STATE_STALE' });
  assert.equal(commits.length, 0);
});
