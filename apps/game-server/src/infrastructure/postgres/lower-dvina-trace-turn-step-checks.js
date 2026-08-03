import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../../errors.js';
import { row } from './first-playable/plan-shared.js';

export function buildLowerDvinaTraceTurnStepCheckWrites({
  partyId, envelope, inputDigest, changeSetId, idemId
}) {
  const requests = envelope.checks.requests.filter((request) =>
    Object.hasOwn(request ?? {}, 'policy_profile_ref'));
  if (requests.some((request) => !validRequest(request))) checkGap(null, -1);
  const requestIds = requests.map(({ check_id: id }) => id);
  const requestIdSet = new Set(requestIds);
  const results = envelope.checks.results.filter(({ check_id: id } = {}) =>
    requestIdSet.has(id));
  const resultIds = results.map(({ check_id: id }) => id);
  if (new Set(requestIds).size !== requestIds.length
      || new Set(resultIds).size !== resultIds.length
      || requestIds.length !== resultIds.length) checkGap(null, -1);
  return results.map((result, index) => {
    const request = requests.find(({ check_id: id } = {}) =>
      id === result.check_id);
    if (!validResult(result) || !validRequest(request)
        || request.difficulty !== result.difficulty) checkGap(result, index);
    const checkResolutionId = `check:${partyId}:turn-step:${
      canonicalDigest({
        root_turn_id: envelope.root_turn_id,
        check_id: result.check_id
      }).slice(0, 20)}`;
    const scope = {
      root_turn_id: envelope.root_turn_id,
      check_id: result.check_id,
      idempotency_record_id: idemId
    };
    const record = {
      check_resolution_id: checkResolutionId,
      party_id: partyId,
      check_scope_kind: 'immediate_action',
      check_scope_key: scope,
      check_policy_ref: structuredClone(request.check_policy_ref),
      deterministic_roll_input_digest: canonicalDigest({
        input_digest: inputDigest,
        request,
        audit: result.audit
      }),
      roll_value: result.roll,
      modifier_snapshot: structuredClone(result.modifiers),
      target_value: result.difficulty,
      result_kind: result.outcome.success ? 'success' : 'failure',
      consequence_policy_ref:
        structuredClone(request.consequence_policy_ref),
      result_change_set_id: changeSetId,
      canonical_digest: canonicalDigest({
        scope,
        request,
        result,
        change_set_id: changeSetId
      })
    };
    return row('party_check_resolutions', checkResolutionId, record);
  });
}

function validRequest(value) {
  return plain(value)
    && exact(value, [
      'check_id', 'difficulty', 'policy_profile_ref', 'policy_profile_pin',
      'check_policy_ref',
      'consequence_policy_ref', 'check_plan_digest', 'outcome_map_digest',
      'step_plan_digest'
    ])
    && text(value.check_id)
    && Number.isSafeInteger(value.difficulty)
    && text(value.policy_profile_ref)
    && validProfilePin(value.policy_profile_pin)
    && plain(value.check_policy_ref)
    && exact(value.check_policy_ref, [
      'entity_kind', 'entity_id', 'authoring_version'
    ])
    && value.check_policy_ref.entity_kind === 'check_policy'
    && text(value.check_policy_ref.entity_id)
    && text(value.check_policy_ref.authoring_version)
    && value.policy_profile_ref === value.check_policy_ref.entity_id
    && plain(value.consequence_policy_ref)
    && exact(value.consequence_policy_ref, [
      'entity_kind', 'entity_id', 'authoring_version'
    ])
    && value.consequence_policy_ref.entity_kind === 'consequence_policy'
    && text(value.consequence_policy_ref.entity_id)
    && text(value.consequence_policy_ref.authoring_version)
    && [value.check_plan_digest, value.outcome_map_digest,
      value.step_plan_digest].every((digest) =>
      typeof digest === 'string' && /^[a-f0-9]{64}$/u.test(digest));
}

function validProfilePin(value) {
  return plain(value) && exact(value, ['artifact_id', 'revision', 'digest'])
    && text(value.artifact_id)
    && Number.isSafeInteger(value.revision) && value.revision >= 1
    && typeof value.digest === 'string'
    && /^[a-f0-9]{64}$/u.test(value.digest);
}

function validResult(value) {
  if (!(plain(value) && text(value.check_id)
      && Number.isSafeInteger(value.roll)
      && Number.isSafeInteger(value.difficulty)
      && plain(value.modifiers)
      && plain(value.outcome)
      && typeof value.outcome.success === 'boolean'
      && plain(value.audit)
      && value.audit.value === value.roll
      && value.audit.die === 'd20'
      && text(value.audit.algorithm)
      && text(value.audit.seed_ref)
      && Number.isSafeInteger(value.audit.counter))) return false;
  const modifiers = Object.values(value.modifiers);
  const total = value.roll + modifiers.reduce((sum, item) => sum + item, 0);
  const margin = total - value.difficulty;
  const band = margin >= 10 ? 'clean_success'
    : margin >= 0 ? 'success'
      : margin >= -4 ? 'success_with_cost'
        : margin >= -9 ? 'failure_with_consequence' : 'severe_failure';
  return value.roll >= 1 && value.roll <= 20
    && modifiers.every(Number.isFinite)
    && value.total === total && value.outcome.margin === margin
    && value.outcome.band === band
    && value.outcome.success === (margin >= 0)
    && value.outcome.cost_required === (margin < 0 && margin >= -4)
    && value.outcome.severe_failure === (margin <= -10);
}

function checkGap(result, index) {
  throw serverError(
    'TRACE_TURN_STEP_CHECK_PERSISTENCE_GAP',
    'A code-owned check lacks exact persisted policy identity.',
    { status: 409, details: {
      check_id: result?.check_id ?? null, result_index: index
    } }
  );
}

function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim() === value
    && value.length > 0;
}

function exact(value, fields) {
  return Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}
