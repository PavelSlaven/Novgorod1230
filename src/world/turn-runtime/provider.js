import { explainJsonObjectParse } from '../json-contracts.js';
import { getTurnRoleConfig, LLM_SCOPES, TurnRuntimeRoles } from '../provider-config.js';
import { executeRoleLlmCall } from '../provider-runtime.js';
import { resolveTurnIntentRoute, resolveTurnMode } from './mode-resolver.js';

export async function runTurnIntentRouter(input, options = {}) {
  return runTurnRole(TurnRuntimeRoles.INTENT_ROUTER, input, options, ({ input: routeInput }) => {
    const payload = routeInput?.payload ?? routeInput ?? {};
    return resolveTurnIntentRoute(payload.raw_text, payload.available_context);
  });
}

export async function runTurnOrchestrator(input, options = {}) {
  return runTurnRole(TurnRuntimeRoles.ORCHESTRATOR, input, options, ({ input: orchestratorInput }) => {
    const payload = orchestratorInput?.payload ?? orchestratorInput ?? {};
    return resolveTurnMode(payload.raw_text, payload.available_context);
  });
}

export async function runTurnResolutionAuditor(input, options = {}) {
  return runTurnRole(TurnRuntimeRoles.AUDITOR, input, options, ({ input: auditInput }) => buildDeterministicAudit(auditInput?.payload ?? auditInput));
}

export async function runTurnFormatRepairer(input, options = {}) {
  return runTurnRole(TurnRuntimeRoles.FORMAT_REPAIRER, input, options, ({ input: repairInput }) => repairBrokenJson(repairInput?.payload ?? repairInput));
}

async function runTurnRole(role, input, options, deterministicBuilder) {
  const env = options.env ?? process.env;
  const config = getTurnRoleConfig(role, env);
  const executor = options.executor;
  const telemetry = options.telemetry ?? {};

  if (typeof executor === 'function') {
    return normalizeRoleOutput(await executor({ role, config, input }), role);
  }

  if (config.enabled && env.NODE_TEST_CONTEXT !== '1' && options.forceDeterministic !== true) {
    const response = await executeRoleLlmCall({
      scope: LLM_SCOPES.TURN_RUNTIME,
      roleId: role,
      env,
      telemetry,
      messages: [
        { role: 'system', content: String(input.system_prompt ?? '').trim() },
        { role: 'user', content: JSON.stringify(input.payload ?? input) }
      ]
    });
    if (response.status !== 'ok') {
      throw new Error(`Turn role ${role} failed: ${response.error?.message ?? response.status}`);
    }
    return normalizeRoleOutput(response.parsed_json ?? response.raw_text ?? '{}', role);
  }

  return deterministicBuilder({ input, config });
}

function normalizeRoleOutput(value, role) {
  if (typeof value !== 'string') return value;
  const parsed = explainJsonObjectParse(value);
  if (!parsed.ok) {
    throw new Error(`Turn role ${role} returned invalid JSON: ${parsed.error}`);
  }
  return parsed.data;
}

function buildDeterministicAudit(input = {}) {
  const resolution = input.turn_mode_resolution ?? {};
  const concerns = [];
  const state = input.retrieved_state ?? {};
  if (!resolution?.selected_primary_mode) concerns.push('missing primary mode');
  if (!state?.current_position) concerns.push('missing current position');
  return {
    version: 1,
    schema: 'turn_resolution_audit',
    pass: concerns.length === 0,
    status: concerns.length === 0
      ? 'resolved'
      : (resolution?.accessibility_check?.can_attempt === false ? 'blocked' : 'needs_repair'),
    concerns,
    return_to_stage: concerns.length === 0 ? null : 'turn_mode_resolution'
  };
}

function repairBrokenJson(input = {}) {
  const parsed = explainJsonObjectParse(String(input.broken_json ?? '').trim() || '{}');
  if (parsed.ok) return parsed.data;
  return {
    version: 1,
    schema: input.expected_schema ?? 'repaired_json_object',
    repair_status: 'best_effort_empty_object'
  };
}
