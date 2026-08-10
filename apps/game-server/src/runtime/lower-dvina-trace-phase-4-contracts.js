import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';
import { resolveRatshaNpcSocialCheckProfile } from './lower-dvina-trace-phase-4-social-check.js';
import { resolveTracePhase4CombatBindings } from './lower-dvina-trace-phase-4-combat-contracts.js';
export const TRACE_PHASE_4_IDS = Object.freeze({
  routeOption: 'follow_known_route_to_drying_shed',
  negotiationOption: 'offer_conditional_protection_and_seek_surrender',
  routeActivity: 'trace_ld_v1_activity_route_to_drying_shed',
  negotiationActivity: 'trace_ld_v1_activity_ratsha_negotiation',
  route: 'trace_ld_v1_route_camp_to_shed',
  check: 'trace_ld_v1_check_ratsha_surrender_attempt',
  camp: 'trace_ld_v1_loc_fishing_camp',
  shed: 'trace_ld_v1_loc_old_drying_shed',
  observation: 'trace_ld_v1_observation_onisim_alive_at_drying_shed',
  ratshaPolicy: 'trace_ld_v1_npc_ratsha_decisions'
});
export function resolveTracePhase4Contracts({ state, bundle }) {
  if (![10, 11, 12, 13, 14, 15, 16].includes(bundle.definition_revision)
      || ![10, 11, 12, 13, 14, 15, 16].includes(bundle.definition?.revision)) {
    gap('TRACE_PHASE_4_REVISION_MISMATCH');
  }
  const ids = TRACE_PHASE_4_IDS, profiles = bundle.activity_check_consequence_profiles;
  const routeActivity = exact(profiles.activity_profiles, 'profile_id', ids.routeActivity), negotiation = exact(profiles.activity_profiles, 'profile_id', ids.negotiationActivity);
  const check = exact(profiles.check_profiles, 'check_id', ids.check);
  const observation = exact(
    profiles.scene_observation_profiles,
    'profile_id',
    ids.observation
  );
  const route = exact(bundle.movement_bindings.route_bindings, 'route_id', ids.route);
  const routeBodyEffect = routeEffect(bundle.body_environment_profiles?.effect_profiles,
    'trace_ld_v1_body_open_route_12m', ids.routeActivity, route.duration_minutes);
  const reverseRoute = exact(
    bundle.movement_bindings.route_bindings,
    'route_id',
    route.reverse_route_ref
  );
  const sourceEndpoint = exact(
    bundle.location_topology_set.endpoints,
    'endpoint_id',
    route.source_endpoint
  );
  const destinationEndpoint = exact(
    bundle.location_topology_set.endpoints,
    'endpoint_id',
    route.destination_endpoint
  );
  const access = exact(bundle.location_access_policies.access_policies, 'policy_id', negotiation.preconditions.access_policy_ref);
  const capacity = exact(
    bundle.location_capacity_contracts.capacity_contracts,
    'contract_id',
    bundle.location_capacity_contracts.capacity_contracts.find(
      (entry) => entry.location_ref === ids.shed
    )?.contract_id
  );
  const npcPolicy = exact(bundle.npc_decision_schedule_policies.decision_policies, 'policy_id', ids.ratshaPolicy);
  const knifeTransition = exact(bundle.npc_decision_schedule_policies.property_transition_profiles,
    'transition_profile_id', 'trace_ld_v1_property_ratsha_knife_surrendered_to_participating_fisher');
  const conversationBindings = [14, 15, 16].includes(bundle.definition_revision)
    ? bundle.conversation_semantic_bindings
    : null;
  const combatBindings = bundle.definition_revision === 16
    ? resolveTracePhase4CombatBindings(bundle.combat_semantic_bindings,
        ids.shed) : null;
  const conversationSignalMappings = conversationBindings == null
    ? null
    : Object.fromEntries([
        ['arrival', 'trace_ld_v1_phase_4_group_appears_to_ratsha_signal_v1'],
        ['objective', 'trace_ld_v1_phase_4_ratsha_waiting_invalidated_signal_v1'],
        ['demand', 'trace_ld_v1_phase_4_ratsha_promise_surrender_signal_v1'],
        ['knifeSelf', 'trace_ld_v1_phase_4_ratsha_loses_knife_access_signal_v1'],
        ['knifeObservers', 'trace_ld_v1_phase_4_observed_ratsha_knife_loss_signal_v1']
      ].map(([key, id]) => [key, exact(
        conversationBindings.signal_mappings,
        'mapping_id',
        id
      )]));
  const npcSocialCheckProfile =
    resolveRatshaNpcSocialCheckProfile(conversationBindings);
  const npcExecutions =
    bundle.npc_decision_schedule_policies.decision_execution_bindings
      .filter((entry) => entry.policy_id === ids.ratshaPolicy);
  const confessionStatement = exact(
    bundle.knowledge_lie_memory_rules.statement_templates,
    'statement_template_id',
    'trace_ld_v1_statement_ratsha_confession'
  );
  const confessionEffect = exact(
    bundle.npc_decision_schedule_policies.statement_effect_contracts,
    'statement_effect_contract_id',
    'trace_ld_v1_statement_effect_ratsha_confession'
  );
  const threatEffect = exact(
    bundle.npc_decision_schedule_policies.statement_effect_contracts,
    'statement_effect_contract_id',
    'trace_ld_v1_statement_effect_ratsha_threat_or_bargain'
  );
  const actors = Object.fromEntries(['eremey_fisher', 'ratsha_storehouse_helper',
    'onisim_boatman', 'background_fisher_1']
    .map((ref) => [ref, actor(state, ref)]));
  const promiseInstances = state.promise_instances ?? [];
  if (promiseInstances.length !== 1) gap('TRACE_PHASE_4_PROMISE_MISSING');
  const witnessIds = promiseInstances[0].witness_actor_ids
    ?? promiseInstances[0].witness_refs?.map((entry) => entry.entity_id)
    ?? [];
  const fishers = (state.npcs ?? []).filter(
    (entry) => /^background_fisher_[12]$/.test(entry.participant_slot_ref)
      && witnessIds.includes(entry.instance_id)
  );
  if (fishers.length !== 1) gap('TRACE_PHASE_4_PARTICIPATING_FISHER_MISSING');
  const fisher = fishers[0];
  const phase5Enabled = [11, 12, 13, 14, 15, 16].includes(bundle.definition_revision);
  const resourceArrivalBinding = phase5Enabled
    ? bundle.materialization_bindings?.phase_5_initial_state_binding
      ?.phase_5_resource_arrival_binding
    : null;
  const itemTemplates = phase5Enabled ? Object.fromEntries([
    ['net', 'trace_ld_v1_item_fishing_net'],
    ['poles', 'trace_ld_v1_item_carry_poles'],
    ['water', 'trace_ld_v1_item_eremey_drinking_water_vessel']
  ].map(([key, id]) => [key, exact(
    bundle.item_container_set.item_templates, 'item_template_id', id
  )])) : null;
  const resourceInventoryProfiles = phase5Enabled ? Object.fromEntries([
    ['net', 'trace_ld_v1_inventory_profile_fishing_net_group_load'],
    ['poles', 'trace_ld_v1_inventory_profile_carry_poles_group_load']
  ].map(([key, id]) => [key, exact(
    bundle.item_container_set.item_inventory_profiles,
    'inventory_profile_id',
    id
  )])) : null;
  if ([12, 13, 14, 15, 16].includes(bundle.definition_revision)) {
    resourceInventoryProfiles.water = exact(
      bundle.item_container_set.item_inventory_profiles,
      'inventory_profile_id',
      'trace_ld_v1_inventory_profile_eremey_drinking_water_vessel'
    );
  }
  const audienceGroups = (state.sealed_selections ?? []).filter(
    ({ selection_kind: kind }) => kind === 'audience'
  );
  const approvedAudienceRecords =
    bundle.knowledge_lie_memory_rules.audience_candidate_slots ?? [];
  const audienceRecord = audienceGroups[0]?.records?.[0];
  if (audienceGroups.length !== 1
      || audienceGroups[0].records?.length !== 1
      || approvedAudienceRecords.length !== 1
      || audienceRecord?.selected_id !== fisher.participant_slot_ref
      || audienceRecord.record_digest
        !== canonicalDigest(approvedAudienceRecords[0])
      || promiseInstances[0].witness_slot_bindings
        ?.trace_ld_v1_audience_slot_participating_fisher
        !== fisher.instance_id
      || promiseInstances[0].witness_slot_bindings?.eremey_fisher
        !== actors.eremey_fisher.instance_id
      || witnessIds.length !== 2) {
    gap('TRACE_PHASE_4_AUDIENCE_BINDING_INVALID');
  }
  const preparedCamp = (state.prepared_scenes ?? []).find(
    (entry) => entry.location_profile_ref === ids.camp
  );
  const preparedShed = (state.prepared_scenes ?? []).find(
    (entry) => entry.location_profile_ref === ids.shed
  );
  if (!preparedCamp?.anchor?.instance_id || !preparedShed?.anchor?.instance_id
      || preparedShed.entry_route_ref !== ids.route
      || preparedShed.anchor.state?.access_policy_ref !== access.policy_id
      || preparedShed.anchor.state?.capacity_contract_ref !== capacity.contract_id) {
    gap('TRACE_PHASE_4_PREPARED_SCENE_INVALID');
  }
  const admittedSlots = new Set(
    capacity.admission_model?.allowed_participant_slots ?? []
  );
  const approach = exact(capacity.zones, 'zone_id', 'shed_approach');
  if (capacity.admission_model?.kind !== 'constraint_based'
      || capacity.admission_model?.entry_group_bounds?.min > 3
      || capacity.admission_model?.entry_group_bounds?.max < 3
      || approach.max_actors < 5
      || !['player_clerk', 'eremey_fisher', 'ratsha_storehouse_helper',
        'onisim_boatman', fisher.participant_slot_ref].every(
        (slot) => admittedSlots.has(slot)
      )) {
    gap('TRACE_PHASE_4_CAPACITY_CONTRACT_INVALID');
  }
  for (const record of [routeActivity, negotiation, check, route, npcPolicy,
    confessionStatement]) {
    const group = record === route ? 'movement' : record === npcPolicy ? 'npc_decisions' : record === check ? 'checks' : 'activities';
    const selected = selection(
      state,
      record === confessionStatement ? 'lies_and_statements' : group,
      record.profile_id ?? record.check_id ?? record.route_id
        ?? record.policy_id ?? record.statement_template_id
    );
    if (!selected || selected.record_digest !== canonicalDigest(record)) gap('TRACE_PHASE_4_SEALED_SELECTION_MISMATCH');
  }
  if (routeActivity.duration_minutes !== 12 || negotiation.duration_minutes !== 10
      || check.dc !== 13 || check.attribute !== 'influence' || check.skill !== 'communication'
      || check.modifiers.state !== -1 || check.modifiers.item_or_evidence !== 0
      || check.modifiers.circumstance !== 1 || route.duration_minutes !== 12
      || route.knowledge_state !== 'closed_until_disclosed'
      || route.reverse_route_ref !== reverseRoute.route_id
      || reverseRoute.reverse_route_ref !== route.route_id
      || reverseRoute.source_endpoint !== route.destination_endpoint
      || reverseRoute.destination_endpoint !== route.source_endpoint
      || reverseRoute.knowledge_state !== 'known_after_forward_traversal'
      || !reverseRoute.knowledge_unlock_conditions.includes(
        'trace_ld_v1_route_camp_to_shed_committed'
      )
      || sourceEndpoint.location_profile_id !== ids.camp
      || destinationEndpoint.location_profile_id !== ids.shed
      || !route.terminal_observation_profile_refs.includes(ids.observation)
      || observation.committed_fact_output !== 'onisim_found_alive'
      || observation.elapsed_minutes !== 0
      || observation.body_state_mutation !== 'forbidden'
      || confessionStatement.assertion?.assertion_id
        !== 'trace_ld_v1_assertion_ratsha_confession'
      || confessionStatement.requires_independent_confirmation !== true
      || confessionEffect.statement_template_ref
        !== confessionStatement.statement_template_id
      || !['objective_truth', 'principal_fact', 'hidden_truth',
        'completion_state'].every((target) =>
        confessionEffect.forbidden_write_targets.includes(target))
      || threatEffect.statement_template_ref !== null
      || threatEffect.source_rule !== 'speaker_current_threat_or_offer_only'
      || threatEffect.audience_rule
        !== 'materialized_present_audience_only'
      || (conversationBindings != null && (
        conversationBindings.legacy_bounded_production_path !== 'forbidden'
        || conversationBindings.combat_policy?.handoff !== 'required'
        || conversationSignalMappings.demand.target_npc_ref
          !== 'ratsha_storehouse_helper'
        || conversationSignalMappings.demand.mechanics_refs.activity_id
          !== ids.negotiationActivity
        || conversationSignalMappings.demand.mechanics_refs.check_id
          !== ids.check
        || conversationSignalMappings.arrival.source_activity_id
          !== ids.routeActivity
        || conversationSignalMappings.knifeSelf.source_property_transition_id
          !== knifeTransition.transition_profile_id
      ))
      || !['objective_truth', 'confession', 'hidden_truth',
        'completion_state'].every((target) =>
        threatEffect.forbidden_write_targets.includes(target))
      || (phase5Enabled && !['net', 'poles'].every((key) => {
        const profile = resourceInventoryProfiles[key];
        return profile.mass_grams === 2500
          && profile.carry_form === 'long'
          && profile.external_hand_cost === 1
          && profile.status === 'approved';
      }))
      || ([12, 13, 14, 15, 16].includes(bundle.definition_revision)
        && (resourceInventoryProfiles.water.item_template_ref
          !== 'trace_ld_v1_item_eremey_drinking_water_vessel'
          || resourceInventoryProfiles.water.mass_grams !== 100
          || resourceInventoryProfiles.water.carry_form !== 'compact'
          || resourceInventoryProfiles.water.external_hand_cost !== 0
          || resourceInventoryProfiles.water.status !== 'approved'))) {
    gap('TRACE_PHASE_4_APPROVED_CHAIN_INVALID');
  }
  return Object.freeze({ ids, routeActivity, negotiation, check, route, routeBodyEffect,
    reverseRoute: { ...structuredClone(reverseRoute),
      digest: canonicalDigest(reverseRoute) },
    sourceEndpoint, destinationEndpoint, access, capacity, npcPolicy,
    observation, confessionStatement, confessionEffect, threatEffect,
    npcSocialCheckProfile,
    conversationBindings, conversationSignalMappings, combatBindings,
    conversationTimeProfiles: structuredClone(
      bundle.turn_step_owner_profiles?.semantic_duration_profiles ?? []
    ),
    knifeTransition, promisePolicy: structuredClone(bundle.promise_policy),
    resourceArrivalBinding: structuredClone(resourceArrivalBinding),
    itemTemplates: structuredClone(itemTemplates),
    resourceInventoryProfiles: structuredClone(resourceInventoryProfiles),
    npcExecutions: structuredClone(npcExecutions),
    anchors: {
      camp: preparedCamp.anchor.instance_id,
      shed: preparedShed.anchor.instance_id
    },
    actors: { ...actors, participating_fisher: structuredClone(fisher) },
    activityPins: [routeActivity, negotiation, check, route, reverseRoute, npcPolicy,
      observation, confessionStatement, confessionEffect, threatEffect].map((record) => ({
      id: record.profile_id ?? record.check_id ?? record.route_id
        ?? record.policy_id ?? record.statement_template_id
        ?? record.statement_effect_contract_id,
      version: record.version,
      digest: canonicalDigest(record)
    })) });
}
function routeEffect(records, effectId, activityRef, elapsedMinutes) {
  const effect = (records ?? []).find((entry) => entry.effect_profile_id === effectId);
  if (!effect?.exact_deltas || !Array.isArray(effect.condition_outcomes)) return null;
  if (effect.activity_ref !== activityRef || effect.elapsed_minutes !== elapsedMinutes
      || effect.selection_policy !== 'fixed_approved_effect' || effect.rng_consumption !== 'forbidden') gap('TRACE_PHASE_4_ROUTE_BODY_EFFECT_INVALID');
  return structuredClone(effect);
}
function actor(state, ref) { const value = (state.npcs ?? []).find((entry) => entry.participant_slot_ref === ref); if (!value?.instance_id) gap('TRACE_PHASE_4_PARTICIPANT_MISSING'); return structuredClone(value); }
function selection(state, kind, id) { return state.sealed_selections?.find((g) => g.selection_kind === kind)?.records.find((r) => r.selected_id === id) ?? null; }
function exact(records, key, id) { const matches = (records ?? []).filter((r) => r[key] === id); if (matches.length !== 1) gap('TRACE_PHASE_4_RECORD_GAP'); return matches[0]; }
function gap(code) { throw serverError(code, 'The exact party-pinned Phase 4 chain is incomplete.', { status: 409 }); }
