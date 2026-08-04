import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertTurnStepAuthoredItemRows,
  assertTurnStepRuntimeItemRows
} from '../src/infrastructure/postgres/lower-dvina-trace-turn-step-read.js';

test('M1 restart validator cross-checks arbitrary runtime rows and attachment',
  async () => {
    const payload = snapshot();
    const pool = queryPool([normalizedRow()]);
    await assert.doesNotReject(() =>
      assertTurnStepRuntimeItemRows(pool, payload));
    assert.match(pool.sql,
      /p\.attached_item_id/u);

    const wrongAttachment = normalizedRow();
    wrongAttachment.attached_item_id = 'runtime-item:other';
    await assert.rejects(() => assertTurnStepRuntimeItemRows(
      queryPool([wrongAttachment]), payload
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

test('M1 restart validator requires terminal lifecycle to match v2 snapshot',
  async () => {
    const payload = snapshot();
    payload.items[0].state.lifecycle_status = 'retired';
    payload.items[0].condition_state = 'retired';
    const retired = normalizedRow();
    retired.state = structuredClone(payload.items[0].state);
    retired.condition_state = 'retired';
    await assert.doesNotReject(() => assertTurnStepRuntimeItemRows(
      queryPool([retired]), payload
    ));

    retired.state.lifecycle_status = 'active';
    await assert.rejects(() => assertTurnStepRuntimeItemRows(
      queryPool([retired]), payload
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

test('M1 restart validator binds authored rows touched by the last batch',
  async () => {
    const payload = authoredSnapshot();
    await assert.doesNotReject(() => assertTurnStepAuthoredItemRows(
      queryPool([authoredRow()]), payload
    ));
    await assert.rejects(() => assertTurnStepAuthoredItemRows(
      queryPool([]), payload
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
    const forged = authoredRow();
    forged.container_id = 'forged-container';
    await assert.rejects(() => assertTurnStepAuthoredItemRows(
      queryPool([forged]), payload
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
    const forgedState = authoredRow();
    forgedState.state = { access_state: { access: 'closed' } };
    await assert.rejects(() => assertTurnStepAuthoredItemRows(
      queryPool([forgedState]), payload
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

test('M1 restart validator ignores untouched historical authored rows',
  async () => {
    const payload = authoredSnapshot();
    payload.last_turn.turn_step_operation_batch.operations = [];
    let queried = false;
    await assert.doesNotReject(() => assertTurnStepAuthoredItemRows({
      async query() { queried = true; throw new Error('unexpected query'); }
    }, payload));
    assert.equal(queried, false);
  });

function snapshot() {
  const state = {
    lifecycle_status: 'active',
    runtime_instance_mechanics_snapshot: mechanics(),
    ordinary_metadata: {
      semantic_type: 'tool', name: 'ремешок',
      origin: { kind: 'crafted', source_refs: ['runtime-item:base'] },
      semantic_facts: [], operation_history: []
    }
  };
  return {
    schema: 'rus.lower_dvina_trace_turn_snapshot.v2',
    party_id: 'party-1',
    items: [{
      item_id: 'runtime-item:strap',
      template_id: null,
      profile_id: null,
      category_id: null,
      quantity: 1,
      condition_state: 'ordinary_runtime_instance',
      legal_status: 'unowned_ordinary_runtime',
      placement: { attached_item_id: 'runtime-item:base' },
      runtime_instance_mechanics_snapshot: mechanics(),
      state
    }]
  };
}

function normalizedRow() {
  const item = snapshot().items[0];
  return {
    item_id: item.item_id,
    run_id: null,
    template_id: null,
    profile_id: null,
    category_id: null,
    quantity: 1,
    condition_state: item.condition_state,
    legal_status: item.legal_status,
    state: structuredClone(item.state),
    placement_item_id: item.item_id,
    anchor_id: null,
    container_id: null,
    holder_npc_id: null,
    holder_character_id: null,
    physical_position: null,
    equipment_slot_category_id: null,
    attached_item_id: 'runtime-item:base'
  };
}

function authoredSnapshot() {
  return {
    party_id: 'party-1',
    items: [{
      item_id: 'authored-chest', run_id: 'run-1',
      template_id: 'chest-template', profile_id: 'chest-profile',
      category_id: 'container', quantity: 1, condition_state: 'sound',
      legal_status: 'party_owned',
      state: { access_state: { access: 'open' } },
      placement: { anchor_id: 'anchor-shore' }
    }],
    last_turn: {
      turn_step_operation_batch: {
        operations: [{
          target: 'party_items',
          value: {
            operation_kind: 'move_entity',
            payload: {
              entity_ref: 'authored-chest',
              authored_source: { item_id: 'authored-chest' }
            }
          }
        }, {
          target: 'party_items',
          value: {
            operation_kind: 'request_container_access',
            payload: { container_ref: 'authored-chest' }
          }
        }]
      }
    }
  };
}

function authoredRow() {
  const item = authoredSnapshot().items[0];
  return {
    item_id: item.item_id, run_id: item.run_id,
    template_id: item.template_id, profile_id: item.profile_id,
    category_id: item.category_id, quantity: item.quantity,
    condition_state: item.condition_state, legal_status: item.legal_status,
    state: structuredClone(item.state), placement_item_id: item.item_id,
    anchor_id: 'anchor-shore', container_id: null, holder_npc_id: null,
    holder_character_id: null, physical_position: null,
    equipment_slot_category_id: null, attached_item_id: null
  };
}

function mechanics() {
  return {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:party-1:1',
      step_index: 1,
      operation_ref: 'operation-1',
      origin_kind: 'crafted',
      source_refs: ['runtime-item:base']
    },
    mechanics: {
      mass_grams: 10,
      external_hand_cost: 0,
      carry_form: 'compact',
      packing_slot_cost: 0,
      quantity: { value: 0.5, unit: 'length' },
      container: null
    }
  };
}

function queryPool(rows) {
  return {
    sql: '',
    async query(sql) {
      this.sql = sql;
      return { rows, rowCount: rows.length };
    }
  };
}
