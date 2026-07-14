import { executeRoleLlmCall } from '@rus/llm-runtime';

export function createLlmRoleRunnerAdapter({ env = process.env, telemetry = null, execute = executeRoleLlmCall } = {}) {
  if (typeof execute !== 'function') throw new TypeError('execute must be a function.');
  return Object.freeze({
    async run({ scope, role_id = null, tier_id = null, messages = [], overrides = null } = {}) {
      if (!String(scope ?? '').trim()) throw new TypeError('scope is required.');
      if (!Array.isArray(messages)) throw new TypeError('messages must be an array.');
      const result = await execute({
        scope,
        roleId: role_id,
        tierId: tier_id,
        messages,
        overrides,
        env,
        telemetry
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
          usage: result.usage ?? null
        })
      });
    }
  });
}
