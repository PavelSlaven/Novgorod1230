import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { assertTestPath } from './manifest.js';
import { parseTapSummary } from './tap.js';
import { buildShadowReport, renderShadowReportMarkdown } from './report.js';

export async function runShadowCorpus({ root = process.cwd(), manifest, outputJson = null, outputMarkdown = null, runId = null, env = {} } = {}) {
  if (!manifest) throw typed('SHADOW_MANIFEST_INVALID', 'manifest is required');
  const startedAt = new Date().toISOString();
  const results = [];
  for (const item of manifest.cases) {
    const testPath = assertTestPath(root, item.test_file);
    const execution = await runNodeTest(root, testPath, env);
    const tap = parseTapSummary(`${execution.stdout}\n${execution.stderr}`);
    results.push(Object.freeze({
      id: item.id,
      kind: item.kind,
      severity: item.severity ?? 'blocking',
      test_file: item.test_file,
      categories: Object.freeze([...item.categories]),
      status: execution.exitCode === 0 && tap.fail === 0 ? 'passed' : 'failed',
      exit_code: execution.exitCode,
      duration_ms: tap.duration_ms ?? execution.durationMs,
      tests: tap.tests,
      pass: tap.pass,
      fail: tap.fail,
      skipped: tap.skipped,
      failed_tests: Object.freeze(tap.failed_tests),
      stderr_tail: execution.exitCode === 0 ? '' : execution.stderr.slice(-4000)
    }));
  }
  const report = buildShadowReport({ manifest, caseResults: results, startedAt, completedAt: new Date().toISOString(), runId });
  if (outputJson) await write(outputJson, `${JSON.stringify(report, null, 2)}\n`);
  if (outputMarkdown) await write(outputMarkdown, renderShadowReportMarkdown(report));
  return report;
}

async function runNodeTest(root, testPath, extraEnv) {
  const started = Date.now();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', testPath], {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'test', ...extraEnv },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => reject(typed('SHADOW_CASE_EXECUTION_FAILED', error.message, { cause: error })));
    child.on('close', (code) => resolvePromise({ exitCode: code ?? 1, stdout, stderr, durationMs: Date.now() - started }));
  });
}

async function write(path, content) { const absolute = resolve(path); await mkdir(dirname(absolute), { recursive: true }); await writeFile(absolute, content, 'utf8'); }
function typed(code, message, details = {}) { const error = new Error(message); error.code = code; error.details = details; return error; }
