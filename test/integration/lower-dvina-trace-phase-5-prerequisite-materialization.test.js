import assert from 'node:assert/strict';
import test from 'node:test';
import { MATERIALIZER_VERSION, RNG_VERSION } from '@rus/materialization';
import {
  calculateHandsState,
  calculateInventoryMass,
  resolveInventoryAccess
} from '@rus/items-property';
import { materializeLowerDvinaTracePartyInstance } from
  '@rus/materialization/internal/lower-dvina-trace-phase-1a';
import { buildLowerDvinaTracePhase1AWritePlan } from
  '@rus/new-game/stages/stage-24/internal/lower-dvina-trace-phase-1a';
import {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp
} from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import { lowerDvinaTracePhase1ADomainPin } from
  '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';

const bundle = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 11
});
const domainCatalogPin = lowerDvinaTracePhase1ADomainPin(bundle);

function request(overrides = {}) {
  return {
    party_id: 'trace-phase-5-prerequisite-party',
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: 11,
    scenario_manifest_digest: bundle.manifest_digest,
    world_revision_id:
      bundle.location_topology_set.spatial_source_ref.world_revision_id,
    world_catalog_digest:
      bundle.location_topology_set.spatial_source_ref
        .world_revision_catalog_digest,
    domain_catalog_pin: domainCatalogPin,
    materializer_version: MATERIALIZER_VERSION,
    rng_algorithm_id: RNG_VERSION,
    seed_context: 'lower_dvina_trace_phase_1a_mikula_v1',
    idempotency_key: 'trace-phase-5-prerequisite-idempotency',
    trigger: 'new_game',
    occurrence: 0,
    existing_party_state: { baseline_exists: false },
    scenario_bundle: bundle,
    resolve_timestamp: resolveLowerDvinaTraceStartTimestamp,
    ...overrides
  };
}

test('revision 11 materializes one exact bandage on Eremey', () => {
  const result = materializeLowerDvinaTracePartyInstance(request());
  const eremey = result.immediate.npcs.find(
    ({ participant_slot_ref: ref }) => ref === 'eremey_fisher'
  );
  const bandages = result.immediate.items.filter(
    ({ template_id: id }) => id === 'trace_ld_v1_item_bandage_cloth'
  );
  assert.equal(bandages.length, 1);
  const bandage = bandages[0];
  assert.equal(bandage.owner_npc_id, eremey.instance_id);
  assert.equal(bandage.holder_npc_id, eremey.instance_id);
  assert.equal(bandage.controller_npc_id, eremey.instance_id);
  assert.equal(bandage.physical_position, 'worn_quick');
  assert.equal(bandage.condition_state, 'clean_serviceable');
  assert.equal(bandage.state.accessibility, 'quick');
  assert.equal(bandage.state.inventory_profile_snapshot.mass_grams, 100);
  assert.equal(
    bandage.state.inventory_profile_snapshot.external_hand_cost,
    0
  );
  const inventory = inventoryInput(result, eremey.instance_id);
  assert.equal(calculateInventoryMass(inventory).total_mass_grams, 100);
  assert.equal(calculateHandsState(inventory).hands_used, 0);
  assert.equal(resolveInventoryAccess({
    ...inventory, item_id: bandage.instance_id
  }).access.tier, 'quick');
});

test('revision 11 Stage 24 persists the exact bandage identity once', () => {
  const result = materializeLowerDvinaTracePartyInstance(request());
  const creation = request();
  const plan = buildLowerDvinaTracePhase1AWritePlan({
    request_id: 'phase-5-stage-24',
    party_creation_context: {
      party_id: result.party_id,
      player_character_id: result.immediate.player.instance_id,
      schema_version: 'party_runtime_v2',
      commit_mode: 'internal_materialization',
      domain_catalog_pin: domainCatalogPin,
      idempotency_key: creation.idempotency_key,
      version_pins: {
        world_revision_id: result.request_identity.world_revision_id,
        world_catalog_digest: result.request_identity.world_catalog_digest,
        materializer_version: result.request_identity.materializer_version,
        rng_version: result.request_identity.rng_algorithm_id,
        command_catalog_digest: result.request_identity.scenario_manifest_digest,
        profile_bundle_digest: 'd'.repeat(64)
      }
    },
    approved_pipeline_outputs: {
      materialization_result: result,
      player_character_audit: { pass: true },
      sealed_selection_closure: { pass: true }
    },
    party_db_write_plan_input_digest: 'phase-5-stage-24-input',
    party_database_schema_digest: 'phase-5-schema',
    world_base_reference_digest: 'phase-5-world',
    approved_pipeline_manifest_digest: 'phase-5-manifest'
  });
  const batch = (name) => plan.write_batches.find(
    ({ target_table: table }) => table === name
  )?.records ?? [];
  const items = batch('party_items').filter(
    ({ template_id: id }) => id === 'trace_ld_v1_item_bandage_cloth'
  );
  assert.equal(items.length, 1);
  const placement = batch('party_item_placements').find(
    ({ item_id: id }) => id === items[0].item_id
  );
  const ownership = batch('party_ownership').find(
    ({ item_id: id }) => id === items[0].item_id
  );
  assert.equal(placement.physical_position, 'worn_quick');
  assert.ok(placement.holder_npc_id);
  assert.equal(ownership.owner_npc_id, placement.holder_npc_id);
  assert.equal(ownership.controller_npc_id, placement.holder_npc_id);
});

test('revision 11 fails closed without the exact bandage binding', () => {
  const mutated = structuredClone(bundle);
  delete mutated.materialization_bindings.phase_5_initial_state_binding
    .bandage_cloth_initial_binding.physical_position;
  assert.throws(() => materializeLowerDvinaTracePartyInstance(request({
    scenario_bundle: mutated
  })), { code: 'TRACE_SCENARIO_ARTIFACT_INVALID' });
});

function inventoryInput(result, actorId) {
  return {
    party_id: result.party_id,
    actor_id: actorId,
    items: result.immediate.items.map((item) => ({
      item_id: item.instance_id,
      template_id: item.template_id,
      profile_id: item.profile_id,
      quantity: item.quantity
    })),
    item_profiles: result.immediate.items.map((item) => ({
      ...structuredClone(item.state.inventory_profile_snapshot),
      template_id: item.template_id
    })),
    item_placements: result.immediate.items.map((item) => ({
      party_id: result.party_id,
      item_id: item.instance_id,
      holder_character_id: item.holder_npc_id ?? item.holder_character_id,
      physical_position: item.physical_position
    })),
    containers: [],
    container_profiles: [],
    container_placements: [],
    container_relations: [],
    hands_total: 2
  };
}
