import { deepFreeze } from '@rus/kernel';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  compareGameTimestamp,
  normalizeGameTimestamp
} from './exact-time.js';

const INTERRUPTION_EFFECTS = new Set(['background', 'emergency', 'hard_interrupt', 'interaction', 'notice', 'strand']);
const PHASE_KEYS = [
  'phase_id',
  'status',
  'event_ref',
  'scope_ref',
  'applicability',
  'start_at',
  'end_at',
  'source_refs',
  'provenance_refs',
  'local_effect_rule_ref',
  'boundary_policy_ref',
  'visibility_policy_ref',
  'interrupt_effect',
  'allow_derived_visible_effects',
  'dependency_pins',
  'canonical_digest'
];
const EVIDENCE_KEYS = [
  'activation_id',
  'idempotency_key',
  'candidate_digest',
  'preconditions_digest',
  'activated_at',
  'effect_proposal_digest',
  'canonical_digest'
];
const HIDDEN_PRESENTATION_KEYS = new Set([
  'activation_evidence',
  'boundary_id',
  'candidate_digest',
  'phase_boundary_ref',
  'phase_digest',
  'phase_id',
  'preconditions_digest',
  'provenance_refs',
  'source_refs'
]);

export class HistoricalPhaseError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'HistoricalPhaseError';
    this.code = code;
    this.details = freeze(details);
  }
}

function fail(code, message, details) {
  throw new HistoricalPhaseError(code, message, details);
}

function freeze(value) {
  return deepFreeze(structuredClone(value));
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function stableId(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function contractValid(contractName, value) {
  return validateSpatialV3Contract(contractName, value).length === 0;
}

function sealedRecord(value) {
  if (!record(value) || typeof value.canonical_digest !== 'string') return false;
  const payload = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'canonical_digest'));
  return value.canonical_digest === computeSpatialV3CanonicalDigest(payload);
}

function refKey(value) {
  return `${value.entity_kind}\u0000${value.entity_id}`;
}

function versionedRefKey(value) {
  return `${refKey(value.entity_ref)}\u0000${value.authoring_version}`;
}

function sameRef(left, right) {
  return refKey(left) === refKey(right);
}

function uniqueVersionedRefs(values) {
  return Array.isArray(values)
    && values.length > 0
    && values.every((entry) => contractValid('versioned_ref', entry))
    && new Set(values.map(versionedRefKey)).size === values.length;
}

function versionedRefPinned(pinSet, dependencyRole, reference) {
  return pinSet.pins.some((pin) => pin.dependency_role === dependencyRole
    && sameRef(pin.entity_ref, reference.entity_ref)
    && pin.version_pin.pin_kind === 'authoring_version'
    && pin.version_pin.authoring_version === reference.authoring_version);
}

function validatePhase(rawPhase) {
  if (!exactKeys(rawPhase, PHASE_KEYS)
    || rawPhase.status !== 'approved'
    || !stableId(rawPhase.phase_id)
    || !sealedRecord(rawPhase)
    || !contractValid('entity_ref', rawPhase.event_ref)
    || !contractValid('entity_ref', rawPhase.scope_ref)
    || !exactKeys(rawPhase.applicability, ['scope_refs'])
    || !Array.isArray(rawPhase.applicability.scope_refs)
    || rawPhase.applicability.scope_refs.length === 0
    || rawPhase.applicability.scope_refs.some((entry) => !contractValid('entity_ref', entry))
    || new Set(rawPhase.applicability.scope_refs.map(refKey)).size !== rawPhase.applicability.scope_refs.length
    || !rawPhase.applicability.scope_refs.some((entry) => sameRef(entry, rawPhase.scope_ref))
    || !uniqueVersionedRefs(rawPhase.source_refs)
    || !uniqueVersionedRefs(rawPhase.provenance_refs)
    || !contractValid('versioned_ref', rawPhase.local_effect_rule_ref)
    || !contractValid('versioned_ref', rawPhase.boundary_policy_ref)
    || !contractValid('versioned_ref', rawPhase.visibility_policy_ref)
    || !INTERRUPTION_EFFECTS.has(rawPhase.interrupt_effect)
    || typeof rawPhase.allow_derived_visible_effects !== 'boolean'
    || !contractValid('dependency_pin_set', rawPhase.dependency_pins)
    || !sealedRecord(rawPhase.dependency_pins)) {
    fail('historical_phase_rule_gap', 'An approved sealed source-backed historical phase is required');
  }

  let startAt;
  let endAt;
  try {
    startAt = normalizeGameTimestamp(rawPhase.start_at);
    endAt = normalizeGameTimestamp(rawPhase.end_at);
  } catch (error) {
    fail('time_timestamp_invalid', `Historical phase timestamp is invalid: ${error.message}`);
  }
  if (compareGameTimestamp(endAt, startAt) <= 0) {
    fail('historical_phase_rule_gap', 'Historical phase end must follow its exact start');
  }
  if (!rawPhase.source_refs.every((entry) => versionedRefPinned(rawPhase.dependency_pins, 'source_dependency', entry))
    || !rawPhase.provenance_refs.every((entry) => versionedRefPinned(rawPhase.dependency_pins, 'profile_rule_dependency', entry))
    || !versionedRefPinned(rawPhase.dependency_pins, 'condition_rule', rawPhase.local_effect_rule_ref)
    || !versionedRefPinned(rawPhase.dependency_pins, 'condition_rule', rawPhase.boundary_policy_ref)
    || !versionedRefPinned(rawPhase.dependency_pins, 'condition', rawPhase.visibility_policy_ref)) {
    fail('historical_phase_rule_gap', 'Historical sources, provenance and local policies require matching dependency pins');
  }

  return freeze({
    ...rawPhase,
    start_at: startAt,
    end_at: endAt,
    source_refs: [...rawPhase.source_refs].sort((left, right) => versionedRefKey(left).localeCompare(versionedRefKey(right), 'en')),
    provenance_refs: [...rawPhase.provenance_refs].sort((left, right) => versionedRefKey(left).localeCompare(versionedRefKey(right), 'en'))
  });
}

