import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseManualChecklist } from './checklist.js';

export async function collectFinalizationEvidence(rootDir, plan) {
  const root = resolve(rootDir);
  const files = [];
  for (const item of plan.automated_evidence) {
    const path = join(root, item.path);
    try {
      const content = await readFile(path);
      const info = await stat(path);
      files.push({ id: item.id, path: item.path, required: true, exists: true, bytes: info.size, sha256: sha256(content) });
    } catch {
      files.push({ id: item.id, path: item.path, required: true, exists: false, bytes: 0, sha256: null });
    }
  }

  const cutover = await readJson(root, plan.inputs.cutover_report);
  const shadow = await readJson(root, plan.inputs.shadow_report);
  const testSummary = await readJson(root, plan.inputs.test_summary);
  const migrationStatus = await readJson(root, plan.inputs.migration_status);
  const checklistText = await readFile(join(root, plan.inputs.manual_checklist), 'utf8').catch(() => '');
  const manual = parseManualChecklist(checklistText, plan.manual_gates);

  const checks = [
    check('cutover_complete', cutover?.schema === 'rus.cutover_report.v1' && cutover?.recommendation?.decision === 'cutover_complete'),
    check('cutover_all_gates_passed', cutover?.totals?.failed_gate_count === 0 && cutover?.totals?.passed_step_count === 13),
    check('modular_default', cutover?.recommendation?.default_route === 'modular'),
    check('explicit_legacy_rollback', cutover?.recommendation?.rollback_route === 'legacy'),
    check('legacy_imports_zero', cutover?.runtime_import_proof?.legacy_import_count === 0),
    check('legacy_auto_delete_forbidden', cutover?.recommendation?.legacy_deletion_allowed === false && plan.safety.automatic_legacy_deletion === false),
    check('shadow_complete', shadow?.schema === 'rus.shadow_run_report.v1' && shadow?.recommendation?.decision === 'go_to_staged_cutover'),
    check('shadow_no_differences', shadow?.totals?.blocking_difference_count === 0 && shadow?.totals?.failed_case_count === 0),
    check('release_tests_passed', testSummary?.schema === 'rus.test_summary.v1' && testSummary?.failed === 0 && testSummary?.passed === testSummary?.total),
    check('source_phase_complete', migrationStatus?.schema === 'rus.migration_status.v1' && migrationStatus?.status === 'completed' && migrationStatus?.next_phase === 'finalization'),
    check('all_evidence_files_present', files.every((item) => item.exists))
  ];

  return Object.freeze({ files, checks, manual });
}

function check(id, passed) { return Object.freeze({ id, passed: Boolean(passed) }); }
async function readJson(root, rel) { try { return JSON.parse(await readFile(join(root, rel), 'utf8')); } catch { return null; } }
function sha256(content) { return createHash('sha256').update(content).digest('hex'); }
