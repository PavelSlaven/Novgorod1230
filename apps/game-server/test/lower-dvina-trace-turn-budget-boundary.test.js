import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';
import { executeTraceTurnWithDiagnostics } from '../src/runtime/lower-dvina-trace-phase-2-runtime-input.js';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';

test('trace retry shares one turn budget context', async () => {
  const budget = createLlmTurnBudget();
  const diagnostics = createLlmDiagnostics({ turnBudget: budget });
  const contexts = [];
  let attempts = 0;
  const result = await executeTraceTurnWithDiagnostics(diagnostics,
    { party_id: 'party-1', request_id: 'request-1' }, async () => {
      contexts.push(budget.current());
      if (attempts++ === 0) {
        const error = new Error('retry');
        error.code = 'TRACE_PHASE_7_AUTONOMOUS_RETRY_REQUIRED';
        throw error;
      }
      return 'done';
    });
  assert.equal(result, 'done');
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0], contexts[1]);
});

test('pre-commit reserve blocks phase 2 repository commit', async () => {
  let now = 0;
  const budget = createLlmTurnBudget({ now: () => now });
  const diagnostics = createLlmDiagnostics({ now: () => now, turnBudget: budget });
  const f = fixture({ llmDiagnostics: diagnostics, beforeRandomSource() { now = 25_000; } });
  await assert.rejects(f.runtime.submitTurn({ partyId: f.partyId, input: {
    request_id: 'budget-precommit', idempotency_key: 'budget-precommit',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  } }), (error) => {
    assert.equal(error.code, 'LLM_TURN_BUDGET_EXHAUSTED');
    assert.equal(error.budget_exhausted, true);
    assert.equal(error.deadline_exceeded, false);
    return true;
  });
  assert.equal(f.commitCount(), 0);
});

test('pre-commit reserve permits phase 2 repository commit before boundary', async () => {
  let now = 0;
  const budget = createLlmTurnBudget({ now: () => now });
  const diagnostics = createLlmDiagnostics({ now: () => now, turnBudget: budget });
  const f = fixture({ llmDiagnostics: diagnostics, beforeRandomSource() { now = 24_999; } });
  await f.runtime.submitTurn({ partyId: f.partyId, input: {
    request_id: 'budget-precommit-ok', idempotency_key: 'budget-precommit-ok',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  } });
  assert.equal(f.commitCount(), 1);
});
