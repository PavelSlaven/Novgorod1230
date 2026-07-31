import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { resolveInventoryProfile } from '@rus/items-property';
import { loadLowerDvinaTracePhase5Content, validateLowerDvinaTracePhase5Content } from '../../tools/world-catalog-workflow/src/lower-dvina-trace-phase-5-check.mjs';

const canonical = hydrateContentDigests(await loadLowerDvinaTracePhase5Content());
const mutation = (label, mutate, code) => test(`Phase 5 rejects ${label}`, () => {
  const changed = structuredClone(canonical);
  mutate(changed);
  assert.throws(() => validateLowerDvinaTracePhase5Content(changed), { code });
});

test('Phase 5 pins Onisim treatment content and the Phase 1A/1B publication chain', () => {
  assert.doesNotThrow(() => validateLowerDvinaTracePhase5Content(canonical));
  const activity = canonical.activities.activity_profiles.find((x) => x.profile_id === 'trace_ld_v1_activity_first_aid_onisim');
  assert.deepEqual(activity.treatment_stages.map((x) => x.duration_minutes), [5, 10, 10]);
  assert.equal(activity.danger_predicate.required_committed_fact, 'ratsha_surrender_without_further_harm_committed');
  assert.equal(canonical.phase1a.base_definition_ref.digest, canonical.raw_digests.manifest);
  assert.equal(canonical.publication.scenario_definition_ref.digest, canonical.raw_digests.definition);
  const arrival = canonical.phase1aBindings.phase_5_initial_state_binding.phase_5_resource_arrival_binding;
  assert.equal(arrival.resource_carrier_ref, 'trace_ld_v1_audience_slot_participating_fisher');
  assert.deepEqual(arrival.arrival_item_bindings.map((x) => x.holder_ref), ['resolved_participating_fisher', 'resolved_participating_fisher']);
  assert.equal(arrival.eremey_water_vessel_initial_binding.item_template_ref, 'trace_ld_v1_item_eremey_drinking_water_vessel');
  assert.equal(arrival.eremey_water_vessel_initial_binding.use_state, 'one_patient_drink_available');
  assert.equal(arrival.eremey_water_vessel_initial_binding.water_portions_remaining, 1);
  const profiles = canonical.items.item_inventory_profiles.map((profile) =>
    resolveInventoryProfile({
      profile,
      archetypes: canonical.inventoryArchetypes
    }));
  const groupProfiles = profiles.filter(({ inventory_profile_id: id }) =>
    id.endsWith('_group_load'));
  assert.deepEqual(groupProfiles.map(({ mass_grams, carry_form,
    external_hand_cost, status }) => ({ mass_grams, carry_form,
    external_hand_cost, status })), [
    { mass_grams: 2500, carry_form: 'long', external_hand_cost: 1,
      status: 'approved' },
    { mass_grams: 2500, carry_form: 'long', external_hand_cost: 1,
      status: 'approved' }
  ]);
  const bandage = profiles.find(({ inventory_profile_id: id }) =>
    id === 'trace_ld_v1_inventory_profile_bandage_cloth');
  assert.deepEqual({
    mass_grams: bandage.mass_grams,
    carry_form: bandage.carry_form,
    external_hand_cost: bandage.external_hand_cost
  }, { mass_grams: 100, carry_form: 'compact', external_hand_cost: 0 });
  const referencedArchetypes = new Set(canonical.items.item_inventory_profiles
    .map(({ inventory_archetype_ref: ref }) => ref)
    .filter(Boolean));
  assert.deepEqual(canonical.inventoryArchetypes
    .map(({ inventory_archetype_id: id }) => id),
    ['compact_zero_hand', 'long_bundle']);
  assert.deepEqual(referencedArchetypes,
    new Set(['compact_zero_hand', 'long_bundle']));
});

