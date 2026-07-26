import {
  hash, ref
} from '../../../runtime/first-playable/shared.js';
import { row } from './plan-shared.js';

export function appendBoundaryCheck({
  appends,
  check,
  intervalId,
  partyId,
  changeSet
}) {
  if (!check?.roll) return;
  const checkPolicyRef = ref(
    'check_policy',
    check.policy_id,
    1
  );
  const consequencePolicyRef = ref(
    'consequence_policy',
    'consequence.lower_dvina_segment_v1',
    1
  );
  const scopeKey = { traversal_interval_result_id: intervalId };
  const modifierSnapshot = {
    skill_id: check.roll.modifier_skill_id,
    modifier: check.roll.modifier
  };
  const checkEvidence = {
    scope_key: scopeKey,
    check_policy_ref: checkPolicyRef,
    roll_input_digest: check.roll.input_digest,
    roll_value: check.roll.value,
    modifier_snapshot: modifierSnapshot,
    target_value: check.roll.target,
    result_kind: check.roll.result_kind,
    consequence_policy_ref: consequencePolicyRef,
    result_change_set_id: changeSet
  };
  appends.push(row(
    'party_check_resolutions',
    `check:${intervalId}`,
    {
      check_resolution_id: `check:${intervalId}`,
      party_id: partyId,
      check_scope_kind: 'traversal_interval',
      check_scope_key: scopeKey,
      check_policy_ref: checkPolicyRef,
      deterministic_roll_input_digest:
        check.roll.input_digest,
      roll_value: check.roll.value,
      modifier_snapshot: modifierSnapshot,
      target_value: check.roll.target,
      result_kind: check.roll.result_kind,
      consequence_policy_ref: consequencePolicyRef,
      result_change_set_id: changeSet,
      canonical_digest: hash(JSON.stringify(checkEvidence))
    }
  ));
}
