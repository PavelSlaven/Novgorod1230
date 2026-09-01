import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATERIALIZER_VERSION,
  RNG_VERSION
} from '@rus/materialization';
import { materializeInitialActorEquipment } from '@rus/new-game';
import {
  materializeLowerDvinaTracePartyInstance
} from '@rus/materialization/internal/lower-dvina-trace-phase-1a';
import {
  buildLowerDvinaTracePhase1AWritePlan
} from '@rus/new-game/stages/stage-24/internal/lower-dvina-trace-phase-1a';
import {
  auditPartyDbWritePlanByCode,
  buildApprovedPipelineManifest,
  buildStage24Input,
  runStage24PartyDbWritePlan
} from '@rus/new-game/stages/stage-24';
import {
  computeStage24ArtifactDigest
} from '@rus/contracts';
import {
  buildStage25CommitInput,
  buildStage25CommitPreflight,
  materializeStage25PhysicalPlan
} from '@rus/new-game/stages/stage-25/compat';
import {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp,
  validateLowerDvinaTracePlayerDossier
} from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import {
  lowerDvinaTracePhase1ADomainPin
} from '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import { lowerDvinaTraceCanonicalG5SceneBindings } from
  '../fixtures/lower-dvina-trace-v5-world-fixture.js';
import { resolveFirstEntry } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-3-first-entry.js';

const bundle = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 24
});
const domainCatalogPin = lowerDvinaTracePhase1ADomainPin(bundle);

