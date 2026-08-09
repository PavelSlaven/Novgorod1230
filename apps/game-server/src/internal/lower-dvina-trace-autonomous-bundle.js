import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const CONTENT_ROOT = `${ROOT}/phase-m3-content`;

export async function loadLowerDvinaTraceRevision15Bundle({
  rootDir,
  historicalBundle,
  fail,
  freezeDeep,
  validateDefinitionPins
}) {
  const [manifest, definition, autonomous, turnSteps, turn10, movement, phase1a, bindings,
    reused] = await Promise.all([
    readJson(rootDir, `${CONTENT_ROOT}/manifest.json`),
    readJson(rootDir, `${CONTENT_ROOT}/definition.json`),
    readJson(rootDir, `${CONTENT_ROOT}/autonomous-semantic-bindings.json`),
    readJson(rootDir, `${CONTENT_ROOT}/turn-step-bindings.json`),
    readJson(rootDir, `${CONTENT_ROOT}/turn-10-companion-bindings.json`),
    readJson(rootDir, `${CONTENT_ROOT}/movement-bindings.json`),
    readJson(rootDir, `${ROOT}/phase-1a-v11/manifest.json`),
    readJson(rootDir, `${ROOT}/phase-1a-v11/materialization-bindings.json`),
    readJson(rootDir, `${ROOT}/phase-1a-v10/materialization-bindings.json`)
  ]);
  assertRevision15Package({ historicalBundle, manifest, definition, autonomous,
    turnSteps, turn10, movement, phase1a, bindings, reused, fail });

  const historical = structuredClone(historicalBundle);
  const materializationBindings = {
    ...structuredClone(historical.materialization_bindings),
    ...structuredClone(bindings.value),
    sealed_selection_inventory: applySealedSelectionInventoryOverrides(
      historical.materialization_bindings.sealed_selection_inventory,
      bindings.value.sealed_selection_inventory_overrides
    )
  };
  historical.definition_revision = 15;
  historical.manifest_digest = phase1a.digest;
  historical.m3_content_manifest_digest = manifest.digest;
  historical.phase_1a_manifest = phase1a.value;
  historical.definition = definition.value;
  historical.materialization_bindings = materializationBindings;
  historical.movement_bindings = {
    ...structuredClone(movement.value),
    route_bindings: structuredClone(historicalBundle.movement_bindings.route_bindings)
  };
  historical.turn_step_bindings = turnSteps.value;
  historical.turn_10_companion_bindings = turn10.value;
  historical.autonomous_semantic_bindings = autonomous.value;
  for (const [key, loaded, path, value] of [
    ['phase_1a_manifest', phase1a, `${ROOT}/phase-1a-v11/manifest.json`, phase1a.value],
    ['materialization_bindings', bindings, `${ROOT}/phase-1a-v11/materialization-bindings.json`, materializationBindings],
    ['definition', definition, `${CONTENT_ROOT}/definition.json`, definition.value],
    ['movement_bindings', movement, `${CONTENT_ROOT}/movement-bindings.json`, historical.movement_bindings],
    ['turn_step_bindings', turnSteps, `${CONTENT_ROOT}/turn-step-bindings.json`, turnSteps.value],
    ['turn_10_companion_bindings', turn10, `${CONTENT_ROOT}/turn-10-companion-bindings.json`, turn10.value],
    ['autonomous_semantic_bindings', autonomous, `${CONTENT_ROOT}/autonomous-semantic-bindings.json`, autonomous.value]
  ]) {
    historical.artifact_pins[key] = {
      key,
      path,
      digest: loaded.digest,
      canonical_digest: canonicalDigest(value),
      schema: value.schema,
      revision: value.revision
    };
  }
  validateDefinitionPins(historical);
  return freezeDeep(historical);
}

function applySealedSelectionInventoryOverrides(inventory, overrides) {
  const result = structuredClone(inventory);
  if (!result || !overrides
    || !overrides.source_artifact_digests
    || !overrides.required_groups) {
    return null;
  }
  Object.assign(result.source_artifact_digests, overrides.source_artifact_digests);
  for (const group of result.required_groups ?? []) {
    const override = overrides.required_groups[group.selection_kind];
    if (override) Object.assign(group, override);
  }
  return result;
}

