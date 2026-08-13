export function assertLowerDvinaTraceM6Cutover(bundle, fail) {
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const phase10 = bundle.phase_10_bindings;
  if (bundle.m6_content_manifest_digest == null
      || manifest?.package_id !== 'lower_dvina_trace_phase_1a_v14'
      || manifest.revision !== 14
      || manifest.scenario_definition_revision !== 18
      || bindings?.binding_set_id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v14'
      || bindings.revision !== 14
      || bundle.definition?.revision !== 18
      || phase10?.schema
        !== 'rus.lower_dvina_trace_phase_10_bindings.v1'
      || phase10.scenario_definition_revision !== 18
      || phase10.owner !== '@rus/visibility-knowledge-memory'
      || phase10.execution_policy !== 'deterministic_post_commit'
      || phase10.follow_up_trigger !== 'temporary_disposition_committed'
      || phase10.semantic_llm_calls !== 'forbidden'
      || phase10.rng_calls !== 'forbidden'
      || phase10.check_calls !== 'forbidden'
      || phase10.completion_rules_ref?.digest
        !== bundle.artifact_pins?.completion_rules?.digest
      || phase10.epilogue_rules_ref?.digest
        !== bundle.artifact_pins?.epilogue_rules?.digest) {
    fail('TRACE_M6_CUTOVER_IDENTITY_INVALID',
      'M6 must pin revision 18 deterministic completion and epilogue data.');
  }
}
