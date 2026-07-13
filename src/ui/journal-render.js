export const JOURNAL_FILTERS = ['all', 'llm_call', 'llm_response', 'validation', 'audit', 'repair', 'retry', 'error', 'save'];

export function resolveDiagnosticJournal(process = {}) {
  const journal = process.diagnosticJournal
    ?? process.hooks?.journal
    ?? process.journal
    ?? [];
  return dedupeDiagnosticJournal(Array.isArray(journal) ? journal : []);
}

// ponytail: only collapse llm_call+terminal pairs with same callId when payloads agree
export function dedupeDiagnosticJournal(entries = []) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  const byKey = new Map();
  const kept = [];

  for (const entry of list) {
    const key = entry?.callId ?? entry?.eventId ?? entry?.id;
    if (!key) {
      kept.push(entry);
      continue;
    }
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { entry, index: kept.length });
      kept.push(entry);
      continue;
    }
    const merged = tryMergeDiagnosticPair(prev.entry, entry);
    if (merged === null) {
      kept.push(entry);
      continue;
    }
    kept[prev.index] = merged;
    byKey.set(key, { entry: merged, index: prev.index });
  }
  return kept;
}

export function normalizeJournalKind(value) {
  const text = String(value ?? 'info').toLowerCase();
  if (/^validation$/.test(text)) return 'validation';
  if (/^audit$/.test(text) || /audit/.test(text)) return 'audit';
  if (/^repair$/.test(text) || /repair/.test(text)) return 'repair';
  if (/^save$/.test(text)) return 'save';
  if (/error|fail|ошиб/.test(text)) return 'error';
  if (/retry|повтор/.test(text)) return 'retry';
  if (/warn|предуп/.test(text)) return 'warning';
  if (/done|заверш/.test(text)) return 'done';
  if (/start/.test(text)) return 'start';
  if (/update/.test(text)) return 'update';
  if (/llm_response/.test(text)) return 'llm_response';
  if (/llm_call|llm/.test(text)) return 'llm_call';
  return text.replace(/[^a-zа-я0-9_-]+/giu, '-') || 'info';
}

export function humanizeJournalKind(value) {
  const kind = normalizeJournalKind(value);
  const map = {
    llm_call: 'LLM call',
    llm_response: 'LLM response',
    validation: 'validation',
    audit: 'audit',
    repair: 'repair',
    save: 'save',
    retry: 'retry',
    error: 'error',
    warning: 'warning',
    done: 'done',
    start: 'start',
    update: 'update'
  };
  return map[kind] ?? 'info';
}

export function shouldShowJournalRaw(entry = {}, processError = false) {
  return Boolean(entry?.includeRawDetails) || Boolean(processError);
}

export function formatJournalValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function buildJournalTechParts(entry = {}) {
  return [
    entry?.provider ? `provider: ${entry.provider}` : null,
    entry?.model ? `model: ${entry.model}` : null,
    entry?.temperature !== null && entry?.temperature !== undefined ? `temperature: ${entry.temperature}` : null,
    entry?.maxTokens !== null && entry?.maxTokens !== undefined ? `maxTokens: ${entry.maxTokens}` : null,
    entry?.durationMs !== null && entry?.durationMs !== undefined ? `duration: ${entry.durationMs} ms` : null,
    entry?.schema ? `schema: ${entry.schema}` : null,
    entry?.tokenUsage ? `tokens: ${formatTokenUsage(entry.tokenUsage)}` : null
  ].filter(Boolean);
}

export function buildJournalSections(entry = {}) {
  return [
    ...(Array.isArray(entry?.requestSections) ? entry.requestSections.map((item) => ({ ...item, prefix: 'Запрос' })) : []),
    ...(Array.isArray(entry?.responseSections) ? entry.responseSections.map((item) => ({ ...item, prefix: 'Ответ' })) : [])
  ];
}

export function buildJournalDetailBlocks(entry = {}, showRaw = false) {
  const blocks = [];
  if (entry?.requestPreview) blocks.push({ label: 'Запрос · preview', text: entry.requestPreview });
  if (showRaw && entry?.requestRaw !== undefined && entry?.requestRaw !== null) {
    blocks.push({ label: 'Запрос · raw', text: entry.requestRaw });
  }
  if (entry?.responsePreview) blocks.push({ label: 'Ответ · preview', text: entry.responsePreview });
  if (showRaw && entry?.responseRaw !== undefined && entry?.responseRaw !== null) {
    blocks.push({ label: 'Ответ · raw', text: entry.responseRaw });
  }
  if (entry?.parsed) blocks.push({ label: 'Parsed JSON', text: entry.parsed });
  if (entry?.validation) blocks.push({ label: 'Validation', text: entry.validation });
  if (entry?.audit) blocks.push({ label: 'Audit', text: entry.audit });
  if (entry?.repair) blocks.push({ label: 'Repair', text: entry.repair });
  if (entry?.retry) blocks.push({ label: 'Retry', text: entry.retry });
  return blocks;
}

export function journalEntryHasDetails(entry = {}, showRaw = false) {
  const sections = buildJournalSections(entry);
  return Boolean(
    sections.length
    || (showRaw && (entry?.requestPreview || entry?.requestRaw || entry?.responsePreview || entry?.responseRaw))
    || (!showRaw && (entry?.requestPreview || entry?.responsePreview))
    || entry?.validation
    || entry?.audit
    || entry?.repair
    || entry?.parsed
    || entry?.error
  );
}

export function journalFilterMatches(filter, entry = {}) {
  const kind = normalizeJournalKind(entry?.kind ?? entry?.phase);
  if (filter === 'all') return true;
  if (filter === 'llm_call') return kind === 'llm_call' || kind === 'llm';
  return kind === filter;
}

export function buildJournalMessage(entry = {}) {
  return `${entry?.label ?? ''}${entry?.message ? ` — ${entry.message}` : ''}${entry?.attempt ? ` · попытка ${entry.attempt}${entry?.maxAttempts ? `/${entry.maxAttempts}` : ''}` : ''}`.trim();
}

function formatTokenUsage(usage = {}) {
  const parts = [];
  if (usage.prompt_tokens != null) parts.push(`prompt=${usage.prompt_tokens}`);
  if (usage.completion_tokens != null) parts.push(`completion=${usage.completion_tokens}`);
  if (usage.total_tokens != null) parts.push(`total=${usage.total_tokens}`);
  return parts.length ? parts.join(', ') : JSON.stringify(usage);
}

function tryMergeDiagnosticPair(a, b) {
  const kindA = normalizeJournalKind(a?.kind);
  const kindB = normalizeJournalKind(b?.kind);
  const isStart = (kind) => kind === 'llm_call' || kind === 'llm';
  const isTerminal = (kind) => kind === 'llm_response' || kind === 'error';
  if (!(isStart(kindA) && isTerminal(kindB)) && !(isStart(kindB) && isTerminal(kindA))) {
    return null;
  }
  const winner = isTerminal(kindB) ? b : a;
  const loser = isTerminal(kindB) ? a : b;
  if (diagnosticEntriesConflict(winner, loser)) return null;
  return { ...loser, ...winner };
}

function diagnosticEntriesConflict(a, b) {
  for (const field of ['requestPreview', 'requestRaw', 'responsePreview', 'responseRaw', 'error']) {
    const left = a?.[field];
    const right = b?.[field];
    if (left != null && right != null && JSON.stringify(left) !== JSON.stringify(right)) {
      return true;
    }
  }
  return false;
}
