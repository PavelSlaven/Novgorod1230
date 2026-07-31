import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MATERIALIZER_VERSION,
  RNG_VERSION
} from '@rus/materialization';
import {
  calculateHandsState,
  calculateInventoryMass,
  resolveInventoryAccess
} from '@rus/items-property';
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
import {
  resolveTracePhase4Contracts
} from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-4-contracts.js';

const bundle = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 10
});
const domainCatalogPin = lowerDvinaTracePhase1ADomainPin(bundle);

function request(overrides = {}) {
  return {
    party_id: 'trace-phase-4-prerequisite-party',
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: 10,
    scenario_manifest_digest: bundle.manifest_digest,
    world_revision_id:
      bundle.location_topology_set.spatial_source_ref.world_revision_id,
    world_catalog_digest:
      bundle.location_topology_set.spatial_source_ref.world_revision_catalog_digest,
    domain_catalog_pin: domainCatalogPin,
    materializer_version: MATERIALIZER_VERSION,
    rng_algorithm_id: RNG_VERSION,
    seed_context: 'lower_dvina_trace_phase_1a_mikula_v1',
    idempotency_key: 'trace-phase-4-prerequisite-idempotency',
    trigger: 'new_game',
    occurrence: 0,
    existing_party_state: { baseline_exists: false },
    scenario_bundle: bundle,
    resolve_timestamp: resolveLowerDvinaTraceStartTimestamp,
    ...overrides
  };
}

test('revision 10 deterministically prepares the shed, Onisim, Ratsha, knife and promise', () => {
  const left = materializeLowerDvinaTracePartyInstance(request());
  const right = materializeLowerDvinaTracePartyInstance(request());
  assert.deepEqual(left, right);

  const shed = left.immediate.prepared_scenes.find(
    (value) => value.location_profile_ref === 'trace_ld_v1_loc_old_drying_shed'
  );
  assert.ok(shed);
  assert.equal(shed.anchor.slot_key, 'shed_approach');
  assert.equal(shed.entry_route_ref, 'trace_ld_v1_route_camp_to_shed');
  assert.equal(shed.entry_endpoint_ref, 'trace_ld_v1_ep_drying_shed_ridge_to_camp');

  const onisim = left.immediate.npcs.find(
    (value) => value.participant_slot_ref === 'onisim_boatman'
  );
  const ratsha = left.immediate.npcs.find(
    (value) => value.participant_slot_ref === 'ratsha_storehouse_helper'
  );
  assert.ok(onisim?.instance_id);
  assert.ok(ratsha?.instance_id);
  assert.equal(onisim.anchor_id, shed.anchor.instance_id);
  assert.equal(ratsha.anchor_id, shed.anchor.instance_id);
  assert.deepEqual(onisim.machine_state.body_condition, {
    condition_profile_ref: 'trace_ld_v1_condition_onisim_injury',
    state: 'injured_unable_to_walk'
  });
  assert.equal(onisim.machine_state.binding_item.holder_npc_id, onisim.instance_id);
  assert.equal(onisim.machine_state.binding_item.controller_npc_id, ratsha.instance_id);

  const knife = left.immediate.items.find(
    (value) => value.template_id === 'trace_ld_v1_item_ratsha_knife'
  );
  assert.ok(knife?.instance_id);
  assert.equal(knife.owner_npc_id, ratsha.instance_id);
  assert.equal(knife.holder_npc_id, ratsha.instance_id);
  assert.equal(knife.controller_npc_id, ratsha.instance_id);
  assert.equal(knife.physical_position, 'worn_quick');
  assert.equal(knife.state.accessibility, 'quick');
  assert.deepEqual(
    {
      mass_grams: knife.state.inventory_profile_snapshot.mass_grams,
      carry_form: knife.state.inventory_profile_snapshot.carry_form,
      external_hand_cost: knife.state.inventory_profile_snapshot.external_hand_cost
    },
    { mass_grams: 400, carry_form: 'compact', external_hand_cost: 0 }
  );
  const inventory = {
    party_id: left.party_id,
    actor_id: ratsha.instance_id,
    items: [{
      item_id: knife.instance_id,
      template_id: knife.template_id,
      quantity: knife.quantity
    }],
    item_profiles: [{
      ...knife.state.inventory_profile_snapshot,
      template_id: knife.template_id
    }],
    item_placements: [{
      party_id: left.party_id,
      item_id: knife.instance_id,
      holder_character_id: ratsha.instance_id,
      physical_position: knife.physical_position
    }],
    containers: [],
    container_placements: [],
    container_profiles: []
  };
  assert.equal(calculateInventoryMass(inventory).total_mass_grams, 400);
  assert.equal(calculateHandsState(inventory).hands_used, 0);
  assert.equal(
    resolveInventoryAccess({
      ...inventory,
      item_id: knife.instance_id
    }).access.tier,
    'quick'
  );

  const promise = left.immediate.promise_instances[0];
  const eremey = left.immediate.npcs.find(
    (value) => value.participant_slot_ref === 'eremey_fisher'
  );
  const selectedFisherId = promise.witness_slot_bindings
    .trace_ld_v1_audience_slot_participating_fisher;
  assert.equal(left.immediate.promise_instances.length, 1);
  assert.equal(promise.current_state, 'not_offered');
  assert.equal(promise.current_state_fact, 'promise_current_not_offered');
  assert.equal(promise.beneficiary_actor_id, ratsha.instance_id);
  assert.deepEqual(promise.witness_actor_ids, [eremey.instance_id, selectedFisherId]);
});

