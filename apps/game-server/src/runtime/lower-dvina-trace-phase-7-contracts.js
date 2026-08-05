import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';

export function resolveTracePhase7Contracts({ state, bundle }) {
  if (bundle.definition_revision !== 15 || bundle.definition?.revision !== 15) {
    gap('TRACE_PHASE_7_REVISION_MISMATCH');
  }
  const autonomous = bundle.autonomous_semantic_bindings;
  const restActivity = exact(bundle.activity_check_consequence_profiles
    ?.activity_profiles, 'profile_id', 'trace_ld_v1_activity_fire_rest');
  const waitActivity = exact(bundle.activity_check_consequence_profiles
    ?.activity_profiles, 'profile_id', 'trace_ld_v1_activity_zhdanko_wait');
  const bodyEffectSource = exact(
    bundle.body_environment_profiles?.effect_profiles,
    'effect_profile_id', 'trace_ld_v1_body_fire_rest_30m');
  const bodyEffect = resolveFireRestEffect(bodyEffectSource);
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
  const zhdanko = actor(state, autonomous.target_npc_ref);
  const source = autonomous.source_factual_transition;
  const signal = autonomous.signal_descriptor;
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
      || autonomous.operation_contract !== 'npc_semantic_request_v1'
      || Object.hasOwn(autonomous, 'activity_profile_bindings')
      || canonicalDigest(autonomous.available_resource_refs)
        !== canonicalDigest(['trace_ld_v1_container_road_bag'])
      || canonicalDigest(autonomous.known_route_refs)
        !== canonicalDigest([localTransition.transition_id])
      || restActivity.duration_minutes !== 30
      || restActivity.time_profile_ref !== 'trace_ld_v1_time_30m'
      || bodyEffect.activity_ref !== restActivity.profile_id
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
    npcPolicy: structuredClone(npcPolicy),
    schedulePolicy: structuredClone(schedulePolicy),
    roadBag: structuredClone(roadBag),
    bagTransition: structuredClone(bagTransition),
    bagConcealTransition: structuredClone(bagConcealTransition),
    localTransition: structuredClone(localTransition),
    scheduleExecutions: structuredClone(scheduleExecutions),
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

function resolveFireRestEffect(source) {
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
  return {
    ...structuredClone(source),
    source_profile_digest: canonicalDigest(source),
    selection_policy: 'code_owned_within_approved_bounds',
    rng_consumption: 'forbidden',
    exact_deltas: { health: 0, energy: 2, satiety: -1 },
    condition_outcomes: [{
      condition_profile_ref: 'trace_ld_v1_condition_wet_clothing',
      from: 'wet',
      to: 'damp',
      outcome: 'wet_clothing_reduced_to_damp'
    }, {
      condition_profile_ref: 'trace_ld_v1_condition_cold_shivering',
      from: 'strong_shivering',
      to: 'mild_shivering',
      outcome: 'strong_shivering_reduced'
    }, {
      condition_profile_ref: 'trace_ld_v1_condition_headache',
      from: 'headache',
      to: 'headache',
      outcome: 'headache_persists'
    }, {
      condition_profile_ref: 'trace_ld_v1_condition_shoulder_bruise',
      from: 'shoulder_bruise',
      to: 'shoulder_bruise',
      outcome: 'shoulder_bruise_persists'
    }]
  };
}

function approvedRestOutcomes(outcomes) {
  const byProfile = new Map((outcomes ?? []).map(
    (outcome) => [outcome.condition_profile_ref, outcome]
  ));
  return byProfile.get('trace_ld_v1_condition_wet_clothing')?.from === 'wet'
    && byProfile.get('trace_ld_v1_condition_wet_clothing')?.to === 'damp'
    && byProfile.get('trace_ld_v1_condition_cold_shivering')?.from
      === 'strong_shivering'
    && ['none', 'mild_shivering'].includes(
      byProfile.get('trace_ld_v1_condition_cold_shivering')?.to
    )
    && byProfile.get('trace_ld_v1_condition_headache')?.to === 'headache'
    && byProfile.get('trace_ld_v1_condition_shoulder_bruise')?.to
      === 'shoulder_bruise';
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
