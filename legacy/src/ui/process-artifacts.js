import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import {
  buildFailureSummary,
  normalizeJournalEntry as sanitizeJournalEntry,
  redactSecrets,
  resolveIncludeRawDetails
} from './diagnostic-events.js';
import {
  JOURNAL_FILTERS,
  buildJournalDetailBlocks,
  buildJournalMessage,
  buildJournalSections,
  buildJournalTechParts,
  formatJournalValue,
  humanizeJournalKind,
  journalEntryHasDetails,
  normalizeJournalKind,
  shouldShowJournalRaw
} from './journal-render.js';

const DEFAULT_ARTIFACT_DIR = resolve(process.cwd(), 'data', 'new-game-process');

export async function saveNewGameProcessArtifact(options = {}) {
  const artifactMode = resolveArtifactMode(options.artifactMode, options.includeRawDetails);
  if (artifactMode === 'production') {
    return { skipped: true, artifactMode, status: normalizeStatus(options.status) };
  }

  const completedAt = options.completedAt instanceof Date ? options.completedAt : new Date();
  const startedAt = options.startedAt instanceof Date ? options.startedAt : completedAt;
  const status = normalizeStatus(options.status);
  const artifactDir = resolveArtifactDir(options.artifactDir);
  const includeRawDetails = resolveIncludeRawDetails(artifactMode, status);
  await mkdir(artifactDir, { recursive: true });

  const filename = `${formatLocalTimestamp(completedAt)}-${status}.html`;
  const filePath = resolve(artifactDir, filename);
  const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
  const processSnapshot = normalizeProcess(options.process, {
    includeDiagnostics: true,
    includeRawDetails,
    status,
    artifactMode
  });
  const journal = Array.isArray(processSnapshot.journal) ? processSnapshot.journal : [];
  const diagnostics = buildFailureSummary(journal, {
    status,
    error: options.error,
    startedAt: startedAt.toISOString(),
    finishedAt: completedAt.toISOString(),
    durationMs,
    provider: options.state?.provider?.provider ?? null,
    model: options.state?.provider?.model ?? null
  });
  const payload = redactSecrets({
    kind: 'new_game_process_artifact',
    version: 1,
    status,
    createdAt: completedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    finishedAt: completedAt.toISOString(),
    durationMs,
    request: normalizeRequest(options.request, { includeRawDetails }),
    savePath: options.savePath ?? null,
    error: serializeError(options.error),
    process: finalizeProcessOnStatus(processSnapshot, status, completedAt.toISOString()),
    openingText: options.openingText ?? null,
    state: normalizeStateSummary(options.state),
    world: normalizeWorldSummary(options.world),
    diagnostics,
    llmCalls: journal.filter((entry) => /llm/.test(String(entry.kind ?? ''))),
    validationErrors: collectValidationErrors(journal),
    retryLog: journal.filter((entry) => String(entry.kind ?? '') === 'retry'),
    artifactMeta: {
      artifactMode,
      includeRawDetails,
      journalCount: journal.length
    },
    includeRawDetails,
    artifactMode
  });

  await writeFile(filePath, renderNewGameProcessArtifact(payload), 'utf8');
  await pruneArtifactDirectory(artifactDir, resolveArtifactLimit(options.maxArtifacts));
  return {
    filePath,
    relativePath: relative(process.cwd(), filePath),
    filename,
    status,
    createdAt: payload.createdAt
  };
}

export function buildClientProcessSnapshot(snapshot = {}, options = {}) {
  const includeDiagnostics = Boolean(options.includeDiagnostics);
  const artifactMode = resolveArtifactMode(options.artifactMode, options.includeRawDetails);
  const includeRawDetails = includeDiagnostics && artifactMode === 'development';
  return normalizeProcess(snapshot, { includeDiagnostics, includeRawDetails, status: 'success', artifactMode });
}

