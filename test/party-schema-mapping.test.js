import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptPartyWriteBatchTarget,
  adaptPartyWritePlanTargets,
  buildPartyStartCommittedFromCurrentDdl,
  isCurrentDdlPartyReadyForPlayer,
  mapSpecClockRecordToPartyStatePatch,
  mapSpecPartyStateRecordToCurrentDdl,
  resolvePartySpecTarget,
  validatePartyAdapterTargetSafety
} from '../src/world/party-schema-mapping.js';

test('maps spec ready party_state onto current party DDL', () => {
  const mapped = mapSpecPartyStateRecordToCurrentDdl({
    party_id: 'party_001',
    save_slot: 'slot_1',
    status: 'ready',
    start_year: 1237,
    current_year: 1237,
    current_day_index: 0,
    current_minute_of_day: 45,
    world_base_region_id: 'region_novgorod_land',
    player_character_id: 'pc_001',
    is_ready_for_player: true,
    current_phase: 'awaiting_player_input',
    opening_scene_presented: false,
    delivery_state: { awaiting_client_ack: true }
  });

  assert.equal(mapped.id, 'party_001');
  assert.equal(mapped.status, 'active');
  assert.equal(mapped.current_region_id, 'region_novgorod_land');
  assert.equal(mapped.audit_state.is_ready_for_player, true);
  assert.equal(mapped.audit_state.current_phase, 'awaiting_player_input');
  assert.equal(mapped.audit_state.opening_scene_presented, false);
  assert.deepEqual(mapped.audit_state.delivery_state, { awaiting_client_ack: true });
  assert.equal('party_id' in mapped, false);
  assert.equal('is_ready_for_player' in mapped, false);
});

test('maps spec-only target tables to existing party storage', () => {
  assert.deepEqual(resolvePartySpecTarget('party_scene_edges'), {
    specTargetTable: 'party_scene_edges',
    actualTargetTable: 'party_graph_edges',
    storage: 'scale_level=G5'
  });
  assert.equal(resolvePartySpecTarget('party_containers').actualTargetTable, 'party_items');
  assert.equal(resolvePartySpecTarget('party_narrator_output').actualTargetTable, 'party_journal_entries');

  const batch = adaptPartyWriteBatchTarget({
    batch_id: 'batch_narrator_output',
    target_table: 'party_narrator_output',
    operation_mode: 'insert_only',
    records: [{ party_id: 'party_001', body: 'approved prose' }]
  });

  assert.equal(batch.spec_target_table, 'party_narrator_output');
  assert.equal(batch.target_table, 'party_journal_entries');
  assert.equal(batch.adapter_target.storage, 'entry_type=opening_narrator_output');
});

test('maps spec clock into party_state clock columns and audit snapshot', () => {
  const mapped = mapSpecClockRecordToPartyStatePatch({
    year: 1237,
    season: 'winter',
    day: 1,
    hour: 3,
    minute: 45,
    light_profile: 'dark'
  });

  assert.equal(mapped.current_year, 1237);
  assert.equal(mapped.current_season, 'winter');
  assert.equal(mapped.current_day_index, 0);
  assert.equal(mapped.current_minute_of_day, 225);
  assert.equal(mapped.audit_state.clock.light_profile, 'dark');
});

test('adapts write plans without changing write_order ids', () => {
  const adapted = adaptPartyWritePlanTargets({
    schema: 'party_db_write_plan',
    transaction: {
      write_order: ['batch_party_state', 'batch_scene_edges']
    },
    write_batches: [
      {
        batch_id: 'batch_party_state',
        target_table: 'party_state',
        records: [{ party_id: 'party_001', status: 'ready', is_ready_for_player: true }]
      },
      {
        batch_id: 'batch_scene_edges',
        target_table: 'party_scene_edges',
        records: [{ id: 'edge_001', scale_level: 'G5' }]
      }
    ]
  });

  assert.equal(adapted.adapter_version, 1);
  assert.deepEqual(adapted.transaction.write_order, ['batch_party_state', 'batch_scene_edges']);
  assert.equal(adapted.write_batches[0].target_table, 'party_state');
  assert.equal(adapted.write_batches[1].target_table, 'party_graph_edges');
});

test('current DDL ready row maps back to spec party_start_committed', () => {
  const partyState = {
    id: 'party_001',
    status: 'active',
    audit_state: {
      is_ready_for_player: true,
      current_phase: 'awaiting_player_input',
      current_turn_number: 0,
      opening_scene_presented: false
    }
  };

  assert.equal(isCurrentDdlPartyReadyForPlayer(partyState), true);

  const committed = buildPartyStartCommittedFromCurrentDdl({
    requestId: 'req_001',
    transactionId: 'tx_001',
    partyState,
    currentPosition: {
      region_id: 'region_novgorod_land',
      place_id: 'place_001',
      location_id: 'loc_001',
      minilocation_id: 'mini_001',
      anchor_id: 'anchor_001',
      last_route_id: null
    },
    narratorOutputId: 'journal_opening_001'
  });

  assert.equal(committed.party_state.status, 'ready');
  assert.equal(committed.party_state.is_ready_for_player, true);
  assert.equal(committed.current_position.anchor_id, 'anchor_001');
  assert.equal(committed.player_output_ref.player_visible_message_ready, true);
  assert.equal(committed.player_output_ref.opening_scene_presented, false);
});

test('adapter safety blocks world_base writes and hidden leaks into visible targets', () => {
  const result = validatePartyAdapterTargetSafety({
    write_batches: [
      {
        target_table: 'party_visible_context',
        records: [{ public_label: 'visible', hidden_state: { private_motives: ['x'] } }]
      },
      {
        target_table: 'world_base.graph_nodes',
        records: [{ id: 'node_001' }]
      }
    ]
  });

  assert.equal(result.pass, false);
  assert.deepEqual(result.concerns.map((item) => item.code), [
    'PARTY_ADAPTER_HIDDEN_PUBLIC_LEAK',
    'PARTY_ADAPTER_WORLD_BASE_MUTATION'
  ]);
});
