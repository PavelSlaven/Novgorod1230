import assert from 'node:assert/strict';
import test from 'node:test';

import { openingAttemptFromNewGame, partyIdFromNewGameRequestId, renderOpeningAttemptsTable } from '../v17-slice-opening-trace.js';
import { renderPlaytestMarkdown } from '../v17-slice-report.js';
import { safeTurnFailure } from '../../../apps/game-server/src/runtime/llm-diagnostics-failures.js';

const ACCEPT_SNAPSHOT = {
  writer_prose: 'Финал.',
  stage23: { pass: true, concerns: [], evidence: [], codes: [] },
  repair: { observed: true, attempted: true }
};

const REJECT_SNAPSHOT = {
  writer_prose: 'Вы стоите у сруба.',
  stage23: {
    pass: false,
    concerns: [{ code: 'NARRATOR_PROSE_MUST_INCLUDE_MISSING', severity: 'repairable',
      message: 'Missing shore fact.' }],
    evidence: ['Shore was required.'],
    codes: ['NARRATOR_PROSE_MUST_INCLUDE_MISSING']
  },
  repair: { observed: true, attempted: true, outcome: 'still_rejected' }
};

test('partyIdFromNewGameRequestId is stable and matches runtime shape', () => {
  const id = partyIdFromNewGameRequestId('slice-abc-start');
  assert.match(id, /^party:[0-9a-f]{24}$/u);
  assert.equal(partyIdFromNewGameRequestId('slice-abc-start'), id);
});

test('openingAttemptFromNewGame uses developer failure, not the public HTTP error', () => {
  const attempt = openingAttemptFromNewGame({
    n: 1, ok: false,
    error: { code: 'AUTHORED_OPENING_AUDIT_REJECTED' },
    devReport: { failure: { code: 'AUTHORED_OPENING_AUDIT_REJECTED', opening_rejection: REJECT_SNAPSHOT } }
  });
  assert.equal(attempt.outcome, 'rejected');
  assert.equal(attempt.writer_prose, REJECT_SNAPSHOT.writer_prose);
  assert.deepEqual(attempt.stage23.codes, ['NARRATOR_PROSE_MUST_INCLUDE_MISSING']);
  assert.equal(attempt.repair.outcome, 'still_rejected');
});

test('openingAttemptFromNewGame records stage23 and repair for accepted attempts from developer report', () => {
  const immediate = openingAttemptFromNewGame({
    n: 2, ok: true, data: { screen: { main_prose: 'Финал.' } },
    devReport: { opening_attempt: {
      writer_prose: 'Финал.',
      stage23: { pass: true, concerns: [], evidence: [], codes: [] },
      repair: { observed: true, attempted: false }
    } }
  });
  assert.equal(immediate.stage23.pass, true);
  assert.equal(immediate.repair.attempted, false);
  const afterRepair = openingAttemptFromNewGame({
    n: 2, ok: true, data: { screen: { main_prose: 'Финал.' } },
    devReport: { opening_attempt: ACCEPT_SNAPSHOT }
  });
  assert.equal(afterRepair.repair.attempted, true);
});

test('openingAttemptFromNewGame ignores opening_rejection on the public error envelope', () => {
  const attempt = openingAttemptFromNewGame({
    n: 1, ok: false,
    error: { code: 'AUTHORED_OPENING_AUDIT_REJECTED', opening_rejection: REJECT_SNAPSHOT }
  });
  assert.equal(attempt.writer_prose, '');
  assert.equal(attempt.repair.observed, false);
  assert.equal(attempt.repair.attempted, null);
});

test('safeTurnFailure keeps opening_rejection for developer LLM reports', () => {
  const failure = safeTurnFailure({
    code: 'AUTHORED_OPENING_AUDIT_REJECTED',
    details: { opening_rejection: REJECT_SNAPSHOT }
  });
  assert.equal(failure.opening_rejection.writer_prose, REJECT_SNAPSHOT.writer_prose);
});

test('report opening_attempts shape is stable in playtest markdown table', () => {
  const report = {
    identity: { run_id: 'r', scenario_id: 's', branch: 'b', head: 'abc', dirty: false,
      started_at: 't0', ended_at: 't1', duration_ms: 1, model: 'm', llm_settings_path: '/p' },
    preconditions: { postgres_image: 'x', wk_encoder: 'stub', max_turns: 1, reserve_make: 0,
      deadline_min: 1, qualification: 'ok' },
    opening: {
      attempts: 2, rejections: 1, party_id: 'party:1', prose: 'Финал.',
      opening_attempts: [
        openingAttemptFromNewGame({ n: 1, ok: false,
          error: { code: 'AUTHORED_OPENING_AUDIT_REJECTED' },
          devReport: { failure: { opening_rejection: REJECT_SNAPSHOT } } }),
        openingAttemptFromNewGame({ n: 2, ok: true, data: { screen: { main_prose: 'Финал.' } },
          devReport: { opening_attempt: ACCEPT_SNAPSHOT } })
      ],
      route_labels: []
    },
    legs: [{ id: 'start', status: 'pass', reason: 'ok' }, { id: 'walk', status: 'blocked', reason: 'x' },
      { id: 'meet', status: 'blocked', reason: 'x' }, { id: 'talk', status: 'blocked', reason: 'x' },
      { id: 'take', status: 'blocked', reason: 'x' }, { id: 'make', status: 'blocked', reason: 'x' }],
    turns: [],
    llm: { total: 0, failed: 0, by_role: {} },
    readback: null,
    infra_error: null
  };
  const md = renderPlaytestMarkdown(report);
  assert.ok(md.includes('Попытки вступления (new-game):'));
  assert.ok(md.includes('| 1 | rejected | NARRATOR_PROSE_MUST_INCLUDE_MISSING | still_rejected |'));
  assert.ok(md.includes('| 2 | accepted | — | attempted |'));
});
