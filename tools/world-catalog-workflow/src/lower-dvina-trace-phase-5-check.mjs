import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveInventoryProfile } from '@rus/items-property';
import { loadCommonCatalogLookupRecords } from '@rus/runtime-catalog/common-lookups';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const PATHS = Object.freeze({
  manifest: `${ROOT}/phase-5-content/manifest.json`,
  definition: `${ROOT}/phase-5-content/definition.json`,
  activities: `${ROOT}/phase-5-content/activity-check-consequence-profiles.json`,
  body: `${ROOT}/phase-5-content/body-environment-profiles.json`,
  npc: `${ROOT}/phase-5-content/npc-decision-schedule-policies.json`,
  items: `${ROOT}/phase-5-content/item-container-set.json`,
  previousManifest: `${ROOT}/phase-4-content/manifest.json`,
  previousDefinition: `${ROOT}/phase-4-content/definition.json`,
  phase1a: `${ROOT}/phase-1a-v7/manifest.json`,
  phase1aBindings: `${ROOT}/phase-1a-v7/materialization-bindings.json`,
  phase1b: `${ROOT}/phase-1b-v6/manifest.json`,
  publication: `${ROOT}/phase-1b-v6/publication-binding.json`
});

export async function loadLowerDvinaTracePhase5Content({ rootDir = process.cwd() } = {}) {
  const entries = await Promise.all(Object.entries(PATHS).map(async ([key, path]) => {
    const raw = await readFile(resolve(rootDir, path));
    return [key, JSON.parse(raw), sha256(raw)];
  }));
  const bundle = { paths: structuredClone(PATHS), raw_digests: {} };
  for (const [key, value, digest] of entries) {
    bundle[key] = value;
    bundle.raw_digests[key] = digest;
  }
  const lookupRecords = await loadCommonCatalogLookupRecords({ rootDir });
  bundle.inventoryArchetypes = lookupRecords.inventory_archetypes;
  return bundle;
}

export function validateLowerDvinaTracePhase5Content(bundle) {
  validateLineageAndManifests(bundle);
  validateTreatmentActivity(bundle);
  validateTreatmentCheckAndConsequences(bundle);
  validateBodyEffects(bundle);
  validateConsentAndBandage(bundle);
  validateCarrierResources(bundle);
  validateScope(bundle);
  return Object.freeze({ pass: true, scenario_definition_revision: 11, phase_1a_revision: 7, phase_1b_revision: 6 });
}

