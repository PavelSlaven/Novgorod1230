const SECRET_KEY_PATTERN = /^(api[_-]?key|authorization|cookie|token|password|secret|bearer|ui[_-]?server[_-]?token)$/iu;
const BEARER_PATTERN = /Bearer\s+\S+/giu;
const ENV_VALUE_PATTERN = /(OPENAI_API_KEY|DEEPSEEK_API_KEY|UI_SERVER_TOKEN|API_KEY)\s*=\s*\S+/giu;

let nextEventId = 1;
let nextCallId = 1;

export function createDiagnosticJournal(options = {}) {
  const maxEntries = Number.isFinite(options.maxEntries) ? options.maxEntries : 500;
  const events = [];
  const pendingByKey = new Map();

  const journal = {
    events,
    record(input = {}) {
      const event = normalizeDiagnosticEvent(input);
      events.unshift(event);
      if (events.length > maxEntries) events.length = maxEntries;
      return event;
    },
    recordLlmCallStart(input = {}) {
      const callId = input.callId ?? `call-${nextCallId++}`;
      const event = journal.record({
        ...input,
        callId,
        eventId: input.eventId ?? input.id ?? null,
        kind: input.kind ?? 'llm_call',
        at: input.at ?? new Date().toISOString()
      });
      const key = llmPendingKey(event);
      pendingByKey.set(key, { id: event.id, callId });
      return event;
    },
    recordLlmCallSuccess(input = {}) {
      const pending = resolvePending(pendingByKey, input);
      return journal.record({
        ...pending,
        ...input,
        callId: input.callId ?? pending?.callId ?? null,
        eventId: input.eventId ?? pending?.eventId ?? pending?.id ?? null,
        kind: input.kind ?? 'llm_response',
        endedAt: input.endedAt ?? new Date().toISOString(),
        durationMs: input.durationMs ?? pending?.durationMs ?? computeDuration(pending, input)
      });
    },
    recordLlmCallFailure(input = {}) {
      const pending = resolvePending(pendingByKey, input);
      return journal.record({
        ...pending,
        ...input,
        callId: input.callId ?? pending?.callId ?? null,
        eventId: input.eventId ?? pending?.eventId ?? pending?.id ?? null,
        kind: input.kind ?? 'error',
        endedAt: input.endedAt ?? new Date().toISOString(),
        durationMs: input.durationMs ?? pending?.durationMs ?? computeDuration(pending, input),
        includeRawDetails: input.includeRawDetails ?? true
      });
    },
    recordValidationFailure(input = {}) {
      return journal.record({
        ...input,
        kind: input.kind ?? 'validation',
        validation: normalizeValidationDiagnostics(input.validation ?? input.validationResult ?? input),
        includeRawDetails: input.includeRawDetails ?? true
      });
    },
    recordRetry(input = {}) {
      return journal.record({
        ...input,
        kind: input.kind ?? 'retry',
        retry: normalizeRetryDiagnostics(input.retry ?? input),
        includeRawDetails: input.includeRawDetails ?? true
      });
    },
    adaptStage(stage = {}, context = {}) {
      if (!stage || typeof stage !== 'object') return null;
      const phase = String(stage.phase ?? '').toLowerCase();
      const hasResponse = stage.responseRaw !== undefined && stage.responseRaw !== null
        || stage.responsePreview
        || Array.isArray(stage.responseSections) && stage.responseSections.length > 0;
      const hasRequest = stage.requestRaw !== undefined && stage.requestRaw !== null
        || stage.requestPreview
        || Array.isArray(stage.requestSections) && stage.requestSections.length > 0;
      const base = {
        phase: stage.phase ?? context.phase ?? null,
        label: stage.label ?? context.label ?? null,
        message: stage.message ?? null,
        progress: stage.progress ?? null,
        attempt: stage.attempt ?? context.attempt ?? null,
        maxAttempts: stage.maxAttempts ?? context.maxAttempts ?? null,
        provider: stage.provider ?? context.provider ?? null,
        model: stage.model ?? context.model ?? null,
        temperature: stage.temperature ?? null,
        maxTokens: stage.maxTokens ?? stage.max_tokens ?? null,
        durationMs: stage.durationMs ?? null,
        requestPreview: stage.requestPreview ?? null,
        requestRaw: stage.requestRaw ?? null,
        requestSections: stage.requestSections ?? null,
        responsePreview: stage.responsePreview ?? null,
        responseRaw: stage.responseRaw ?? null,
        responseSections: stage.responseSections ?? null,
        parsed: stage.parsed ?? stage.parsedJson ?? null,
        validation: stage.validation ?? stage.validationResult ?? null,
        audit: stage.audit ?? stage.auditResult ?? null,
        repair: stage.repair ?? null,
        schema: stage.schema ?? null,
        tokenUsage: stage.tokenUsage ?? null
      };

      if (/llm_retry|retry|repair|повтор/.test(`${phase} ${stage.label ?? ''}`)) {
        return journal.recordRetry({
          ...base,
          retry: {
            reason: stage.message ?? stage.retryReason ?? null,
            delayMs: stage.retryDelayMs ?? null,
            attempt: base.attempt,
            maxAttempts: base.maxAttempts
          }
        });
      }

      if (/validation|валид/.test(`${phase} ${stage.label ?? ''} ${stage.message ?? ''}`)
        || hasValidationSections(stage.responseSections)) {
        return journal.recordValidationFailure({
          ...base,
          validation: buildValidationFromStage(stage)
        });
      }

      if (phase === 'llm_response' || (hasResponse && /готов|вернул|completed|success/i.test(String(stage.message ?? '')))) {
        return journal.recordLlmCallSuccess({ ...base, kind: 'llm_response' });
      }

      if (hasResponse && /fail|error|ошиб|invalid|не прош/i.test(String(stage.message ?? ''))) {
        return journal.recordLlmCallFailure({ ...base, error: stage.error ?? stage.message ?? null });
      }

      if (hasRequest && !hasResponse) {
        return journal.recordLlmCallStart({ ...base, kind: 'llm_call' });
      }

      return journal.record({
        ...base,
        kind: inferStageKind(stage)
      });
    },
    adaptCall(call = {}, context = {}) {
      const status = String(call.status ?? 'ok').toLowerCase();
      const payload = {
        phase: context.phase ?? 'llm_call',
        label: context.label ?? 'LLM-вызов',
        message: context.message ?? (status === 'ok' ? 'LLM call completed.' : 'LLM call failed.'),
        attempt: context.attempt ?? null,
        maxAttempts: context.maxAttempts ?? null,
        provider: call.provider ?? context.provider ?? null,
        model: call.model ?? context.model ?? null,
        temperature: call.temperature ?? null,
        maxTokens: call.maxTokens ?? null,
        durationMs: call.durationMs ?? null,
        error: call.error ?? null,
        requestPreview: context.requestPreview ?? null,
        requestRaw: context.requestRaw ?? null,
        requestSections: context.requestSections ?? null,
        responsePreview: context.responsePreview ?? null,
        responseRaw: context.responseRaw ?? null,
        responseSections: context.responseSections ?? null,
        tokenUsage: call.tokenUsage ?? context.tokenUsage ?? null
      };
      if (status === 'error') return journal.recordLlmCallFailure(payload);
      return journal.recordLlmCallSuccess(payload);
    },
    snapshot(options = {}) {
      const forceRaw = Boolean(options.includeRawDetails);
      return events.map((entry) => normalizeJournalEntry(entry, {
        includeDiagnostics: options.includeDiagnostics !== false,
        includeRawDetails: forceRaw || Boolean(entry.includeRawDetails)
      }));
    },
    buildArtifactMeta(status = 'success') {
      return buildArtifactDiagnostics(events, status);
    }
  };

  return journal;
}

