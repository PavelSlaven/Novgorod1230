import {
  describeRoleLlmCall,
  executeRoleLlmCall,
  resolveLlmExecutionConfig
} from '@rus/llm-runtime';
import { isDeepStrictEqual } from 'node:util';
import { validateOrdinaryMaterializationPlanV1 } from '@rus/contracts';
import {
  validateNarrationAudit,
  validateNarrationOutput,
  validateNarrationSemanticRepair
} from '@rus/narration';
import { resolveActionProducedCombatWeaponClass } from '@rus/combat-health';
import {
  validateConversationContributionPlan,
  validateNpcCombatPlanApplicability,
  validateNpcStepPlan,
  validatePlayerConversationContributionPlan
} from '@rus/npc-runtime';
import { validateTurnStepPlan, validateWorldProcessStepPlan } from '@rus/turn';
import { requestTurnStepPlanWithRepair } from
  '../../../packages/turn/src/turn-step-loop.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-llm.js';

export async function runFrozenRoleEval({ corpus, runtimeProviderOverride, env = process.env, metadata = {} } = {}) {
  const fixtures = Array.isArray(corpus?.fixtures) ? corpus.fixtures : [];
  if (corpus?.schema !== 'rus.llm_runtime_frozen_role_requests.v1' || !fixtures.length) {
    throw new TypeError('Invalid frozen role eval corpus.');
  }
  const role_config_policy = appliedRoleConfigPolicy(fixtures, { env, runtimeProviderOverride });
  const results = [];
  for (const fixture of fixtures) {
    results.push(await runFixture(fixture, { env, runtimeProviderOverride }));
  }
  return { schema: 'rus.llm_runtime_eval_report.v1', corpus_version: corpus.corpus_version,
    metadata: { execution: { passes: 1, concurrency: 1 }, ...metadata, role_config_policy },
    fixture_count: results.length, results, aggregates: aggregate(results) };
}

async function runFixture(fixture, execution) {
  if (fixture.validator !== 'turn_step_plan'
      || fixture.role_id !== 'turn_step_planner'
      || fixture.repair === true) {
    const call = await executeRoleLlmCall({ scope: fixture.scope,
      roleId: fixture.role_id, messages: fixture.messages, ...execution });
    return scoreFixture(fixture, call);
  }
  return runTurnStepPlannerWorkflow(fixture, execution);
}

async function runTurnStepPlannerWorkflow(fixture, execution) {
  const calls = [];
  const roleRunner = { async run({ scope, role_id, messages, overrides }) {
    const call = await executeRoleLlmCall({ scope, roleId: role_id, messages,
      overrides, repair: role_id === 'turn_step_planner_repair', ...execution });
    calls.push(call);
    if (call.status !== 'ok') {
      const error = new Error(call.error?.message ?? `${role_id} failed.`);
      error.code = call.error?.code ?? call.status;
      throw error;
    }
    return { output: call.parsed_json };
  } };
  let workflowError = null;
  try {
    await requestTurnStepPlanWithRepair({
      request: fixture.request ?? messagePayload(fixture.messages),
      turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner })
    });
  } catch (error) {
    workflowError = error;
  }
  const finalCall = calls.at(-1) ?? missingCall(fixture, workflowError);
  const result = scoreFixture(fixture, finalCall, calls);
  const primary = plannerStage(fixture, calls[0]);
  const repair = calls[1] == null ? null : plannerStage(fixture, calls[1]);
  const finalStage = repair ?? primary;
  const finalOutput = finalCall.parsed_json;
  const rubricPass = finalOutput != null && typeof finalOutput === 'object'
    && !Array.isArray(finalOutput)
    && validateExpected(fixture.expected ?? {}, finalOutput).length === 0;
  return { ...result, workflow: {
    primary,
    repair_needed: repair != null,
    repair,
    final: {
      source: repair == null ? 'primary' : 'repair',
      status: result.status,
      valid: finalStage?.valid === true,
      rubric_pass: rubricPass,
      quality_status: result.quality_status,
      pass: result.pass
    },
    ...(workflowError ? { error_code: workflowError.code ?? 'workflow_failed' } : {})
  } };
}

