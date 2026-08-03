import { assertLowerDvinaTracePhase5InitialBindings } from './lower-dvina-trace-phase-5-contract.js';

const SCENARIO_ID = 'lower_dvina_trace_v1';
const PHASE_6_DEFINITION_DIGEST =
  'a2baf870be8784ca520319abd232c4383fdb4fb70fe1e39f50ab2d407c1c1b18';
const PHASE_1A_V8_MANIFEST_DIGEST =
  'b696a7420a3331915a2c00827f455671e54b005fbe29bf6749fa90482f73a10b';
const PHASE_1A_V8_BINDINGS_DIGEST =
  '58cff435df3e824d20eb6aa62f9f99a6b3aa2967129eb317ea768fa80ee2a5a4';

export function assertLowerDvinaTraceM1Cutover(bundle, fail) {
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const definition = bundle.definition;
  const turnSteps = bundle.turn_step_bindings;
  const ownerProfiles = bundle.turn_step_owner_profiles;
  const inventory = bindings?.sealed_selection_inventory;
  const pins = bundle.artifact_pins;
  const previousBindingRef = {
    path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v8/materialization-bindings.json',
    id: 'lower_dvina_trace_phase_1a_materialization_bindings_v8',
    revision: 8,
    schema: 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    digest: PHASE_1A_V8_BINDINGS_DIGEST
  };

  if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v9'
    || manifest.revision !== 9
    || manifest.status !== 'approved'
    || manifest.scenario_id !== SCENARIO_ID
    || manifest.scenario_definition_revision !== 13
    || manifest.fallback_policy !== 'forbidden'
    || !exactRef(manifest.superseded_package_ref, {
      path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v8/manifest.json',
      id: 'lower_dvina_trace_phase_1a_v8',
      revision: 8,
      schema: 'rus.lower_dvina_trace_phase_1a_manifest.v1',
      digest: PHASE_1A_V8_MANIFEST_DIGEST
    })
    || manifest.base_definition_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/manifest.json'
    || manifest.base_definition_ref.package_id
      !== 'lower_dvina_trace_m1_content_v1'
    || manifest.base_definition_ref.revision !== 1
    || manifest.base_definition_ref.schema
      !== 'rus.lower_dvina_trace_m1_content_manifest.v1'
    || manifest.base_definition_ref.digest !== bundle.m1_content_manifest_digest
    || !/^[a-f0-9]{64}$/u.test(bundle.m1_content_manifest_digest ?? '')
    || manifest.content_refs?.materialization_bindings?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v9/materialization-bindings.json'
    || manifest.content_refs.materialization_bindings.id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v9'
    || manifest.content_refs.materialization_bindings.revision !== 9
    || manifest.content_refs.materialization_bindings.schema
      !== 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1'
    || manifest.content_refs?.materialization_bindings?.digest
      !== pins.materialization_bindings.digest
    || bindings?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v9'
    || bindings.revision !== 9
    || bindings.status !== 'approved'
    || bindings.scenario_id !== SCENARIO_ID
    || bindings.scenario_definition_revision !== 13
    || !exactRef(bindings.superseded_binding_ref, previousBindingRef)
    || !exactRef(bindings.reused_immutable_binding_ref, previousBindingRef)
    || bindings.binding_resolution_policy
      !== 'reuse_exact_superseded_initial_materialization_bindings_or_fail_closed'
    || bindings.fallback_policy !== 'forbidden'
    || bindings.normalization_policy !== 'forbidden'
    || bindings.sealed_selection_inventory_ref?.path !== previousBindingRef.path
    || bindings.sealed_selection_inventory_ref?.id
      !== 'lower_dvina_trace_phase_1a_sealed_selection_inventory_v8'
    || bindings.sealed_selection_inventory_ref.digest
      !== PHASE_1A_V8_BINDINGS_DIGEST
    || definition?.scenario_id !== SCENARIO_ID
    || definition.revision !== 13
    || !exactRef(definition.supersedes_definition_ref, {
      path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-6-content/definition.json',
      id: SCENARIO_ID,
      revision: 12,
      digest: PHASE_6_DEFINITION_DIGEST
    })
    || definition.immutable_content_refs?.item_container_set?.revision !== 4
    || definition.immutable_content_refs.item_container_set.digest
      !== pins.item_container_set.digest
    || definition.resolved_policy_refs?.activity_check_consequence_profiles
      ?.digest !== pins.activity_check_consequence_profiles.digest
    || definition.resolved_policy_refs?.movement_bindings?.digest
      !== pins.movement_bindings.digest
    || definition.resolved_policy_refs?.body_environment_profiles?.digest
      !== pins.body_environment_profiles.digest
    || definition.resolved_policy_refs?.turn_step_bindings?.digest
      !== pins.turn_step_bindings.digest
    || definition.resolved_policy_refs?.turn_step_owner_profiles?.digest
      !== pins.turn_step_owner_profiles.digest
    || definition.resolved_policy_refs.turn_step_owner_profiles.owner
      !== '@rus/turn'
    || ownerProfiles?.schema
      !== 'rus.lower_dvina_trace_turn_step_owner_profiles.v1'
    || ownerProfiles.profile_set_id
      !== 'trace_ld_v1_turn_step_owner_profiles'
    || ownerProfiles.revision !== 1
    || ownerProfiles.status !== 'approved'
    || ownerProfiles.fallback_policy !== 'forbidden'
    || definition.resolved_policy_refs.turn_step_bindings.owner !== '@rus/turn'
    || definition.resolved_policy_refs.turn_step_bindings.schema
      !== 'rus.lower_dvina_trace_turn_step_bindings.v1'
    || definition.resolved_policy_refs.turn_step_bindings.id
      !== 'lower_dvina_trace_turn_step_bindings_v1'
    || definition.resolved_policy_refs.turn_step_bindings.revision !== 1
    || turnSteps?.binding_set_id !== 'lower_dvina_trace_turn_step_bindings_v1'
    || turnSteps.revision !== 1
    || turnSteps.status !== 'approved'
    || turnSteps.scenario_id !== SCENARIO_ID
    || turnSteps.scenario_definition_revision !== 13
    || turnSteps.semantic_contract !== 'turn_step_plan_v1'
    || turnSteps.max_internal_steps !== 8
    || turnSteps.exact_fast_path !== 'preserved'
    || turnSteps.legacy_bounded_fallback !== 'forbidden'
    || turnSteps.fallback_policy !== 'forbidden'
    || !exactTurnStepCommands(turnSteps.domain_bindings)
    || inventory?.inventory_id
      !== 'lower_dvina_trace_phase_1a_sealed_selection_inventory_v8'
    || inventory.source_artifact_digests?.activity_check_consequence_profiles
      !== pins.activity_check_consequence_profiles.digest
    || inventory.source_artifact_digests?.movement_bindings
      !== pins.movement_bindings.digest
    || inventory.source_artifact_digests?.body_environment_profiles
      !== pins.body_environment_profiles.digest
    || inventory.source_artifact_digests?.item_container_set
      !== pins.item_container_set.digest
    || bindings.phase_4_initial_state_binding?.onisim_injury_rope_binding
      ?.inventory_profile_ref
      !== 'trace_ld_v1_inventory_profile_ratsha_binding_rope') {
    fail('TRACE_M1_CUTOVER_IDENTITY_INVALID',
      'M1 must exact-supersede revision 12 and reuse its immutable mechanics.');
  }
  assertLowerDvinaTracePhase5InitialBindings(bundle, fail, {
    waterProfileRef:
      'trace_ld_v1_inventory_profile_eremey_drinking_water_vessel'
  });
}

