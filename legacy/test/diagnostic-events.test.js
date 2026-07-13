import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFailureSummary,
  createDiagnosticJournal,
  parseValidationErrorLine,
  redactSecrets,
  resolveIncludeRawDetails
} from '../src/ui/diagnostic-events.js';

test('resolveIncludeRawDetails is true on error', () => {
  assert.equal(resolveIncludeRawDetails('developer_safe', 'error'), true);
  assert.equal(resolveIncludeRawDetails('developer_safe', 'success'), false);
  assert.equal(resolveIncludeRawDetails('development', 'success'), true);
});

test('redactSecrets keeps structure and hides bearer tokens', () => {
  const redacted = redactSecrets({
    Authorization: 'Bearer sk-live-secret',
    requestRaw: [{ role: 'system', content: 'Bearer abc.def.ghi' }],
    nested: { apiKey: 'secret-key', keep: 'visible' }
  });
  assert.equal(redacted.Authorization, '[REDACTED]');
  assert.equal(redacted.nested.apiKey, '[REDACTED]');
  assert.equal(redacted.nested.keep, 'visible');
  assert.match(redacted.requestRaw[0].content, /\[REDACTED\]/);
  assert.doesNotMatch(redacted.requestRaw[0].content, /abc\.def\.ghi/);
});

test('diagnostic journal assigns callId to llm lifecycle', () => {
  const journal = createDiagnosticJournal();
  const started = journal.recordLlmCallStart({
    phase: 'semantic_shape',
    label: 'HistoricalDataShaper',
    requestPreview: 'shape request',
    attempt: 1
  });
  const finished = journal.recordLlmCallSuccess({
    phase: 'semantic_shape',
    label: 'HistoricalDataShaper',
    responsePreview: '{"ok":true}',
    attempt: 1
  });
  assert.ok(started.callId);
  assert.equal(finished.callId, started.callId);
});

test('diagnostic journal records llm lifecycle and retries', () => {
  const journal = createDiagnosticJournal();
  journal.recordLlmCallStart({
    phase: 'semantic_shape',
    label: 'HistoricalDataShaper',
    requestPreview: 'shape request',
    requestRaw: [{ role: 'user', content: 'shape' }],
    attempt: 1,
    maxAttempts: 3
  });
  journal.recordLlmCallFailure({
    phase: 'semantic_shape',
    label: 'HistoricalDataShaper',
    responsePreview: '{"season":"поздняя осень"}',
    responseRaw: '{"season":"поздняя осень"}',
    error: 'validation failed',
    attempt: 1,
    maxAttempts: 3
  });
  journal.recordRetry({
    phase: 'llm_retry',
    label: 'Повтор рамки',
    message: 'retrying',
    attempt: 2,
    maxAttempts: 3,
    retry: { reason: 'season enum', delayMs: 1000 }
  });

  const snapshot = journal.snapshot({ includeDiagnostics: true, includeRawDetails: true });
  assert.equal(snapshot.length, 3);
  assert.equal(snapshot[0].kind, 'retry');
  assert.equal(snapshot[1].includeRawDetails, true);
  assert.equal(snapshot[1].requestRaw !== undefined, true);
  assert.equal(snapshot[2].kind, 'llm_call');
});

test('parseValidationErrorLine extracts path expected actual', () => {
  const parsed = parseValidationErrorLine('root.season: expected known season, got поздняя осень');
  assert.equal(parsed.path, 'root.season');
  assert.equal(parsed.expected, 'known season');
  assert.equal(parsed.actual, 'поздняя осень');
});

test('buildFailureSummary derives season enum guidance', () => {
  const journal = createDiagnosticJournal();
  journal.recordValidationFailure({
    phase: 'semantic_shape',
    label: 'HistoricalDataShaper',
    validation: {
      ok: false,
      errors: [{ path: 'root.season', expected: 'known season', actual: 'поздняя осень' }]
    },
    attempt: 3,
    maxAttempts: 3
  });
  const summary = buildFailureSummary(journal.events, {
    status: 'error',
    error: new Error('Unable to generate historical frame: root.season: expected known season, got поздняя осень')
  });
  assert.match(summary.rootCause ?? '', /root\.season/i);
  assert.match(summary.suggestedFix ?? '', /season/i);
  assert.equal(summary.failedAttempt, 3);
});
