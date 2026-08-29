import { planApprovedActorItemTransition } from '@rus/items-property';
import { planPromiseLifecycle } from '@rus/social-law';
import {
  buildCommittedInventoryInput
} from '../../runtime/lower-dvina-trace-committed-inventory.js';
import { row } from './first-playable/plan-shared.js';

export function appendPromiseTransition({
  updates,
  offerAppends,
  activationAppends,
  state,
  next,
  n,
  partyId, changeSetId, idemId, turnNumber, activityId, checkId, contracts }) {
  const promise = next.promise_instances[0];
  const prior = state.promise_instances?.[0];
  if (!prior || prior.obligation_id !== promise.obligation_id) {
    throw new Error('TRACE_PHASE_4_PROMISE_LINEAGE_MISSING');
  }
  const obligationId = promise.obligation_id ?? `obligation:${partyId}:ratsha-protection`;
  const transitionCount =
    (prior.current_state === 'not_offered' ? 1 : 0)
    + (promise.current_state === 'active' ? 1 : 0);
  const record = { obligation_id: obligationId, party_id: partyId,
    policy_ref: structuredClone(prior.policy_ref),
    policy_version: prior.policy_version,
    promisor_ref: {
      entity_kind: 'player_character',
      entity_id: prior.promisor_actor_id
    },
    beneficiary_ref: {
      entity_kind: 'npc',
      entity_id: prior.beneficiary_actor_id
    },
    witness_refs: prior.witness_actor_ids.map((actorId) => ({
      entity_kind: 'npc',
      entity_id: actorId
    })),
    scope_snapshot: contracts.promisePolicy.scope, current_state: promise.current_state,
    current_state_fact: promise.current_state_fact,
    state_version: Number(prior.state_version) + transitionCount,
    created_change_set_id: prior.created_change_set_id,
    last_change_set_id: transitionCount > 0
      ? changeSetId
      : prior.last_change_set_id };
  if (!record.created_change_set_id) throw new Error('TRACE_PHASE_4_PROMISE_LINEAGE_MISSING');
  const policyInput = {
    policy: contracts.promisePolicy,
    parties: structuredClone(contracts.promisePolicy.parties),
    witness_slots: [
      ...contracts.promisePolicy.witness_binding.required_witness_slots
    ],
    scope: structuredClone(contracts.promisePolicy.scope)
  };
  const offer = prior.current_state === 'not_offered'
    ? planPromiseLifecycle({
      ...policyInput,
      operation: 'offer',
      current_state: {
        state_slot:
          contracts.promisePolicy.history_and_current_state_contract
            .current_state_slot,
        fact_id: prior.current_state_fact
      },
      causal_basis: {
        committed_fact_ids:
          transitionFacts(contracts.promisePolicy, 'not_offered', 'offered')
      }
    })
    : null;
  const activation = promise.current_state === 'active'
    ? planPromiseLifecycle({
      ...policyInput,
      operation: 'activate',
      current_state: {
        state_slot:
          contracts.promisePolicy.history_and_current_state_contract
            .current_state_slot,
        fact_id: 'promise_current_offered'
      },
      causal_basis: {
        committed_fact_ids:
          transitionFacts(contracts.promisePolicy, 'offered', 'active')
      }
    })
    : null;
  if (offer || activation) {
    updates.push(row('party_obligations', obligationId, record));
  }
  const transition = ({ ordinal, from, to, proposal, at,
    check = null, decision = null }) =>
    row('party_obligation_transitions', `${obligationId}:${ordinal}`, {
      obligation_transition_id: `${obligationId}:${ordinal}`, party_id: partyId,
      obligation_id: obligationId, transition_ordinal: ordinal, from_state: from,
      to_state: to, transition_kind: proposal.history_event.fact_id,
      causal_basis: proposal.causal_basis,
      witness_snapshot: record.witness_refs, activity_execution_id: activityId,
      check_resolution_id: check, npc_decision_request_id: decision,
      change_set_id: changeSetId, idempotency_record_id: idemId, occurred_at_turn: turnNumber,
      occurred_at_whole_minutes: at.whole_minutes,
      occurred_at_subminute_numerator: at.subminute_numerator,
      occurred_at_subminute_denominator: at.subminute_denominator
    });
  if (offer) offerAppends.push(transition({ ordinal: 0, from: 'not_offered',
    to: 'offered', proposal: offer, at: state.clock }));
  if (activation) activationAppends.push(transition({ ordinal: 1, from: 'offered',
    to: 'active', proposal: activation, at: next.clock,
    check: checkId, decision: n.npc_decision.trace.request_id }));
}

