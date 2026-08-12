import assert from 'node:assert/strict';
import test from 'node:test';
import { MATERIALIZER_VERSION, RNG_VERSION } from '@rus/materialization';
import { deterministicInstanceId } from
  '../../packages/materialization/src/core.js';
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
const bundle12 = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 12
});
const bundle13 = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 13
});
const bundle14 = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 14
});
const bundle15 = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 15
});
const bundle16 = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 16
});
const bundle17 = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 17
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

test('revision 12 preserves the revision 11 prepared NPCs and Phase 5 items', () => {
  const revision11 = materializeLowerDvinaTracePartyInstance(request());
  const revision12 = materializeLowerDvinaTracePartyInstance(request({
    scenario_definition_revision: 12,
    scenario_manifest_digest: bundle12.manifest_digest,
    scenario_bundle: bundle12,
    domain_catalog_pin: lowerDvinaTracePhase1ADomainPin(bundle12)
  }));
  assert.deepEqual(
    revision12.immediate.npcs.map(({ participant_slot_ref }) => participant_slot_ref).sort(),
    revision11.immediate.npcs.map(({ participant_slot_ref }) => participant_slot_ref).sort()
  );
  for (const templateId of [
    'trace_ld_v1_item_ratsha_knife',
    'trace_ld_v1_item_bandage_cloth'
  ]) {
    const revision11Item = revision11.immediate.items.find(
      ({ template_id }) => template_id === templateId
    );
    const revision12Item = revision12.immediate.items.find(
      ({ template_id }) => template_id === templateId
    );
    assert.ok(revision11Item);
    assert.ok(revision12Item);
    assert.deepEqual(
      stripInstanceIdentity(revision12Item),
      stripInstanceIdentity(revision11Item)
    );
  }
  const onisim = revision12.immediate.npcs.find(
    ({ participant_slot_ref }) => participant_slot_ref === 'onisim_boatman'
  );
  const rope = onisim.machine_state.binding_item;
  const expectedItemId = deterministicInstanceId(
    revision12.party_id,
    revision12.run_id,
    'item',
    'trace_ld_v1_item_ratsha_binding_rope',
    0
  );
  assert.deepEqual({
    reserved_instance_id: rope.reserved_instance_id,
    run_id: rope.run_id,
    template_id: rope.template_id,
    category_id: rope.category_id,
    profile_id: rope.profile_id,
    legal_status: rope.legal_status,
    owner_ref: rope.owner_ref,
    inventory_profile_snapshot: rope.inventory_profile_snapshot
  }, {
    reserved_instance_id: expectedItemId,
    run_id: revision12.run_id,
    template_id: 'trace_ld_v1_item_ratsha_binding_rope',
    category_id: 'utility_rope',
    profile_id: 'trace_ld_v1_inventory_profile_ratsha_binding_rope',
    legal_status: 'unowned',
    owner_ref: null,
    inventory_profile_snapshot: {
      inventory_profile_id: 'trace_ld_v1_inventory_profile_ratsha_binding_rope',
      item_template_ref: 'trace_ld_v1_item_ratsha_binding_rope',
      mass_grams: 1200,
      carry_form: 'long',
      external_hand_cost: 1,
      status: 'approved'
    }
  });
  assert.equal(
    revision11.immediate.npcs.find(
      ({ participant_slot_ref }) => participant_slot_ref === 'onisim_boatman'
    ).machine_state.binding_item.reserved_instance_id,
    undefined
  );
  assert.equal(
    revision12.immediate.items.some(
      ({ template_id }) => template_id === 'trace_ld_v1_item_ratsha_binding_rope'
    ),
    false
  );
  const plan = stage24Plan(revision12, request({
    scenario_definition_revision: 12,
    scenario_manifest_digest: bundle12.manifest_digest,
    scenario_bundle: bundle12,
    domain_catalog_pin: lowerDvinaTracePhase1ADomainPin(bundle12)
  }), lowerDvinaTracePhase1ADomainPin(bundle12));
  assert.equal(
    plan.write_batches.find(({ target_table }) => target_table === 'party_npcs')
      ?.records.length,
    5
  );
});

