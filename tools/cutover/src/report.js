export function buildCutoverReport({ plan, steps, importProof, startedAt, completedAt, runId }) {
  const failed = steps.flatMap((step) => step.gates.filter((gate) => gate.status !== 'passed').map((gate) => ({ step_id: step.id, step: step.name, gate: gate.gate, details: gate.details ?? null })));
  if (!importProof.pass) failed.push({ step_id: 13, step: 'tools-release-pipeline', gate: 'runtime_import_proof', details: importProof.legacy_imports });
  const decision = failed.length === 0 && steps.length === 13 ? 'cutover_complete' : 'no_go';
  return Object.freeze({
    version: 1,
    schema: 'rus.cutover_report.v1',
    run_id: runId,
    plan_id: plan.plan_id,
    source_release: plan.source_release,
    started_at: startedAt,
    completed_at: completedAt,
    totals: Object.freeze({ step_count: 13, passed_step_count: steps.filter((step) => step.status === 'passed').length, failed_step_count: steps.filter((step) => step.status !== 'passed').length, gate_count: steps.reduce((sum, step) => sum + step.gates.length, 0), failed_gate_count: failed.length }),
    runtime_import_proof: importProof,
    steps: Object.freeze(steps),
    recommendation: Object.freeze({
      decision,
      default_route: decision === 'cutover_complete' ? 'modular' : 'legacy',
      rollback_route: 'legacy',
      blocking_reasons: Object.freeze(failed),
      legacy_deletion_allowed: false,
      next_phase: decision === 'cutover_complete' ? 'finalization' : 'repeat_cutover_after_repairs'
    })
  });
}

export function renderCutoverReportMarkdown(report) {
  const lines = [
    '# Staged cutover report', '',
    `- Run: \`${report.run_id}\``,
    `- Plan: \`${report.plan_id}\``,
    `- Steps: ${report.totals.passed_step_count}/${report.totals.step_count} passed`,
    `- Gates: ${report.totals.gate_count - report.totals.failed_gate_count}/${report.totals.gate_count} passed`,
    `- Modular runtime legacy imports: ${report.runtime_import_proof.legacy_import_count}`,
    `- Decision: **${report.recommendation.decision}**`,
    `- Default route: **${report.recommendation.default_route}**`,
    `- Rollback route: **${report.recommendation.rollback_route}**`, '',
    '## Steps', '', '| # | Step | Gates | Status | Route after step |', '|---:|---|---:|---|---|',
    ...report.steps.map((step) => `| ${step.id} | ${step.name} | ${step.gates.filter((gate) => gate.status === 'passed').length}/${step.gates.length} | ${step.status} | ${step.profile.RUS_RUNTIME_ROUTE} |`), '',
    '## Runtime import proof', '',
    `Static traversal covered ${report.runtime_import_proof.file_count} files and ${report.runtime_import_proof.edge_count} import edges.`,
    report.runtime_import_proof.pass ? 'No modular runtime import resolves into `legacy/`.' : 'Legacy imports were found and cutover is blocked.', '',
    '## Rollback policy', '',
    '- Legacy remains available only through explicit `RUS_RUNTIME_ROUTE=legacy`.',
    '- Legacy source is not deleted by this phase.',
    '- Party state storage is route-independent and covered by rollback tests.',
    '- Manual deletion is deferred to finalization.', ''
  ];
  if (report.recommendation.blocking_reasons.length) lines.push('## Blocking reasons', '', ...report.recommendation.blocking_reasons.map((item) => `- Step ${item.step_id} ${item.gate}`), '');
  return `${lines.join('\n')}\n`;
}
