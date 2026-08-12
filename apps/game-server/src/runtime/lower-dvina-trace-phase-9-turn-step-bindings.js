export const TRACE_PHASE9_TURN_STEP_EXPECTED = Object.freeze({
  'lower_dvina_trace.recover_road_bag_control': {
    minRevision: 17, operation: 'request_item_use', kindField: 'use_kind',
    kindsField: 'use_kinds', kind: 'operate', targetKey: 'roadBag',
    targetSemantic: 'road_bag'
  },
  'lower_dvina_trace.open_recovered_road_bag': {
    minRevision: 17, operation: 'request_container_access',
    kindField: 'access_kind', kindsField: 'access_kinds', kind: 'open',
    targetKey: 'roadBag', targetSemantic: 'road_bag'
  },
  'lower_dvina_trace.recover_packet_and_inspect_seal': {
    minRevision: 17, operation: 'request_item_use', kindField: 'use_kind',
    kindsField: 'use_kinds', kind: 'operate', targetKey: 'sealedPacket',
    targetSemantic: 'sealed_packet'
  },
  'lower_dvina_trace.return_to_fishing_camp_with_group': {
    minRevision: 17, operation: 'request_movement',
    kindField: 'movement_kind', kindsField: 'movement_kinds', kind: 'route',
    targetKey: 'fishingCamp', targetSemantic: 'fishing_camp'
  },
  'lower_dvina_trace.ask_onisim_for_testimony': {
    minRevision: 17, operation: 'emit_interaction',
    kindField: 'interaction_kind', kindsField: 'interaction_kinds',
    kind: 'request', targetKey: 'onisim', targetSemantic: 'onisim_boatman',
    instrument: 'none'
  },
  'lower_dvina_trace.resolve_case_evidence': {
    minRevision: 17, operation: 'request_activity',
    kindField: 'activity_kind', kindsField: 'activity_kinds', kind: 'other',
    targetKey: 'caseEvidence', targetSemantic: 'committed_case_evidence'
  },
  'lower_dvina_trace.commit_temporary_disposition': {
    minRevision: 17, operation: 'request_activity',
    kindField: 'activity_kind', kindsField: 'activity_kinds', kind: 'other',
    targetKey: 'temporaryDispositionOptions', closedSelection: true,
    targetSemantics: [
      'hold_ratsha_and_zhdanko_for_authorized_handover',
      'hold_ratsha_zhdanko_absent', 'hold_zhdanko_ratsha_absent',
      'hold_zhdanko_ratsha_present_not_held',
      'preserve_open_case_without_custody',
      'preserve_recovered_property_for_savva_handover',
      'record_property_unavailable_without_invention',
      'leave_unresolved_property_state_unchanged',
      'preserve_active_no_summary_killing_promise',
      'commit_scope_breach_for_active_promise', 'record_no_active_promise']
  }
});
