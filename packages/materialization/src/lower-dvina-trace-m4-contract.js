export function assertLowerDvinaTraceM4Cutover(bundle, fail) {
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const definition = bundle.definition;
  const combat = bundle.combat_semantic_bindings;
  const combatStep = bundle.turn_step_bindings?.domain_bindings?.find(
    ({ binding_id: id }) => id === 'trace_ld_v1_step_combat_response'
  );
  const placement = bindings?.initial_autonomous_materialization?.weapon_placement;
  if (bundle.m4_content_manifest_digest == null
    || manifest?.package_id !== 'lower_dvina_trace_phase_1a_v12'
    || manifest.revision !== 12
    || manifest.scenario_definition_revision !== 16
    || bindings?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v12'
    || bindings.revision !== 12
    || definition?.revision !== 16
    || combat?.binding_set_id
      !== 'lower_dvina_trace_combat_semantic_bindings_v1'
    || combat.phase_8?.actor_slot !== 'zhdanko_storehouse_controller'
    || combatStep?.command_id
      !== 'lower_dvina_trace.respond_in_active_combat'
    || placement?.item_template_ref !== 'trace_ld_v1_item_zhdanko_axe'
    || placement.holder_ref !== 'zhdanko_storehouse_controller') {
    fail('TRACE_M4_CUTOVER_IDENTITY_INVALID',
      'M4 must pin combat semantics, the storehouse weapon, and Phase 1A revision 16.');
  }
}
