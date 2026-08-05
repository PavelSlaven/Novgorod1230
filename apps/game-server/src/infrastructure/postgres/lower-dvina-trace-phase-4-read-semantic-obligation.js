import { canonicalDigest } from '@rus/materialization';
import { compareRefs, fail } from './lower-dvina-trace-phase-4-read-obligation-shared.js';

export function assertPhase4SemanticPromiseAndSurrender({
  payload,
  negotiationHistory,
  obligations,
  transitions,
  knife,
  npcTransitions,
  knowledge
}) {
  const promise = payload.promise_instances?.[0];
  const obligation = promise && obligations.find(
    ({ obligation_id: id }) => id === promise.obligation_id
  );
  if (!promise || obligations.filter(
    ({ obligation_id: id }) => id === promise.obligation_id
  ).length !== 1
      || canonicalDigest(obligation.policy_ref)
        !== canonicalDigest(promise.policy_ref)
      || String(obligation.policy_version) !== String(promise.policy_version)
      || obligation.promisor_ref?.entity_id !== promise.promisor_actor_id
      || obligation.beneficiary_ref?.entity_id
        !== promise.beneficiary_actor_id
      || canonicalDigest(
        obligation.witness_refs?.map(({ entity_id: id }) => id)
      ) !== canonicalDigest(promise.witness_actor_ids)
      || canonicalDigest(obligation.scope_snapshot)
        !== canonicalDigest(promise.scope_snapshot)
      || obligation.current_state !== promise.current_state
      || obligation.current_state_fact !== promise.current_state_fact
      || Number(obligation.state_version) !== Number(promise.state_version)
      || obligation.created_change_set_id !== promise.created_change_set_id
      || obligation.last_change_set_id !== promise.last_change_set_id) fail();

  const semanticNegotiations = negotiationHistory.filter(
    ({ consequence: c }) =>
      c.negotiation.semantic_exchange_projection != null
  );
  const surrenderHistory = semanticNegotiations.filter(
    ({ consequence: c }) =>
      c.negotiation.semantic_exchange_projection.commitment?.status
        === 'active'
  );
  if ((promise.current_state === 'active')
      !== (payload.ratsha_surrendered === true)) fail();
  assertSemanticPromiseTransitions({
    promise,
    transitions,
    surrender: surrenderHistory[0] ?? null
  });
  if (promise.current_state === 'active') {
    if (surrenderHistory.length !== 1) fail();
    assertSemanticCommitment({
      payload,
      promise,
      entry: surrenderHistory[0]
    });
  } else if (surrenderHistory.length !== 0) {
    fail();
  }
  if (payload.ratsha_surrendered) {
    assertSemanticSurrender({
      payload,
      entry: surrenderHistory[0],
      knife,
      npcTransitions,
      knowledge
    });
  }
}

