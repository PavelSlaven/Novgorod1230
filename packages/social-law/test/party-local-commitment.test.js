import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PartyLocalCommitmentPlanningError,
  planPartyLocalCommitment
} from '../src/party-local-commitment.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const acceptanceRef = ref('conversation_statement', 'statement-acceptance');
const offerRef = ref('conversation_statement', 'statement-offer');
const beneficiaryRef = ref('npc', 'beneficiary');
const promisorRef = ref('npc', 'promisor');

function commitmentInput(overrides = {}) {
  return {
    acceptance_statement_refs: [acceptanceRef],
    committed_statement_refs: [acceptanceRef, offerRef],
    parties: {
      beneficiary_refs: [beneficiaryRef],
      promisor_ref: promisorRef
    },
    party_perceptions: [{
      comprehension: 'full',
      party_ref: beneficiaryRef,
      speaker_recognized: true,
      statement_refs: [acceptanceRef, offerRef]
    }],
    policy: {
      acceptance_required: true,
      eligible_witness_refs: [],
      policy_ref: ref('social_policy', 'promise-policy'),
      required_perceiving_party_refs: [beneficiaryRef],
      witness_policy_ref: null
    },
    terms: {
      beneficiary_refs: [beneficiaryRef],
      conditions: [],
      deadline: null,
      kind: 'promise_offer',
      obligation_summary: 'Привезти лодку.',
      promisor_ref: promisorRef,
      requested_witness_policy_ref: null,
      required_acceptance: true
    },
    witness_candidates: [],
    ...overrides
  };
}

test('party-local commitment becomes active only after committed acceptance was actually perceived', () => {
  const active = planPartyLocalCommitment(commitmentInput());
  assert.equal(active.status, 'active');
  assert.deepEqual(active.offer_statement_refs, [offerRef]);
  assert.deepEqual(active.acceptance_statement_refs, [acceptanceRef]);

  const offered = planPartyLocalCommitment(commitmentInput({
    party_perceptions: [{
      comprehension: 'full',
      party_ref: beneficiaryRef,
      speaker_recognized: true,
      statement_refs: [offerRef]
    }]
  }));
  assert.equal(offered.status, 'offered');
});

test('party-local commitment rejects acceptance outside the exact committed statements', () => {
  assert.throws(
    () => planPartyLocalCommitment(commitmentInput({
      committed_statement_refs: [offerRef]
    })),
    (error) => error instanceof PartyLocalCommitmentPlanningError
      && error.code === 'PARTY_LOCAL_COMMITMENT_REFERENCE_MISMATCH'
  );
});
