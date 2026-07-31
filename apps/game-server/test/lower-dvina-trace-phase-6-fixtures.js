import { planTracePhase6SynchronizedCarry as planCarry } from
  '../src/runtime/lower-dvina-trace-phase-6-carry.js';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { canonicalDigest } from '@rus/materialization';
import { lowerDvinaTracePhase6TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-6-temporal-effect-owner.js';
import { validatePhase6TemporalSourceResolution } from
  '../src/runtime/lower-dvina-trace-phase-6-temporal-source.js';

export const REBIND_BOUNDARY = {
  boundary_id: 'trace_ld_v1_boundary_mikula_carry_load_limit_10m',
  elapsed_minutes: 10,
  route_progress_ppm: 500000,
  kind: 'committed_synchronized_route_boundary',
  reason_code: 'shoulder_load_limit_reached',
  outgoing: 'player_clerk',
  incoming: 'resolved_participating_fisher',
  shoulder: {
    condition_profile_ref: 'trace_ld_v1_condition_shoulder_bruise',
    from: 'shoulder_bruise', to: 'shoulder_bruise',
    outcome: 'load_penalty'
  },
  rng_consumption: 'forbidden'
};

export const planTracePhase6SynchronizedCarry = (input) => planCarry({
  ...input,
  temporalAdvanceOwner: input.temporalAdvanceOwner
    ?? createPhase6TestTemporalOwner({
      state: input.state,
      resolve: input.resolveExternalBoundary ?? pauseOnlyBoundaryOwner
    })
});

export function createPhase6TestTemporalOwner({ state, resolve }) {
  const candidates = state.temporal_boundary_candidates ?? [];
  const unique = new Map(candidates.map((candidate) => [canonicalDigest({
    rule_ref: candidate.rule_ref,
    policy_ref: candidate.policy_ref
  }), candidate]));
  return createTemporalAdvanceOwner({
    source_registrations: [...unique.values()].map((candidate) => ({
      source_kind: candidate.source_ref.entity_kind,
      rule_ref: candidate.rule_ref,
      policy_ref: candidate.policy_ref,
      resolve: (value, context) =>
        validatePhase6TemporalSourceResolution({ candidate: value,
          projection: context.projection,
          resolution: resolve(value, context) })
    })),
    effect_registrations:
      lowerDvinaTracePhase6TemporalEffectRegistrations()
  });
}

function pauseOnlyBoundaryOwner(candidate, { projection }) {
  if (candidate.scheduled_at.whole_minutes
      === projection.phase6_clock_before.whole_minutes) {
    throw Object.assign(new Error('pending'), {
      code: 'TRACE_PHASE_6_EXTERNAL_BOUNDARY_PENDING'
    });
  }
  return { disposition: 'execute', proposals: [{
    proposal_id: `temporal-event:${candidate.boundary_id}`,
    write_target: `temporal-event:${candidate.boundary_id}`
  }], state_projection: projection, follow_up_candidates: [] };
}

export const contracts = {
  shed_location_ref: 'shed',
  route: { route_id: 'shed-camp-carry', version: 2,
    movement_method: 'stretcher_carry', duration_minutes: 20,
    terminal_position_outcome: 'camp',
    body_effect_profile_refs: ['carrier20', 'carrier10', 'carried20'],
    carried_actor_rules: { single_root_clock: true,
      carrier_rebinding: { decision_boundary: REBIND_BOUNDARY } } },
  activity: { profile_id: 'carry-activity', version: 2 },
  sourceEndpoint: { endpoint_id: 'shed-endpoint' },
  destinationEndpoint: { endpoint_id: 'camp-endpoint' },
  accessPolicy: { policy_id: 'carry-access' },
  capacity: { contract_id: 'camp-capacity' },
  terminalPlacement: { group: { location_ref: 'camp', zone_ref: 'working_camp', anchor_template_ref: 'camp-anchor' }, carried_actor: { location_ref: 'camp', zone_ref: 'fire_rest_area' }, ratsha_observation: { state: 'observing', committed_fact_output: 'ratsha_under_group_observation_committed' } },
  bodyEffectBindings: { player_clerk: 'carrier10', eremey_fisher: 'carrier20', ratsha_storehouse_helper: 'carrier20', resolved_participating_fisher: 'carrier10', onisim_boatman: { onisim_stabilized_unable_to_walk: 'carried20' } },
  bodyEffects: [{ effect_profile_id: 'carrier20' },
    { effect_profile_id: 'carrier10' },
    { effect_profile_id: 'carried20' }]
};

export const profile = (id, template, massGrams = 2500,
  carryForm = 'long', externalHandCost = 1) => ({
  inventory_profile_id: id,
  item_template_ref: template,
  mass_grams: massGrams,
  carry_form: carryForm,
  external_hand_cost: externalHandCost
});

export const boundary = (id, minute,
  resolutionClass = 'execution_outcome') => ({
  boundary_id: id, boundary_kind: 'exact_timer',
  scheduled_at: { whole_minutes: String(minute),
    subminute_numerator: '0', subminute_denominator: '1' },
  source_ref: { entity_kind: 'party_route_plan_execution_event',
    entity_id: `source:${id}` },
  primary_subject_ref: { entity_kind: 'party', entity_id: 'p6' },
  subject_refs: [], scope_ref: { entity_kind: 'party', entity_id: 'p6' },
  rule_ref: { entity_ref: { entity_kind: 'action_contract', entity_id: id },
    authoring_version: 'v1' },
  policy_ref: { entity_ref: { entity_kind: 'activity_contract',
    entity_id: 'phase6-pause' }, authoring_version: 'v1' },
  preconditions_digest: 'a'.repeat(64),
  resolution_class: resolutionClass, interrupt_effect: 'background',
  visibility_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier',
    entity_id: 'visible' }, authoring_version: 'v1' },
  idempotency_key: `phase6:${id}:${minute}`, causal_parent_refs: []
});

