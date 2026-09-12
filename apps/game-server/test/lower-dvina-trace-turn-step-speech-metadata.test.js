import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnStepPlan } from '@rus/turn';
import { requestAndValidateTurnStepPlan, requestTurnStepPlanWithRepair } from
  '../../../packages/turn/src/turn-step-plan-repair.js';
import { createTurnStepDomainOwnerPreflight } from
  '../../../packages/turn/src/turn-step-domain-owner-preflight.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { TURN_STEP_PLAN_MAPPINGS } from
  '../src/runtime/lower-dvina-trace-phase-2-turn-step-prompts.js';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';
import { turnStepRepairSpecificInstructions } from
  '../src/runtime/lower-dvina-trace-turn-step-repair-prompt.js';
import { output, request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';
const D = { loudness: 2, duration_class: 'instant' };

test('misclassified sustained action repairs to non-speech activity', async () => {
  const action = 'Жду под навесом два часа.';
  const input = request({ root_player_action: action, remaining_intent: action });
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(call.role_id);
    if (call.role_id === 'turn_step_planner') return { output:
      speechOutput(input, action) };
    if (call.role_id === 'turn_step_grounding_auditor') return { output: {
      speech_faithful: false, required_input_mode: 'intent_paraphrase',
      unexecuted_intent: null
    } };
    assert.equal(call.role_id, 'turn_step_planner_repair');
    const payload = JSON.parse(call.messages[1].content);
    const instructions = turnStepRepairSpecificInstructions(payload, input).join(' ');
    assert.match(instructions,
      /proposed utterance failed semantic grounding[\s\S]*Typed first-person action prose is not speech/u);
    return { output: {
      interpretation: { player_goal: action, grounded_attempt: action,
        adaptation: 'literal' },
      resolution: 'direct', goal_result: 'achieved',
      activity: { owner: 'semantic', duration_class: 'extended', effort: 'none',
        requested_duration_minutes: 120 },
      operation_family: null, operation_choice: null, operations: [],
      check: null, continuation: null, clarification: null,
      direct_result_kind: null, reason_code: 'ordinary_semantic_activity',
      reason: 'Waiting is the complete activity.'
    } };
  } };
  const turnStepModel = createLowerDvinaTraceTurnStepModel({ roleRunner });
  const result = await requestTurnStepPlanWithRepair({ request: input,
    turnStepModel, semanticPlanValidator:
      createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) });
  assert.equal(result.repaired, true);
  assert.deepEqual(result.plan.activity, { owner: 'semantic',
    duration_class: 'extended', effort: 'none', requested_duration_minutes: 120 });
  assert.equal(result.plan.direct_result_kind, null);
  assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor',
    'turn_step_planner_repair']);
});

function speechOutput(input, words, later = null) {
  return { ...output(), ...JSON.parse(TURN_STEP_PLAN_MAPPINGS).player_utterance,
    interpretation: { player_goal: input.remaining_intent,
      grounded_attempt: words, adaptation: 'literal' },
    utterance: { speaker_ref: input.actor.actor_ref,
      utterance_text: words, input_mode: 'verbatim', delivery: D },
    goal_result: later == null ? 'achieved' : 'pending',
    continuation: later == null ? null
      : { remaining_intent: later, depends_on_refs: [] } };
}

test('quoted speech framing is not a second unexecuted action', async () => {
  const intent = 'Ещё раз громко кричу: «Люди, вы меня слышите?»';
  const words = 'Люди, вы меня слышите?';
  const input = request({ root_player_action: intent, remaining_intent: intent });
  const roleRunner = { async run(call) {
    if (call.role_id === 'turn_step_planner') return { output:
      speechOutput(input, words) };
    assert.equal(call.role_id, 'turn_step_grounding_auditor');
    return { output: { speech_faithful: true,
      required_input_mode: 'verbatim',
      unexecuted_intent: 'Ещё раз громко кричу:' } };
  } };
  const result = await requestTurnStepPlanWithRepair({ request: input,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
    semanticPlanValidator:
      createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) });
  assert.equal(result.repaired, false);
  assert.equal(result.plan.goal_result, 'achieved');
  assert.equal(result.plan.continuation, null);
});

