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

export async function runFrozenRoleEval({ corpus, runtimeProviderOverride, env = process.env, metadata = {} } = {}) {
  const fixtures = Array.isArray(corpus?.fixtures) ? corpus.fixtures : [];
  if (corpus?.schema !== 'rus.llm_runtime_frozen_role_requests.v1' || !fixtures.length) {
    throw new TypeError('Invalid frozen role eval corpus.');
  }
  const role_config_policy = appliedRoleConfigPolicy(fixtures, { env, runtimeProviderOverride });
  const results = [];
  for (const fixture of fixtures) {
    const call = await executeRoleLlmCall({ scope: fixture.scope, roleId: fixture.role_id,
      messages: fixture.messages, env, runtimeProviderOverride });
    results.push(scoreFixture(fixture, call));
  }
  return { schema: 'rus.llm_runtime_eval_report.v1', corpus_version: corpus.corpus_version,
    metadata: { execution: { passes: 1, concurrency: 1 }, ...metadata, role_config_policy },
    fixture_count: results.length, results, aggregates: aggregate(results) };
}

function appliedRoleConfigPolicy(fixtures, { env, runtimeProviderOverride }) {
  return [...new Map(fixtures.map(({ scope, role_id }) => [`${scope}:${role_id}`, { scope, role_id }])).values()]
    .map(({ scope, role_id }) => {
      const resolution = resolveLlmExecutionConfig({ scope, roleId: role_id, env, runtimeProviderOverride });
      if (!resolution.enabled) return { scope, role_id, status: 'unavailable', reason: resolution.reason };
      const { config } = resolution;
      return {
        scope, role_id, provider: config.provider, model: config.model,
        config_hash: describeRoleLlmCall({ scope, roleId: role_id, env, runtimeProviderOverride }).config_hash,
        request_timeout_ms: config.requestTimeoutMs, thinking: config.thinking?.type ?? null,
        reasoning_effort: config.reasoningEffort ?? null, max_tokens: config.maxTokens,
        context_budget: config.contextBudget
      };
    });
}

function scoreFixture(fixture, call) {
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
  return { fixture_id: fixture.id, role_id: fixture.role_id, repair: fixture.repair === true,
    scored, manual, quality_status, status: call.status, pass: quality_status === 'automated_passed',
    valid: errors.length === 0, errors, duration_ms: call.durationMs,
    usage: call.usage ?? null, model: call.model, provider: call.provider,
    config_hash: call.config_hash };
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
  return ['required_refs', 'forbidden_refs', 'required_operations', 'forbidden_operations']
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
  return { calls: calls.length, automated_passed: automatedPassed, automated_failed: automatedFailed,
    quality_denominator: scored, quality_pass_rate: rate(automatedPassed, scored),
    passed: automatedPassed, errors: automatedFailed, error_rate: rate(automatedFailed, scored),
    validation_failures: validationFailures,
    schema_failures: schemaFailures, schema_failure_rate: rate(schemaFailures),
    validator_failures: validatorFailures, validator_failure_rate: rate(validatorFailures),
    rubric_failures: rubricFailures, rubric_failure_rate: rate(rubricFailures),
    semantic_failures: semanticFailures, semantic_failure_rate: rate(semanticFailures),
    scored, unscored: calls.length - scored - manual, manual,
    repairs: count(({ repair }) => repair), repair_rate: rate(count(({ repair }) => repair)), p50_ms: percentile(durations, .5),
    p95_ms: percentile(durations, .95), input_tokens: sum('prompt_tokens'), output_tokens: sum('completion_tokens') };
}

function percentile(sorted, p) { return sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : 0; }