test('Stage 24 plan owns every Phase 1A write and Stage 25 admits the internal manifest', async () => {
  const { materialization, manifest, context, schema, stage24 } = await canonicalStage24();
  const tables = stage24.party_db_write_plan.write_batches.map((batch) => batch.target_table);
  assert.deepEqual(tables, [
    'parties',
    'party_catalog_pins',
    'party_v3_change_sets',
    'party_materialization_runs',
    'party_materialization_run_catalog_pins',
    'party_materialization_choices',
    'party_g5_nodes',
    'party_g5_anchors',
    'party_npcs',
    'party_containers',
    'party_positions',
    'party_player_characters',
    'party_actor_profile_bindings',
    'party_actor_body_states',
    'party_actor_active_conditions',
    'party_items',
    'party_item_placements',
    'party_ownership',
    'party_obligations',
    'party_clocks',
    'party_g5_sites',
    'party_scene_baselines',
    'party_g6_instances',
    'scene_position_nodes',
    'party_journey_locations',
    'preparation_snapshots',
    'preparation_snapshot_members',
    'party_route_plans',
    'party_route_plan_steps',
    'party_route_plan_executions',
    'party_route_plan_execution_events',
    'preparation_claims',
    'party_state_snapshots'
  ]);
  assert.ok(!tables.includes('party_visible_read_models'));
  assert.ok(!tables.includes('entity_placements'));
  const npcRecords = stage24.party_db_write_plan.write_batches.find(
    ({ target_table: table }) => table === 'party_npcs'
  ).records;
  const campNpcRecords = npcRecords.filter(({ semantic_state: state }) => [
    'eremey_fisher', 'background_fisher_1', 'background_fisher_2'
  ].includes(state.participant_slot_ref));
  assert.equal(campNpcRecords.length, 3);
  assert.ok(campNpcRecords.every(({ anchor_id: anchorId }) => anchorId === null));
  for (const table of ['party_g5_nodes', 'party_g5_anchors']) {
    const records = stage24.party_db_write_plan.write_batches.find(
      ({ target_table: target }) => target === table
    ).records;
    assert.equal(records.some(({ state }) =>
      state?.location_profile_ref === 'trace_ld_v1_loc_fishing_camp'
    ), false);
  }
  const sites = stage24.party_db_write_plan.write_batches.find(
    ({ target_table: table }) => table === 'party_g5_sites'
  ).records;
  assert.equal(sites.some(({ origin }) => origin === 'generated'), false);
  assert.equal(stage24.party_db_write_plan.transaction.is_atomic, true);
  assert.deepEqual(new Set(stage24.party_db_write_plan.rollback_plan.covered_batch_ids), new Set(stage24.party_db_write_plan.transaction.write_order));

  const snapshot = JSON.parse(JSON.stringify(stage24.party_db_write_plan
    .write_batches.find(({ target_table: table }) =>
      table === 'party_state_snapshots').records[0].state_payload));
  const preparedTarget = snapshot.first_entry_spatial_v3.target;
  assert.equal(preparedTarget.g5_origin, 'canonical');
  assert.deepEqual(preparedTarget.canonical_g5_ref, {
    entity_kind: 'canonical_spatial_node',
    entity_id: 'trace_ld_v1_g5_fishing_camp',
    authoring_version: '1'
  });
  assert.deepEqual(preparedTarget.dependency_pins.pins.map(({ entity_ref: ref }) =>
    `${ref.entity_kind}:${ref.entity_id}`).sort(), [
    'canonical_spatial_node:trace_ld_v1_g5_fishing_camp',
    'scene_materialization_profile:trace_ld_v1_smp_fishing_camp',
    'scene_template:trace_ld_v1_tpl_fishing_camp'
  ]);
  const member = stage24.party_db_write_plan.write_batches.find(
    ({ target_table: table }) => table === 'preparation_snapshot_members'
  ).records[0];
  assert.deepEqual(member.source_authoring_ref, {
    entity_ref: {
      entity_kind: 'scene_template', entity_id: 'trace_ld_v1_tpl_fishing_camp'
    },
    authoring_version: '1'
  });
  assert.equal('source_frontier_id' in preparedTarget, false);
  assert.equal('generation_ordinal' in preparedTarget, false);
  for (const id of [
    snapshot.first_entry_spatial_v3.preparation_snapshot_id,
    snapshot.first_entry_spatial_v3.route_plan_id,
    snapshot.first_entry_spatial_v3.route_plan_execution_id,
    snapshot.first_entry_spatial_v3.preparation_claim_id
  ]) {
    assert.ok(id.includes(materialization.party_id));
    assert.ok(id.includes(materialization.run_id));
  }
  const firstEntry = resolveFirstEntry({
    partyId: materialization.party_id, state: {
      ...snapshot,
      first_entry_preparation: {
        ...snapshot.first_entry_preparation,
        spatial_v3: snapshot.first_entry_spatial_v3
      }
    }, changeSetId: 'entry',
    scenarioRevision: 24,
    phase3Contracts: {
      route: { route_id: 'trace_ld_v1_route_wreck_to_camp' },
      sourceEndpoint: { endpoint_id: 'trace_ld_v1_ep_wreck_path_to_camp' },
      destinationEndpoint: { endpoint_id: 'trace_ld_v1_ep_camp_path_to_wreck' }
    },
    factual: { mode_resolution: {
      command_id: 'lower_dvina_trace.follow_path_to_fishing_camp'
    }, consequence: { phase3_kind: 'movement', movement: {
      route_ref: 'trace_ld_v1_route_wreck_to_camp', destination: {
        location_ref: snapshot.first_entry_preparation.binding.destination
          .location_profile_ref
      }
    } } }
  });
  assert.equal(firstEntry.approved_write_sets[0].inserts.length, 10);
  const targetSite = firstEntry.approved_write_sets[0].inserts.find(
    ({ target_table: table }) => table === 'party_g5_sites'
  ).record;
  assert.equal(targetSite.origin, 'canonical');
  assert.deepEqual(targetSite.canonical_g5_ref, preparedTarget.canonical_g5_ref);
  assert.equal(targetSite.source_frontier_id, null);
  assert.equal(targetSite.generation_ordinal, null);
  assert.equal(firstEntry.approved_write_sets[0].inserts.find(
    ({ target_table: table }) => table === 'party_scene_baselines'
  ).record.materialization_trace_id, materialization.run_id);
  const sourceG6 = stage24.party_db_write_plan.write_batches.find(
    ({ target_table: table }) => table === 'party_g6_instances'
  ).records.find(({ id }) => id === snapshot.first_entry_spatial_v3.source.g6_instance_id);
  const sourcePosition = stage24.party_db_write_plan.write_batches.find(
    ({ target_table: table }) => table === 'scene_position_nodes'
  ).records.find(({ id }) => id === snapshot.first_entry_spatial_v3.source.position_id);
  const destinationG6 = firstEntry.approved_write_sets[0].inserts.find(
    ({ target_table: table, id }) => table === 'party_g6_instances'
      && id === snapshot.first_entry_spatial_v3.target.g6_instance_id
  ).record;
  const destinationPosition = firstEntry.approved_write_sets[0].inserts.find(
    ({ target_table: table, id }) => table === 'scene_position_nodes'
      && id === snapshot.first_entry_spatial_v3.target.position_id
  ).record;
  assert.deepEqual(
    pickStaticG6(sourceG6),
    { physical_class_id: 'spatial.g6.open', primary_scene_role_id: 'open_shore', vertical_context_id: 'surface', overhead_cover_id: 'none', intra_g6_visibility_mode: 'default_clear', default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform' }
  );
  assert.deepEqual(
    pickStaticPosition(sourcePosition),
    { position_type_id: 'scene_position.water_reach', capacity: 7, access_class_id: 'trace_ld_v1_access_wreck_shore' }
  );
  assert.deepEqual(
    pickStaticG6(destinationG6),
    { physical_class_id: 'spatial.g6.open', primary_scene_role_id: 'working_camp', vertical_context_id: 'surface', overhead_cover_id: 'none', intra_g6_visibility_mode: 'default_clear', default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform' }
  );
  assert.deepEqual(
    pickStaticPosition(destinationPosition),
    { position_type_id: 'scene_position.fixed_working_reach', capacity: 7, access_class_id: 'trace_ld_v1_access_fishing_camp' }
  );

  const input = buildStage25CommitInput({
    request_id: context.request_id,
    party_creation_context: context,
    stage24_result: stage24,
    party_database_schema: schema,
    world_base_reference_snapshot: worldSnapshot(),
    approved_pipeline_manifest: manifest
  });
  const physical = materializeStage25PhysicalPlan({
    logical_plan: input.party_db_write_plan,
    party_database_schema: schema,
    world_base_reference_snapshot: worldSnapshot()
  });
  assert.equal(physical.mapping_report.batch_count, tables.length);
  assert.equal(physical.physical_write_plan.write_batches.every((batch) => batch.target_schema === 'party_runtime'), true);
  const preflight = buildStage25CommitPreflight(input, {
    idempotencyChecker() {},
    dryRunExecutor() {},
    transactionExecutor() {},
    postcommitReader() {}
  });
  assert.equal(preflight.pass, true, JSON.stringify(preflight.concerns));
});

test('revision 26 Stage 24 persists deterministic drying-shed preparation', async () => {
  const revision26 = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 26
  });
  const fixture = await stage24Fixture({ revision: 26, bundle: revision26,
    domainCatalogPin: lowerDvinaTracePhase1ADomainPin(revision26) });
  const stage24 = await runStage24PartyDbWritePlan({ input: fixture.input,
    builder: buildLowerDvinaTracePhase1AWritePlan,
    auditor: (request) => auditPartyDbWritePlanByCode({ ...request,
      stage24_input: fixture.input }) });
  const snapshot = stage24.party_db_write_plan.write_batches.find(
    ({ target_table: table }) => table === 'party_state_snapshots'
  ).records[0].state_payload;
  const shed = snapshot.first_entry_spatial_v3.members[0];
  assert.equal(shed.preparation_member_ordinal, 1);
  assert.equal(shed.route_plan_id.endsWith(':first-entry:1'), true);
  assert.equal(shed.preparation_claim_id.endsWith(':first-entry:1'), true);
  const firstEntry = resolveFirstEntry({ partyId: fixture.materialization.party_id,
    state: snapshot, changeSetId: 'change:revision26:shed',
    scenarioRevision: 26, memberOrdinal: 1,
    phase3Contracts: { route: { route_id: 'trace_ld_v1_route_camp_to_shed' },
      sourceEndpoint: { endpoint_id: 'trace_ld_v1_ep_camp_ridge_to_drying_shed' },
      destinationEndpoint: { endpoint_id: 'trace_ld_v1_ep_drying_shed_ridge_to_camp' } },
    factual: { mode_resolution: { command_id:
      snapshot.first_entry_preparation.members[1].binding.route_command_id },
    consequence: { phase3_kind: 'movement', movement: {
      route_ref: 'trace_ld_v1_route_camp_to_shed', destination: {
        location_ref: 'trace_ld_v1_loc_old_drying_shed' } } } } });
  assert.equal(firstEntry.approved_write_sets[0].inserts.length, 10);
  assert.equal(firstEntry.expected_state_versions.length, 2);
});

