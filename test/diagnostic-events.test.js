import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFailureSummary,
  createDiagnosticJournal,
  parseValidationErrorLine,
  redactSecrets,
  resolveIncludeRawDetails
} from '../src/ui/diagnostic-events.js';

test('resolveIncludeRawDetails is true on error', () => {
  assert.equal(resolveIncludeRawDetails('developer_safe', 'error'), true);
  assert.equal(resolveIncludeRawDetails('developer_safe', 'success'), false);
  assert.equal(resolveIncludeRawDetails('development', 'success'), true);
});

test('redactSecrets keeps structure and hides bearer tokens', () => {
  const redacted = redactSecrets({
    Authorization: 'Bearer sk-live-secret',
    requestRaw: [{ role: 'system', content: 'Bearer abc.def.ghi' }],
    nested: { apiKey: 'secret-key', keep: 'visible' }
  });
  assert.equal(redacted.Authorization, '[REDACTED]');
  assert.equal(redacted.nested.apiKey, '[REDACTED]');
  assert.equal(redacted.nested.keep, 'visible');
  assert.match(redacted.requestRaw[0].content, /\[REDACTED\]/);
  assert.doesNotMatch(redacted.requestRaw[0].content, /abc\.def\.ghi/);
});

test('diagnostic journal assigns callId to llm lifecycle', () => {
  const journal = createDiagnosticJournal();
  const started = journal.recordLlmCallStart({
    phase: 'semantic_shape',
    label: 'HistoricalDataShaper',
    requestPreview: 'shape request',
    attempt: 1,
    maxAttempts: 3
  });
  const finished = journal.recordLlmCallSuccess({
    phase: 'semantic_shape',
    label: 'HistoricalDataShaper',
    responsePreview: '{"ok":true}',
    attempt: 1,
    maxAttempts: 3
  });
  assert.ok(started.callId);
  assert.equal(finished.callId, started.callId);
});

test('diagnostic journal records llm lifecycle and retries', () => {
  const journal = createDiagnosticJournal();
  journal.recordLlmCallStart({
    phase: 'semantic_shape',
    label: 'HistoricalDataShaper',
    requestPreview: 'shape request',
    requestRaw: [{ role: 'user', content: 'shape' }],
    attempt: 1,
    maxAttempts: 3
  });
  journal.recordLlmCallFailure({
    phase: 'semantic_shape',
    label: 'HistoricalDataShaper',
    responsePreview: '{"season":"поздняя осень"}',
    responseRaw: '{"season":"поздняя осень"}',
    error: 'validation failed',
    attempt: 1,
    maxAttempts: 3
  });
  journal.recordRetry({
    phase: 'llm_retry',
    label: 'Повтор рамки',
    message: 'retrying',
    attempt: 2,
    maxAttempts: 3,
    retry: { reason: 'season enum', delayMs: 1000 }
  });

  const snapshot = journal.snapshot({ includeDiagnostics: true, includeRawDetails: true });
  assert.equal(snapshot.length, 3);
  assert.equal(snapshot[0].kind, 'retry');
  assert.equal(snapshot[1].includeRawDetails, true);
  assert.equal(snapshot[1].requestRaw !== undefined, true);
  assert.equal(snapshot[2].kind, 'llm_call');
});

test('diagnostic journal rejects attempt without maxAttempts', () => {
  const journal = createDiagnosticJournal();
  assert.throws(() => {
    journal.recordLlmCallStart({
      phase: 'semantic_shape',
      label: 'HistoricalDataShaper',
      requestPreview: 'shape request',
      attempt: 1
    });
  }, /RETRY_POLICY_CONTRACT_ERROR/u);
});

test('parseValidationErrorLine extracts path expected actual', () => {
  const parsed = parseValidationErrorLine('root.season: expected known season, got поздняя осень');
  assert.equal(parsed.path, 'root.season');
  assert.equal(parsed.expected, 'known season');
  assert.equal(parsed.actual, 'поздняя осень');
});

