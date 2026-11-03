import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { requestTurnStepPlanWithRepair, validateTurnStepPlan } from '@rus/turn';
import { createLowerDvinaTraceActionProducedWeaponClassifier,
  classifyTraceActionProducedWeapon } from
  '../src/runtime/lower-dvina-trace-combat-ordinary-weapon.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { output, request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';
import { assertIntentLoudness } from '../../../tools/cataclysm-prototype/npc-talk-test-helpers.js';
import { runP3TurnStep } from '../../../tools/cataclysm-prototype/p3-boundary.js';
import { replyFrame } from '../../../tools/cataclysm-prototype/p3-test-frames.js';
import { turnStepOperationChoices } from '../src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('planner assembly derives speech loudness from remaining intent', async (t) => {
  for (const [modelLoudness, intent, expectedLoudness] of [
    [1, 'Кричу: «Берегись!»', 4],
    [2, 'Кричу: «Берегись!»', 4],
    [3, 'Кричу: «Берегись!»', 4],
    [4, 'Шепчу: «Берегись!»', 1]
  ]) await t.test(`громкость ${expectedLoudness} по намерению «${intent}»`, async () => {
    const input = speechRequest(intent);
    const roles = [];
    const plan = await createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        roles.push(call.role_id);
        return { output: playerUtteranceOutput(input, modelLoudness) };
      }
    } })(input);

    assert.deepEqual(roles, ['turn_step_planner'],
      'семантический ответ получен единственным вызовом планировщика');
    assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true,
      'план после сборки должен пройти строгую проверку');
    assert.equal(plan.utterance.delivery.loudness, expectedLoudness,
      'громкость плана должна соответствовать общему parser для request.remaining_intent');
  });
});

test('planner assembly derives missing speech loudness from remaining intent', async () => {
  const input = speechRequest('Кричу: «Берегись!»');
  const plan = await createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: playerUtteranceOutput(input) }; }
  } })(input);

  assert.equal(plan.utterance.delivery.loudness, 4);
});

test('planner assembly replaces model speech loudness before strict plan validation', async (t) => {
  for (const loudness of [0, 5, 1.5, '3']) await t.test(
    `недопустимая громкость ${JSON.stringify(loudness)}`, async () => {
      const input = speechRequest('Говорю: «Берегись!»');
      const roles = [];
      const plan = await createLowerDvinaTraceTurnStepModel({ roleRunner: {
        async run(call) {
          roles.push(call.role_id);
          return { output: playerUtteranceOutput(input, loudness) };
        }
      } })(input);
      assert.deepEqual(roles, ['turn_step_planner'],
        'недопустимое значение проверяется после единственного вызова планировщика');
      const validation = validateTurnStepPlan(plan, { request: input });

      assert.equal(validation.ok, true,
        `модельная громкость ${JSON.stringify(loudness)} должна заменяться до проверки плана`);
      assert.equal(plan.utterance.delivery.loudness, 2,
        'для намерения без cue сборщик должен установить обычную громкость');
    });

  const input = speechRequest('Говорю: «Берегись!»');
  const malformedOutput = playerUtteranceOutput(input);
  malformedOutput.utterance.delivery = null;
  const malformedPlan = await createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: malformedOutput }; }
  } })(input);
  const malformedValidation = validateTurnStepPlan(malformedPlan, { request: input });

  assert.equal(malformedValidation.ok, false,
    'неверная структура delivery должна оставаться закрытой строгой проверкой');
  assert.equal(malformedValidation.errors.some(({ path: errorPath }) =>
    errorPath.startsWith('$.utterance.delivery')), true,
  'ошибка malformed delivery должна оставаться в пути utterance.delivery');
});

test('repaired planner output derives speech loudness from intent', async () => {
  const input = request({ root_player_action: 'Кричу: «Берегись!»',
    remaining_intent: 'Кричу: «Берегись!»' });
  const roleRunner = { async run() {
    return { output: playerUtteranceOutput(input, 3) };
  } };
  let validationAttempts = 0;
  const semanticPlanValidator = async () => {
    validationAttempts += 1;
    if (validationAttempts === 1) throw Object.assign(
      new Error('force the planner repair path'), {
        code: 'TURN_STEP_PLAN_INVALID',
        details: { errors: [{ path: '$.utterance',
          code: 'operation_semantic_grounding',
          message: 'repair the utterance plan' }] }
      });
    return true;
  };
  const result = await requestTurnStepPlanWithRepair({
    request: input,
    turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
    semanticPlanValidator
  });

  assert.equal(result.repaired, true);
  assertIntentLoudness(result.plan?.utterance?.delivery?.loudness, 4);
});

