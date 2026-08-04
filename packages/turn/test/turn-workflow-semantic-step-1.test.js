import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTurnStepExecutionRegistry,
  runTurnWorkflow
} from '../src/index.js';
import {
  createServices,
  genericCheck,
  input,
  turnStepPlan
} from './turn-workflow-fixture.js';

test('semantic loop stops at a registered domain command boundary', async () => {
  let plannerCalls = 0;
  let boundedCalls = 0;
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
        operation: 'request_discovery',
        matches: ({ operation }) =>
          operation.discovery_kind === 'inspect'
          && operation.target_refs.includes('place-gate')
      }
    },
    semanticResolver: async () => {
      boundedCalls += 1;
      return { status: 'unknown' };
    },
    playerSafeStateProjector: async ({ committed_state: state }) => {
      assert.equal(state.relevant_hidden_state.hidden_sentinel,
        'must_not_leak');
      return {
        actor: { actor_ref: 'party-1' },
        player_safe_state: {
          visible_entities: [{ entity_ref: 'place-gate' }]
        }
      };
    },
    turnStepModel: async (request, repair) => {
      plannerCalls += 1;
      assert.equal(JSON.stringify(request).includes('hidden_sentinel'), false);
      assert.equal(Object.isFrozen(request), true);
      assert.equal(repair, undefined);
      return {
        schema: 'turn_step_plan_v1',
        request_id: request.request_id,
        committed_state_version: request.committed_state_version,
        working_revision: request.working_revision,
        step_index: request.step_index,
        interpretation: {
          player_goal: 'осмотреть ворота',
          grounded_attempt: 'осмотреть видимые ворота',
          adaptation: 'literal'
        },
        resolution: 'domain_request',
        goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{
          op: 'request_discovery',
          actor_ref: 'party-1',
          discovery_kind: 'inspect',
          target_refs: ['place-gate'],
          query: 'что видно на воротах'
        }],
        check: null,
        continuation: null,
        clarification: null,
        reason_code: 'domain_inspection',
        reason: 'осмотр принадлежит владельцу discovery'
      };
    }
  });
  const result = await runTurnWorkflow({
    ...input(), raw_text: 'Хочу внимательно изучить створки ворот.'
  }, services);
  assert.equal(result.status, 'resolved');
  assert.equal(plannerCalls, 1);
  assert.equal(boundedCalls, 0);
  assert.equal(commits.length, 1);
  assert.equal(
    commits[0].command_trace.decision_protocol,
    'turn_step_plan_v1'
  );
  assert.equal(commits[0].command_trace.stop_reason, 'player_response');
  assert.equal(commits[0].command_trace.step_count, 1);
});

test('direct preparation and a domain owner produce one aggregated root commit', async () => {
  let domainConsequences = 0;
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
        operation: 'request_discovery',
        matches: ({ operation }) =>
          operation.discovery_kind === 'inspect'
          && operation.target_refs.includes('place-gate')
      },
      consequence(context) {
        domainConsequences += 1;
        return {
          version: 1,
          schema: 'turn_consequence_package',
          status: 'resolved',
          duration_minutes: 5,
          visible_seed: { observation: 'Ворота осмотрены.' },
          hidden_update: { domain_applied: true },
          state_changes: [],
          suggested_actions: []
        };
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
          summary: 'direct preparation',
          write_fragments: [{
            target: 'party_hidden_state', value: { prepared: true }
          }],
          consequence_fragment: {
            hidden_update: { direct_prepared: true }
          }
        })
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'preparation activity',
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
            remaining_intent: 'осмотреть подготовленные ворота',
            depends_on_refs: ['place-gate']
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
            query: 'что видно на подготовленных воротах'
          }]
        })
  });

  const result = await runTurnWorkflow({
    ...input(), raw_text: 'Подготавливаю ворота и осматриваю их.'
  }, services);

  assert.equal(result.status, 'resolved');
  assert.equal(domainConsequences, 1);
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].write_targets.map(({ target }) => target), [
    'party_turn_step_operations',
    'party_state',
    'party_visible_context_package'
  ]);
  assert.deepEqual(commits[0].write_targets[0].value.operations, [{
    target: 'party_hidden_state', value: { prepared: true }
  }]);
});

test('draft and domain owners cannot silently overwrite one write target', async () => {
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
        operation: 'request_discovery',
        matches: () => true
      },
      writeTargets: () => [{
        target: 'party_turn_step_operations',
        value: { forged_domain_batch: true }
      }]
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
          summary: 'conflicting draft',
          write_fragments: [{
            target: 'party_state', value: { draft: true }
          }]
        })
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'activity',
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
            remaining_intent: 'осмотреть ворота',
            depends_on_refs: ['place-gate']
          }
        })
      : turnStepPlan(request, {
          resolution: 'domain_request',
          goal_result: 'pending',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operations: [{
            op: 'request_discovery', actor_ref: 'party-1',
            discovery_kind: 'inspect', target_refs: ['place-gate'],
            query: 'что видно'
          }]
        })
  });

  await assert.rejects(() => runTurnWorkflow({
    ...input(), raw_text: 'Подготавливаю и осматриваю.'
  }, services), { code: 'TURN_STEP_WRITE_TARGET_CONFLICT' });
  assert.equal(commits.length, 0);
});