test('provider metadata does not trigger repair before the exact speech and suffix audit', async (t) => {
  for (const unseen of [false, true]) await t.test(unseen ? 'unseen metadata' : 'captured adaptation_type', async () => {
    const intent = unseen ? 'Говорю: «Берегись!»; затем отхожу к вербе.'
      : 'Зову Онисима и длинной ветвью осторожно прощупываю воду между обломками.';
    const words = unseen ? 'Берегись!' : 'Онисим!';
    const suffix = unseen ? '; затем отхожу к вербе.'
      : 'и длинной ветвью осторожно прощупываю воду между обломками.';
    const mode = unseen ? 'verbatim' : 'intent_paraphrase';
    const input = request({ root_player_action: intent, remaining_intent: intent });
    const raw = speechOutput(input, words, unseen ? 'отхожу к вербе.' : suffix.slice(2));
    raw.goal_result = 'achieved';
    raw.interpretation.grounded_attempt = unseen ? 'Произнести предупреждение.'
      : 'The player wants to call out to Onim, and then use a long branch to probe the water between the wreckage.';
    raw.interpretation[unseen ? 'planning_note' : 'adaptation_type'] = unseen ? { draft: 'safe metadata' } : 'literal';
    raw[unseen ? 'model_commentary' : 'semantic_confidence'] = { source: 'model metadata' };
    const original = structuredClone(raw);
    const calls = [];
    let retrievals = 0;
    const roleRunner = { async run(call) {
      calls.push(call.role_id);
      if (call.role_id === 'turn_step_planner') return { output: raw };
      assert.equal(call.role_id, 'turn_step_grounding_auditor');
      return { output: { speech_faithful: true, required_input_mode: mode, unexecuted_intent: suffix } };
    } };
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner,
        worldKnowledgeGrounder: { async ground(value) { retrievals += 1; return value; } } }),
      semanticPlanValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) });
    assert.equal(result.repaired, false);
    assert.equal(result.plan.goal_result, 'pending');
    assert.deepEqual(result.plan.utterance, { speaker_ref: input.actor.actor_ref,
      utterance_text: words, input_mode: mode, delivery: D });
    assert.deepEqual(result.plan.continuation, { remaining_intent: suffix, depends_on_refs: [] });
    assert.deepEqual(result.plan.interpretation, { player_goal: raw.interpretation.player_goal,
      grounded_attempt: raw.interpretation.grounded_attempt, adaptation: 'literal' });
    assert.equal(Object.hasOwn(result.plan, unseen ? 'model_commentary' : 'semantic_confidence'), false);
    assert.equal(validateTurnStepPlan(result.plan, { request: input }).ok, true);
    assert.deepEqual(raw, original);
    assert.equal(retrievals, 1);
    assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor']);
  });
});