test('revisions 13 and 14 persist every NPC referenced by held items', () => {
  for (const [revision, scenarioBundle] of [
    [13, bundle13],
    [14, bundle14]
  ]) {
    const pin = lowerDvinaTracePhase1ADomainPin(scenarioBundle);
    const creation = request({
      scenario_definition_revision: revision,
      scenario_manifest_digest: scenarioBundle.manifest_digest,
      scenario_bundle: scenarioBundle,
      domain_catalog_pin: pin,
      idempotency_key: `trace-phase-${revision}-prerequisite-idempotency`
    });
    const result = materializeLowerDvinaTracePartyInstance(creation);
    const plan = stage24Plan(result, creation, pin);
    const npcBatch = plan.write_batches.find(
      ({ target_table: targetTable }) => targetTable === 'party_npcs'
    );
    const placementBatch = plan.write_batches.find(
      ({ target_table: targetTable }) => targetTable === 'party_item_placements'
    );
    const batch = (table) => plan.write_batches.find(
      ({ target_table: targetTable }) => targetTable === table
    )?.records ?? [];
    const npcIds = new Set(batch('party_npcs').map(({ npc_id: npcId }) => npcId));
    const holderIds = batch('party_item_placements')
      .map(({ holder_npc_id: holderNpcId }) => holderNpcId)
      .filter(Boolean);

    assert.equal(npcIds.size, 5, `revision ${revision}`);
    assert.ok(holderIds.length > 0, `revision ${revision}`);
    assert.ok(npcBatch.order < placementBatch.order, `revision ${revision}`);
    assert.ok(
      placementBatch.depends_on_batches.includes(npcBatch.batch_id),
      `revision ${revision}`
    );
    for (const holderId of holderIds) {
      assert.equal(npcIds.has(holderId), true, `revision ${revision}: ${holderId}`);
    }
  }
});

test('revision 15 materializes and persists the approved Zhdanko storehouse road bag', () => {
  const pin = lowerDvinaTracePhase1ADomainPin(bundle15);
  const creation = request({
    scenario_definition_revision: 15,
    scenario_manifest_digest: bundle15.manifest_digest,
    scenario_bundle: bundle15,
    domain_catalog_pin: pin,
    idempotency_key: 'trace-phase-15-prerequisite-idempotency'
  });
  const result = materializeLowerDvinaTracePartyInstance(creation);
  const zhdanko = result.immediate.npcs.find(
    ({ participant_slot_ref }) => participant_slot_ref === 'zhdanko_storehouse_controller'
  );
  const bag = result.immediate.containers.find(
    ({ template_id }) => template_id === 'trace_ld_v1_container_road_bag'
  );
  assert.equal(result.immediate.prepared_scenes.length, 3);
  assert.equal(result.immediate.npcs.length, 6);
  assert.ok(zhdanko);
  assert.equal(bag.holder_npc_id, zhdanko.instance_id);
  assert.deepEqual(bag.state.exact_content_item_refs, [
    'trace_ld_v1_item_sealed_packet',
    'trace_ld_v1_item_wet_cloak',
    'trace_ld_v1_item_writing_tablet'
  ]);
  const plan = stage24Plan(result, creation, pin);
  const rows = plan.write_batches.find(
    ({ target_table }) => target_table === 'party_containers'
  ).records;
  assert.deepEqual(rows.map(({ template_id, holder_npc_id, closure_state }) => ({
    template_id, holder_npc_id, closure_state
  })), [{
    template_id: 'trace_ld_v1_container_road_bag',
    holder_npc_id: zhdanko.instance_id,
    closure_state: 'tied'
  }]);
});

test('revision 16 persists every NPC referenced by its initial held resources', () => {
  const pin = lowerDvinaTracePhase1ADomainPin(bundle16);
  const creation = request({
    scenario_definition_revision: 16,
    scenario_manifest_digest: bundle16.manifest_digest,
    scenario_bundle: bundle16,
    domain_catalog_pin: pin,
    idempotency_key: 'trace-phase-16-prerequisite-idempotency'
  });
  const result = materializeLowerDvinaTracePartyInstance(creation);
  const plan = stage24Plan(result, creation, pin);
  const batch = (table) => plan.write_batches.find(
    ({ target_table: targetTable }) => targetTable === table
  )?.records ?? [];
  const npcIds = new Set(batch('party_npcs').map(({ npc_id: id }) => id));
  const onisim = result.immediate.npcs.find(
    ({ participant_slot_ref: slot }) => slot === 'onisim_boatman'
  );
  const bandages = batch('party_items').filter(
    ({ template_id: id }) => id === 'trace_ld_v1_item_bandage_cloth'
  );
  const holderIds = [
    ...batch('party_item_placements'),
    ...batch('party_containers')
  ].map(({ holder_npc_id: id }) => id).filter(Boolean);

  assert.equal(npcIds.size, 6);
  assert.equal(bandages.length, 1);
  assert.ok(onisim.machine_state.binding_item.reserved_instance_id);
  assert.equal(
    onisim.machine_state.binding_item.template_id,
    'trace_ld_v1_item_ratsha_binding_rope'
  );
  assert.ok(holderIds.length > 0);
  for (const holderId of holderIds) assert.equal(npcIds.has(holderId), true);
});