function validateLineageAndManifests(b) {
  const m = b.manifest;
  const refs = m?.content_refs;
  if (m?.schema !== 'rus.lower_dvina_trace_phase_5_content_manifest.v1'
    || m.package_id !== 'lower_dvina_trace_phase_5_content_v1' || m.revision !== 1
    || m.scenario_definition_revision !== 11 || m.status !== 'approved'
    || m.publication_status !== 'internal_only'
    || ['fallback_policy', 'normalization_policy', 'alias_policy'].some((key) => m[key] !== 'forbidden')
    || !exactRef(m.superseded_definition_ref, PATHS.previousDefinition, 'lower_dvina_trace_v1', 10,
      'rus.trace_scenario_definition.v1', b.raw_digests.previousDefinition)
    || !exactDefinitionSupersedes(b.definition?.supersedes_definition_ref, PATHS.previousDefinition,
      'lower_dvina_trace_v1', 10, b.raw_digests.previousDefinition)
    || !exactContentRef(refs?.definition, 'definition.json', 'lower_dvina_trace_v1', 11,
      'rus.trace_scenario_definition.v1', b.raw_digests.definition)
    || !exactContentRef(refs?.item_container_set, 'item-container-set.json', 'trace_ld_v1_item_container_set', 3,
      'rus.trace_item_container_set.v1', b.raw_digests.items)
    || !exactContentRef(refs?.activity_check_consequence_profiles, 'activity-check-consequence-profiles.json',
      'trace_ld_v1_activity_check_consequence_profiles', 3, 'rus.trace_activity_check_consequence_profiles.v1', b.raw_digests.activities)
    || !exactContentRef(refs?.body_environment_profiles, 'body-environment-profiles.json',
      'trace_ld_v1_body_environment_profiles', 5, 'rus.trace_body_environment_profiles.v2', b.raw_digests.body)
    || !exactContentRef(refs?.npc_decision_schedule_policies, 'npc-decision-schedule-policies.json',
      'trace_ld_v1_npc_decision_schedule_policies', 4, 'rus.trace_npc_decision_schedule_policies.v1', b.raw_digests.npc)
    || !sameManifestFiles(m.files, { 'activity-check-consequence-profiles.json': b.raw_digests.activities,
      'body-environment-profiles.json': b.raw_digests.body, 'definition.json': b.raw_digests.definition,
      'item-container-set.json': b.raw_digests.items, 'npc-decision-schedule-policies.json': b.raw_digests.npc })
    || m.content_digest !== contentDigest(m.files)
    || b.definition?.revision !== 11 || b.definition.scenario_id !== 'lower_dvina_trace_v1'
    || b.definition.required_unresolved_refs?.length !== 0
    || b.definition.immutable_content_refs?.item_container_set?.revision !== 3
    || b.definition.immutable_content_refs.item_container_set.digest !== b.raw_digests.items
    || b.definition.resolved_policy_refs?.activity_check_consequence_profiles?.digest !== b.raw_digests.activities
    || b.definition.resolved_policy_refs?.body_environment_profiles?.digest !== b.raw_digests.body
    || b.definition.resolved_policy_refs?.npc_decision_schedule_policies?.digest !== b.raw_digests.npc) {
    fail('TRACE_PHASE_5_MANIFEST_OR_LINEAGE_INVALID', 'Phase 5 must exact-supersede revision 10 and pin every manifest digest.');
  }
  if (!exactPackageRef(b.phase1a?.base_definition_ref, PATHS.manifest, m.package_id, 1, m.schema, b.raw_digests.manifest)
    || b.phase1a.scenario_definition_revision !== 11 || b.phase1a.revision !== 7
    || !exactRef(b.publication?.phase_1a_manifest_ref, PATHS.phase1a, b.phase1a.package_id, 7, b.phase1a.schema, b.raw_digests.phase1a)
    || !exactRef(b.publication?.scenario_definition_ref, PATHS.definition, 'lower_dvina_trace_v1', 11,
      'rus.trace_scenario_definition.v1', b.raw_digests.definition)
    || b.phase1b?.revision !== 6
    || !exactRef(b.phase1b?.content_refs?.publication_binding, PATHS.publication,
      'lower_dvina_trace_phase_1b_publication_v6', 6, 'rus.lower_dvina_trace_publication_binding.v1', b.raw_digests.publication)) {
    fail('TRACE_PHASE_5_PUBLICATION_CHAIN_INVALID', 'Phase 1A/1B must pin the Phase 5 package and definition exactly.');
  }
}