function assertRevision15Package({ historicalBundle, manifest, definition,
  autonomous, turnSteps, turn10, movement, phase1a, bindings, reused, fail }) {
  const content = manifest.value;
  if (content?.schema !== 'rus.lower_dvina_trace_m3_content_manifest.v1'
    || content.package_id !== 'lower_dvina_trace_m3_content_v1'
    || content.scenario_definition_revision !== 15
    || content.status !== 'approved'
    || content.fallback_policy !== 'forbidden'
    || content.superseded_package_ref?.digest !== historicalBundle.m2_content_manifest_digest
    || content.superseded_definition_ref?.digest !== historicalBundle.artifact_pins.definition.digest
    || content.files?.['definition.json'] !== definition.digest
    || content.files?.['turn-step-bindings.json'] !== turnSteps.digest
    || content.files?.['turn-10-companion-bindings.json'] !== turn10.digest
    || content.files?.['autonomous-semantic-bindings.json'] !== autonomous.digest
    || content.files?.['movement-bindings.json'] !== movement.digest
    || content.content_refs?.definition?.digest !== definition.digest
    || content.content_refs?.turn_step_bindings?.digest !== turnSteps.digest
    || content.content_refs?.turn_10_companion_bindings?.digest !== turn10.digest
    || content.content_refs?.autonomous_semantic_bindings?.digest !== autonomous.digest
    || content.content_refs?.movement_bindings?.digest !== movement.digest
    || definition.value?.revision !== 15
    || definition.value.supersedes_definition_ref?.digest
      !== historicalBundle.artifact_pins.definition.digest
    || definition.value.resolved_policy_refs?.turn_step_bindings?.digest
      !== turnSteps.digest
    || definition.value.resolved_policy_refs?.turn_10_companion_bindings?.digest
      !== turn10.digest
    || definition.value.resolved_policy_refs?.autonomous_semantic_bindings?.digest
      !== autonomous.digest
    || definition.value.resolved_policy_refs?.activity_check_consequence_profiles?.digest
      !== historicalBundle.artifact_pins.activity_check_consequence_profiles.digest
    || definition.value.resolved_policy_refs?.body_environment_profiles?.digest
      !== historicalBundle.artifact_pins.body_environment_profiles.digest
    || definition.value.resolved_policy_refs?.movement_bindings?.digest
      !== movement.digest
    || phase1a.value?.package_id !== 'lower_dvina_trace_phase_1a_v11'
    || phase1a.value.revision !== 11
    || phase1a.value.scenario_definition_revision !== 15
    || phase1a.value.superseded_package_ref?.digest
      !== historicalBundle.artifact_pins.phase_1a_manifest.digest
    || phase1a.value.base_definition_ref?.digest !== manifest.digest
    || phase1a.value.content_refs?.materialization_bindings?.digest !== bindings.digest
    || bindings.value?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v11'
    || bindings.value.revision !== 11
    || bindings.value.scenario_definition_revision !== 15
    || bindings.value.superseded_binding_ref?.digest !== reused.digest
    || bindings.value.reused_immutable_binding_ref?.digest !== reused.digest
    || bindings.value.binding_resolution_policy
      !== 'reuse_exact_superseded_initial_materialization_bindings_or_fail_closed'
    || bindings.value.fallback_policy !== 'forbidden'
    || bindings.value.normalization_policy !== 'forbidden'
    || !validInitialProjection(bindings.value)
    || !validTurnSteps(turnSteps.value)
    || !validTurn10Bindings(turn10.value)
    || !validAutonomousBindings(autonomous.value)) {
    fail('TRACE_M3_CONTENT_INVALID',
      'Exact approved M3 autonomous bindings and Phase 1A cutover are required.');
  }
}

function validInitialProjection(value) {
  const projection = value?.initial_autonomous_materialization;
  const spatial = projection?.storehouse_spatial_binding;
  const npc = projection?.npc_placement;
  const bag = projection?.container_placement;
  const inventory = value?.sealed_selection_inventory_overrides;
  return projection?.scenario_slots?.npc === 'zhdanko_storehouse_controller'
    && projection.scenario_slots.location === 'trace_ld_v1_loc_zhdanko_storehouse'
    && projection.scenario_slots.container === 'trace_ld_v1_container_road_bag'
    && projection.resolution_policy
      === 'existing_approved_candidate_sets_only_or_fail_closed'
    && projection.contents_policy === 'approved_existing_container_contents_only'
    && spatial?.location_profile_ref === 'trace_ld_v1_loc_zhdanko_storehouse'
    && spatial.node_template_ref === 'trace_ld_v1_tpl_zhdanko_storehouse'
    && spatial.anchor_template?.slot_key === 'storehouse_yard'
    && spatial.anchor_template?.npc_capacity === 1
    && spatial.anchor_template?.state?.access_policy_ref
      === 'trace_ld_v1_access_zhdanko_storehouse'
    && spatial.anchor_template?.state?.capacity_contract_ref
      === 'trace_ld_v1_capacity_zhdanko_storehouse'
    && npc?.participant_slot_ref === 'zhdanko_storehouse_controller'
    && npc.materialization_depth === 'key'
    && npc.location_profile_ref === spatial.location_profile_ref
    && npc.zone_ref === spatial.anchor_template.state.zone_ref
    && bag?.container_template_ref === 'trace_ld_v1_container_road_bag'
    && bag.owner_ref === 'trace_ld_v1_external_owner_savva_tverdich'
    && bag.holder_ref === npc.participant_slot_ref
    && bag.controller_ref === npc.participant_slot_ref
    && bag.closure_state === 'tied'
    && JSON.stringify(bag.exact_content_item_refs) === JSON.stringify([
      'trace_ld_v1_item_sealed_packet',
      'trace_ld_v1_item_wet_cloak',
      'trace_ld_v1_item_writing_tablet'
    ])
    && inventory?.source_artifact_digests
      ?.activity_check_consequence_profiles
      === '3d12485c9c6bd29e8994d43ac6ac684e9f14c62de13d6547a51a9c65a1c743ef'
    && inventory.source_artifact_digests.body_environment_profiles
      === 'c25da568872c294306b5f341b769d1d3a1d553e30decbeb81ce39d0d7b5dbac2'
    && inventory.source_artifact_digests.movement_bindings
      === 'c4ac3a494d190c63bf9e10fe310a083d6b4638de85ef23ae5b740c9ef745414d';
}

