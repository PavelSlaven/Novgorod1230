import { deepFreeze } from '@rus/kernel';

const STRUCTURE_INVALID = 'PARTY_LOCAL_COMMITMENT_STRUCTURE_INVALID';
const REFERENCE_MISMATCH = 'PARTY_LOCAL_COMMITMENT_REFERENCE_MISMATCH';
const POLICY_GAP = 'CONVERSATION_COMMITMENT_POLICY_GAP';

const INPUT_KEYS = [
  'acceptance_statement_refs',
  'committed_statement_refs',
  'parties',
  'party_perceptions',
  'policy',
  'terms',
  'witness_candidates'
];
const TERMS_KEYS = [
  'beneficiary_refs',
  'conditions',
  'deadline',
  'kind',
  'obligation_summary',
  'promisor_ref',
  'requested_witness_policy_ref',
  'required_acceptance'
];
const PARTIES_KEYS = ['beneficiary_refs', 'promisor_ref'];
const PERCEPTION_KEYS = ['comprehension', 'party_ref', 'speaker_recognized', 'statement_refs'];
const POLICY_KEYS = [
  'acceptance_required',
  'eligible_witness_refs',
  'policy_ref',
  'required_acceptance_perceiving_party_refs',
  'required_offer_perceiving_party_refs',
  'witness_policy_ref'
];
const REF_KEYS = ['entity_id', 'entity_kind'];
const COMPREHENSION_VALUES = new Set(['full', 'partial', 'none']);

export class PartyLocalCommitmentPlanningError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PartyLocalCommitmentPlanningError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

/**
 * Plans a party-local commitment solely from already committed conversation facts.
 * It neither executes a promise lifecycle nor persists or semantically repairs input.
 */
export function planPartyLocalCommitment(input = {}) {
  validateExactObject(input, INPUT_KEYS, 'input');

  const committedStatementRefs = validateRefArray(
    input.committed_statement_refs,
    'committed_statement_refs',
    { nonEmpty:true }
  );
  validateTerms(input.terms);
  validateParties(input.parties);
  validatePerceptions(input.party_perceptions, committedStatementRefs);
  validatePolicy(input.policy);
  const acceptanceStatementRefs = validateRefArray(
    input.acceptance_statement_refs,
    'acceptance_statement_refs'
  );
  const witnessCandidates = validateRefArray(input.witness_candidates, 'witness_candidates');

  requireSameRef(
    input.parties.promisor_ref,
    input.terms.promisor_ref,
    'parties.promisor_ref',
    'terms.promisor_ref'
  );
  requireSameRefArray(
    input.parties.beneficiary_refs,
    input.terms.beneficiary_refs,
    'parties.beneficiary_refs',
    'terms.beneficiary_refs'
  );
  if (input.policy.acceptance_required !== input.terms.required_acceptance) {
    mismatch('Acceptance requirement does not match the applicable policy.', {
      terms_required_acceptance:input.terms.required_acceptance,
      policy_acceptance_required:input.policy.acceptance_required
    });
  }
  requireSameNullableRef(
    input.terms.requested_witness_policy_ref,
    input.policy.witness_policy_ref,
    'terms.requested_witness_policy_ref',
    'policy.witness_policy_ref'
  );
  requireSubset(
    acceptanceStatementRefs,
    committedStatementRefs,
    'acceptance_statement_refs',
    'committed_statement_refs'
  );

  if (!input.policy.acceptance_required && acceptanceStatementRefs.length !== 0) {
    mismatch('Acceptance statements are forbidden when acceptance is not required.', {
      acceptance_statement_refs:acceptanceStatementRefs
    });
  }

  const acceptanceKeys = new Set(acceptanceStatementRefs.map(refKey));
  const offerStatementRefs = committedStatementRefs.filter((ref) => !acceptanceKeys.has(refKey(ref)));
  if (offerStatementRefs.length === 0) {
    mismatch('At least one committed offer statement is required.', {
      committed_statement_refs:committedStatementRefs,
      acceptance_statement_refs:acceptanceStatementRefs
    });
  }

  const parties = [input.parties.promisor_ref, ...input.parties.beneficiary_refs];
  const partyKeys = new Set(parties.map(refKey));
  const perceptionByParty = new Map(
    input.party_perceptions.map((perception) => [refKey(perception.party_ref), perception])
  );
  const invalidRequiredPerceptions =
    input.policy.required_offer_perceiving_party_refs.filter((partyRef) =>
    !partyKeys.has(refKey(partyRef))
      || !fullyPerceived(perceptionByParty.get(refKey(partyRef)), offerStatementRefs)
  );
  if (invalidRequiredPerceptions.length !== 0) {
    throw new PartyLocalCommitmentPlanningError(
      POLICY_GAP,
      'Required perceivers must be parties with full recognized perception of the committed offer.',
      {
        invalid_required_offer_perceiving_party_refs:
          invalidRequiredPerceptions
      }
    );
  }

  const eligibleWitnessKeys = new Set(
    input.policy.eligible_witness_refs.map(refKey)
  );
  const witnessRefs = witnessCandidates.filter((candidate) =>
    eligibleWitnessKeys.has(refKey(candidate))
      && fullyPerceived(
        perceptionByParty.get(refKey(candidate)),
        offerStatementRefs
      )
  );
  const requiredAcceptancePerceivers =
    input.policy.required_acceptance_perceiving_party_refs;
  const invalidAcceptancePerceivers = requiredAcceptancePerceivers.filter(
    (partyRef) => !partyKeys.has(refKey(partyRef))
  );
  if (invalidAcceptancePerceivers.length !== 0) {
    throw new PartyLocalCommitmentPlanningError(
      POLICY_GAP,
      'Required acceptance perceivers must be commitment parties.',
      {
        invalid_required_acceptance_perceiving_party_refs:
          invalidAcceptancePerceivers
      }
    );
  }
  const acceptanceComplete = input.policy.acceptance_required
    && acceptanceStatementRefs.length !== 0
    && requiredAcceptancePerceivers.every((partyRef) =>
      fullyPerceived(perceptionByParty.get(refKey(partyRef)),
        acceptanceStatementRefs)
    );
  const status = input.policy.acceptance_required
    ? (acceptanceComplete ? 'active' : 'offered')
    : 'active';

  return deepFreeze({
    schema:'party_local_commitment_proposal_v1',
    policy_ref:structuredClone(input.policy.policy_ref),
    status,
    terms:structuredClone(input.terms),
    parties:structuredClone(input.parties),
    offer_statement_refs:structuredClone(offerStatementRefs),
    acceptance_statement_refs:structuredClone(acceptanceStatementRefs),
    witness_refs:structuredClone(witnessRefs),
    causal_statement_refs:structuredClone(committedStatementRefs)
  });
}

