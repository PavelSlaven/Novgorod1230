import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { collectFinalizationEvidence } from './evidence.js';
import { loadFinalizationPlan } from './manifest.js';
import { buildFinalizationReport, renderFinalizationReportMarkdown } from './report.js';

export async function runFinalization(rootDir = '.', options = {}) {
  const root = resolve(rootDir);
  const plan = await loadFinalizationPlan(root);
  const startedAt = options.startedAt ?? new Date().toISOString();
  const evidence = await collectFinalizationEvidence(root, plan);
  const completedAt = options.completedAt ?? new Date().toISOString();
  const report = buildFinalizationReport({ plan, evidence, runId: options.runId ?? `finalization-${Date.now()}`, startedAt, completedAt });
  if (options.outDir) {
    const outDir = resolve(root, options.outDir);
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'finalization-report.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(join(outDir, 'finalization-report.md'), renderFinalizationReportMarkdown(report));
  }
  return report;
}