test('V8 strict repair copy metadata is audited once, projected and frozen without a third planner', async (t) => {
  for (const kind of ['captured', 'unseen', 'unfaithful', 'malformed', 'wrong-words', 'wrong-audit-mode',
    'wrong-suffix', 'carrier', 'discovery', 'dependency', 'missing-field', 'light-effort']) await t.test(kind, async () => {
    const unseen = kind === 'unseen';
    const intent = unseen ? 'Предупреждаю об опасности, затем отхожу к вербе и осматриваю склон.'
      : 'Зову Онисима и длинной ветвью осторожно прощупываю воду между обломками.';
    const later = unseen ? ', затем отхожу к вербе и осматриваю склон.'
      : 'и длинной ветвью осторожно прощупываю воду между обломками.';
    const words = unseen ? 'Берегитесь!' : 'Онисим!';
    const input = request({ remaining_intent: intent });
    const calls = [];
    let audits = 0;
    let retrievals = 0;
    let repairedOutput;
    const grounded = new WeakSet();
    const roleRunner = { async run(call) {
      calls.push(call.role_id);
      if (call.role_id === 'turn_step_grounding_auditor') {
        audits += 1;
        if (audits === 2 && kind === 'malformed') return { output: {} };
        return { output: { speech_faithful: (audits === 2 || kind === 'captured') && !['unfaithful', 'wrong-words'].includes(kind),
          required_input_mode: kind === 'wrong-audit-mode' ? 'verbatim' : 'intent_paraphrase', unexecuted_intent: later } };
      }
      const primary = call.role_id === 'turn_step_planner';
      const plan = speechOutput(input, primary && kind !== 'captured' ? intent : kind === 'wrong-words' ? 'Я обещаю отдать всё.' : words,
        primary ? null : kind === 'captured' ? later : later.slice(unseen ? 8 : 2));
      plan.goal_result = 'achieved';
      if (primary) {
        if (kind === 'captured') {
          for (const field of ['operations', 'check', 'continuation', 'clarification']) delete plan[field];
        } else plan.utterance.input_mode = 'intent_paraphrase';
      }
      else {
        if (kind === 'captured') plan.goal_result = 'pending';
        if (kind === 'wrong-suffix') plan.continuation.remaining_intent = 'осматриваю чужой дом.';
        if (kind === 'carrier') plan.continuation.prepared_followup_ref = 'prepared:foreign';
        if (kind === 'dependency') plan.continuation.depends_on_refs = ['item:foreign'];
        if (kind === 'light-effort') plan.activity.effort = 'light';
        repairedOutput = structuredClone(plan);
      }
      return { output: plan };
    } };
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner,
        worldKnowledgeGrounder: { async ground(safeRequest) {
          if (!grounded.has(safeRequest)) { retrievals += 1; grounded.add(safeRequest); }
          return safeRequest;
        } } });
    const run = () => requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: async (safeRequest, repair) => {
        const plan = await model(safeRequest, repair);
        if (repair && kind === 'missing-field') delete plan.operations;
        if (repair && kind === 'discovery') plan.continuation.pending_discovery = {};
        return plan;
      },
      semanticPlanValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) });
    if (['captured', 'unseen'].includes(kind)) {
      const result = await run();
      assert.equal(result.repaired, true);
      assert.deepEqual(result.plan.utterance, { ...repairedOutput.utterance, input_mode: 'intent_paraphrase' });
      assert.deepEqual(result.plan.continuation, { remaining_intent: later, depends_on_refs: [] });
      assert.equal(result.plan.goal_result, 'pending');
      for (const field of ['operations', 'activity', 'interpretation']) assert.deepEqual(result.plan[field], repairedOutput[field]);
      assert.equal(Object.isFrozen(result.plan.utterance), true);
      assert.equal(validateTurnStepPlan(result.plan, { request: input }).ok, true);
    } else await assert.rejects(run, (error) => kind === 'malformed'
      ? error.code === 'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID'
      : error.code === 'TURN_STEP_PLAN_INVALID' && error.details.repair_attempted === true);
    assert.equal(retrievals, 1);
    assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor', 'turn_step_planner_repair',
      ...(['captured', 'unseen', 'unfaithful', 'malformed', 'wrong-words', 'wrong-audit-mode'].includes(kind) ? ['turn_step_grounding_auditor'] : [])]);
    assert.equal(repairedOutput.utterance.input_mode, 'verbatim');
  });
});

test('captured V6 projects only a faithful valid repair; remaining errors are terminal', async (t) => {
  for (const kind of ['faithful', 'unfaithful', 'malformed', 'quote',
    'carrier', 'bad-suffix', 'invalid-repair', 'invalid-repair-effort']) await t.test(kind, async () => {
  const intent = 'Зову Онисима и длинной ветвью осторожно прощупываю воду между обломками.';
  const later = 'и длинной ветвью осторожно прощупываю воду между обломками.';
  const input = request({ remaining_intent: intent });
  if (kind === 'carrier') input.prepared_followup_candidates = [{
    prepared_followup_ref: 'prepared:next',
    precursor_operation: { op: 'request_activity' },
    operation: { op: 'emit_interaction' }
  }];
  const calls = [];
  let audits = 0;
  let retrievals = 0;
  const grounded = new WeakSet();
  let repairedOutput;
  const roleRunner = { async run(call) {
    calls.push(call.role_id);
    if (call.role_id === 'turn_step_grounding_auditor') {
      audits += 1;
      if (audits === 2 && kind === 'malformed') return { output: {} };
      return { output: {
        speech_faithful: audits === 2 && !['unfaithful', 'quote'].includes(kind),
        required_input_mode: 'intent_paraphrase',
        unexecuted_intent: kind === 'bad-suffix' ? 'и осматриваюсь.' : later
      } };
    }
    const primary = call.role_id === 'turn_step_planner';
    const output = speechOutput(input, primary ? intent : 'Онисим!',
      primary ? null : later.slice(2));
    output.utterance.input_mode = 'intent_paraphrase';
    output.goal_result = 'achieved';
    if (!primary) {
      if (kind === 'quote') output.utterance.utterance_text = 'Я обещаю отдать всё.';
      if (kind === 'carrier') output.continuation.prepared_followup_ref = 'prepared:next';
      if (kind === 'invalid-repair') output.utterance.unknown = true;
      if (kind === 'invalid-repair-effort') output.activity.effort = 'light';
      repairedOutput = structuredClone(output);
    }
    return { output };
  } };
  const run = () => requestTurnStepPlanWithRepair({ request: input,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner,
      worldKnowledgeGrounder: { async ground(safeRequest) {
        if (!grounded.has(safeRequest)) { retrievals += 1; grounded.add(safeRequest); }
        return safeRequest;
      } } }),
    semanticPlanValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner })
  });
  if (kind === 'faithful') {
    const result = await run();
    assert.equal(result.repaired, true);
    assert.equal(result.plan.goal_result, 'pending');
    assert.deepEqual(result.plan.continuation, { remaining_intent: later, depends_on_refs: [] });
    assert.deepEqual(result.plan.utterance, repairedOutput.utterance);
    assert.deepEqual(result.plan.operations, repairedOutput.operations);
    assert.deepEqual(result.plan.activity, repairedOutput.activity);
    assert.deepEqual(result.plan.interpretation, repairedOutput.interpretation);
    assert.equal(Object.isFrozen(result.plan.utterance), true);
    assert.equal(validateTurnStepPlan(result.plan, { request: input }).ok, true);
  } else await assert.rejects(run, (error) => kind === 'malformed'
    ? error.code === 'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID'
    : error.code === 'TURN_STEP_PLAN_INVALID' && error.details.repair_attempted === true);
  assert.equal(retrievals, 1);
  assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor',
    'turn_step_planner_repair', ...(kind.startsWith('invalid-repair') ? [] : ['turn_step_grounding_auditor'])]);
  assert.equal(input.remaining_intent, intent);
  });
});

