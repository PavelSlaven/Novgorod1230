import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmTurnBudget, isRepairRole } from '../src/runtime/llm-turn-budget.js';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createProductionLlmRoleRunner } from '../src/infrastructure/provider/deepseek.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

test('turn budget clamps calls, preserves lower override, and isolates contexts', async () => {
  let now = 0;
  const budget = createLlmTurnBudget({ now: () => now });
  assert.equal(budget.clamp({ requestedTimeoutMs: 99_999 }), null);
  await budget.runTurn(async () => {
    assert.equal(budget.clamp({ requestedTimeoutMs: 12_000 }), 10_000);
    assert.equal(budget.clamp({ requestedTimeoutMs: 500 }), 500);
    assert.equal(budget.clamp({ requestedTimeoutMs: 12_000, repair: true }), 6_000);
    now = 20_000;
    assert.equal(budget.clamp({ requestedTimeoutMs: 10_000 }), 5_000);
    now = 25_000;
    assert.throws(() => budget.clamp({ requestedTimeoutMs: 1 }),
      { code: 'LLM_TURN_BUDGET_EXHAUSTED' });
  });
  await Promise.resolve();
  assert.equal(budget.current(), null);
});

test('repair claim is bounded per role, atomic, and not reset by a nested turn context', async () => {
  const budget = createLlmTurnBudget();
  await budget.runTurn(async () => {
    assert.deepEqual(budget.claimRepair({ roleId: 'turn_step_planner_repair' }),
      { role_id: 'turn_step_planner_repair' });
    assert.deepEqual(budget.claimRepair({ roleId: 'gameplay_narrator_format_repair' }),
      { role_id: 'gameplay_narrator_format_repair' });
    await budget.runTurn(async () => {
      assert.throws(() => budget.claimRepair({ roleId: 'turn_step_planner_repair' }),
        { code: 'LLM_TURN_REPAIR_ALREADY_CLAIMED' });
    });
  });
  await budget.runTurn(async () => {
    const claims = await Promise.allSettled([
      Promise.resolve().then(() => budget.claimRepair({ roleId: 'turn_step_planner_repair' })),
      Promise.resolve().then(() => budget.claimRepair({ roleId: 'turn_step_planner_repair' }))
    ]);
    assert.equal(claims.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(claims.filter(({ reason }) => reason?.code
      === 'LLM_TURN_REPAIR_ALREADY_CLAIMED').length, 1);
  });
  assert.equal(budget.claimRepair({ roleId: 'turn_step_planner_repair' }), null);
});

test('registered gameplay repair roles and explicit ordinary repair marker claim budget', async () => {
  for (const roleId of [
    'turn_step_planner_repair', 'player_conversation_interpreter_format_repair',
    'npc_conversation_responder_format_repair', 'npc_autonomous_decider_format_repair',
    'npc_combat_decider_format_repair', 'gameplay_narrator_format_repair',
    'gameplay_narrator_semantic_repair'
  ]) assert.equal(isRepairRole(roleId), true, roleId);
  assert.equal(isRepairRole('ordinary_materialization'), false);
  const budget = createLlmTurnBudget();
  const runner = createLlmRoleRunnerAdapter({ turnBudget: budget,
    execute: async () => ({ status: 'ok', parsed_json: {}, provider: 'deepseek', model: 'm' }) });
  await budget.runTurn(() => runner.run({ scope: 'turn_runtime',
    role_id: 'ordinary_materialization', repair: true }));
});

test('cross-workflow gameplay repairs execute, duplicate repair is blocked before provider', async () => {
  for (const { first, second, duplicate, nested = false } of [
    { first: 'turn_step_planner_repair', second: 'gameplay_narrator_format_repair' },
    { first: 'player_conversation_interpreter_format_repair',
      second: 'npc_conversation_responder_format_repair' },
    { first: 'npc_autonomous_decider_format_repair',
      second: 'turn_step_planner_repair', nested: true },
    { first: 'gameplay_narrator_format_repair', second: 'gameplay_narrator_semantic_repair' }
  ]) {
    const calls = [];
    const budget = createLlmTurnBudget();
    const runner = createLlmRoleRunnerAdapter({ turnBudget: budget,
      execute: async (input) => {
        calls.push(input);
        return { status: 'ok', parsed_json: {}, provider: 'deepseek', model: 'm' };
      } });
    await budget.runTurn(async () => {
      await runner.run({ scope: 'turn_runtime', role_id: first });
      await runner.run({ scope: 'turn_runtime', role_id: second });
      const retry = () => runner.run({ scope: 'turn_runtime', role_id: duplicate ?? second });
      await assert.rejects(nested ? budget.runTurn(retry) : retry(), (error) => {
        assert.equal(error.code, 'LLM_TURN_REPAIR_ALREADY_CLAIMED');
        assert.equal(error.claimed_repair_role_id, duplicate ?? second);
        return true;
      });
    });
    assert.equal(calls.length, 2, `${first} → ${second}`);
  }
});

test('role runner does not call exhausted provider and clamps custom providers', async () => {
  let now = 0;
  const budget = createLlmTurnBudget({ now: () => now });
  const calls = [];
  const runner = createLlmRoleRunnerAdapter({ turnBudget: budget,
    settings: { providerSnapshot: () => ({ mode: 'custom', baseUrl: 'http://local/v1', model: 'local' }) },
    execute: async (input) => { calls.push(input); return { status: 'ok', parsed_json: {}, provider: 'openai_compatible', model: 'local', durationMs: 1 }; } });
  await budget.runTurn(async () => {
    await runner.run({ scope: 'turn_runtime', role_id: 'turn_step_planner', overrides: { requestTimeoutMs: 400 } });
    assert.equal(calls[0].overrides.requestTimeoutMs, 400);
    assert.equal(calls[0].runtimeProviderOverride.model, 'local');
    now = 25_000;
    await assert.rejects(runner.run({ scope: 'turn_runtime', role_id: 'turn_step_planner' }),
      { code: 'LLM_TURN_BUDGET_EXHAUSTED' });
  });
  assert.equal(calls.length, 1);
});

test('gameplay narrator calls clamp turn-runtime defaults and retain custom provider', async () => {
  const calls = [];
  const budget = createLlmTurnBudget();
  const runner = createLlmRoleRunnerAdapter({ turnBudget: budget,
    settings: { providerSnapshot: () => ({ mode: 'custom', baseUrl: 'http://local/v1', model: 'local-narrator' }) },
    execute: async (input) => {
      calls.push(input);
      return { status: 'ok', parsed_json: {}, provider: 'openai_compatible',
        model: 'local-narrator', durationMs: 1 };
    } });
  await budget.runTurn(async () => {
    await runner.run({ scope: 'turn_runtime', role_id: 'gameplay_narrator' });
    await runner.run({ scope: 'turn_runtime', role_id: 'gameplay_narrator_format_repair' });
  });
  assert.deepEqual(calls.map((call) => call.overrides.requestTimeoutMs), [10_000, 6_000]);
  assert.deepEqual(calls.map((call) => call.runtimeProviderOverride.model),
    ['local-narrator', 'local-narrator']);
});

test('budget rejects default calls with less than one second remaining', async () => {
  let now = 0;
  const budget = createLlmTurnBudget({ now: () => now });
  await budget.runTurn(async () => {
    now = 24_500;
    assert.throws(() => budget.clamp(), (error) => {
      assert.equal(error.code, 'LLM_TURN_BUDGET_EXHAUSTED');
      assert.equal(error.budget_exhausted, true);
      return true;
    });
    assert.equal(budget.clamp({ requestedTimeoutMs: 400 }), 400);
    now = 25_000;
    assert.throws(() => budget.assertCanCommit(), (error) => {
      assert.equal(error.code, 'LLM_TURN_BUDGET_EXHAUSTED');
      assert.equal(error.budget_exhausted, true);
      assert.equal(error.deadline_exceeded, false);
      return true;
    });
  });
  assert.doesNotThrow(() => budget.assertCanCommit());
});

test('production role runner forwards turn budget to adapter', async () => {
  const calls = [];
  const runner = createProductionLlmRoleRunner({ turnBudget: {
    clamp: ({ requestedTimeoutMs }) => Math.min(requestedTimeoutMs, 321)
  }, execute: async (input) => {
    calls.push(input);
    return { status: 'ok', parsed_json: {}, provider: 'deepseek', model: 'm', durationMs: 1 };
  } });
  await runner.run({ scope: 'turn_runtime', role_id: 'turn_step_planner',
    overrides: { requestTimeoutMs: 500 } });
  assert.equal(calls[0].overrides.requestTimeoutMs, 321);
});

test('planner JSON repair keeps the shared repair budget', async () => {
  let now = 0;
  const calls = [];
  const budget = createLlmTurnBudget({ now: () => now });
  const runner = createLlmRoleRunnerAdapter({ turnBudget: budget,
    execute: async (input) => {
      calls.push(input);
      return calls.length === 1
        ? { status: 'parse_error', error: { code: 'json_parse_failed' } }
        : { status: 'ok', parsed_json: {}, provider: 'deepseek',
          model: 'deepseek-v4-flash', durationMs: 1 };
    } });
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: runner });
  await budget.runTurn(async () => {
    assert.deepEqual(await model({}), {});
    now = 20_000;
    await model({}, { structural_errors: [] });
  });
  assert.deepEqual(calls.map(({ roleId }) => roleId), [
    'turn_step_planner', 'turn_step_planner_repair'
  ]);
  assert.equal(calls[0].overrides.requestTimeoutMs, 10_000);
  assert.equal(calls[1].overrides.requestTimeoutMs, 5_000);
});

