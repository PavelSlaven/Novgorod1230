import { describeRoleLlmCall, executeRoleLlmCall } from '@rus/llm-runtime';
import { isRepairRole } from '../runtime/llm-turn-budget.js';

export function createLlmRoleRunnerAdapter({ env = process.env, telemetry = null, settings = null, turnBudget = null, execute = executeRoleLlmCall } = {}) {
  if (typeof execute !== 'function') throw new TypeError('execute must be a function.');
  if (settings != null && typeof settings.providerSnapshot !== 'function') throw new TypeError('settings.providerSnapshot is required.');
  return Object.freeze({
    describe({ scope, role_id = null, tier_id = null,
      overrides = null, provider_snapshot = null } = {}) {
      const runtimeProviderOverride = toProviderOverride(
        provider_snapshot ?? settings?.providerSnapshot());
      return describeRoleLlmCall({ scope, roleId: role_id, tierId: tier_id,
        overrides, ...(runtimeProviderOverride ? { runtimeProviderOverride } : {}), env });
    },
    isCustomProvider() { return settings?.providerSnapshot()?.mode === 'custom'; },
    async run({ scope, role_id = null, tier_id = null, messages = [],
      overrides = null, provider_snapshot = null, repair = false,
      request_identity = null } = {}) {
      if (!String(scope ?? '').trim()) throw new TypeError('scope is required.');
      if (!Array.isArray(messages)) throw new TypeError('messages must be an array.');
      const runtimeProviderOverride = toProviderOverride(
        provider_snapshot ?? settings?.providerSnapshot());
      const description = describeRoleLlmCall({ scope, roleId: role_id, tierId: tier_id,
        overrides, ...(runtimeProviderOverride ? { runtimeProviderOverride } : {}), env });
      const isRepair = repair === true || isRepairRole(role_id, description?.contract);
      try {
        if (isRepair) turnBudget?.claimRepair({ requestIdentity: request_identity,
          repairKind: role_id });
      } catch (error) {
        Object.assign(error, safeBudgetIdentity(description, role_id));
        throw error;
      }
      const effectiveOverrides = { ...(overrides ?? {}), maxTokens: 20_000,
        requestTimeoutMs: 120_000 };
      let result;
      try {
        result = await execute({
          scope,
          roleId: role_id,
          tierId: tier_id,
          messages,
          overrides: effectiveOverrides,
          ...(runtimeProviderOverride ? { runtimeProviderOverride } : {}),
          env,
          telemetry,
          repair: isRepair
        });
      } catch (error) {
        emitDetail(telemetry, {
          scope, role_id, tier_id, request_identity, repair: isRepair,
          request: { messages, overrides: effectiveOverrides },
          response: { status: 'threw', error: errorRecord(error) }
        });
        throw error;
      }
      emitDetail(telemetry, {
        scope, role_id, tier_id, request_identity, repair: isRepair,
        request: { ...(result.request_snapshot ?? { messages }),
          overrides: effectiveOverrides },
        response: {
          status: result.status,
          parsed_json: result.parsed_json ?? null,
          raw_text: result.raw_text ?? null,
          reasoning_content: result.reasoning_content ?? null,
          error: result.error ?? null,
          provider: result.provider ?? null,
          model: result.model ?? null,
          duration_ms: result.durationMs ?? null,
          config_hash: result.config_hash ?? null,
          usage: result.usage ?? null
        }
      });
      if (result.status !== 'ok') {
        const error = new Error(result.error?.message ?? `LLM role ${role_id ?? '<unnamed>'} failed.`);
        error.code = result.error?.code ?? 'LLM_ROLE_FAILED';
        error.retryable = result.error?.retryable === true;
        throw error;
      }
      return Object.freeze({
        output: result.parsed_json ?? result.raw_text,
        provider_record: Object.freeze({
          provider: result.provider,
          model: result.model,
          scope: result.scope,
          role_id: result.role_id,
          tier_id: result.tier_id,
          duration_ms: result.durationMs,
          config_hash: result.config_hash,
          runtime_provider_is_custom: runtimeProviderOverride != null,
          usage: result.usage ?? null
        })
      });
    },
    async probe(candidate) {
      const runtimeProviderOverride = toProviderOverride(candidate);
      if (!runtimeProviderOverride) throw new TypeError('custom LLM settings are required.');
      const started = Date.now();
      const result = await execute({
        scope: 'turn_runtime', roleId: 'intent_router',
        messages: [{ role: 'user', content: 'Reply with {}.' }],
        overrides: { maxTokens: 20_000, temperature: 0, requestTimeoutMs: 120_000 }, runtimeProviderOverride,
        telemetry: probeTelemetry(telemetry)
      });
      return Object.freeze({
        ok: result.status === 'ok', provider: result.provider ?? 'openai_compatible',
        model: result.model ?? runtimeProviderOverride.model,
        category: result.status === 'ok' ? 'ok' : String(result.error?.code ?? result.status ?? 'transport_error'),
        duration_ms: Number.isFinite(result.durationMs) ? result.durationMs : Date.now() - started
      });
    }
  });
}

function toProviderOverride(snapshot) {
  if (snapshot?.mode !== 'custom') return null;
  return Object.freeze({ compatibility: 'openai_compatible', baseUrl: snapshot.baseUrl, model: snapshot.model, apiKey: snapshot.apiKey ?? null });
}
function probeTelemetry(telemetry) {
  if (typeof telemetry?.onCall !== 'function') return telemetry;
  return Object.freeze({ onCall(record) { telemetry.onCall({ ...record, call_type: 'probe' }); } });
}
function safeBudgetIdentity(description, roleId) {
  return {
    role_id: String(description?.role_id ?? roleId ?? '').trim() || null,
    provider: String(description?.provider ?? '').trim() || null,
    model: String(description?.model ?? '').trim() || null,
    config_hash: String(description?.config_hash ?? '').trim() || null,
  };
}
function emitDetail(telemetry, record) {
  try { telemetry?.onDetail?.(record); }
  catch { /* diagnostics must not change gameplay */ }
}
function errorRecord(error) {
  return {
    name: String(error?.name ?? 'Error'),
    message: String(error?.message ?? error),
    code: error?.code ?? null,
    retryable: error?.retryable === true,
    stack: error?.stack ?? null
  };
}
