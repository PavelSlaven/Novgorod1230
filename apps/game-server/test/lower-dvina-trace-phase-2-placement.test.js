import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadLowerDvinaTracePhase2Bundle
} from '../src/internal/lower-dvina-trace-phase-2-bundle.js';
import {
  firstPlayableCommitRecheck
} from '../src/infrastructure/postgres/first-playable/recheck.js';

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
