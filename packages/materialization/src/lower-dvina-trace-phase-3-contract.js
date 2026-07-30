const SCENARIO_ID = 'lower_dvina_trace_v1';

export function assertLowerDvinaTracePhase3Bindings(bundle, fail) {
  const bindings = bundle.materialization_bindings;
  const spatial = bindings.camp_spatial_binding;
  const location = bundle.location_topology_set.location_profiles
    .filter((value) => value.location_profile_id === spatial?.location_profile_ref);
  const access = bundle.location_access_policies.access_policies
    .filter((value) => value.policy_id === spatial?.anchor_template?.state?.access_policy_ref);
  const capacity = bundle.location_capacity_contracts.capacity_contracts
    .filter((value) => value.contract_id === spatial?.anchor_template?.state?.capacity_contract_ref);
  const zone = capacity[0]?.zones?.filter(
    (value) => value.zone_id === spatial?.anchor_template?.slot_key
  );
  const route = bundle.movement_bindings.route_bindings
    .filter((value) => value.route_id === spatial?.entry_route_ref);
  const placements = bindings.initial_participant_placements;
  const expected = new Map([
    ['eremey_fisher', 'scene'],
    ['background_fisher_1', 'background'],
    ['background_fisher_2', 'background']
  ]);
  if (location.length !== 1 || access.length !== 1 || capacity.length !== 1
    || zone?.length !== 1 || route.length !== 1
    || spatial.node_template_ref !== location[0].scene_template_ref
    || spatial.node_slot_ref !== location[0].location_profile_id
    || spatial.entry_endpoint_ref !== route[0].destination_endpoint
    || access[0].location_ref !== location[0].location_profile_id
    || capacity[0].location_ref !== location[0].location_profile_id
    || spatial.anchor_template.npc_capacity !== zone[0].max_actors
    || spatial.anchor_template.state.zone_ref !== zone[0].zone_id
    || !Array.isArray(placements) || placements.length !== expected.size
    || new Set(placements.map((value) => value.instance_key)).size !== expected.size
    || placements.some((value) => (
      value.instance_key !== value.participant_slot_ref
      || !expected.has(value.participant_slot_ref)
      || value.materialization_depth !== expected.get(value.participant_slot_ref)
      || value.location_profile_ref !== location[0].location_profile_id
      || value.anchor_template_ref !== spatial.anchor_template.template_id
      || value.zone_ref !== zone[0].zone_id
      || value.profile_binding_source !== 'sealed_participant_selection'
      || value.instance_identity_policy !== 'deterministic_party_run_slot'
    ))) {
    fail(
      'TRACE_PHASE_3_CAMP_BINDING_INVALID',
      'Approved camp and initial participant bindings are required.'
    );
  }
}