function validateTerms(terms) {
  validateExactObject(terms, TERMS_KEYS, 'terms');
  if (terms.kind !== 'promise_offer') invalid('terms.kind must be promise_offer.', { path:'terms.kind' });
  validateRef(terms.promisor_ref, 'terms.promisor_ref');
  validateRefArray(terms.beneficiary_refs, 'terms.beneficiary_refs');
  validateText(terms.obligation_summary, 'terms.obligation_summary');
  validateStringArray(terms.conditions, 'terms.conditions');
  if (terms.deadline !== null) validateText(terms.deadline, 'terms.deadline');
  validateBoolean(terms.required_acceptance, 'terms.required_acceptance');
  validateNullableRef(terms.requested_witness_policy_ref, 'terms.requested_witness_policy_ref');
}

function validateParties(parties) {
  validateExactObject(parties, PARTIES_KEYS, 'parties');
  validateRef(parties.promisor_ref, 'parties.promisor_ref');
  validateRefArray(parties.beneficiary_refs, 'parties.beneficiary_refs');
}

function validatePerceptions(perceptions, committedStatementRefs) {
  validateArray(perceptions, 'party_perceptions');
  let previousKey = null;
  for (let index = 0; index < perceptions.length; index += 1) {
    const path = `party_perceptions[${index}]`;
    const perception = perceptions[index];
    validateExactObject(perception, PERCEPTION_KEYS, path);
    validateRef(perception.party_ref, `${path}.party_ref`);
    validateRefArray(perception.statement_refs, `${path}.statement_refs`);
    requireSubset(
      perception.statement_refs,
      committedStatementRefs,
      `${path}.statement_refs`,
      'committed_statement_refs'
    );
    if (!COMPREHENSION_VALUES.has(perception.comprehension)) {
      invalid('Perception comprehension is invalid.', { path:`${path}.comprehension` });
    }
    validateBoolean(perception.speaker_recognized, `${path}.speaker_recognized`);
    const currentKey = refKey(perception.party_ref);
    if (previousKey !== null && previousKey >= currentKey) {
      invalid('party_perceptions must be unique and canonically ordered by party_ref.', {
        path:'party_perceptions'
      });
    }
    previousKey = currentKey;
  }
}

function validatePolicy(policy) {
  validateExactObject(policy, POLICY_KEYS, 'policy');
  validateRef(policy.policy_ref, 'policy.policy_ref');
  validateRefArray(
    policy.required_offer_perceiving_party_refs,
    'policy.required_offer_perceiving_party_refs',
    { nonEmpty:true }
  );
  validateBoolean(policy.acceptance_required, 'policy.acceptance_required');
  validateRefArray(
    policy.required_acceptance_perceiving_party_refs,
    'policy.required_acceptance_perceiving_party_refs',
    { nonEmpty:policy.acceptance_required }
  );
  if (!policy.acceptance_required
      && policy.required_acceptance_perceiving_party_refs.length !== 0) {
    mismatch(
      'Acceptance perceivers are forbidden when acceptance is not required.',
      {
        required_acceptance_perceiving_party_refs:
          policy.required_acceptance_perceiving_party_refs
      }
    );
  }
  validateNullableRef(policy.witness_policy_ref, 'policy.witness_policy_ref');
  validateRefArray(policy.eligible_witness_refs, 'policy.eligible_witness_refs');
}