function plannerStage(fixture, call) {
  if (!call) return null;
  const output = call.parsed_json;
  return {
    role_id: call.role_id,
    status: call.status,
    valid: call.status === 'ok' && output != null
      && typeof output === 'object' && !Array.isArray(output)
      && validateRoleOutput(fixture, output).length === 0,
    duration_ms: call.durationMs,
    usage: call.usage ?? null,
    model: call.model,
    provider: call.provider,
    config_hash: call.config_hash
  };
}

function missingCall(fixture, error) {
  return { status: 'workflow_error', error: {
    code: error?.code ?? 'workflow_failed'
  }, durationMs: 0, usage: null, model: null, provider: null,
  config_hash: 'unavailable', role_id: fixture.role_id };
}

function appliedRoleConfigPolicy(fixtures, { env, runtimeProviderOverride }) {
  return [...new Map(fixtures.map(({ scope, role_id }) => [`${scope}:${role_id}`, { scope, role_id }])).values()]
    .map(({ scope, role_id }) => {
      const overrides = plannerOverrides(role_id);
      const resolution = resolveLlmExecutionConfig({ scope, roleId: role_id,
        env, runtimeProviderOverride, overrides });
      if (!resolution.enabled) return { scope, role_id, status: 'unavailable', reason: resolution.reason };
      const { config } = resolution;
      return {
        scope, role_id, provider: config.provider, model: config.model,
        config_hash: describeRoleLlmCall({ scope, roleId: role_id, env,
          runtimeProviderOverride, overrides }).config_hash,
        request_timeout_ms: config.requestTimeoutMs, thinking: config.thinking?.type ?? null,
        reasoning_effort: config.reasoningEffort ?? null, max_tokens: config.maxTokens,
        context_budget: config.contextBudget
      };
    });
}

function plannerOverrides(roleId) {
  if (roleId === 'turn_step_planner') return { temperature: 0, maxTokens: 8000 };
  if (roleId === 'turn_step_planner_repair') return { temperature: 0, maxTokens: 4000 };
  return null;
}

function scoreFixture(fixture, call, workflowCalls = [call]) {
  const output = call.parsed_json;
  const errors = [];
  if (call.status !== 'ok') errors.push(call.error?.code ?? call.status);
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    errors.push('json_object_required');
  } else {
    errors.push(...validateRoleOutput(fixture, output));
    errors.push(...validateExpected(fixture.expected ?? {}, output));
  }
  const manual = fixture.expected?.manual_rubric === true;
  const scored = !manual && isScored(fixture.expected);
  const quality_status = manual ? 'manual' : scored
    ? (errors.length === 0 ? 'automated_passed' : 'automated_failed') : 'unscored';
  const usage = sumUsage(workflowCalls);
  return { fixture_id: fixture.id, role_id: fixture.role_id, repair: fixture.repair === true,
    scored, manual, quality_status, status: call.status, pass: quality_status === 'automated_passed',
    valid: errors.length === 0, errors,
    llm_calls: workflowCalls.length,
    repair_calls: workflowCalls.length === 1 && fixture.repair === true ? 1
      : workflowCalls.filter(({ role_id }) =>
        role_id === 'turn_step_planner_repair').length,
    duration_ms: workflowCalls.reduce((sum, current) =>
      sum + Number(current.durationMs ?? 0), 0),
    usage, model: call.model, provider: call.provider,
    config_hash: call.config_hash };
}

function sumUsage(calls) {
  const prompt_tokens = calls.reduce((sum, call) =>
    sum + Number(call.usage?.prompt_tokens ?? 0), 0);
  const completion_tokens = calls.reduce((sum, call) =>
    sum + Number(call.usage?.completion_tokens ?? 0), 0);
  return prompt_tokens || completion_tokens ? { prompt_tokens, completion_tokens } : null;
}

