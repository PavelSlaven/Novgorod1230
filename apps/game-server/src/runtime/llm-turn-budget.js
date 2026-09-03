import { AsyncLocalStorage } from 'node:async_hooks';

const GAMEPLAY_LLM_CALL_TIMEOUT_MS = 120_000;

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
      llm_budget_ms: null,
      deadline_ms: null
    });
  };
  return Object.freeze({
    current,
    remaining,
    async runTurn(execute, { startedAt = now() } = {}) {
      if (current()) return execute();
      const started_at = startedAt;
      return storage.run({ started_at, repair_claims: new Map() }, execute);
    },
    claimRepair({ requestIdentity = null, repairKind = null } = {}) {
      const turn = current();
      if (!turn) return null;
      const request_identity = String(requestIdentity ?? '').trim();
      if (!request_identity) throw repairIdentityRequired();
      const repair_kind = String(repairKind ?? '').trim();
      if (!repair_kind) throw repairKindRequired();
      const claim = Object.freeze({ request_identity, repair_kind });
      const claimedKinds = turn.repair_claims.get(request_identity) ?? new Set();
      if (claimedKinds.has(repair_kind)) throw repairClaimed(claim);
      claimedKinds.add(repair_kind);
      turn.repair_claims.set(request_identity, claimedKinds);
      return claim;
    },
    clamp() {
      if (!current()) return null;
      return GAMEPLAY_LLM_CALL_TIMEOUT_MS;
    },
    assertCanCommit() {
      return null;
    },
    assertWithinDeadline() {
      return null;
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

export function repairClaimed(claim) {
  const error = new Error('Gameplay turn repair budget is already claimed.');
  error.code = 'LLM_TURN_REPAIR_ALREADY_CLAIMED';
  error.request_identity = claim.request_identity;
  error.repair_kind = claim.repair_kind;
  return error;
}

function repairIdentityRequired() {
  const error = new Error('Gameplay repair requires an immutable request identity.');
  error.code = 'LLM_TURN_REPAIR_IDENTITY_REQUIRED';
  return error;
}

function repairKindRequired() {
  const error = new Error('Gameplay repair requires a repair boundary kind.');
  error.code = 'LLM_TURN_REPAIR_KIND_REQUIRED';
  return error;
}

const REPAIR_ROLE_IDS = new Set([
  'turn_step_planner_repair',
  'player_conversation_interpreter_format_repair',
  'npc_conversation_responder_format_repair',
  'npc_autonomous_decider_format_repair',
  'npc_combat_decider_format_repair',
  'gameplay_narrator_format_repair',
  'gameplay_narrator_semantic_repair'
]);