export function normalizeDiagnosticEvent(input = {}) {
  const at = input.at ?? input.startedAt ?? new Date().toISOString();
  const endedAt = input.endedAt ?? input.finishedAt ?? null;
  const durationMs = Number.isFinite(input.durationMs)
    ? input.durationMs
    : (endedAt && at ? Math.max(0, new Date(endedAt).getTime() - new Date(at).getTime()) : null);
  return {
    id: input.id ?? input.eventId ?? `evt-${nextEventId++}`,
    eventId: input.eventId ?? input.id ?? null,
    callId: input.callId ?? null,
    at,
    endedAt,
    durationMs,
    kind: input.kind ?? 'info',
    phase: input.phase ?? null,
    label: input.label ?? null,
    message: input.message ?? null,
    progress: Number.isFinite(input.progress) ? input.progress : null,
    attempt: input.attempt ?? null,
    maxAttempts: input.maxAttempts ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
    temperature: input.temperature ?? null,
    maxTokens: input.maxTokens ?? null,
    schema: input.schema ?? null,
    requestPreview: input.requestPreview ?? null,
    requestRaw: input.requestRaw ?? null,
    requestSections: cloneSections(input.requestSections),
    responsePreview: input.responsePreview ?? null,
    responseRaw: input.responseRaw ?? null,
    responseSections: cloneSections(input.responseSections),
    parsed: input.parsed ?? input.parsedJson ?? null,
    validation: normalizeValidationDiagnostics(input.validation ?? input.validationResult),
    audit: input.audit ?? input.auditResult ?? null,
    repair: input.repair ?? null,
    error: serializeDiagnosticError(input.error),
    stack: input.stack ?? (input.error instanceof Error ? input.error.stack ?? null : null),
    retry: normalizeRetryDiagnostics(input.retry),
    tokenUsage: input.tokenUsage ?? null,
    includeRawDetails: Boolean(input.includeRawDetails)
  };
}

