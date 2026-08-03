import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTurnStepExecutionRegistry,
  runTurnStepLoop
} from '../src/index.js';

test('shared generic check invokes one registered domain owner only on its outcome',
  async () => {
    let ownerCalls = 0;
    let rolls = 0;
    const registry = createTurnStepExecutionRegistry({
      domain: {
        request_container_access: async ({ working_projection: projection }) => {
          ownerCalls += 1;
          return result({ ...projection, chest_open: true });
        }
      },
      applySemanticActivity: async ({ working_projection: projection }) =>
        result(projection)
    });
    const success = await runTurnStepLoop(input(30), ports({
      registry,
      randomSource: { next() { rolls += 1; return 0.95; } }
    }));
    assert.equal(success.check_results[0].outcome.band, 'clean_success');
    assert.equal(success.working_projection.chest_open, true);
    assert.equal(ownerCalls, 1);
    assert.equal(rolls, 1);

    const failure = await runTurnStepLoop(input(1), ports({
      registry,
      randomSource: { next() { rolls += 1; return 0; } }
    }));
    assert.equal(failure.check_results[0].outcome.band, 'severe_failure');
    assert.equal(failure.working_projection.chest_open, undefined);
    assert.equal(ownerCalls, 1);
    assert.equal(rolls, 2);
  });

test('multiple domain operations in one check outcome fail before effects',
  async () => {
    let domainCalls = 0;
    let activityCalls = 0;
    let rolls = 0;
    const registry = createTurnStepExecutionRegistry({
      domain: {
        request_container_access: async () => {
          domainCalls += 1;
          return result({ actor_id: 'actor' });
        },
        request_discovery: async () => {
          domainCalls += 1;
          return result({ actor_id: 'actor' });
        }
      },
      applySemanticActivity: async ({ working_projection: projection }) => {
        activityCalls += 1;
        return result(projection);
      }
    });
    await assert.rejects(() => runTurnStepLoop(input(30), {
      ...ports({
        registry,
        randomSource: { next() { rolls += 1; return 0.95; } }
      }),
      turnStepModel: async (request) => {
        const invalid = plan(request);
        invalid.check.outcomes.clean_success.operations.push({
          op: 'request_discovery', actor_ref: 'actor',
          discovery_kind: 'inspect', target_refs: ['chest'],
          query: 'осмотреть сундук'
        });
        return invalid;
      }
    }), { code: 'TURN_STEP_PLAN_INVALID' });
    assert.equal(rolls, 0);
    assert.equal(domainCalls, 0);
    assert.equal(activityCalls, 0);
  });

function input(strength) {
  return {
    requestId: `request-${strength}`,
    rootTurnId: `turn-${strength}`,
    committedStateVersion: 1,
    rootPlayerAction: 'взломать и открыть сундук',
    actor: {
      actor_id: 'actor',
      attributes: { strength: { value: strength } }
    },
    initialWorkingProjection: {
      actor_id: 'actor',
      items: [{ item_id: 'chest', open_state: 'locked' }]
    },
    maxInternalSteps: 8
  };
}

function ports({ registry, randomSource }) {
  return {
    executionRegistry: registry,
    randomSource,
    resolveCheckContext: ({ actor }) => ({
      attribute_value: actor.attributes.strength.value,
      skill_bonus: 0,
      state_modifier: 0,
      equipment_modifier: 0,
      circumstance_modifier: 0,
      policy_profile_ref: 'container-check-profile',
      policy_profile_pin: {
        artifact_id: 'container-checks', revision: 1,
        digest: 'a'.repeat(64)
      },
      check_policy_ref: {
        entity_kind: 'check_policy', entity_id: 'container-check',
        authoring_version: '1'
      },
      consequence_policy_ref: {
        entity_kind: 'consequence_policy', entity_id: 'container-outcomes',
        authoring_version: '1'
      }
    }),
    projectPlayerSafeState: async ({ working_projection: projection }) =>
      projection,
    revalidateCommittedState: async () => true,
    turnStepModel: async (request) => plan(request)
  };
}

function plan(request) {
  const open = {
    op: 'request_container_access',
    actor_ref: 'actor', container_ref: 'chest', access_kind: 'open_and_view'
  };
  const outcome = (band) => ({
    goal_result: band === 'clean_success' ? 'achieved' : 'not_achieved',
    additional_activity: null,
    operations: band === 'clean_success' ? [open] : [],
    continuation: null
  });
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent,
      adaptation: 'literal'
    },
    resolution: 'generic_check',
    goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'moderate' },
    operations: [],
    check: {
      purpose: 'открыть запертый сундук',
      attribute_ref: 'strength', skill_ref: null,
      difficulty_id: 'risky',
      outcomes: Object.fromEntries([
        'clean_success', 'success', 'success_with_cost',
        'failure_with_consequence', 'severe_failure'
      ].map((band) => [band, outcome(band)]))
    },
    continuation: null,
    clarification: null,
    reason_code: 'locked_container_check',
    reason: 'Замок требует общей code-owned проверки.'
  };
}

function result(projection) {
  return {
    working_projection: projection,
    write_fragments: [],
    consequence_fragment: null
  };
}
