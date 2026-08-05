export function assertLowerDvinaTraceM3Cutover(bundle, fail) {
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const definition = bundle.definition;
  const autonomous = bundle.autonomous_semantic_bindings;
  const fireRest = bundle.turn_step_bindings?.domain_bindings?.find(
    ({ binding_id: id }) => id === 'trace_ld_v1_step_rest_at_camp_fire'
  );
  const hasFireRestProfiles = bundle.activity_check_consequence_profiles
    ?.activity_profiles?.some(({ profile_id: id }) => id === 'trace_ld_v1_activity_fire_rest')
    && bundle.body_environment_profiles?.effect_profiles?.some(
      ({ effect_profile_id: id }) => id === 'trace_ld_v1_body_fire_rest_30m'
    );
  if (bundle.m3_content_manifest_digest == null
    || manifest?.package_id !== 'lower_dvina_trace_phase_1a_v11'
    || manifest.revision !== 11
    || manifest.scenario_definition_revision !== 15
    || bindings?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v11'
    || bindings.revision !== 11
    || definition?.revision !== 15
    || autonomous?.decision_mode !== 'autonomous'
    || fireRest?.command_id !== 'lower_dvina_trace.rest_by_fire_and_dry_clothing'
    || !hasFireRestProfiles) {
    fail('TRACE_M3_CUTOVER_IDENTITY_INVALID',
      'M3 must pin autonomous fire-rest semantics and the approved Phase 1A revision 15 artifacts.');
  }
}
