import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveNewGameProcessArtifact } from '../src/ui/process-artifacts.js';

const richJournalEntry = {
  at: '2026-06-21T10:00:02.000Z',
  kind: 'llm_response',
  phase: 'semantic_shape',
  label: 'HistoricalDataShaper',
  message: 'shape complete',
  provider: 'deepseek',
  model: 'test-model',
  temperature: 0.2,
  maxTokens: 1000,
  durationMs: 123,
  scope: 'legacy_world',
  roleId: 'legacy.historical_frame.shaper',
  tierId: null,
  configHash: 'cfg-123',
  outputContractMode: 'json_object_with_schema',
  requestPreview: 'system: краткий запрос',
  requestRaw: [{ role: 'system', content: 'полный запрос' }],
  responsePreview: 'короткий ответ',
  responseRaw: '{"ok":true}',
  requestSections: [{ title: 'Schema', lines: ['historical_frame'] }],
  responseSections: [{ title: 'World', lines: ['year=1241'] }]
};

test('new game process artifact is written as standalone html on success', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-artifact-'));
  try {
    const artifact = await saveNewGameProcessArtifact({
      artifactDir: dir,
      status: 'success',
      startedAt: new Date('2026-06-21T10:00:00.000Z'),
      completedAt: new Date('2026-06-21T10:00:02.123Z'),
      request: { source: 'test', text: 'двор у переправы', playerName: 'Marek' },
      savePath: join(dir, 'save.json'),
      process: {
        phase: 'idle',
        label: 'Ожидание',
        message: 'Новая игра готова.',
        progress: 100,
        items: [{ label: 'Сохранение', meta: 'Готово', state: 'done' }],
        journal: [richJournalEntry]
      },
      state: { provider: { provider: 'deepseek', model: 'test-model' } },
      world: {
        worldId: 'test-world',
        worldKey: 'slot-test',
        scenarioId: 'scenario:test',
        current_position: { location_id: 'yard' },
        secret: 'classified'
      },
      openingText: 'Стартовая сцена.'
    });

    assert.match(artifact.filename, /^2026-06-21_\d{2}-\d{2}-\d{2}-123-success\.html$/);
    const html = await readFile(artifact.filePath, 'utf8');
    assert.match(html, /Создание мира завершено/);
    assert.match(html, /Новая игра готова\./);
    assert.match(html, /application\/json/);
    assert.match(html, /test-world/);
    assert.match(html, /deepseek \/ test-model/);
    assert.match(html, /legacy_world/);
    assert.match(html, /legacy\.historical_frame\.shaper/);
    assert.match(html, /cfg-123/);
    assert.match(html, /Schema/);
    assert.match(html, /Технические детали/);
    assert.match(html, /Полный JSON-снимок/);
    assert.doesNotMatch(html, /current_position/);
    assert.doesNotMatch(html, /classified/);
    assert.doesNotMatch(html, /Запрос · raw/);
    assert.doesNotMatch(html, /полный запрос/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('error artifact exposes raw llm payloads and full json snapshot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-artifact-'));
  try {
    const artifact = await saveNewGameProcessArtifact({
      artifactDir: dir,
      status: 'error',
      startedAt: new Date('2026-06-21T10:00:00.000Z'),
      completedAt: new Date('2026-06-21T10:00:01.001Z'),
      request: { source: 'test', text: '<script>alert(1)</script>', playerName: '' },
      process: {
        busy: true,
        phase: 'semantic_shape',
        label: 'HistoricalDataShaper',
        message: 'root.season: expected known season, got поздняя осень',
        progress: 80,
        items: [{ label: 'Историческая рамка', meta: 'Ошибка', state: 'failed' }],
        journal: [{
          at: '2026-06-21T10:00:01.000Z',
          kind: 'error',
          phase: 'semantic_shape',
          label: 'HistoricalDataShaper',
          message: 'root.season: expected known season, got поздняя осень',
          provider: 'deepseek',
          model: 'test-model',
          attempt: 3,
          maxAttempts: 3,
          requestPreview: 'preview',
          requestRaw: [{ role: 'system', content: 'Authorization: Bearer sk-secret' }],
          responsePreview: '{"season":"поздняя осень"}',
          responseRaw: '{"season":"поздняя осень"}',
          requestSections: [{ title: 'Dossier', lines: ['year=1241'] }],
          responseSections: [{ title: 'Historical frame validation', lines: ['root.season: expected known season, got поздняя осень'] }],
          validation: {
            ok: false,
            errors: [{ path: 'root.season', expected: 'known season', actual: 'поздняя осень' }]
          },
          includeRawDetails: true
        }, {
          at: '2026-06-21T10:00:00.900Z',
          kind: 'retry',
          phase: 'llm_retry',
          label: 'Повтор рамки',
          message: 'retry 2',
          attempt: 2,
          maxAttempts: 3
        }, {
          at: '2026-06-21T10:00:00.800Z',
          kind: 'error',
          phase: 'consistency_gate',
          label: 'NarrativeVisibleConsistencyGate',
          message: 'master_narrative conflicts with approved visible inputs',
          recovery_class: 'upstream_repair',
          repair_target_stage: 'master_narrative',
          rerun_from_stage: 'master_narrative',
          forbidden_local_fix: 'do not add visible_npc or source_ref inside visible_context_package',
          repair_attempt_index: 1,
          model_tier: 'senior_pro_thinking_max',
          terminal_status: 'needs_manual_review'
        }]
      },
      state: { provider: { provider: 'deepseek', model: 'test-model' } },
      world: { worldId: 'test-world', worldKey: 'slot-test', scenarioId: 'scenario:test' },
      error: new Error('Unable to generate historical frame: root.season: expected known season, got поздняя осень.')
    });

    const html = await readFile(artifact.filePath, 'utf8');
    assert.match(html, /Создание мира прервано ошибкой/);
    assert.match(html, /root\.season/);
    assert.match(html, /Запрос · raw/);
    assert.match(html, /Ответ · raw/);
    assert.match(html, /поздняя осень/);
    assert.match(html, /Recovery class/);
    assert.match(html, /upstream_repair/);
    assert.match(html, /master_narrative/);
    assert.match(html, /Copy full JSON/);
    assert.match(html, /Copy LLM trace/);
    assert.doesNotMatch(html, /sk-secret/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    const payloadMatch = html.match(/<script id="artifactPayload" type="application\/json">([\s\S]*?)<\/script>/);
    assert.ok(payloadMatch);
    const payload = JSON.parse(payloadMatch[1]);
    assert.equal(payload.status, 'error');
    assert.equal(payload.process.busy, false);
    assert.equal(payload.process.phase, 'error');
    assert.equal(payload.process.label, 'Ошибка');
    assert.ok(Array.isArray(payload.process.journal));
    assert.ok(payload.process.journal.some((entry) => entry.requestRaw));
    assert.ok(payload.diagnostics?.rootCause);
    assert.match(JSON.stringify(payload), /\[REDACTED\]/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('new game process artifacts can include raw details only in dev mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-artifact-'));
  const previousArtifactMode = process.env.NEW_GAME_ARTIFACT_MODE;
  process.env.NEW_GAME_ARTIFACT_MODE = 'development';
  try {
    await saveNewGameProcessArtifact({
      artifactDir: dir,
      status: 'success',
      completedAt: new Date('2026-06-21T10:00:00.000Z'),
      request: { source: 'test', text: 'двор у переправы', playerName: 'Marek' },
      process: {
        phase: 'done',
        label: 'Ожидание',
        message: 'Новая игра готова.',
        progress: 100,
        items: [],
        journal: [{ ...richJournalEntry, includeRawDetails: true }]
      },
      state: { provider: { provider: 'deepseek', model: 'test-model' } },
      world: { worldId: 'test-world', worldKey: 'slot-test', scenarioId: 'scenario:test' }
    });

    const html = await readFile(join(dir, (await readdir(dir)).find((name) => name.endsWith('.html'))), 'utf8');
    assert.match(html, /Запрос · raw/);
    assert.match(html, /Ответ · raw/);
    assert.match(html, /полный запрос/);
  } finally {
    if (previousArtifactMode === undefined) delete process.env.NEW_GAME_ARTIFACT_MODE;
    else process.env.NEW_GAME_ARTIFACT_MODE = previousArtifactMode;
    await rm(dir, { recursive: true, force: true });
  }
});

test('new game process artifacts stay safe even when debug ui is enabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-artifact-'));
  const previousDebugUi = process.env.DEBUG_UI;
  const previousArtifactMode = process.env.NEW_GAME_ARTIFACT_MODE;
  delete process.env.NEW_GAME_ARTIFACT_MODE;
  process.env.DEBUG_UI = '1';
  try {
    await saveNewGameProcessArtifact({
      artifactDir: dir,
      status: 'success',
      completedAt: new Date('2026-06-21T10:00:00.000Z'),
      request: { source: 'test', text: 'двор у переправы', playerName: 'Marek' },
      process: {
        phase: 'done',
        label: 'Ожидание',
        message: 'Новая игра готова.',
        progress: 100,
        items: [],
        journal: [richJournalEntry]
      },
      state: { provider: { provider: 'deepseek', model: 'test-model' } },
      world: { worldId: 'test-world', worldKey: 'slot-test', scenarioId: 'scenario:test' }
    });

    const html = await readFile(join(dir, (await readdir(dir)).find((name) => name.endsWith('.html'))), 'utf8');
    assert.doesNotMatch(html, /Запрос · raw/);
    assert.doesNotMatch(html, /полный запрос/);
    assert.match(html, /Schema/);
  } finally {
    if (previousDebugUi === undefined) delete process.env.DEBUG_UI;
    else process.env.DEBUG_UI = previousDebugUi;
    if (previousArtifactMode === undefined) delete process.env.NEW_GAME_ARTIFACT_MODE;
    else process.env.NEW_GAME_ARTIFACT_MODE = previousArtifactMode;
    await rm(dir, { recursive: true, force: true });
  }
});

