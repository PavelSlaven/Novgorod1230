import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { successEnvelope } from '../src/http/contracts.js';
import { renderExactNpcUtterances } from
  '../../game-web/src/features/prose/render.js';
import { validatePublicScreen } from
  '../../game-web/src/api/contracts.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { loadCurrentOrHistoricalPhase2Replay } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-replay.js';
import { buildPhase2ReadyScreen } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { phase3CommittedNpcUtterances } from
  '../src/runtime/lower-dvina-trace-npc-utterances.js';

const partyId = 'party-screen-replay';
const idempotencyKey = 'turn-screen-replay';
const inputDigest = 'input-screen-replay';
const packageId = 'visible-package-screen-replay';
const changeSetId = 'change-screen-replay';

test('phase 2 screen replay preserves verified exact NPC speech and public attribution', async (t) => {
  for (const { name, utterances } of [
    { name: 'two committed utterances', utterances: committedUtterances() },
    { name: 'empty committed utterances', utterances: [] },
    { name: 'utterance field absent from snapshot', utterances: undefined }
  ]) {
    await t.test(name, async () => {
      const state = stateWithUtterances(utterances);
      const visibleContext = visibleContextFor(utterances ?? []);
      const visiblePayload = visiblePayloadFor(visibleContext);
      const narration = narrationResult();
      const narrationOutputDigest = narrationOutput(narration,
        state.last_turn.visible_package.package_digest).canonical_digest;
      narration.presentation = { package_digest:
        state.last_turn.visible_package.package_digest,
      output_digest: narrationOutputDigest };
      const workflowPayload = structuredClone(state);
      delete workflowPayload.last_turn.exact_npc_utterances;
      const workflowScreen = buildPhase2ReadyScreen({
        payload: workflowPayload,
        turnId: 'turn-2',
        visibleContext,
        narration,
        narrationOutputDigest
      });
      assert.equal(Object.hasOwn(workflowScreen, 'exact_npc_utterances'), false);

      let persistedScreen;
      const writePool = {
        async query(query, parameters) {
          const sql = typeof query === 'string' ? query : query.text;
          const values = typeof query === 'string' ? parameters : query.values;
          if (sql.includes('SELECT state_payload,state_digest')
              && sql.includes('party_state_snapshots')) {
            return { rowCount: 1, rows: [{ state_payload: state,
              state_digest: canonicalDigest(state) }] };
          }
          if (sql.includes('UPDATE party_runtime.party_server_sessions')) {
            persistedScreen = JSON.parse(values[1]);
            return { rowCount: 1, rows: [] };
          }
          return { rowCount: 0, rows: [] };
        },
        connect() { throw new Error('unexpected database connection'); }
      };
      const repository = createLowerDvinaTracePhase2PostgresRepository({
        partyPool: writePool,
        committer: { async commit() {
          throw new Error('unexpected commit');
        } }
      });
      const firstDelivery = await repository.persistPhase2Screen({
        partyId,
        inputDigest,
        result: {
          turn_id: 'turn-2',
          commit: { state_version: state.party_state.state_version,
            package_id: packageId,
            package_digest: state.last_turn.visible_package.package_digest },
          narration,
          screen: workflowScreen
        }
      });
      assert.ok(persistedScreen);
      assert.deepEqual(firstDelivery.screen, persistedScreen);

      const replayPool = poolForReplay({ state, screen: persistedScreen,
        visiblePayload, narration });
      const currentReplay = await loadCurrentOrHistoricalPhase2Replay({
        partyPool: replayPool,
        partyId,
        idempotencyKey,
        async loadState() { return structuredClone(state); }
      });
      const historicalReplay = await loadCurrentOrHistoricalPhase2Replay({
        partyPool: poolForReplay({ state, screen: persistedScreen,
          visiblePayload, narration }),
        partyId,
        idempotencyKey,
        async loadState() {
          return { ...structuredClone(state), last_turn: {
            ...structuredClone(state.last_turn), idempotency_key: 'later-turn'
          } };
        }
      });
      assert.deepEqual(currentReplay.screen, persistedScreen);
      assert.deepEqual(currentReplay.public_result, firstDelivery);
      assert.deepEqual(historicalReplay.public_result, firstDelivery);
      assert.deepEqual(currentReplay.screen, historicalReplay.screen);
      assert.equal(currentReplay.screen.screen_digest,
        historicalReplay.screen.screen_digest);

      if (!utterances?.length) {
        for (const screen of [firstDelivery.screen, currentReplay.screen,
          historicalReplay.screen]) {
          assert.equal(Object.hasOwn(screen, 'exact_npc_utterances'), false);
        }
        return;
      }

      assert.deepEqual(firstDelivery.screen.exact_npc_utterances, utterances);
      const published = successEnvelope({ screen: firstDelivery.screen }).data.screen;
      assert.doesNotThrow(() => validatePublicScreen(published));
      assert.deepEqual(published.exact_npc_utterances.map(({ speaker_ref,
        utterance_text, ...extra }) => ({ speaker_ref, utterance_text, extra })),
      utterances.map(({ speaker_ref, utterance_text }) => ({
        speaker_ref, utterance_text, extra: {}
      })));
      for (const leaf of published.exact_npc_utterances) {
        assert.deepEqual(Object.keys(leaf).sort(), ['speaker_ref',
          'utterance_text']);
        assert.deepEqual(Object.keys(leaf.speaker_ref).sort(),
          ['entity_id', 'entity_kind']);
        assert.equal(JSON.stringify(leaf).includes('provenance'), false);
        assert.equal(JSON.stringify(leaf).includes('statement_ref'), false);
        assert.equal(JSON.stringify(leaf).includes('listener_ref'), false);
      }
      const html = renderExactNpcUtterances(published);
      for (const expected of ['Еремей', 'Фёкла', 'Сеть я отложил.',
        'Вода прибывает к вечеру.']) {
        assert.ok(html.includes(expected),
          `rendered NPC speech is missing: ${expected}`);
      }
      assert.ok(html.indexOf('Еремей') < html.indexOf('Фёкла'));
      assert.ok(html.indexOf('Сеть я отложил.')
        < html.indexOf('Вода прибывает к вечеру.'));
      assert.doesNotMatch(html, /npc-eremey|npc-fyokla|statement-/u);
    });
  }
});

