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

test('lossy discovery wording gets one lossless split repair',
  async () => {
    const intent =
      'Осмотреть пояс и сумку на разрывы, затем проверить сухость грунта.';
    const continuation = 'затем проверить сухость грунта.';
    const input = request({ root_player_action: intent,
      remaining_intent: intent, player_safe_state: {
        visible_entities: [{ entity_ref: 'item:belt' }]
      } });
    let calls = 0;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        calls += 1;
        if (calls === 1) return { output: {
          ...output(), resolution: 'domain_request', operations: [{
            op: 'request_discovery', actor_ref: 'actor_mikula',
            discovery_kind: 'inspect', target_refs: ['item:belt'],
            query: 'Осмотреть пояс на повреждения'
          }], continuation: { remaining_intent: continuation,
            depends_on_refs: [] }
        } };
        assert.equal(call.role_id, 'turn_step_planner_repair');
        assert.match(call.messages[0].content,
          /Required ordinary discovery repair:[\s\S]*standalone focused discovery losslessly[\s\S]*exact earliest discovery prefix[\s\S]*exact uncovered suffix/u);
        return { output: {
          ...output(), resolution: 'domain_request', operations: [{
            op: 'request_discovery', actor_ref: 'actor_mikula',
            discovery_kind: 'inspect', target_refs: ['item:belt'],
            query: 'Осмотреть пояс и сумку на разрывы'
          }], continuation: { remaining_intent: continuation,
            depends_on_refs: [] }
        } };
      }
    } });
    const semanticPlanValidator = async ({ plan }) => {
      if (plan.operations[0].query.includes('повреждения')) {
        throw Object.assign(new Error('lossy discovery wording'), {
          code: 'TURN_STEP_PLAN_INVALID', details: { errors: [{
            path: '$.operations.0.query',
            code: 'ordinary_discovery_query_identity'
          }] }
        });
      }
      return true;
    };
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model, semanticPlanValidator });
    assert.equal(result.repaired, true);
    assert.equal(result.plan.operations[0].query,
      'Осмотреть пояс и сумку на разрывы');
    assert.equal(calls, 2);
  });

test('material prerequisite repair restores full intent and is revalidated',
  async () => {
    const cases = [
      {
        intent: 'Беру целый обрывок снасти и несколько сухих щепок из расколотой доски, затем отхожу за ивняк, где меньше ветра.',
        query: 'целый обрывок снасти и несколько сухих щепок из расколотой доски',
        lossy: 'затем отхожу за ивняк, где меньше ветра.'
      },
      {
        intent: 'Подбираю пучок сухого камыша и свиваю из него растопку.',
        query: 'пучок сухого камыша',
        lossy: 'свиваю из него растопку.'
      }
    ];
    for (const [index, entry] of cases.entries()) {
      const input = request({ request_id: `material-prerequisite:${index}`,
        root_player_action: entry.intent, remaining_intent: entry.intent,
        player_safe_state: {
          position: { location_ref: 'location:riverbank' },
          ordinary_resolution: { discovery_available: true,
            container_resolution_available: false,
            scene_seed_available: false }
        } });
      const operation = { op: 'request_discovery',
        actor_ref: 'actor_mikula', discovery_kind: 'inspect',
        target_refs: ['location:riverbank'], query: entry.query };
      const roles = [];
      const roleRunner = { async run(call) {
        roles.push(call.role_id);
        if (call.role_id === 'turn_step_planner') return { output: {
          ...output(), resolution: 'domain_request', operations: [operation],
          continuation: { remaining_intent: entry.lossy,
            depends_on_refs: [] }, reason_code: 'semantic_plan'
        } };
        if (call.role_id === 'turn_step_planner_repair') {
          const payload = JSON.parse(call.messages[1].content);
          assert.deepEqual(payload.structural_errors.map(({ path }) => path), [
            '$.operations.0.query', '$.continuation.remaining_intent'
          ]);
          assert.match(call.messages[0].content,
            /If discovery is a material prerequisite[\s\S]*query names only that needed referent, material, or physically connected group[\s\S]*continuation is exactly[\s\S]*Do not invent refs, outcomes, or execute the later action/u);
          return { output: { ...output(), resolution: 'domain_request',
            operations: [operation], continuation: {
              remaining_intent: entry.intent, depends_on_refs: []
            }, reason_code: 'semantic_plan' } };
        }
        const payload = JSON.parse(call.messages[1].content);
        assert.equal(payload.operation.query, entry.query);
        assert.equal(payload.remaining_intent, entry.intent);
        return { output: { mode: 'material_prerequisite',
          consumed_intent: null } };
      } };
      const grounding =
        createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner });
      const result = await requestTurnStepPlanWithRepair({ request: input,
        turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
        semanticPlanValidator: (context) => grounding({ ...context,
          resolved_domain_operations: [{ path: '$.operations.0',
            owner_kind: 'ordinary_discovery' }] }) });
      assert.equal(result.repaired, true);
      assert.equal(result.plan.continuation.remaining_intent, entry.intent);
      assert.deepEqual(roles, ['turn_step_planner',
        'turn_step_planner_repair', 'turn_step_grounding_auditor']);
    }
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
