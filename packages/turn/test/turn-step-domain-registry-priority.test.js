import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTurnStepExecutionRegistry,
  runTurnWorkflow
} from '../src/index.js';
import {
  createServices,
  input,
  turnStepPlan
} from './turn-workflow-fixture.js';

test('registered generic domain handler precedes scenario command bindings',
  async () => {
    let genericCalls = 0;
    let scenarioCalls = 0;
    const { services } = createServices([], {
      command: {
        matches: () => false,
        semantic_binding: {
          binding_id: 'scenario-container',
          operation: 'request_container_access',
          matches() {
            scenarioCalls += 1;
            return true;
          }
        }
      },
      playerSafeStateProjector: async () => ({
        actor: { actor_ref: 'party-1' },
        player_safe_state: {
          visible_entities: [{ entity_ref: 'chest' }]
        }
      }),
      turnStepExecutionRegistry: createTurnStepExecutionRegistry({
        domain: {
          request_container_access: async ({ working_projection: value }) => {
            genericCalls += 1;
            return {
              working_projection: value,
              write_fragments: [{
                target: 'party_hidden_state',
                value: { container_opened: true }
              }],
              player_response_boundary: true
            };
          }
        }
      }),
      turnStepModel: async (request) => turnStepPlan(request, {
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{
          op: 'request_container_access', actor_ref: 'party-1',
          container_ref: 'chest', access_kind: 'open_and_view'
        }]
      })
    });
    const result = await runTurnWorkflow({
      ...input(), raw_text: 'Открываю сундук.'
    }, services);
    assert.equal(result.status, 'partial');
    assert.equal(genericCalls, 1);
    assert.equal(scenarioCalls, 0);
  });