function committedUtterances() {
  return phase3CommittedNpcUtterances({
    statements: [
      { statement_id: 'statement-eremey',
        speaker_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
        utterance_text: 'Сеть я отложил.' },
      { statement_id: 'statement-fyokla',
        speaker_ref: { entity_kind: 'npc', entity_id: 'npc-fyokla' },
        utterance_text: 'Вода прибывает к вечеру.' }
    ],
    audiences: [
      { statement_ref: { entity_kind: 'conversation_statement',
        entity_id: 'statement-eremey' }, received_messages: [{
        listener_ref: { entity_kind: 'player_character', entity_id: 'player-1' },
        comprehension: 'full', utterance_text: 'Сеть я отложил.'
      }] },
      { statement_ref: { entity_kind: 'conversation_statement',
        entity_id: 'statement-fyokla' }, received_messages: [{
        listener_ref: { entity_kind: 'player_character', entity_id: 'player-1' },
        comprehension: 'full', utterance_text: 'Вода прибывает к вечеру.'
      }] }
    ]
  });
}

function stateWithUtterances(utterances) {
  const visibleContext = visibleContextFor(utterances ?? []);
  const visiblePayload = visiblePayloadFor(visibleContext);
  return {
    party_id: partyId,
    actor_id: 'player-1',
    scenario_id: 'lower_dvina_trace_v1',
    party_state: { state_version: 3, turn_number: 2 },
    position: { location_ref: 'camp' },
    npcs: [
      { instance_id: 'npc-eremey', location_ref: 'camp',
        identity_state: { canonical_name: 'Еремей' } },
      { instance_id: 'npc-fyokla', location_ref: 'camp',
        identity_state: { canonical_name: 'Фёкла' } }
    ],
    conversation_sessions: [],
    current_visible_context: visibleContext,
    last_turn: {
      received_at: '2026-08-14T12:00:00.000Z',
      input_digest: inputDigest,
      idempotency_key: idempotencyKey,
      request_id: 'request-screen-replay',
      option_id: 'talk',
      action_set_digest: 'actions-screen-replay',
      ...(utterances === undefined ? {} : {
        exact_npc_utterances: structuredClone(utterances)
      }),
      check_result: null,
      time_update: null,
      body_update: null,
      consequence: { observations: [], evidence_relations: [],
        conversation: null },
      visible_package: {
        package_id: packageId,
        package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
        change_set_id: changeSetId
      }
    },
    opening_identity: { opening_screen_digest: 'sha256:opening' }
  };
}

