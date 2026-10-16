import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const cases = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8'));
const expected = [
  ['open-space-known','gap_required_no_applicable_s1'],
  ['interior-known','deny_unbacked_structure'],
  ['passage-exact-position','canonical_position_reference_only'],
  ['property-order-variant','same_gap_no_semantic_expansion'],
  ['structure-rephrase','gap_required_no_applicable_s1'],
  ['unspecified-structure','no_s1_topology_claim'],
  ['missing-g6-position','deny_structural_entry'],
  ['missing-visibility','deny_structural_entry'],
  ['one-way-movement','deny_structural_entry'],
  ['invented-material-ref','reject_unresolved_ref'],
  ['foreign-fishing-camp','reject_foreign_scope'],
  ['hidden-slot-id','withhold_internal_ref'],
];
if (cases.model_calls !== false || cases.execution_status !== 'not_run' || cases.cases.length !== expected.length) throw new Error('case inventory must remain not_run and contain 12 cases');
for (let i = 0; i < expected.length; i += 1) {
  const c = cases.cases[i];
  if (c.id !== expected[i][0] || c.expected_gate !== expected[i][1] || c.execution_status !== 'not_run') throw new Error(`frozen case inventory mismatch at ${i}`);
}
const result = {
  schema: 'fleet.b4_s1_data.bench_inventory.v1',
  execution_status: 'not_run',
  model_calls: 0,
  gate_executions: 0,
  prose_evaluation: false,
  case_count: cases.cases.length,
  cases: cases.cases.map(({id, expected_gate, execution_status}) => ({id, expected_gate, execution_status})),
  interpretation: 'This records a frozen future evaluation inventory only. No actual gate outcome, threshold result, or model behavior was measured.'
};
fs.writeFileSync(path.join(here, 'dry-run-result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`PASS inventory shape: ${result.case_count} frozen cases; execution_status=not_run, actual outcomes=none, model calls=0`);
