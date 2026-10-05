import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorldProcessStepPlan } from '@rus/turn';
import { assembleWorldProcessStepPlan,
  createLowerDvinaTraceWorldProcessStepModel } from
  '../src/runtime/lower-dvina-trace-world-process-llm.js';
import { worldProcessRequest } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

async function captureProjection(input) {
  let user;
  const model = createLowerDvinaTraceWorldProcessStepModel({
    roleRunner: { async run(call) {
      user = call.messages.at(-1).content;
      const projection = JSON.parse(user);
      return { output: { interpretation: {
        grounded_transition: 'Проверка проекции.' },
      outcome_choice: 'outcome_1',
      affected_ref_choices: projection.affected_ref_choices.map(({ choice_id }) => choice_id) } };
    } }
  });
  await model(input);
  return JSON.parse(user);
}

test('world process model assembles exact envelope from qualitative choice', async () => {
  let prompt, user;
  const input = worldProcessRequest();
  input.subject_state.facts.push('Огонь продолжает гореть.');
  input.subject_state.qualitative_facts = ['Холодная вода.'];
  input.environment_state.facts = ['Ветер дует вдоль берега.'];
  const model = createLowerDvinaTraceWorldProcessStepModel({
    roleRunner: { async run(call) {
      prompt = call.messages[0].content;
      user = call.messages[1].content;
      return { output: { interpretation: {
        grounded_transition: 'Вода ослабляет огонь.' },
      outcome_choice: 'outcome_2', affected_ref_choices: ['ref_1'] } };
    } }
  });
  const plan = await model(input);
  assert.equal(validateWorldProcessStepPlan(plan, input), true);
  assert.equal(plan.request_id, input.request_id);
  assert.equal(plan.process_outcome, input.outcome_contract[1].process_outcome);
  assert.equal(plan.reason_code, input.outcome_contract[1].reason_code);
  assert.deepEqual(plan.affected_refs, ['fire:1']);
  assert.deepEqual(plan.fact_changes, []);
  const projected = JSON.parse(user);
  assert.deepEqual(projected, {
    process_facts: ['Огонь горит.'],
    fuel_facts: ['обычное твёрдое топливо'],
    subject_facts: ['цельная порция воды',
      'Действие персонажа: воздействовать водой на огонь.',
      'Огонь продолжает гореть.', 'Холодная вода.'],
    quantity_facts: ['Около трёх четвертей литра воды (750 г).'],
    environment_facts: ['Ветер дует вдоль берега.'],
    outcomes: input.outcome_contract.map((outcome, index) => ({
      choice_id: `outcome_${index + 1}`,
      meaning: ({ no_effect: 'Воздействие не меняет процесс.',
        continue: 'Воздействие меняет процесс, но не завершает его.',
        complete: 'Воздействие завершает процесс.' })[outcome.process_outcome]
    })),
    affected_ref_choices: [
      { choice_id: 'ref_1', role: 'процесс' },
      { choice_id: 'ref_2', role: 'место процесса' },
      { choice_id: 'ref_3', role: 'причина процесса' },
      { choice_id: 'ref_4', role: 'топливо процесса' },
      { choice_id: 'ref_5', role: 'затронутый предмет' }
    ]
  });
  assert.doesNotMatch(user, /request_id|party_state_version|process_ref|scope_ref|causal_basis_ref|started_at|next_boundary_at|current_timestamp|mass_grams|quantities|source_refs|water:1|fire:1/u);
  assert.doesNotMatch(prompt, /"source":/u);
  assert.doesNotMatch(user, /ordinary_solid_fuel_unit|water_portion|actor_affected|process_kind|process_status|environment_facts":\[\]/u);
  assert.match(prompt, /Каждое смысловое утверждение опирай на переданные факты/u);
  assert.match(prompt, /Выбери один исход из outcomes и, если нужно, ссылки из affected_ref_choices/u);
  assert.doesNotMatch(prompt, /outcome_1|ref_1|"meaning"|"role"/u);
  assert.doesNotMatch(prompt, /server binds choices/u);
  assert.match(prompt, /"outcome_choice":"<choice_id>"/u);
  assert.match(prompt, /каждый элемент affected_ref_choices — один строковый идентификатор из переданного списка ссылок/u);
});

test('world-process projection removes only normalized exact duplicate facts', async (t) => {
  const cases = [
    { name: 'negative fact', fact: 'Огонь не горит.', keepsProcessFact: true },
    { name: 'conditional action',
      fact: 'Пока огонь не догорит, поддерживать его.', keepsProcessFact: true },
    { name: 'exact positive duplicate', fact: 'Огонь горит.', keepsProcessFact: false },
    { name: 'case and whitespace normalized duplicate',
      fact: '  ОГОНЬ   ГОРИТ.  ', keepsProcessFact: false }
  ];
  for (const { name, fact, keepsProcessFact } of cases) await t.test(name, async () => {
    const input = worldProcessRequest();
    input.subject_state.facts.push(fact);
    const projected = await captureProjection(input);
    assert.ok(projected.subject_facts.includes(fact));
    assert.equal(projected.process_facts?.includes('Огонь горит.') ?? false,
      keepsProcessFact);
  });
});

test('world-process outcome meanings distinguish unchanged from changed process', async () => {
  const input = worldProcessRequest();
  let user;
  const model = createLowerDvinaTraceWorldProcessStepModel({ roleRunner: {
    async run(call) {
      user = call.messages[1].content;
      return { output: { interpretation: { grounded_transition: 'Проверка.' },
        outcome_choice: 'outcome_1', affected_ref_choices: ['ref_1'] } };
    }
  } });
  await model(input);
  assert.deepEqual(JSON.parse(user).outcomes.map(({ meaning }) => meaning), [
    'Воздействие не меняет процесс.',
    'Воздействие меняет процесс, но не завершает его.',
    'Воздействие завершает процесс.'
  ]);
});

test('world-process projection omits absent fact groups', async () => {
  const input = worldProcessRequest();
  input.subject_state.facts = ['water_portion'];
  input.environment_state.facts = [];
  let user;
  const model = createLowerDvinaTraceWorldProcessStepModel({ roleRunner: {
    async run(call) {
      user = call.messages[1].content;
      return { output: { interpretation: { grounded_transition: 'Проверка.' },
        outcome_choice: 'outcome_1', affected_ref_choices: ['ref_1'] } };
    }
  } });
  await model(input);
  const projected = JSON.parse(user);
  assert.equal('subject_facts' in projected, false);
  assert.equal('environment_facts' in projected, false);
  assert.doesNotMatch(user, /\[\]/u);
});

test('world-process adapter rejects unsupported kinds before model call', async () => {
  const input = worldProcessRequest();
  input.process_kind = 'unknown';
  let calls = 0;
  const model = createLowerDvinaTraceWorldProcessStepModel({ roleRunner: {
    async run() { calls += 1; return { output: {} }; }
  } });
  await assert.rejects(model(input), /Unsupported world process kind/u);
  assert.equal(calls, 0);
});

test('world-process choices remain stable and rebind against the current request', async () => {
  const first = worldProcessRequest(), second = worldProcessRequest();
  second.process.process_ref = 'fire:other';
  second.process.fuel_bindings[0].fuel_ref = 'wood:other';
  second.subject_state.source_refs = ['water:other'];
  const outputs = [{ interpretation: { grounded_transition: 'Вода действует.' },
    outcome_choice: 'outcome_2', affected_ref_choices: ['ref_5'] }];
  const model = createLowerDvinaTraceWorldProcessStepModel({ roleRunner: {
    async run() { return { output: outputs[0] }; }
  } });
  const firstPlan = await model(first), firstRepeat = await model(first);
  const secondPlan = await model(second);
  assert.deepEqual(firstRepeat, firstPlan);
  assert.deepEqual(firstPlan.affected_refs, ['water:1']);
  assert.deepEqual(secondPlan.affected_refs, ['water:other']);
  assert.deepEqual(firstPlan.affected_refs, assembleWorldProcessStepPlan(
    outputs[0], first).affected_refs);
});

test('world-process assembly does not default omitted affected refs', () => {
  const input = worldProcessRequest();
  const plan = assembleWorldProcessStepPlan({ interpretation: {
    grounded_transition: 'Вода ослабляет огонь.' },
  outcome_choice: 'outcome_2' }, input);
  assert.equal(plan.affected_refs, undefined);
  assert.equal(validateWorldProcessStepPlan(plan, input), false);
});

test('world-process assembly rejects unknown affected ref choices', () => {
  const input = worldProcessRequest();
  const plan = assembleWorldProcessStepPlan({ interpretation: {
    grounded_transition: 'Вода ослабляет огонь.' },
  outcome_choice: 'outcome_2', affected_ref_choices: ['ref_unknown'] }, input);
  assert.equal(plan.affected_refs, undefined);
  assert.equal(validateWorldProcessStepPlan(plan, input), false);
});