function historicalCandidate(phase) {
  const preconditionsDigest = computeSpatialV3CanonicalDigest({
    phase_digest: phase.canonical_digest,
    scope_ref: phase.scope_ref,
    event_ref: phase.event_ref,
    dependency_pins_digest: phase.dependency_pins.canonical_digest
  });
  const candidate = {
    boundary_id: `historical-phase:${phase.phase_id}`,
    boundary_kind: 'historical_phase',
    scheduled_at: phase.start_at,
    source_ref: phase.source_refs[0].entity_ref,
    primary_subject_ref: phase.event_ref,
    scope_ref: phase.scope_ref,
    rule_ref: phase.local_effect_rule_ref,
    policy_ref: phase.boundary_policy_ref,
    preconditions_digest: preconditionsDigest,
    resolution_class: 'cooccurring_fact',
    interrupt_effect: phase.interrupt_effect,
    visibility_policy_ref: phase.visibility_policy_ref,
    idempotency_key: `historical-phase:${phase.phase_id}:${preconditionsDigest}`,
    subject_refs: [phase.event_ref],
    causal_parent_refs: []
  };
  const violations = validateSpatialV3Contract('temporal_boundary_candidate', candidate);
  if (violations.length > 0) {
    fail('generated_schema_mismatch', 'Historical provider produced a non-formal temporal boundary candidate', { violations });
  }
  return freeze(candidate);
}

/**
 * Pure source-backed provider for historical phase start boundaries.
 * The provider owns no persistence and uses the exact interval (from, limit].
 */
export function provideHistoricalPhaseBoundaries({
  from_timestamp,
  limit_timestamp,
  scope_ref,
  records,
  max_records = 10_000
} = {}) {
  if (!Number.isSafeInteger(max_records) || max_records <= 0) {
    fail('generated_schema_mismatch', 'max_records must be a positive safe integer');
  }
  if (!Array.isArray(records) || records.length === 0) {
    fail('historical_phase_rule_gap', 'The required historical phase catalog is absent');
  }
  if (records.length > max_records) {
    fail('temporal_execution_unbounded', 'Historical phase provider exceeded its explicit record cap', {
      record_count: records.length,
      max_records
    });
  }
  if (!contractValid('entity_ref', scope_ref)) {
    fail('generated_schema_mismatch', 'Historical phase scope_ref must be a registered entity_ref');
  }
  let from;
  let limit;
  try {
    from = normalizeGameTimestamp(from_timestamp);
    limit = normalizeGameTimestamp(limit_timestamp);
  } catch (error) {
    fail('time_timestamp_invalid', error.message);
  }
  if (compareGameTimestamp(limit, from) < 0) {
    fail('time_window_invalid', 'Historical boundary limit cannot precede the current timestamp');
  }

  const byPhaseId = new Map();
  for (const rawPhase of records) {
    const phase = validatePhase(rawPhase);
    const previous = byPhaseId.get(phase.phase_id);
    if (previous && previous.canonical_digest !== phase.canonical_digest) {
      fail('temporal_boundary_ambiguous', 'One historical phase identity has conflicting sealed definitions', {
        phase_id: phase.phase_id
      });
    }
    if (!previous) byPhaseId.set(phase.phase_id, phase);
  }

  const candidates = [];
  for (const phase of byPhaseId.values()) {
    if (!phase.applicability.scope_refs.some((entry) => sameRef(entry, scope_ref))) continue;
    if (compareGameTimestamp(phase.start_at, from) <= 0 || compareGameTimestamp(phase.start_at, limit) > 0) continue;
    candidates.push(historicalCandidate(phase));
  }
  candidates.sort((left, right) => compareGameTimestamp(left.scheduled_at, right.scheduled_at)
    || left.boundary_id.localeCompare(right.boundary_id, 'en'));
  return freeze(candidates);
}

