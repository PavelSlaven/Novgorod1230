import { canonicalDigest } from './core.js';
import {
  assertLowerDvinaTracePhase3Bindings,
  assertLowerDvinaTracePhase3Cutover,
  assertLowerDvinaTracePhase3PickupCutover
} from './lower-dvina-trace-phase-3-contract.js';
import { assertLowerDvinaTracePhase4Cutover } from './lower-dvina-trace-phase-4-contract.js';
import { assertLowerDvinaTracePhase5Cutover } from './lower-dvina-trace-phase-5-contract.js';
import { assertLowerDvinaTracePhase6Cutover } from './lower-dvina-trace-phase-6-contract.js';
import { assertLowerDvinaTraceM1Cutover } from './lower-dvina-trace-m1-contract.js';
import { assertLowerDvinaTraceM2Cutover } from './lower-dvina-trace-m2-contract.js';
import { assertLowerDvinaTraceM3Cutover } from './lower-dvina-trace-m3-contract.js';
import { assertLowerDvinaTraceM4Cutover } from './lower-dvina-trace-m4-contract.js';
import { assertLowerDvinaTraceM5Cutover } from './lower-dvina-trace-m5-contract.js';
import { assertLowerDvinaTraceM6Cutover } from './lower-dvina-trace-m6-contract.js';

export function assertLowerDvinaTracePhase1AValidation({
  bundle,
  definitionRevision,
  fail,
  revisions,
  scenarioId
}) {
  assertPhase1ACutoverIdentity(bundle, definitionRevision, fail, revisions, scenarioId);
  assertPhase1ABindings(bundle, definitionRevision, fail, revisions, scenarioId);
}