test('unknown table and forbidden operation fail before the transaction executor', async () => {
  const { stage24, schema } = await canonicalStage24();
  stage24.party_db_write_plan.write_batches[0].target_table = 'unknown_party_table';
  assert.throws(() => materializeStage25PhysicalPlan({
    logical_plan: stage24.party_db_write_plan,
    party_database_schema: schema,
    world_base_reference_snapshot: worldSnapshot()
  }), /Unsupported party schema adapter target/u);
  stage24.party_db_write_plan.write_batches[0].target_table = 'parties';
  stage24.party_db_write_plan.write_batches[0].operation_mode = 'delete';
  assert.throws(() => materializeStage25PhysicalPlan({
    logical_plan: stage24.party_db_write_plan,
    party_database_schema: schema,
    world_base_reference_snapshot: worldSnapshot()
  }), /Physical plan materialization failed/u);
});

test('Stage 25 internal manifest and commit mode cannot be used independently', async () => {
  const { materialization, manifest, context, schema, stage24 } = await canonicalStage24();
  const wrongMode = buildStage25CommitInput({
    request_id: context.request_id,
    party_creation_context: { ...context, commit_mode: 'player_start' },
    stage24_result: stage24,
    party_database_schema: schema,
    world_base_reference_snapshot: worldSnapshot(),
    approved_pipeline_manifest: manifest
  });
  assert.equal(buildStage25CommitPreflight(wrongMode, {}).pass, false);

  const wrongManifest = structuredClone(manifest);
  delete wrongManifest.manifest_kind;
  const mismatchedStage24 = structuredClone(stage24);
  mismatchedStage24.approved_pipeline_manifest_digest = 'sha256:invalid';
  const wrongManifestInput = buildStage25CommitInput({
    request_id: context.request_id,
    party_creation_context: context,
    stage24_result: mismatchedStage24,
    party_database_schema: schema,
    world_base_reference_snapshot: worldSnapshot(),
    approved_pipeline_manifest: wrongManifest
  });
  assert.equal(buildStage25CommitPreflight(wrongManifestInput, {}).pass, false);
});