function effectProposal(candidate) {
  return freeze({
    effect_kind: 'historical_phase_activation',
    phase_boundary_ref: {
      entity_kind: 'temporal_boundary_candidate',
      entity_id: candidate.boundary_id
    },
    rule_ref: candidate.rule_ref,
    policy_ref: candidate.policy_ref,
    source_ref: candidate.source_ref,
    primary_subject_ref: candidate.primary_subject_ref,
    scope_ref: candidate.scope_ref,
    scheduled_at: candidate.scheduled_at
  });
}

function validateEvidence(value) {
  if (!exactKeys(value, EVIDENCE_KEYS)
    || !stableId(value.activation_id)
    || !stableId(value.idempotency_key)
    || typeof value.candidate_digest !== 'string'
    || typeof value.preconditions_digest !== 'string'
    || typeof value.effect_proposal_digest !== 'string'
    || !sealedRecord(value)) {
    fail('generated_schema_mismatch', 'Historical activation evidence is malformed');
  }
  try {
    normalizeGameTimestamp(value.activated_at);
  } catch (error) {
    fail('generated_schema_mismatch', `Historical activation evidence timestamp is invalid: ${error.message}`);
  }
  return freeze(value);
}

/**
 * Creates a stateless resolver over caller-supplied persisted activation
 * evidence. The returned evidence must be committed atomically by the caller.
 */
export function createHistoricalPhaseHandler({ activation_evidence = [] } = {}) {
  if (!Array.isArray(activation_evidence)) {
    fail('generated_schema_mismatch', 'activation_evidence must be an array');
  }
  const evidenceByKey = new Map();
  for (const rawEvidence of activation_evidence) {
    const evidence = validateEvidence(rawEvidence);
    const previous = evidenceByKey.get(evidence.idempotency_key);
    if (previous && previous.candidate_digest !== evidence.candidate_digest) {
      fail('idempotency_conflict', 'Persisted historical evidence conflicts for one idempotency key');
    }
    evidenceByKey.set(evidence.idempotency_key, evidence);
  }

  return Object.freeze({
    resolve({ candidate, observed_preconditions_digest } = {}) {
      const violations = validateSpatialV3Contract('temporal_boundary_candidate', candidate);
      if (violations.length > 0 || candidate?.boundary_kind !== 'historical_phase') {
        fail('generated_schema_mismatch', 'Historical handler requires one formal historical_phase candidate', { violations });
      }
      if (observed_preconditions_digest !== candidate.preconditions_digest) {
        fail('state_version_conflict', 'Historical phase preconditions changed before activation');
      }
      const candidateDigest = computeSpatialV3CanonicalDigest(candidate);
      const proposal = effectProposal(candidate);
      const previous = evidenceByKey.get(candidate.idempotency_key);
      if (previous) {
        if (previous.candidate_digest !== candidateDigest) {
          fail('idempotency_conflict', 'Historical boundary idempotency key was reused for another immutable candidate');
        }
        return freeze({
          status: 'already_activated',
          effect_proposal: proposal,
          activation_evidence: [...evidenceByKey.values()]
        });
      }

      const evidencePayload = {
        activation_id: `historical-activation:${candidate.boundary_id}`,
        idempotency_key: candidate.idempotency_key,
        candidate_digest: candidateDigest,
        preconditions_digest: candidate.preconditions_digest,
        activated_at: candidate.scheduled_at,
        effect_proposal_digest: computeSpatialV3CanonicalDigest(proposal)
      };
      const evidence = freeze({
        ...evidencePayload,
        canonical_digest: computeSpatialV3CanonicalDigest(evidencePayload)
      });
      evidenceByKey.set(candidate.idempotency_key, evidence);
      return freeze({
        status: 'activated',
        effect_proposal: proposal,
        activation_evidence: [...evidenceByKey.values()]
      });
    }
  });
}

function assertNoHiddenPresentationData(value) {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoHiddenPresentationData(entry);
    return;
  }
  if (!record(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (HIDDEN_PRESENTATION_KEYS.has(key)) {
      fail('hidden_information_leak', `Historical visible projection contains forbidden field ${key}`);
    }
    assertNoHiddenPresentationData(entry);
  }
}

export function projectHistoricalPhaseVisibleEffects({ activation, perceived_effects } = {}) {
  if (!record(activation)
    || !['activated', 'already_activated'].includes(activation.status)
    || !record(activation.effect_proposal)
    || !Array.isArray(perceived_effects)) {
    fail('generated_schema_mismatch', 'Visible historical projection requires a resolved activation and explicit perceived effects');
  }
  const visible = [];
  for (const effect of perceived_effects) {
    if (!exactKeys(effect, ['effect_id', 'visible', 'presentation'])
      || !stableId(effect.effect_id)
      || typeof effect.visible !== 'boolean'
      || !record(effect.presentation)) {
      fail('hidden_information_leak', 'Perceived historical effect contains non-allowlisted structure');
    }
    assertNoHiddenPresentationData(effect.presentation);
    if (effect.visible) visible.push({ effect_id: effect.effect_id, presentation: effect.presentation });
  }
  return freeze(visible);
}
