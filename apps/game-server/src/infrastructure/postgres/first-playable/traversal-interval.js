import { hash, json } from '../../../runtime/first-playable/shared.js';

export async function persistLocalTraversalInterval(tx, context) {
  const {
    state, traversal, partyId, intervalId, executionId, changeSet,
    turnNumber, idemId
  } = context;
  const actualProgress = traversal.success ? 1_000_000 : 0;
  const actualElapsed = traversal.elapsed_minutes;
  const resultKind = traversal.success
    ? 'segment_completed'
    : 'blocked_before_progress';
  const dynamicSnapshot = {
    schema: 'local_traversal_dynamic_snapshot.v1',
    risk_profile_ref: traversal.risk_profile_ref,
    roll: traversal.roll,
    exact_dependency_pins: state.exact_pins
  };
  const traceDigest = hash(json({
    interval_id: intervalId,
    result_kind: resultKind,
    actual_progress: actualProgress,
    actual_elapsed: actualElapsed,
    dynamic_snapshot: dynamicSnapshot
  }));
  await tx.query(
    `INSERT INTO party_runtime.party_traversal_interval_results
     (id,route_plan_execution_id,plan_step_ordinal,interval_ordinal,
      progress_before_ppm,planned_progress_after_ppm,
      actual_progress_after_ppm,planned_time_numerator,
      planned_time_denominator,actual_time_numerator,
      actual_time_denominator,cumulative_time_before_numerator,
      cumulative_time_before_denominator,cumulative_time_after_numerator,
      cumulative_time_after_denominator,crossed_whole_minute_boundaries,
      clock_commit_mode,dynamic_snapshot,result_kind,result_code,
      hazard_resolution,outcome_composition_policy_version,
      outcome_composition_trace_digest,result_change_set_id,
      idempotency_record_id,occurred_at_turn)
     VALUES ($1,$2,0,0,0,1000000,$3,0,1,$4,1,0,1,$4,1,$4,
      'direct_party_clock',$5::jsonb,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)`,
    [
      intervalId,
      executionId,
      actualProgress,
      actualElapsed,
      json(dynamicSnapshot),
      resultKind,
      traversal.success ? 'local_passage_completed' : 'landing_edge_slip',
      traversal.roll == null ? null : json(traversal.roll),
      traversal.risk_profile_ref?.entity_id
        ?? 'risk.local_cross_link@1',
      traceDigest,
      changeSet,
      idemId,
      turnNumber
    ]
  );
  if (traversal.roll) {
    const scopeKey = {
      traversal_interval_result_id: intervalId
    };
    const modifierSnapshot = {
      skill_id: traversal.roll.modifier_skill_id,
      modifier: traversal.roll.modifier
    };
    const checkRecord = {
      scope_key: scopeKey,
      check_policy_ref: traversal.risk_profile_ref,
      roll_input_digest: traversal.roll.input_digest,
      roll_value: traversal.roll.value,
      modifier_snapshot: modifierSnapshot,
      target_value: traversal.roll.target,
      result_kind: traversal.roll.result_kind,
      consequence_policy_ref: traversal.risk_profile_ref,
      result_change_set_id: changeSet
    };
    await tx.query(
      `INSERT INTO party_runtime.party_check_resolutions
       (check_resolution_id,party_id,check_scope_kind,check_scope_key,
        check_policy_ref,deterministic_roll_input_digest,roll_value,
        modifier_snapshot,target_value,result_kind,consequence_policy_ref,
        result_change_set_id,canonical_digest)
       VALUES ($1,$2,'traversal_interval',$3::jsonb,$4::jsonb,$5,$6,
        $7::jsonb,$8,$9,$10::jsonb,$11,$12)`,
      [
        `check:${intervalId}`,
        partyId,
        json(scopeKey),
        json(traversal.risk_profile_ref),
        traversal.roll.input_digest,
        traversal.roll.value,
        json(modifierSnapshot),
        traversal.roll.target,
        traversal.roll.result_kind,
        json(traversal.risk_profile_ref),
        changeSet,
        hash(json(checkRecord))
      ]
    );
  }

  return { ...context, actualProgress, actualElapsed };
}
