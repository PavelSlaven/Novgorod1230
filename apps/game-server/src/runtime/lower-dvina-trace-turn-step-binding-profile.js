import { TRACE_PHASE9_TURN_STEP_EXPECTED } from
  './lower-dvina-trace-phase-9-turn-step-bindings.js';

export const TRACE_TURN_STEP_EXPECTED = Object.freeze({
  'lower_dvina_trace.inspect_wreck_in_detail': {
    operation: 'request_discovery', kindField: 'discovery_kind',
    kindsField: 'discovery_kinds', kind: 'inspect',
    runtimeKinds: ['inspect', 'search'], targetKey: 'wreck',
    targetSemantic: 'wreck_shore'
  },
  'lower_dvina_trace.follow_path_to_fishing_camp': {
    operation: 'request_movement', kindField: 'movement_kind',
    kindsField: 'movement_kinds', kind: 'route', targetKey: 'fishingCamp',
    targetSemantic: 'fishing_camp',
    routeRef: 'trace_ld_v1_route_wreck_to_camp'
  },
  'lower_dvina_trace.ask_eremey_about_wreck': {
    operation: 'emit_interaction', kindField: 'interaction_kind',
    kindsField: 'interaction_kinds', kind: 'request', targetKey: 'eremey',
    targetSemantic: 'eremey_fisher', instrument: 'none'
  },
  'lower_dvina_trace.show_clue_and_seek_eremey_cooperation': {
    operation: 'emit_interaction', kindField: 'interaction_kind',
    kindsField: 'interaction_kinds', kind: 'offer', targetKey: 'eremey',
    targetSemantic: 'eremey_fisher', instrument: 'evidence',
    instrumentSemantic: 'blue_wool_evidence'
  },
  'lower_dvina_trace.follow_known_route_to_drying_shed': {
    operation: 'request_movement', kindField: 'movement_kind',
    kindsField: 'movement_kinds', kind: 'route', targetKey: 'dryingShed',
    targetSemantic: 'old_drying_shed'
  },
  'lower_dvina_trace.offer_conditional_protection_and_seek_surrender': {
    operation: 'emit_interaction', kindField: 'interaction_kind',
    kindsField: 'interaction_kinds', kind: 'offer', targetKey: 'ratsha',
    targetSemantic: 'ratsha_storehouse_helper', instrument: 'none'
  },
  'lower_dvina_trace.attempt_risky_first_aid_onisim': {
    operation: 'request_activity', kindField: 'activity_kind',
    kindsField: 'activity_kinds', kind: 'recover', targetKey: 'onisim',
    targetSemantic: 'onisim_boatman'
  },
  'lower_dvina_trace.make_stretcher_and_carry_onisim_to_camp': {
    operation: 'request_activity', kindField: 'activity_kind',
    kindsField: 'activity_kinds', kind: 'carry', targetKey: 'onisim',
    targetSemantic: 'onisim_boatman'
  },
  'lower_dvina_trace.rest_by_fire_and_dry_clothing': {
    minRevision: 15, operation: 'request_activity',
    kindField: 'activity_kind', kindsField: 'activity_kinds', kind: 'recover',
    targetKey: 'fishingCamp', targetSemantic: 'camp_fire'
  },
  'lower_dvina_trace.request_eremey_and_fisher_to_zhdanko_storehouse': {
    minRevision: 15, operation: 'emit_interaction',
    kindField: 'interaction_kind', kindsField: 'interaction_kinds',
    kind: 'request',
    targetKeys: ['eremey', 'participatingFisher', 'otherFisher'],
    targetSemantics: ['eremey_fisher', 'participating_fisher', 'other_fisher'],
    instrument: 'none'
  },
  'lower_dvina_trace.follow_known_route_to_zhdanko_storehouse': {
    minRevision: 16, operation: 'request_movement',
    kindField: 'movement_kind', kindsField: 'movement_kinds', kind: 'route',
    targetKey: 'zhdankoStorehouse', targetSemantic: 'zhdanko_storehouse'
  },
  'lower_dvina_trace.accuse_zhdanko_at_storehouse': {
    minRevision: 16, operation: 'emit_interaction',
    kindField: 'interaction_kind', kindsField: 'interaction_kinds',
    kind: 'speech', targetKey: 'zhdanko',
    targetSemantic: 'zhdanko_storehouse_controller', instrument: 'none'
  },
  'lower_dvina_trace.respond_in_active_combat': {
    minRevision: 16, operation: 'request_combat', kindField: 'intent_kind',
    kindsField: 'intent_kinds', kind: 'engage',
    targetKey: 'activeHostileNpc', targetSemantic: 'active_hostile_npc'
  },
  ...TRACE_PHASE9_TURN_STEP_EXPECTED
});

export const REVISION_13_EXACT_TEXTS = Object.freeze({
  'lower_dvina_trace.follow_known_route_to_drying_shed':
    new Set(['пройти известной тропой к старой сушильне.']),
  'lower_dvina_trace.offer_conditional_protection_and_seek_surrender':
    new Set(['предложить ратше условную защиту и потребовать сдачи.']),
  'lower_dvina_trace.make_stretcher_and_carry_onisim_to_camp':
    new Set(['сделать носилки и отнести онисима в стан.']),
  'lower_dvina_trace.rest_by_fire_and_dry_clothing': new Set([
    'отдохнуть у огня полчаса и подсушить одежду.',
    'отдохнуть у огня полчаса и подсушить одежду'
  ])
});

export const STATE_GATED_COMMANDS = new Set([
  'lower_dvina_trace.make_stretcher_and_carry_onisim_to_camp',
  'lower_dvina_trace.follow_known_route_to_zhdanko_storehouse',
  'lower_dvina_trace.accuse_zhdanko_at_storehouse',
  'lower_dvina_trace.respond_in_active_combat',
  ...Object.keys(TRACE_TURN_STEP_EXPECTED).filter((id) =>
    TRACE_TURN_STEP_EXPECTED[id].minRevision === 17)
]);

export const REVISION_24_STATE_GATED_COMMANDS = new Set([
  'lower_dvina_trace.follow_known_route_to_drying_shed',
  'lower_dvina_trace.offer_conditional_protection_and_seek_surrender',
  'lower_dvina_trace.attempt_risky_first_aid_onisim',
  'lower_dvina_trace.rest_by_fire_and_dry_clothing',
  'lower_dvina_trace.request_eremey_and_fisher_to_zhdanko_storehouse'
]);