test('faithful speech restores only a lost suffix prefix through preflight without repair', async (t) => {
  for (const [intent, words, prefix, tail, mode] of [
    ['Зову Онисима и длинной ветвью осторожно прощупываю воду между обломками.',
      'Онисим!', 'и ', 'длинной ветвью осторожно прощупываю воду между обломками.', 'intent_paraphrase'],
    ['Говорю: «Берегись!»; после этого прислушиваюсь к шагам за дверью.',
      'Берегись!', '; после этого ', 'прислушиваюсь к шагам за дверью.', 'verbatim']
  ]) for (const shortened of [true, false]) await t.test(`${shortened}: ${intent}`, async () => {
    const input = request({ remaining_intent: intent });
    const original = speechOutput(input, words, shortened ? tail : prefix + tail);
    original.utterance.input_mode = mode;
    const calls = [];
    let retrievals = 0;
    let assembled;
    const roleRunner = { async run(call) {
      calls.push(call.role_id);
      if (call.role_id === 'turn_step_planner') return { output: original };
      assert.equal(call.role_id, 'turn_step_grounding_auditor');
      return { output: { speech_faithful: true, required_input_mode: mode,
        unexecuted_intent: prefix + tail } };
    } };
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner,
      worldKnowledgeGrounder: { async ground(safeRequest) {
        retrievals += 1;
        assert.equal(Object.isFrozen(safeRequest), true);
        return safeRequest;
      } } });
    const preflight = createTurnStepDomainOwnerPreflight({
      semanticBindings: [], availableOptions: new Set(),
      isDomainStepOperation: () => false,
      services: { turnStepSemanticGroundingValidator:
        createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) }
    });
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: async (safeRequest) => { assembled = await model(safeRequest); return assembled; },
      semanticPlanValidator: preflight });
    assert.equal(result.repaired, false);
    assert.deepEqual(result.plan, { ...assembled,
      continuation: { remaining_intent: prefix + tail, depends_on_refs: [] } });
    assert.deepEqual(result.plan.utterance, original.utterance);
    assert.equal(assembled.continuation.remaining_intent, shortened ? tail : prefix + tail);
    assert.equal(Object.isFrozen(result.plan.continuation), true);
    assert.equal(Object.isFrozen(result.plan.utterance), true);
    assert.equal(validateTurnStepPlan(result.plan, { request: input }).ok, true);
    assert.equal(retrievals, 1);
    assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor']);
  });
});