export function normalizeJournalEntry(entry, options = {}) {
  const normalized = normalizeDiagnosticEvent(entry);
  const includeDiagnostics = Boolean(options.includeDiagnostics);
  const includeRawDetails = Boolean(options.includeRawDetails);
  normalized.includeRawDetails = includeRawDetails;

  if (!includeRawDetails) {
    delete normalized.requestRaw;
    delete normalized.responseRaw;
    if (!includeDiagnostics) {
      delete normalized.requestPreview;
      delete normalized.responsePreview;
      delete normalized.requestSections;
      delete normalized.responseSections;
    }
  }
  if (!includeDiagnostics) {
    delete normalized.provider;
    delete normalized.model;
    delete normalized.temperature;
    delete normalized.maxTokens;
    delete normalized.durationMs;
    delete normalized.tokenUsage;
    delete normalized.stack;
    delete normalized.parsed;
    delete normalized.validation;
    delete normalized.audit;
    delete normalized.repair;
    delete normalized.retry;
  }
  return normalized;
}

export function resolveIncludeRawDetails(artifactMode, status) {
  if (String(status ?? '').toLowerCase() === 'error') return true;
  return artifactMode === 'development';
}

export function redactSecrets(value) {
  if (typeof value === 'string') {
    return value
      .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
      .replace(ENV_VALUE_PATTERN, (match) => `${match.split('=')[0].trim()}=[REDACTED]`);
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      output[key] = '[REDACTED]';
      continue;
    }
    output[key] = redactSecrets(nested);
  }
  return output;
}

export function buildFailureSummary(events = [], options = {}) {
  const journal = Array.isArray(events) ? events : [];
  const status = String(options.status ?? 'success').toLowerCase();
  const error = options.error ?? null;
  const llmCalls = journal.filter((entry) => /llm_call|llm_response|llm/.test(String(entry.kind ?? '')));
  const retries = journal.filter((entry) => String(entry.kind ?? '') === 'retry');
  const validationEvents = journal.filter((entry) => String(entry.kind ?? '') === 'validation'
    || hasValidationSections(entry.responseSections)
    || Boolean(entry.validation));
  const lastSuccess = journal.find((entry) => String(entry.kind ?? '') === 'llm_response' && entry.responsePreview);
  const lastInvalid = journal.find((entry) => (
    String(entry.kind ?? '') === 'error'
    || String(entry.kind ?? '') === 'validation'
    || /validation|invalid|не прош/i.test(String(entry.message ?? ''))
  ) && (entry.responseRaw || entry.responsePreview));
  const failed = journal.find((entry) => String(entry.kind ?? '') === 'error') ?? validationEvents[0] ?? null;
  const rootCause = extractRootCause(error, failed, validationEvents[0]);
  const validationByStage = collectValidationByStage(journal);
  const failedValidationStage = inferFailedValidationStage(failed, validationEvents[0]);
  const previousValidationWarnings = {};
  for (const [stage, errors] of Object.entries(validationByStage)) {
    if (stage !== failedValidationStage && errors.length > 0) {
      previousValidationWarnings[stage] = errors;
    }
  }
  return {
    status,
    provider: options.provider ?? lastSuccess?.provider ?? failed?.provider ?? null,
    model: options.model ?? lastSuccess?.model ?? failed?.model ?? null,
    startedAt: options.startedAt ?? null,
    finishedAt: options.finishedAt ?? null,
    durationMs: options.durationMs ?? null,
    totalLlmCalls: llmCalls.length,
    totalRetries: retries.length,
    failedStage: failed?.phase ?? failed?.label ?? failedValidationStage ?? null,
    failedValidationStage,
    failedAttempt: failed?.attempt ?? null,
    failedMaxAttempts: failed?.maxAttempts ?? null,
    lastSuccessfulStage: lastSuccess?.label ?? lastSuccess?.phase ?? null,
    lastSuccessfulResponsePreview: lastSuccess?.responsePreview ?? null,
    validationByStage,
    validation: failedValidationStage ? validationByStage[failedValidationStage] ?? [] : [],
    previousValidationWarnings,
    validationErrorSummary: summarizeValidation(journal),
    rootCause,
    suggestedFix: suggestFix(rootCause, validationEvents[0])
  };
}

