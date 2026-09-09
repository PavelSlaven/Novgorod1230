import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnStepExecutionRegistry, runTurnStepLoop } from '../src/turn-step-loop.js';
import { basePlan, input, ports, result } from './turn-step-loop-fixture.js';

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
        move_entity: async ({ operation, working_projection: projection }) => {
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
      committedStateVersion: 8, rootPlayerAction: first.remaining_intent,
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