export const state = () => ({
  party_id: 'p6', actor_id: 'mikula',
  clock: boundary('clock', 100).scheduled_at,
  party_state: { state_version: 1, turn_number: 6 },
  player_profile: { attributes: { strength: { value: 9 } } },
  position: { location_ref: 'shed', g5_anchor_id: 'shed-anchor' },
  prepared_scenes: [{ location_profile_ref: 'camp',
    node: { instance_id: 'camp-node' },
    anchor: { instance_id: 'camp-anchor', template_id: 'camp-anchor' } }],
  phase5_treatment: { activity_execution: { status: 'completed' },
    status: 'completed' },
  phase5_history: [{ treatment: { final: true, attempt: {
    resource_consumptions: [{ resource_ref: { entity_id: 'net' } },
      { resource_ref: { entity_id: 'poles' } }]
  } } }],
  sealed_selections: [{ selection_kind: 'audience', records: [{
    selected_id: 'background_fisher_2'
  }] }],
  knowledge: [{ fact_id: 'onisim_first_aid_completed' },
    { fact_id: 'ratsha_surrender_without_further_harm_committed' }],
  temporal_boundary_candidates: [],
  items: [{ template_id: 'trace_ld_v1_item_fishing_net', item_id: 'net',
    quantity: 1, condition_state: 'serviceable',
    placement: { holder_npc_id: 'onisim_boatman',
      physical_position: 'external' },
    ownership: { owner_npc_id: 'eremey_fisher',
      controller_npc_id: 'onisim_boatman' },
    state: { accessibility: 'applied_not_available_as_resource',
      use_state: 'temporary_leg_splint_support' },
    inventory_profile: profile('net-profile',
      'trace_ld_v1_item_fishing_net') },
  { template_id: 'trace_ld_v1_item_carry_poles', item_id: 'poles',
    quantity: 1, condition_state: 'serviceable',
    placement: { holder_npc_id: 'onisim_boatman',
      physical_position: 'external' },
    ownership: { owner_npc_id: 'background_fisher_1',
      controller_npc_id: 'onisim_boatman' },
    state: { accessibility: 'applied_not_available_as_resource',
      use_state: 'temporary_leg_splint_frame' },
    inventory_profile: profile('poles-profile',
      'trace_ld_v1_item_carry_poles') },
  { template_id: 'eremey-vessel', item_id: 'vessel', quantity: 1,
    placement: { holder_npc_id: 'eremey_fisher',
      physical_position: 'worn_quick' }, inventory_profile:
      profile('vessel-profile', 'eremey-vessel', 100, 'compact', 0) },
  { template_id: 'eremey-rope', item_id: 'rope', quantity: 1,
    placement: { holder_npc_id: 'eremey_fisher',
      physical_position: 'external_load' }, inventory_profile:
      profile('rope-profile', 'eremey-rope', 1200, 'long', 1) }],
  npcs: ['eremey_fisher', 'ratsha_storehouse_helper',
    'background_fisher_1', 'background_fisher_2', 'onisim_boatman']
    .map((participant_slot_ref) => ({ participant_slot_ref,
      instance_id: participant_slot_ref, anchor_id: 'shed-anchor',
      ...(participant_slot_ref === 'onisim_boatman' ? { machine_state: {
        body_condition: { state: 'stabilized_unable_to_walk' }
      } } : {}) }))
});
