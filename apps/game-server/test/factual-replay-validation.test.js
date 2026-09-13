import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { createFactualTurnDeliveryScreenReadModel } from '@rus/presentation';
import {
  loadCurrentOrHistoricalPhase2Replay,
  loadHistoricalPhase2Replay
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-replay.js';

const partyId = 'party';
const idempotencyKey = 'turn:idem';

test('current factual replay binds screen to exact package snapshot turn', async () => {
  const fixture = replayFixture();
  const replay = await loadCurrentOrHistoricalPhase2Replay({
    partyPool: poolForCurrent(fixture), partyId, idempotencyKey,
    async loadState() { return structuredClone(fixture.payload); }
  });
  assert.deepEqual(replay.screen, fixture.screen);

  await assert.rejects(loadCurrentOrHistoricalPhase2Replay({
    partyPool: poolForCurrent(replayFixture({ screenTurn: 8 })), partyId,
    idempotencyKey, async loadState() { return structuredClone(fixture.payload); }
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });

  for (const row of [
    { ...fixture.row, narration_status: 'pending' },
    { ...fixture.row, delivery_mode: 'narrated' },
    { ...fixture.row, narration_output: { prose: 'Лишний текст.' } },
    { ...fixture.row, output_digest: 'unexpected-digest' },
    { ...fixture.row, factual_screen: { ...fixture.screen, turn_number: 8 } },
    { ...fixture.row, narration_status: null, delivery_mode: null,
      narration_output: null, output_digest: null, factual_screen: null }
  ]) await assert.rejects(loadCurrentOrHistoricalPhase2Replay({
    partyPool: poolForCurrent({ ...fixture, row }), partyId, idempotencyKey,
    async loadState() { return structuredClone(fixture.payload); }
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  await assert.rejects(loadCurrentOrHistoricalPhase2Replay({
    partyPool: poolForCurrent({ ...fixture, row: { ...fixture.row,
      screen: fixture.genericScreen, factual_screen: fixture.genericScreen } }),
    partyId, idempotencyKey,
    async loadState() { return structuredClone(fixture.payload); }
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('current narrated replay does not require a factual delivery job', async () => {
  const fixture = replayFixture();
  const row = { ...fixture.row,
    screen: { schema: 'lower_dvina_trace_turn_screen', screen_status: 'ready' },
    delivery_mode: 'narrated', factual_screen: null,
    narration_output: { prose: 'Берег.' }, output_digest: 'narration:digest' };
  const replay = await loadCurrentOrHistoricalPhase2Replay({
    partyPool: poolForCurrent({ ...fixture, row }), partyId, idempotencyKey,
    async loadState() { return structuredClone(fixture.payload); }
  });
  assert.deepEqual(replay.screen, row.screen);
});

test('historical factual replay binds screen to exact package snapshot turn', async () => {
  const fixture = replayFixture();
  const replay = await loadHistoricalPhase2Replay({
    partyPool: poolForHistorical(fixture), partyId, idempotencyKey
  });
  assert.deepEqual(replay.screen, fixture.screen);

  await assert.rejects(loadHistoricalPhase2Replay({
    partyPool: poolForHistorical(replayFixture({ screenTurn: 8 })), partyId,
    idempotencyKey
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  await assert.rejects(loadHistoricalPhase2Replay({
    partyPool: poolForHistorical({ ...fixture, row: { ...fixture.row,
      screen: fixture.genericScreen, factual_screen: fixture.genericScreen } }),
    partyId, idempotencyKey
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

function replayFixture({ screenTurn = 7 } = {}) {
  const visiblePayload = {
    schema: 'temporal_visible_package.v1', perceived_scene: 'Берег.',
    perceived_changes: ['Вода ушла.'], sensory_details: [], visible_npcs: [],
    visible_objects: [], known_context: [], uncertainties: ['Туман.'],
    hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const visibleContext = {
    version: 1, schema: 'visible_context_package', visible_scene: 'Берег.',
    visible_changes: ['Вода ушла.'], sensory_details: [], visible_npc: [],
    visible_objects: [], known_context: [], uncertainties: ['Туман.'],
    allowed_tensions: [], do_not_imply: []
  };
  const packageDigest = computeSpatialV3CanonicalDigest(visiblePayload);
  const payload = {
    schema: 'rus.lower_dvina_trace_phase_2_snapshot.v1', party_id: partyId,
    party_state: { state_version: 39, turn_number: 7 },
    last_turn: {
      idempotency_key: idempotencyKey, request_id: 'request:1',
      input_digest: 'input:digest', option_id: 'inspect',
      action_set_digest: 'actions:digest', consequence: {},
      visible_package: {
        change_set_id: 'change:1', package_id: 'package:1', package_digest: packageDigest
      }
    }
  };
  const snapshotPayload = { party_state: { turn_number: 7 } };
  const screen = createFactualTurnDeliveryScreenReadModel({
    partyId, turnId: 'turn:1', turnNumber: screenTurn,
    packageId: 'package:1', committedStateVersion: 39, visibleContext,
    visibleChanges: visibleContext.visible_changes,
    uncertainties: visibleContext.uncertainties,
    actionPanel: { suggested_actions: [] }, actions: [], checks: [], panels: {},
    inputPanel: { free_text_enabled: true, input_contract: 'intent_not_fact' },
    scenarioId: 'lower_dvina_trace_v1', screenKind: 'trace_turn',
    deliveryState: { ready: true, generated_at: '2026-01-01T00:00:00.000Z' },
    openingScreenDigest: 'opening', currentProjectionAnchor: {
      committed_state_version: '39', package_id: 'package:1',
      package_digest: packageDigest, narration_output_digest: null },
    presentationContext: { location_label: 'Берег.' }
  });
  const genericScreen = createFactualTurnDeliveryScreenReadModel({
    partyId, turnId: 'turn:1', turnNumber: screenTurn,
    packageId: 'package:1', committedStateVersion: 39, visibleContext,
    visibleChanges: visibleContext.visible_changes,
    uncertainties: visibleContext.uncertainties, panels: {}
  });
  const record = {
    id: 'idem:1', request_id: 'request:1', status: 'committed',
    result_change_set_id: 'change:1',
    semantic_command_snapshot: {
      input_digest: 'input:digest', selected_option_id: 'inspect',
      action_set_digest: 'actions:digest'
    }
  };
  const row = {
    screen, turn_number: 7, party_id: partyId, package_id: 'package:1',
    turn_id: 'turn:1', committed_state_version: 39, package_digest: packageDigest,
    visible_payload: visiblePayload, snapshot_payload: snapshotPayload,
    state_digest: canonicalDigest(snapshotPayload), dependency_pins: null,
    source_dependency_pins: null, narration_status: 'delivered',
    delivery_mode: 'factual', narration_output: null, output_digest: null,
    factual_screen: screen, package_snapshot_digest: canonicalDigest(snapshotPayload)
  };
  return { payload, record, row, screen, genericScreen };
}

function poolForCurrent({ record, row }) {
  return { async query(sql) {
    if (sql.includes('party_command_idempotency')) {
      return { rowCount: 1, rows: [structuredClone(record)] };
    }
    if (sql.includes('party_server_sessions')) {
      return { rowCount: 1, rows: [structuredClone(row)] };
    }
    throw new Error(`unexpected query: ${sql}`);
  } };
}

function poolForHistorical({ record, row, payload }) {
  return { async query(sql) {
    if (sql.includes('party_command_idempotency')) {
      return { rowCount: 1, rows: [structuredClone(record)] };
    }
    if (sql.includes('party_state_snapshots')) {
      return { rowCount: 1, rows: [{ ...structuredClone(row),
        state_payload: structuredClone(payload),
        state_digest: canonicalDigest(payload) }] };
    }
    throw new Error(`unexpected query: ${sql}`);
  } };
}