function validateTreatmentActivity(b) {
  const activity = one(b.activities?.activity_profiles, 'profile_id', 'trace_ld_v1_activity_first_aid_onisim');
  const predicate = activity?.danger_predicate;
  const stages = activity?.treatment_stages;
  if (!activity || activity.duration_minutes !== 25 || activity.time_profile_ref !== 'trace_ld_v1_time_25m'
    || activity.activity_type !== 'interruptible_treatment' || activity.interruptibility !== 'treatment_stage_boundary'
    || activity.progress_policy !== 'committed_treatment_stages' || activity.completion_boundary !== 'check_and_body_proposal_committed'
    || activity.player_command_boundary_policy !== 'external_interruption_or_terminal_completion_only'
    || activity.internal_stage_player_decision_boundary !== 'forbidden'
    || !sameSet(activity.participant_slots?.required, ['player_clerk', 'onisim_boatman', 'eremey_fisher', 'trace_ld_v1_audience_slot_participating_fisher'])
    || !sameSet(activity.resource_refs, ['trace_ld_v1_item_bandage_cloth', 'trace_ld_v1_item_eremey_drinking_water_vessel', 'trace_ld_v1_item_fishing_net', 'trace_ld_v1_item_carry_poles'])
    || JSON.stringify(activity.resource_bindings) !== JSON.stringify([
      { resource_ref: 'trace_ld_v1_item_bandage_cloth', binding_kind: 'consumable_input', consumption_policy_ref: 'consume_at_success_or_failure_terminal_boundary', terminal_transition_ref: 'trace_ld_v1_property_bandage_cloth_applied_to_onisim' },
      { resource_ref: 'trace_ld_v1_item_eremey_drinking_water_vessel', binding_kind: 'single_use_support', consumption_policy_ref: 'consume_at_first_stage_boundary', transition_ref: 'trace_ld_v1_property_eremey_water_vessel_used_for_onisim' },
      { resource_ref: 'trace_ld_v1_item_fishing_net', binding_kind: 'reusable_support', consumption_policy_ref: 'reserve_at_first_stage_apply_at_terminal_boundary', arrival_binding_ref: 'phase_5_resource_arrival_binding.arrival_item_bindings.trace_ld_v1_item_fishing_net', reservation_transition_ref: 'trace_ld_v1_property_fishing_net_reserved_for_onisim_treatment', terminal_transition_ref: 'trace_ld_v1_property_fishing_net_applied_to_onisim_splint' },
      { resource_ref: 'trace_ld_v1_item_carry_poles', binding_kind: 'reusable_support', consumption_policy_ref: 'reserve_at_first_stage_apply_at_terminal_boundary', arrival_binding_ref: 'phase_5_resource_arrival_binding.arrival_item_bindings.trace_ld_v1_item_carry_poles', reservation_transition_ref: 'trace_ld_v1_property_carry_poles_reserved_for_onisim_treatment', terminal_transition_ref: 'trace_ld_v1_property_carry_poles_applied_to_onisim_splint' }
    ])
    || activity.preconditions?.danger_predicate_ref !== 'trace_ld_v1_treatment_safe_after_ratsha_surrender'
    || !Array.isArray(stages) || JSON.stringify(stages.map(({ stage_id, ordinal, duration_minutes }) => ({ stage_id, ordinal, duration_minutes })))
      !== JSON.stringify([{ stage_id: 'prepare_cloth_and_expose_injury', ordinal: 1, duration_minutes: 5 }, { stage_id: 'support_and_position_injured_leg', ordinal: 2, duration_minutes: 10 }, { stage_id: 'apply_bandage_and_reassess', ordinal: 3, duration_minutes: 10 }])
    || JSON.stringify(stages.map(({ committed_fact_outputs }) => committed_fact_outputs))
      !== JSON.stringify([['trace_ld_v1_treatment_stage_prepare_committed', 'onisim_released_from_binding', 'onisim_given_water', 'trace_ld_v1_treatment_resources_reserved'], ['trace_ld_v1_treatment_stage_support_committed'], ['onisim_first_aid_final_stage_committed', 'onisim_temporary_leg_splint_applied']])
    || stages[2]?.completion_fact !== 'onisim_first_aid_final_stage_committed'
    || activity.check_ref !== 'trace_ld_v1_check_risky_first_aid'
    || !sameSet(activity.consequence_refs, ['trace_ld_v1_consequence_onisim_stabilized', 'trace_ld_v1_consequence_onisim_not_worsened_by_invention'])
    || predicate?.required_ratsha_surrendered !== true || predicate.required_ratsha_surrender_state !== 'surrendered_without_further_harm'
    || predicate.required_ratsha_restraint_state !== 'not_restrained' || predicate.required_committed_fact !== 'ratsha_surrender_without_further_harm_committed'
    || predicate.required_knife_accessibility !== 'secured_not_available_to_ratsha'
    || predicate.forbidden_knife_holder_controller_ref !== 'ratsha_storehouse_helper'
    || !sameSet(predicate.required_present_slots, ['player_clerk', 'onisim_boatman', 'eremey_fisher', 'trace_ld_v1_audience_slot_participating_fisher'])
    || predicate.required_onisim_condition !== 'injured_unable_to_walk' || predicate.forbidden_onisim_condition !== 'stabilized_unable_to_walk'
    || activity.resource_policy?.transition_ref !== 'trace_ld_v1_property_bandage_cloth_applied_to_onisim') {
    fail('TRACE_PHASE_5_TREATMENT_ACTIVITY_INVALID', 'Treatment requires the exact safe predicate and 5/10/10 committed stages.');
  }
}

