import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';
import {
  admitTurnStepOwnerProfiles,
  expandActivityProfiles
} from './lower-dvina-trace-turn-step-owner-profiles.js';

export function resolveTracePhase7Contracts({ state, bundle }) {
  if (!Number.isSafeInteger(bundle.definition_revision)
      || bundle.definition_revision < 15 || bundle.definition_revision > 32
      || bundle.definition?.revision !== bundle.definition_revision) {
    gap('TRACE_PHASE_7_REVISION_MISMATCH');
  }
  const autonomous = bundle.autonomous_semantic_bindings;
  const restActivity = exact(bundle.activity_check_consequence_profiles
    ?.activity_profiles, 'profile_id', 'trace_ld_v1_activity_fire_rest');
  const waitActivity = exact(bundle.activity_check_consequence_profiles
    ?.activity_profiles, 'profile_id', 'trace_ld_v1_activity_zhdanko_wait');
  const moveBagActivity = exact(bundle.activity_check_consequence_profiles
    ?.activity_profiles, 'profile_id',
  'trace_ld_v1_activity_zhdanko_move_bag');
  const bodyEffectSource = exact(
    bundle.body_environment_profiles?.effect_profiles,
    'effect_profile_id', 'trace_ld_v1_body_fire_rest_30m');
  const bodyEnvironment = exact(
    bundle.body_environment_profiles?.environment_profiles,
    'environment_profile_id', bodyEffectSource.environment_ref);
  const carryRoute = exact(bundle.movement_bindings?.route_bindings,
    'route_id', 'trace_ld_v1_route_shed_to_camp_carry_onisim');
  const campPlacement = carryRoute.terminal_placement_contract;
  const campScope = resolveCampScope(state, campPlacement);
  const bodyEffect = resolveFireRestEffect(bodyEffectSource, state);
  const npcPolicy = exact(bundle.npc_decision_schedule_policies
    ?.decision_policies, 'policy_id', 'trace_ld_v1_npc_zhdanko_decisions');
  const schedulePolicy = exact(bundle.npc_decision_schedule_policies
    ?.schedule_policies, 'schedule_policy_id',
  'trace_ld_v1_zhdanko_autonomous_schedule');
  const roadBag = exact(bundle.npc_decision_schedule_policies
    ?.schedule_resource_bindings, 'resource_binding_id',
  'trace_ld_v1_schedule_resource_road_bag');
  const bagTransition = exact(bundle.npc_decision_schedule_policies
    ?.property_transition_profiles, 'transition_profile_id',
  'trace_ld_v1_property_bag_to_river_access');
  const bagConcealTransition = exact(bundle.npc_decision_schedule_policies
    ?.property_transition_profiles, 'transition_profile_id',
  'trace_ld_v1_property_bag_concealed_in_storehouse');
  const localTransition = exact(bundle.movement_bindings
    ?.local_transition_bindings, 'transition_id',
  'trace_ld_v1_local_transition_storehouse_to_river_access');
  const scheduleExecutions = resolveScheduleExecutions({
    records: bundle.npc_decision_schedule_policies
      ?.schedule_execution_bindings,
    waitActivity,
    localTransition,
    bagTransition
  });
  const admittedOwnerProfiles = admitTurnStepOwnerProfiles(
    bundle.turn_step_owner_profiles,
    bundle.artifact_pins?.turn_step_owner_profiles
  );
  const semanticActivityProfiles = expandActivityProfiles(
    admittedOwnerProfiles
  ).map((profile) => ({
    ...profile,
    profile_pin: structuredClone(admittedOwnerProfiles.profile_pin)
  }));
  const genericCheckModifierPolicy = {
    ...structuredClone(admittedOwnerProfiles.generic_check_modifier_policy),
    profile_pin: structuredClone(admittedOwnerProfiles.profile_pin)
  };
  const zhdanko = actor(state, autonomous.target_npc_ref);
  const genericCheckContext = autonomous.generic_check_context_profile;
  const source = autonomous.source_factual_transition;
  const signal = autonomous.signal_descriptor;
  const npcSemanticProfile = bundle.definition_revision >= 25
    ? exactNpcSemanticProfile(bundle.npc_actor_step_profile, autonomous.target_npc_ref)
    : null;
  const currentGenericCheckContext = npcSemanticProfile == null
    ? genericCheckContext
    : { ...genericCheckContext,
      attributes: [...genericCheckContext.attributes,
        ...npcSemanticProfile.actor_mechanics_context.attributes] };
  if (autonomous.schema
        !== 'rus.lower_dvina_trace_autonomous_semantic_bindings.v1'
      || autonomous.decision_mode !== 'autonomous'
      || autonomous.fallback_policy !== 'forbidden'
      || autonomous.temporal_owner !== '@rus/turn'
      || autonomous.schedule_owner !== '@rus/npc-runtime'
      || autonomous.same_time_batch_policy !== 'common_temporal_owner_only'
      || source.activity_profile_ref !== waitActivity.profile_id
      || source.boundary !== 'five_minutes_committed'
      || source.boundary_elapsed_minutes_from_parent_start !== 25
      || autonomous.parent_player_activity_ref !== restActivity.profile_id
      || signal.category !== 'objective'
      || signal.significance !== 'material'
      || signal.perception_requirement !== 'perception_not_required'
      || autonomous.operation_contract !== 'npc_action_decision_request_v1'
      || Object.hasOwn(autonomous, 'activity_profile_bindings')
      || canonicalDigest(autonomous.available_resource_refs)
        !== canonicalDigest(['trace_ld_v1_container_road_bag'])
      || canonicalDigest(autonomous.known_route_refs)
        !== canonicalDigest([localTransition.transition_id])
      || !validGenericCheckContext(genericCheckContext)
      || restActivity.duration_minutes !== 30
      || restActivity.time_profile_ref !== 'trace_ld_v1_time_30m'
      || bodyEffect.activity_ref !== restActivity.profile_id
      || bodyEnvironment.source !== 'party_environment_snapshot'
      || canonicalDigest(bodyEnvironment.facts) !== canonicalDigest([
        'sheltered_from_wind', 'lit_fire', 'drying_place'
      ])
      || campPlacement?.group?.location_ref
        !== 'trace_ld_v1_loc_fishing_camp'
      || campPlacement.group.zone_ref !== 'working_camp'
      || campPlacement.group.anchor_template_ref
        !== campPlacement.carried_actor?.anchor_template_ref
      || campPlacement.carried_actor?.zone_ref !== 'fire_rest_area'
      || bodyEffect.elapsed_minutes !== 30
      || bodyEffect.selection_policy !== 'code_owned_within_approved_bounds'
      || bodyEffect.rng_consumption !== 'forbidden'
      || bodyEffect.exact_deltas?.health !== 0
      || bodyEffect.exact_deltas?.energy < 1
      || bodyEffect.exact_deltas.energy > 4
      || bodyEffect.exact_deltas?.satiety < -1
      || bodyEffect.exact_deltas.satiety > 0
      || !approvedRestOutcomes(bodyEffect.condition_outcomes)
      || localTransition.duration_minutes !== 5
      || roadBag.item_ref !== 'trace_ld_v1_container_road_bag'
      || bagTransition.subject_ref !== roadBag.item_ref) {
    gap('TRACE_PHASE_7_APPROVED_CHAIN_INVALID');
  }
  return Object.freeze({
    autonomous: structuredClone(autonomous),
    restActivity: structuredClone(restActivity),
    waitActivity: structuredClone(waitActivity),
    bodyEffect: structuredClone(bodyEffect),
    bodyEnvironment: structuredClone(bodyEnvironment),
    campPlacement: structuredClone(campPlacement),
    campScope: structuredClone(campScope),
    campRouteRef: carryRoute.route_id,
    npcPolicy: structuredClone(npcPolicy),
    schedulePolicy: structuredClone(schedulePolicy),
    roadBag: structuredClone(roadBag),
    bagTransition: structuredClone(bagTransition),
    bagConcealTransition: structuredClone(bagConcealTransition),
    localTransition: structuredClone(localTransition),
    scheduleExecutions: structuredClone(scheduleExecutions),
    scheduleActivityProfiles: structuredClone([
      waitActivity, moveBagActivity
    ]),
    semanticActivityProfiles: structuredClone(semanticActivityProfiles),
    genericCheckModifierPolicy,
    genericCheckContext: structuredClone(currentGenericCheckContext),
    ...(npcSemanticProfile == null ? {} : { npcSemanticProfile }),
    zhdanko: structuredClone(zhdanko),
    waitingBoundary: {
      elapsed_minutes: source.boundary_elapsed_minutes_from_parent_start
    },
    campLocationRef: 'trace_ld_v1_loc_fishing_camp',
    activityPin: {
      id: restActivity.profile_id,
      version: restActivity.version,
      digest: canonicalDigest(restActivity)
    }
  });
}

