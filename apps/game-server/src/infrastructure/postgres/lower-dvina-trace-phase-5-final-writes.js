import { canonicalDigest } from '@rus/materialization';
import { planApprovedActorItemTransition } from '@rus/items-property';
import { buildCommittedInventoryInput } from
  '../../runtime/lower-dvina-trace-committed-inventory.js';
import { row } from './first-playable/plan-shared.js';

export function appendPhase5FinalTreatment({ inserts, updates, appends,
  partyId, state, next, factual, contracts, changeSetId, idemId, execution }) {
  const treatment = factual.consequence.treatment;
  const check = treatment.check_result;
  const checkId = `check:${partyId}:trace-phase5:treatment`;
  appends.push(row('party_check_resolutions', checkId, {
    check_resolution_id: checkId,
    party_id: partyId,
    check_scope_kind: 'timed_activity_attempt',
    check_scope_key: {
      activity_execution_id: execution.id,
      terminal_attempt_ordinal: treatment.attempt.attempt_ordinal
    },
    check_policy_ref: {
      entity_kind: 'check_policy', entity_id: contracts.ids.check,
      authoring_version: '1'
    },
    deterministic_roll_input_digest: canonicalDigest(check.audit),
    roll_value: check.roll,
    modifier_snapshot: check.modifiers,
    target_value: check.difficulty,
    result_kind: check.outcome.success ? 'success' : 'failure',
    consequence_policy_ref: {
      entity_kind: 'consequence_policy',
      entity_id: treatment.consequence_ref,
      authoring_version: '1'
    },
    result_change_set_id: changeSetId,
    canonical_digest: canonicalDigest(check)
  }));
  appends.push(row('party_body_temporal_history',
    `body-history:${partyId}:trace-phase5:treatment`, {
      history_id: `body-history:${partyId}:trace-phase5:treatment`,
      party_id: partyId,
      subject_kind: 'npc',
      subject_id: contracts.actors.onisim_boatman.instance_id,
      effect_ref: factual.body_update.proposal,
      change_set_id: changeSetId,
      idempotency_record_id: idemId,
      occurred_at_whole_minutes: next.clock.whole_minutes,
      occurred_at_subminute_numerator: next.clock.subminute_numerator,
      occurred_at_subminute_denominator: next.clock.subminute_denominator
    }));
  const onisim = next.npcs.find(
    ({ participant_slot_ref: ref }) => ref === 'onisim_boatman'
  );
  appends.push(row('party_npc_runtime_transitions',
    `npc-transition:${partyId}:trace-phase5:treatment`, {
      transition_id: `npc-transition:${partyId}:trace-phase5:treatment`,
      party_id: partyId,
      npc_id: onisim.instance_id,
      transition_kind: treatment.outcome_fact,
      event_id: null,
      change_set_id: changeSetId,
      idempotency_record_id: idemId,
      occurred_at_whole_minutes: next.clock.whole_minutes,
      occurred_at_subminute_numerator: next.clock.subminute_numerator,
      occurred_at_subminute_denominator: next.clock.subminute_denominator,
      trace: {
        body_effect_ref: contracts.ids.bodyEffect,
        check_resolution_id: checkId,
        ...(releaseCommittedInFinalChange(state, treatment) ? {
          stage_transition_bundle: {
            transition_kind: 'onisim_released_from_binding',
            transition_profile_id:
              contracts.resourceTransitions.ropeRelease.transition_profile_id,
            water_transition_profile_id:
              contracts.resourceTransitions.waterUse.transition_profile_id
          }
        } : {})
      }
    }));
  applyBandageTransition({ updates, state, next, partyId, contracts,
    changeSetId });
  for (const factId of [treatment.common_completion_fact,
    treatment.outcome_fact]) {
    inserts.push(row('party_character_knowledge',
      `${state.actor_id}:${factId}`, {
        party_id: partyId,
        character_id: state.actor_id,
        fact_id: factId,
        knowledge_state: 'known_from_committed_source',
        evidence: [execution.id]
      }));
  }
}