function validateRoleOutput(fixture, output) {
  const payload = fixture.request ?? messagePayload(fixture.messages);
  const request = fixture.repair === true && payload?.request ? payload.request : payload;
  switch (fixture.validator) {
    case 'turn_step_plan': return validateTurnStepPlan(output, { request }).ok ? [] : ['validator:turn_step_plan'];
    case 'world_process_step_plan': return validateWorldProcessStepPlan(output, request) ? [] : ['validator:world_process_step_plan'];
    case 'ordinary_materialization_plan': return validateOrdinaryMaterializationPlanV1(output, request).length === 0 ? [] : ['validator:ordinary_materialization_plan'];
    case 'player_conversation_plan': return validatePlayerConversationContributionPlan(output, request) ? [] : ['validator:player_conversation_plan'];
    case 'npc_conversation_plan': return validateConversationContributionPlan(output, request) ? [] : ['validator:npc_conversation_plan'];
    case 'npc_step_plan': return validateNpcStepPlan(output, request) ? [] : ['validator:npc_step_plan'];
    case 'npc_combat_plan': return validateNpcCombatPlanApplicability(output, request).pass ? [] : ['validator:npc_combat_plan'];
    case 'combat_weapon_classification':
      try { resolveActionProducedCombatWeaponClass({ classification: output }); return []; }
      catch { return ['validator:combat_weapon_classification']; }
    case 'narration_output': {
      const requestId = request?.request_id;
      const errors = validateNarrationOutput(output).errors;
      if (requestId && output.output_id !== requestId) errors.push('output_id must match request_id');
      return errors.length ? ['validator:narration_output'] : [];
    }
    case 'narration_audit':
      return validateNarrationAudit(output, request?.segments?.map(({ segment_id }) => segment_id)).ok
        ? [] : ['validator:narration_audit'];
    case 'narration_semantic_repair':
      return validateNarrationSemanticRepair(output,
        request?.concerns?.map(({ segment_id }) => segment_id) ?? []).ok
        ? [] : ['validator:narration_semantic_repair'];
    case undefined: return [];
    default: return [`unknown_validator:${fixture.validator}`];
  }
}

function validateExpected(expected, output) {
  const errors = [];
  for (const ref of expected.required_refs ?? []) if (!contains(output, ref)) errors.push(`missing_ref:${ref}`);
  for (const ref of expected.forbidden_refs ?? []) if (contains(output, ref)) errors.push(`forbidden_ref:${ref}`);
  for (const text of expected.forbidden_text ?? []) if (containsText(output, text)) errors.push(`forbidden_text:${text}`);
  const operations = collectOperations(output);
  for (const op of expected.required_operations ?? []) if (!operations.has(op)) errors.push(`missing_operation:${op}`);
  for (const op of expected.forbidden_operations ?? []) if (operations.has(op)) errors.push(`forbidden_operation:${op}`);
  for (const [path, value] of Object.entries(expected.required_values ?? {})) {
    if (!isDeepStrictEqual(valueAt(output, path), value)) errors.push(`unexpected_value:${path}`);
  }
  for (const [path, values] of Object.entries(expected.allowed_values ?? {})) {
    if (!values.some((value) => isDeepStrictEqual(valueAt(output, path), value))) errors.push(`disallowed_value:${path}`);
  }
  return errors;
}

function valueAt(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}
function isScored(expected) {
  return ['required_refs', 'forbidden_refs', 'forbidden_text', 'required_operations', 'forbidden_operations']
    .some((key) => expected?.[key]?.length > 0)
    || Object.keys(expected?.required_values ?? {}).length > 0
    || Object.keys(expected?.allowed_values ?? {}).length > 0;
}

