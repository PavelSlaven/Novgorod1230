import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTurnStepPlanWithRepair } from
  '../../../packages/turn/src/turn-step-loop.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';
import { output, request } from
  './lower-dvina-trace-turn-step-llm-test-helpers.js';

test('copied authored discovery is semantically rejected before its one repair',
  async () => {
    const intent = 'Осмотреть лёд в поисках безопасного места для саней.';
    const authored = { op: 'request_discovery', actor_ref: 'actor_mikula',
      discovery_kind: 'inspect', target_refs: ['location:river'],
      query: 'Осмотреть следы у проруби.' };
    const ordinary = { ...authored, query: intent };
    const input = request({ root_player_action: intent,
      remaining_intent: intent, available_domain_operations: [authored],
      player_safe_state: { position: { location_ref: 'location:river' },
        ordinary_resolution: { discovery_available: true,
          container_resolution_available: false, scene_seed_available: false }
      } });
    let calls = 0;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        calls += 1;
        if (calls === 1) return { output: {
          ...output(), resolution: 'domain_request', operation_choice: null,
          operations: [authored]
        } };
        const payload = JSON.parse(call.messages[1].content);
        assert.equal(payload.structural_errors.some(({ code }) =>
          code === 'additional_property'), false);
        assert.equal(payload.structural_errors.some(({ code }) =>
          code === 'operation_semantic_grounding'), true);
        assert.match(call.messages[0].content,
          /Code-owned exact operation choices are:\n\[\]/u);
        return { output: { ...output(), resolution: 'domain_request',
          operation_choice: null, operations: [ordinary]
        } };
      }
    } });
    const semanticPlanValidator = async ({ plan }) => {
      if (plan.operations?.some((operation) =>
        operation.query === authored.query)) throw Object.assign(
          new Error('wrong authored scope'), {
            code: 'TURN_STEP_PLAN_INVALID', details: { errors: [{
              path: '$.operations.0', code: 'operation_semantic_grounding',
              rejected_operation: authored
            }] }
          });
      return true;
    };
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model, semanticPlanValidator });
    assert.equal(result.repaired, true);
    assert.deepEqual(result.plan.operations, [ordinary]);
    assert.equal(calls, 2);
  });

test('body inspection cannot remain an ordinary discovery of covering clothing',
  async () => {
    const intent = 'Осмотреть боль в кисти под рукавом';
    const input = request({ root_player_action: intent,
      remaining_intent: intent,
      actor: { actor_ref: 'actor_mikula', body: { active_conditions: [{
        id: 'hand_soreness', status: 'active'
      }] } },
      player_safe_state: { ordinary_resolution: { discovery_available: true,
        container_resolution_available: false, scene_seed_available: false },
      current_visible_context: { visible_objects: [{ entity_ref: {
        entity_kind: 'item', entity_id: 'item:sleeve'
      }, display_label: 'рукав' }] } } });
    const calls = [];
    const roleRunner = { async run(call) {
      calls.push(call.role_id);
      if (call.role_id === 'turn_step_grounding_auditor') return { output: {
        pass: false, concerns: [{ kind: 'operation_semantic_grounding' }]
      } };
      if (call.role_id === 'turn_step_planner_repair') return { output: {
        ...output(), resolution: 'direct', goal_result: 'partially_achieved',
        activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
        operations: [], direct_result_kind: 'player_safe_body_observation'
      } };
      return { output: { ...output(), resolution: 'domain_request',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula',
          discovery_kind: 'inspect', target_refs: ['item:sleeve'], query: intent }]
      } };
    } };
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
      semanticPlanValidator:
        createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner })
    });
    assert.equal(result.repaired, true);
    assert.equal(result.plan.direct_result_kind,
      'player_safe_body_observation');
    assert.deepEqual(result.plan.operations, []);
    assert.deepEqual(calls, ['turn_step_planner',
      'turn_step_grounding_auditor', 'turn_step_planner_repair']);
  });
