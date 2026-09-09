import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateProductionGate, validOutput, readSemanticOutput, semanticMessages,
  pipelineFailureReport } from '../src/world-knowledge-pipeline-eval.js';

const passingRun = Object.freeze({ mode: 'hybrid', case_id: 'case',
  answer_correct: true, unsupported_premise_refs: [],
  relevant_claim_refs: ['claim:expected-a', 'claim:expected-b'],
  production_acceptance: true,
  expected_factual_premise_ref_groups: [['claim:expected-a', 'claim:expected-b']],
  forbidden_factual_premise_refs: ['claim:forbidden'],
  factual_premise_refs: ['claim:expected-b'] });

test('an interrupted pipeline cannot report earlier passing cases as complete and retains invalid plans', () => {
  const activeCase = { mode: 'hybrid', case_id: 'unseen-case' };
  const plannerOutputs = [{ role_id: 'world_knowledge_query_planner',
    output: { focus_refs: ['wk:unknown'] } }];
  const report = pipelineFailureReport({ benchmark: { benchmark_ref: 'benchmark' },
    activeCase, plannerOutputs, runs: [passingRun],
    error: Object.assign(new Error('invalid planner repair'), {
      code: 'TURN_WORLD_KNOWLEDGE_QUERY_PLAN_INVALID',
      details: { errors: ['plan focus_refs are unavailable'], repair_attempted: true }
    }) });
  assert.equal(report.completed, false);
  assert.equal(report.decision.status, 'fail');
  assert.deepEqual(report.failed_case, activeCase);
  assert.deepEqual(report.failure.planner_outputs, plannerOutputs);
  assert.deepEqual(report.failure.details.errors, ['plan focus_refs are unavailable']);
  assert.equal(report.runs.length, 1);
});

test('pipeline output retains a real answer, not only a self-selected class and refs', () => {
  const output = { answer_class: 'explain', answer_text: 'A bounded explanation.',
    factual_premise_refs: ['claim:expected-b'] };
  assert.equal(validOutput(output), true);
  for (const answer_text of ['', '  ', null, undefined]) {
    assert.equal(validOutput({ ...output, answer_text }), false);
  }
  assert.equal(validOutput({ ...output, invented_field: true }), false);
  const echoed = { ...output, question: 'An echoed input is still invalid.' };
  const rejected = readSemanticOutput(echoed);
  assert.equal(rejected.answer_class, 'invalid');
  assert.deepEqual(rejected.factual_premise_refs, []);
  assert.deepEqual(rejected.invalid_output, echoed);
  assert.deepEqual(readSemanticOutput(output), output);
});

test('pipeline evaluation uses the shared production factual closure', () => {
  const [instructions] = semanticMessages({ query_text: 'An unseen question' }, {});
  assert.match(instructions.content, /say that it is not established or unknown/u);
  assert.match(instructions.content, /do not convert that limit into nonexistence, nonuse, or an uncited possible alternative/u);
  assert.match(instructions.content, /Keep each supplied factual relationship bound to its stated subject, function, object and context/u);
  assert.match(instructions.content, /You may compose supplied causal premises into a new application/u);
  assert.match(instructions.content, /words such as may or could do not authorize adding factual possibilities that the supplied premises do not support/u);
  assert.doesNotMatch(instructions.content, /distinguish a possible explanation from an established cause/u);
  assert.match(instructions.content, /Do not expand insufficient evidence into an inventory of hypothetical missing components/u);
  assert.match(instructions.content, /do not recite or apply a conditional historical rule whose stated trigger is not established/u);
  assert.match(instructions.content, /Do not echo question/u);
  assert.match(instructions.content, /address each independently requested relationship in answer_text/u);
  assert.match(instructions.content, /Named examples at the end do not turn a what\/how\/which request into a yes\/no confirmation/u);
});

test('production pipeline gate rejects incorrect, unsupported, and incomplete hybrid evidence', () => {
  assert.deepEqual(evaluateProductionGate([passingRun]), { status: 'pass', failures: [] });
  assert.deepEqual(evaluateProductionGate([{ ...passingRun, answer_correct: false }]).failures,
    [{ case_id: 'case', reason: 'ANSWER_INCORRECT' }]);
  assert.deepEqual(evaluateProductionGate([{ ...passingRun,
    unsupported_premise_refs: ['claim:unknown'] }]).failures,
  [{ case_id: 'case', reason: 'UNSUPPORTED_PREMISE_REF' }]);
  assert.deepEqual(evaluateProductionGate([{ ...passingRun,
    expected_factual_premise_ref_groups: [['claim:also-required']] }]).failures,
  [{ case_id: 'case', reason: 'EXPECTED_EVIDENCE_MISSING' }]);
  assert.deepEqual(evaluateProductionGate([{ ...passingRun,
    factual_premise_refs: ['claim:expected-b', 'claim:forbidden'] }]).failures,
  [{ case_id: 'case', reason: 'FORBIDDEN_EVIDENCE_USED' }]);
  assert.deepEqual(evaluateProductionGate([{ ...passingRun, mode: 'without_wk',
    answer_correct: false }]), { status: 'fail', failures: [{ case_id: null,
    reason: 'HYBRID_RUNS_MISSING' }] });
  assert.deepEqual(evaluateProductionGate([{ ...passingRun,
    production_acceptance: false, expected_factual_premise_ref_groups: [],
    factual_premise_refs: ['claim:irrelevant'] }]).failures,
  [{ case_id: 'case', reason: 'RELEVANT_EVIDENCE_MISSING' }]);
});

