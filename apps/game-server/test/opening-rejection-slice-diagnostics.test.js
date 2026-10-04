import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpApi } from '../../../tools/local-play/v17-slice-run.mjs';
import { runLegs } from '../../../tools/local-play/v17-slice-legs.js';
import { partyIdFromNewGameRequestId } from '../../../tools/local-play/v17-slice-opening-trace.js';
import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { buildOpeningRejectionSnapshot } from '../src/runtime/opening-rejection-snapshot.js';
import { createGameHttpServer, listen } from '../src/index.js';

function openingRejectSnapshot(prose) {
  return buildOpeningRejectionSnapshot({
    prose,
    audit: {
      pass: false,
      concerns: [{ code: 'NARRATOR_PROSE_MUST_INCLUDE_MISSING', severity: 'repairable',
        message: 'gap' }],
      evidence: ['gap'],
      codes: ['NARRATOR_PROSE_MUST_INCLUDE_MISSING']
    },
    repair: { attempted: true, outcome: 'still_rejected' }
  });
}

test('runLegs reads opening rejection from developer LLM report after public new-game failure', async () => {
  const requestId = 'slice-r-start';
  const partyId = partyIdFromNewGameRequestId(requestId);
  const diagnostics = createLlmDiagnostics({ developerMode: true });
  const prose = 'Черновик.';
  let newGames = 0;
  const api = {
    async newGame() {
      newGames += 1;
      if (newGames > 1) {
        return { status: 200, ok: true,
          data: { party_id: 'p1', screen: { main_prose: 'Финал.', labels: [] } } };
      }
      await assert.rejects(diagnostics.runTurn({ party_id: partyId, request_id: requestId },
        async () => {
          throw Object.assign(new Error('rejected'), {
            code: 'AUTHORED_OPENING_AUDIT_REJECTED',
            status: 409,
            details: { opening_rejection: openingRejectSnapshot(prose) }
          });
        }));
      return { status: 409, ok: false, data: null,
        error: { code: 'AUTHORED_OPENING_AUDIT_REJECTED' } };
    },
    async llmTurnReport(id, rid) {
      const report = diagnostics.report({ party_id: id, request_id: rid });
      return { ok: true, data: report };
    },
    async ack() { return { ok: true, data: {} }; },
    async screen() { return { ok: true, data: { screen: { main_prose: 'Финал.', labels: [] } } }; },
    async turn() { return { ok: true, data: {} }; },
    async recover() { return { ok: true, data: {} }; }
  };
  const sql = { snapshot: async () => ({
    state_version: 1,
    position: { canonical_g5: 'cg5v3__x_r2_work_storage', site_id: 's', slot: 'arrival' }
  }) };
  const result = await runLegs({
    api, sql, routeLabels: () => [], llm: { count: () => 0 },
    scenarioId: 's', runId: 'r', maxTurns: 0
  });
  assert.equal(result.opening.rejections, 1);
  assert.equal(result.opening.opening_attempts[0].writer_prose, prose);
  assert.equal(result.opening.opening_attempts[0].stage23.codes[0], 'NARRATOR_PROSE_MUST_INCLUDE_MISSING');
  assert.equal(result.legs.find(({ id }) => id === 'start').status, 'pass');
});

test('createHttpApi developer GET and runLegs expose stage23 without forbidden audit key', async (t) => {
  const diagnostics = createLlmDiagnostics({ developerMode: true });
  const requestId = 'slice-r-start';
  const partyId = partyIdFromNewGameRequestId(requestId);
  const prose = 'Черновик.';
  let newGames = 0;
  const root = {
    getLlmTurnReport: (input) => diagnostics.report(input),
    async startNewGame() {
      newGames += 1;
      if (newGames > 1) {
        return { party_id: 'p1', screen: { main_prose: 'Финал.', labels: [] } };
      }
      await assert.rejects(diagnostics.runTurn({ party_id: partyId, request_id: requestId },
        async () => {
          throw Object.assign(new Error('rejected'), {
            code: 'AUTHORED_OPENING_AUDIT_REJECTED',
            status: 409,
            details: { opening_rejection: openingRejectSnapshot(prose) }
          });
        }), { code: 'AUTHORED_OPENING_AUDIT_REJECTED' });
      throw Object.assign(new Error('rejected'), {
        code: 'AUTHORED_OPENING_AUDIT_REJECTED',
        status: 409
      });
    },
    acknowledgeOpening: async () => ({}),
    getPartyScreen: async () => ({ screen: { main_prose: 'Финал.', labels: [] } }),
    submitTurn: async () => ({}),
    recoverPendingPresentation: async () => ({})
  };
  const server = createGameHttpServer({ root, developerMode: true });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const api = createHttpApi(baseUrl, globalThis.fetch);
  const sql = { snapshot: async () => ({
    state_version: 1,
    position: { canonical_g5: 'cg5v3__x_r2_work_storage', site_id: 's', slot: 'arrival' }
  }) };
  const result = await runLegs({
    api, sql, routeLabels: () => [], llm: { count: () => 0 },
    scenarioId: 's', runId: 'r', maxTurns: 0
  });
  assert.equal(result.opening.rejections, 1);
  assert.equal(result.opening.opening_attempts[0].writer_prose, prose);
  assert.equal(result.legs.find(({ id }) => id === 'start').status, 'pass');

  const report = await api.llmTurnReport(partyId, requestId);
  assert.equal(report.ok, true);
  assert.equal(report.status, 200);
  assert.equal(report.data.failure.opening_rejection.writer_prose, prose);
  assert.equal(report.data.failure.opening_rejection.stage23.codes[0],
    'NARRATOR_PROSE_MUST_INCLUDE_MISSING');
  assert.equal(JSON.stringify(report.data).includes('"audit"'), false);
});
