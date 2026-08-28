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
      if (current()) return execute();
      const started_at = startedAt;
      return storage.run({ started_at, turn_deadline_ms: GAMEPLAY_TURN_DEADLINE_MS,
        llm_budget_ms: GAMEPLAY_LLM_BUDGET_MS, repair_claim: null }, execute);
    },
    claimRepair({ roleId = null } = {}) {
      const turn = current();
      if (!turn) return null;
      if (turn.repair_claim != null) throw repairClaimed(turn.repair_claim, roleId);
      const claim = Object.freeze({ role_id: String(roleId ?? '').trim() || null });
      turn.repair_claim = claim;
      return claim;
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
    },
    assertWithinDeadline() {
      const available = remaining();
      if (available && available.deadline_ms <= 0) {
        throw exhausted(available);
      }
    }
  });
}

export function isRepairRole(roleId, contract = null) {
  return contract?.repair === true || REPAIR_ROLE_IDS.has(String(roleId ?? ''));
}

export async function runWithinTurnDeadline(turnBudget, execute) {
  turnBudget?.assertWithinDeadline();
  const result = await execute();
  turnBudget?.assertWithinDeadline();
  return result;
}

export function exhausted(remaining, budgetExhausted = false) {
  const error = new Error('Gameplay LLM turn budget is exhausted.');
  error.code = 'LLM_TURN_BUDGET_EXHAUSTED';
  error.deadline_exceeded = remaining.deadline_ms <= 0;
  error.budget_exhausted = budgetExhausted
    || (!error.deadline_exceeded && remaining.llm_budget_ms <= 0);
  error.remaining_llm_budget_ms = remaining.llm_budget_ms;
  error.remaining_turn_deadline_ms = remaining.deadline_ms;
  return error;
}

export function repairClaimed(claim, roleId) {
  const error = new Error('Gameplay turn repair budget is already claimed.');
  error.code = 'LLM_TURN_REPAIR_ALREADY_CLAIMED';
  error.claimed_repair_role_id = claim.role_id;
  error.repair_role_id = String(roleId ?? '').trim() || null;
  return error;
}

const REPAIR_ROLE_IDS = new Set([
  'turn_step_planner_repair',
  'player_conversation_interpreter_format_repair',
  'npc_conversation_responder_format_repair',
  'npc_autonomous_decider_format_repair',
  'npc_combat_decider_format_repair',
  'gameplay_narrator_format_repair'
]);

function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null; }
