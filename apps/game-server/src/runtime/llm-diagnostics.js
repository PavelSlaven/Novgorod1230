import { AsyncLocalStorage } from 'node:async_hooks';
import { createLlmTurnBudget, GAMEPLAY_LLM_BUDGET_MS, GAMEPLAY_TURN_DEADLINE_MS } from './llm-turn-budget.js';

export function createLlmDiagnostics({ telemetry = null, maxReports = 100,
  turnBudget = createLlmTurnBudget(), now = () => Date.now() } = {}) {
  const storage = new AsyncLocalStorage();
  const reports = new Map();
  const onCall = (record) => {
    telemetry?.onCall?.(record);
    if (record?.call_type === 'probe') return;
    const turn = storage.getStore();
    if (turn) {
      turn.calls.push(redactCall(record));
      if (record?.status !== 'ok') turn.incidents.push(incident(record));
    }
  };
  return Object.freeze({
    turnBudget,
    telemetry: Object.freeze({ onCall }),
    async runTurn({ party_id, request_id }, execute) {
      const startedAt = now();
      const turn = { party_id: text(party_id), request_id: text(request_id), calls: [],
        started_at: startedAt, turn_deadline_ms: GAMEPLAY_TURN_DEADLINE_MS,
        llm_budget_ms: GAMEPLAY_LLM_BUDGET_MS, incidents: [] };
      if (!turn.party_id || !turn.request_id) throw new TypeError('party_id and request_id are required.');
      try {
        return await turnBudget.runTurn(() => storage.run(turn, execute), { startedAt });
      } catch (error) {
        if (error?.code === 'LLM_TURN_BUDGET_EXHAUSTED') turn.incidents.push(incident(error));
        throw error;
      } finally {
        reports.delete(turn.party_id);
        reports.set(turn.party_id, buildLlmTurnReport({ ...turn,
          turn_duration_ms: Math.max(0, now() - turn.started_at) }));
        while (reports.size > maxReports) reports.delete(reports.keys().next().value);
      }
    },
    report({ party_id, request_id } = {}) {
      const report = reports.get(text(party_id)) ?? null;
      const requestId = text(request_id);
      return requestId === '' || report?.request_id === requestId ? report : null;
    }
  });
}