export function appendApprovedRatshaKnife({ updates, state, next, n, partyId,
  contracts }) {
  const item = state.items.find(({ template_id: id }) => id === 'trace_ld_v1_item_ratsha_knife');
  if (!item) throw new Error('TRACE_PHASE_4_RATSHA_KNIFE_MISSING');
  const committedInventory = buildCommittedInventoryInput(state);
  const plan = planApprovedActorItemTransition({ party_id: partyId,
    expected_state_version: state.party_state.state_version,
    state_version: state.party_state.state_version,
    approved_transition: contracts.knifeTransition,
    approved_facts: ['ratsha_surrender_without_further_harm_committed'], item_id: item.item_id,
    resolved_actor_refs: {
      ratsha_storehouse_helper: contracts.actors.ratsha_storehouse_helper.instance_id,
      trace_ld_v1_audience_slot_participating_fisher: n.participating_fisher_id
    },
    items: committedInventory.items,
    item_profiles: committedInventory.item_profiles,
    item_placements: committedInventory.item_placements,
    containers: committedInventory.containers,
    container_placements: committedInventory.container_placements,
    container_profiles: committedInventory.container_profiles,
    ownership: state.items.map((entry) => ({
      ...structuredClone(entry.ownership),
      item_id: entry.item_id
    })),
    source: { actor_kind: 'npc', actor_id: contracts.actors.ratsha_storehouse_helper.instance_id,
      controller_actor_id: contracts.actors.ratsha_storehouse_helper.instance_id,
      physical_position: contracts.knifeTransition.requires.physical_position
        ?? item.placement.physical_position,
      accessibility: contracts.knifeTransition.requires.accessibility
        ?? item.state.accessibility
        ?? item.state.property_state?.accessibility },
    destination: { actor_kind: 'npc', actor_id: n.participating_fisher_id,
      controller_actor_id: n.participating_fisher_id,
      physical_position: contracts.knifeTransition.writes.physical_position
        ?? item.placement.physical_position,
      accessibility: contracts.knifeTransition.writes.accessibility }, actor_strengths: {} });
  if (!plan.pass || plan.proposal.placement.physical_position
      !== (contracts.knifeTransition.writes.physical_position
        ?? item.placement.physical_position)) {
    throw new Error('TRACE_PHASE_4_KNIFE_TRANSITION_REJECTED');
  }
  updates.push(row('party_item_placements', item.item_id, { party_id: partyId,
    item_id: item.item_id, holder_npc_id: n.participating_fisher_id,
    holder_character_id: null, physical_position: plan.proposal.placement.physical_position }));
  updates.push(row('party_ownership', item.ownership.ownership_id ?? item.item_id, {
    ...plan.proposal.ownership.next, party_id: partyId,
    ownership_id: item.ownership.ownership_id ?? item.item_id, item_id: item.item_id
  }));
  const nextItem = next.items.find(({ item_id: id }) => id === item.item_id);
  if (!nextItem) throw new Error('TRACE_PHASE_4_RATSHA_KNIFE_STATE_MISSING');
  const propertyState = nextItem.state?.property_state ?? {};
  const history = propertyState.approved_transition_history ?? [];
  if (history.some(({ transition_profile_id: id }) =>
    id === plan.proposal.property_history.transition_profile_id)) {
    throw new Error('TRACE_PHASE_4_KNIFE_TRANSITION_DUPLICATE');
  }
  nextItem.state = { ...nextItem.state, property_state: { ...propertyState,
    approved_transition_history: [...history,
      structuredClone(plan.proposal.property_history)] } };
  updates.push(row('party_items', item.item_id, {
    party_id: partyId, item_id: item.item_id, state: structuredClone(nextItem.state)
  }));
}

function transitionFacts(policy, from, to) {
  const matches = policy.transitions.filter(
    (transition) => transition.from === from && transition.to === to
  );
  if (matches.length !== 1 || !Array.isArray(matches[0].requires)) {
    throw new Error('TRACE_PHASE_4_PROMISE_POLICY_TRANSITION_MISSING');
  }
  return [...matches[0].requires];
}