test('buildFailureSummary derives season enum guidance', () => {
  const journal = createDiagnosticJournal();
  journal.recordValidationFailure({
    phase: 'semantic_shape',
    label: 'HistoricalDataShaper',
    validation: {
      ok: false,
      errors: [{ path: 'root.season', expected: 'known season', actual: 'поздняя осень' }]
    },
    attempt: 3,
    maxAttempts: 3
  });
  const summary = buildFailureSummary(journal.events, {
    status: 'error',
    error: new Error('Unable to generate historical frame: root.season: expected known season, got поздняя осень')
  });
  assert.match(summary.rootCause ?? '', /root\.season/i);
  assert.match(summary.suggestedFix ?? '', /season/i);
  assert.equal(summary.failedAttempt, 3);
});

test('buildFailureSummary surfaces recovery route metadata', () => {
  const journal = createDiagnosticJournal();
  journal.record({
    kind: 'error',
    phase: 'consistency_gate',
    label: 'NarrativeVisibleConsistencyGate',
    message: 'master_narrative conflicts with approved visible inputs',
    failed_gate: 'anti_regression',
    first_failed_gate: 'pre_dependency_gate',
    first_invalid_artifact: 'player_seed_contract',
    first_regression_stage: 'visible_context',
    recovery_class: 'upstream_repair',
    repair_target_stage: 'master_narrative',
    rerun_from_stage: 'master_narrative',
    forbidden_local_fix: 'do not add visible_npc or source_ref inside visible_context_package',
    repair_attempt_index: 1,
    model_tier: 'senior_pro_thinking_max',
    terminal_status: 'needs_manual_review'
  });
  const summary = buildFailureSummary(journal.events, { status: 'error' });
  assert.equal(summary.recoveryClass, 'upstream_repair');
  assert.equal(summary.failedGate, 'anti_regression');
  assert.equal(summary.firstFailedGate, 'pre_dependency_gate');
  assert.equal(summary.firstInvalidArtifact, 'player_seed_contract');
  assert.equal(summary.firstRegressionStage, 'visible_context');
  assert.equal(summary.repairTargetStage, 'master_narrative');
  assert.equal(summary.rerunFromStage, 'master_narrative');
  assert.equal(summary.modelTier, 'senior_pro_thinking_max');
  assert.equal(summary.terminalStatus, 'needs_manual_review');
});

test('buildFailureSummary preserves first bad transition instead of only terminal symptom', () => {
  const journal = createDiagnosticJournal();
  journal.record({
    kind: 'validation',
    phase: 'player_seed',
    label: 'ValidatedPlayerSeed',
    message: 'current_position is null',
    failed_gate: 'dependency_consistency',
    first_failed_gate: 'dependency_consistency',
    first_invalid_artifact: 'validated_player_seed:player_seed_contract',
    first_regression_stage: null
  });
  journal.record({
    kind: 'error',
    phase: 'actor_profiles',
    label: 'NpcPlacement',
    message: 'visible actor requires placement',
    failed_gate: 'post_dependency_gate',
    first_failed_gate: 'dependency_consistency',
    first_invalid_artifact: 'validated_player_seed:player_seed_contract',
    first_regression_stage: 'validated_player_seed'
  });

  const summary = buildFailureSummary(journal.events, { status: 'error' });

  assert.equal(summary.failedGate, 'post_dependency_gate');
  assert.equal(summary.firstFailedGate, 'dependency_consistency');
  assert.equal(summary.firstInvalidArtifact, 'validated_player_seed:player_seed_contract');
  assert.equal(summary.firstRegressionStage, 'validated_player_seed');
});

test('buildFailureSummary preserves pipeline runtime markers', () => {
  const journal = createDiagnosticJournal();
  journal.record({
    kind: 'error',
    phase: 'new_game_pipeline',
    label: 'Commit firewall',
    message: 'bundle blocked',
    pipeline_runtime: 'new_lifecycle',
    legacy_provider_runtime_used: false
  });

  const summary = buildFailureSummary(journal.events, { status: 'error' });

  assert.equal(summary.pipelineRuntime, 'new_lifecycle');
  assert.equal(summary.legacyProviderRuntimeUsed, false);
});