function releaseCommittedInFinalChange(state, treatment) {
  const prior = new Set(
    state.phase5_treatment?.completed_stage_ids ?? []
  );
  return treatment.completed_stage_ids
    .includes('prepare_cloth_and_expose_injury')
    && !prior.has('prepare_cloth_and_expose_injury');
}

function applyBandageTransition({ updates, state, next, partyId, contracts,
  changeSetId }) {
  const item = state.items.find(
    ({ template_id: id }) => id === contracts.ids.bandage
  );
  const input = buildCommittedInventoryInput({
    ...state,
    items: [item],
    containers: [],
    container_placements: [],
    container_profiles: []
  });
  const plan = planApprovedActorItemTransition({
    party_id: partyId,
    expected_state_version: state.party_state.state_version,
    state_version: state.party_state.state_version,
    approved_transition: contracts.transition,
    approved_facts: ['onisim_first_aid_final_stage_committed'],
    item_id: item.item_id,
    resolved_actor_refs: {
      eremey_fisher: contracts.actors.eremey_fisher.instance_id,
      onisim_boatman: contracts.actors.onisim_boatman.instance_id
    },
    items: [item],
    item_profiles: input.item_profiles,
    item_placements: [item].map((entry) => ({
      party_id: partyId,
      item_id: entry.item_id,
      holder_character_id: entry.placement.holder_character_id ?? null,
      holder_npc_id: entry.placement.holder_npc_id ?? null,
      physical_position: entry.placement.physical_position
    })),
    ownership: [item].map((entry) => ({
      ...structuredClone(entry.ownership), item_id: entry.item_id
    })),
    source: {
      actor_kind: 'npc',
      actor_id: contracts.actors.eremey_fisher.instance_id,
      controller_actor_id: contracts.actors.eremey_fisher.instance_id,
      physical_position: contracts.transition.requires.physical_position,
      accessibility: contracts.transition.requires.accessibility,
      condition_state: contracts.transition.requires.condition_state
    },
    destination: {
      actor_kind: 'npc',
      actor_id: contracts.actors.onisim_boatman.instance_id,
      controller_actor_id: contracts.actors.onisim_boatman.instance_id,
      physical_position: contracts.transition.writes.physical_position,
      accessibility: contracts.transition.writes.accessibility,
      condition_state: contracts.transition.writes.condition_state,
      use_state: contracts.transition.writes.use_state
    },
    actor_strengths: {}
  });
  if (!plan.pass) throw new Error('TRACE_PHASE_5_BANDAGE_TRANSITION_REJECTED');
  const changed = next.items.find(({ item_id: id }) => id === item.item_id);
  const history = changed.state?.approved_transition_history?.at(-1);
  const { change_set_id: historyChangeSet, ...historyProposal } = history ?? {};
  if (historyChangeSet !== changeSetId
      || canonicalDigest(historyProposal)
        !== canonicalDigest(plan.proposal.property_history)
      || canonicalDigest(plan.proposal.item_state)
        !== canonicalDigest({
          item_id: item.item_id,
          condition_state: changed.condition_state,
          use_state: changed.state?.use_state ?? null
        })) {
    throw new Error('TRACE_PHASE_5_BANDAGE_TRANSITION_REJECTED');
  }
  updates.push(row('party_item_placements', item.item_id, {
    party_id: partyId,
    item_id: item.item_id,
    holder_npc_id: contracts.actors.onisim_boatman.instance_id,
    holder_character_id: null,
    physical_position: contracts.transition.writes.physical_position
  }));
  updates.push(row('party_ownership', item.ownership.ownership_id, {
    ...plan.proposal.ownership.next,
    party_id: partyId,
    ownership_id: item.ownership.ownership_id,
    item_id: item.item_id
  }));
  updates.push(row('party_items', item.item_id, {
    party_id: partyId,
    item_id: item.item_id,
    condition_state: changed.condition_state,
    state: changed.state
  }));
}