export function renderNewGameProcessArtifact(payload) {
  const data = normalizeArtifactPayload(payload);
  const processSnapshot = data.process;
  const items = Array.isArray(processSnapshot.items) ? processSnapshot.items : [];
  const journal = Array.isArray(processSnapshot.journal) ? processSnapshot.journal : [];
  const failure = data.diagnostics ?? buildFailureSummary(journal, {
    status: data.status,
    error: data.error,
    startedAt: data.startedAt,
    finishedAt: data.finishedAt ?? data.createdAt,
    durationMs: data.durationMs,
    provider: data.state?.provider?.provider ?? null,
    model: data.state?.provider?.model ?? null
  });
  const title = data.status === 'success' ? 'Создание мира завершено' : 'Создание мира прервано ошибкой';
  const statusLabel = data.status === 'success' ? 'success' : 'error';
  const providerName = failure.provider ?? data.state?.provider?.provider ?? 'нет данных';
  const modelName = failure.model ?? data.state?.provider?.model ?? 'нет данных';
  const provider = providerName === 'нет данных'
    ? modelName
    : `${providerName}${modelName !== 'нет данных' ? ` / ${modelName}` : ''}`;
  const summaryItems = [
    ['Статус', statusLabel],
    ['LLM / модель', provider],
    ['Длительность', `${Math.round(Number(data.durationMs ?? 0) / 1000)} c`],
    ['LLM-вызовов', String(failure.totalLlmCalls ?? 0)],
    ['Повторов', String(failure.totalRetries ?? 0)],
    ['Этап ошибки', failure.failedStage ? `${failure.failedStage}${failure.failedAttempt ? ` · попытка ${failure.failedAttempt}${failure.failedMaxAttempts ? `/${failure.failedMaxAttempts}` : ''}` : ''}` : 'нет данных'],
    ['Последний успех', failure.lastSuccessfulStage ? `${failure.lastSuccessfulStage}${failure.lastSuccessfulResponsePreview ? ` · ${clipInline(failure.lastSuccessfulResponsePreview, 120)}` : ''}` : 'нет данных'],
    ['Валидация', failure.validationErrorSummary ?? 'нет'],
    ['Корневая причина', failure.rootCause ?? data.error?.message ?? 'нет'],
    ['Рекомендация', failure.suggestedFix ?? 'нет'],
    ['Создано', formatDateTime(data.createdAt)]
  ];
  const fullSnapshot = redactSecrets({
    kind: data.kind,
    version: data.version,
    status: data.status,
    createdAt: data.createdAt,
    startedAt: data.startedAt,
    finishedAt: data.finishedAt ?? data.createdAt,
    durationMs: data.durationMs,
    request: data.request,
    savePath: data.savePath,
    error: data.error,
    process: processSnapshot,
    openingText: data.openingText,
    state: data.state,
    world: data.world,
    diagnostics: failure,
    llmCalls: data.llmCalls ?? journal.filter((entry) => /llm/.test(String(entry.kind ?? ''))),
    validationErrors: data.validationErrors ?? collectValidationErrors(journal),
    retryLog: data.retryLog ?? journal.filter((entry) => String(entry.kind ?? '') === 'retry'),
    artifactMeta: data.artifactMeta ?? null
  });
  const rawJson = safeJson(fullSnapshot);
  const recentJournal = journal.slice(0, 12);

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · ${escapeHtml(formatDateTime(data.createdAt))}</title>
  <style>${artifactCss()}</style>
</head>
<body>
  <main class="artifact-shell">
    <section class="generation-card">
      <div class="eyebrow">Создание мира</div>
      <h1>${escapeHtml(data.status === 'success' ? 'Мир собран' : 'Мир не собран')}</h1>
      <p class="loading-message">${escapeHtml(processSnapshot.message || title)}</p>
      <div class="loading-progress" aria-label="Общий прогресс создания мира">
        <div class="loading-progress-bar" style="width:${clampProgress(processSnapshot.progress)}%"></div>
      </div>
      <div class="loading-head">
        <div class="loading-state">${escapeHtml(processSnapshot.label || 'Ожидание')}</div>
        <div class="loading-percent">${Math.round(clampProgress(processSnapshot.progress))}%</div>
      </div>
      ${data.status === 'error' ? `<div class="generation-error">${escapeHtml(failure.rootCause || data.error?.message || 'Ошибка не указана')}</div>` : ''}
      <div class="generation-section-title">Этапы генерации</div>
      <div class="process-list">${items.length ? items.map(renderProcessItem).join('') : '<div class="empty-state">Список этапов пуст.</div>'}</div>
    </section>

    <aside class="generation-diagnostics">
      <div class="panel-header">
        <div>
          <div class="eyebrow">Диагностика</div>
          <h2>Процесс генерации</h2>
        </div>
        <div class="artifact-actions">
          <button id="expandAllButton" type="button" class="ghost-button small-button">Развернуть всё</button>
          <button id="collapseAllButton" type="button" class="ghost-button small-button">Свернуть всё</button>
          <button id="copyButton" type="button" class="ghost-button small-button">Copy full JSON</button>
          <button id="copyErrorButton" type="button" class="ghost-button small-button">Copy error only</button>
          <button id="copyLlmTraceButton" type="button" class="ghost-button small-button">Copy LLM trace</button>
        </div>
      </div>
      <div class="diagnostic-summary">${summaryItems.map(renderSummaryItem).join('')}</div>
      <div class="journal-toolbar">
        <div class="process-journal-head">Журнал пайплайна</div>
        <div class="journal-filters">${JOURNAL_FILTERS.map((filter) => `<button type="button" class="journal-filter${filter === 'all' ? ' is-active' : ''}" data-journal-filter="${filter}">${escapeHtml(filter)}</button>`).join('')}</div>
      </div>
      <div class="journal-list" id="journalList">${recentJournal.length ? recentJournal.map((entry, index) => renderJournalItem(entry, index)).join('') : '<div class="empty-state">Журнал пуст.</div>'}</div>
      <details class="inline-details full-journal-wrap">
        <summary>Полный журнал (${journal.length})</summary>
        <div class="journal-list journal-list-full">${journal.length ? journal.map((entry, index) => renderJournalItem(entry, index)).join('') : '<div class="empty-state">Журнал пуст.</div>'}</div>
      </details>
    </aside>
  </main>
  <details class="raw-json-wrap" open>
    <summary>Полный JSON-снимок</summary>
    <pre id="fullJsonBlock">${escapeHtml(JSON.stringify(fullSnapshot, null, 2))}</pre>
  </details>
  <script id="artifactPayload" type="application/json">${rawJson}</script>
  <script>
    const payloadNode = document.getElementById('artifactPayload');
    const payload = payloadNode ? JSON.parse(payloadNode.textContent || '{}') : {};
    const journalEntries = Array.from(document.querySelectorAll('.journal-item[data-kind]'));
    const setButtonLabel = (button, text) => { if (button) button.textContent = text; };
    const copyText = async (text, button, okLabel) => {
      try {
        await navigator.clipboard.writeText(text);
        setButtonLabel(button, okLabel);
      } catch {
        setButtonLabel(button, 'Не удалось скопировать');
      }
    };
    document.getElementById('copyButton')?.addEventListener('click', async (event) => {
      await copyText(JSON.stringify(payload, null, 2), event.currentTarget, 'Скопировано');
    });
    document.getElementById('copyErrorButton')?.addEventListener('click', async (event) => {
      const errorPayload = {
        status: payload.status,
        error: payload.error,
        diagnostics: payload.diagnostics,
        validationErrors: payload.validationErrors,
        retryLog: payload.retryLog
      };
      await copyText(JSON.stringify(errorPayload, null, 2), event.currentTarget, 'Скопировано');
    });
    document.getElementById('copyLlmTraceButton')?.addEventListener('click', async (event) => {
      const trace = (payload.process?.journal ?? []).filter((entry) => /llm|audit|validation|retry|repair/i.test(String(entry.kind ?? '') + ' ' + String(entry.phase ?? '')));
      await copyText(JSON.stringify(trace, null, 2), event.currentTarget, 'Скопировано');
    });
    document.getElementById('expandAllButton')?.addEventListener('click', () => {
      document.querySelectorAll('.journal-item details.inline-details').forEach((node) => { node.open = true; });
    });
    document.getElementById('collapseAllButton')?.addEventListener('click', () => {
      document.querySelectorAll('.journal-item details.inline-details').forEach((node) => { node.open = false; });
    });
    document.querySelectorAll('[data-journal-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        const filter = button.getAttribute('data-journal-filter') || 'all';
        document.querySelectorAll('[data-journal-filter]').forEach((node) => node.classList.toggle('is-active', node === button));
        journalEntries.forEach((entry) => {
          const kind = entry.getAttribute('data-kind') || '';
          const visible = filter === 'all' || kind === filter || (filter === 'llm_call' && kind === 'llm');
          entry.hidden = !visible;
        });
      });
    });
  </script>
