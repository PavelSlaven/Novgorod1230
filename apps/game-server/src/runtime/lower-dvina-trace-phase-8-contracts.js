import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';
import { buildTraceInteriorEntryBinding } from
  './lower-dvina-trace-combat-movement-contracts.js';

const IDS = Object.freeze({
  routeCommand: 'lower_dvina_trace.follow_known_route_to_zhdanko_storehouse',
  accusationCommand: 'lower_dvina_trace.accuse_zhdanko_at_storehouse',
  camp: 'trace_ld_v1_loc_fishing_camp',
  storehouse: 'trace_ld_v1_loc_zhdanko_storehouse',
  route: 'trace_ld_v1_route_camp_to_storehouse',
  routeActivity: 'trace_ld_v1_activity_route_to_storehouse',
  accusationActivity: 'trace_ld_v1_activity_accuse_zhdanko',
  access: 'trace_ld_v1_access_zhdanko_storehouse',
  capacity: 'trace_ld_v1_capacity_zhdanko_storehouse'
});

export function resolveTracePhase8Contracts({ state, bundle,
  conversationBindings }) {
  if (![16, 17, 18, 19, 20, 21, 22, 23].includes(bundle?.definition_revision)
      || bundle.definition?.revision !== bundle.definition_revision) {
    gap('TRACE_PHASE_8_REVISION_GAP');
  }
  const route = exact(bundle.movement_bindings?.route_bindings,
    'route_id', IDS.route);
  const reverseRoute = exact(bundle.movement_bindings?.route_bindings,
    'route_id', route.reverse_route_ref);
  const localTransition = exact(
    bundle.movement_bindings?.local_transition_bindings,
    'transition_id',
    'trace_ld_v1_local_transition_storehouse_to_river_access');
  const routeActivity = exact(
    bundle.activity_check_consequence_profiles?.activity_profiles,
    'profile_id', IDS.routeActivity);
  const accusationActivity = exact(
    bundle.activity_check_consequence_profiles?.activity_profiles,
    'profile_id', IDS.accusationActivity);
  const access = exact(bundle.location_access_policies?.access_policies,
    'policy_id', IDS.access);
  const capacity = exact(bundle.location_capacity_contracts?.capacity_contracts,
    'contract_id', IDS.capacity);
  const sourceEndpoint = exact(bundle.location_topology_set?.endpoints,
    'endpoint_id', route.source_endpoint);
  const destinationEndpoint = exact(bundle.location_topology_set?.endpoints,
    'endpoint_id', route.destination_endpoint);
  const scene = (state.prepared_scenes ?? []).find(
    ({ location_profile_ref: id }) => id === IDS.storehouse);
  const roadBags = (state.containers ?? []).filter(
    ({ template_id: id }) => id === 'trace_ld_v1_container_road_bag');
  const actor = exactActor(state, 'zhdanko_storehouse_controller');
  const companions = ['eremey_fisher', 'ratsha_storehouse_helper']
    .map((slot) => exactActor(state, slot));
  const participant = participatingFisher(state);
  const binding = bundle.combat_semantic_bindings?.phase_8;
  const interiorEntry = buildTraceInteriorEntryBinding({ access, capacity,
    binding,
    sourceZoneRef: scene?.anchor?.state?.zone_ref, localTransition,
    durationMinutes: bundle.combat_semantic_bindings
      ?.exchange_timing_profile?.duration_minutes, fail: gap });
  if (route.duration_minutes !== 12
      || reverseRoute.reverse_route_ref !== route.route_id
      || reverseRoute.terminal_position_outcome !== IDS.camp
      || localTransition.location_ref !== IDS.storehouse
      || localTransition.destination_zone_ref !== 'river_access'
      || localTransition.duration_minutes !== 5
      || routeActivity.duration_minutes !== 12
      || accusationActivity.duration_minutes !== 5
      || sourceEndpoint.location_profile_id !== IDS.camp
      || destinationEndpoint.location_profile_id !== IDS.storehouse
      || access.location_ref !== IDS.storehouse
      || capacity.location_ref !== IDS.storehouse
      || !scene?.anchor?.instance_id || !scene.node?.instance_id
      || roadBags.length !== 1
      || roadBags[0].state?.location_ref !== IDS.storehouse
      || binding?.actor_slot !== actor.participant_slot_ref
      || binding.scope_location_ref !== IDS.storehouse
      || binding.conversation?.activity_profile_ref !== IDS.accusationActivity
      || binding.conversation?.duration_minutes !== 5
      || binding.conversation?.signal_mapping?.target_npc_ref
        !== actor.participant_slot_ref
      || conversationBindings == null) gap('TRACE_PHASE_8_CONTRACT_GAP');
  return Object.freeze({ ids: IDS, stateActorId: state.actor_id,
    route, routeActivity,
    accusationActivity, access, capacity, sourceEndpoint,
    destinationEndpoint, storehouseAnchor: scene.anchor.instance_id,
    actors: { zhdanko: actor, eremey: companions[0], ratsha: companions[1],
      participatingFisher: participant },
    combatBindings: structuredClone(binding),
    combatMovementBindings: { route_bindings: [structuredClone(route),
      structuredClone(reverseRoute)],
    local_transition_bindings: [structuredClone(localTransition)],
    local_access_bindings: [interiorEntry],
    route_execution_bindings: [],
    actor_destination_bindings: [{
      actor_ref: ref('npc', actor.instance_id), intent_kind: 'break_contact',
      destination_ref: ref('location_anchor', scene.anchor.instance_id),
      movement_ref: localTransition.transition_id,
      destination: { entity_ref: ref('location_anchor',
        scene.anchor.instance_id), location_ref: IDS.storehouse,
      zone_ref: localTransition.destination_zone_ref,
      anchor_id: scene.anchor.instance_id }
    }, {
      actor_ref: ref('npc', companions[1].instance_id), intent_kind: 'reach',
      destination_ref: ref('container', roadBags[0].container_id),
      movement_ref: interiorEntry.transition_id
    }] },
    conversationBindings: structuredClone(conversationBindings),
    conversationTimeProfiles: structuredClone(
      bundle.turn_step_owner_profiles?.semantic_duration_profiles ?? []),
    activityPins: [route, reverseRoute, localTransition, routeActivity,
      accusationActivity, access, capacity]
      .map((record) => ({ id: record.route_id ?? record.transition_id
        ?? record.profile_id ?? record.policy_id ?? record.contract_id,
      version: record.version,
      digest: canonicalDigest(record) })) });
}