function validateTreatmentCheckAndConsequences(b) {
  const check = one(b.activities?.check_profiles, 'check_id', 'trace_ld_v1_check_risky_first_aid');
  const success = one(b.activities?.consequence_profiles, 'consequence_id', 'trace_ld_v1_consequence_onisim_stabilized');
  const failure = one(b.activities?.consequence_profiles, 'consequence_id', 'trace_ld_v1_consequence_onisim_not_worsened_by_invention');
  if (!check || check.attribute !== 'reason' || check.skill !== 'healing' || check.dc !== 12
    || JSON.stringify(check.modifiers) !== JSON.stringify({ state: -1, item_or_evidence: 1, circumstance: 0 })
    || check.outcome_refs?.success !== success?.consequence_id || check.outcome_refs?.failure !== failure?.consequence_id
    || !sameSet(success?.write_target_classes, ['body_effect_proposal', 'activity_history'])
    || !sameSet(success?.committed_fact_outputs, ['onisim_first_aid_completed', 'onisim_stabilized_unable_to_walk'])
    || !sameSet(failure?.write_target_classes, ['body_effect_proposal', 'activity_history'])
    || !sameSet(failure?.committed_fact_outputs, ['onisim_first_aid_completed', 'onisim_first_aid_completed_without_stabilization'])
    || !success?.forbidden_write_targets?.includes('completion_state') || !failure?.forbidden_write_targets?.includes('completion_state')) {
    fail('TRACE_PHASE_5_TREATMENT_CHECK_INVALID', 'First aid must retain its exact DC, modifiers and two body-result branches.');
  }
}

function validateBodyEffects(b) {
  const effect = one(b.body?.effect_profiles, 'effect_profile_id', 'trace_ld_v1_body_first_aid_onisim_25m');
  const success = effect?.outcome_effects?.success;
  const failure = effect?.outcome_effects?.failure;
  if (!effect || effect.activity_ref !== 'trace_ld_v1_activity_first_aid_onisim' || effect.elapsed_minutes !== 25
    || effect.selection_policy !== 'fixed_by_committed_check_outcome' || effect.rng_consumption !== 'forbidden'
    || JSON.stringify(success?.exact_deltas) !== JSON.stringify({ health: 0, satiety: 0, energy: 0 })
    || JSON.stringify(failure?.exact_deltas) !== JSON.stringify({ health: 0, satiety: 0, energy: 0 })
    || success?.condition_outcomes?.[0]?.from !== 'injured_unable_to_walk' || success.condition_outcomes[0]?.to !== 'stabilized_unable_to_walk'
    || failure?.condition_outcomes?.[0]?.from !== 'injured_unable_to_walk' || failure.condition_outcomes[0]?.to !== 'injured_unable_to_walk'
    || success.committed_fact !== 'onisim_stabilized_unable_to_walk' || failure.committed_fact !== 'onisim_first_aid_completed_without_stabilization'
    || !sameSet(effect.unchanged_condition_profile_refs, ['trace_ld_v1_condition_onisim_leg_fixation'])
    || !['instant_recovery', 'exact_diagnosis', 'can_walk', 'numeric_restoration'].every((x) => effect.forbidden_effects?.includes(x))) {
    fail('TRACE_PHASE_5_BODY_EFFECT_INVALID', 'First aid body effects must be exact, fixed, and non-restorative.');
  }
}