function visibleContextFor(utterances) {
  const speakers = new Map(utterances.map(({ speaker_ref }) => [
    speaker_ref.entity_id, speaker_ref.entity_id === 'npc-eremey'
      ? 'Еремей' : 'Фёкла'
  ]));
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'У берега стоят Еремей и Фёкла.',
    visible_changes: [],
    sensory_details: [],
    visible_npc: [...speakers].map(([entityId, displayLabel]) => ({
      entity_ref: { entity_kind: 'npc', entity_id: entityId },
      display_label: displayLabel,
      recognition: 'known'
    })),
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: []
  };
}

function visiblePayloadFor(visibleContext) {
  return {
    perceived_scene: visibleContext.visible_scene,
    perceived_changes: visibleContext.visible_changes,
    sensory_details: visibleContext.sensory_details,
    visible_npcs: visibleContext.visible_npc,
    visible_objects: visibleContext.visible_objects,
    known_context: visibleContext.known_context,
    uncertainties: visibleContext.uncertainties
  };
}

function narrationResult() {
  const approvedOutput = {
    version: 1,
    schema: 'narration_output',
    output_id: 'output-screen-replay',
    prose: 'У берега стоят два рыбака.',
    action_options: [],
    used_references: [],
    self_check: {}
  };
  const flowResult = {
    version: 1,
    schema: 'narration_flow_result',
    request_id: 'turn-2',
    surface: 'turn',
    status: 'approved',
    pass: true,
    approved_output: approvedOutput,
    final_audit: {
      version: 1,
      schema: 'narration_audit',
      artistic_verdict: 'pass',
      technical_verdict: 'pass',
      coverage: { visible_changes: [], uncertainties: [] },
      pass: true,
      concerns: [],
      evidence: ['Grounded.']
    },
    generation_history: [],
    audit_history: [],
    repair_history: [],
    presentation: { package_digest: 'visible-package-digest',
      output_digest: 'narration-flow-output-digest' }
  };
  const output = { kind: 'approved_narration', flow_result: flowResult,
    text: approvedOutput.prose };
  output.canonical_digest = computeSpatialV3CanonicalDigest(output);
  return flowResult;
}

function idempotencyRecord() {
  return {
    id: 'idempotency-row-screen-replay',
    request_id: 'request-screen-replay',
    operation_kind: 'turn',
    status: 'committed',
    result_change_set_id: changeSetId,
    semantic_command_snapshot: {
      input_digest: inputDigest,
      selected_option_id: 'talk',
      action_set_digest: 'actions-screen-replay'
    },
    semantic_command_digest: 'semantic-command-digest',
    semantic_dependency_pins: []
  };
}

function poolForReplay({ state, screen, visiblePayload, narration }) {
  const record = idempotencyRecord();
  const packageDigest = state.last_turn.visible_package.package_digest;
  const persistedRow = {
    screen,
    turn_number: state.party_state.turn_number,
    party_id: partyId,
    package_id: packageId,
    turn_id: 'turn-2',
    committed_state_version: state.party_state.state_version,
    package_digest: packageDigest,
    visible_payload: visiblePayload,
    state_payload: structuredClone(state),
    snapshot_payload: structuredClone(state),
    state_digest: canonicalDigest(state),
    package_snapshot_digest: canonicalDigest(state),
    dependency_pins: [],
    source_dependency_pins: [],
    narration_status: 'delivered',
    delivery_mode: 'narrated',
    narration_output: narrationOutput(narration, packageDigest),
    output_digest: narrationOutput(narration, packageDigest).canonical_digest,
    factual_screen: null
  };
  return {
    async query(query) {
      const sql = typeof query === 'string' ? query : query.text;
      if (sql.includes('FROM party_runtime.party_command_idempotency')) {
        return { rowCount: 1, rows: [record] };
      }
      if (sql.includes('session.screen')) {
        return { rowCount: 1, rows: [persistedRow] };
      }
      if (sql.includes('package_snapshot.state_payload AS snapshot_payload')) {
        return { rowCount: 1, rows: [persistedRow] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
}

function narrationOutput(narration, packageDigest) {
  const flowResult = structuredClone(narration);
  delete flowResult.presentation;
  const output = { kind: 'approved_narration',
    flow_result: flowResult, text: narration.approved_output.prose,
    package_digest: packageDigest };
  output.canonical_digest = computeSpatialV3CanonicalDigest(output);
  return output;
}