function assertPhase1ABindings(bundle, definitionRevision, fail, revisions, scenarioId) {
  const bindings = bundle.materialization_bindings;
  if ([revisions.m16, revisions.m17, revisions.m18].includes(definitionRevision)) {
    if (bindings?.binding_set_id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v23'
      || bindings.scenario_definition_revision !== 27
      || bundle.artifact_pins?.materialization_bindings?.digest
        !== 'a7da7b435647ad62f46b90bdabca1a2eed0dd13aa81dc50f4e6e77199fc6cf3d') {
      fail('TRACE_PHASE_1A_BINDING_INVALID',
        'Revision 28–30 must reuse the exact immutable Phase 1A v23 binding.');
    }
    return;
  }
  if (definitionRevision === revisions.m14 || definitionRevision === revisions.m15) {
    const members = bindings?.first_entry_preparation?.members;
    const revision27 = definitionRevision === revisions.m15;
    if (bindings.binding_set_id
        !== `lower_dvina_trace_phase_1a_materialization_bindings_v${revision27 ? 23 : 22}`
      || bindings.scenario_definition_revision !== definitionRevision
      || !Array.isArray(members) || members.length !== 2
      || members[0]?.ordinal !== 0 || members[1]?.ordinal !== 1
      || members[1]?.binding?.destination?.location_profile_ref
        !== 'trace_ld_v1_loc_old_drying_shed') {
      fail('TRACE_PHASE_1A_BINDING_INVALID',
        'Prepared-member revisions require both exact first-entry members.');
    }
    return;
  }
  const phase3Definition = [
    revisions.phase3,
    revisions.phase3Pickup,
    revisions.phase4,
    revisions.phase5,
    revisions.phase6,
    revisions.m1,
    revisions.m2,
    revisions.m3,
    revisions.m4,
    revisions.m5,
    revisions.m6,
    revisions.m7,
    revisions.m8,
    revisions.m9
    ,revisions.m10
    ,revisions.m11
    ,revisions.m12
    ,revisions.m13
  ].includes(definitionRevision);
  const expectedBindingId = phase3Definition
    ? definitionRevision >= revisions.phase4
        ? definitionRevision >= revisions.phase5
        ? definitionRevision === revisions.m13
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v21'
        : definitionRevision === revisions.m12
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v20'
        : definitionRevision === revisions.m11
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v19'
        : definitionRevision === revisions.m10
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v18'
        : definitionRevision === revisions.m9
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v17'
        : definitionRevision === revisions.m8
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v16'
        : definitionRevision === revisions.m7
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v15'
        : definitionRevision === revisions.m6
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v14'
        : definitionRevision === revisions.m5
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v13'
          : definitionRevision === revisions.m4
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v12'
          : definitionRevision === revisions.m3
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v11'
          : definitionRevision === revisions.m2
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v10'
          : definitionRevision === revisions.m1
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v9'
          : definitionRevision === revisions.phase6
          ? 'lower_dvina_trace_phase_1a_materialization_bindings_v8'
          : 'lower_dvina_trace_phase_1a_materialization_bindings_v7'
        : 'lower_dvina_trace_phase_1a_materialization_bindings_v6'
      : definitionRevision === revisions.phase3Pickup
        ? 'lower_dvina_trace_phase_1a_materialization_bindings_v5'
        : 'lower_dvina_trace_phase_1a_materialization_bindings_v4'
    : 'lower_dvina_trace_phase_1a_materialization_bindings_v3';
  const expectedBindingDefinitionRevision =
    phase3Definition ? definitionRevision : revisions.base;
  if (bindings.binding_set_id !== expectedBindingId
    || bindings.status !== 'approved'
    || bindings.scenario_id !== scenarioId
    || bindings.scenario_definition_revision
      !== expectedBindingDefinitionRevision
    || bindings.fallback_policy !== 'forbidden'
    || bindings.normalization_policy !== 'forbidden') {
    fail('TRACE_PHASE_1A_BINDING_INVALID', 'Approved exact Phase-1A materialization bindings are required.');
  }
  const spatial = bindings.start_spatial_binding;
  const location = bundle.location_topology_set.location_profiles
    .filter((value) => value.location_profile_id === spatial?.location_profile_ref);
  const access = bundle.location_access_policies.access_policies
    .filter((value) => value.policy_id === spatial?.anchor_template?.state?.access_policy_ref);
  const capacity = bundle.location_capacity_contracts.capacity_contracts
    .filter((value) => value.contract_id === spatial?.anchor_template?.state?.capacity_contract_ref);
  const zone = capacity[0]?.zones?.filter((value) => value.zone_id === spatial?.anchor_template?.slot_key);
  const anchor = spatial?.anchor_template;
  if (location.length !== 1 || access.length !== 1 || capacity.length !== 1 || zone?.length !== 1
    || spatial.node_template_ref !== location[0].scene_template_ref
    || spatial.node_slot_ref !== location[0].location_profile_id
    || capacity[0].location_ref !== location[0].location_profile_id
    || capacity[0].decision_anchor !== anchor.slot_key
    || access[0].location_ref !== location[0].location_profile_id
    || anchor.state.zone_ref !== anchor.slot_key
    || anchor.npc_capacity !== zone[0].max_actors
    || !anchor.template_id
    || ![anchor.npc_capacity, anchor.item_capacity, anchor.container_capacity]
      .every((value) => Number.isInteger(value) && value >= 0)) {
    fail('TRACE_START_SPATIAL_BINDING_INCOMPLETE', 'Start G5 node/anchor template and capacities must resolve exactly.');
  }
  if (phase3Definition) assertLowerDvinaTracePhase3Bindings(bundle, fail);
  const dossier = bindings.player_dossier_projection;
  const playerKnowledge = bundle.knowledge_lie_memory_rules.participant_knowledge_bindings
    .filter((value) => value.participant_ref === 'player_clerk');
  const knife = bundle.item_container_set.item_templates
    .filter((value) => value.item_template_id === 'trace_ld_v1_item_mikula_knife');
  const startYear = Number(bundle.body_environment_profiles.start_timestamp_specification
    ?.calendar_date_contract?.exact_date?.year);
  const itemProjection = dossier?.inventory_item_projections?.[knife[0]?.item_template_id];
  if (playerKnowledge.length !== 1 || knife.length !== 1
    || dossier?.historical_year !== startYear
    || dossier.knowledge?.region_id !== location[0].region_ref
    || dossier.knowledge?.current_year !== startYear
    || canonicalDigest(dossier.knowledge?.initially_forbidden_categories)
      !== canonicalDigest(playerKnowledge[0].initially_forbidden_categories)
    || dossier.start_place_connection?.selected_candidate_id !== location[0].location_profile_id
    || dossier.start_place_connection?.region_id !== location[0].region_ref
    || dossier.start_place_connection?.year !== startYear
    || !dossier.start_place_connection?.reason
    || !dossier.goals?.immediate_need
    || !dossier.goals?.consequence_of_inaction
    || itemProjection?.use !== knife[0].causal_basis
    || !Array.isArray(itemProjection?.risk)
    || itemProjection.risk.length !== 0
    || !itemProjection?.condition_state
    || !itemProjection?.legal_status
    || !itemProjection?.physical_position
    || !itemProjection?.claim_state
    || !Array.isArray(dossier.property_and_access?.rules)
    || dossier.property_and_access.rules.length !== 0
    || !Array.isArray(dossier.relations)
    || dossier.relations.length !== 0
    || !Array.isArray(dossier.approved_empty_collections)
    || canonicalDigest(dossier.approved_empty_collections) !== canonicalDigest([
      'inventory_item_projections.trace_ld_v1_item_mikula_knife.risk',
      'property_and_access.rules',
      'relations'
    ])
    || dossier.audit_self_check?.pass !== true) {
    fail('TRACE_PLAYER_DOSSIER_BINDING_INCOMPLETE', 'Player dossier semantics must resolve from the approved Phase-1A binding.');
  }
}