function validateRefArray(value, path, { nonEmpty = false } = {}) {
  validateArray(value, path);
  if (nonEmpty && value.length === 0) invalid(`${path} must not be empty.`, { path });
  let previousKey = null;
  for (let index = 0; index < value.length; index += 1) {
    validateRef(value[index], `${path}[${index}]`);
    const currentKey = refKey(value[index]);
    if (previousKey !== null && previousKey >= currentKey) {
      invalid(`${path} must contain unique refs in canonical lexicographic order.`, { path });
    }
    previousKey = currentKey;
  }
  return value;
}

function validateStringArray(value, path) {
  validateArray(value, path);
  let previous = null;
  for (let index = 0; index < value.length; index += 1) {
    validateText(value[index], `${path}[${index}]`);
    if (previous !== null && previous >= value[index]) {
      invalid(`${path} must contain unique strings in canonical lexicographic order.`, { path });
    }
    previous = value[index];
  }
}

function validateRef(value, path) {
  validateExactObject(value, REF_KEYS, path);
  validateText(value.entity_kind, `${path}.entity_kind`);
  validateText(value.entity_id, `${path}.entity_id`);
}

function validateNullableRef(value, path) {
  if (value !== null) validateRef(value, path);
}

function validateExactObject(value, expectedKeys, path) {
  if (!plainObject(value)) invalid(`${path} must be a plain object.`, { path });
  const actualKeys = Object.keys(value).sort(compareText);
  if (!sameStringArray(actualKeys, [...expectedKeys].sort(compareText))) {
    invalid(`${path} has an invalid shape.`, { path, expected_keys:expectedKeys, actual_keys:actualKeys });
  }
}

function validateArray(value, path) {
  if (!Array.isArray(value)) invalid(`${path} must be an array.`, { path });
}

function validateText(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(`${path} must be a non-empty string.`, { path });
  }
}

function validateBoolean(value, path) {
  if (typeof value !== 'boolean') invalid(`${path} must be a boolean.`, { path });
}

function requireSubset(actual, allowed, actualPath, allowedPath) {
  const allowedKeys = new Set(allowed.map(refKey));
  const unexpectedRefs = actual.filter((ref) => !allowedKeys.has(refKey(ref)));
  if (unexpectedRefs.length !== 0) {
    mismatch(`${actualPath} contains refs outside ${allowedPath}.`, {
      path:actualPath,
      allowed_path:allowedPath,
      unexpected_refs:unexpectedRefs
    });
  }
}

function requireSameRef(actual, expected, actualPath, expectedPath) {
  if (!sameRef(actual, expected)) {
    mismatch(`${actualPath} does not match ${expectedPath}.`, {
      actual_path:actualPath,
      expected_path:expectedPath,
      actual,
      expected
    });
  }
}

function requireSameNullableRef(actual, expected, actualPath, expectedPath) {
  if (actual === null && expected === null) return;
  if (actual === null || expected === null) {
    mismatch(`${actualPath} does not match ${expectedPath}.`, {
      actual_path:actualPath,
      expected_path:expectedPath,
      actual,
      expected
    });
  }
  requireSameRef(actual, expected, actualPath, expectedPath);
}

function requireSameRefArray(actual, expected, actualPath, expectedPath) {
  if (actual.length !== expected.length
    || actual.some((ref, index) => !sameRef(ref, expected[index]))) {
    mismatch(`${actualPath} does not match ${expectedPath}.`, {
      actual_path:actualPath,
      expected_path:expectedPath,
      actual,
      expected
    });
  }
}

function fullyPerceived(perception, statementRefs) {
  if (!perception
    || perception.comprehension !== 'full'
    || perception.speaker_recognized !== true) return false;
  const perceivedKeys = new Set(perception.statement_refs.map(refKey));
  return statementRefs.every((statementRef) => perceivedKeys.has(refKey(statementRef)));
}

function sameRef(left, right) {
  return left.entity_kind === right.entity_kind && left.entity_id === right.entity_id;
}

function refKey(ref) {
  return `${ref.entity_kind}\u0000${ref.entity_id}`;
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function plainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function invalid(message, details) {
  throw new PartyLocalCommitmentPlanningError(STRUCTURE_INVALID, message, details);
}

function mismatch(message, details) {
  throw new PartyLocalCommitmentPlanningError(REFERENCE_MISMATCH, message, details);
}