export function tracePhase7FireEnvironmentSatisfied(state, contracts) {
  const snapshot = state?.environment_snapshot;
  if (snapshot == null) return false;
  const { scope, causal_basis: causalBasis, ...profile } = snapshot;
  return contracts?.bodyEnvironment?.environment_profile_id
      === contracts?.bodyEffect?.environment_ref
    && canonicalDigest(profile) === canonicalDigest(
      contracts.bodyEnvironment)
    && canonicalDigest(scope) === canonicalDigest(contracts.campScope)
    && canonicalDigest(scope) === canonicalDigest(presentScope(state))
    && causalBasis?.kind === 'authored_terminal_environment'
    && causalBasis.environment_profile_ref
      === contracts.bodyEnvironment.environment_profile_id
    && causalBasis.route_ref === contracts.campRouteRef
    && causalBasis.anchor_template_ref
      === contracts.campPlacement.group.anchor_template_ref;
}

function resolveCampScope(state, placement) {
  const prepared = [...(state?.prepared_scenes ?? [])];
  const firstEntry = state?.first_entry_preparation?.scene;
  if (firstEntry?.location_profile_ref === placement?.group?.location_ref
      && !prepared.some((scene) => scene.location_profile_ref
        === firstEntry.location_profile_ref)) {
    prepared.push(firstEntry);
  }
  const matches = prepared.filter((scene) =>
    scene?.location_profile_ref === placement?.group?.location_ref
      && scene?.anchor?.template_id === placement?.group?.anchor_template_ref);
  if (matches.length !== 1 || !matches[0]?.node?.instance_id
      || !matches[0]?.anchor?.instance_id) {
    gap('TRACE_PHASE_7_CAMP_SCOPE_GAP');
  }
  return {
    location_ref: placement.group.location_ref,
    g5_node_id: matches[0].node.instance_id,
    g5_anchor_id: matches[0].anchor.instance_id,
    zone_ref: placement.group.zone_ref
  };
}