test('canonical Stage 24 blocks stale materialization and a failed audit before Stage 25 handoff', async () => {
  const fixture = await stage24Fixture();
  for (const mutate of [
    (result) => { result.trace.result_digest = '0'.repeat(64); },
    (result) => { result.immediate.player.dossier.goals.immediate_need = 'подменённая цель'; }
  ]) {
    const artifacts = structuredClone(fixture.artifacts);
    mutate(artifacts.materialization_result);
    const input = phase1AStage24Input({
      artifacts,
      context: fixture.context,
      schema: fixture.schema
    });
    let builderCalled = false;
    await assert.rejects(
      () => runStage24PartyDbWritePlan({
        input,
        builder() {
          builderCalled = true;
          return buildLowerDvinaTracePhase1AWritePlan(input);
        },
        auditor: auditPartyDbWritePlanByCode
      }),
      (error) => error.lifecycle?.failed_gate === 'stage24_input_gate'
    );
    assert.equal(builderCalled, false);
  }

  await assert.rejects(
    () => runStage24PartyDbWritePlan({
      input: fixture.input,
      builder: buildLowerDvinaTracePhase1AWritePlan,
      auditor(request) {
        const audit = auditPartyDbWritePlanByCode({ ...request, stage24_input: fixture.input });
        audit.pass = false;
        audit.checks.commit_readiness.pass = false;
        audit.concerns = [{
          code: 'WRITE_PLAN_INPUT_BINDING_INVALID',
          severity: 'upstream_block',
          message: 'Injected independent audit rejection.',
          path: 'commit_readiness'
        }];
        audit.evidence = ['Injected negative audit fixture.'];
        audit.proposed_repair_route = 'blocked';
        audit.commit_permission = {
          can_send_to_commit_gate: false,
          can_execute_transaction: false,
          can_write_party_snapshots: false
        };
        return audit;
      }
    }),
    (error) => error.lifecycle?.failed_gate === 'stage24_semantic_audit'
  );
});

