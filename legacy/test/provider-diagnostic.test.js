import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnosticJournal } from '../src/ui/diagnostic-events.js';
import { attachDiagnosticJournal } from '../src/world/provider.js';

test('attachDiagnosticJournal records llm lifecycle from provider hooks', () => {
  const journal = createDiagnosticJournal();
  const stages = [];
  const calls = [];
  const hooks = attachDiagnosticJournal({
    diagnosticJournal: journal,
    provider: 'deepseek',
    model: 'test-model',
    onStage(stage) {
      stages.push(stage.phase);
    },
    onCall(call) {
      calls.push(call.status);
    }
  }, { provider: 'deepseek', model: 'test-model' });

  hooks.onStage({
    phase: 'semantic_shape',
    label: 'HistoricalDataShaper',
    message: 'shape request',
    requestPreview: 'preview',
    requestRaw: [{ role: 'user', content: 'shape' }],
    attempt: 1,
    maxAttempts: 3
  });
  hooks.onCall({
    provider: 'deepseek',
    model: 'test-model',
    status: 'ok',
    durationMs: 120,
    tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
  });
  hooks.onStage({
    phase: 'llm_response',
    label: 'HistoricalDataShaper',
    message: 'HistoricalDataShaper вернул историческую рамку.',
    responsePreview: '{"ok":true}',
    responseRaw: '{"ok":true}',
    attempt: 1,
    maxAttempts: 3
  });

  assert.deepEqual(stages, ['semantic_shape', 'llm_response']);
  assert.deepEqual(calls, ['ok']);
  const snapshot = journal.snapshot({ includeDiagnostics: true, includeRawDetails: true });
  assert.ok(snapshot.some((entry) => entry.kind === 'llm_call'));
  assert.ok(snapshot.some((entry) => entry.kind === 'llm_response'));
  assert.ok(snapshot.some((entry) => entry.tokenUsage?.total_tokens === 30));
});

test('attachDiagnosticJournal is no-op without journal', () => {
  let called = false;
  const hooks = { onStage() { called = true; } };
  const wired = attachDiagnosticJournal(hooks);
  assert.equal(wired, hooks);
  wired.onStage({ phase: 'info' });
  assert.equal(called, true);
});