function assertSemanticPromiseTransitions({ promise, transitions, surrender }) {
  const relevant = transitions.filter(
    ({ obligation_id: id }) => id === promise.obligation_id
  );
  const expectedCount = promise.current_state === 'active'
    ? 2
    : promise.current_state === 'offered'
      ? 1
      : 0;
  const semantic =
    surrender?.consequence.negotiation.semantic_exchange_projection;
  if (relevant.length !== expectedCount
      || (expectedCount > 0
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
      || (expectedCount === 2
        && (relevant[1]?.from_state !== 'offered'
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
          || !relevant[1].check_resolution_id.endsWith(
            `:${surrender.turn_number}`
          )
          || relevant[1]?.npc_decision_request_id
            !== semantic?.request_id))) fail();
}

function assertSemanticCommitment({ payload, promise, entry }) {
  const semantic = entry.consequence.negotiation
    .semantic_exchange_projection;
  const commitment = semantic.commitment;
  const statementIds = new Set((payload.conversation_statements ?? []).map(
    ({ statement_id: id }) => id
  ));
  const refsExist = (refs) => Array.isArray(refs) && refs.every(
    ({ entity_kind: kind, entity_id: id }) =>
      kind === 'conversation_statement' && statementIds.has(id)
  );
  if (commitment?.schema !== 'party_local_commitment_proposal_v1'
      || commitment.status !== 'active'
      || commitment.policy_ref?.entity_kind !== 'promise_policy'
      || commitment.policy_ref?.entity_id !== promise.policy_ref?.id
      || commitment.parties?.promisor_ref?.entity_id
        !== promise.promisor_actor_id
      || canonicalDigest(
        commitment.parties?.beneficiary_refs?.map(({ entity_id: id }) => id)
      ) !== canonicalDigest([promise.beneficiary_actor_id])
      || canonicalDigest(
        commitment.witness_refs?.map(({ entity_id: id }) => id).sort()
      ) !== canonicalDigest([...promise.witness_actor_ids].sort())
      || commitment.terms?.obligation_summary
        !== promise.scope_snapshot?.obligation
      || canonicalDigest([...(commitment.terms?.conditions ?? [])].sort())
        !== canonicalDigest([...(promise.scope_snapshot?.conditions ?? [])]
          .sort())
      || !refsExist(commitment.offer_statement_refs)
      || !refsExist(commitment.acceptance_statement_refs)
      || !refsExist(commitment.causal_statement_refs)
      || commitment.offer_statement_refs.length === 0
      || commitment.acceptance_statement_refs.length !== 1
      || canonicalDigest(commitment.acceptance_statement_refs[0])
        !== canonicalDigest(semantic.surrender?.source_statement_ref)
      || canonicalDigest([
        ...commitment.offer_statement_refs,
        ...commitment.acceptance_statement_refs
      ].sort(compareRefs))
        !== canonicalDigest([...commitment.causal_statement_refs]
          .sort(compareRefs))) fail();
}

function assertSemanticSurrender({
  payload,
  entry,
  knife,
  npcTransitions,
  knowledge
}) {
  const semantic = entry?.consequence.negotiation
    .semantic_exchange_projection;
  const actualKnife = knife.rows[0];
  const expectedKnife = payload.items.find(({ template_id: id }) =>
    id === 'trace_ld_v1_item_ratsha_knife');
  const fisher = entry?.consequence.negotiation.participating_fisher_id;
  const ratsha = payload.npcs.find(({ participant_slot_ref }) =>
    participant_slot_ref === 'ratsha_storehouse_helper')?.instance_id;
  const requestId = semantic?.request_id;
  const surrenderTransitions = npcTransitions.filter(
    ({ transition_kind: kind }) => kind === 'surrendered_without_further_harm'
  );
  const surrenderKnowledge = knowledge.find(
    ({ fact_id: id }) => id === 'promise_activation_basis_committed'
  );
  if (semantic?.surrender?.fact_id
        !== 'ratsha_surrender_without_further_harm_committed'
      || semantic?.knife_transition_eligibility?.eligible !== true
      || knife.rowCount !== 1
      || actualKnife.holder_npc_id !== fisher
      || actualKnife.holder_character_id != null
      || actualKnife.physical_position
        !== expectedKnife?.placement?.physical_position
      || actualKnife.owner_npc_id !== ratsha
      || actualKnife.owner_character_id != null
      || actualKnife.controller_npc_id !== fisher
      || actualKnife.controller_character_id != null
      || canonicalDigest(actualKnife.state)
        !== canonicalDigest(expectedKnife?.state)
      || surrenderTransitions.length !== 1
      || surrenderTransitions[0].npc_id !== ratsha
      || surrenderTransitions[0].machine_state?.surrender_state
        !== 'surrendered_without_further_harm'
      || surrenderTransitions[0].semantic_state?.surrender_fact
        !== 'ratsha_surrender_without_further_harm_committed'
      || surrenderKnowledge?.knowledge_state
        !== 'known_from_committed_source'
      || !surrenderKnowledge?.evidence?.includes(requestId)) fail();
}
