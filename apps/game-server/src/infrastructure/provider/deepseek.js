import { createLlmRoleRunnerAdapter } from '../../adapters/llm-role-runner.js';

export function createProductionLlmRoleRunner({ env = process.env, telemetry = null, settings = null } = {}) {
  return createLlmRoleRunnerAdapter({ env, telemetry, settings });
}

export async function probeLlmProvider(runner, { scope = 'turn_runtime', roleId = 'intent_router' } = {}) {
  const started = Date.now();
  const response = await runner.run({
    scope,
    role_id: roleId,
    messages: [{ role: 'system', content: 'Return a JSON object with {"ok":true}.' }],
    overrides: { maxTokens: 32, temperature: 0 }
  });
  return Object.freeze({ ok: response.output?.ok === true || response.output === '{"ok":true}', duration_ms: Date.now() - started, provider_record: response.provider_record });
}
