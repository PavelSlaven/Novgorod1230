import assert from 'node:assert/strict';
import test from 'node:test';
import { createLlmTurnBudget, GAMEPLAY_LLM_CALL_TIMEOUT_MS, GAMEPLAY_TURN_DEADLINE_MS } from
  '../src/runtime/llm-turn-budget.js';
import { resolveCommittedPhase2PresentationAfterFailure } from
  '../src/runtime/lower-dvina-trace-phase-2-presentation-resolve.js';

const replay = {
  input_digest: 'd'.repeat(64),
  state: {
    party_id: 'party-1',
    party_state: { state_version: 3, turn_number: 2 },
    last_turn: { idempotency_key: 'idem-1', option_id: 'opt', visible_package: {
      package_id: 'pkg', package_digest: 'dig', change_set_id: 1 } }
  },
  screen: {
    screen_status: 'committed_presentation_pending',
    party_id: 'party-1',
    turn_id: 'turn-1',
    turn_number: 2,
    current_projection_anchor: { committed_state_version: 3,
      package_id: 'pkg', package_digest: 'dig' }
  },
  public_result: {
    party_id: 'party-1',
    turn_number: 2,
    state_version: 3,
    option_id: 'opt',
    screen: {
      screen_status: 'committed_presentation_pending',
      party_id: 'party-1',
      turn_id: 'turn-1',
      turn_number: 2,
      current_projection_anchor: { committed_state_version: 3,
        package_id: 'pkg', package_digest: 'dig' }
    }
  }
};

test('budget exhaustion while loading replay returns pending fallback', async () => {
  const turnBudget = createLlmTurnBudget();
  const pending = structuredClone(replay.public_result);
  const repository = {
    async loadPhase2Replay() {
      const error = new Error('Gameplay turn safety deadline is exhausted.');
      error.code = 'LLM_TURN_BUDGET_EXHAUSTED';
      throw error;
    },
    async replayPhase2Turn() {
      throw new Error('unexpected replay');
    }
  };
  const result = await turnBudget.runTurn(() =>
    resolveCommittedPhase2PresentationAfterFailure({
      partyId: 'party-1',
      idempotencyKey: 'idem-1',
      inputDigest: replay.input_digest,
      repository,
      narrator: { async run() {} },
      turnBudget,
      fallback: pending
    }));
  assert.equal(result.screen.screen_status, 'committed_presentation_pending');
});

test('replay failure after one attempt returns pending when fallback matches', async () => {
  let replayCalls = 0;
  const pending = structuredClone(replay.public_result);
  const repository = {
    async loadPhase2Replay() { return structuredClone(replay); },
    async replayPhase2Turn() {
      replayCalls += 1;
      throw Object.assign(new Error('narration rejected'), {
        code: 'TRACE_PHASE_2_NARRATION_REJECTED'
      });
    }
  };
  const result = await resolveCommittedPhase2PresentationAfterFailure({
    partyId: 'party-1',
    idempotencyKey: 'idem-1',
    inputDigest: replay.input_digest,
    repository,
    narrator: { async run() {} },
    turnBudget: null,
    fallback: pending
  });
  assert.equal(result.screen.screen_status, 'committed_presentation_pending');
  assert.equal(replayCalls, 1);
});

function clockedBudget() {
  const clock = { now: 0 };
  return { clock, turnBudget: createLlmTurnBudget({ now: () => clock.now }) };
}

const resolveWith = (repository, turnBudget) => resolveCommittedPhase2PresentationAfterFailure({
  partyId: 'party-1', idempotencyKey: 'idem-1', inputDigest: replay.input_digest, repository,
  narrator: { async run() {} }, turnBudget, fallback: structuredClone(replay.public_result) });

test('a replay loader that enforces the turn deadline itself yields pending, not an error',
  async () => {
    const { clock, turnBudget } = clockedBudget();
    let replayCalls = 0;
    const repository = {
      async loadPhase2Replay({ turnBudget: budget }) {
        clock.now = GAMEPLAY_TURN_DEADLINE_MS + 1;
        budget.assertWithinDeadline();
        return structuredClone(replay);
      },
      async replayPhase2Turn() { replayCalls += 1; return { screen: { screen_status: 'ready' } }; }
    };
    const result = await turnBudget.runTurn(() => resolveWith(repository, turnBudget));
    assert.equal(result.screen.screen_status, 'committed_presentation_pending');
    assert.equal(replayCalls, 0);
  });

test('the retry does not start when the rest of the deadline is not one narrator call',
  async () => {
    const { clock, turnBudget } = clockedBudget();
    let replayCalls = 0;
    const repository = {
      async loadPhase2Replay() { return structuredClone(replay); },
      async replayPhase2Turn() { replayCalls += 1; return { screen: { screen_status: 'ready' } }; }
    };
    const tight = await turnBudget.runTurn(() => {
      clock.now = GAMEPLAY_TURN_DEADLINE_MS - GAMEPLAY_LLM_CALL_TIMEOUT_MS;
      return resolveWith(repository, turnBudget);
    });
    assert.equal(tight.screen.screen_status, 'committed_presentation_pending');
    assert.equal(replayCalls, 0, 'remaining equals one call timeout: no retry');
    clock.now = 0;
    const roomy = await turnBudget.runTurn(() => {
      clock.now = GAMEPLAY_TURN_DEADLINE_MS - GAMEPLAY_LLM_CALL_TIMEOUT_MS - 1;
      return resolveWith(repository, turnBudget);
    });
    assert.equal(roomy.screen.screen_status, 'ready');
    assert.equal(replayCalls, 1);
  });

test('unexpected loader failures are not swallowed', async () => {
  const repository = {
    async loadPhase2Replay() { throw Object.assign(new Error('db down'), { code: 'DATABASE_UNAVAILABLE' }); },
    async replayPhase2Turn() { throw new Error('unexpected'); }
  };
  await assert.rejects(resolveWith(repository, null), { code: 'DATABASE_UNAVAILABLE' });
});
