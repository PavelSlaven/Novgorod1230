import { REQUIRED_SHADOW_CATEGORIES } from './manifest.js';

export function buildShadowReport({ manifest, caseResults, startedAt, completedAt, runId = null }) {
  const categories = REQUIRED_SHADOW_CATEGORIES.map((category) => {
    const cases = caseResults.filter((item) => item.categories.includes(category));
    const failed = cases.filter((item) => item.status !== 'passed');
    return Object.freeze({ category, case_count: cases.length, passed_case_count: cases.length - failed.length, failed_case_count: failed.length, status: failed.length ? 'failed' : 'passed' });
  });
  const failedCases = caseResults.filter((item) => item.status !== 'passed');
  const blocking = failedCases.filter((item) => item.severity === 'blocking');
  const totals = {
    case_count: caseResults.length,
    passed_case_count: caseResults.length - failedCases.length,
    failed_case_count: failedCases.length,
    test_count: sum(caseResults, 'tests'),
    passed_test_count: sum(caseResults, 'pass'),
    failed_test_count: sum(caseResults, 'fail'),
    blocking_difference_count: blocking.length,
    non_blocking_difference_count: failedCases.length - blocking.length
  };
  const allCovered = categories.every((item) => item.case_count > 0);
  const rollbackPassed = caseResults.some((item) => item.kind === 'rollback' && item.status === 'passed');
  const decision = blocking.length === 0 && allCovered && rollbackPassed ? 'go_to_staged_cutover' : 'no_go';
  return Object.freeze({
    version: 1,
    schema: 'rus.shadow_run_report.v1',
    run_id: runId ?? `shadow:${manifest.corpus_id}`,
    corpus_id: manifest.corpus_id,
    corpus_version: manifest.version,
    source_provenance: structuredClone(manifest.source_provenance ?? {}),
    comparison_policy: structuredClone(manifest.comparison_policy),
    started_at: startedAt,
    completed_at: completedAt,
    totals: Object.freeze(totals),
    categories: Object.freeze(categories),
    cases: Object.freeze(caseResults),
    recommendation: Object.freeze({
      decision,
      blocking_reasons: blocking.map((item) => `${item.id}: ${item.failed_tests.join(', ') || item.exit_code}`),
      conditions: decision === 'go_to_staged_cutover'
        ? ['Preserve rollback flags during staged cutover.', 'Do not delete legacy before finalization.', 'Repeat the same corpus after each cutover step.']
        : ['Resolve all blocking differences and rerun the complete corpus.']
    })
  });
}

export function renderShadowReportMarkdown(report) {
  const lines = [
    '# Shadow run report', '',
    `- Run: \`${report.run_id}\``,
    `- Corpus: \`${report.corpus_id}\``,
    `- Cases: ${report.totals.passed_case_count}/${report.totals.case_count} passed`,
    `- Tests: ${report.totals.passed_test_count}/${report.totals.test_count} passed`,
    `- Blocking differences: ${report.totals.blocking_difference_count}`,
    `- Recommendation: **${report.recommendation.decision}**`, '',
    '## Category coverage', '',
    '| Category | Cases | Status |', '|---|---:|---|',
    ...report.categories.map((item) => `| ${item.category} | ${item.case_count} | ${item.status} |`), '',
    '## Cases', '',
    '| Case | Kind | Tests | Result | Categories |', '|---|---|---:|---|---|',
    ...report.cases.map((item) => `| ${item.id} | ${item.kind} | ${item.pass}/${item.tests} | ${item.status} | ${item.categories.join(', ')} |`), '',
    '## Comparison policy', '',
    '- Artistic prose is not compared byte-for-byte.',
    '- Approved structural properties, semantic audit decisions and hidden/visible invariants are compared.',
    '- Every failed parity, isolation or rollback case is blocking.', '',
    '## Cutover conditions', '',
    ...report.recommendation.conditions.map((item) => `- ${item}`), ''
  ];
  if (report.recommendation.blocking_reasons.length) lines.push('## Blocking reasons', '', ...report.recommendation.blocking_reasons.map((item) => `- ${item}`), '');
  return `${lines.join('\n')}\n`;
}

function sum(items, key) { return items.reduce((total, item) => total + Number(item[key] ?? 0), 0); }
