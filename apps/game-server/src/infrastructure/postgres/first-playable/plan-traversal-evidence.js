import {
  hash
} from '../../../runtime/first-playable/shared.js';
import { row } from './plan-shared.js';

export function endpoint(partyId, slot) {
  return {
    endpoint_kind: 'scene_position',
    endpoint_id: `position:${partyId}:${slot}`
  };
}

export function event(
  executionId,
  ordinal,
  kind,
  fromStatus,
  toStatus,
  location,
  changeSet,
  idemId,
  turnNumber,
  intervalId = null
) {
  return row(
    'party_route_plan_execution_events',
    `${executionId}:${ordinal}`,
    {
      execution_id: executionId,
      event_ordinal: ordinal,
      event_kind: kind,
      from_status: fromStatus,
      to_status: toStatus,
      step_ordinal: 0,
      location_snapshot: location,
      causal_result_ref: intervalId == null
        ? null
        : {
            entity_kind: 'party_traversal_interval_result',
            entity_id: intervalId
          },
      change_set_id: changeSet,
      idempotency_record_id: idemId,
      occurred_at_turn: turnNumber
    }
  );
}

export function appendCheck(set, {
  partyId,
  intervalId,
  traversal,
  changeSet
}) {
  const scope = { traversal_interval_result_id: intervalId };
  const modifier = {
    skill_id: traversal.roll.modifier_skill_id,
    modifier: traversal.roll.modifier
  };
  const evidence = {
    scope_key: scope,
    check_policy_ref: traversal.risk_profile_ref,
    roll_input_digest: traversal.roll.input_digest,
    roll_value: traversal.roll.value,
    modifier_snapshot: modifier,
    target_value: traversal.roll.target,
    result_kind: traversal.roll.result_kind,
    consequence_policy_ref: traversal.risk_profile_ref,
    result_change_set_id: changeSet
  };
  set.appends.push(row(
    'party_check_resolutions',
    `check:${intervalId}`,
    {
      check_resolution_id: `check:${intervalId}`,
      party_id: partyId,
      check_scope_kind: 'traversal_interval',
      check_scope_key: scope,
      check_policy_ref: traversal.risk_profile_ref,
      deterministic_roll_input_digest: traversal.roll.input_digest,
      roll_value: traversal.roll.value,
      modifier_snapshot: modifier,
      target_value: traversal.roll.target,
      result_kind: traversal.roll.result_kind,
      consequence_policy_ref: traversal.risk_profile_ref,
      result_change_set_id: changeSet,
      canonical_digest: hash(JSON.stringify(evidence))
    }
  ));
}