test('speech suffix projection restores absence but rejects replacement, carriers and unfaithful speech', async () => {
  const later = 'Then I listen toward the river.';
  const input = request({ remaining_intent: `I call, "Hello!" ${later}` });
  const base = speechOutput(input, 'Hello!', 'I listen toward the river.');
  for (const [change, audit] of [
    [{ continuation: { remaining_intent: `and ${later}`, depends_on_refs: [] } }, {}],
    [{ continuation: { remaining_intent: 'I watch the river.', depends_on_refs: [] } }, {}],
    [{ continuation: { ...base.continuation, depends_on_refs: ['item:branch'] } }, {}],
    [{ continuation: { ...base.continuation, prepared_followup_ref: 'prepared:next' } }, {}],
    [{ continuation: { ...base.continuation, pending_discovery: {} } }, {}],
    [{ utterance: { ...base.utterance, input_mode: 'intent_paraphrase' } },
      { speech_faithful: false }],
    [{ utterance: { ...base.utterance, utterance_text: 'I promise to help.' } },
      { speech_faithful: false }],
    [{}, { speech_faithful: false }],
    [{}, { unexecuted_intent: input.remaining_intent }],
    [{}, { unexecuted_intent: 'Invented prefix: I listen toward the river.' }]
  ]) {
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() { return { output: { speech_faithful: true,
        required_input_mode: 'verbatim', unexecuted_intent: later, ...audit } }; } }
    });
    await assert.rejects(validate({ request: input, plan: { ...base, ...change },
      allow_speech_metadata_projection: true }), { code: 'TURN_STEP_PLAN_INVALID' });
  }
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
    roleRunner: { async run() { return { output: { speech_faithful: true,
      required_input_mode: 'verbatim', unexecuted_intent: later } }; } }
  });
  const restored = await validate({ request: input,
    plan: { ...base, goal_result: 'achieved', continuation: null },
    allow_speech_metadata_projection: true });
  assert.deepEqual(restored.corrected_plan.continuation,
    { remaining_intent: later, depends_on_refs: [] });
  assert.equal(restored.corrected_plan.goal_result, 'pending');
});

test('speech audit sends a later utterance back to the earlier action', async () => {
  const intent = 'Оглядываю берег, прислушиваюсь и громко зову Онисима, надеясь найти лодочника или услышать ответ.';
  const input = request({ remaining_intent: intent });
  const plan = speechOutput(input, 'Онисим!');
  plan.utterance.input_mode = 'intent_paraphrase';
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
    roleRunner: { async run() { return { output: { speech_faithful: true,
      required_input_mode: 'intent_paraphrase',
      unexecuted_intent: 'Оглядываю берег, прислушиваюсь, надеясь найти лодочника или услышать ответ.'
    } }; } }
  });
  await assert.rejects(validate({ request: input, plan,
    allow_speech_metadata_projection: true }), (error) =>
    error.code === 'TURN_STEP_PLAN_INVALID'
      && error.details.errors[0].path === '$.utterance'
      && error.details.errors[0].message.includes('earliest action'));
});

test('structurally invalid initial speech cannot use suffix projection', async () => {
  const later = 'Then I listen toward the river.';
  const input = request({ remaining_intent: `I call, "Hello!" ${later}` });
  const corrected = speechOutput(input, 'Hello!', later);
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(call.role_id);
    if (call.role_id === 'turn_step_grounding_auditor') return { output: {
      speech_faithful: true, required_input_mode: 'verbatim', unexecuted_intent: later
    } };
    if (call.role_id === 'turn_step_planner') {
      const plan = { ...corrected, continuation: {
        remaining_intent: 'I listen toward the river.', depends_on_refs: [] } };
      delete plan.operations;
      return { output: plan };
    }
    return { output: corrected };
  } };
  const result = await requestTurnStepPlanWithRepair({ request: input,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
    semanticPlanValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) });
  assert.equal(result.repaired, true);
  assert.deepEqual(result.plan.continuation, corrected.continuation);
  assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor',
    'turn_step_planner_repair', 'turn_step_grounding_auditor']);
});

test('core strictly revalidates the semantic validator correction', async () => {
  const input = request({ remaining_intent: 'I call, "Hello!"' });
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: speechOutput(input, 'Hello!') }; }
  } });
  await assert.rejects(requestAndValidateTurnStepPlan({ request: input,
    turnStepModel: model, semanticPlanValidator: async ({ plan }) => ({
      corrected_plan: { ...plan, unknown: true }
    }) }), (error) => error.code === 'TURN_STEP_PLAN_INVALID'
      && error.details.errors.some(({ code }) => code === 'additional_property'));
});

