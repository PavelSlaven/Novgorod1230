import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadShadowManifest } from '@rus/shadow-run';
import { buildCutoverProfile } from './manifest.js';
import { inspectRuntimeImportGraph } from './import-graph.js';
import { runCommand } from './executor.js';
import { buildCutoverReport, renderCutoverReportMarkdown } from './report.js';

export async function runStagedCutover({ root = process.cwd(), plan, outputDir = 'artifacts/cutover', runId = 'cutover', baseEnv = {}, stopOnFailure = true, resume = true } = {}) {
  const startedAt = new Date().toISOString();
  const effectiveBaseEnv = { RUS_RUNTIME_BINDINGS_MODULE: resolve(root, 'test/fixtures/runtime-bindings/production-bindings.js'), ...baseEnv };
  const shadowManifest = await loadShadowManifest(root, 'data/shadow-corpus/manifest.json');
  const absoluteOutput = resolve(root, outputDir);
  const steps = [];
  for (const step of plan.steps) {
    const stepFile = resolve(absoluteOutput, `step-${String(step.id).padStart(2, '0')}.json`);
    const previous = resume ? await readJson(stepFile) : null;
    if (previous?.status === 'passed') {
      steps.push(Object.freeze(previous));
      continue;
    }
    const profile = buildCutoverProfile(plan, step.id, effectiveBaseEnv);
    const gates = [];
    gates.push(asGate('smoke', await nodeTest(root, ['test/cutover/staged-route-smoke.test.js'], profile)));
    gates.push(await runFullShadowGate(root, shadowManifest, profile));
    gates.push(asGate('db_dry_run', await nodeTest(root, ['test/integration/production-infrastructure.test.js'], { ...profile, RUS_CUTOVER_DB_DRY_RUN: 'true' })));
    gates.push(asGate('diagnostics', await nodeTest(root, ['apps/game-server/test/game-server.test.js'], profile)));
    gates.push(asGate('rollback', await nodeTest(root, ['test/cutover/party-state-rollback.test.js'], profile)));
    const status = gates.every((gate) => gate.status === 'passed') ? 'passed' : 'failed';
    const record = Object.freeze({ id: step.id, name: step.name, profile, status, gates: Object.freeze(gates) });
    steps.push(record);
    await write(stepFile, `${JSON.stringify(record, null, 2)}\n`);
    if (status !== 'passed' && stopOnFailure) break;
  }
  const importProof = await inspectRuntimeImportGraph({ root });
  const report = buildCutoverReport({ plan, steps, importProof, startedAt, completedAt: new Date().toISOString(), runId });
  await write(resolve(absoluteOutput, 'cutover-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await write(resolve(absoluteOutput, 'cutover-report.md'), renderCutoverReportMarkdown(report));
  return report;
}

async function runFullShadowGate(root, manifest, env) {
  const files = [...new Set(manifest.cases.map((item) => item.test_file))];
  const result = await nodeTest(root, files, env);
  return {
    gate: 'shadow',
    status: result.status,
    details: {
      case_count: manifest.cases.length,
      test_file_count: files.length,
      category_count: manifest.comparison_policy.required_categories.length,
      exit_code: result.exit_code,
      duration_ms: result.duration_ms,
      stderr_tail: result.stderr_tail ?? ''
    }
  };
}

async function nodeTest(root, files, env) { return runCommand({ root, command: process.execPath, args: ['--test', '--test-concurrency=1', ...files], env, label: files.join(',') }); }
function asGate(gate, result) { return { gate, status: result.status, details: { exit_code: result.exit_code, duration_ms: result.duration_ms, stderr_tail: result.stderr_tail ?? '' } }; }
async function write(path, content) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, content, 'utf8'); }
async function readJson(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } }
