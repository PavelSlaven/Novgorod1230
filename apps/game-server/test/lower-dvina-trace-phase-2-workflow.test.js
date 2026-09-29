import assert from 'node:assert/strict';
import test from 'node:test';

import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';

test('narration failure retries presentation in the same turn request', async () => {
  let narrationAttempts = 0;
  const diagnostics = createLlmDiagnostics();
  const f = fixture({
    llmDiagnostics: diagnostics,
    narrationFails: true
  });
  const originalRun = f.repository.replayPhase2Turn.bind(f.repository);
  f.repository.replayPhase2Turn = async (input) => {
    narrationAttempts += 1;
    if (narrationAttempts < 2) {
      const error = new Error('Narration did not produce an approved presentation.');
      error.code = 'TURN_NARRATION_REJECTED';
      throw error;
    }
    f.setNarrationFails(false);
    return originalRun(input);
  };
  const input = {
    request_id: 'phase2-same-request-recovery',
    idempotency_key: 'phase2-same-request-recovery',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  };
  const result = await f.runtime.submitTurn({ partyId: f.partyId, input });
  assert.equal(result.screen.screen_status, 'ready');
  assert.equal(f.commitCount(), 1);
  assert.ok(narrationAttempts >= 1);
});

test('narration-stage failure records one partial workflow trace and replays pending result', async () => {
  const diagnostics = createLlmDiagnostics({ developerMode: true });
  const f = fixture({ narrationFails: true, llmDiagnostics: diagnostics });
  const input = {
    request_id: 'phase2-workflow-failure',
    idempotency_key: 'phase2-workflow-failure',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  };
  const first = await f.runtime.submitTurn({ partyId: f.partyId, input });
  f.setNarrationFails(false);
  await f.runtime.submitTurn({ partyId: f.partyId, input });
  const traces = [
    diagnostics.takeLogReport({ party_id: f.partyId }),
    diagnostics.takeLogReport({ party_id: f.partyId })
  ].flatMap(({ gameplay_traces }) => gameplay_traces);
  const failed = traces.filter(({ event }) => event === 'workflow_failed');

  assert.equal(first.screen.screen_status, 'committed_presentation_pending');
  assert.equal(f.commitCount(), 1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].error.code, 'TURN_NARRATION_REJECTED');
  assert.equal(failed[0].checkpoint.stages.persisted_visible_projection.schema,
    'visible_context_package');
  assert.equal(failed[0].events.at(-1).stageId, 16);
});

test('non-developer narration failure does not retain workflow artifacts', async () => {
  const diagnostics = createLlmDiagnostics();
  const f = fixture({ narrationFails: true, llmDiagnostics: diagnostics });
  await f.runtime.submitTurn({ partyId: f.partyId, input: {
    request_id: 'phase2-workflow-private',
    idempotency_key: 'phase2-workflow-private',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  } });
  const report = diagnostics.takeLogReport({ party_id: f.partyId });
  assert.equal(Object.hasOwn(report, 'gameplay_traces'), false);
  assert.equal(f.commitCount(), 1);
});
