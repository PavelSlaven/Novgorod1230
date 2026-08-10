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
  const phase3Definition = [
    revisions.phase3,
    revisions.phase3Pickup,
    revisions.phase4,
    revisions.phase5,
    revisions.phase6,
    revisions.m1,
    revisions.m2,
    revisions.m3
  ].includes(definitionRevision);
  const expectedBindingId = phase3Definition
    ? definitionRevision >= revisions.phase4
      ? definitionRevision >= revisions.phase5
        ? definitionRevision === revisions.m3
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