test('revision 17 persists the sealed packet inside the road bag with Savva ownership', () => {
  const pin = lowerDvinaTracePhase1ADomainPin(bundle17);
  const creation = request({ scenario_definition_revision: 17,
    scenario_manifest_digest: bundle17.manifest_digest,
    scenario_bundle: bundle17, domain_catalog_pin: pin,
    idempotency_key: 'trace-phase-17-prerequisite-idempotency' });
  const result = materializeLowerDvinaTracePartyInstance(creation);
  const zhdanko = result.immediate.npcs.find(
    ({ participant_slot_ref: slot }) =>
      slot === 'zhdanko_storehouse_controller');
  const bag = result.immediate.containers.find(
    ({ template_id: id }) => id === 'trace_ld_v1_container_road_bag');
  const packet = result.immediate.items.find(
    ({ template_id: id }) => id === 'trace_ld_v1_item_sealed_packet');
  assert.equal(packet.container_id, bag.instance_id);
  assert.equal(packet.state.inherited_holder_npc_id, zhdanko.instance_id);
  assert.equal(packet.owner_external_ref,
    'trace_ld_v1_external_owner_savva_tverdich');
  assert.equal(packet.state.seal_state, 'intact');
  assert.equal(packet.state.document_contents_access, 'forbidden');
  const plan = stage24Plan(result, creation, pin);
  const item = plan.write_batches.find(
    ({ target_table: table }) => table === 'party_items').records.find(
    ({ template_id: id }) => id === 'trace_ld_v1_item_sealed_packet');
  const placement = plan.write_batches.find(
    ({ target_table: table }) => table === 'party_item_placements').records.find(
    ({ item_id: id }) => id === item.item_id);
  const placementBatch = plan.write_batches.find(
    ({ target_table: table }) => table === 'party_item_placements');
  const npcIds = new Set(plan.write_batches.find(
    ({ target_table: table }) => table === 'party_npcs').records.map(
    ({ npc_id: id }) => id));
  const ownership = plan.write_batches.find(
    ({ target_table: table }) => table === 'party_ownership').records.find(
    ({ item_id: id }) => id === item.item_id);
  assert.equal(placement.container_id, bag.instance_id);
  assert.equal(placement.holder_npc_id, null);
  assert.equal(placementBatch.depends_on_batches.includes(
    'batch-party_containers'), true);
  for (const record of placementBatch.records) {
    if (record.holder_npc_id != null) assert.equal(
      npcIds.has(record.holder_npc_id), true);
  }
  assert.equal(ownership.owner_external_ref,
    'trace_ld_v1_external_owner_savva_tverdich');
  assert.equal(ownership.controller_npc_id, zhdanko.instance_id);
});

test('revision 11 Stage 24 persists the exact bandage identity once', () => {
  const result = materializeLowerDvinaTracePartyInstance(request());
  const creation = request();
  const plan = stage24Plan(result, creation, domainCatalogPin);
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

function stage24Plan(result, creation, pin) {
  return buildLowerDvinaTracePhase1AWritePlan({
    request_id: 'phase-5-stage-24',
    party_creation_context: {
      party_id: result.party_id,
      player_character_id: result.immediate.player.instance_id,
      schema_version: 'party_runtime_v2',
      commit_mode: 'internal_materialization',
      domain_catalog_pin: pin,
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
}

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

function stripInstanceIdentity(item) {
  const copy = structuredClone(item);
  delete copy.instance_id;
  delete copy.owner_npc_id;
  delete copy.holder_npc_id;
  delete copy.controller_npc_id;
  return copy;
}