function ref(entity_kind, entity_id) { return { entity_kind, entity_id }; }

function participatingFisher(state) {
  const ids = new Set((state.route_participant_commitments ?? [])
    .filter(({ role }) => role === 'escort')
    .map(({ npc_ref: ref }) => ref?.entity_id));
  const matches = (state.npcs ?? []).filter(({ instance_id: id,
    participant_slot_ref: slot }) => ids.has(id)
      && /^background_fisher_[12]$/.test(slot));
  if (matches.length !== 1) gap('TRACE_PHASE_8_FISHER_GAP');
  return structuredClone(matches[0]);
}
function exactActor(state, slot) {
  const matches = (state.npcs ?? []).filter(
    ({ participant_slot_ref: value }) => value === slot);
  if (matches.length !== 1 || !matches[0].instance_id) {
    gap('TRACE_PHASE_8_ACTOR_GAP');
  }
  return structuredClone(matches[0]);
}
function exact(records, key, id) {
  const matches = (records ?? []).filter((record) => record[key] === id);
  if (matches.length !== 1) gap('TRACE_PHASE_8_RECORD_GAP');
  return structuredClone(matches[0]);
}
function gap(code) { throw serverError(code,
  'The exact approved Phase 8 contract is incomplete.', { status: 409 }); }
