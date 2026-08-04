import { deepFreeze, sha256 } from '@rus/kernel';
import { turnFailure } from './errors.js';

export function buildTurnStepCheckRequest({ checkId, difficulty, plan,
  context }) {
  for (const key of ['check_policy_ref', 'consequence_policy_ref']) {
    requirePolicyRef(context?.[key], key);
  }
  if (!text(context?.policy_profile_ref)) {
    metadataMissing('policy_profile_ref');
  }
  requireProfilePin(context?.policy_profile_pin);
  return deepFreeze({
    check_id: checkId,
    difficulty,
    policy_profile_ref: context.policy_profile_ref,
    policy_profile_pin: structuredClone(context.policy_profile_pin),
    check_policy_ref: structuredClone(context.check_policy_ref),
    consequence_policy_ref:
      structuredClone(context.consequence_policy_ref),
    check_plan_digest: sha256(plan.check),
    outcome_map_digest: sha256(plan.check.outcomes),
    step_plan_digest: sha256(plan)
  });
}

function requirePolicyRef(ref, field) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)
      || Object.keys(ref).sort().join(',')
        !== 'authoring_version,entity_id,entity_kind'
      || !text(ref.entity_kind) || !text(ref.entity_id)
      || !text(ref.authoring_version)) {
    metadataMissing(field);
  }
}

function requireProfilePin(pin) {
  if (!pin || typeof pin !== 'object' || Array.isArray(pin)
      || Object.keys(pin).sort().join(',') !== 'artifact_id,digest,revision'
      || !text(pin.artifact_id)
      || !Number.isSafeInteger(pin.revision) || pin.revision < 1
      || typeof pin.digest !== 'string'
      || !/^[a-f0-9]{64}$/u.test(pin.digest)) {
    metadataMissing('policy_profile_pin');
  }
}

function metadataMissing(field) {
  throw turnFailure(
    'TURN_STEP_CHECK_POLICY_METADATA_MISSING',
    'Generic check owner must return exact approved policy references and pin.',
    { field }
  );
}

function text(value) {
  return typeof value === 'string' && value.trim() === value
    && value.length > 0;
}