function validateConsentAndBandage(b) {
  const binding = one(b.npc?.decision_execution_bindings, 'execution_binding_id', 'trace_ld_v1_decision_execution_onisim_accept_first_aid');
  const bandage = one(b.npc?.property_transition_profiles, 'transition_profile_id', 'trace_ld_v1_property_bandage_cloth_applied_to_onisim');
  if (!binding || binding.option_id !== 'accept_first_aid' || binding.execution_kind !== 'future_activity_admission'
    || !sameSet(binding.activity_profile_refs, ['trace_ld_v1_activity_first_aid_onisim'])
    || binding.time_contract?.mode !== 'no_additional_elapsed_until_bound_activity_executes'
    || binding.time_contract?.clock_write !== 'forbidden' || !sameSet(binding.write_targets, ['treatment_consent', 'npc_decision_history'])
    || !binding.forbidden_write_targets?.includes('elapsed_game_time') || !binding.forbidden_write_targets?.includes('treatment_result')
    || !bandage || bandage.requires?.admission_fact !== 'onisim_first_aid_final_stage_committed'
    || bandage.requires.owner_ref !== 'eremey_fisher' || bandage.requires.condition_state !== 'clean_serviceable'
    || bandage.writes?.holder_ref !== 'onisim_boatman' || bandage.writes?.controller_ref !== 'onisim_boatman'
    || bandage.writes?.physical_position !== 'worn'
    || bandage.writes?.condition_state !== 'applied_bandage' || bandage.writes?.use_state !== 'bound_to_injured_leg'
    || bandage.owner_change !== 'forbidden') {
    fail('TRACE_PHASE_5_CONSENT_OR_BANDAGE_INVALID', 'Consent is zero-time and bandage application is allowed only after the final stage.');
  }
}

function validateCarrierResources(b) {
  const binding = b.phase1aBindings?.phase_5_initial_state_binding?.phase_5_resource_arrival_binding;
  const water = binding?.eremey_water_vessel_initial_binding;
  const net = one(binding?.arrival_item_bindings, 'item_template_ref', 'trace_ld_v1_item_fishing_net');
  const poles = one(binding?.arrival_item_bindings, 'item_template_ref', 'trace_ld_v1_item_carry_poles');
  const profiles = resolvedInventoryProfiles(b);
  const netProfile = one(profiles,
    'inventory_profile_id',
    'trace_ld_v1_inventory_profile_fishing_net_group_load');
  const polesProfile = one(profiles,
    'inventory_profile_id',
    'trace_ld_v1_inventory_profile_carry_poles_group_load');
  const bandageProfile = one(profiles,
    'inventory_profile_id',
    'trace_ld_v1_inventory_profile_bandage_cloth');
  const transitions = b.npc?.property_transition_profiles;
  const rope = one(transitions, 'transition_profile_id', 'trace_ld_v1_property_ratsha_binding_rope_released_to_eremey');
  const waterUse = one(transitions, 'transition_profile_id', 'trace_ld_v1_property_eremey_water_vessel_used_for_onisim');
  const netReserve = one(transitions, 'transition_profile_id', 'trace_ld_v1_property_fishing_net_reserved_for_onisim_treatment');
  const polesReserve = one(transitions, 'transition_profile_id', 'trace_ld_v1_property_carry_poles_reserved_for_onisim_treatment');
  const netApply = one(transitions, 'transition_profile_id', 'trace_ld_v1_property_fishing_net_applied_to_onisim_splint');
  const polesApply = one(transitions, 'transition_profile_id', 'trace_ld_v1_property_carry_poles_applied_to_onisim_splint');
  const firstAid = one(b.activities?.activity_profiles, 'profile_id', 'trace_ld_v1_activity_first_aid_onisim');
  if (!binding || binding.resource_carrier_ref !== 'trace_ld_v1_audience_slot_participating_fisher'
    || binding.resolved_carrier_ref !== 'resolved_participating_fisher'
    || binding.carrier_resolution_policy !== 'resolve_exactly_one_committed_slot_trace_or_fail_closed'
    || binding.rng_consumption !== 'forbidden' || binding.fallback_policy !== 'forbidden'
    || binding.arrival_location_ref !== 'trace_ld_v1_loc_old_drying_shed'
    || !exactArrivalItem(net, 'eremey_fisher',
      'trace_ld_v1_inventory_profile_fishing_net_group_load')
    || !exactArrivalItem(poles, 'background_fisher_1',
      'trace_ld_v1_inventory_profile_carry_poles_group_load')
    || !exactGroupLoadProfile(netProfile, 'trace_ld_v1_item_fishing_net')
    || !exactGroupLoadProfile(polesProfile, 'trace_ld_v1_item_carry_poles')
    || !exactCompactZeroHandProfile(bandageProfile,
      'trace_ld_v1_item_bandage_cloth')
    || !water || water.item_template_ref !== 'trace_ld_v1_item_eremey_drinking_water_vessel'
    || water.persistence_profile_ref !== 'trace_ld_v1_item_eremey_drinking_water_vessel'
    || !exactHeldState(water, 'eremey_fisher', 'worn_quick', 'quick', 'serviceable', 'one_patient_drink_available') || water.water_portions_remaining !== 1
    || !exactRopeRelease(rope) || !exactWaterUse(waterUse)
    || !exactReservation(netReserve, 'trace_ld_v1_item_fishing_net', 'eremey_fisher')
    || !exactReservation(polesReserve, 'trace_ld_v1_item_carry_poles', 'background_fisher_1')
    || !exactTerminalApply(netApply, 'trace_ld_v1_item_fishing_net', 'eremey_fisher', 'temporary_leg_splint_support')
    || !exactTerminalApply(polesApply, 'trace_ld_v1_item_carry_poles', 'background_fisher_1', 'temporary_leg_splint_frame')
    || !sameSet(firstAid?.resource_refs, ['trace_ld_v1_item_bandage_cloth', 'trace_ld_v1_item_eremey_drinking_water_vessel', 'trace_ld_v1_item_fishing_net', 'trace_ld_v1_item_carry_poles'])
    || firstAid?.resource_policy?.water_transition_ref !== waterUse?.transition_profile_id) {
    fail('TRACE_PHASE_5_CARRIER_RESOURCE_INVALID', 'Carrier resolution and rope, water, net, and poles transitions must remain exact and fail closed.');
  }
}

