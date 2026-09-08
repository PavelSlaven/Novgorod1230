import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';

const request = {
  request_id: 'turn-step:1', remaining_intent: 'сложить доски в настил',
  player_safe_state: { actor_id: 'actor:1', position: { position_id: 'shore' },
    items: [{ item_id: 'knife:1', category_id: 'personal_utility_knife' }],
    current_visible_context: { sensory_details: ['На берегу лежат доски.'] },
    available_domain_operation_grounding: [{
      operation: { op: 'request_discovery', query: 'authored evidence' },
      semantic_scope: { authority: 'authored_evidence_investigation',
        purpose: 'investigate wreck circumstances' }
    }] }
};
const plan = { continuation: null, operations: [{ op: 'request_item_use',
  item_ref: 'knife:1', action_production: {
    source_refs: ['knife:1'], tool_refs: [], identity_mode: 'preserve_source',
    result_descriptor: { physical_description: 'настил из досок' }
  } }] };

test('turn-step grounding audit is skipped outside discovery and production',
  async () => {
    let calls = 0;
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() { calls += 1; } }
    });
    assert.equal(await validate({ request, plan: { operations: [] } }), true);
    assert.equal(calls, 0);
  });

test('turn-step grounding audit returns repairable source errors', async () => {
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
    roleRunner: { async run(call) {
      assert.equal(call.role_id, 'turn_step_grounding_auditor');
      assert.match(call.messages[0].content,
        /operation_semantic_grounding[\s\S]*ordinary material[\s\S]*acquisition or gathering[\s\S]*practical use/u);
      assert.equal(JSON.parse(call.messages[1].content).operations[0]
        .operation.action_production.source_refs[0], 'knife:1');
      assert.equal(JSON.parse(call.messages[1].content).player_safe_state
        .available_domain_operation_grounding[0].semantic_scope.authority,
      'authored_evidence_investigation');
      return { output: { pass: false,
        concerns: [{ kind: 'source_semantic_grounding' }] } };
    } }
  });
  await assert.rejects(validate({ request, plan }), (error) => {
    assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
    assert.equal(error.details.errors[0].code, 'source_semantic_grounding');
    return true;
  });
});

test('turn-step grounding audit includes generic-check outcome production',
  async () => {
    const outcomePlan = { operations: [], continuation: null, check: {
      outcomes: { clean_success: { operations: plan.operations } }
    } };
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run(call) {
        const [{ path, operation }] = JSON.parse(call.messages[1].content)
          .operations;
        assert.equal(path,
          '$.check.outcomes.clean_success.operations.0');
        assert.equal(operation.action_production.source_refs[0], 'knife:1');
        return { output: { pass: false,
          concerns: [{ kind: 'source_semantic_grounding' }] } };
      } }
    });
    await assert.rejects(validate({ request, plan: outcomePlan }), (error) => {
      assert.equal(error.details.errors[0].path,
        '$.check.outcomes.clean_success.operations.0.action_production.source_refs');
      return true;
    });
  });

test('turn-step grounding audit accepts a strict pass', async () => {
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
    roleRunner: { async run() {
      return { output: { pass: true, concerns: [] } };
    } }
  });
  assert.equal(await validate({ request, plan }), true);
});