function presentScope(state) {
  return {
    location_ref: state?.position?.location_ref,
    g5_node_id: state?.position?.g5_node_id,
    g5_anchor_id: state?.position?.g5_anchor_id,
    zone_ref: state?.position?.zone_ref
  };
}

function exactNpcSemanticProfile(profile, targetNpcRef) {
  if (profile?.schema !== 'rus.lower_dvina_trace_npc_actor_step_profile.v1'
      || profile.profile_id !== 'lower_dvina_trace_npc_actor_step_profile_v1'
      || profile.revision !== 1 || profile.status !== 'approved'
      || profile.activation_boundary?.phase !== 'phase_7'
      || profile.activation_boundary?.npc_participant_slot_ref !== targetNpcRef
      || profile.fallback_policy !== 'forbidden'
      || canonicalDigest(profile.actor_mechanics_context) !== canonicalDigest({
        attributes: [{ attribute_ref: 'strength', label: 'сила', value: 10 }]
      })) {
    gap('TRACE_NPC_ACTOR_STEP_PROFILE_INVALID');
  }
  return Object.freeze({ profile_id: profile.profile_id, revision: profile.revision,
    status: profile.status, activation_boundary: structuredClone(profile.activation_boundary),
    actor_mechanics_context: structuredClone(profile.actor_mechanics_context) });
}

function validGenericCheckContext(profile) {
  return profile?.profile_ref
      === 'trace_ld_v1_zhdanko_phase7_generic_check_context_v1'
    && canonicalDigest(profile.attributes) === canonicalDigest([{
      attribute_ref: 'attention', label: 'внимание', value: 13
    }])
    && canonicalDigest(profile.skills) === canonicalDigest([{
      skill_ref: 'observation', label: 'наблюдательность', value: 2
    }])
    && !Object.hasOwn(profile, 'body')
    && !Object.hasOwn(profile, 'inventory');
}