function exactArrivalItem(item, owner, persistenceProfile) { return item?.owner_ref === owner && item.persistence_profile_ref === persistenceProfile && exactHeldState(item, 'resolved_participating_fisher', 'external_load', 'quick', 'serviceable', 'carried_for_group_use') && item.location_policy === 'follow_resolved_participating_fisher'; }
function resolvedInventoryProfiles(bundle) {
  try {
    return (bundle.items?.item_inventory_profiles ?? []).map((profile) =>
      resolveInventoryProfile({
        profile,
        archetypes: bundle.inventoryArchetypes
      }));
  } catch (error) {
    fail('TRACE_PHASE_5_CARRIER_RESOURCE_INVALID',
      `Phase 5 inventory profile resolution failed: ${error.code ?? 'unknown'}.`);
  }
}
function exactGroupLoadProfile(value, itemTemplateRef) { return value?.item_template_ref === itemTemplateRef && value.mass_grams === 2500 && value.carry_form === 'long' && value.external_hand_cost === 1 && value.status === 'approved'; }
function exactCompactZeroHandProfile(value, itemTemplateRef) { return value?.item_template_ref === itemTemplateRef && value.mass_grams === 100 && value.carry_form === 'compact' && value.external_hand_cost === 0 && value.status === 'approved'; }
function exactHeldState(value, holder, position, accessibility, condition, use) { return value?.holder_ref === holder && value.controller_ref === holder && value.physical_position === position && value.accessibility === accessibility && value.condition_state === condition && value.use_state === use; }
function exactRopeRelease(value) { return value?.subject_ref === 'trace_ld_v1_item_ratsha_binding_rope' && value?.owner_change === 'forbidden' && value.requires?.owner_ref === null && value.requires?.holder_ref === 'onisim_boatman' && value.requires?.controller_ref === 'ratsha_storehouse_helper' && value.requires?.use_state === 'binding_onisim' && exactHeldState(value.writes, 'eremey_fisher', 'external_load', 'secured_not_available_to_ratsha', 'serviceable', 'coiled_ready_for_reuse'); }
function exactWaterUse(value) { return value?.subject_ref === 'trace_ld_v1_item_eremey_drinking_water_vessel' && value?.owner_change === 'forbidden' && value.requires?.admission_fact === 'trace_ld_v1_treatment_stage_prepare_committed' && value.requires?.water_portions_remaining === 1 && exactHeldState(value.requires, 'eremey_fisher', 'worn_quick', 'quick', 'serviceable', 'one_patient_drink_available') && value.writes?.water_portions_remaining === 0 && value.writes?.committed_fact === 'onisim_given_water' && exactHeldState(value.writes, 'eremey_fisher', 'worn_quick', 'quick', 'serviceable', 'empty_after_onisim_drink'); }
function exactReservation(value, subject, owner) { return value?.subject_ref === subject && value?.owner_change === 'forbidden' && exactHeldState(value.requires, 'resolved_participating_fisher', 'external_load', 'quick', 'serviceable', 'carried_for_group_use') && value.requires?.owner_ref === owner && exactHeldState(value.writes, 'resolved_participating_fisher', 'external_load', 'quick', 'serviceable', 'reserved_for_onisim_treatment'); }
function exactTerminalApply(value, subject, owner, useState) { return value?.subject_ref === subject && value?.owner_change === 'forbidden' && value.requires?.owner_ref === owner && value.requires?.admission_fact === 'onisim_first_aid_final_stage_committed' && exactHeldState(value.requires, 'resolved_participating_fisher', 'external_load', 'quick', 'serviceable', 'reserved_for_onisim_treatment') && exactHeldState(value.writes, 'onisim_boatman', 'external', 'applied_not_available_as_resource', 'serviceable', useState); }

