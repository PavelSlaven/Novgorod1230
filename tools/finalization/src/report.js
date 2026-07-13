// rus.finalization_report.v1
import { FINALIZATION_REPORT_SCHEMA } from './manifest.js';

export function buildFinalizationReport({ plan, evidence, runId, startedAt, completedAt }) {
  const failedAutomated = evidence.checks.filter((item) => !item.passed);
  const pendingManual = evidence.manual.filter((item) => !item.checked);
  const decision = failedAutomated.length
    ? 'no_go'
    : pendingManual.length
      ? 'automation_complete_manual_hold'
      : 'finalization_complete';
  return Object.freeze({
    version: 1,
    schema: FINALIZATION_REPORT_SCHEMA,
    run_id: runId,
    plan_id: plan.plan_id,
    release: plan.release,
    started_at: startedAt,
    completed_at: completedAt,
    totals: {
      automated_gate_count: evidence.checks.length,
      automated_gate_passed: evidence.checks.length - failedAutomated.length,
      automated_gate_failed: failedAutomated.length,
      manual_gate_count: evidence.manual.length,
      manual_gate_completed: evidence.manual.length - pendingManual.length,
      manual_gate_pending: pendingManual.length
    },
    automated_checks: evidence.checks,
    evidence_files: evidence.files,
    manual_gates: evidence.manual,
    recommendation: {
      decision,
      migration_runtime_ready: failedAutomated.length === 0,
      manual_delete_approved: pendingManual.length === 0,
      legacy_deletion_allowed: false,
      blocking_reasons: [
        ...failedAutomated.map((item) => `automated:${item.id}`),
        ...pendingManual.map((item) => `manual:${item.id}`)
      ]
    }
  });
}

export function renderFinalizationReportMarkdown(report) {
  const lines = [
    '# Finalization report', '',
    `- Release: \`${report.release}\``,
    `- Decision: \`${report.recommendation.decision}\``,
    `- Automated gates: ${report.totals.automated_gate_passed}/${report.totals.automated_gate_count}`,
    `- Manual gates: ${report.totals.manual_gate_completed}/${report.totals.manual_gate_count}`,
    '- Automatic legacy deletion: forbidden', '',
    '## Automated gates', ''
  ];
  for (const item of report.automated_checks) lines.push(`- [${item.passed ? 'x' : ' '}] \`${item.id}\``);
  lines.push('', '## Manual gates', '');
  for (const item of report.manual_gates) lines.push(`- [${item.checked ? 'x' : ' '}] \`${item.id}\` — ${item.required_actor}`);
  lines.push('', '## Conclusion', '');
  if (report.recommendation.decision === 'automation_complete_manual_hold') {
    lines.push('Автоматическая финализация завершена. Миграционный runtime готов, но удаление legacy остаётся заблокированным до ручного operator/owner evidence.');
  } else if (report.recommendation.decision === 'finalization_complete') {
    lines.push('Все автоматические и ручные gates подтверждены. Даже при этом удаление legacy выполняется только отдельным ручным действием владельца.');
  } else {
    lines.push('Финализация заблокирована: один или несколько автоматических gates не пройдены.');
  }
  lines.push('');
  return lines.join('\n');
}
