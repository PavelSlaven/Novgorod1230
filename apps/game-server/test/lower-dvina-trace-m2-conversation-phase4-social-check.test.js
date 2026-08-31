import assert from 'node:assert/strict';
import test from 'node:test';
import { checkResult, digest, phase4ArrivalState, runPhase4 } from
  './lower-dvina-trace-m2-conversation-fixture.js';

test('Ratsha failure bargain requires its code-owned social check',
  async () => {
    const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
    for (const [responseKind, character] of [['bargain', 'b']]) {
      let checkCalls = 0;
      const exchange = await runPhase4({
        state,
        contracts,
        rawText: 'Ратша, отвечай.',
        inputDigest: digest(character),
        responseKind,
        checkResult: checkResult(contracts.check.check_id,
          'failure_with_consequence'),
        offerStage,
        checkRequest,
        npcSocialCheckResolver: async ({ plan, request }) => {
          checkCalls += 1;
          assert.equal(plan.resolution, 'check_required');
          assert.deepEqual(request.decision_scope.allowed_attribute_refs,
            [contracts.check.attribute]);
          assert.deepEqual(request.decision_scope.allowed_skill_refs,
            [contracts.check.skill]);
          assert.deepEqual(request.decision_scope.allowed_check_profile_refs,
            [contracts.npcSocialCheckProfile.profile_id]);
          return checkResult(`npc:${request.request_id}`, 'success_with_cost');
        }
      });

      assert.equal(checkCalls, 1);
      assert.equal(exchange.result.response_kind, responseKind);
      assert.equal(exchange.result.statements[1].social_delivery_result
        .outcome_band, 'success_with_cost');
    }
  });