export function parseValidationErrorLine(line) {
  const text = String(line ?? '').trim();
  const match = text.match(/^([^:]+):\s*expected\s+(.+?),\s*got\s+(.+)$/iu);
  if (!match) return { message: text || null };
  return {
    path: match[1].trim(),
    expected: match[2].trim(),
    actual: match[3].trim(),
    message: text
  };
}

function normalizeValidationDiagnostics(validation) {
  if (!validation) return null;
  if (Array.isArray(validation)) {
    return {
      ok: false,
      errors: validation.map((item) => (typeof item === 'string' ? parseValidationErrorLine(item) : item))
    };
  }
  if (typeof validation === 'object') {
    const errors = Array.isArray(validation.errors)
      ? validation.errors.map((item) => (typeof item === 'string' ? parseValidationErrorLine(item) : item))
      : [];
    return {
      schema: validation.schema ?? validation.schemaName ?? null,
      ok: validation.ok !== false && errors.length === 0,
      errors,
      path: validation.path ?? null,
      expected: validation.expected ?? null,
      actual: validation.actual ?? null,
      rawValue: validation.rawValue ?? null,
      sourceStage: validation.sourceStage ?? null,
      parsedObject: validation.parsedObject ?? validation.parsed ?? null,
      originalResponse: validation.originalResponse ?? null,
      repairAttempts: validation.repairAttempts ?? null
    };
  }
  return { ok: false, errors: [{ message: String(validation) }] };
}

function normalizeRetryDiagnostics(retry) {
  if (!retry) return null;
  if (typeof retry === 'string') return { reason: retry };
  return {
    reason: retry.reason ?? retry.retryReason ?? null,
    delayMs: retry.delayMs ?? retry.retryDelayMs ?? null,
    attempt: retry.attempt ?? null,
    maxAttempts: retry.maxAttempts ?? null
  };
}

function serializeDiagnosticError(error) {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && typeof error.message === 'string') return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function cloneSections(sections) {
  return Array.isArray(sections) ? sections.map((section) => ({
    title: section?.title ?? '',
    lines: Array.isArray(section?.lines) ? section.lines.slice() : []
  })) : null;
}

function llmPendingKey(event = {}) {
  return [event.phase, event.label, event.attempt].join('|');
}

function resolvePending(pendingByKey, input = {}) {
  const key = llmPendingKey(input);
  const pending = pendingByKey.get(key);
  if (!pending) return null;
  pendingByKey.delete(key);
  return pending;
}

function computeDuration(pending, input) {
  const start = pending?.at ?? input.at;
  const end = input.endedAt ?? new Date().toISOString();
  if (!start || !end) return null;
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}

function inferStageKind(stage = {}) {
  const phase = String(stage.phase ?? '').toLowerCase();
  if (/audit/.test(phase)) return 'audit';
  if (/save/.test(phase)) return 'save';
  if (/error|fail/.test(`${phase} ${stage.message ?? ''}`)) return 'error';
  if (/llm/.test(phase)) return 'llm';
  return 'info';
}

function hasValidationSections(sections) {
  return Array.isArray(sections) && sections.some((section) => /validation|валид/i.test(String(section?.title ?? '')));
}

function buildValidationFromStage(stage = {}) {
  const lines = [];
  for (const section of Array.isArray(stage.responseSections) ? stage.responseSections : []) {
    if (!hasValidationSections([section])) continue;
    for (const line of Array.isArray(section.lines) ? section.lines : []) lines.push(line);
  }
  return normalizeValidationDiagnostics({
    schema: stage.schema ?? null,
    ok: false,
    errors: lines,
    parsedObject: stage.parsed ?? stage.parsedJson ?? null,
    originalResponse: stage.responseRaw ?? stage.responsePreview ?? null,
    sourceStage: stage.label ?? stage.phase ?? null
  });
}

