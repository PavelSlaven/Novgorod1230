import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { assertPhase5FinalRows } from './lower-dvina-trace-phase-5-final-read-proof.js';
import { phase5ActivityOwnerBindingKind } from '../../runtime/lower-dvina-trace-phase-5-activity-records.js';
import {
  assertPhase5TreatmentKnowledge,
  assertPhase5TreatmentResources,
  exactSnapshotItem,
  phase5Actor,
  phase5BandageItem,
  phase5ParticipatingFisher
} from './lower-dvina-trace-phase-5-resource-read-proof.js';
export async function assertPhase5NormalizedRows(pool, payload, head) {
  const history = payload.phase5_history;
  if (!Array.isArray(history) || history.length === 0) return;
  const partyId = payload.party_id;
  const executionId = `activity:${partyId}:trace-phase5:treatment`;
  const [execution, attempts, participants, resources, decisions, checks,
    bodyHistory, npcTransitions, onisim, bandage, knowledge, visible,
    treatmentResources, releaseTransition] =
    await Promise.all([
      pool.query(
        `SELECT id,status,state_version::text,original_total_minutes::text,
                cumulative_elapsed_numerator::text,
                cumulative_elapsed_denominator::text,
                remaining_time_numerator::text,
                remaining_time_denominator::text,next_attempt_ordinal,
                progress,activity_snapshot,updated_change_set_id,
                terminal_change_set_id
           FROM party_runtime.party_timed_activity_executions
          WHERE id=$1`, [executionId]),
      pool.query(
        `SELECT attempt_ordinal,actual_time_numerator::text,
                actual_time_denominator::text,
                cumulative_time_before_numerator::text,
                cumulative_time_after_numerator::text,
                remaining_before_numerator::text,
                remaining_after_numerator::text,result_kind,result_code,
                occurred_at_turn,progress_before,progress_after,
                resource_reservations,resource_consumptions,
                body_effect_refs,participant_attendance,trace,
                started_at_whole_minutes::text,
                ended_at_whole_minutes::text
           FROM party_runtime.party_timed_activity_attempts
          WHERE activity_execution_id=$1
          ORDER BY attempt_ordinal`, [executionId]),
      pool.query(
        `SELECT participant_kind,participant_id,role_id,required,status
           FROM party_runtime.party_activity_participant_bindings
          WHERE activity_execution_id=$1
          ORDER BY role_id`, [executionId]),
      pool.query(
        `SELECT resource_kind,resource_id,binding_kind,
                quantity_numerator::text,quantity_denominator::text,
                consumption_policy_ref,state_version
           FROM party_runtime.party_activity_resource_bindings
          WHERE activity_execution_id=$1
          ORDER BY binding_kind,resource_id`, [executionId]),
      pool.query(
        `SELECT request_id,npc_id,state_version,options_digest,option_id,
                trace_digest,status
           FROM party_runtime.party_npc_decision_traces
          WHERE party_id=$1 AND option_id='accept_first_aid'`, [partyId]),
      pool.query(
        `SELECT check_resolution_id,check_scope_kind,check_scope_key,
                check_policy_ref,roll_value,modifier_snapshot,target_value,
                result_kind,consequence_policy_ref,canonical_digest
           FROM party_runtime.party_check_resolutions
          WHERE party_id=$1 AND check_resolution_id=$2`,
        [partyId, `check:${partyId}:trace-phase5:treatment`]),
      pool.query(
        `SELECT history_id,subject_kind,subject_id,effect_ref,
                change_set_id
           FROM party_runtime.party_body_temporal_history
          WHERE party_id=$1 AND history_id=$2`,
        [partyId, `body-history:${partyId}:trace-phase5:treatment`]),
      pool.query(
        `SELECT transition_id,npc_id,transition_kind,change_set_id,trace
           FROM party_runtime.party_npc_runtime_transitions
          WHERE party_id=$1 AND transition_id=$2`,
        [partyId, `npc-transition:${partyId}:trace-phase5:treatment`]),
      pool.query(
        `SELECT npc_id,machine_state,semantic_state
           FROM party_runtime.party_npcs
          WHERE party_id=$1 AND npc_id=$2`,
        [partyId, phase5Actor(payload, 'onisim_boatman').instance_id]),
      pool.query(
        `SELECT i.item_id,i.condition_state,i.state,
                p.holder_npc_id,p.holder_character_id,p.physical_position,
                o.ownership_id,o.owner_npc_id,o.owner_character_id,
                o.controller_npc_id,o.controller_character_id
           FROM party_runtime.party_items i
           JOIN party_runtime.party_item_placements p
             ON p.party_id=i.party_id AND p.item_id=i.item_id
           JOIN party_runtime.party_ownership o
             ON o.party_id=i.party_id AND o.item_id=i.item_id
          WHERE i.party_id=$1
            AND i.template_id='trace_ld_v1_item_bandage_cloth'`, [partyId]),
      pool.query(
        `SELECT fact_id,knowledge_state,evidence
         FROM party_runtime.party_character_knowledge
          WHERE party_id=$1 AND character_id=$2
            AND (fact_id='trace_ld_v1_treatment_stage_prepare_committed'
              OR fact_id='onisim_released_from_binding'
              OR fact_id='onisim_given_water'
              OR fact_id='trace_ld_v1_treatment_resources_reserved'
              OR fact_id='trace_ld_v1_treatment_stage_support_committed'
              OR fact_id='onisim_first_aid_final_stage_committed'
              OR fact_id='onisim_temporary_leg_splint_applied'
              OR fact_id='onisim_first_aid_completed'
              OR fact_id='onisim_stabilized_unable_to_walk'
              OR fact_id='onisim_first_aid_completed_without_stabilization')
          ORDER BY fact_id`, [partyId, payload.actor_id]),
      pool.query(
        `SELECT package_id,package_digest,visible_payload,
                presentation_status,committed_state_version::text,
                change_set_id
           FROM party_runtime.party_visible_packages WHERE package_id=$1`,
        [payload.last_turn?.visible_package?.package_id ?? ''])
      , pool.query(
        `SELECT i.item_id,i.template_id,i.profile_id,i.category_id,i.quantity,
                i.condition_state,i.legal_status,i.state,
                p.anchor_id,p.container_id,p.holder_npc_id,
                p.holder_character_id,p.physical_position,
                p.equipment_slot_category_id,
                o.ownership_id,o.owner_npc_id,o.owner_character_id,
                o.owner_external_ref,o.owner_party,o.controller_npc_id,
                o.controller_character_id,o.claim_state
           FROM party_runtime.party_items i
           JOIN party_runtime.party_item_placements p
             ON p.party_id=i.party_id AND p.item_id=i.item_id
           JOIN party_runtime.party_ownership o
             ON o.party_id=i.party_id AND o.item_id=i.item_id
          WHERE i.party_id=$1 AND i.template_id=ANY($2::text[])
          ORDER BY i.template_id`, [partyId, [
          'trace_ld_v1_item_fishing_net',
          'trace_ld_v1_item_carry_poles',
          'trace_ld_v1_item_eremey_drinking_water_vessel'
        ]]),
      pool.query(
        `SELECT transition_id,npc_id,transition_kind,change_set_id,trace
           FROM party_runtime.party_npc_runtime_transitions
          WHERE party_id=$1 AND transition_id=$2`, [partyId,
          `npc-transition:${partyId}:trace-phase5:release`])
    ]);
  const treatment = payload.phase5_treatment;
  const expectedExecution = treatment?.activity_execution;
  const executionRow = execution.rows[0];
  if (execution.rowCount !== 1 || !expectedExecution
      || executionRow.id !== expectedExecution.id
      || executionRow.status !== expectedExecution.status
      || executionRow.state_version !== String(expectedExecution.state_version)
      || executionRow.original_total_minutes !== '25'
      || executionRow.cumulative_elapsed_numerator
        !== String(expectedExecution.progress.current.numerator)
      || executionRow.cumulative_elapsed_denominator !== '1'
      || executionRow.remaining_time_numerator
        !== String(25 - Number(expectedExecution.progress.current.numerator))
      || executionRow.remaining_time_denominator !== '1'
      || Number(executionRow.next_attempt_ordinal)
        !== expectedExecution.next_attempt_ordinal
      || canonicalDigest(executionRow.progress)
        !== canonicalDigest(expectedExecution.progress)
      || canonicalDigest(executionRow.activity_snapshot)
        !== canonicalDigest(expectedExecution.activity_snapshot)
      || executionRow.updated_change_set_id
        !== history.at(-1).change_set_id
      || executionRow.terminal_change_set_id
        !== (expectedExecution.status === 'completed'
          ? history.at(-1).change_set_id : null)) fail();
  if (attempts.rows.length !== history.length) fail();
  for (const [index, entry] of history.entries()) {
    const actual = attempts.rows[index];
    const expected = entry.treatment.attempt;
    if (Number(actual.attempt_ordinal) !== expected.attempt_ordinal
        || actual.actual_time_numerator
          !== String(expected.actual_elapsed.numerator)
        || actual.actual_time_denominator
          !== String(expected.actual_elapsed.denominator)
        || actual.cumulative_time_before_numerator
          !== String(expected.progress_before.current.numerator)
        || actual.cumulative_time_after_numerator
          !== String(expected.progress_after.current.numerator)
        || actual.remaining_before_numerator
          !== String(25 - Number(expected.progress_before.current.numerator))
        || actual.remaining_after_numerator
          !== String(25 - Number(expected.progress_after.current.numerator))
        || actual.result_kind !== expected.outcome
        || actual.result_code !== expected.reason_code
        || Number(actual.occurred_at_turn) !== entry.turn_number
        || canonicalDigest(actual.progress_before)
          !== canonicalDigest(expected.progress_before)
        || canonicalDigest(actual.progress_after)
          !== canonicalDigest(expected.progress_after)
        || canonicalDigest(actual.resource_reservations)
          !== canonicalDigest(expected.resource_reservations)
        || canonicalDigest(actual.resource_consumptions)
          !== canonicalDigest(expected.resource_consumptions)
        || canonicalDigest(actual.body_effect_refs)
          !== canonicalDigest(expected.body_effect_refs)
        || canonicalDigest(actual.participant_attendance)
          !== canonicalDigest(expected.participant_attendance)
        || canonicalDigest(actual.trace?.encountered_boundary_candidates ?? [])
          !== canonicalDigest(
            entry.treatment.encountered_boundary_candidates ?? [])
        || actual.started_at_whole_minutes
          !== String(expected.started_at.whole_minutes)
        || actual.ended_at_whole_minutes
          !== String(expected.ended_at.whole_minutes)) fail();
  }

  const expectedParticipants = [
    ['npc', phase5Actor(payload, 'eremey_fisher').instance_id, 'eremey_fisher'],
    ['npc', phase5Actor(payload, 'onisim_boatman').instance_id, 'onisim_boatman'],
    ['npc', phase5ParticipatingFisher(payload).instance_id,
      phase5ParticipatingFisher(payload).participant_slot_ref],
    ['player_character', payload.actor_id, 'player_clerk']
  ].sort((left, right) => left[2].localeCompare(right[2]));
  if (canonicalDigest(participants.rows) !== canonicalDigest(
    expectedParticipants.map(([participant_kind, participant_id, role_id]) => ({
      participant_kind, participant_id, role_id, required: true,
      status: 'active'
    }))
  )) fail();

  const snapshotBandage = phase5BandageItem(payload);
  const expectedResources = [
    ['trace_ld_v1_item_bandage_cloth', 'consumable_input'],
    ['trace_ld_v1_item_eremey_drinking_water_vessel', 'single_use_support'],
    ['trace_ld_v1_item_fishing_net', 'reusable_support'],
    ['trace_ld_v1_item_carry_poles', 'reusable_support']
  ].map(([templateId, bindingKind]) => {
    const item = exactSnapshotItem(payload, templateId);
    const approved = payload.phase5_treatment.resource_bindings?.find(
      ({ resource_ref: ref }) => ref === templateId
    );
    return {
      resource_kind: 'item', resource_id: item.item_id,
      binding_kind: phase5ActivityOwnerBindingKind(bindingKind),
      quantity_numerator: '1',
      quantity_denominator: '1',
      consumption_policy_ref: approved,
      state_version: '1'
    };
  }).sort((left, right) => left.binding_kind.localeCompare(right.binding_kind)
    || left.resource_id.localeCompare(right.resource_id));
  if (canonicalDigest(resources.rows) !== canonicalDigest(expectedResources)) {
    fail();
  }

  const consent = history[0].treatment.consent;
  if (decisions.rowCount !== 1
      || decisions.rows[0].request_id !== consent.request.request_id
      || decisions.rows[0].npc_id
        !== phase5Actor(payload, 'onisim_boatman').instance_id
      || Number(decisions.rows[0].state_version)
        !== Number(consent.trace.state_version)
      || decisions.rows[0].options_digest !== consent.request.options_digest
      || decisions.rows[0].option_id !== 'accept_first_aid'
      || decisions.rows[0].trace_digest !== consent.trace.trace_digest
      || decisions.rows[0].status !== 'committed') fail();

  const final = history.find(({ treatment: value }) => value.final)?.treatment;
  assertPhase5TreatmentResources({ payload, treatmentResources, releaseTransition,
    npcTransitions, history, onisim });
  assertPhase5TreatmentKnowledge({ knowledge, history, final,
    executionId });
  if (!final) {
    if (checks.rowCount !== 0 || bodyHistory.rowCount !== 0
        || npcTransitions.rowCount !== 0
        || bandage.rowCount !== 1
        || bandage.rows[0].condition_state !== 'clean_serviceable'
        || bandage.rows[0].holder_npc_id
          !== phase5Actor(payload, 'eremey_fisher').instance_id
        || bandage.rows[0].controller_npc_id
          !== phase5Actor(payload, 'eremey_fisher').instance_id) fail();
  } else {
    assertPhase5FinalRows({ partyId, payload, final, checks, bodyHistory,
      npcTransitions, onisim, bandage, snapshotBandage });
  }

  const envelope = visible.rows[0];
  if (visible.rowCount !== 1 || envelope.presentation_status !== 'pending'
      || envelope.committed_state_version
        !== String(payload.party_state.state_version)
      || envelope.change_set_id !== payload.last_turn.change_set_id
      || envelope.package_digest
        !== computeSpatialV3CanonicalDigest(envelope.visible_payload)
      || envelope.package_digest
        !== payload.last_turn.visible_package.package_digest
      || !['committed_presentation_pending', 'ready']
        .includes(head.screen?.screen_status)
      || head.screen?.current_projection_anchor?.package_id
        !== envelope.package_id) fail();
}

function fail() { throw phase2IntegrityError(); }
