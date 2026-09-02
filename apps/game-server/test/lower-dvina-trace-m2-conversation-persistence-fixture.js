import assert from 'node:assert/strict';

export function assertPersistedStatePayloadSafe({
  payload, persistenceMarker, historyBranch
}) {
  const serialized = JSON.stringify(payload);
  assert.equal(Object.hasOwn(payload, 'npc_semantic_decision_traces'), false);
  assert.equal(serialized.includes(persistenceMarker), false);
  assert.equal(serialized.includes('"decision_request"'), false);
  assert.equal(serialized.includes('"decision_plan"'), false);
  assert.equal(serialized.includes('npc_conversation_response_request_v1'), false);
  assert.equal(serialized.includes('conversation_contribution_plan_v1'), false);
  assert.equal(Object.hasOwn(historyBranch, 'semantic_exchange'), false);
  assert.ok(historyBranch.semantic_exchange_projection);
  assert.equal(
    payload.npc_semantic_decision_refs.at(-1).request_id,
    historyBranch.semantic_exchange_projection.request_id
  );
  assert.equal(Object.hasOwn(
    payload.last_turn.consequence.conversation
      ?? payload.last_turn.consequence.negotiation,
    'semantic_exchange'
  ), false);
}
