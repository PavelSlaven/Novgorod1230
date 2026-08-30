import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadLowerDvinaTracePhase2Bundle
} from '../src/internal/lower-dvina-trace-phase-2-bundle.js';
import {
  firstPlayableCommitRecheck
} from '../src/infrastructure/postgres/first-playable/recheck.js';
import {
  loadInitialTracePhase2State
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-initial-state.js';
import {
  normalizeJourneyLocation,
  normalizeJourneyLocationRows
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import {
  buildCommittedInventoryInput
} from '../src/runtime/lower-dvina-trace-committed-inventory.js';
import {
  admitLocalFireInput,
  validateInventoryTopology
} from '@rus/items-property';

test('Phase 2 pins blue wool to one non-consuming local evidence slot', async () => {
  const { binding } = await loadLowerDvinaTracePhase2Bundle();
  assert.deepEqual(binding.clue_placement_contract, {
    item_template_ref: 'trace_ld_v1_item_blue_wool_fragment',
    item_capacity_class: 'evidence',
    placement_model: 'local_evidence_slot_within_g5_anchor',
    placement_slot_ref: 'trace_ld_v1_slot_wreck_willow_branch',
    location_ref: 'trace_ld_v1_loc_wreck_shore',
    local_anchor_semantics: 'willow_branch',
    g5_anchor_binding: {
      template_id: 'trace_ld_v1_g5_anchor_wreck_open_shore_v1',
      slot_key: 'open_shore',
      capacity_contract_ref: 'trace_ld_v1_capacity_wreck_shore',
      zone_ref: 'open_shore',
      item_capacity_application:
        'not_consumed_by_local_evidence_slot',
      expected_item_capacity: 0
    },
    placement_slot_capacity: 1,
    existing_instance_policy: 'reuse_exact_item_instance',
    commit_recheck_policy:
      'exact_anchor_scene_zone_slot_and_unique_item'
  });
});

test('local evidence-slot recheck validates anchor state, slot capacity and writes', async () => {
  const check = localSlotCheck();
  const plan = placementPlan(check);
  const anchor = {
    template_id: check.anchor_template_id,
    slot_key: check.anchor_slot_key,
    item_capacity: 0,
    state: {
      capacity_contract_ref: check.capacity_contract_ref,
      zone_ref: check.zone_ref
    },
    existing_item_count: 0
  };
  const transaction = {
    async query(sql) {
      return sql.includes('party_g5_anchors')
        ? { rows: [structuredClone(anchor)] }
        : { rows: [] };
    }
  };
  assert.deepEqual(await firstPlayableCommitRecheck({
    transaction,
    party_id: 'party:trace-phase-2',
    check,
    plan
  }), {
    ok: true,
    code: 'relation_capacity_undefined'
  });
  anchor.item_capacity = 1;
  assert.deepEqual(await firstPlayableCommitRecheck({
    transaction,
    party_id: 'party:trace-phase-2',
    check,
    plan
  }), {
    ok: false,
    code: 'relation_capacity_undefined'
  });
  anchor.item_capacity = 0;
  plan.inserts[1].record.anchor_id = 'anchor:wrong';
  assert.deepEqual(await firstPlayableCommitRecheck({
    transaction,
    party_id: 'party:trace-phase-2',
    check,
    plan
  }), {
    ok: false,
    code: 'relation_capacity_undefined'
  });
  plan.inserts[1].record.anchor_id = check.anchor_id;
  check.expected_existing_item_count = 1;
  check.placement_write_required = false;
  plan.inserts = [];
  transaction.query = async (sql) => sql.includes('party_g5_anchors')
    ? { rows: [structuredClone(anchor)] }
    : {
        rows: [{
          item_id: 'item:blue-wool',
          anchor_id: 'anchor:wrong',
          state: {
            placement_contract: {
              placement_model: check.capacity_model,
              placement_slot_id: check.placement_slot_id,
              local_anchor_semantics: check.local_anchor_semantics,
              anchor_id: 'anchor:wrong',
              capacity_contract_ref: check.capacity_contract_ref,
              zone_ref: check.zone_ref,
              item_capacity_class: check.item_capacity_class,
              g5_item_capacity_consumed: 0
            }
          }
        }]
      };
  assert.deepEqual(await firstPlayableCommitRecheck({
    transaction,
    party_id: 'party:trace-phase-2',
    check,
    plan
  }), {
    ok: false,
    code: 'relation_capacity_undefined'
  });
});

test('initial Phase 2 state rehydrates persisted container placements', async () => {
  const container = {
    container_id: 'container:zhdanko-road-bag',
    template_id: 'trace_ld_v1_container_road_bag',
    anchor_id: null,
    parent_container_id: null,
    holder_npc_id: 'npc:zhdanko',
    holder_character_id: null,
    physical_position: null,
    equipment_slot_category_id: null
  };
  const state = await loadInitialTracePhase2State({
    partyId: 'party:trace-phase-2',
    row: {
      world_revision_id: 'world:revision',
      world_catalog_digest: 'a'.repeat(64),
      session_state_version: 0,
      body_state_version: 0,
      clock_state_version: 0,
      turn_number: 0,
      stage26_result: { opening_screen_digest: 'b'.repeat(64) }
    },
    phase1A: { loadInternal: async () => initialState(container) },
    partyPool: { query: async () => ({ rows: [] }) },
    temporalSourceProof: { candidates: [] }
  });

  assert.deepEqual(state.container_placements, [{
    party_id: 'party:trace-phase-2',
    container_id: container.container_id,
    anchor_id: null,
    parent_container_id: null,
    holder_npc_id: 'npc:zhdanko',
    holder_character_id: null,
    physical_position: null,
    equipment_slot_category_id: null
  }]);
  assert.equal(validateInventoryTopology(
    buildCommittedInventoryInput(state)).pass, true);
});

test('initial Phase 2 item bindings remain admissible to their domain owner',
  async () => {
    const fuel = localFireFuel();
    const state = await loadInitialTracePhase2State({
      partyId: 'party:trace-phase-2',
      row: {
        world_revision_id: 'world:revision',
        world_catalog_digest: 'a'.repeat(64),
        session_state_version: 0,
        body_state_version: 0,
        clock_state_version: 0,
        turn_number: 0,
        stage26_result: { opening_screen_digest: 'b'.repeat(64) }
      },
      phase1A: { loadInternal: async () => initialState(null, [fuel]) },
      partyPool: { query: async () => ({ rows: [] }) },
      temporalSourceProof: { candidates: [] }
    });
    const item = state.items[0];
    assert.equal(admitLocalFireInput({
      item,
      placement: item.placement,
      ownership: item.ownership,
      actor_ref: 'character:mikula',
      scope_ref: 'anchor:wreck',
      fuel_mass_grams_min: 100,
      fuel_mass_grams_max: 1_000
    }).pass, true);
  });

test('Phase 2 normalizes persisted journey version and rejects malformed rows', () => {
  assert.deepEqual(normalizeJourneyLocation({ id: 'journey:player',
    scene_position_id: 'position:shore', state_version: '4' }), {
    id: 'journey:player', scene_position_id: 'position:shore', state_version: 4
  });
  for (const row of [
    { id: 'journey:player', scene_position_id: 'position:shore', state_version: '4.0' },
    { id: 'journey:player', scene_position_id: '', state_version: '4' },
    { id: 'journey:player', scene_position_id: 'position:shore', state_version: '-1' }
  ]) assert.throws(() => normalizeJourneyLocation(row));
  assert.equal(normalizeJourneyLocationRows([]), null);
  assert.throws(() => normalizeJourneyLocationRows([
    { id: 'journey:one', scene_position_id: 'position:shore', state_version: '4' },
    { id: 'journey:two', scene_position_id: 'position:shore', state_version: '4' }
  ]));
});

function localSlotCheck() {
  return {
    kind: 'capacity',
    capacity_model: 'local_evidence_slot_within_g5_anchor',
    anchor_id: 'anchor:wreck:open-shore',
    anchor_template_id: 'trace_ld_v1_g5_anchor_wreck_open_shore_v1',
    anchor_slot_key: 'open_shore',
    expected_anchor_item_capacity: 0,
    capacity_contract_ref: 'trace_ld_v1_capacity_wreck_shore',
    zone_ref: 'open_shore',
    location_ref: 'trace_ld_v1_loc_wreck_shore',
    placement_slot_id: 'trace_ld_v1_slot_wreck_willow_branch',
    local_anchor_semantics: 'willow_branch',
    item_template_id: 'trace_ld_v1_item_blue_wool_fragment',
    item_capacity_class: 'evidence',
    placement_slot_capacity: 1,
    expected_existing_item_count: 0,
    placement_write_required: true
  };
}

function placementPlan(check) {
  return {
    inserts: [{
      target_table: 'party_items',
      record: {
        item_id: 'item:blue-wool',
        template_id: check.item_template_id,
        state: {
          placement_contract: {
            placement_model: check.capacity_model,
            placement_slot_id: check.placement_slot_id,
            local_anchor_semantics: check.local_anchor_semantics,
            anchor_id: check.anchor_id,
            capacity_contract_ref: check.capacity_contract_ref,
            zone_ref: check.zone_ref,
            location_ref: check.location_ref,
            item_capacity_class: check.item_capacity_class,
            g5_item_capacity_consumed: 0
          }
        }
      }
    }, {
      target_table: 'party_item_placements',
      record: {
        item_id: 'item:blue-wool',
        anchor_id: check.anchor_id
      }
    }]
  };
}

function initialState(container, items = []) {
  return {
    player: {
      instance_id: 'character:mikula',
      dossier: { attributes: { strength: { value: 9 } } }
    },
    body: {},
    position: { g5_anchor_id: 'anchor:wreck' },
    prepared_scenes: [],
    npcs: [],
    promise_instances: [],
    timestamp: { whole_minutes: '333060',
      subminute_numerator: '0', subminute_denominator: '1' },
    environment_snapshot: {},
    sealed_selections: {},
    policy_profile_pins: [],
    items,
    containers: container == null ? [] : [container],
    initial_snapshot_identity: {},
    materialization_trace: {}
  };
}

function localFireFuel() {
  const itemId = 'item:fuel';
  return {
    item_id: itemId,
    run_id: 'run:1',
    template_id: 'template:fuel',
    profile_id: 'profile:fuel',
    category_id: 'ordinary_solid_fuel_unit',
    quantity: 1,
    state_version: 1,
    condition_state: 'serviceable',
    legal_status: 'owned',
    placement: {
      item_id: itemId,
      anchor_id: 'anchor:wreck',
      container_id: null,
      holder_npc_id: null,
      holder_character_id: null,
      physical_position: null,
      equipment_slot_category_id: null,
      attached_item_id: null
    },
    ownership: {
      item_id: itemId,
      ownership_id: 'ownership:fuel',
      owner_npc_id: null,
      owner_character_id: 'character:mikula',
      owner_external_ref: null,
      owner_party: false,
      controller_npc_id: null,
      controller_character_id: 'character:mikula',
      claim_state: 'owned'
    },
    state: {
      lifecycle_status: 'active',
      inventory_profile_snapshot: {
        item_template_ref: 'template:fuel',
        mass_grams: 300
      },
      local_fire_fuel: {
        schema: 'rus.items.local_fire_fuel.v1',
        fuel_class: 'ordinary_solid_fuel_unit',
        whole_unit: true,
        provenance: { source_refs: ['source:fuel'] }
      }
    }
  };
}