test('production weapon classifier adds its response schema around the model class', async (t) => {
  const actorRef = { entity_kind: 'player_character', entity_id: 'mikula-1' };
  const item = { item_id: 'a1-spear',
    placement: { holder_character_id: 'mikula-1' }, state: {
      condition_state: 'serviceable', ordinary_metadata: {
        name: 'заострённая жердь',
        semantic_facts: [{ fact_id: 'fact:sharp', text: 'конец заострён' }]
      }, action_production: {
        schema: 'rus.items.action_production_item_state.v1',
        output_class: 'written_carrier', physical_form: 'long'
      }
    } };
  let providerCalls = 0;
  const savedFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = savedFetch; });
  globalThis.fetch = async (url) => {
    assert.ok(String(url).startsWith('http://weapon-acceptance.invalid/'));
    providerCalls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      request_id: 'combat-weapon:acceptance',
      qualitative_class: 'improvised_puncture_light'
    }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const roleRunner = createLlmRoleRunnerAdapter({ env: {}, settings: {
    providerSnapshot: () => ({ mode: 'local',
      baseUrl: 'http://weapon-acceptance.invalid/v1', model: 'capture-only', apiKey: null })
  } });
  const classify = createLowerDvinaTraceActionProducedWeaponClassifier({
    roleRunner
  });

  const result = await classifyTraceActionProducedWeapon({ items: [item],
    actor_ref: actorRef, request_id: 'combat-weapon:acceptance', classify });

  assert.equal(providerCalls, 1);
  assert.deepEqual(result, { item_ref: 'a1-spear', weapon_danger: 1 });
});

test('P3 domain speech derives native loudness from player intent', async () => {
  for (const [intent, expected] of [['Кричу: «Берегись!»', 4], ['Шепчу: «Берегись!»', 1]]) {
    let calls = 0;
    let captured;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
      calls++;
      const input = JSON.parse(call.messages[1].content);
      const selected = turnStepOperationChoices(input).find(({ operation }) =>
        operation.op === 'emit_interaction' && operation.interaction_kind === 'speech');
      assert.ok(selected, 'a speech domain choice is required');
      return { output: { interpretation: { player_goal: input.remaining_intent,
        grounded_attempt: input.remaining_intent, adaptation: 'literal' },
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        direct_result_kind: null, operation_family: selected.operation.op,
        operation_choice: selected.choice_id, operations: [], check: null,
        continuation: null, clarification: null, reason_code: 'offered_operation',
        reason: 'Выбрать предложенную речь.' } };
    } } });
    const result = await runP3TurnStep({ intent, observation: replyFrame({ turn: 3 }),
      operationId: 'acceptance-domain-loudness', nativeSpeechOnly: true, targetActorRef: 'npc:9',
      nativeAdapter: { writeOperationRequest: async () => {}, readOperationReadback: async () => ({}),
        async execute(envelope) {
          captured = envelope;
          return { schema: 'p3_native_operation_readback_v1', operation_id: envelope.operation_id,
            status: 'applied', goal_result: 'achieved', before: { turn: 3 }, after: { turn: 3 },
            native_effect: { effect_status: 'confirmed', speakerId: '7',
              utterance: envelope.args.utterance, actualHeardListenerIds: ['9'] } };
        } }, turnStepModel: model });
    assert.equal(calls, 1);
    assert.equal(captured.primitive, 'speak');
    assert.equal(captured.args.utterance, 'Берегись!');
    assertIntentLoudness(captured.args.delivery.loudness, expected);
    assert.equal(captured.args.delivery.duration_class, 'brief');
    assert.equal(result.working_projection.native_readback.status, 'applied');
  }
});

test('apps and packages sources contain no retired LLM role paths', () => {
  const files = appPackageSourceFiles(repositoryRoot);
  const matches = sourceMatches(files,
    /\b(?:intent_router|npc_bounded_decision|probeLlmProvider)\b/gu,
    repositoryRoot);

  assert.deepEqual(matches, [],
    `Убери устаревшие LLM-роли и probe-функцию из apps/packages source:\n${matches.join('\n')}`);
});

function playerUtteranceOutput(input, loudness) {
  const delivery = { duration_class: 'instant',
    ...(loudness === undefined ? {} : { loudness }) };
  return { ...output(),
    interpretation: { player_goal: input.root_player_action,
      grounded_attempt: 'Берегись!', adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_utterance',
    utterance: { speaker_ref: input.actor.actor_ref,
      utterance_text: 'Берегись!', input_mode: 'verbatim', delivery } };
}

function speechRequest(intent) {
  return request({ root_player_action: intent, remaining_intent: intent });
}

function appPackageSourceFiles(root) {
  const files = [];
  for (const base of ['apps', 'packages']) {
    const basePath = path.join(root, base);
    for (const entry of readdirSync(basePath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sourceRoot = path.join(basePath, entry.name, 'src');
      if (existsSync(sourceRoot)) files.push(...javascriptFiles(sourceRoot));
    }
  }
  return files;
}

function prototypeSourceFiles(root) {
  const prototypeRoot = path.join(root, 'tools/cataclysm-prototype');
  return readdirSync(prototypeRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js')
      && !isTestFile(entry.name))
    .map((entry) => path.join(prototypeRoot, entry.name));
}

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(filePath);
    return entry.isFile() && /\.(?:[cm]?js|jsx|tsx?|py)$/u.test(entry.name)
      && !isTestFile(entry.name) ? [filePath] : [];
  });
}

function isTestFile(name) {
  return /(?:^|[.-])test(?:[.-]|$)/iu.test(name);
}

function sourceMatches(files, expression, root) {
  const matches = [];
  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    expression.lastIndex = 0;
    for (const match of source.matchAll(expression)) {
      const line = source.slice(0, match.index).split('\n').length;
      const fragment = source.split('\n')[line - 1].trim();
      matches.push(`${path.relative(root, filePath)}:${line}: ${fragment}`);
    }
  }
  return matches;
}