function validateScope(b) {
  if (!sameSet(b.manifest?.scope, ['phase_5_onisim_treatment_content'])
    || !sameSet(b.manifest?.excludes, ['carry_runtime', 'fire_rest_runtime', 'zhdanko_runtime', 'ddl'])
    || !b.definition?.scope?.includes('phase_5_interruptible_onisim_treatment')
    || !['party_instance', 'runtime_handlers', 'evaluators', 'migrations', 'api_publication', 'ui', 'browser_flow'].every((x) => b.definition.excludes?.includes(x))) {
    fail('TRACE_PHASE_5_SCOPE_INVALID', 'Phase 5 content must not expand into runtime, persistence, DDL, or publication scope.');
  }
}

function one(values, key, expected) { const found = values?.filter((value) => value?.[key] === expected) ?? []; return found.length === 1 ? found[0] : null; }
function sameSet(actual, expected) { return Array.isArray(actual) && actual.length === expected.length && actual.every((value) => expected.includes(value)) && new Set(actual).size === actual.length; }
function exactRef(ref, path, id, revision, schema, digest) { return ref?.path === path && ref.id === id && ref.revision === revision && ref.schema === schema && ref.digest === digest; }
function exactPackageRef(ref, path, packageId, revision, schema, digest) { return ref?.path === path && ref.package_id === packageId && ref.revision === revision && ref.schema === schema && ref.digest === digest; }
function exactDefinitionSupersedes(ref, path, id, revision, digest) { return ref?.path === path && ref.id === id && ref.revision === revision && ref.digest === digest; }
function exactContentRef(ref, path, id, revision, schema, digest) { return exactRef(ref, path, id, revision, schema, digest); }
function sameManifestFiles(actual, expected) { return JSON.stringify(Object.keys(actual ?? {}).sort()) === JSON.stringify(Object.keys(expected).sort()) && Object.entries(expected).every(([key, value]) => actual[key] === value); }
function contentDigest(files) { return sha256(Buffer.from(`${Object.keys(files).sort().map((key) => `${key}:${files[key]}`).join('\n')}\n`, 'utf8')); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function fail(code, message) { const error = new Error(`lower-dvina trace phase 5 [${code}]: ${message}`); error.code = code; throw error; }
