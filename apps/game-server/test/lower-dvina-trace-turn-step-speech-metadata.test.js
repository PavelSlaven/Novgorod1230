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
    if (call.role_id === 'turn_step_grounding_auditor') return {
      output: call.messages[0].content.includes('proposed direct semantic activity')
        ? { pass: true, concerns: [] }
        : { speech_faithful: false, required_input_mode: 'intent_paraphrase',
          unexecuted_intent: null }
    };
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
    'turn_step_planner_repair', 'turn_step_grounding_auditor']);
});

test('misclassified unquoted request in a chain repairs to speech before later action', async () => {
  const intent = 'прошу спутника подать воды и затем развязываю узел';
  const later = 'и затем развязываю узел';
  const input = request({ root_player_action: intent, remaining_intent: intent,
    player_safe_state: { visible_entities: [{ entity_ref: 'companion_1' }] } });
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(call.role_id);
    if (call.role_id === 'turn_step_planner') return { output: {
      ...output(), interpretation: { player_goal: intent,
        grounded_attempt: 'прошу спутника подать воды', adaptation: 'literal' },
      goal_result: 'pending', continuation: { remaining_intent: later,
        depends_on_refs: ['companion_1'] },
      reason_code: 'speech_before_independent_action',
      reason: 'The request is handled before the later action.'
    } };
    if (call.role_id === 'turn_step_grounding_auditor'
        && call.messages[0].content.includes('proposed direct semantic activity')) {
      return { output: { pass: false,
        concerns: [{ kind: 'operation_semantic_grounding' }] } };
    }
    if (call.role_id === 'turn_step_planner_repair') {
      const payload = JSON.parse(call.messages[1].content);
      assert.match(turnStepRepairSpecificInstructions(payload, input).join(' '),
        /Speech, a request, an answer[\s\S]*never complete it as ordinary semantic activity/u);
      const repaired = speechOutput(input, 'Спутник, подай воды.', later);
      repaired.utterance.input_mode = 'intent_paraphrase';
      return { output: repaired };
    }
    assert.equal(call.role_id, 'turn_step_grounding_auditor');
    return { output: { speech_faithful: true,
      required_input_mode: 'intent_paraphrase', unexecuted_intent: later } };
  } };
  const result = await requestTurnStepPlanWithRepair({ request: input,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
    semanticPlanValidator:
      createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) });
  assert.equal(result.repaired, true);
  assert.equal(result.plan.direct_result_kind, 'player_utterance');
  assert.equal(result.plan.utterance.input_mode, 'intent_paraphrase');
  assert.equal(result.plan.utterance.utterance_text, 'Спутник, подай воды.');
  assert.deepEqual(result.plan.continuation,
    { remaining_intent: later, depends_on_refs: [] });
  assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor',
    'turn_step_planner_repair', 'turn_step_grounding_auditor']);
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
    if (['captured', 'unseen', 'wrong-audit-mode'].includes(kind)) {
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
