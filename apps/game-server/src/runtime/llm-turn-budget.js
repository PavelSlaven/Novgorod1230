import { AsyncLocalStorage } from 'node:async_hooks';

export const GAMEPLAY_TURN_DEADLINE_MS = 30_000;
export const GAMEPLAY_LLM_BUDGET_MS = 25_000;
export const GAMEPLAY_DETERMINISTIC_RESERVE_MS = 5_000;
export const GAMEPLAY_PRIMARY_TIMEOUT_MS = 10_000;
export const GAMEPLAY_REPAIR_TIMEOUT_MS = 6_000;

export function createLlmTurnBudget({ now = () => Date.now() } = {}) {
  const storage = new AsyncLocalStorage();
  const current = () => storage.getStore() ?? null;
  const remaining = () => {
    const turn = current();
    if (!turn) return null;
    const elapsed = Math.max(0, now() - turn.started_at);
    return Object.freeze({
      turn,
      elapsed_ms: elapsed,
      llm_budget_ms: Math.max(0, turn.llm_budget_ms - elapsed),
      deadline_ms: Math.max(0, turn.turn_deadline_ms - elapsed)
    });
  };
  return Object.freeze({
    current,
    remaining,
    async runTurn(execute, { startedAt = now() } = {}) {
      const started_at = startedAt;
      return storage.run(Object.freeze({ started_at, turn_deadline_ms: GAMEPLAY_TURN_DEADLINE_MS,
        llm_budget_ms: GAMEPLAY_LLM_BUDGET_MS }), execute);
    },
    clamp({ requestedTimeoutMs = null, repair = false } = {}) {
      const available = remaining();
      if (!available) return null;
      const cap = repair ? GAMEPLAY_REPAIR_TIMEOUT_MS : GAMEPLAY_PRIMARY_TIMEOUT_MS;
      const requested = positive(requestedTimeoutMs) ?? cap;
      const effective = Math.min(requested, cap, available.llm_budget_ms,
        Math.max(0, available.deadline_ms - GAMEPLAY_DETERMINISTIC_RESERVE_MS));
      if (effective < Math.min(requested, 1_000)) throw exhausted(available, true);
      return effective;
    },
    assertCanCommit() {
      const available = remaining();
      if (available && available.deadline_ms <= GAMEPLAY_DETERMINISTIC_RESERVE_MS) {
        throw exhausted(available, true);
      }
    }
  });
}

export function isRepairRole(roleId, contract = null) {
  return contract?.repair === true || /repair/u.test(String(roleId ?? ''));
}

export function exhausted(remaining, budgetExhausted = false) {
  const error = new Error('Gameplay LLM turn budget is exhausted.');
  error.code = 'LLM_TURN_BUDGET_EXHAUSTED';
  error.deadline_exceeded = remaining.deadline_ms <= 0;
  error.budget_exhausted = budgetExhausted || remaining.llm_budget_ms <= 0;
  error.remaining_llm_budget_ms = remaining.llm_budget_ms;
  error.remaining_turn_deadline_ms = remaining.deadline_ms;
  return error;
}

function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null; }
