import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createHttpHandler } from '../src/http/handler.js';
import { createLowerDvinaTracePhase2DurableNarrator } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { phase2VisibleContextFromPayload } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { recoverTracePendingPresentation } from
  '../src/runtime/lower-dvina-trace-presentation-recovery.js';
import { reviewedNarration } from './narration-audit-fixture.js';

const markedProse = 'Вы идёте через Проход 2.';
const visiblePayload = { schema: 'temporal_visible_package.v1',
  perceived_scene: 'Берег.', perceived_changes: [], sensory_details: [],
  visible_npcs: [], visible_objects: [], known_context: [], uncertainties: [],
  hypotheses: [], player_safe_interruption: null, allowed_action_affordances: [] };
const visibleContext = phase2VisibleContextFromPayload(visiblePayload);
const snapshotPayload = { party_id: 'party-1', actor_id: 'actor-1',
  party_state: { turn_number: 7, state_version: 39 },
  opening_identity: { opening_screen_digest: 'opening' },
  last_turn: { received_at: '2026-10-02T00:00:00.000Z' } };
const envelope = { party_id: 'party-1', package_id: 'package-1', turn_id: 'turn-1',
  committed_state_version: 39, package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
  visible_payload: visiblePayload, snapshot_payload: snapshotPayload,
  state_digest: canonicalDigest(snapshotPayload) };
const narrationRequest = { version: 1, schema: 'narration_request',
  request_id: 'turn-1', party_id: 'party-1', delivery_turn_number: 7,
  surface: 'turn', visible_context: visibleContext };

function buildNarration(prose = markedProse) {
  const roles = [];
  const narrationService = createLowerDvinaTraceNarrationService({ roleRunner: {
    async run(call) {
      roles.push(call.role_id);
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose, action_options: [], used_references: []
      } };
      if (call.role_id === 'gameplay_narrator_semantic_repair') return { output: {
        replacements: [{ prose }]
      } };
      if (call.role_id === 'gameplay_narrator_auditor') {
        return { output: reviewedNarration(
          JSON.parse(call.messages[1].content).segments) };
      }
      throw new Error(`Unexpected narration role ${call.role_id}`);
    }
  } });
  return { narrationService, roles };
}

