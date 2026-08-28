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
      overrides = null, provider_snapshot = null, repair = false } = {}) {
      if (!String(scope ?? '').trim()) throw new TypeError('scope is required.');
      if (!Array.isArray(messages)) throw new TypeError('messages must be an array.');
      const runtimeProviderOverride = toProviderOverride(
        provider_snapshot ?? settings?.providerSnapshot());
      const description = describeRoleLlmCall({ scope, roleId: role_id, tierId: tier_id,
        overrides, ...(runtimeProviderOverride ? { runtimeProviderOverride } : {}), env });
      const requestedTimeoutMs = description?.request_timeout_ms
        ?? description?.config?.requestTimeoutMs ?? overrides?.requestTimeoutMs ?? null;
      const isRepair = repair === true || isRepairRole(role_id, description?.contract);
      let requestTimeoutMs;
      try {
        if (isRepair) turnBudget?.claimRepair({ roleId: role_id });
        requestTimeoutMs = turnBudget?.clamp({ requestedTimeoutMs,
          repair: isRepair });
      } catch (error) {
        Object.assign(error, safeBudgetIdentity(description, role_id));
        throw error;
      }
      const effectiveOverrides = requestTimeoutMs == null ? overrides
        : { ...(overrides ?? {}), requestTimeoutMs };
      const result = await execute({
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
        overrides: { maxTokens: 16, temperature: 0, requestTimeoutMs: 120000 }, runtimeProviderOverride,
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