export function buildLlmTurnReport(input = {}) {
  const { party_id, request_id, calls = [], turn_duration_ms = 0,
    turn_deadline_ms = GAMEPLAY_TURN_DEADLINE_MS,
    llm_budget_ms = GAMEPLAY_LLM_BUDGET_MS, incidents = [] } = input;
  const waterfall = calls.map((call, index) => Object.freeze({
    sequence: index + 1,
    role: text(call.role ?? call.roleId) || null,
    provider_mode: text(call.provider_mode ?? call.providerMode ?? call.provider) || null,
    model: text(call.model) || null,
    duration_ms: number(call.duration_ms ?? call.durationMs),
    started_at: number(call.started_at_ms ?? call.started_at ?? call.startedAt),
    status: text(call.status) || 'error',
    error_category: text(call.error_category ?? call.errorCategory) || null,
    repair: call.repair === true || /repair/u.test(text(call.role ?? call.roleId)),
    config_hash: text(call.config_hash ?? call.configHash) || null,
    output_contract_mode: text(call.output_contract_mode ?? call.outputContractMode) || null,
    usage: usage(call.usage ?? call.tokenUsage)
  }));
  const durations = waterfall.map((call) => call.duration_ms).sort((a, b) => a - b);
  const successes = waterfall.filter((call) => call.status === 'ok').length;
  const parseFailures = waterfall.filter((call) => /parse|schema/u.test(call.status) || /parse|schema/u.test(call.error_category ?? '')).length;
  const repairs = waterfall.filter((call) => call.repair).length;
  const tokens = waterfall.reduce((total, call) => ({
    input_tokens: total.input_tokens + call.usage.input_tokens,
    output_tokens: total.output_tokens + call.usage.output_tokens
  }), { input_tokens: 0, output_tokens: 0 });
  const providerTotals = waterfall.map((call) => call.usage.total_tokens).filter((total) => total !== undefined);
  if (providerTotals.length > 0) tokens.total_tokens = providerTotals.reduce((total, value) => total + value, 0);
  const count = waterfall.length;
  const total = waterfall.reduce((total, call) => total + call.duration_ms, 0);
  const intervals = waterfall.map((call) => [call.started_at, call.started_at + call.duration_ms])
    .filter(([start]) => start > 0);
  return Object.freeze({
    version: 1,
    schema: 'llm_turn_report_v1',
    party_id: text(party_id),
    request_id: text(request_id),
    turn_duration_ms: number(turn_duration_ms),
    turn_deadline_ms: number(turn_deadline_ms) || GAMEPLAY_TURN_DEADLINE_MS,
    llm_budget_ms: number(llm_budget_ms) || GAMEPLAY_LLM_BUDGET_MS,
    waterfall: Object.freeze(waterfall),
    aggregate: Object.freeze({
      calls: count,
      success_rate: rate(successes, count),
      parse_or_schema_failure_rate: rate(parseFailures, count),
      repair_rate: rate(repairs, count),
      llm_total_ms: total,
      llm_total_duration_ms: total,
      llm_active_wall_ms: unionDuration(intervals),
      slowest_llm_call_ms: durations.at(-1) ?? 0,
      llm_calls: count,
      repair_calls: repairs,
      deadline_exceeded: number(turn_duration_ms) >= (number(turn_deadline_ms) || GAMEPLAY_TURN_DEADLINE_MS)
        || incidents.some((incident) => incident.deadline_exceeded),
      budget_exhausted: incidents.some((incident) => incident.budget_exhausted),
      incidents: Object.freeze(incidents.map((incident) => Object.freeze({ ...incident }))),
      p50_ms: percentile(durations, 0.5),
      p95_ms: percentile(durations, 0.95),
      usage: Object.freeze(tokens)
    })
  });
}

function redactCall(record = {}) {
  return {
    role: record.role ?? record.roleId,
    provider_mode: record.provider_mode ?? record.providerMode ?? record.provider,
    model: record.model,
    duration_ms: record.duration_ms ?? record.durationMs,
    started_at: record.started_at_ms ?? record.started_at ?? record.startedAt,
    status: record.status,
    error_category: record.error_category ?? record.errorCategory,
    repair: record.repair === true,
    config_hash: record.config_hash ?? record.configHash,
    output_contract_mode: record.output_contract_mode ?? record.outputContractMode,
    usage: record.usage ?? record.tokenUsage
  };
}
function incident(record = {}) {
  return {
    code: text(record.code) || null,
    role_id: text(record.role_id ?? record.roleId) || null,
    provider: text(record.provider) || null,
    model: text(record.model) || null,
    config_hash: text(record.config_hash ?? record.configHash) || null,
    error_category: text(record.error_category ?? record.errorCategory ?? record.code) || null,
    deadline_exceeded: record.deadline_exceeded === true,
    budget_exhausted: record.budget_exhausted === true,
    remaining_llm_budget_ms: nonNegative(record.remaining_llm_budget_ms),
    remaining_turn_deadline_ms: nonNegative(record.remaining_turn_deadline_ms)
  };
}
function unionDuration(intervals) { let total = 0; let end = -Infinity; for (const [start, finish] of intervals.sort((a, b) => a[0] - b[0])) { if (finish <= end) continue; total += finish - Math.max(start, end); end = finish; } return total; }
function usage(value = {}) {
  const total = nonNegative(value?.total_tokens ?? value?.totalTokens);
  return Object.freeze({
    input_tokens: number(value?.prompt_tokens ?? value?.input_tokens),
    output_tokens: number(value?.completion_tokens ?? value?.output_tokens),
    ...(total === null ? {} : { total_tokens: total })
  });
}
function percentile(values, fraction) { if (!values.length) return 0; return values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]; }
function rate(value, total) { return total === 0 ? 0 : value / total; }
function nonNegative(value) { return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null; }
function number(value) { return nonNegative(value) ?? 0; }
function text(value) { return String(value ?? '').trim(); }