function assertPhase1ACutoverIdentity(bundle, definitionRevision, fail, revisions, scenarioId) {
  if ([revisions.m16, revisions.m17, revisions.m18].includes(definitionRevision)) {
    const manifest = bundle.phase_1a_manifest;
    if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v23'
      || manifest.revision !== 23 || manifest.scenario_definition_revision !== 27
      || bundle.artifact_pins?.phase_1a_manifest?.digest
        !== '6c77be86edc484d291a8f944c7886b61fe41f76287d1810efb70ff8e033c7101') {
      fail('TRACE_PHASE_1A_CUTOVER_IDENTITY_INVALID',
        'Revision 28–30 must reuse the exact immutable Phase 1A v23 manifest.');
    }
    return;
  }
  if (definitionRevision === revisions.m14 || definitionRevision === revisions.m15) {
    const manifest = bundle.phase_1a_manifest;
    const revision27 = definitionRevision === revisions.m15;
    if (manifest?.package_id !== `lower_dvina_trace_phase_1a_v${revision27 ? 23 : 22}`
      || manifest.revision !== (revision27 ? 23 : 22)
      || manifest.scenario_definition_revision !== definitionRevision
      || bundle.materialization_bindings?.binding_set_id
        !== `lower_dvina_trace_phase_1a_materialization_bindings_v${revision27 ? 23 : 22}`) {
      fail('TRACE_PHASE_1A_CUTOVER_IDENTITY_INVALID',
        'Prepared-member revision requires its immutable Phase 1A cutover.');
    }
    return;
  }
  if (definitionRevision === revisions.m13) {
    const manifest = bundle.phase_1a_manifest;
    const bindings = bundle.materialization_bindings;
    const profilePin = bundle.artifact_pins?.npc_actor_step_profile;
    const profile = bundle.npc_actor_step_profile;
    const activation = bindings?.npc_actor_step_activation;
    const inheritedProfiles = [
      ['action_production_materialization', 'action_production_profile'],
      ['local_fire_materialization', 'local_fire_profile'],
      ['spatial_semantic_materialization', 'spatial_semantic_profile']
    ];
    if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v21'
      || manifest.revision !== 21 || manifest.scenario_definition_revision !== 25
      || manifest.base_definition_ref?.digest !== bundle.m13_content_manifest_digest
      || bindings?.binding_set_id !== 'lower_dvina_trace_phase_1a_materialization_bindings_v21'
      || bindings.revision !== 21 || bindings.scenario_definition_revision !== 25
      || activation?.profile_ref?.digest !== profilePin?.digest
      || activation.profile_ref.id !== profile?.profile_id
      || activation.profile_ref.revision !== profilePin?.revision
      || activation.profile_ref.schema !== profilePin?.schema
      || activation.fallback_policy !== 'forbidden'
      || !inheritedProfiles.every(([bindingKey, pinKey]) => {
        const inherited = bindings?.[bindingKey]?.profile_ref;
        const pin = bundle.artifact_pins?.[pinKey];
        const inheritedProfile = bundle[pinKey];
        return inherited?.path === pin?.path
          && inherited?.id === inheritedProfile?.profile_id
          && inherited?.revision === pin?.revision
          && inherited?.schema === pin?.schema
          && inherited?.digest === pin?.digest;
      })) {
      fail('TRACE_M13_PHASE_1A_CUTOVER_INVALID',
        'Revision 25 requires the exact inherited Phase 1A cutover.');
    }
    return;
  }
  if (definitionRevision === revisions.m12) {
    const manifest = bundle.phase_1a_manifest;
    const bindings = bundle.materialization_bindings;
    const profilePin = bundle.artifact_pins?.spatial_semantic_profile;
    const s1 = bindings?.spatial_semantic_materialization;
    if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v20'
      || manifest.revision !== 20 || manifest.scenario_definition_revision !== 24
      || manifest.base_definition_ref?.digest !== bundle.m12_content_manifest_digest
      || bindings?.binding_set_id !== 'lower_dvina_trace_phase_1a_materialization_bindings_v20'
      || bindings.revision !== 20 || bindings.scenario_definition_revision !== 24
      || s1?.profile_ref?.digest !== profilePin?.digest
      || s1.profile_ref.id !== bundle.spatial_semantic_profile?.profile_id
      || s1.profile_ref.revision !== profilePin?.revision
      || s1.profile_ref.schema !== profilePin?.schema
      || s1.authority_provisioning !== 'atomic_new_game_first_entry_p16'
      || s1.fallback_policy !== 'forbidden') {
      fail('TRACE_M12_PHASE_1A_CUTOVER_INVALID',
        'Revision 24 requires the exact first-entry Phase 1A cutover.');
    }
    return;
  }
  if (definitionRevision === revisions.m11) {
    const manifest = bundle.phase_1a_manifest;
    const bindings = bundle.materialization_bindings;
    const profilePin = bundle.artifact_pins?.spatial_semantic_profile;
    const s1 = bindings?.spatial_semantic_materialization;
    if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v19'
      || manifest.revision !== 19
      || manifest.scenario_definition_revision !== 23
      || manifest.base_definition_ref?.digest !== bundle.m11_content_manifest_digest
      || bindings?.binding_set_id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v19'
      || bindings.revision !== 19
      || bindings.scenario_definition_revision !== 23
      || s1?.profile_ref?.digest !== profilePin?.digest
      || s1.profile_ref.id !== bundle.spatial_semantic_profile?.profile_id
      || s1.profile_ref.revision !== profilePin?.revision
      || s1.profile_ref.schema !== profilePin?.schema
      || s1.authority_provisioning !== 'atomic_new_game_first_entry_p16'
      || s1.fallback_policy !== 'forbidden') {
      fail('TRACE_M11_PHASE_1A_CUTOVER_INVALID',
        'Revision 23 requires the exact S1 Phase 1A cutover.');
    }
    return;
  }
  if (definitionRevision === revisions.m10) {
    const manifest = bundle.phase_1a_manifest;
    const bindings = bundle.materialization_bindings;
    const profilePin = bundle.artifact_pins?.local_fire_profile;
    const f1 = bindings?.local_fire_materialization;
    if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v18'
      || manifest.revision !== 18
      || manifest.scenario_definition_revision !== 22
      || manifest.base_definition_ref?.digest
        !== bundle.m10_content_manifest_digest
      || bindings?.binding_set_id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v18'
      || bindings.revision !== 18
      || bindings.scenario_definition_revision !== 22
      || f1?.profile_ref?.digest !== profilePin?.digest
      || f1.profile_ref.id !== bundle.local_fire_profile?.profile_id
      || f1.profile_ref.revision !== profilePin?.revision
      || f1.profile_ref.schema !== profilePin?.schema
      || f1.input_admission !== 'current_item_owner_state'
      || f1.water_extinguish !== 'semantic_existing_whole_portion'
      || f1.fallback_policy !== 'forbidden') {
      fail('TRACE_M10_PHASE_1A_CUTOVER_INVALID',
        'Revision 22 requires the exact F1 Phase 1A cutover.');
    }
    return;
  }
  if (definitionRevision === revisions.m9) {
    const manifest = bundle.phase_1a_manifest;
    const bindings = bundle.materialization_bindings;
    const profilePin = bundle.artifact_pins?.action_production_profile;
    const a1 = bindings?.action_production_materialization;
    if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v17'
      || manifest.revision !== 17
      || manifest.scenario_definition_revision !== 21
      || manifest.base_definition_ref?.digest
        !== bundle.m9_content_manifest_digest
      || bindings?.binding_set_id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v17'
      || bindings.revision !== 17
      || bindings.scenario_definition_revision !== 21
      || a1?.profile_ref?.digest !== profilePin?.digest
      || a1.profile_ref.id !== bundle.action_production_profile?.profile_id
      || a1.profile_ref.revision !== profilePin?.revision
      || a1.profile_ref.schema !== profilePin?.schema
      || a1.authority_provisioning !== 'atomic_new_game_stage_25'
      || a1.fallback_policy !== 'forbidden') {
      fail('TRACE_M9_PHASE_1A_CUTOVER_INVALID',
        'Revision 21 requires the exact A1 Phase 1A cutover.');
    }
    return;
  }
  if (definitionRevision === revisions.m8) {
    const manifest = bundle.phase_1a_manifest;
    const bindings = bundle.materialization_bindings;
    const initialContainerPin = bundle.artifact_pins?.initial_ordinary_container;
    const profilePin = bundle.artifact_pins?.ordinary_container_contents_profile;
    const o2b = bindings?.ordinary_container_contents_materialization;
    if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v16'
      || manifest.revision !== 16
      || manifest.scenario_definition_revision !== 20
      || manifest.base_definition_ref?.path
        !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m8-content/manifest.json'
      || manifest.base_definition_ref.id !== 'lower_dvina_trace_m8_content_v1'
      || manifest.base_definition_ref.revision !== 1
      || manifest.base_definition_ref.schema
        !== 'rus.lower_dvina_trace_m8_content_manifest.v1'
      || manifest.base_definition_ref.digest !== bundle.m8_content_manifest_digest
      || bindings?.binding_set_id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v16'
      || bindings.revision !== 16
      || bindings.scenario_definition_revision !== 20
      || bindings.actor_appearance_materialization?.runtime_llm !== 'forbidden'
      || bindings.initial_equipment_materialization?.outfit_materializer
        !== 'forbidden'
      || o2b?.fallback_policy !== 'forbidden'
      || o2b.profile_ref?.digest !== profilePin?.digest
      || o2b.profile_ref?.id !== bundle.ordinary_container_contents_profile?.profile_id
      || o2b.profile_ref?.revision !== profilePin?.revision
      || o2b.profile_ref?.schema !== profilePin?.schema
      || o2b.initial_container_ref?.digest !== initialContainerPin?.digest
      || o2b.initial_container_ref?.id !== bundle.initial_ordinary_container?.container_id
      || o2b.initial_container_ref?.revision !== initialContainerPin?.revision
      || o2b.initial_container_ref?.schema !== initialContainerPin?.schema) {
      fail('TRACE_M8_PHASE_1A_CUTOVER_INVALID',
        'Revision 20 requires the exact O2b Phase 1A cutover.');
    }
    return;
  }
  if (definitionRevision === revisions.m7) {
    const manifest = bundle.phase_1a_manifest;
    const bindings = bundle.materialization_bindings;
    if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v15'
      || manifest.revision !== 15
      || manifest.scenario_definition_revision !== 19
      || bindings?.binding_set_id !== 'lower_dvina_trace_phase_1a_materialization_bindings_v15'
      || bindings.revision !== 15
      || bindings.actor_appearance_materialization?.runtime_llm !== 'forbidden'
      || bindings.initial_equipment_materialization?.owner
        !== '@rus/new-game:stage-16-item-placement'
      || bindings.initial_equipment_materialization?.outfit_materializer
        !== 'forbidden') {
      fail('TRACE_M7_PHASE_1A_CUTOVER_INVALID', 'Revision 19 requires the exact actor appearance Phase 1A cutover.');
    }
    return;
  }
  if (definitionRevision === revisions.m6) return assertLowerDvinaTraceM6Cutover(bundle, fail);
  if (definitionRevision === revisions.m5) return assertLowerDvinaTraceM5Cutover(bundle, fail);
  if (definitionRevision === revisions.m4) return assertLowerDvinaTraceM4Cutover(bundle, fail);
  if (definitionRevision === revisions.m3) return assertLowerDvinaTraceM3Cutover(bundle, fail);
  if (definitionRevision === revisions.m2) return assertLowerDvinaTraceM2Cutover(bundle, fail);
  if (definitionRevision === revisions.m1) return assertLowerDvinaTraceM1Cutover(bundle, fail);
  if (definitionRevision === revisions.phase6) return assertLowerDvinaTracePhase6Cutover(bundle, fail);
  if (definitionRevision === revisions.phase5) return assertLowerDvinaTracePhase5Cutover(bundle, fail);
  if (definitionRevision === revisions.phase3Pickup) return assertLowerDvinaTracePhase3PickupCutover(bundle, fail);
  if (definitionRevision === revisions.phase4) return assertLowerDvinaTracePhase4Cutover(bundle, fail);
  if (definitionRevision === revisions.phase3) return assertLowerDvinaTracePhase3Cutover(bundle, fail);
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const definition = bundle.definition;
  const body = bundle.body_environment_profiles;
  if (manifest.package_id !== 'lower_dvina_trace_phase_1a_v3'
    || manifest.superseded_package_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v2/manifest.json'
    || manifest.superseded_package_ref.id
      !== 'lower_dvina_trace_phase_1a_v2'
    || manifest.superseded_package_ref.revision !== 2
    || manifest.superseded_package_ref.schema
      !== 'rus.lower_dvina_trace_phase_1a_manifest.v1'
    || manifest.superseded_package_ref.digest
      !== 'c6fcf966ff9638d6649eca90fd7ec45c8252620ce02908c4354e9bd934d0f895'
    || manifest.base_definition_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v4/manifest.json'
    || manifest.base_definition_ref.package_id
      !== 'lower_dvina_trace_phase_0d_v4'
    || manifest.base_definition_ref.revision !== 4
    || manifest.base_definition_ref.digest
      !== '2a8ed0f73f1ca9b8d10cf4d962fcf16d3064839d176f6e4a29a3d73617d26d91'
    || bindings.superseded_binding_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v2/materialization-bindings.json'
    || bindings.superseded_binding_ref.id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v2'
    || bindings.superseded_binding_ref.revision !== 2
    || bindings.superseded_binding_ref.schema
      !== 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1'
    || bindings.superseded_binding_ref.digest
      !== 'c1590cdf9e52577d062501d928d11ce5a75c05805cef9a2389a51c1af776b50b'
    || definition.supersedes_definition_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v3/definition.json'
    || definition.supersedes_definition_ref.id !== scenarioId
    || definition.supersedes_definition_ref.revision !== 6
    || definition.supersedes_definition_ref.digest
      !== '3f181993af99ddd7e7d3c0292ac853e168960b99f5cc2c06aaaddd13b8db703c'
    || body.supersedes_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v3/body-environment-profiles.json'
    || body.supersedes_ref.id !== 'trace_ld_v1_body_environment_profiles'
    || body.supersedes_ref.revision !== 3
    || body.supersedes_ref.digest
      !== 'd6481bdb2b460d13a3beb37486e325a37401ce0de9aa813930308e1e96f0cd26') {
    fail(
      'TRACE_PHASE_1A_CUTOVER_IDENTITY_INVALID',
      'Phase 1A revision 7 must exact-supersede the immutable revision 6 chain.'
    );
  }
}