function resolveScheduleExecutions({ records, waitActivity, localTransition,
  bagTransition }) {
  const wait = unique(records, (profile) =>
    profile.activity_profile_ref === waitActivity.profile_id
      && profile.movement_ref === null
      && profile.property_transition_refs?.length === 0);
  const moveBag = unique(records, (profile) =>
    profile.movement_ref === localTransition.transition_id
      && profile.property_transition_refs?.includes(
        bagTransition.transition_profile_id));
  return { wait, moveBag };
}

function unique(records, predicate) {
  const matches = (records ?? []).filter(predicate);
  if (matches.length !== 1) gap('TRACE_PHASE_7_EXECUTION_PROFILE_GAP');
  return matches[0];
}

function resolveFireRestEffect(source, state) {
  const bounds = source?.delta_bounds;
  const transitions = source?.condition_transitions;
  if (source?.activity_ref !== 'trace_ld_v1_activity_fire_rest'
      || source.elapsed_minutes !== 30
      || canonicalDigest(bounds) !== canonicalDigest({
        health: [0, 0], satiety: [-1, 0], energy: [1, 4]
      })
      || canonicalDigest(transitions) !== canonicalDigest([
        'wet_to_damp_only',
        'strong_shivering_may_stop',
        'headache_persists',
        'bruise_persists'
      ])) {
    gap('TRACE_PHASE_7_BODY_PROFILE_INVALID');
  }
  const conditions = new Set((state.body_state?.active_conditions ?? [])
    .map(({ id }) => id));
  const coldState = ['strong_shivering', 'mild_shivering']
    .find((id) => conditions.has(id));
  return {
    ...structuredClone(source),
    source_profile_digest: canonicalDigest(source),
    selection_policy: 'code_owned_within_approved_bounds',
    rng_consumption: 'forbidden',
    exact_deltas: { health: 0, energy: 3, satiety: -1 },
    condition_outcomes: [{
      condition_profile_ref: 'trace_ld_v1_condition_wet_clothing',
      from: 'wet',
      to: 'damp',
      outcome: 'wet_clothing_reduced_to_damp'
    }, ...(coldState == null ? [] : [{
      condition_profile_ref: 'trace_ld_v1_condition_cold_shivering',
      from: coldState,
      to: 'mild_shivering',
      outcome: coldState === 'strong_shivering'
        ? 'strong_shivering_reduced' : 'persists'
    }]), {
      condition_profile_ref: 'trace_ld_v1_condition_headache',
      from: 'headache',
      to: 'headache',
      outcome: 'headache_persists'
    }, {
      condition_profile_ref: 'trace_ld_v1_condition_shoulder_bruise',
      from: 'shoulder_bruise',
      to: 'shoulder_bruise',
      outcome: 'shoulder_bruise_persists'
    }].filter(({ from }) => conditions.has(from))
  };
}

function approvedRestOutcomes(outcomes) {
  const allowed = new Map([
    ['trace_ld_v1_condition_wet_clothing', [['wet', 'damp']]],
    ['trace_ld_v1_condition_cold_shivering', [
      ['strong_shivering', 'mild_shivering'],
      ['mild_shivering', 'mild_shivering']
    ]],
    ['trace_ld_v1_condition_headache', [['headache', 'headache']]],
    ['trace_ld_v1_condition_shoulder_bruise', [
      ['shoulder_bruise', 'shoulder_bruise']
    ]]
  ]);
  const seen = new Set();
  return Array.isArray(outcomes) && outcomes.every((outcome) => {
    const profile = outcome?.condition_profile_ref;
    if (seen.has(profile)) return false;
    seen.add(profile);
    return (allowed.get(profile) ?? []).some(([from, to]) =>
      outcome.from === from && outcome.to === to);
  });
}

function actor(state, slot) {
  const matches = (state.npcs ?? []).filter(
    ({ participant_slot_ref: ref }) => ref === slot
  );
  if (matches.length !== 1 || !matches[0].instance_id) {
    gap('TRACE_PHASE_7_ZHDANKO_MISSING');
  }
  return matches[0];
}

function exact(records, key, id) {
  const matches = (records ?? []).filter((record) => record?.[key] === id);
  if (matches.length !== 1) gap('TRACE_PHASE_7_RECORD_GAP');
  return matches[0];
}

function gap(code) {
  throw serverError(code,
    'The exact party-pinned Phase 7 chain is incomplete.', { status: 409 });
}
