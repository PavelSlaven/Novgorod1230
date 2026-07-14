import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnDecisionRequest, resolveTurnDecision } from '../src/bounded-decision.js';

test('turn applies only a command selected from the code-filtered set', () => {
  const makeOption = (option_id, command_id) => ({ option_id, command_id, actor_id: 'n', target_id: 'scene', preconditions: [], expected_cost: { kind: 'time', value: 0 }, known_risks: [], reason_visible_to_actor: 'Разрешённое действие.', state_version: 4, metadata: {}, preconditions_pass: true });
  const request = createTurnDecisionRequest({ requestId: 'r', partyId: 'p', actorId: 'n', stateVersion: 4, issuedAt: '2029-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:00:00.000Z', secret: 's', policy: { policy_id: 'pol', version: '1', requires_bounded_decision: true, command_ids: ['wait', 'leave'] }, eligibleOptions: [makeOption('wait-now', 'wait'), makeOption('leave-now', 'leave'), makeOption('invent', 'invent')] });
  assert.equal(request.options.length, 2);
  const option = request.options[0];
  const output = resolveTurnDecision({ request, currentStateVersion: 4, currentPolicyVersion: '1', secret: 's', now: '2029-01-01T00:00:00.000Z', llmResult: { version: 2, schema: 'bounded_decision_result_v2', request_id: 'r', state_version: 4, option_id: option.option_id, command_token: option.command_token }, handlers: { wait: () => ({ version: 2, schema: 'party_change_set_v2', operations: [{ op: 'wait' }] }) }, validateChangeSet: () => true, context: {} });
  assert.deepEqual(output, { version: 2, schema: 'party_change_set_v2', operations: [{ op: 'wait' }] });
});