test('reviewed relevance alternatives admit direct evidence without accepting unrelated claims', async () => {
  const benchmark = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/world-knowledge/benchmarks/pipeline-v1.json',
    import.meta.url), 'utf8'));
  const smithy = benchmark.cases.find(({ case_id }) =>
    case_id === 'craft_smithy_assumption_en');
  assert.deepEqual(smithy.relevant_claim_refs, [
    'claim:metalworking-broad-context', 'claim:occupation-smith-iron-input',
    'claim:occupation-smith-hammer', 'claim:occupation-smith-role', 'claim:occupation-smith-anvil'
  ]);
  for (const ref of smithy.relevant_claim_refs) {
    assert.equal(evaluateProductionGate([{ ...passingRun,
      relevant_claim_refs: smithy.relevant_claim_refs,
      production_acceptance: false, factual_premise_refs: [ref] }]).status, 'pass');
  }
  assert.equal(evaluateProductionGate([{ ...passingRun,
    relevant_claim_refs: smithy.relevant_claim_refs,
    production_acceptance: false, factual_premise_refs: ['claim:occupation-smith-tongs'] }]).status, 'fail');
  assert.deepEqual(evaluateProductionGate([{ ...passingRun,
    relevant_claim_refs: smithy.relevant_claim_refs,
    production_acceptance: false,
    expected_factual_premise_ref_groups: [],
    forbidden_factual_premise_refs: [],
    factual_premise_refs: ['claim:occupation-smith-iron-input'] }]),
  { status: 'pass', failures: [] });
  const leather = benchmark.cases.find(({ case_id }) =>
    case_id === 'material_leather_personal_item_ru');
  assert.deepEqual(leather.relevant_claim_refs, [
    'claim:novgorod-leather-items', 'claim:population-leather-case'
  ]);
  for (const ref of leather.relevant_claim_refs) {
    assert.equal(evaluateProductionGate([{ ...passingRun,
      relevant_claim_refs: leather.relevant_claim_refs,
      production_acceptance: false,
      factual_premise_refs: [ref] }]).status, 'pass');
  }
  assert.equal(evaluateProductionGate([{ ...passingRun,
    relevant_claim_refs: leather.relevant_claim_refs,
    production_acceptance: false,
    factual_premise_refs: ['claim:occupation-smith-anvil'] }]).status, 'fail');
  const fatigue = benchmark.cases.find(({ case_id }) => case_id === 'biology_one_meal_ru');
  const unknownHide = benchmark.cases.find(({ case_id }) => case_id === 'wet_unknown_hide_ru');
  assert.deepEqual(unknownHide.expected_factual_premise_ref_groups,
    [['claim:material-water-rawhide-wet-dry']]);
  // The rawhide premise explicitly limits transfer to tanned leather; a
  // separate water-damage claim is not necessary for this non-proof answer.
  assert.equal(evaluateProductionGate([{ ...passingRun, ...unknownHide, mode: 'hybrid',
    answer_correct: true, factual_premise_refs: ['claim:material-water-rawhide-wet-dry']
  }]).status, 'pass');
  assert.equal(evaluateProductionGate([{ ...passingRun, ...unknownHide, mode: 'hybrid',
    answer_correct: true, factual_premise_refs: ['claim:material-water-leather-water-processing']
  }]).status, 'fail');
  assert.deepEqual(fatigue.relevant_claim_refs, [
    'claim:food-energy-nutrients',
    'claim:reduced-atp-reserves-can-cause-muscle-fatigue', 'claim:work-intensity-duration'
  ]);
  for (const ref of fatigue.relevant_claim_refs) {
    assert.equal(evaluateProductionGate([{ ...passingRun,
      relevant_claim_refs: fatigue.relevant_claim_refs,
      production_acceptance: false, factual_premise_refs: [ref] }]).status, 'pass');
  }
  assert.equal(evaluateProductionGate([{ ...passingRun,
    relevant_claim_refs: fatigue.relevant_claim_refs,
    production_acceptance: false,
    factual_premise_refs: ['claim:activity-fluid-balance'] }]).status, 'fail');
});
