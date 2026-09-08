import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnStepExecutionRegistry, runTurnStepLoop } from
  '../src/turn-step-loop.js';

test('a second ordinary plan becomes a player boundary without partial apply',
  async () => {
    let executions = 0;
    const outcome = await runTurnStepLoop({
      requestId: 'request-1', rootTurnId: 'turn-1', committedStateVersion: 7,
      rootPlayerAction: 'взять камень и искать дальше',
      actor: { actor_ref: 'actor-1' }, initialWorkingProjection: {
        actor_ref: 'actor-1', executions: 0,
        visible_entities: [{ entity_ref: 'stone-1' }] }
    }, {
      turnStepModel: async (request) => ({
        schema: 'turn_step_plan_v1', request_id: request.request_id,
        committed_state_version: request.committed_state_version,
        working_revision: request.working_revision,
        step_index: request.step_index,
        interpretation: { player_goal: request.root_player_action,
          grounded_attempt: request.step_index === 1
            ? 'взять камень' : 'искать дальше', adaptation: 'literal' },
        resolution: 'direct', goal_result: 'pending',
        activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
        operations: [{ op: 'move_entity', entity_ref: 'stone-1',
          placement: { relation: 'held_by', target_ref: 'actor-1' } }],
        check: null, continuation: {
          remaining_intent: request.step_index === 1
            ? 'искать дальше' : 'искать ещё дальше', depends_on_refs: [] },
        clarification: null, reason_code: 'test', reason: 'test'
      }),
      projectPlayerSafeState: async ({ working_projection }) =>
        working_projection,
      revalidateCommittedState: async () => ({ state_version: 7 }),
      executionRegistry: createTurnStepExecutionRegistry({
        direct: { move_entity: async ({ working_projection }) => {
          executions += 1;
          return { working_projection: { ...working_projection, executions },
            summary: `ordinary ${executions}`, write_fragments: [],
            ordinary_materialization_atomic_write_plan: {
              schema: 'ordinary-plan', sequence: executions } };
        } },
        applySemanticActivity: async ({ working_projection }) => ({
          working_projection, summary: 'moment', write_fragments: [] })
      })
    });
    assert.equal(executions, 2);
    assert.equal(outcome.stop_reason, 'player_response');
    assert.equal(outcome.working_revision, 1);
    assert.equal(outcome.working_projection.executions, 1);
    assert.equal(outcome.step_traces[1].applied, false);
    assert.equal(outcome.ordinary_materialization_atomic_write_plan.sequence, 1);
  });