function messagePayload(messages) {
  const content = messages?.at(-1)?.content;
  try { return JSON.parse(content); } catch { return undefined; }
}
function contains(value, needle) {
  if (value === needle) return true;
  if (Array.isArray(value)) return value.some((entry) => contains(entry, needle));
  return value != null && typeof value === 'object' && Object.values(value).some((entry) => contains(entry, needle));
}
function containsText(value, needle) {
  if (typeof value === 'string') return value.toLowerCase().includes(String(needle).toLowerCase());
  if (Array.isArray(value)) return value.some((entry) => containsText(entry, needle));
  return value != null && typeof value === 'object'
    && Object.values(value).some((entry) => containsText(entry, needle));
}
function collectOperations(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((entry) => collectOperations(entry, found));
  else if (value != null && typeof value === 'object') {
    if (typeof value.op === 'string') found.add(value.op);
    Object.values(value).forEach((entry) => collectOperations(entry, found));
  }
  return found;
}

function aggregate(results) {
  const byRole = Object.groupBy(results, ({ role_id }) => role_id);
  const byModel = Object.groupBy(results, ({ model }) => model ?? 'unknown');
  const byRoleModel = Object.fromEntries(Object.entries(byRole).map(([role, calls]) => [role,
    Object.fromEntries(Object.entries(Object.groupBy(calls, ({ model }) => model ?? 'unknown'))
      .map(([model, grouped]) => [model, summarize(grouped)]))]));
  return { total: summarize(results),
    by_role: Object.fromEntries(Object.entries(byRole).map(([role, calls]) => [role, summarize(calls)])),
    by_model: Object.fromEntries(Object.entries(byModel).map(([model, calls]) => [model, summarize(calls)])),
    by_role_model: byRoleModel,
    by_repair: Object.fromEntries(Object.entries(Object.groupBy(results, ({ repair }) => repair ? 'repair' : 'primary'))
      .map(([kind, calls]) => [kind, summarize(calls)])) };
}

function summarize(calls) {
  const durations = calls.map(({ duration_ms }) => duration_ms).sort((a, b) => a - b);
  const sum = (key) => calls.reduce((n, call) => n + Number(call.usage?.[key] ?? 0), 0);
  const count = (predicate) => calls.filter(predicate).length;
  const rate = (value, denominator = calls.length) => denominator ? value / denominator : 0;
  const automatedPassed = count(({ quality_status }) => quality_status === 'automated_passed');
  const automatedFailed = count(({ quality_status }) => quality_status === 'automated_failed');
  const scored = count(({ scored }) => scored);
  const manual = count(({ manual }) => manual);
  const validationFailures = count(({ valid }) => !valid);
  const schemaFailures = count(({ errors }) => errors.includes('json_object_required'));
  const validatorFailures = count(({ errors }) => errors.some((error) => error.startsWith('validator:')));
  const rubricFailures = count(({ errors }) => errors.some((error) => /^(missing|forbidden)_/.test(error)));
  const semanticFailures = count(({ errors }) => errors.some((error) => /^(unexpected|disallowed)_value:/.test(error)));
  const llmCalls = calls.reduce((sum, call) => sum + Number(call.llm_calls ?? 1), 0);
  const repairs = calls.reduce((sum, call) => sum
    + Number(call.repair_calls ?? (call.repair ? 1 : 0)), 0);
  return { calls: llmCalls, fixtures: calls.length,
    automated_passed: automatedPassed, automated_failed: automatedFailed,
    quality_denominator: scored, quality_pass_rate: rate(automatedPassed, scored),
    passed: automatedPassed, errors: automatedFailed, error_rate: rate(automatedFailed, scored),
    validation_failures: validationFailures,
    schema_failures: schemaFailures, schema_failure_rate: rate(schemaFailures),
    validator_failures: validatorFailures, validator_failure_rate: rate(validatorFailures),
    rubric_failures: rubricFailures, rubric_failure_rate: rate(rubricFailures),
    semantic_failures: semanticFailures, semantic_failure_rate: rate(semanticFailures),
    scored, unscored: calls.length - scored - manual, manual,
    repairs, repair_rate: rate(repairs, llmCalls), p50_ms: percentile(durations, .5),
    p95_ms: percentile(durations, .95), input_tokens: sum('prompt_tokens'), output_tokens: sum('completion_tokens') };
}

function percentile(sorted, p) { return sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : 0; }
