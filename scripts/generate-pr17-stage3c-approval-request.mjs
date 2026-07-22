import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildPr17Stage3CApprovalRequest } from '../tools/world-catalog-workflow/src/index.js';

const root = resolve(import.meta.dirname, '..');
const candidateRoot = resolve(root, 'data/knowledge-source/imports/item-container-120-v5/candidate');
const outputPath = resolve(root, 'docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_REQUEST.json');
const check = process.argv.includes('--check');
const manifest = await readJson(resolve(candidateRoot, 'manifest.json'));
const records = Object.fromEntries(await Promise.all(manifest.datasets.map(async (dataset) => [dataset.table, await readJson(resolve(candidateRoot, dataset.path))])));
const result = buildPr17Stage3CApprovalRequest({
  candidate_manifest: manifest,
  records_by_table: records,
  editorial_readiness_report: await readJson(resolve(candidateRoot, 'reports/EDITORIAL_READINESS_REPORT.json')),
  g4_coverage_report: await readJson(resolve(candidateRoot, 'reports/G4_COVERAGE_REPORT.json')),
  compilation_report: await readJson(resolve(candidateRoot, 'reports/COMPILATION_REPORT.json')),
  template_ids: [...records.item_templates, ...records.container_templates].map((record) => record.id),
  target_revision: {
    id: 'world_revision_novgorod_1230_item_container_approved_001',
    title: 'Novgorod 1230 approved item/container catalogue',
    effective_from: '1230-01-01',
    effective_to: '1250-12-31'
  }
});
if (result.status !== 'ready_for_human_confirmation') throw new Error(`PR17_STAGE3C_APPROVAL_REQUEST_BLOCKED:${result.errors.map((error) => error.code).join(',')}`);
const content = `${JSON.stringify(result.request, null, 2)}\n`;
if (check) {
  const actual = await readFile(outputPath, 'utf8').catch(() => null);
  if (actual !== content) throw new Error('PR17_STAGE3C_APPROVAL_REQUEST_STALE');
} else {
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  await writeFile(outputPath, content, 'utf8');
}
process.stdout.write(`${JSON.stringify({ pass: true, mode: check ? 'check' : 'write', request_digest: result.request.request_digest, candidate_digest: manifest.candidate_digest, activation: result.request.activation }, null, 2)}\n`);

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