test('Stage 24 fails closed for missing, forged or world-incompatible domain pins', async () => {
  const fixture = await stage24Fixture();
  for (const [label, mutate] of [
    ['missing', (context) => { delete context.domain_catalog_pin; }],
    ['forged', (context) => { context.domain_catalog_pin.catalog_digest = '0'.repeat(64); }],
    ['world-incompatible', (context) => { context.domain_catalog_pin.compatible_world_revision_id = 'other-world'; }]
  ]) {
    const context = structuredClone(fixture.context);
    mutate(context);
    const input = phase1AStage24Input({
      artifacts: fixture.artifacts,
      context,
      schema: fixture.schema
    });
    await assert.rejects(
      () => runStage24PartyDbWritePlan({
        input,
        builder: buildLowerDvinaTracePhase1AWritePlan,
        auditor: auditPartyDbWritePlanByCode
      }),
      (error) => error.lifecycle?.failed_gate === 'stage24_input_gate',
      `${label} domain pin must fail before planning`
    );
  }
});

function createMaterialization({ revision = 24, bundle: active = bundle,
  domainCatalogPin: domainPin = domainCatalogPin } = {}) {
  return materializeInitialActorEquipment(
    materializeLowerDvinaTracePartyInstance({
    party_id: 'trace-stage24-party',
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: revision,
    scenario_manifest_digest: active.manifest_digest,
    world_revision_id: active.location_topology_set.spatial_source_ref.world_revision_id,
    world_catalog_digest: active.location_topology_set.spatial_source_ref.world_revision_catalog_digest,
    domain_catalog_pin: domainPin,
    materializer_version: MATERIALIZER_VERSION,
    rng_algorithm_id: RNG_VERSION,
    seed_context: 'stage24-seed',
    idempotency_key: 'trace-stage24-idempotency',
    trigger: 'new_game',
    occurrence: 0,
    existing_party_state: { baseline_exists: false },
    scenario_bundle: active,
    world_base_reference_snapshot: worldSnapshot(),
    resolve_timestamp: resolveLowerDvinaTraceStartTimestamp
    })
  );
}

function partyContext(materialization, domainPin = domainCatalogPin) {
  return {
    request_id: materialization.request_identity.idempotency_key,
    party_id: materialization.party_id,
    player_character_id: materialization.immediate.player.instance_id,
    schema_version: 'party_runtime_v2',
    commit_mode: 'internal_materialization',
    domain_catalog_pin: domainPin,
    idempotency_key: materialization.request_identity.idempotency_key,
    version_pins: {
      world_revision_id: materialization.request_identity.world_revision_id,
      world_catalog_digest: materialization.request_identity.world_catalog_digest,
      materializer_version: materialization.request_identity.materializer_version,
      rng_version: materialization.request_identity.rng_algorithm_id,
      command_catalog_digest: materialization.request_identity.scenario_manifest_digest,
      profile_bundle_digest: 'c'.repeat(64)
    }
  };
}

async function canonicalStage24() {
  const fixture = await stage24Fixture();
  const stage24 = await runStage24PartyDbWritePlan({
    input: fixture.input,
    builder: buildLowerDvinaTracePhase1AWritePlan,
    auditor: (request) => auditPartyDbWritePlanByCode({ ...request, stage24_input: fixture.input })
  });
  return { ...fixture, stage24, manifest: fixture.input.approved_pipeline_manifest };
}

async function stage24Fixture({ revision = 24, bundle: active = bundle,
  domainCatalogPin: domainPin = domainCatalogPin } = {}) {
  const materialization = createMaterialization({ revision, bundle: active,
    domainCatalogPin: domainPin });
  const semantic = validateLowerDvinaTracePlayerDossier(materialization, active);
  const context = partyContext(materialization, domainPin);
  const closure = {
    version: 1,
    schema: 'rus.lower_dvina_trace_sealed_selection_closure.v1',
    pass: true,
    party_id: materialization.party_id,
    materialization_result_digest: materialization.trace.result_digest,
    sealed_selections_digest: computeStage24ArtifactDigest(materialization.sealed_selections)
  };
  const artifacts = {
    scenario_definition: bundle.definition,
    materialization_result: materialization,
    player_character_audit: {
      version: 1,
      schema: 'rus.lower_dvina_trace_player_semantic_audit.v1',
      ...semantic
    },
    sealed_selection_closure: closure
  };
  const provisional = phase1AStage24Input({
    artifacts,
    context,
    schema: schemaFor([])
  });
  const schema = schemaFor(buildLowerDvinaTracePhase1AWritePlan(provisional).write_batches);
  const input = phase1AStage24Input({ artifacts, context, schema });
  return { materialization, semantic, context, artifacts, schema, input };
}