test('metadata projection admits only isolated errors and keeps invalid mechanics, effects and quotes closed', async (t) => {
  for (const kind of ['mode-and-goal', 'goal-only', 'effort-only', 'unknown-field', 'unknown-mode',
    'invalid-effort', 'domain-owner', 'long-duration', 'requested-duration',
    'operations', 'foreign-speaker', 'empty-words', 'dependency', 'prepared', 'discovery',
    'rewritten-quote', 'foreign-quote', 'repeated-speech']) await t.test(kind, async () => {
    const repeated = kind === 'repeated-speech';
    const later = repeated ? 'затем прислушиваюсь у двери.' : 'and I listen at the door.';
    const input = request({ remaining_intent: repeated
      ? `В течение часа повторяю зов о помощи, ${later}` : kind === 'rewritten-quote'
      ? `I say, "Come back!" ${later}` : kind === 'foreign-quote'
      ? `He said "Hello!", and I call for help ${later}`
      : `I call for help ${later}` });
    const raw = speechOutput(input, repeated ? 'Помогите!' : 'Hello!',
      repeated ? 'прислушиваюсь у двери.' : 'I listen at the door.');
    const plan = await createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: raw }; }
    } })(input);
    plan.goal_result = 'achieved';
    plan.activity.effort = 'light';
    if (kind === 'goal-only' || kind === 'rewritten-quote') plan.utterance.input_mode = 'intent_paraphrase';
    if (kind === 'unknown-field') plan.extra = true;
    if (kind === 'unknown-mode') plan.utterance.input_mode = 'invented';
    if (kind === 'invalid-effort') plan.activity.effort = 'invented';
    if (kind === 'domain-owner') plan.activity = { owner: 'domain', duration_class: null, effort: null };
    if (kind === 'long-duration') plan.activity.duration_class = 'brief';
    if (kind === 'requested-duration') plan.activity.requested_duration_minutes = 1;
    if (kind === 'operations') plan.operations = [{ op: 'request_activity' }];
    if (kind === 'foreign-speaker') plan.utterance.speaker_ref = 'actor:other';
    if (kind === 'empty-words') plan.utterance.utterance_text = '';
    if (kind === 'dependency') plan.continuation.depends_on_refs = ['item:branch'];
    if (kind === 'prepared') plan.continuation.prepared_followup_ref = 'prepared:next';
    if (kind === 'discovery') plan.continuation.pending_discovery = {};
    if (kind === 'effort-only') {
      plan.activity.effort = 'moderate';
      plan.utterance.input_mode = 'intent_paraphrase';
      plan.goal_result = 'pending';
      plan.continuation.remaining_intent = later;
    }
    const calls = [];
    const run = () => requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: async (_request, repair) => {
        calls.push(repair ? 'repair' : 'planner');
        return plan;
      }, semanticPlanValidator: createLowerDvinaTraceTurnStepSemanticGroundingValidator({
        roleRunner: { async run(call) {
          calls.push('audit');
          if (repeated) assert.match(call.messages[0].content,
            /speech_faithful=false, если явно длительная, повторяемая или ограниченная временем речь сведена к одной короткой реплике/u);
          assert.match(call.messages[0].content,
            /Цель, надежда, манера или ожидаемый результат/u);
          assert.match(call.messages[0].content,
            /Фраза от первого лица о действии[\s\S]*не становится произнесённой репликой/u);
          return { output: { speech_faithful: !kind.endsWith('quote') && !repeated,
            required_input_mode: kind === 'rewritten-quote' ? 'verbatim' : 'intent_paraphrase',
            unexecuted_intent: later } };
        } }
      }) });
    if (['mode-and-goal', 'goal-only', 'effort-only'].includes(kind)) {
      const result = await run();
      assert.equal(result.repaired, false);
      assert.deepEqual(result.plan, { ...plan, goal_result: 'pending',
        activity: { ...plan.activity, effort: 'none' },
        utterance: { ...plan.utterance, input_mode: 'intent_paraphrase' },
        continuation: { remaining_intent: later, depends_on_refs: [] } });
      assert.equal(Object.isFrozen(result.plan.utterance), true);
      assert.deepEqual(calls, ['planner', 'audit']);
    } else {
      await assert.rejects(run, { code: 'TURN_STEP_PLAN_INVALID' });
      assert.equal(calls.filter((role) => role === 'repair').length, 1);
    }
  });
});