function exactRef(actual, expected) {
  return Object.entries(expected)
    .every(([key, value]) => actual?.[key] === value);
}

function exactTurnStepCommands(bindings) {
  if (!Array.isArray(bindings) || bindings.length !== 8) return false;
  const expected = new Map([
    ['lower_dvina_trace.inspect_wreck_in_detail', 'request_discovery'],
    ['lower_dvina_trace.follow_path_to_fishing_camp', 'request_movement'],
    ['lower_dvina_trace.ask_eremey_about_wreck', 'emit_interaction'],
    ['lower_dvina_trace.show_clue_and_seek_eremey_cooperation',
      'emit_interaction'],
    ['lower_dvina_trace.follow_known_route_to_drying_shed',
      'request_movement'],
    ['lower_dvina_trace.offer_conditional_protection_and_seek_surrender',
      'emit_interaction'],
    ['lower_dvina_trace.attempt_risky_first_aid_onisim',
      'request_activity'],
    ['lower_dvina_trace.make_stretcher_and_carry_onisim_to_camp',
      'request_activity']
  ]);
  const commands = new Set();
  const bindingIds = new Set();
  for (const binding of bindings) {
    if (expected.get(binding?.command_id) !== binding?.operation
        || typeof binding.binding_id !== 'string'
        || binding.binding_id.length === 0
        || commands.has(binding.command_id)
        || bindingIds.has(binding.binding_id)) {
      return false;
    }
    commands.add(binding.command_id);
    bindingIds.add(binding.binding_id);
  }
  return commands.size === expected.size;
}