test('opted-in semantic workflow applies two direct drafts through one root commit', async () => {
  const requests = [];
  const projections = [];
  const { commits, services } = createServices([], {
    command: {
      matches: () => false,
      semantic_binding: {
        binding_id: 'inspect-place',
        operation: 'request_discovery',
        matches: () => false
      }
    },
    playerSafeStateProjector: async ({ committed_state: state,
      working_projection: workingProjection }) => {
      projections.push(structuredClone(workingProjection));
      return {
        actor: { actor_ref: 'party-1' },
        player_safe_state: {
          visible_entities: [{ entity_ref: 'place-gate' }],
          direct_revision: workingProjection?.direct_revision ?? 0,
          state_version: state.party_state.state_version
        }
      };
    },
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      direct: {
        change_entity_facts: async ({ working_projection: projection }) => ({
          working_projection: {
            ...projection,
            direct_revision: (projection.direct_revision ?? 0) + 1
          },
          summary: 'direct change prepared',
          write_fragments: [{
            target: 'party_state',
            value: { direct_change: true }
          }]
        })
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'activity prepared',
        write_fragments: []
      })
    }),
    turnStepModel: async (request) => {
      requests.push(request);
      return turnStepPlan(request, {
        goal_result: request.step_index === 1 ? 'pending' : 'achieved',
        operations: request.step_index === 1 ? [{
          op: 'change_entity_facts',
          entity_ref: 'party-1',
          remove_fact_refs: [],
          add_facts: []
        }] : [],
        continuation: request.step_index === 1 ? {
          remaining_intent: 'завершить действие',
          depends_on_refs: ['party-1']
        } : null
      });
    }
  });

  const result = await runTurnWorkflow({
    ...input(), raw_text: 'Сначала меняю состояние, затем завершаю действие.'
  }, services);

  assert.equal(result.status, 'resolved');
  assert.deepEqual(requests.map(({ step_index: step }) => step), [1, 2]);
  assert.equal(
    requests[1].player_safe_state.direct_revision,
    1,
    'second step must see the first immutable working projection'
  );
  assert.equal(projections.length, 2);
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].write_targets, [{
    target: 'party_turn_step_operations',
    value: {
      version: 1,
      schema: 'party_turn_step_operation_batch_v1',
      root_turn_id: 'turn:party-1:1',
      committed_state_version: 0,
      operations: [{
        target: 'party_state',
        value: { direct_change: true }
      }]
    }
  }]);
});

test('opted-in semantic workflow executes a generic check before one commit', async () => {
  let rolls = 0;
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
    randomSource: { next: () => { rolls += 1; return 0.95; } },
    turnStepCheckContextResolver: async () => ({
      attribute_value: 30,
      skill_bonus: 0,
      policy_profile_ref: 'test_check_policy',
      policy_profile_pin: {
        artifact_id: 'test_turn_step_owner_profiles', revision: 1,
        digest: 'a'.repeat(64)
      },
      check_policy_ref: {
        entity_kind: 'check_policy', entity_id: 'test_check_policy',
        authoring_version: '1'
      },
      consequence_policy_ref: {
        entity_kind: 'consequence_policy',
        entity_id: 'test_consequence_policy', authoring_version: '1'
      }
    }),
    turnStepExecutionRegistry: createTurnStepExecutionRegistry({
      direct: {
        change_entity_facts: async ({ working_projection: projection }) => ({
          working_projection: { ...projection, checked: true },
          summary: 'check outcome prepared',
          write_fragments: [{
            target: 'party_state', value: { checked: true }
          }]
        })
      },
      applySemanticActivity: async ({ working_projection: projection }) => ({
        working_projection: projection,
        summary: 'check activity prepared',
        write_fragments: []
      })
    }),
    turnStepModel: async (request) => turnStepPlan(request, {
      resolution: 'generic_check',
      goal_result: 'pending',
      operations: [],
      check: genericCheck({
        clean_success: {
          goal_result: 'achieved',
          additional_activity: null,
          operations: [{
            op: 'change_entity_facts',
            entity_ref: 'party-1',
            remove_fact_refs: [],
            add_facts: []
          }],
          continuation: null
        }
      })
    })
  });

  const result = await runTurnWorkflow({
    ...input(), raw_text: 'Проверяю, удаётся ли удержать равновесие.'
  }, services);

  assert.equal(rolls, 1);
  assert.equal(result.summary.check_count, 1);
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].write_targets, [{
    target: 'party_turn_step_operations',
    value: {
      version: 1,
      schema: 'party_turn_step_operation_batch_v1',
      root_turn_id: 'turn:party-1:1',
      committed_state_version: 0,
      operations: [{
        target: 'party_state', value: { checked: true }
      }]
    }
  }]);
});

test('opted-in semantic clarification produces one persisted player response', async () => {
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
    turnStepModel: async (request) => turnStepPlan(request, {
      resolution: 'clarification_required',
      goal_result: 'pending',
      clarification: {
        question: 'Какие именно ворота ты осматриваешь?',
        target_refs: ['place-gate']
      }
    })
  });

  const result = await runTurnWorkflow({
    ...input(), raw_text: 'Осматриваю их.'
  }, services);

  assert.equal(result.status, 'partial');
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].write_targets, [{
    target: 'party_player_visible_message',
    value: {
      clarification: {
        question: 'Какие именно ворота ты осматриваешь?',
        target_refs: ['place-gate']
      }
    }
  }]);
});
