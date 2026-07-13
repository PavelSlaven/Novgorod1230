import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJournalDetailBlocks,
  buildJournalMessage,
  dedupeDiagnosticJournal,
  formatJournalValue,
  journalEntryHasDetails,
  journalFilterMatches,
  normalizeJournalKind,
  resolveDiagnosticJournal,
  shouldShowJournalRaw
} from '../src/ui/journal-render.js';

test('journal render helpers align with artifact entry shape', () => {
  const entry = {
    kind: 'llm_response',
    label: 'HistoricalDataShaper',
    message: 'готово',
    attempt: 2,
    maxAttempts: 3,
    requestPreview: 'req',
    responsePreview: 'resp',
    validation: { ok: false, errors: [{ message: 'bad' }] },
    includeRawDetails: true,
    requestRaw: [{ role: 'user', content: 'x' }],
    responseRaw: '{"x":1}'
  };

  assert.equal(normalizeJournalKind(entry.kind), 'llm_response');
  assert.match(buildJournalMessage(entry), /попытка 2\/3/);
  assert.equal(shouldShowJournalRaw(entry), true);
  assert.equal(shouldShowJournalRaw(entry, true), true);
  assert.equal(journalEntryHasDetails(entry, true), true);
  assert.equal(journalFilterMatches('llm_response', entry), true);
  assert.equal(journalFilterMatches('validation', entry), false);

  const blocks = buildJournalDetailBlocks(entry, true);
  assert.ok(blocks.some((block) => block.label === 'Запрос · raw'));
  assert.ok(blocks.some((block) => block.label === 'Validation'));
  assert.match(formatJournalValue({ a: 1 }), /"a": 1/);
});

test('process error forces raw visibility in live UI helper', () => {
  const entry = { requestPreview: 'p', responsePreview: 'r' };
  assert.equal(shouldShowJournalRaw(entry, true), true);
  assert.equal(journalEntryHasDetails(entry, true), true);
});

test('resolveDiagnosticJournal prefers diagnosticJournal and dedupes llm pairs', () => {
  const journal = resolveDiagnosticJournal({
    diagnosticJournal: [
      { callId: 'call-1', kind: 'llm_response', responsePreview: 'ok' },
      { callId: 'call-1', kind: 'llm_call', requestPreview: 'req' }
    ]
  });
  assert.equal(journal.length, 1);
  assert.equal(journal[0].kind, 'llm_response');
  assert.equal(journal[0].requestPreview, 'req');
});

test('dedupeDiagnosticJournal keeps conflicting llm pairs', () => {
  const journal = dedupeDiagnosticJournal([
    { callId: 'call-1', kind: 'llm_response', responsePreview: 'a' },
    { callId: 'call-1', kind: 'llm_call', responsePreview: 'b' }
  ]);
  assert.equal(journal.length, 2);
});
