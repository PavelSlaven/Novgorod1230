import { AsyncLocalStorage } from 'node:async_hooks';

export function createLlmDiagnostics({ telemetry = null, maxReports = 100 } = {}) {
  const storage = new AsyncLocalStorage();
  const reports = new Map();
  const onCall = (record) => {
    telemetry?.onCall?.(record);
    if (record?.call_type === 'probe') return;
    const turn = storage.getStore();
    if (turn) turn.calls.push(redactCall(record));
  };
  return Object.freeze({
    telemetry: Object.freeze({ onCall }),
    async runTurn({ party_id, request_id }, execute) {
      const turn = { party_id: text(party_id), request_id: text(request_id), calls: [] };
      if (!turn.party_id || !turn.request_id) throw new TypeError('party_id and request_id are required.');
      try {
        return await storage.run(turn, execute);
      } finally {
        reports.delete(turn.party_id);
        reports.set(turn.party_id, buildLlmTurnReport(turn));
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

export function buildLlmTurnReport({ party_id, request_id, calls = [] } = {}) {
  const waterfall = calls.map((call, index) => Object.freeze({
    sequence: index + 1,
    role: text(call.role ?? call.roleId) || null,
    provider_mode: text(call.provider_mode ?? call.providerMode ?? call.provider) || null,
    model: text(call.model) || null,
    duration_ms: number(call.duration_ms ?? call.durationMs),
    status: text(call.status) || 'error',
    error_category: text(call.error_category ?? call.errorCategory) || null,
    repair: call.repair === true || /repair/u.test(text(call.role ?? call.roleId)),
    config_hash: text(call.config_hash ?? call.configHash) || null,
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
  const count = waterfall.length;
  return Object.freeze({
    version: 1,
    schema: 'llm_turn_report_v1',
    party_id: text(party_id),
    request_id: text(request_id),
    waterfall: Object.freeze(waterfall),
    aggregate: Object.freeze({
      calls: count,
      success_rate: rate(successes, count),
      parse_or_schema_failure_rate: rate(parseFailures, count),
      repair_rate: rate(repairs, count),
      llm_total_ms: waterfall.reduce((total, call) => total + call.duration_ms, 0),
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
    status: record.status,
    error_category: record.error_category ?? record.errorCategory,
    repair: record.repair === true,
    config_hash: record.config_hash ?? record.configHash,
    usage: record.usage ?? record.tokenUsage
  };
}
function usage(value = {}) { return Object.freeze({ input_tokens: number(value?.prompt_tokens ?? value?.input_tokens), output_tokens: number(value?.completion_tokens ?? value?.output_tokens) }); }
function percentile(values, fraction) { if (!values.length) return 0; return values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]; }
function rate(value, total) { return total === 0 ? 0 : value / total; }
function number(value) { return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0; }
function text(value) { return String(value ?? '').trim(); }