function inferValidationStage(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const text = `${entry.schema ?? ''} ${entry.phase ?? ''} ${entry.label ?? ''} ${entry.message ?? ''}`.toLowerCase();
  if (/player_seed|player seed|player dossier/i.test(text)) return 'player_seed';
  if (/visible_context|visible context/i.test(text)) return 'visible_context_package';
  if (/narrator_audit|narrator audit|semantic_audit.*narrator/i.test(text)) return 'narrator_audit';
  if (/narrator_prose|narrator prose|narrator-проз/i.test(text)) return 'narrator_prose';
  return null;
}

function collectValidationByStage(events = []) {
  const byStage = {
    player_seed: [],
    visible_context_package: [],
    narrator_audit: [],
    narrator_prose: []
  };
  for (const entry of events) {
    const stage = inferValidationStage(entry);
    if (!stage) continue;
    const lines = [];
    for (const item of entry.validation?.errors ?? []) {
      const text = typeof item === 'string' ? item : item?.message ?? JSON.stringify(item);
      if (text) lines.push(text);
    }
    for (const section of entry.responseSections ?? []) {
      if (!hasValidationSections([section])) continue;
      for (const line of section.lines ?? []) lines.push(String(line));
    }
    if (lines.length) byStage[stage].push(...lines);
  }
  return byStage;
}

function inferFailedValidationStage(failed, validationEvent) {
  return inferValidationStage(failed) ?? inferValidationStage(validationEvent);
}

function buildArtifactDiagnostics(events, status) {
  const journal = Array.isArray(events) ? events : [];
  return {
    llmCalls: journal.filter((entry) => /llm/.test(String(entry.kind ?? ''))).length,
    validationErrors: journal.flatMap((entry) => entry.validation?.errors ?? []),
    retryLog: journal.filter((entry) => String(entry.kind ?? '') === 'retry').map((entry) => ({
      at: entry.at,
      label: entry.label,
      attempt: entry.attempt,
      reason: entry.retry?.reason ?? entry.message ?? null,
      delayMs: entry.retry?.delayMs ?? null
    }))
  };
}

function summarizeValidation(events) {
  const lines = [];
  for (const entry of events) {
    for (const item of entry.validation?.errors ?? []) {
      const text = typeof item === 'string' ? item : item?.message ?? JSON.stringify(item);
      if (text) lines.push(text);
    }
    for (const section of entry.responseSections ?? []) {
      if (!hasValidationSections([section])) continue;
      for (const line of section.lines ?? []) lines.push(String(line));
    }
  }
  return lines.length ? lines.join('; ') : null;
}

function extractRootCause(error, failed, validationEvent) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (failed?.error) return failed.error;
  if (failed?.message) return failed.message;
  const validationSummary = summarizeValidation(validationEvent ? [validationEvent] : []);
  return validationSummary || null;
}

function suggestFix(rootCause, validationEvent) {
  const text = String(rootCause ?? '').toLowerCase();
  if (text.includes('root.season')) {
    return 'Проверьте enum season: допустимы только канонические значения, не «поздняя осень».';
  }
  if (validationEvent?.validation?.errors?.length) {
    const first = validationEvent.validation.errors[0];
    if (first?.path && first?.expected) {
      return `Исправьте ${first.path}: ожидается ${first.expected}, получено ${first.actual ?? 'некорректное значение'}.`;
    }
  }
  if (/invalid json|not parseable|json_not_object/i.test(text)) {
    return 'Попросите shaper вернуть только JSON-контракт без dossier/audit/prose.';
  }
  if (/truncat|maxtokens|output likely truncated/i.test(text)) {
    return 'Увеличьте maxTokens для PlayerSeedShaper или включите compact shape.';
  }
  if (/wrong_schema/i.test(text)) {
    return 'Shaper должен вернуть schema="player_seed", version=1 — не semantic_audit и не другие контракты.';
  }
  return null;
}

// ponytail: thin wrappers so provider/tests can call helpers without journal method chaining
export function recordLlmCallStart(journal, input = {}) {
  return journal.recordLlmCallStart(input);
}

export function recordLlmCallSuccess(journal, input = {}) {
  return journal.recordLlmCallSuccess(input);
}

export function recordLlmCallFailure(journal, input = {}) {
  return journal.recordLlmCallFailure(input);
}

export function recordValidationFailure(journal, input = {}) {
  return journal.recordValidationFailure(input);
}

export function recordRetry(journal, input = {}) {
  return journal.recordRetry(input);
}
