
import { canonicalDigest } from '@rus/materialization';
import { compareRefs, fail } from './lower-dvina-trace-phase-4-read-obligation-shared.js';

export function assertPhase4PromiseAndSurrender({
  payload,
  negotiationHistory,
  obligations,
  transitions,
  knife,
  npcTransitions,
  knowledge
}) {
  const promise = payload.promise_instances?.[0];
  const expectedObligation = promise && obligations.find(
    ({ obligation_id: id }) => id === promise.obligation_id
  );
  if (!promise || obligations.filter(
    ({ obligation_id: id }) => id === promise.obligation_id
  ).length !== 1
      || canonicalDigest(expectedObligation.policy_ref)
        !== canonicalDigest(promise.policy_ref)
      || String(expectedObligation.policy_version)
        !== String(promise.policy_version)
      || expectedObligation.promisor_ref?.entity_id
        !== promise.promisor_actor_id
      || expectedObligation.beneficiary_ref?.entity_id
        !== promise.beneficiary_actor_id
      || canonicalDigest(
        expectedObligation.witness_refs?.map(({ entity_id: id }) => id)
      ) !== canonicalDigest(promise.witness_actor_ids)
      || canonicalDigest(expectedObligation.scope_snapshot)
        !== canonicalDigest(promise.scope_snapshot)
      || expectedObligation.current_state !== promise.current_state
      || expectedObligation.current_state_fact !== promise.current_state_fact
      || Number(expectedObligation.state_version)
        !== Number(promise.state_version)
      || expectedObligation.created_change_set_id
        !== promise.created_change_set_id
      || expectedObligation.last_change_set_id
        !== promise.last_change_set_id) fail();
  assertPromiseTransitions({ promise, transitions });
  if (payload.ratsha_surrendered) {
    assertSurrender({
      payload, negotiationHistory, knife, npcTransitions, knowledge
    });
  }
}

export { assertPhase4SemanticPromiseAndSurrender } from './lower-dvina-trace-phase-4-read-semantic-obligation.js';

function assertPromiseTransitions({ promise, transitions }) {
  const relevant = transitions.filter(
    ({ obligation_id: id }) => id === promise.obligation_id
  );
  const lifecycleCount = promise.current_state === 'active'
    ? 2
    : ['fulfilled', 'broken'].includes(promise.current_state)
      ? 3
    : promise.current_state === 'offered'
      ? 1
      : 0;
  const expectedCount = lifecycleCount
    + (promise.temporary_disposition_memory == null ? 0 : 1);
  if (relevant.length !== expectedCount
      || (lifecycleCount > 0
        && (relevant[0]?.from_state !== 'not_offered'
          || relevant[0]?.to_state !== 'offered'
          || relevant[0]?.transition_kind !== 'promise_offered'
          || canonicalDigest(relevant[0]?.causal_basis)
            !== canonicalDigest({
              committed_fact_ids: [
                'promisor_offer_committed',
                'required_witnesses_present'
              ]
            })
          || canonicalDigest(
            relevant[0]?.witness_snapshot?.map(({ entity_id: id }) => id)
          ) !== canonicalDigest(promise.witness_actor_ids)
          || relevant[0]?.check_resolution_id != null
          || relevant[0]?.npc_decision_request_id != null))
      || (lifecycleCount === 2 && (relevant[1]?.from_state !== 'offered'
        || relevant[1]?.to_state !== 'active'
        || relevant[1]?.transition_kind !== 'promise_activated'
        || canonicalDigest(relevant[1]?.causal_basis)
          !== canonicalDigest({
            committed_fact_ids: ['promise_activation_basis_committed']
          })
        || canonicalDigest(
          relevant[1]?.witness_snapshot?.map(({ entity_id: id }) => id)
        ) !== canonicalDigest(promise.witness_actor_ids)
        || !relevant[1]?.check_resolution_id
        || !relevant[1]?.npc_decision_request_id))
      || (lifecycleCount === 3
        && !validTerminalTransition(relevant[2], promise))
      || (promise.temporary_disposition_memory != null
        && !validDispositionMemory(relevant[lifecycleCount], promise))) fail();
}

function validTerminalTransition(transition, promise) {
  const fulfilled = promise.current_state === 'fulfilled';
  return transition?.from_state === 'active'
    && transition.to_state === promise.current_state
    && transition.transition_kind
      === (fulfilled ? 'promise_fulfilled' : 'promise_broken')
    && canonicalDigest(transition.causal_basis) === canonicalDigest({
      committed_fact_ids: [fulfilled
        ? 'promise_fulfillment_basis_committed'
        : 'promise_breach_basis_committed'] })
    && transition.check_resolution_id == null
    && transition.npc_decision_request_id == null;
}

function validDispositionMemory(transition, promise) {
  return transition?.transition_ordinal === Number(promise.state_version) - 2
    && transition.from_state === promise.current_state
    && transition.to_state === promise.current_state
    && transition.transition_kind
      === 'temporary_disposition_promise_memory_recorded'
    && canonicalDigest(transition.causal_basis) === canonicalDigest({
      committed_fact_ids: [promise.temporary_disposition_memory
        .committed_fact_id] })
    && transition.check_resolution_id == null
    && transition.npc_decision_request_id == null;
}

function assertSurrender({
  payload,
  negotiationHistory,
  knife,
  npcTransitions,
  knowledge
}) {
  const actualKnife = knife.rows[0];
  const expectedKnife = payload.items.find(({ template_id: id }) =>
    id === 'trace_ld_v1_item_ratsha_knife');
  const fisher = negotiationHistory.at(-1)?.consequence.negotiation
    .participating_fisher_id;
  const ratsha = payload.npcs.find(({ participant_slot_ref }) =>
    participant_slot_ref === 'ratsha_storehouse_helper')?.instance_id;
  if (knife.rowCount !== 1 || actualKnife.holder_npc_id !== fisher
      || actualKnife.holder_character_id != null
      || actualKnife.physical_position !== expectedKnife?.placement?.physical_position
      || actualKnife.owner_npc_id !== ratsha
      || actualKnife.owner_character_id != null
      || actualKnife.controller_npc_id !== fisher
      || actualKnife.controller_character_id != null
      || canonicalDigest(actualKnife.state) !== canonicalDigest(expectedKnife?.state)
      || actualKnife.state?.property_state?.accessibility
        !== expectedKnife?.state?.property_state?.accessibility) fail();
  const surrenderHistory = negotiationHistory.filter(
    ({ consequence: c }) => c.negotiation.npc_decision.outcome === 'surrender'
  );
  const surrenderTransitions = npcTransitions.filter(
    ({ transition_kind: kind }) => kind === 'surrendered_without_further_harm'
  );
  if (surrenderTransitions.length !== 1
      || surrenderHistory.length !== 1
      || surrenderTransitions[0].npc_id !== ratsha
      || surrenderTransitions[0].machine_state?.surrender_state
        !== 'surrendered_without_further_harm'
      || surrenderTransitions[0].semantic_state?.surrender_fact
        !== 'ratsha_surrender_without_further_harm_committed'
      || !knowledge.some(
        ({ fact_id: id }) => id === 'promise_activation_basis_committed'
      )) fail();
}