test('new game process artifacts stay sanitized in production mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-artifact-'));
  const previousNodeEnv = process.env.NODE_ENV;
  const previousArtifactMode = process.env.NEW_GAME_ARTIFACT_MODE;
  delete process.env.NEW_GAME_ARTIFACT_MODE;
  process.env.NODE_ENV = 'production';
  try {
    const artifact = await saveNewGameProcessArtifact({
      artifactDir: dir,
      status: 'success',
      completedAt: new Date('2026-06-21T10:00:00.000Z'),
      request: { source: 'test', text: 'двор у переправы', playerName: 'Marek' },
      process: { phase: 'done', label: 'Ожидание', message: 'ok', progress: 100, items: [], journal: [richJournalEntry] },
      state: { provider: { provider: 'deepseek', model: 'test-model' } },
      world: { worldId: 'test-world', worldKey: 'slot-test', scenarioId: 'scenario:test' }
    });

    assert.equal(artifact.skipped, true);
    assert.equal(artifact.artifactMode, 'production');
    assert.equal(artifact.filePath, undefined);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousArtifactMode === undefined) delete process.env.NEW_GAME_ARTIFACT_MODE;
    else process.env.NEW_GAME_ARTIFACT_MODE = previousArtifactMode;
    await rm(dir, { recursive: true, force: true });
  }
});

test('new game process artifacts are rotated to the configured limit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiii-artifact-'));
  try {
    const first = await saveNewGameProcessArtifact({
      artifactDir: dir,
      maxArtifacts: 2,
      status: 'success',
      completedAt: new Date('2026-06-21T10:00:00.000Z')
    });
    const second = await saveNewGameProcessArtifact({
      artifactDir: dir,
      maxArtifacts: 2,
      status: 'success',
      completedAt: new Date('2026-06-21T10:00:01.000Z')
    });
    const third = await saveNewGameProcessArtifact({
      artifactDir: dir,
      maxArtifacts: 2,
      status: 'error',
      completedAt: new Date('2026-06-21T10:00:02.000Z')
    });

    const files = (await readdir(dir)).filter((name) => name.endsWith('.html')).sort();
    assert.equal(files.length, 2);
    assert.ok(files.includes(second.filename));
    assert.ok(files.includes(third.filename));
    assert.equal(files.includes(first.filename), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
