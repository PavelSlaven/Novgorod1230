import { planPartyLocalCommitment } from '@rus/social-law';
import {
  compareRefs,
  fail,
  npcRef,
  ref,
  sameRef
} from './lower-dvina-trace-m2-conversation-shared.js';

export function buildSurrenderProjection(result, context) {
  const statements = [
    ...(context.state.conversation_statements ?? []),
    ...result.statements
  ].filter(({ conversation_id: conversationId, exchange_id: exchangeId }) =>
    conversationId === context.conversationId
      && exchangeId === context.exchangeId);
  const audiences = [
    ...(context.state.conversation_audiences ?? []),
    ...result.audiences
  ];
  const playerStatement = statements.find(({ speaker_ref: speaker }) =>
    speaker?.entity_kind === 'player_character');
  const npcStatement = statements.find(({ speaker_ref: speaker }) =>
    sameRef(speaker, context.targetRef));
  const playerAudience = audiences.find(({ statement_ref: statementRef }) =>
    statementRef?.entity_id === playerStatement?.statement_id);
  const npcAudience = audiences.find(({ statement_ref: statementRef }) =>
    statementRef?.entity_id === npcStatement?.statement_id);
  if (!playerStatement || !npcStatement || !playerAudience || !npcAudience) {
    fail(
      'TRACE_M2_SURRENDER_STATEMENT_GAP',
      'Surrender requires committed offer and acceptance statements.'
    );
  }
  const playerRef = ref('player_character', context.state.actor_id);
  const ratshaRef = context.targetRef;
  const statementRefs = [playerStatement, npcStatement]
    .map(({ statement_id: statementId }) =>
      ref('conversation_statement', statementId))
    .sort(compareRefs);
  const acceptanceRef = ref(
    'conversation_statement',
    npcStatement.statement_id
  );
  const witnessRefs = playerAudience.witness_candidate_refs.filter(
    (candidate) => npcAudience.witness_candidate_refs.some(
      (witness) => sameRef(witness, candidate)
    )
  ).sort(compareRefs);
  const eligibleWitnessRefs = [
    npcRef(context.contracts.actors.eremey_fisher.instance_id),
    npcRef(context.contracts.actors.participating_fisher.instance_id)
  ].sort(compareRefs);
  const partyRefs = [playerRef, ratshaRef, ...witnessRefs].sort(compareRefs);
  const policyRef = ref(
    'promise_policy',
    context.contracts.promisePolicy.policy_id
  );
  const witnessPolicyRef = ref(
    'witness_policy',
    `${context.contracts.promisePolicy.policy_id}:present-witnesses`
  );
  const commitment = planPartyLocalCommitment({
    acceptance_statement_refs: [acceptanceRef],
    committed_statement_refs: statementRefs,
    parties: {
      beneficiary_refs: [ratshaRef],
      promisor_ref: playerRef
    },
    party_perceptions: partyRefs.map((partyRef) =>
      commitmentPerceptionForParty({
        partyRef,
        statements: [playerStatement, npcStatement],
        audiences: [playerAudience, npcAudience]
      })),
    policy: {
      acceptance_required: true,
      eligible_witness_refs: eligibleWitnessRefs,
      policy_ref: policyRef,
      required_acceptance_perceiving_party_refs: [playerRef],
      required_offer_perceiving_party_refs: [ratshaRef],
      witness_policy_ref: witnessPolicyRef
    },
    terms: {
      beneficiary_refs: [ratshaRef],
      conditions: [...context.contracts.promisePolicy.scope.conditions].sort(),
      deadline: null,
      kind: 'promise_offer',
      obligation_summary:
        context.contracts.promisePolicy.scope.obligation,
      promisor_ref: playerRef,
      requested_witness_policy_ref: witnessPolicyRef,
      required_acceptance: true
    },
    witness_candidates: witnessRefs
  });
  const active = commitment.status === 'active';
  return {
    surrender: active ? {
      fact_id: context.contracts.promisePolicy.offer_timing
        .surrender_condition,
      source_statement_ref: acceptanceRef,
      semantic_act: npcStatement.dominant_act,
      semantic_tag: 'surrender',
      claim_truth_projection: 'speaker_claim_only'
    } : null,
    commitment,
    knifeTransitionEligibility: active ? {
      eligible: true,
      requires_fact_id: context.contracts.promisePolicy.offer_timing
        .surrender_condition,
      transition_profile_ref:
        context.contracts.knifeTransition.transition_profile_id,
      recipient_actor_ref: npcRef(
        context.contracts.actors.participating_fisher.instance_id
      ),
      execution_owner: 'item_property_transition_owner'
    } : null
  };
}

function commitmentPerceptionForParty({ partyRef, statements, audiences }) {
  const perceivedStatementRefs = [];
  for (const statement of statements) {
    const statementRef = ref(
      'conversation_statement',
      statement.statement_id
    );
    const ownStatement = sameRef(statement.speaker_ref, partyRef);
    const audience = audiences.find(({ statement_ref: audienceRef }) =>
      sameRef(audienceRef, statementRef));
    const received = audience?.received_messages.find(
      ({ listener_ref: listenerRef }) => sameRef(listenerRef, partyRef)
    );
    if (ownStatement || (received?.comprehension === 'full'
        && received.speaker_ref !== null
        && received.utterance_text !== null)) {
      perceivedStatementRefs.push(statementRef);
    }
  }
  const full = perceivedStatementRefs.length === statements.length;
  return {
    comprehension: full
      ? 'full'
      : perceivedStatementRefs.length === 0 ? 'none' : 'partial',
    party_ref: partyRef,
    speaker_recognized: full,
    statement_refs: perceivedStatementRefs.sort(compareRefs)
  };
}