</body>
</html>`;
}

function renderProcessItem(item) {
  const status = normalizeStatusName(item?.state ?? item?.status);
  const meta = item?.meta ?? item?.message ?? '';
  const techParts = [
    item?.alias ? `alias: ${item.alias}` : null,
    item?.phase ? `phase: ${item.phase}` : null,
    item?.attempt ? `attempt: ${item.attempt}${item.maxAttempts ? `/${item.maxAttempts}` : ''}` : null,
    item?.durationMs ? `duration: ${item.durationMs} ms` : null
  ].filter(Boolean);
  const detail = item?.error ?? item?.details ?? null;
  return `<div class="process-item ${escapeHtml(status)}">
    <div class="process-item-head">
      <div class="process-label">${escapeHtml(item?.label ?? 'Этап')}</div>
      <div class="process-status">${escapeHtml(status)}</div>
    </div>
    <div class="process-meta">${escapeHtml(meta)}</div>
    ${techParts.length ? `<div class="process-tech">${escapeHtml(techParts.join(' · '))}</div>` : ''}
    <div class="process-item-progress"><span style="width:${resolveItemProgress(item)}%"></span></div>
    ${detail ? `<details class="inline-details"><summary>${item?.error ? 'Ошибка' : 'Технические детали'}</summary><pre class="journal-block-body">${escapeHtml(String(detail))}</pre></details>` : ''}
  </div>`;
}

function renderJournalItem(entry, index = 0) {
  const kind = normalizeJournalKind(entry?.kind ?? entry?.phase);
  const sections = buildJournalSections(entry);
  const showRaw = shouldShowJournalRaw(entry);
  const hasDetails = journalEntryHasDetails(entry, showRaw);
  const techParts = buildJournalTechParts(entry);
  const detailBlocks = buildJournalDetailBlocks(entry, showRaw);
  return `<div class="journal-item ${escapeHtml(kind)}" data-kind="${escapeHtml(kind)}" data-index="${index}">
    <div class="journal-top">
      <div class="journal-kind">${escapeHtml(humanizeJournalKind(kind))}</div>
      <div class="journal-time">${escapeHtml(formatTime(entry?.at))}</div>
    </div>
    <div class="journal-message">${escapeHtml(buildJournalMessage(entry))}</div>
    ${techParts.length ? `<div class="process-tech">${escapeHtml(techParts.join(' · '))}</div>` : ''}
    ${entry?.error ? `<div class="journal-inline-error">${escapeHtml(String(entry.error))}</div>` : ''}
    ${hasDetails ? `<details class="inline-details"><summary>Технические детали</summary><div class="journal-detail">${sections.map(renderJournalSection).join('')}${detailBlocks.map((block) => renderJournalBlock(block.label, block.text)).join('')}</div></details>` : ''}
  </div>`;
}

function findLastStageByStatus(items, expectedStatus) {
  const list = Array.isArray(items) ? items : [];
  const wanted = normalizeStatusName(expectedStatus);
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];
    if (normalizeStatusName(item?.state ?? item?.status) === wanted) {
      return item;
    }
  }
  return null;
}

function findLastJournalByKind(journal, pattern) {
  const list = Array.isArray(journal) ? journal : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const entry = list[index];
    const text = `${entry?.kind ?? ''} ${entry?.phase ?? ''} ${entry?.label ?? ''} ${entry?.message ?? ''}`;
    if (pattern.test(text)) {
      return entry;
    }
  }
  return null;
}

function renderJournalSection(section) {
  const lines = Array.isArray(section?.lines) ? section.lines : [];
  return `<div class="journal-block journal-block-section">
    <div class="journal-block-title">${escapeHtml(`${section?.prefix ?? ''}: ${section?.title ?? ''}`)}</div>
    <div class="journal-block-list">${lines.map((line) => `<div class="journal-block-line">${escapeHtml(String(line))}</div>`).join('')}</div>
  </div>`;
}

function renderJournalBlock(label, text) {
  return `<div class="journal-block">
    <div class="journal-block-title">${escapeHtml(label)}</div>
    <pre class="journal-block-body">${escapeHtml(formatJournalValue(text))}</pre>
  </div>`;
}

function renderSummaryItem([label, value]) {
  return `<div class="diagnostic-summary-item"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(String(value ?? '—'))}</span></div>`;
}

function normalizeArtifactPayload(payload = {}) {
  const artifactMode = resolveArtifactMode(payload.artifactMode, payload.includeRawDetails);
  const status = normalizeStatus(payload.status);
  const includeRawDetails = resolveIncludeRawDetails(artifactMode, status);
  return {
    ...payload,
    kind: payload.kind ?? 'new_game_process_artifact',
    version: payload.version ?? 1,
    status,
    process: normalizeProcess(payload.process, {
      includeDiagnostics: true,
      includeRawDetails,
      status
    }),
    request: normalizeRequest(payload.request, { includeRawDetails }),
    error: serializeError(payload.error),
    createdAt: payload.createdAt ?? new Date().toISOString(),
    startedAt: payload.startedAt ?? payload.createdAt ?? new Date().toISOString(),
    finishedAt: payload.finishedAt ?? payload.createdAt ?? new Date().toISOString(),
    durationMs: Number.isFinite(payload.durationMs) ? payload.durationMs : 0,
    diagnostics: payload.diagnostics ?? null,
    llmCalls: payload.llmCalls ?? null,
    validationErrors: payload.validationErrors ?? null,
    retryLog: payload.retryLog ?? null,
    artifactMeta: payload.artifactMeta ?? null,
    includeRawDetails,
    artifactMode
  };
}

function normalizeStateSummary(state = {}) {
  if (!state || typeof state !== 'object') return null;
  return {
    provider: state.provider && typeof state.provider === 'object'
      ? {
          provider: state.provider.provider ?? null,
          model: state.provider.model ?? null
        }
      : null
  };
}

function normalizeWorldSummary(world = {}) {
  if (!world || typeof world !== 'object') return null;
  return {
    worldId: world.worldId ?? null,
    worldKey: world.worldKey ?? null,
    scenarioId: world.scenarioId ?? null
  };
}

function normalizeProcess(snapshot = {}, options = {}) {
  const includeDiagnostics = Boolean(options.includeDiagnostics);
  const status = options.status ?? null;
  const artifactMode = options.artifactMode ?? 'developer_safe';
  const includeRawDetails = resolveIncludeRawDetails(artifactMode, status) || Boolean(options.includeRawDetails);
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      busy: false,
      phase: 'idle',
      label: 'Ожидание',
      message: '',
      progress: 0,
      items: [],
      journal: [],
      finishedAt: null
    };
  }
  const journal = Array.isArray(snapshot.journal)
    ? snapshot.journal.map((entry) => {
      const normalized = sanitizeJournalEntry(entry, {
        includeDiagnostics,
        includeRawDetails
      });
      return normalized;
    })
    : [];
  return finalizeProcessOnStatus({
    busy: Boolean(snapshot.busy),
    phase: snapshot.phase ?? 'idle',
    label: snapshot.label ?? 'Ожидание',
    message: snapshot.message ?? '',
    progress: Number.isFinite(snapshot.progress) ? snapshot.progress : 0,
    items: Array.isArray(snapshot.items) ? snapshot.items : [],
    journal,
    updatedAt: snapshot.updatedAt ?? null,
    finishedAt: snapshot.finishedAt ?? null,
    diagnosticsVisible: includeDiagnostics
  }, status, snapshot.finishedAt ?? snapshot.updatedAt ?? null);
}

function finalizeProcessOnStatus(process, status, finishedAt = null) {
  const normalized = { ...process };
  if (String(status ?? '').toLowerCase() === 'error') {
    normalized.busy = false;
    normalized.phase = 'error';
    normalized.label = 'Ошибка';
    normalized.progress = 100;
    normalized.finishedAt = finishedAt ?? normalized.finishedAt ?? normalized.updatedAt ?? new Date().toISOString();
  }
  return normalized;
}

function collectValidationErrors(journal = []) {
  const errors = [];
  for (const entry of journal) {
    for (const item of entry?.validation?.errors ?? []) {
      errors.push(typeof item === 'string' ? item : item);
    }
  }
  return errors;
}

function clipInline(text, limit = 120) {
  const value = String(text ?? '').trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function normalizeRequest(request = {}, options = {}) {
  const includeRawDetails = Boolean(options.includeRawDetails);
  return {
    source: request?.source ?? null,
    text: includeRawDetails ? (request?.text ?? null) : null,
    playerName: request?.playerName ?? null
  };
}

function resolveArtifactDir(dir) {
  return dir ? resolve(process.cwd(), dir) : (process.env.NEW_GAME_ARTIFACTS_DIR ? resolve(process.cwd(), process.env.NEW_GAME_ARTIFACTS_DIR) : DEFAULT_ARTIFACT_DIR);
}

function resolveArtifactLimit(value) {
  const fallback = Number(process.env.NEW_GAME_ARTIFACT_LIMIT);
  const limit = Number.isFinite(Number(value)) ? Number(value) : fallback;
  if (!Number.isFinite(limit) || limit <= 0) return 20;
  return Math.floor(limit);
}

function resolveArtifactMode(mode, includeRawDetails) {
  const normalizedMode = String(mode ?? '').trim().toLowerCase();
  const canonicalMode = normalizedMode === 'safe' ? 'developer_safe' : normalizedMode;
  if (canonicalMode === 'development' || canonicalMode === 'developer_safe' || canonicalMode === 'production') {
    return canonicalMode;
  }
  if (typeof includeRawDetails === 'boolean') {
    return includeRawDetails ? 'development' : 'developer_safe';
  }
  const envMode = String(process.env.NEW_GAME_ARTIFACT_MODE ?? '').trim().toLowerCase();
  const canonicalEnvMode = envMode === 'safe' ? 'developer_safe' : envMode;
  if (canonicalEnvMode === 'development' || canonicalEnvMode === 'developer_safe' || canonicalEnvMode === 'production') {
    return canonicalEnvMode;
  }
  const legacyRawEnv = String(process.env.NEW_GAME_ARTIFACT_RAW ?? '').trim().toLowerCase();
  if (legacyRawEnv === '1' || legacyRawEnv === 'true' || legacyRawEnv === 'yes' || legacyRawEnv === 'on') {
    return 'development';
  }
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production') {
    return 'production';
  }
  return 'developer_safe';
}

async function pruneArtifactDirectory(artifactDir, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return;

  let entries = [];
  try {
    entries = await readdir(artifactDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const filePath = resolve(artifactDir, entry.name);
    try {
      const info = await stat(filePath);
      files.push({ filePath, mtimeMs: info.mtimeMs, name: entry.name });
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
  }

  if (files.length <= limit) return;
  files.sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
  for (const stale of files.slice(limit)) {
    try {
      await unlink(stale.filePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
}

function serializeError(error) {
  if (!error) return null;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null
    };
  }
  if (typeof error === 'object') {
    return {
      name: error.name ?? 'Error',
      message: error.message ?? JSON.stringify(error),
      stack: error.stack ?? null
    };
  }
  return { name: 'Error', message: String(error), stack: null };
}

function normalizeStatus(status) {
  return String(status ?? 'success').toLowerCase() === 'error' ? 'error' : 'success';
}

function formatLocalTimestamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate())
  ].join('-') + '_' + [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join('-') + '-' + pad(d.getMilliseconds(), 3);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</gu, '\\u003c');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function resolveItemProgress(item) {
  if (Number.isFinite(item?.progress)) return clampProgress(item.progress);
  switch (normalizeStatusName(item?.state ?? item?.status)) {
    case 'done': return 100;
    case 'running': return 60;
    case 'retrying': return 70;
    case 'warning': return 85;
    case 'failed': return 100;
    default: return 0;
  }
}

function normalizeStatusName(value) {
  const key = String(value ?? 'pending').toLowerCase();
  const map = {
    idle: 'pending',
    pending: 'pending',
    active: 'running',
    running: 'running',
    done: 'done',
    warning: 'warning',
    warn: 'warning',
    failed: 'failed',
    error: 'failed',
    retrying: 'retrying',
    retry: 'retrying'
  };
  return map[key] ?? 'pending';
}

function findLastDiagnostic(journal, pattern) {
  return (Array.isArray(journal) ? journal : []).find((entry) => {
    const text = `${entry?.kind ?? ''} ${entry?.phase ?? ''} ${entry?.label ?? ''} ${entry?.message ?? ''}`;
    return pattern.test(text);
  }) ?? null;
}

function isProcessError(snapshot) {
  const phase = String(snapshot?.phase ?? '').toLowerCase();
  const label = String(snapshot?.label ?? '').toLowerCase();
  const message = String(snapshot?.message ?? '').toLowerCase();
  return phase.includes('error') || label.includes('ошибка') || /ошиб|failed|validation|валид/.test(message);
}

function artifactCss() {
  return `:root{color-scheme:light;--paper:#f5ead4;--paper-deep:#e8d4ad;--paper-shadow:rgba(68,45,18,.18);--ink:#2f2316;--muted:#67513b;--accent:#8d4f28;--line:rgba(95,63,34,.18);--panel:rgba(255,250,241,.86);--panel-solid:#fffaf1;--good:#4e6f41;--warn:#8d6a1f;--danger:#8d3d2a;--shadow:0 22px 50px var(--paper-shadow)}*{box-sizing:border-box}body{min-height:100vh;margin:0;font-family:"Palatino Linotype","Book Antiqua",Georgia,serif;color:var(--ink);background:radial-gradient(circle at top left,rgba(255,255,255,.55),transparent 35%),radial-gradient(circle at bottom right,rgba(165,116,64,.18),transparent 35%),linear-gradient(180deg,#f8eedc 0%,#f1e0bf 100%)}body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(97,69,31,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(97,69,31,.025) 1px,transparent 1px);background-size:26px 26px;mix-blend-mode:multiply;opacity:.35}h1,h2,p{margin:0}.artifact-shell{position:relative;z-index:1;width:min(1920px,calc(100vw - 32px));min-height:calc(100vh - 32px);margin:16px auto;display:grid;grid-template-columns:minmax(320px,380px) 1fr;gap:16px}.generation-card,.generation-diagnostics,.raw-json-wrap{border:1px solid rgba(93,63,34,.18);border-radius:20px;background:linear-gradient(180deg,rgba(255,251,242,.97),rgba(246,233,208,.9));box-shadow:var(--shadow)}.generation-card,.generation-diagnostics{padding:18px}.generation-card{display:flex;flex-direction:column;gap:12px}.generation-diagnostics{display:grid;grid-template-rows:auto auto auto auto 1fr auto;gap:12px;min-width:0}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:.72rem;color:var(--muted);font-weight:700}h1{font-size:clamp(2rem,4vw,3.4rem);line-height:.98;letter-spacing:-.03em}h2{font-size:1.08rem}.loading-message{color:var(--muted);font-weight:700}.loading-progress,.process-item-progress{height:8px;border-radius:999px;background:rgba(95,63,34,.12);overflow:hidden}.loading-progress-bar,.process-item-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#b36c39,#e5b96e)}.loading-head,.panel-header,.process-item-head,.journal-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.loading-state,.process-label,.journal-message{font-weight:700}.loading-percent,.process-status,.journal-time,.process-tech,.process-meta{color:var(--muted);font-size:.82rem}.generation-error,.journal-inline-error{padding:10px 12px;border:1px solid rgba(141,61,42,.35);border-radius:12px;background:rgba(141,61,42,.08);color:var(--danger);font-weight:700}.journal-inline-error{margin-top:8px;font-size:.86rem}.generation-section-title,.process-journal-head{margin-top:8px;text-transform:uppercase;letter-spacing:.12em;font-size:.7rem;color:var(--muted);font-weight:700}.process-list,.journal-list{display:grid;gap:10px;overflow:auto}.journal-list{max-height:420px}.journal-list-full{max-height:none}.process-item,.journal-item,.diagnostic-summary-item{padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--panel)}.process-item.done .process-status{color:var(--good)}.process-item.failed .process-status,.journal-item.error .journal-kind{color:var(--danger)}.process-item.running .process-status,.journal-item.llm_call .journal-kind,.journal-item.llm_response .journal-kind{color:var(--accent)}.process-item.retrying .process-status,.journal-item.retry .journal-kind{color:var(--warn)}.process-meta{margin:4px 0 8px}.diagnostic-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.diagnostic-summary-item{display:grid;gap:4px}.diagnostic-summary-item strong{text-transform:uppercase;letter-spacing:.08em;font-size:.68rem;color:var(--muted)}.diagnostic-summary-item span{font-weight:700;overflow-wrap:anywhere}.artifact-actions,.journal-filters{display:flex;flex-wrap:wrap;gap:8px}.journal-toolbar{display:grid;gap:8px}.journal-filter{border:1px solid var(--line);border-radius:999px;background:rgba(255,250,241,.74);color:var(--ink);padding:6px 10px;cursor:pointer;font-size:.75rem}.journal-filter.is-active{background:rgba(141,90,48,.14);border-color:rgba(141,90,48,.35)}.ghost-button{border:1px solid var(--line);border-radius:999px;background:rgba(255,250,241,.74);color:var(--ink);padding:8px 12px;cursor:pointer}.small-button{font-size:.82rem}.inline-details{margin-top:8px}.inline-details summary,.raw-json-wrap summary{cursor:pointer;color:var(--accent);font-weight:700}.journal-detail{display:grid;gap:8px;margin-top:8px}.journal-block{display:grid;gap:4px}.journal-block-title{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700}.journal-block-body,.raw-json-wrap pre{max-height:360px;overflow:auto;margin:0;padding:10px;border:1px solid var(--line);border-radius:10px;background:rgba(255,250,241,.76);white-space:pre-wrap;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.journal-block-line{padding:4px 6px;border-radius:8px;background:rgba(255,250,241,.72);font-size:.86rem}.empty-state{padding:12px;border:1px dashed var(--line);border-radius:12px;color:var(--muted)}.raw-json-wrap{position:relative;z-index:1;width:min(1920px,calc(100vw - 32px));margin:0 auto 16px;padding:16px}@media(max-width:900px){.artifact-shell{grid-template-columns:1fr}.diagnostic-summary{grid-template-columns:1fr}}`;
}