function validTurnSteps(value) {
  const fireRest = value?.domain_bindings?.find(
    ({ binding_id: id }) => id === 'trace_ld_v1_step_rest_at_camp_fire'
  );
  return value?.schema === 'rus.lower_dvina_trace_turn_step_bindings.v1'
    && value.binding_set_id === 'lower_dvina_trace_turn_step_bindings_v2'
    && value.revision === 2
    && value.scenario_definition_revision === 15
    && value.semantic_contract === 'turn_step_plan_v1'
    && value.fallback_policy === 'forbidden'
    && value.exact_fast_path === 'preserved'
    && value.legacy_bounded_fallback === 'forbidden'
    && value.domain_bindings?.length === 10
    && fireRest?.operation === 'request_activity'
    && fireRest.command_id === 'lower_dvina_trace.rest_by_fire_and_dry_clothing'
    && fireRest.activity_profile_ref === 'trace_ld_v1_activity_fire_rest'
    && fireRest.body_effect_profile_ref === 'trace_ld_v1_body_fire_rest_30m';
}

function validTurn10Bindings(value) {
  return value?.schema
      === 'rus.lower_dvina_trace_turn_10_companion_bindings.v1'
    && value.binding_set_id
      === 'lower_dvina_trace_turn_10_companion_bindings_v1'
    && value.revision === 1
    && value.scenario_definition_revision === 15
    && value.status === 'approved'
    && value.fallback_policy === 'forbidden'
    && value.command_binding?.command_id
      === 'lower_dvina_trace.request_eremey_and_fisher_to_zhdanko_storehouse'
    && value.conversation_activity?.duration_minutes === 5
    && value.conversation_activity?.time_mode
      === 'parent_activity_final_segment'
    && value.conversation_activity?.parent_activity_ref
      === 'trace_ld_v1_activity_fire_rest'
    && value.conversation_activity?.contribution_slots === 5
    && value.route_ref === 'trace_ld_v1_route_camp_to_storehouse';
}

function validAutonomousBindings(value) {
  const signal = value?.signal_mappings?.[0];
  return value?.schema === 'rus.lower_dvina_trace_autonomous_semantic_bindings.v1'
    && value.binding_set_id === 'lower_dvina_trace_autonomous_semantic_bindings_v1'
    && value.revision === 1
    && value.scenario_definition_revision === 15
    && value.decision_mode === 'autonomous'
    && value.temporal_owner === '@rus/turn'
    && value.schedule_owner === '@rus/npc-runtime'
    && value.same_time_batch_policy === 'common_temporal_owner_only'
    && value.fallback_policy === 'forbidden'
    && value.target_npc_ref === 'zhdanko_storehouse_controller'
    && value.source_factual_transition?.activity_profile_ref
      === 'trace_ld_v1_activity_zhdanko_wait'
    && value.source_factual_transition?.boundary
      === 'five_minutes_committed'
    && value.source_factual_transition?.boundary_elapsed_minutes_from_parent_start
      === 25
    && value.parent_player_activity_ref === 'trace_ld_v1_activity_fire_rest'
    && value.signal_descriptor?.category === 'objective'
    && value.signal_descriptor?.significance === 'material'
    && value.operation_contract === 'npc_action_decision_request_v1'
    && !Object.hasOwn(value, 'activity_profile_bindings')
    && Array.isArray(value.available_resource_refs)
    && JSON.stringify(value.available_resource_refs)
      === JSON.stringify(['trace_ld_v1_container_road_bag'])
    && Array.isArray(value.known_route_refs)
    && JSON.stringify(value.known_route_refs)
      === JSON.stringify(['trace_ld_v1_local_transition_storehouse_to_river_access'])
    && value.generic_check_context_profile?.profile_ref
      === 'trace_ld_v1_zhdanko_phase7_generic_check_context_v1'
    && value.generic_check_context_profile?.attributes?.length === 1
    && value.generic_check_context_profile?.skills?.length === 1
    && !Object.hasOwn(value.generic_check_context_profile, 'body')
    && !Object.hasOwn(value.generic_check_context_profile, 'inventory')
    && signal?.source_activity_id === 'trace_ld_v1_activity_zhdanko_wait'
    && signal.target_npc_ref === 'zhdanko_storehouse_controller'
    && signal.schedule_policy_ref === 'trace_ld_v1_zhdanko_autonomous_schedule';
}

async function readJson(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return {
    value: JSON.parse(raw.toString('utf8')),
    digest: createHash('sha256').update(raw).digest('hex')
  };
}
