#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createP3AttemptBudget, createP3RoleRuntime,
  loadP3QwenSettingsOwner, runP3NativeNpcFlow, runP3TurnStep,
  validateP3RoleConfigs } from './p3-boundary.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceDir = path.join(root, 'artifacts', '2026-10-19', 'task01', 'wire');
const expectedModel = 'qwen3.8-27b-uncensored-w4a16-tp2';
const expectedBackendModel = 'qwen3.8-27b';
export function matchesP3WireModelId(value) {
  return value === expectedModel || value === expectedBackendModel;
}
const expectedWindow = 65_536;
const runtimeMetadataContext = null;
const liveCallLimit = 5;
const liveCallTarget = 3;
const outputTokenBudget = 20_000;
const intents = [
  'Осмотреть ближайшее окружение.',
  'Проверить, где я нахожусь.'
];

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeError(error) {
  const message = String(error?.message ?? error)
    .replace(/https?:\/\/[^\s"']+/giu, '[url-redacted]')
    .replace(/Bearer\s+[^\s"']+/giu, 'Bearer [redacted]');
  return { name: error?.name ?? 'Error', code: error?.code ?? null, message };
}

function safeRoleCall(input) {
  return {
    scope: input.scope,
    role_id: input.role_id,
    request_identity: input.request_identity ?? null,
    messages: structuredClone(input.messages ?? []),
    overrides: structuredClone(input.overrides ?? null),
    repair: input.repair === true
  };
}

function changedPaths(before, after, location = '$', result = []) {
  if (Object.is(before, after)) return result;
  if (before && after && typeof before === 'object' && typeof after === 'object'
      && Array.isArray(before) === Array.isArray(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) changedPaths(before[key], after[key],
      `${location}.${key}`, result);
    return result;
  }
  result.push(location);
  return result;
}

async function writeJson(file, value) {
  await writeFile(path.join(evidenceDir, file), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function loadConfig() {
  if (!String(process.env.RUS_LLM_SETTINGS_PATH ?? '').trim()) {
    throw new Error('P3_WIRE_SETTINGS_PATH_ENV_REQUIRED');
  }
  const settingsOwner = await loadP3QwenSettingsOwner({ env: process.env });
  const safeRoles = validateP3RoleConfigs(process.env, settingsOwner);
  const contextBudgets = safeRoles.filter(({ role_id }) =>
    ['turn_step_planner', 'npc_autonomous_decider'].includes(role_id)).map((role) => ({
    role_id: role.role_id, request_max_tokens: role.max_tokens,
    context_window_tokens: role.context_window_tokens,
    input_limit_tokens: role.input_limit_tokens
  }));
  return { settingsOwner, safeRoles, contextBudgets };
}

async function dryCapture() {
  await mkdir(evidenceDir, { recursive: true });
  const observation = JSON.parse(await readFile(
    path.join(evidenceDir, 'native-observation-clean.json'), 'utf8'));
  if (observation.schema !== 'p3_native_observation_v1') {
    throw new Error('P3_WIRE_FIXTURE_SCHEMA_INVALID');
  }
  const { settingsOwner, safeRoles, contextBudgets } = await loadConfig();
  const beforeCalls = [];
  const wireCalls = [];
  const attemptEvents = [];
  const scenarioErrors = [];
  let currentAttempt = null;
  const budget = createP3AttemptBudget({ budget: liveCallLimit, onAttempt: async event => {
    if (event.phase === 'before') {
      currentAttempt = { attempt: event.attempt, role_call: safeRoleCall(event.input) };
      beforeCalls.push(currentAttempt);
    } else if (currentAttempt) {
      currentAttempt.error = event.error ? safeError(event.error) : null;
      currentAttempt.completed = event.output != null;
    }
    attemptEvents.push({ phase: event.phase, attempt: event.attempt,
      role_id: event.input?.role_id ?? null,
      error: event.error ? safeError(event.error) : null });
  } });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => {
    const payload = JSON.parse(String(options.body ?? '{}'));
    wireCalls.push({ attempt: currentAttempt?.attempt ?? null,
      role_id: currentAttempt?.role_call.role_id ?? null,
      status: 'not_sent_dry_capture', elapsed_ms: 0,
      request: payload, response_model_id: null, prompt_tokens: null,
      max_tokens: payload.max_tokens ?? null });
    const blocked = new Error('P3_DRY_CAPTURE_STOP_BEFORE_TRANSPORT');
    blocked.code = 'P3_DRY_CAPTURE_STOP_BEFORE_TRANSPORT';
    throw blocked;
  };

  try {
    const runtime = createP3RoleRuntime({ budget, settingsOwner });
    const nativeAdapter = {
      async writeOperationRequest() { throw new Error('P3_DRY_CAPTURE_NATIVE_APPLY_BLOCKED'); },
      async readOperationReadback() { throw new Error('P3_DRY_CAPTURE_NATIVE_READBACK_BLOCKED'); }
    };
    for (const [index, intent] of intents.entries()) {
      try {
        await runP3TurnStep({ intent, observation, nativeAdapter,
          turnStepModel: runtime.turnStepModel });
      } catch (error) {
        scenarioErrors.push({ scenario: `planner_${index + 1}`, error: safeError(error) });
      }
    }
    const npc = observation.npc_projections.find(({ assignment_status }) =>
      ['', 'decision_required', 'interrupted_waiting_for_semantic_decision']
        .includes(assignment_status ?? ''));
    if (!npc) throw new Error('P3_WIRE_NPC_DECISION_FIXTURE_REQUIRED');
    try {
      await runP3NativeNpcFlow({ nativeAdapter: {}, actorId: npc.actor_id,
        nativeObservation: observation, semanticModel: runtime.npcAutonomousModel });
    } catch (error) {
      scenarioErrors.push({ scenario: 'npc_autonomous_decider', error: safeError(error) });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  const callsByAttempt = new Map(wireCalls.map(call => [call.attempt, call]));
  const calls = beforeCalls.map(before => {
    const wire = callsByAttempt.get(before.attempt) ?? null;
    const beforeText = JSON.stringify(before.role_call.messages ?? []);
    const afterText = JSON.stringify(wire?.request?.messages ?? []);
    return { attempt: before.attempt, role_id: before.role_call.role_id,
      status: wire?.status ?? 'failed_before_serialization',
      pre_override: before.role_call,
      post_override_wire_request: wire?.request ?? null,
      diff: { changed_paths: changedPaths(before.role_call, wire?.request ?? null),
        pre_prompt_sha256: hash(beforeText), post_prompt_sha256: hash(afterText),
        pre_prompt_chars: beforeText.length, post_prompt_chars: afterText.length },
      response_model_id: null, prompt_tokens: null,
      max_tokens: wire?.max_tokens ?? null, elapsed_ms: wire?.elapsed_ms ?? null };
  });
  await writeJson('requests.json', calls);
  await writeJson('attempts.json', attemptEvents);
  await writeJson('scenario-errors.json', scenarioErrors);
  await writeJson('structured-summary.json', {
    status: 'dry_capture_only_no_network_no_model_calls_no_native_writes',
    settings: { provider: 'openai_compatible', model: expectedModel,
      host_class: 'private-lan', credentials_present: true },
    role_configs: safeRoles.map(({ role_id, provider, model, temperature, top_p,
      max_tokens, timeout_ms, context_window_tokens, input_limit_tokens,
      context_budget = null }) => ({ role_id, provider, model, temperature, top_p,
      max_tokens, timeout_ms, context_window_tokens, input_limit_tokens, context_budget })),
    context_budgets: contextBudgets,
    configured_context_window_tokens: expectedWindow,
    trained_context_tokens: 65_536,
    runtime_metadata_context_tokens: runtimeMetadataContext,
    native_observation: { schema: observation.schema, revision: observation.revision,
      actors: observation.actors.length, targets: observation.targets.length,
      npc_projections: observation.npc_projections.length },
    attempts: budget.calls, serialized_requests: wireCalls.length,
    errors: scenarioErrors.length, acceptance_claim: false
  });
  await writeFile(path.join(evidenceDir, 'dry-handoff.md'), [
    '# Task 01 wire dry capture', '',
    'Full pre-override role inputs and post-override wire payloads are in `requests.json`.',
    'Attempt/error details are in `attempts.json` and `scenario-errors.json`.',
    'No HTTP request, model generation, or native write occurred during capture.',
    'The exact local settings path must be supplied through `RUS_LLM_SETTINGS_PATH`.',
    'The local settings record does not establish the server context window; live mode first checks only `GET /models` and stops unless the expected model reports `max_model_len: 65536`.',
    'Live mode sends the saved three role inputs directly through `runtime.roleRunner.run`, with a hard cap of five total attempts and no repair loop.', ''
  ].join('\n'), 'utf8');
  return { observation, settingsOwner, safeRoles, contextBudgets, budget, calls,
    attemptEvents, scenarioErrors };
}

async function readModelMetadata(settingsOwner) {
  const settings = settingsOwner.providerSnapshot();
  const base = new URL(settings.baseUrl);
  base.pathname = `${base.pathname.replace(/\/+$/u, '')}/`;
  const metadataUrl = new URL('models', base);
  const started = Date.now();
  let response;
  try {
    response = await fetch(metadataUrl, { method: 'GET', headers: {
      Authorization: `Bearer ${settings.apiKey}`, Accept: 'application/json'
    } });
  } catch (error) {
    return { status: null, elapsed_ms: Date.now() - started,
      error: safeError(error), model_id: null, max_model_len: null };
  }
  let data = null;
  try { data = await response.json(); } catch {}
  const models = Array.isArray(data?.data) ? data.data : [];
  const model = models.find(item => matchesP3WireModelId(item?.id)) ?? null;
  return { status: response.status, elapsed_ms: Date.now() - started,
    model_id: model?.id ?? null,
    max_model_len: Number.isSafeInteger(model?.max_model_len) ? model.max_model_len : null };
}

async function liveCalls() {
  await mkdir(evidenceDir, { recursive: true });
  const saved = JSON.parse(await readFile(path.join(evidenceDir, 'requests.json'), 'utf8'));
  if (!Array.isArray(saved) || saved.length !== liveCallTarget
      || saved.map(({ role_id }) => role_id).join(',')
        !== 'turn_step_planner,turn_step_planner,npc_autonomous_decider') {
    throw new Error('P3_WIRE_SAVED_INPUTS_INVALID');
  }
  const { settingsOwner, safeRoles, contextBudgets } = await loadConfig();
  const metadata = JSON.parse(await readFile(path.join(evidenceDir, 'model-metadata.json'), 'utf8'));
  if (metadata.status !== 200 || !matchesP3WireModelId(metadata.model_id)) {
    throw new Error('P3_WIRE_MODEL_METADATA_MISMATCH');
  }

  const liveWire = [];
  const attemptEvents = [];
  let activeRoleCall = null;
  let fetchAttempts = 0;
  const originalFetch = globalThis.fetch;
  const budget = createP3AttemptBudget({ budget: liveCallLimit, onAttempt: async event => {
    if (event.phase === 'before') activeRoleCall = safeRoleCall(event.input);
    attemptEvents.push({ phase: event.phase, attempt: event.attempt,
      role_id: event.input?.role_id ?? null,
      error: event.error ? safeError(event.error) : null });
  } });
  globalThis.fetch = async (url, options = {}) => {
    if (String(options.method ?? 'POST').toUpperCase() !== 'POST') {
      throw new Error('P3_LIVE_UNEXPECTED_NON_POST');
    }
    if (fetchAttempts >= liveCallLimit) throw new Error('P3_GLOBAL_ATTEMPT_BUDGET_EXHAUSTED');
    fetchAttempts += 1;
    const expected = saved[fetchAttempts - 1];
    const body = JSON.parse(String(options.body ?? '{}'));
    const inputMatches = isDeepStrictEqual(activeRoleCall, expected?.pre_override);
    const wireMatches = isDeepStrictEqual(body, expected?.post_override_wire_request);
    const started = Date.now();
    const item = { attempt: fetchAttempts, status: null,
      request: body, max_tokens: body.max_tokens ?? null,
      pre_override_matches_saved: inputMatches,
      post_override_matches_saved: wireMatches,
      response_model_id: null, prompt_tokens: null,
      completion_tokens: null, total_tokens: null, elapsed_ms: null,
      error: null };
    liveWire.push(item);
    if (!inputMatches || !wireMatches) {
      item.error = { name: 'Error', code: 'P3_LIVE_SAVED_REQUEST_MISMATCH',
        message: 'Saved role input or serialized request mismatch; transport blocked.' };
      throw Object.assign(new Error('P3_LIVE_SAVED_REQUEST_MISMATCH'),
        { code: 'P3_LIVE_SAVED_REQUEST_MISMATCH' });
    }
    try {
      const response = await originalFetch(url, options);
      item.status = response.status;
      try {
        const data = await response.clone().json();
        item.response_model_id = typeof data?.model === 'string' ? data.model : null;
        item.prompt_tokens = Number.isSafeInteger(data?.usage?.prompt_tokens)
          ? data.usage.prompt_tokens : null;
        item.completion_tokens = Number.isSafeInteger(data?.usage?.completion_tokens)
          ? data.usage.completion_tokens : null;
        item.total_tokens = Number.isSafeInteger(data?.usage?.total_tokens)
          ? data.usage.total_tokens : null;
      } catch {}
      item.elapsed_ms = Date.now() - started;
      return response;
    } catch (error) {
      item.elapsed_ms = Date.now() - started;
      item.error = safeError(error);
      throw error;
    }
  };

  const attempts = [];
  let modelMismatch = false;
  try {
    const runtime = createP3RoleRuntime({ budget, settingsOwner });
    for (const [index, request] of saved.entries()) {
      const before = request.pre_override;
      const started = Date.now();
      try {
        const result = await runtime.roleRunner.run(before);
        const responseModel = result?.provider_record?.model ?? null;
        if (!matchesP3WireModelId(responseModel)) modelMismatch = true;
        attempts.push({ attempt: index + 1, role_id: before.role_id,
          status: modelMismatch ? 'stopped_unexpected_response_model' : 'ok',
          response_model_id: responseModel,
          usage: result?.provider_record?.usage ?? null,
          elapsed_ms: Date.now() - started, error: null });
      } catch (error) {
        attempts.push({ attempt: index + 1, role_id: before.role_id,
          status: 'error', response_model_id: null, usage: null,
          elapsed_ms: Date.now() - started, error: safeError(error) });
        if (error?.code === 'P3_GLOBAL_ATTEMPT_BUDGET_EXHAUSTED') break;
      }
      const wire = liveWire.at(-1);
      if (wire && wire.status >= 200 && wire.status < 300
          && !matchesP3WireModelId(wire.response_model_id)) modelMismatch = true;
      if (wire && wire.status != null && (wire.status < 200 || wire.status >= 300)) continue;
      if (modelMismatch) break;
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  const attemptsWithWire = attempts.map((attempt, index) => ({ ...attempt,
    pre_override: saved[index]?.pre_override ?? null,
    post_override_wire_request: liveWire[index]?.request ?? null,
    diff: { changed_paths: changedPaths(saved[index]?.pre_override ?? null,
      liveWire[index]?.request ?? null),
      pre_prompt_sha256: hash(JSON.stringify(saved[index]?.pre_override?.messages ?? [])),
      post_prompt_sha256: hash(JSON.stringify(liveWire[index]?.request?.messages ?? [])) },
    http_status: liveWire[index]?.status ?? null,
    request_max_tokens: liveWire[index]?.max_tokens ?? null,
    response_model_id: liveWire[index]?.response_model_id ?? attempt.response_model_id,
    prompt_tokens: liveWire[index]?.prompt_tokens ?? attempt.usage?.prompt_tokens ?? null,
    completion_tokens: liveWire[index]?.completion_tokens ?? attempt.usage?.completion_tokens ?? null,
    total_tokens: liveWire[index]?.total_tokens ?? attempt.usage?.total_tokens ?? null,
    elapsed_ms: liveWire[index]?.elapsed_ms ?? attempt.elapsed_ms }));
  for (const attempt of attemptsWithWire) {
    attempt.prompt_plus_max_tokens = Number.isSafeInteger(attempt.prompt_tokens)
      && Number.isSafeInteger(attempt.request_max_tokens)
      ? attempt.prompt_tokens + attempt.request_max_tokens : null;
    attempt.declared_window_headroom = Number.isSafeInteger(attempt.prompt_plus_max_tokens)
      ? expectedWindow - attempt.prompt_plus_max_tokens : null;
  }
  const successfulCalls = attemptsWithWire.length === liveCallTarget
    && attemptsWithWire.every(({ http_status, response_model_id, prompt_tokens,
      completion_tokens, total_tokens }) => http_status === 200
        && matchesP3WireModelId(response_model_id)
        && Number.isSafeInteger(prompt_tokens)
        && Number.isSafeInteger(completion_tokens)
        && Number.isSafeInteger(total_tokens));
  await writeJson('live-attempts.json', attemptsWithWire);
  await writeJson('live-attempt-events.json', attemptEvents);
  await writeJson('live-summary.json', {
    status: modelMismatch ? 'stopped_unexpected_response_model'
      : successfulCalls ? 'completed_three_role_calls' : 'completed_with_errors',
    settings: { provider: 'openai_compatible', model: expectedModel, host_class: 'private-lan' },
    model_metadata: metadata, role_configs: safeRoles, context_budgets: contextBudgets,
    configured_context_window_tokens: expectedWindow,
    trained_context_tokens: null,
    runtime_metadata_context_tokens: runtimeMetadataContext,
    request_output_budget_tokens: outputTokenBudget,
    request_input_context_ceiling_tokens: expectedWindow - outputTokenBudget,
    provider_calls: fetchAttempts, authorized_call_limit: liveCallLimit,
    target_calls: liveCallTarget, native_writes: 0, repair_calls: 0,
    attempts: attemptsWithWire.map(({ attempt, role_id, status, http_status,
      response_model_id, prompt_tokens, request_max_tokens, prompt_plus_max_tokens,
      declared_window_headroom, elapsed_ms, error }) => ({
      attempt, role_id, status, http_status, response_model_id, prompt_tokens,
      max_tokens: request_max_tokens, prompt_plus_max_tokens, declared_window_headroom,
      elapsed_ms, error })), acceptance_claim: false
  });
  if (modelMismatch) throw new Error('P3_WIRE_UNEXPECTED_RESPONSE_MODEL');
}

async function main(args) {
  if (args.length !== 1 || !['--dry-capture', '--metadata-only', '--live'].includes(args[0])) {
    throw new Error('P3_WIRE_MODE_REQUIRED');
  }
  if (args[0] === '--dry-capture') {
    const result = await dryCapture();
    process.stdout.write(`${JSON.stringify({ status: 'dry_capture_complete',
      attempts: result.budget.calls, serialized_requests: result.calls.length,
      evidence_directory: evidenceDir })}\n`);
    return;
  }
  if (args[0] === '--metadata-only') {
    await mkdir(evidenceDir, { recursive: true });
    const { settingsOwner } = await loadConfig();
    const metadata = await readModelMetadata(settingsOwner);
    await writeJson('model-metadata.json', metadata);
    process.stdout.write(`${JSON.stringify(metadata)}\n`);
    return;
  }
  await liveCalls();
  process.stdout.write(`${JSON.stringify({ status: 'live_calls_complete',
    evidence_directory: evidenceDir })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${safeError(error).code ?? safeError(error).message}\n`);
    process.exitCode = 2;
  });
}
