import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPersistedStatePayloadSafe,
  checkResult,
  digest,
  phase4ArrivalState,
  projectPhase4Negotiation,
  runPhase4
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('only surrender activates the party-local commitment and projects the knife transition signals', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const ratsha = contracts.actors.ratsha_storehouse_helper;
  const persistenceMarker =
    'ratsha-private-request-knowledge-must-not-reach-state-payload';
  ratsha.knowledge_profile_snapshot.private_persistence_marker =
    persistenceMarker;
  const surrender = await runPhase4({
    state,
    contracts,
    rawText: 'Обещаю защиту, если сдашься и отдашь нож.',
    inputDigest: digest('a'),
    responseKind: 'surrender',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    offerStage,
    checkRequest
  });
  assert.equal(
    surrender.npcRequest.knowledge.private_persistence_marker,
    persistenceMarker
  );
  delete ratsha.knowledge_profile_snapshot.private_persistence_marker;
  const surrenderedState = projectPhase4Negotiation({
    state,
    contracts,
    result: surrender.result,
    inputDigest: digest('a')
  });
  assertPersistedStatePayloadSafe({
    payload: surrenderedState,
    persistenceMarker,
    historyBranch: surrenderedState.phase4_history.at(-1)
      .consequence.negotiation
  });

  assert.equal(surrender.result.commitment.status, 'active');
  assert.equal(surrender.result.knife_transition_eligibility.eligible, true);
  assert.equal(surrenderedState.promise_instances[0].current_state, 'active');
  assert.equal(surrenderedState.ratsha_surrendered, true);
  const knife = surrenderedState.items.find(
    ({ template_id: templateId }) =>
      templateId === 'trace_ld_v1_item_ratsha_knife'
  );
  assert.equal(
    knife.placement.holder_npc_id,
    contracts.actors.participating_fisher.instance_id
  );
  const transitionSignalCategories = surrenderedState.npc_decision_signals
    .filter(({ signal }) => signal.source_event_ref.entity_kind
      === 'item_property_transition')
    .map(({ signal }) => signal.category)
    .sort();
  assert.deepEqual(transitionSignalCategories, ['others', 'others', 'self']);

  await assert.rejects(runPhase4({
    state,
    contracts,
    rawText: 'Сдавайся.',
    inputDigest: digest('b'),
    responseKind: 'lie',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    offerStage,
    checkRequest
  }), { code: 'TURN_NPC_PLAN_INVALID' });
});