test('revision 10 fails closed when Ratsha knife exact placement is absent', () => {
  const changed = structuredClone(bundle);
  delete changed.materialization_bindings.phase_4_initial_state_binding
    .ratsha_knife_initial_binding.physical_position;
  assert.throws(
    () => materializeLowerDvinaTracePartyInstance(request({
      scenario_bundle: changed
    })),
    (error) => error.name === 'MaterializationError'
      && typeof error.code === 'string'
      && error.code.length > 0
  );
});

test('revision 10 runtime requires the exact sealed participating-fisher witness', () => {
  const materialization = materializeLowerDvinaTracePartyInstance(request());
  const runtimeState = {
    ...structuredClone(materialization.immediate),
    sealed_selections: structuredClone(materialization.sealed_selections)
  };
  assert.doesNotThrow(() => resolveTracePhase4Contracts({
    state: runtimeState,
    bundle
  }));

  const selected = runtimeState.sealed_selections.find(
    ({ selection_kind: kind }) => kind === 'audience'
  ).records[0].selected_id;
  const substituted = structuredClone(runtimeState);
  substituted.sealed_selections.find(
    ({ selection_kind: kind }) => kind === 'audience'
  ).records[0].selected_id = selected === 'background_fisher_1'
    ? 'background_fisher_2'
    : 'background_fisher_1';
  assert.throws(
    () => resolveTracePhase4Contracts({ state: substituted, bundle }),
    { code: 'TRACE_PHASE_4_AUDIENCE_BINDING_INVALID' }
  );

  const rebound = structuredClone(runtimeState);
  rebound.promise_instances[0].witness_slot_bindings
    .trace_ld_v1_audience_slot_participating_fisher = 'another-fisher';
  assert.throws(
    () => resolveTracePhase4Contracts({ state: rebound, bundle }),
    { code: 'TRACE_PHASE_4_AUDIENCE_BINDING_INVALID' }
  );

  const missingReverse = structuredClone(bundle);
  missingReverse.movement_bindings.route_bindings.find(
    ({ route_id: id }) => id === 'trace_ld_v1_route_camp_to_shed'
  ).reverse_route_ref = 'unknown_reverse_route';
  assert.throws(
    () => resolveTracePhase4Contracts({ state: runtimeState,
      bundle: missingReverse }),
    { code: 'TRACE_PHASE_4_RECORD_GAP' }
  );

  const nonReciprocal = structuredClone(bundle);
  nonReciprocal.movement_bindings.route_bindings.find(
    ({ route_id: id }) => id === 'trace_ld_v1_route_shed_to_camp'
  ).reverse_route_ref = 'another_forward_route';
  assert.throws(
    () => resolveTracePhase4Contracts({ state: runtimeState,
      bundle: nonReciprocal }),
    { code: 'TRACE_PHASE_4_APPROVED_CHAIN_INVALID' }
  );
});

test('revision 10 Stage 24 persists one exact promise and NPC-held Ratsha knife', () => {
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
      profile_bundle_digest: 'd'.repeat(64)
    }
  };
  const plan = buildLowerDvinaTracePhase1AWritePlan({
    request_id: context.request_id,
    party_creation_context: context,
    party_db_write_plan_input_digest: 'phase-4-stage-24-input',
    party_database_schema_digest: 'phase-4-schema',
    world_base_reference_digest: 'phase-4-world',
    approved_pipeline_manifest_digest: 'phase-4-manifest',
    approved_pipeline_outputs: {
      materialization_result: materialization,
      player_character_audit: { pass: true },
      sealed_selection_closure: { pass: true }
    }
  });
  const records = Object.fromEntries(
    plan.write_batches.map((batch) => [batch.target_table, batch.records])
  );
  const ratsha = materialization.immediate.npcs.find(
    (value) => value.participant_slot_ref === 'ratsha_storehouse_helper'
  );
  const knife = materialization.immediate.items.find(
    (value) => value.template_id === 'trace_ld_v1_item_ratsha_knife'
  );
  assert.equal(records.party_obligations.length, 1);
  assert.equal(records.party_obligations[0].current_state, 'not_offered');
  assert.equal(records.party_items.filter((value) => value.item_id === knife.instance_id).length, 1);
  const placement = records.party_item_placements.find(
    (value) => value.item_id === knife.instance_id
  );
  assert.equal(placement.party_id, materialization.party_id);
  assert.equal(placement.holder_npc_id, ratsha.instance_id);
  assert.equal(placement.holder_character_id, null);
  assert.equal(placement.physical_position, 'worn_quick');
});