export function assertLowerDvinaTracePhase3Cutover(bundle, fail) {
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const definition = bundle.definition;
  const knowledge = bundle.knowledge_lie_memory_rules;
  const npc = bundle.npc_decision_schedule_policies;
  const activity = bundle.activity_check_consequence_profiles;
  if (manifest.package_id !== 'lower_dvina_trace_phase_1a_v4'
    || manifest.superseded_package_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v3/manifest.json'
    || manifest.superseded_package_ref.id !== 'lower_dvina_trace_phase_1a_v3'
    || manifest.superseded_package_ref.revision !== 3
    || manifest.superseded_package_ref.schema
      !== 'rus.lower_dvina_trace_phase_1a_manifest.v1'
    || manifest.superseded_package_ref.digest
      !== '6f115e878a663b6aacb654bf7fe86b651467e1da06161907faac06770d4a9925'
    || manifest.base_definition_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-3-content/manifest.json'
    || manifest.base_definition_ref.package_id !== 'lower_dvina_trace_phase_3_content_v1'
    || manifest.base_definition_ref.revision !== 1
    || manifest.base_definition_ref.schema
      !== 'rus.lower_dvina_trace_phase_3_content_manifest.v1'
    || bindings.superseded_binding_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v3/materialization-bindings.json'
    || bindings.superseded_binding_ref.id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v3'
    || bindings.superseded_binding_ref.revision !== 3
    || bindings.superseded_binding_ref.schema
      !== 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1'
    || bindings.superseded_binding_ref.digest
      !== 'f929b61aa1e5dcb6e6163837373b3d4ab1431ed786d32e262a019a362a3f51dd'
    || definition.supersedes_definition_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v4/definition.json'
    || definition.supersedes_definition_ref.id !== SCENARIO_ID
    || definition.supersedes_definition_ref.revision !== 7
    || definition.supersedes_definition_ref.digest
      !== '1591b10d19deb48393b42fd4d84ad5c770ab8cdc153af2f94a4d7c749383f729'
    || knowledge.supersedes_ref?.digest
      !== '6c296a6ebe096633ae58c9ff45dc4a44f92ce56d7843e10bc3133718e6155046'
    || npc.supersedes_ref?.digest
      !== 'd37ba0f3c22b248304ce108e20067f39e9c5bfd8bdae1b03350e270d51ad50ca'
    || activity.revision !== 2
    || activity.supersedes_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d/activity-check-consequence-profiles.json'
    || activity.supersedes_ref.id !== 'trace_ld_v1_activity_check_consequence_profiles'
    || activity.supersedes_ref.revision !== 1
    || activity.supersedes_ref.schema !== 'rus.trace_activity_check_consequence_profiles.v1'
    || activity.supersedes_ref.digest
      !== '5eefc71c6a73c1604f606d1f84862cf5f6d7a774a957f10ad9ead7e950717654') {
    fail(
      'TRACE_PHASE_1A_CUTOVER_IDENTITY_INVALID',
      'Phase 1A revision 8 must exact-supersede the immutable revision 7 chain.'
    );
  }
}

export function assertLowerDvinaTracePhase3PickupCutover(bundle, fail) {
  const manifest = bundle.phase_1a_manifest;
  const definition = bundle.definition;
  const items = bundle.item_container_set;
  if (manifest.package_id !== 'lower_dvina_trace_phase_1a_v5'
      || manifest.revision !== 5
      || manifest.scenario_definition_revision !== 9
      || manifest.superseded_package_ref?.path
        !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v4/manifest.json'
      || manifest.superseded_package_ref.id
        !== 'lower_dvina_trace_phase_1a_v4'
      || manifest.superseded_package_ref.revision !== 4
      || manifest.superseded_package_ref.digest
        !== 'd0edfe980348fbffa53d1f9984b52c8a7ef6235c3144ec38ea7964e31a684266'
      || manifest.base_definition_ref?.path
        !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-3-content-v2/manifest.json'
      || manifest.base_definition_ref.package_id
        !== 'lower_dvina_trace_phase_3_content_v2'
      || manifest.base_definition_ref.revision !== 2
      || manifest.base_definition_ref.digest
        !== '2375f9c90405311a47f186cb1f6fe3ce3d9b823c96f1e784047ebd6b789f5076'
      || manifest.content_refs?.materialization_bindings?.id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v5'
      || manifest.content_refs.materialization_bindings.digest
        !== 'd67e8543448872ee529893df60980771548fb07dada306303bb1003d0ffda0a3'
      || definition.supersedes_definition_ref?.path
        !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-3-content/definition.json'
      || definition.supersedes_definition_ref.id !== SCENARIO_ID
      || definition.supersedes_definition_ref.revision !== 8
      || definition.supersedes_definition_ref.digest
        !== '9e0b01449fb3343c078a053886c1920ce97a1ad5197879f4247bd31f13329a00'
      || items.supersedes_ref?.path
        !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0c/item-container-set.json'
      || items.supersedes_ref.id !== 'trace_ld_v1_item_container_set'
      || items.supersedes_ref.revision !== 1
      || items.supersedes_ref.digest
        !== '182fb92641c8c053027718f52eed3467ce9ed79971e7168f4bc8727e1a169a3f') {
    fail(
      'TRACE_PHASE_1A_CUTOVER_IDENTITY_INVALID',
      'Phase 1A revision 9 must exact-supersede the immutable revision 8 chain.'
    );
  }
}