mutation('a changed immutable superseded definition digest', (b) => { b.manifest.superseded_definition_ref.digest = '0'.repeat(64); }, 'TRACE_PHASE_5_MANIFEST_OR_LINEAGE_INVALID');
mutation('a stale content manifest digest', (b) => { b.manifest.files['definition.json'] = '0'.repeat(64); }, 'TRACE_PHASE_5_MANIFEST_OR_LINEAGE_INVALID');
mutation('a publication chain that does not pin Phase 5', (b) => { b.publication.phase_1a_manifest_ref.digest = '0'.repeat(64); }, 'TRACE_PHASE_5_PUBLICATION_CHAIN_INVALID');
mutation('a non-exact bandage admission', (b) => { b.npc.property_transition_profiles.find((x) => x.transition_profile_id === 'trace_ld_v1_property_bandage_cloth_applied_to_onisim').requires.admission_fact = 'trace_ld_v1_treatment_stage_prepare_committed'; }, 'TRACE_PHASE_5_CONSENT_OR_BANDAGE_INVALID');
mutation('an equipped bandage destination without an equipment slot', (b) => { b.npc.property_transition_profiles.find((x) => x.transition_profile_id === 'trace_ld_v1_property_bandage_cloth_applied_to_onisim').writes.physical_position = 'equipped'; }, 'TRACE_PHASE_5_CONSENT_OR_BANDAGE_INVALID');
mutation('treatment stages other than 5/10/10', (b) => { b.activities.activity_profiles.find((x) => x.profile_id === 'trace_ld_v1_activity_first_aid_onisim').treatment_stages[1].duration_minutes = 9; }, 'TRACE_PHASE_5_TREATMENT_ACTIVITY_INVALID');
mutation('an internal treatment stage exposed as a player decision boundary', (b) => { b.activities.activity_profiles.find((x) => x.profile_id === 'trace_ld_v1_activity_first_aid_onisim').internal_stage_player_decision_boundary = 'required'; }, 'TRACE_PHASE_5_TREATMENT_ACTIVITY_INVALID');
mutation('an invented stage fact', (b) => { b.activities.activity_profiles.find((x) => x.profile_id === 'trace_ld_v1_activity_first_aid_onisim').treatment_stages[1].committed_fact_outputs[1] = 'invented_stage_fact'; }, 'TRACE_PHASE_5_TREATMENT_ACTIVITY_INVALID');
mutation('an unbound reusable resource', (b) => { b.activities.activity_profiles.find((x) => x.profile_id === 'trace_ld_v1_activity_first_aid_onisim').resource_bindings[2].binding_kind = 'consumable_input'; }, 'TRACE_PHASE_5_TREATMENT_ACTIVITY_INVALID');
mutation('a check before the final treatment stage', (b) => { b.npc.property_transition_profiles.find((x) => x.transition_profile_id === 'trace_ld_v1_property_bandage_cloth_applied_to_onisim').requires.admission_fact = 'trace_ld_v1_treatment_stage_support_committed'; }, 'TRACE_PHASE_5_CONSENT_OR_BANDAGE_INVALID');
mutation('an altered first-aid DC', (b) => { b.activities.check_profiles.find((x) => x.check_id === 'trace_ld_v1_check_risky_first_aid').dc = 11; }, 'TRACE_PHASE_5_TREATMENT_CHECK_INVALID');
mutation('an altered first-aid modifier', (b) => { b.activities.check_profiles.find((x) => x.check_id === 'trace_ld_v1_check_risky_first_aid').modifiers.state = 0; }, 'TRACE_PHASE_5_TREATMENT_CHECK_INVALID');
mutation('an invented successful body recovery', (b) => { b.body.effect_profiles.find((x) => x.effect_profile_id === 'trace_ld_v1_body_first_aid_onisim_25m').outcome_effects.success.condition_outcomes[0].to = 'can_walk'; }, 'TRACE_PHASE_5_BODY_EFFECT_INVALID');
mutation('a failure that changes Onisim condition', (b) => { b.body.effect_profiles.find((x) => x.effect_profile_id === 'trace_ld_v1_body_first_aid_onisim_25m').outcome_effects.failure.condition_outcomes[0].to = 'stabilized_unable_to_walk'; }, 'TRACE_PHASE_5_BODY_EFFECT_INVALID');
mutation('elapsed time when Onisim accepts first aid', (b) => { b.npc.decision_execution_bindings.find((x) => x.execution_binding_id === 'trace_ld_v1_decision_execution_onisim_accept_first_aid').time_contract.clock_write = 'allowed'; }, 'TRACE_PHASE_5_CONSENT_OR_BANDAGE_INVALID');
mutation('an unsafe Ratsha predicate', (b) => { b.activities.activity_profiles.find((x) => x.profile_id === 'trace_ld_v1_activity_first_aid_onisim').danger_predicate.required_ratsha_surrendered = false; }, 'TRACE_PHASE_5_TREATMENT_ACTIVITY_INVALID');
mutation('a missing participating fisher', (b) => { b.activities.activity_profiles.find((x) => x.profile_id === 'trace_ld_v1_activity_first_aid_onisim').participant_slots.required.pop(); }, 'TRACE_PHASE_5_TREATMENT_ACTIVITY_INVALID');
mutation('runtime scope expansion', (b) => { b.manifest.excludes = ['ddl']; }, 'TRACE_PHASE_5_SCOPE_INVALID');
mutation('a fallback carrier resolution', (b) => { b.phase1aBindings.phase_5_initial_state_binding.phase_5_resource_arrival_binding.fallback_policy = 'allowed'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('a non-participating net holder', (b) => { b.phase1aBindings.phase_5_initial_state_binding.phase_5_resource_arrival_binding.arrival_item_bindings[0].holder_ref = 'background_fisher_2'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('a changed group-load inventory mass', (b) => { b.items.item_inventory_profiles.find((x) => x.inventory_profile_id === 'trace_ld_v1_inventory_profile_fishing_net_group_load').mass_grams = 1200; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('an unknown bandage inventory archetype', (b) => { b.items.item_inventory_profiles.find((x) => x.inventory_profile_id === 'trace_ld_v1_inventory_profile_bandage_cloth').inventory_archetype_ref = 'unknown'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('a non-approved carry-poles profile', (b) => { b.items.item_inventory_profiles.find((x) => x.inventory_profile_id === 'trace_ld_v1_inventory_profile_carry_poles_group_load').status = 'draft'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('a changed water initial state', (b) => { b.phase1aBindings.phase_5_initial_state_binding.phase_5_resource_arrival_binding.eremey_water_vessel_initial_binding.use_state = 'unused'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('a wrong water item template', (b) => { b.phase1aBindings.phase_5_initial_state_binding.phase_5_resource_arrival_binding.eremey_water_vessel_initial_binding.item_template_ref = 'trace_ld_v1_item_water'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('water with an extra available portion', (b) => { b.phase1aBindings.phase_5_initial_state_binding.phase_5_resource_arrival_binding.eremey_water_vessel_initial_binding.water_portions_remaining = 2; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('a rope release not transferred to Eremey', (b) => { b.npc.property_transition_profiles.find((x) => x.transition_profile_id === 'trace_ld_v1_property_ratsha_binding_rope_released_to_eremey').writes.holder_ref = null; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('a rope release with accessible Ratsha control', (b) => { b.npc.property_transition_profiles.find((x) => x.transition_profile_id === 'trace_ld_v1_property_ratsha_binding_rope_released_to_eremey').writes.accessibility = 'quick'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('water not exhausted after Onisim drink', (b) => { b.npc.property_transition_profiles.find((x) => x.transition_profile_id === 'trace_ld_v1_property_eremey_water_vessel_used_for_onisim').writes.water_portions_remaining = 1; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('a non-reserved net state', (b) => { b.npc.property_transition_profiles.find((x) => x.transition_profile_id === 'trace_ld_v1_property_fishing_net_reserved_for_onisim_treatment').writes.use_state = 'carried_for_group_use'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('a reservation that loses quick access', (b) => { b.npc.property_transition_profiles.find((x) => x.transition_profile_id === 'trace_ld_v1_property_fishing_net_reserved_for_onisim_treatment').writes.accessibility = 'reserved'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('terminal poles left with the carrier', (b) => { b.npc.property_transition_profiles.find((x) => x.transition_profile_id === 'trace_ld_v1_property_carry_poles_applied_to_onisim_splint').writes.controller_ref = 'resolved_participating_fisher'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('terminal net admitted before final treatment stage', (b) => { b.npc.property_transition_profiles.find((x) => x.transition_profile_id === 'trace_ld_v1_property_fishing_net_applied_to_onisim_splint').requires.admission_fact = 'trace_ld_v1_treatment_stage_support_committed'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');
mutation('terminal net without splint support state', (b) => { b.npc.property_transition_profiles.find((x) => x.transition_profile_id === 'trace_ld_v1_property_fishing_net_applied_to_onisim_splint').writes.use_state = 'temporary_leg_splint_frame'; }, 'TRACE_PHASE_5_CARRIER_RESOURCE_INVALID');

function hydrateContentDigests(bundle) {
  const refs = {
    definition: ['definition', 'lower_dvina_trace_v1', 11, 'rus.trace_scenario_definition.v1'],
    item_container_set: ['items', 'trace_ld_v1_item_container_set', 3, 'rus.trace_item_container_set.v1'],
    activity_check_consequence_profiles: ['activities', 'trace_ld_v1_activity_check_consequence_profiles', 3, 'rus.trace_activity_check_consequence_profiles.v1'],
    body_environment_profiles: ['body', 'trace_ld_v1_body_environment_profiles', 5, 'rus.trace_body_environment_profiles.v2'],
    npc_decision_schedule_policies: ['npc', 'trace_ld_v1_npc_decision_schedule_policies', 4, 'rus.trace_npc_decision_schedule_policies.v1']
  };
  const files = {};
  for (const [key, [digestKey, id, revision, schema]] of Object.entries(refs)) {
    const ref = bundle.manifest.content_refs[key];
    ref.id = id; ref.revision = revision; ref.schema = schema; ref.digest = bundle.raw_digests[digestKey];
    files[ref.path] = ref.digest;
  }
  bundle.manifest.files = files;
  bundle.manifest.content_digest = sha256(`${Object.keys(files).sort().map((key) => `${key}:${files[key]}`).join('\n')}\n`);
  bundle.definition.immutable_content_refs.item_container_set.digest = bundle.raw_digests.items;
  bundle.definition.resolved_policy_refs.activity_check_consequence_profiles.digest = bundle.raw_digests.activities;
  bundle.definition.resolved_policy_refs.body_environment_profiles.digest = bundle.raw_digests.body;
  bundle.definition.resolved_policy_refs.npc_decision_schedule_policies.digest = bundle.raw_digests.npc;
  return bundle;
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