function request(method, url, body) {
  const req = Readable.from(body == null ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost' };
  return req;
}

async function send(handler, method, url, body) {
  const response = { writeHead(status) { this.status = status; },
    end(value) { this.body = JSON.parse(value); } };
  await handler(request(method, url, body), response);
  return response;
}

test('production narrator rejects ordinal, calibration and code markers despite auditor PASS', async () => {
  for (const prose of [markedProse, 'INFERENCE: Берёза видна у ворот.',
    'runtime_text', 'SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP']) {
    const { narrationService, roles } = buildNarration(prose);
    const flow = await narrationService.run(narrationRequest);
    assert.equal(flow.status, 'blocked');
    assert.equal(flow.diagnostics.phase, 'generated_prose_admission_failed');
    assert.equal(flow.approved_output, null);
    assert.equal(roles.filter((role) => role === 'gameplay_narrator_auditor').length, 1);
    assert.equal(roles.filter((role) => role === 'gameplay_narrator_semantic_repair').length, 1);
    assert.equal(JSON.stringify(flow.diagnostics).includes(prose), false);
  }
});

test('auditor PASS cannot persist marked prose; GET and recovery replay keep committed turn pending', async () => {
  const { narrationService, roles } = buildNarration();
  const storeCalls = [], diagnosticDetails = [];
  let attemptOrdinal = 0;
  const presentationStore = {
    async claimPresentationAttempt() {
      attemptOrdinal += 1;
      return { ok: true, disposition: 'claimed', attempt_id: `attempt-${attemptOrdinal}`,
        claim_token: `claim-${attemptOrdinal}` };
    },
    async finalizePresentationAttempt(input) {
      storeCalls.push(input.presentation_status);
      return { ok: true, presentation_status: input.presentation_status };
    },
    async persistNarrationOutput() {
      storeCalls.push('output_ready');
      return { ok: true, disposition: 'output_ready' };
    },
    async finalizeFactualPresentationAttempt() {
      storeCalls.push('factual_delivered');
      return { ok: true, presentation_status: 'factual_delivered' };
    }
  };
  const durableNarrator = createLowerDvinaTracePhase2DurableNarrator({
    partyPool: { async query() { return { rows: [envelope] }; } },
    narrationService, presentationStore,
    recordDiagnosticFailure: (failure) => diagnosticDetails.push(failure.details)
  });
  const pendingScreen = { version: 1, schema: 'lower_dvina_trace_turn_screen',
    party_id: 'party-1', turn_id: 'turn-1', turn_number: 7,
    screen_status: 'committed_presentation_pending',
    main_prose: 'Факты хода сохранены; повествование ожидает повторной доставки.' };
  const screenResult = { party_id: 'party-1', turn_number: 7, state_version: 39,
    screen: pendingScreen };
  const visible = { package_id: 'package-1', package_digest: envelope.package_digest };
  const replay = { input_digest: 'd'.repeat(64), screen: pendingScreen,
    state: { party_id: 'party-1', party_state: { state_version: 39, turn_number: 7 },
      last_turn: { idempotency_key: 'turn-1', option_id: 'wait',
        visible_package: visible } },
    public_result: { party_id: 'party-1', option_id: 'wait', turn_number: 7,
      state_version: 39, screen: pendingScreen } };
  let commits = 0, rngDraws = 0, screenReads = 0, recoveryCalls = 0;
  let currentScreen = pendingScreen;
  const repository = {
    async loadPhase2State() { return { last_turn: { idempotency_key: 'turn-1' } }; },
    async loadPhase2Replay() { return structuredClone(replay); },
    async replayPhase2Turn() { return durableNarrator.run(narrationRequest); }
  };
  const readPending = async () => {
    const recovered = await recoverTracePendingPresentation({ partyId: 'party-1',
      session: { screen: currentScreen }, repository, narrator: durableNarrator,
      turnBudget: null });
    if (recovered?.screen) currentScreen = recovered.screen;
    return screenResult;
  };
  const handler = createHttpHandler({ root: {
    async submitTurn() {
      commits += 1;
      rngDraws += 1;
      try { await durableNarrator.run(narrationRequest); }
      catch (error) {
        assert.equal(error.code, 'TRACE_PHASE_2_NARRATION_REJECTED');
      }
      return screenResult;
    },
    async getPartyScreen() { screenReads += 1; return readPending(); },
    async recoverPendingPresentation() { recoveryCalls += 1; return readPending(); }
  } });

  const submitted = await send(handler, 'POST', '/api/v1/parties/party-1/turns', {
    raw_text: 'Идти вперёд.', request_id: 'turn-1', idempotency_key: 'turn-1'
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.data.screen.screen_status, 'committed_presentation_pending');
  assert.equal(commits, 1);
  assert.equal(rngDraws, 1);

  const fetched = await send(handler, 'GET', '/api/v1/parties/party-1/screen');
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.screen.screen_status, 'committed_presentation_pending');
  assert.equal(JSON.stringify(fetched.body).includes(markedProse), false);
  assert.equal(commits, 1);
  assert.equal(rngDraws, 1);

  const recovered = await send(handler, 'POST',
    '/api/v1/parties/party-1/presentation-recovery', { request_id: 'turn-1' });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.data.screen.screen_status, 'committed_presentation_pending');
  assert.equal(JSON.stringify(recovered.body).includes(markedProse), false);
  assert.equal(commits, 1);
  assert.equal(rngDraws, 1);
  assert.equal(screenReads, 1);
  assert.equal(recoveryCalls, 1);
  assert.equal(storeCalls.includes('output_ready'), false);
  assert.equal(storeCalls.includes('delivered'), false);
  assert.equal(storeCalls.includes('factual_delivered'), false);
  assert.equal(storeCalls.every((status) => status === 'failed_retryable'), true);
  assert.equal(JSON.stringify(diagnosticDetails).includes(markedProse), false);
  assert.equal(roles.filter((role) => role === 'gameplay_narrator_semantic_repair').length,
    attemptOrdinal);
  assert.equal(attemptOrdinal > 0, true);
});
