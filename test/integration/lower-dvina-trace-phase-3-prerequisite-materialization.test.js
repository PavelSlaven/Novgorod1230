import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MATERIALIZER_VERSION,
  RNG_VERSION
} from '@rus/materialization';
import {
  materializeLowerDvinaTracePartyInstance
} from '@rus/materialization/internal/lower-dvina-trace-phase-1a';
import {
  buildLowerDvinaTracePhase1AWritePlan
} from '@rus/new-game/stages/stage-24/internal/lower-dvina-trace-phase-1a';
import {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp
} from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import {
  lowerDvinaTracePhase1ADomainPin
} from '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';

const bundle = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 8
});
const domainCatalogPin = lowerDvinaTracePhase1ADomainPin(bundle);

function request(overrides = {}) {
  return {
    party_id: 'trace-phase-3-prerequisite-party',
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: 8,
    scenario_manifest_digest: bundle.manifest_digest,
    world_revision_id: bundle.location_topology_set.spatial_source_ref.world_revision_id,
    world_catalog_digest:
      bundle.location_topology_set.spatial_source_ref.world_revision_catalog_digest,
    domain_catalog_pin: domainCatalogPin,
    materializer_version: MATERIALIZER_VERSION,
    rng_algorithm_id: RNG_VERSION,
    seed_context: 'lower_dvina_trace_phase_1a_mikula_v1',
    idempotency_key: 'trace-phase-3-prerequisite-idempotency',
    trigger: 'new_game',
    occurrence: 0,
    existing_party_state: { baseline_exists: false },
    scenario_bundle: bundle,
    resolve_timestamp: resolveLowerDvinaTraceStartTimestamp,
    ...overrides
  };
}

test('revision 8 deterministically prepares the camp and three distinct NPC instances', () => {
  const left = materializeLowerDvinaTracePartyInstance(request());
  const right = materializeLowerDvinaTracePartyInstance(request());
  assert.deepEqual(left, right);
  assert.equal(left.immediate.spatial.position.g5_anchor_id, left.immediate.spatial.anchor.instance_id);
  assert.equal(left.immediate.prepared_scenes.length, 1);
  assert.equal(left.immediate.prepared_scenes[0].location_profile_ref, 'trace_ld_v1_loc_fishing_camp');
  assert.equal(
    left.immediate.prepared_scenes[0].node.parent_g4_id,
    'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_river_approach'
  );
  assert.equal(left.immediate.prepared_scenes[0].anchor.slot_key, 'working_camp');
  assert.equal(left.immediate.npcs.length, 3);
  assert.equal(new Set(left.immediate.npcs.map((value) => value.instance_id)).size, 3);
  assert.equal(
    left.immediate.npcs.every(
      (value) => value.anchor_id === left.immediate.prepared_scenes[0].anchor.instance_id
    ),
    true
  );
  assert.deepEqual(
    left.immediate.npcs.map((value) => value.profile_level).sort(),
    ['background', 'background', 'scene']
  );
  assert.equal(
    left.immediate.npcs.some((value) => value.participant_slot_ref === 'player_clerk'),
    false
  );
});

test('revision 8 Stage 24 plan atomically persists the prepared camp and NPC placements', () => {
  const materialization = materializeLowerDvinaTracePartyInstance(request());
  const context = {
    request_id: materialization.request_identity.idempotency_key,
    party_id: materialization.party_id,
    player_character_id: materialization.immediate.player.instance_id,
    schema_version: 'party_runtime_v2',
    commit_mode: 'internal_materialization',
    domain_catalog_pin: domainCatalogPin,
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
  const plan = buildLowerDvinaTracePhase1AWritePlan({
    request_id: context.request_id,
    party_creation_context: context,
    party_db_write_plan_input_digest: 'phase-3-stage-24-input',
    party_database_schema_digest: 'phase-3-schema',
    world_base_reference_digest: 'phase-3-world',
    approved_pipeline_manifest_digest: 'phase-3-manifest',
    approved_pipeline_outputs: {
      materialization_result: materialization,
      player_character_audit: { pass: true },
      sealed_selection_closure: { pass: true }
    }
  });
  const records = Object.fromEntries(
    plan.write_batches.map((batch) => [batch.target_table, batch.records])
  );
  assert.equal(records.party_g5_nodes.length, 2);
  assert.equal(records.party_g5_anchors.length, 2);
  assert.equal(records.party_npcs.length, 3);
  assert.equal(records.party_actor_profile_bindings.length, 4);
  assert.equal(
    records.party_npcs.every(
      (value) => value.anchor_id === materialization.immediate.prepared_scenes[0].anchor.instance_id
    ),
    true
  );
  const snapshot = records.party_state_snapshots[0].state_payload;
  assert.equal(snapshot.persisted_projection.spatial.prepared_scenes.length, 1);
  assert.equal(snapshot.persisted_projection.npcs.length, 3);
});

test('historical revision 7 remains available without prepared camp materialization', async () => {
  const historical = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 7
  });
  assert.equal(historical.definition_revision, 7);
  assert.equal(historical.materialization_bindings.revision, 3);
});