test('production runner clamps executor then blocks exhausted next call', async () => {
  let now = 0;
  const budget = createLlmTurnBudget({ now: () => now });
  const calls = [];
  const runner = createProductionLlmRoleRunner({ turnBudget: budget,
    execute: async (input) => {
      calls.push(input);
      now = 24_500;
      return { status: 'ok', parsed_json: {}, provider: 'deepseek', model: 'deepseek-v4-flash',
        scope: input.scope, role_id: input.roleId, durationMs: 1, config_hash: 'safe' };
    } });
  await budget.runTurn(async () => {
    await runner.run({ scope: 'turn_runtime', role_id: 'turn_step_planner' });
    await assert.rejects(runner.run({ scope: 'turn_runtime', role_id: 'turn_step_planner' }),
      (error) => {
        assert.equal(error.code, 'LLM_TURN_BUDGET_EXHAUSTED');
        assert.equal(error.budget_exhausted, true);
        assert.deepEqual(Object.keys(error).filter((key) => ['role_id', 'provider', 'model', 'config_hash', 'remaining_llm_budget_ms', 'remaining_turn_deadline_ms'].includes(key)).sort(),
          ['config_hash', 'model', 'provider', 'remaining_llm_budget_ms', 'remaining_turn_deadline_ms', 'role_id']);
        return true;
      });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].overrides.requestTimeoutMs, 10_000);
});

test('admin probe keeps transport timeout outside gameplay default', async () => {
  const calls = [];
  const runner = createProductionLlmRoleRunner({ execute: async (input) => {
    calls.push(input);
    return { status: 'ok', parsed_json: {}, provider: 'openai_compatible', model: 'local', durationMs: 1 };
  } });
  await runner.probe({ mode: 'custom', baseUrl: 'http://local/v1', model: 'local' });
  assert.equal(calls[0].overrides.requestTimeoutMs, 120000);
});