function phase1AStage24Input({ artifacts, context, schema }) {
  const manifest = buildApprovedPipelineManifest({
    request_id: context.request_id,
    artifacts,
    pipeline_profile: 'lower_dvina_trace_phase_1a_internal_materialization'
  });
  return buildStage24Input({
    request_id: context.request_id,
    pipeline_profile: 'lower_dvina_trace_phase_1a_internal_materialization',
    party_creation_context: context,
    approved_pipeline_outputs: artifacts,
    approved_pipeline_manifest: manifest,
    party_database_schema: schema,
    world_base_reference_snapshot: worldSnapshot()
  });
}

function worldSnapshot() {
  const header = { id: 'trace_ld_v1_tpl_fishing_camp', version: 1 };
  const g6 = (scene_slot_key, physical_class_id, primary_scene_role_id, overhead_cover_id) => ({ scene_slot_key, physical_class_id, primary_scene_role_id, vertical_context_id: 'surface', overhead_cover_id, intra_g6_visibility_mode: 'default_clear', default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform' });
  const edge = (edge_slot_key, from_position_slot_key, to_position_slot_key, reverse_edge_slot_key) => ({ edge_slot_key, from_position_slot_key, to_position_slot_key, reverse_edge_slot_key, passage_type_id: 'passage.local', transition_environment_profile_id: 'env.local_variable', transition_environment_profile_version: 3, movement_orientation_profile_id: 'orientation.topological_local', movement_orientation_profile_version: 2, cost_kind: 'action', action_units: 1, baseline_movement_method_id: null, movement_method_cost_profile_id: null, movement_method_cost_profile_version: null, base_minutes: null, dynamic_recheck_policy_id: null, dynamic_recheck_policy_version: null, capacity: 1, portal_template_id: null, portal_template_version: null, availability_condition_set_id: null, availability_condition_set_version: null });
  const link = (link_slot_key, from_position_slot_key, to_position_slot_key, reverse_link_slot_key) => ({ link_slot_key, from_position_slot_key, to_position_slot_key, reverse_link_slot_key, quality: 'clear', distance_band: 'near', portal_template_id: null, portal_template_version: null, condition_profile_id: null, condition_profile_version: null });
  const fishingCamp = { header, g6_slots: [g6('working_camp', 'spatial.g6.open', 'working_camp', 'none'), g6('s1_open_one_space', 'spatial.g6.semi_enclosed', 'ordinary_local', 'partial')], position_slots: [{ position_slot_key: 'working_camp', g6_scene_slot_key: 'working_camp', position_type_id: 'scene_position.fixed_working_reach', capacity: 7, access_class_id: 'trace_ld_v1_access_fishing_camp' }, { position_slot_key: 's1_open_one_space.interior', g6_scene_slot_key: 's1_open_one_space', position_type_id: 'scene_position.central', capacity: 1, access_class_id: 'default' }], movement_edges: [edge('s1_open_one_space.out', 'working_camp', 's1_open_one_space.interior', 's1_open_one_space.back'), edge('s1_open_one_space.back', 's1_open_one_space.interior', 'working_camp', 's1_open_one_space.out')], visibility_links: [link('s1_open_one_space.visible_out', 'working_camp', 's1_open_one_space.interior', 's1_open_one_space.visible_back'), link('s1_open_one_space.visible_back', 's1_open_one_space.interior', 'working_camp', 's1_open_one_space.visible_out')] };
  const wreckShore = structuredClone(fishingCamp);
  wreckShore.header = { id: 'trace_ld_v1_tpl_wreck_shore', version: 1 };
  wreckShore.g6_slots = [g6('open_shore', 'spatial.g6.open', 'open_shore', 'none')];
  wreckShore.position_slots = [{ position_slot_key: 'open_shore', g6_scene_slot_key: 'open_shore', position_type_id: 'scene_position.water_reach', capacity: 7, access_class_id: 'trace_ld_v1_access_wreck_shore' }];
  wreckShore.movement_edges = [];
  wreckShore.visibility_links = [];
  const dryingShed = structuredClone(fishingCamp);
  dryingShed.header = { id: 'trace_ld_v1_tpl_old_drying_shed', version: 1 };
  dryingShed.g6_slots = [g6('shed_approach', 'spatial.g6.semi_enclosed', 'shed_approach', 'partial'),
    g6('s1_enclosed_space', 'spatial.g6.enclosed', 'ordinary_local', 'full')];
  dryingShed.position_slots = [{ position_slot_key: 'shed_approach',
    g6_scene_slot_key: 'shed_approach', position_type_id: 'scene_position.approach',
    capacity: 7, access_class_id: 'trace_ld_v1_access_old_drying_shed' },
  { position_slot_key: 's1_enclosed_space.interior',
    g6_scene_slot_key: 's1_enclosed_space', position_type_id: 'scene_position.central',
    capacity: 5, access_class_id: 'trace_ld_v1_access_old_drying_shed' }];
  dryingShed.movement_edges = [edge('s1_enclosed_space.out', 'shed_approach',
    's1_enclosed_space.interior', 's1_enclosed_space.back'), edge(
    's1_enclosed_space.back', 's1_enclosed_space.interior', 'shed_approach',
    's1_enclosed_space.out')];
  dryingShed.visibility_links = [link('s1_enclosed_space.visible_out',
    'shed_approach', 's1_enclosed_space.interior', 's1_enclosed_space.visible_back'),
  link('s1_enclosed_space.visible_back', 's1_enclosed_space.interior',
    'shed_approach', 's1_enclosed_space.visible_out')];
  return {
    version: 1,
    schema: 'world_base_reference_snapshot',
    readonly_checksum: 'world-checksum',
    allowed_region_ids: [],
    allowed_graph_node_ids: [],
    allowed_graph_edge_ids: [],
    allowed_place_template_ids: [],
    allowed_npc_candidate_ids: [],
    allowed_item_profile_ids: [],
    allowed_container_profile_ids: [],
    allowed_property_rule_ids: [],
    allowed_source_ids: [],
    scene_template_closures: [wreckShore, fishingCamp, dryingShed],
    canonical_g5_scene_bindings: lowerDvinaTraceCanonicalG5SceneBindings
  };
}

function pickStaticG6(record) {
  const { physical_class_id, primary_scene_role_id, vertical_context_id,
    overhead_cover_id, intra_g6_visibility_mode,
    default_visibility_distance_band, acoustic_uniformity } = record;
  return { physical_class_id, primary_scene_role_id, vertical_context_id,
    overhead_cover_id, intra_g6_visibility_mode,
    default_visibility_distance_band, acoustic_uniformity };
}

function pickStaticPosition(record) {
  const { position_type_id, capacity, access_class_id } = record;
  return { position_type_id, capacity, access_class_id };
}

function schemaFor(batches) {
  const tables = batches.map((batch) => ({
    name: batch.target_table,
    allowed_operations: ['insert_only'],
    columns: [...new Set(batch.records.flatMap((record) => Object.keys(record)))].map((name) => ({
      name,
      data_type: inferType(batch.records.find((record) => record[name] != null)?.[name]),
      nullable: true
    }))
  }));
  if (tables.length === 0) tables.push({ name: 'placeholder', allowed_operations: ['insert_only'], columns: [{ name: 'id', data_type: 'TEXT', nullable: true }] });
  return {
    version: 1,
    schema: 'party_database_schema_snapshot',
    schema_version: 'party_runtime_v2',
    readonly_checksum: 'phase-1a-schema-checksum',
    tables,
    columns: [],
    foreign_keys: [],
    unique_constraints: [],
    check_constraints: [],
    enum_definitions: [],
    indexes: [],
    allowed_operations: ['insert_only']
  };
}

function inferType(value) {
  if (typeof value === 'number') return 'NUMERIC';
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (value && typeof value === 'object') return 'JSONB';
  return 'TEXT';
}
