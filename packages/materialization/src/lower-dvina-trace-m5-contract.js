export function assertLowerDvinaTraceM5Cutover(bundle, fail) {
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const phase9 = bundle.phase_9_bindings;
  const steps = bundle.turn_step_bindings;
  const packet = bindings?.initial_autonomous_materialization?.packet_placement;
  const testimony = phase9?.onisim_testimony?.signal_mapping;
  const authoredClaim = phase9?.onisim_testimony?.authored_claim_contract;
  if (bundle.m5_content_manifest_digest == null
    || manifest?.package_id !== 'lower_dvina_trace_phase_1a_v13'
    || manifest.revision !== 13
    || manifest.scenario_definition_revision !== 17
    || bindings?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v13'
    || bindings.revision !== 13
    || bundle.definition?.revision !== 17
    || packet?.item_template_ref !== 'trace_ld_v1_item_sealed_packet'
    || packet.parent_container_ref !== 'trace_ld_v1_container_road_bag'
    || packet.document_contents_access !== 'forbidden'
    || packet.inventory_profile?.item_template_id
      !== 'trace_ld_v1_item_sealed_packet'
    || packet.inventory_profile?.status !== 'approved'
    || packet.parent_container_inventory_profile?.inventory_role
      !== 'primary_container'
    || testimony?.mapping_id
      !== 'trace_ld_v1_phase9_onisim_testimony_signal_v1'
    || testimony.source_command_id
      !== 'lower_dvina_trace.ask_onisim_for_testimony'
    || phase9?.owner_contracts?.disposition_applicability
      !== '@rus/social-law'
    || phase9?.owner_contracts?.disposition_selection !== '@rus/turn'
    || phase9?.temporary_disposition?.approved_contract?.owner
      !== '@rus/social-law'
    || phase9.temporary_disposition.approved_contract.version !== 2
    || phase9.temporary_disposition.approved_contract.contract_id
      !== phase9.temporary_disposition.contract_ref
    || phase9.temporary_disposition.approved_contract
      .supersedes_contract_ref?.version !== 1
    || authoredClaim?.schema !== 'authored_statement_claim_contract_v1'
    || authoredClaim.statement_template_ref
      !== phase9?.onisim_testimony?.statement_template_ref
    || authoredClaim.claim_id !== authoredClaim.claim?.claim_id
    || steps?.domain_bindings?.length !== 20) {
    fail('TRACE_M5_CUTOVER_IDENTITY_INVALID',
      'M5 must pin revision 17 Phase 9 authored data and sealed packet materialization.');
  }
}
