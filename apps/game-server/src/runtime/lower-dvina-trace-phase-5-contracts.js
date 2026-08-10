import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';
import { resolveTracePhase5ParticipatingFisher,
  TRACE_PHASE_5_RESOURCE_IDS } from './lower-dvina-trace-phase-5-resources.js';

export const TRACE_PHASE_5_IDS = Object.freeze({
  option: 'attempt_risky_first_aid_onisim',
  activity: 'trace_ld_v1_activity_first_aid_onisim',
  check: 'trace_ld_v1_check_risky_first_aid',
  bodyEffect: 'trace_ld_v1_body_first_aid_onisim_25m',
  bandage: 'trace_ld_v1_item_bandage_cloth',
  ...TRACE_PHASE_5_RESOURCE_IDS,
  transition: 'trace_ld_v1_property_bandage_cloth_applied_to_onisim',
  shed: 'trace_ld_v1_loc_old_drying_shed'
});

export function resolveTracePhase5Contracts({ state, bundle }) {
  if (![11, 12, 13, 14, 15, 16].includes(bundle.definition_revision)
      || ![11, 12, 13, 14, 15, 16].includes(bundle.definition?.revision)) {
    gap('TRACE_PHASE_5_REVISION_MISMATCH');
  }
  const ids = TRACE_PHASE_5_IDS;
  const profiles = bundle.activity_check_consequence_profiles;
  const activity = exact(profiles.activity_profiles, 'profile_id', ids.activity);
  const check = exact(profiles.check_profiles, 'check_id', ids.check);
  const success = exact(profiles.consequence_profiles, 'consequence_id',
    check.outcome_refs.success);
  const failure = exact(profiles.consequence_profiles, 'consequence_id',
    check.outcome_refs.failure);
  const bodyEffect = exact(bundle.body_environment_profiles.effect_profiles,
    'effect_profile_id', ids.bodyEffect);
  const injury = exact(bundle.body_environment_profiles.condition_profiles,
    'condition_profile_id', 'trace_ld_v1_condition_onisim_injury');
  const itemTemplate = exact(bundle.item_container_set.item_templates,
    'item_template_id', ids.bandage);
  const inventoryProfile = exact(bundle.item_container_set.item_inventory_profiles,
    'inventory_profile_id',
    'trace_ld_v1_inventory_profile_bandage_cloth');
  const transition = exact(
    bundle.npc_decision_schedule_policies.property_transition_profiles,
    'transition_profile_id', ids.transition);
  const consentPolicy = exact(
    bundle.npc_decision_schedule_policies.decision_policies,
    'policy_id', 'trace_ld_v1_npc_onisim_decisions');
  const consentExecution = exact(
    bundle.npc_decision_schedule_policies.decision_execution_bindings,
    'execution_binding_id',
    'trace_ld_v1_decision_execution_onisim_accept_first_aid');
  const actors = Object.fromEntries(['eremey_fisher', 'onisim_boatman',
    'ratsha_storehouse_helper', 'background_fisher_1']
    .map((ref) => [ref, actor(state, ref)]));
  actors.participating_fisher = resolveTracePhase5ParticipatingFisher(state);
  const transitionIds = {
    ropeRelease: 'trace_ld_v1_property_ratsha_binding_rope_released_to_eremey',
    waterUse: 'trace_ld_v1_property_eremey_water_vessel_used_for_onisim',
    netReserve: 'trace_ld_v1_property_fishing_net_reserved_for_onisim_treatment',
    polesReserve: 'trace_ld_v1_property_carry_poles_reserved_for_onisim_treatment',
    netApply: 'trace_ld_v1_property_fishing_net_applied_to_onisim_splint',
    polesApply: 'trace_ld_v1_property_carry_poles_applied_to_onisim_splint'
  };
  const resourceTransitions = Object.fromEntries(Object.entries(transitionIds)
    .map(([key, id]) => [key, exact(
      bundle.npc_decision_schedule_policies.property_transition_profiles,
      'transition_profile_id', id
    )]));
  const itemTemplates = Object.fromEntries(Object.entries({
    net: ids.net, poles: ids.poles, water: ids.water
  }).map(([key, id]) => [key, exact(bundle.item_container_set.item_templates,
    'item_template_id', id)]));
  const resourceInventoryProfiles = Object.fromEntries(Object.entries({
    net: 'trace_ld_v1_inventory_profile_fishing_net_group_load',
    poles: 'trace_ld_v1_inventory_profile_carry_poles_group_load'
  }).map(([key, id]) => [key, exact(
    bundle.item_container_set.item_inventory_profiles,
    'inventory_profile_id',
    id
  )]));
  if ([12, 13, 14, 15, 16].includes(bundle.definition_revision)) {
    resourceInventoryProfiles.water = exact(
      bundle.item_container_set.item_inventory_profiles,
      'inventory_profile_id',
      'trace_ld_v1_inventory_profile_eremey_drinking_water_vessel'
    );
  }
  const ropeInventoryProfile = [12, 13, 14, 15, 16].includes(bundle.definition_revision)
    ? exact(bundle.item_container_set.item_inventory_profiles,
      'inventory_profile_id',
      'trace_ld_v1_inventory_profile_ratsha_binding_rope')
    : null;
  const resourceArrivalBinding = bundle.materialization_bindings
    ?.phase_5_initial_state_binding?.phase_5_resource_arrival_binding;
  const stages = activity.treatment_stages;
  const danger = activity.danger_predicate;
  if (activity.duration_minutes !== 25
    || canonicalDigest(stages?.map(({ stage_id: id, ordinal,
      duration_minutes: duration }) => ({ id, ordinal, duration })))
      !== canonicalDigest([
        { id: 'prepare_cloth_and_expose_injury', ordinal: 1, duration: 5 },
        { id: 'support_and_position_injured_leg', ordinal: 2, duration: 10 },
        { id: 'apply_bandage_and_reassess', ordinal: 3, duration: 10 }
      ])
    || canonicalDigest(activity.participant_slots?.required)
      !== canonicalDigest(['player_clerk', 'onisim_boatman', 'eremey_fisher',
        'trace_ld_v1_audience_slot_participating_fisher'])
    || check.attribute !== 'reason' || check.skill !== 'healing'
    || check.dc !== 12 || check.modifiers.state !== -1
    || check.modifiers.item_or_evidence !== 1
    || check.modifiers.circumstance !== 0
    || bodyEffect.selection_policy !== 'fixed_by_committed_check_outcome'
    || bodyEffect.rng_consumption !== 'forbidden'
    || canonicalDigest(bodyEffect.outcome_effects?.success?.exact_deltas)
      !== canonicalDigest({ health: 0, satiety: 0, energy: 0 })
    || bodyEffect.outcome_effects.success.condition_outcomes?.[0]?.to
      !== 'stabilized_unable_to_walk'
    || bodyEffect.outcome_effects.failure.condition_outcomes?.[0]?.to
      !== 'injured_unable_to_walk'
    || !injury.permitted_transitions.includes('stabilized_unable_to_walk')
    || itemTemplate.source_resource_only !== true
    || inventoryProfile.mass_grams !== 100
    || inventoryProfile.carry_form !== 'compact'
    || inventoryProfile.external_hand_cost !== 0
    || transition.subject_ref !== ids.bandage
    || transition.requires?.admission_fact
      !== 'onisim_first_aid_final_stage_committed'
    || transition.writes?.holder_ref !== 'onisim_boatman'
    || transition.writes.controller_ref !== 'onisim_boatman'
    || transition.writes.physical_position !== 'worn'
    || transition.writes.accessibility
      !== 'applied_not_available_as_resource'
    || transition.writes.condition_state !== 'applied_bandage'
    || transition.writes.use_state !== 'bound_to_injured_leg'
    || transition.owner_change !== 'forbidden'
    || !['net', 'poles'].every((key) => {
      const profile = resourceInventoryProfiles[key];
      return profile.mass_grams === 2500
        && profile.carry_form === 'long'
        && profile.external_hand_cost === 1
        && profile.status === 'approved';
    })
    || ([12, 13, 14, 15, 16].includes(bundle.definition_revision)
      && (resourceInventoryProfiles.water.item_template_ref !== ids.water
        || resourceInventoryProfiles.water.mass_grams !== 100
        || resourceInventoryProfiles.water.carry_form !== 'compact'
        || resourceInventoryProfiles.water.external_hand_cost !== 0
        || resourceInventoryProfiles.water.status !== 'approved'))
    || ([12, 13, 14, 15, 16].includes(bundle.definition_revision)
      && (ropeInventoryProfile.item_template_ref !== ids.rope
        || ropeInventoryProfile.mass_grams !== 1200
        || ropeInventoryProfile.carry_form !== 'long'
        || ropeInventoryProfile.external_hand_cost !== 1
        || ropeInventoryProfile.status !== 'approved'))
    || !consentPolicy.option_set?.some(
      ({ option_id: optionId }) => optionId === 'accept_first_aid')
    || consentExecution.policy_id !== consentPolicy.policy_id
    || consentExecution.option_id !== 'accept_first_aid'
    || consentExecution.time_contract?.clock_write !== 'forbidden'
    || consentExecution.activity_profile_refs?.length !== 1
    || consentExecution.activity_profile_refs[0] !== ids.activity
    || danger?.predicate_id
      !== 'trace_ld_v1_treatment_safe_after_ratsha_surrender') {
    gap('TRACE_PHASE_5_APPROVED_CHAIN_INVALID');
  }
  return Object.freeze({ ids, activity, check, success, failure, bodyEffect,
    injury, itemTemplate, inventoryProfile, transition, consentPolicy,
    consentExecution, actors, resourceTransitions, itemTemplates,
    resourceInventoryProfiles, ropeInventoryProfile, resourceArrivalBinding,
    anchors: { shed: state.prepared_scenes?.find(
      ({ location_profile_ref: ref }) => ref === ids.shed
    )?.anchor?.instance_id },
    activityPins: [
      ['activity_profile', activity, 'profile_id'],
      ['action_contract', check, 'check_id'],
      ['action_contract', success, 'consequence_id'],
      ['action_contract', failure, 'consequence_id'],
      ['body_effect', bodyEffect, 'effect_profile_id'],
      ['action_contract', transition, 'transition_profile_id'],
      ['action_contract', consentPolicy, 'policy_id'],
      ['decision_command', consentExecution, 'execution_binding_id'],
      ...Object.values(resourceTransitions).map((record) =>
        ['action_contract', record, 'transition_profile_id'])
    ].map(([entityKind, record, idField]) => ({
      entity_kind: entityKind,
      id: record[idField],
      version: record.version,
      digest: canonicalDigest(record)
    })) });
}

function actor(state, ref) {
  const matches = (state.npcs ?? []).filter(
    (entry) => entry.participant_slot_ref === ref
  );
  if (matches.length !== 1 || !matches[0].instance_id) {
    gap('TRACE_PHASE_5_PARTICIPANT_MISSING');
  }
  return structuredClone(matches[0]);
}

function exact(records, key, id) {
  const matches = (records ?? []).filter((record) => record[key] === id);
  if (matches.length !== 1) gap('TRACE_PHASE_5_RECORD_GAP');
  return matches[0];
}

function gap(code) {
  throw serverError(code, 'The exact party-pinned Phase 5 chain is incomplete.',
    { status: 409 });
}
