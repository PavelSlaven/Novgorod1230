import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceNarrationService } from '../src/runtime/lower-dvina-trace-narration-llm.js';
import { WORLD_STORY_BOUNDARY } from '../src/runtime/lower-dvina-trace-narration-audit.js';
import { projectActor } from '../src/runtime/lower-dvina-trace-player-safe-entities.js';
import { reviewedNarration } from './narration-audit-fixture.js';

const privateActorId = 'PRIVATE_ACTOR_654';
const privateRouteId = 'PRIVATE_ROUTE_654';
const actor = projectActor({ actorId: privateActorId,
  profile: { identity: { name: 'Мирон', sex_category: 'male' } } });
const visibleContext = {
  version: 1, schema: 'visible_context_package',
  visible_scene: 'Берег Двины',
  visible_changes: [
    'Мирон провёл ветвью между мокрыми обломками.',
    'Результат наблюдения между обломками остался неизвестен.'
  ],
  uncertainties: [],
  sensory_details: ['У берега лежат мокрые обломки.', 'Под ногами влажная земля.'],
  visible_npc: [],
  visible_objects: [{ entity_ref: { entity_kind: 'passage', entity_id: privateRouteId },
    display_label: 'Тропа к лесу' }],
  known_context: ['Мирон пришёл к берегу утром.'],
  allowed_tensions: [], do_not_imply: []
};
const inventedProse = 'Мирон прошёл по тропе к лесу, хотя такого шага не было в сведениях.';
const groundedProse = 'Мирон провёл ветвью между мокрыми обломками. Влажная земля холодила ноги, и он невольно задержал дыхание: что удалось заметить между обломками, оставалось неизвестно.';

function assertLiteraryBoundary(instruction) {
  assert.match(instruction, /треть(?:ем|его) лиц[еа]/iu);
  assert.match(instruction, /прошедш(?:ем|его) времен[ьи]/iu);
  assert.match(instruction, /рассказ[^.]{0,120}свобод/iu);
  assert.match(instruction, /мысл[ьи]|чувств[ао]|впечатлени/iu);
  assert.match(instruction, /(?:мир[^.]{0,160}(?:сведени|факт)|Сведения задают мир(?: сцены)?)/iu);
  assert.doesNotMatch(instruction, /Ground every sensation|every sensation.*(?:supplied|ground)/iu);
  assert.doesNotMatch(instruction, /Образец интонации|Воздух стоял тёплый и сухой/u);
}

test('D102 turn prose roles receive one factual world and free-telling boundary', async () => {
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const instruction = call.messages[0].content;
    const wireText = call.messages[1].content;
    const wire = JSON.parse(wireText);
    assertLiteraryBoundary(instruction);
    assert.equal(instruction.split(WORLD_STORY_BOUNDARY).length, 2);
    assert.match(wireText, /Мирон/u);
    assert.match(wireText, /мужской/u);
    assert.doesNotMatch(wireText, /"sex_category"|"male"|"female"/u);
    assert.doesNotMatch(wireText, /PRIVATE_ACTOR_654|PRIVATE_ROUTE_654/u);
    const referenced = call.role_id === 'gameplay_narrator_auditor'
      || call.role_id === 'gameplay_narrator_semantic_repair';
    const required = wire['Обязательные положения текущего эпизода'];
    assert.deepEqual(required, visibleContext.visible_changes.map((text, index) =>
      referenced ? `visible_change_${index + 1}: ${text}` : text));
    const support = wire['Переданные сведения об обстановке'];
    assert.match(JSON.stringify(support), /У берега лежат мокрые обломки/u);
    assert.match(JSON.stringify(support), /Под ногами влажная земля/u);
    assert.match(JSON.stringify(support), /Тропа к лесу/u);
    assert.match(JSON.stringify(support), /Мирон пришёл к берегу утром/u);
    assert.doesNotMatch(wireText,
      /"(?:version|schema|request_id|surface|no_new_world_facts|action_intent)"/u);
    if (call.role_id === 'gameplay_narrator_auditor') {
      assert.equal(wire['Контекст намерения для проверки'],
        'Потом Мирон мог бы уйти по тропе.');
    } else {
      assert.equal(Object.hasOwn(wire, 'Контекст намерения для проверки'), false);
      assert.doesNotMatch(wireText, /Потом Мирон мог бы уйти по тропе/u);
    }
    if (call.role_id === 'gameplay_narrator') {
      assert.match(instruction, /имени/u);
      assert.match(instruction, /не сообщай о несделанном|не рассказывай о несделанном|несделанный шаг не рассказывай как событие/u);
      return { output: { prose: inventedProse } };
    }
    if (call.role_id === 'gameplay_narrator_auditor') {
      assert.match(instruction, /(?:мелк\p{L}* движени|фоновы\p{L}* звук)/iu);
      assert.match(instruction, /(?:нов\p{L}* факт\p{L}* мир|добавля\p{L}* к мир)/iu);
      assert.match(instruction, /(?:поступк\p{L}*[^.]{0,100}не выбирал|невыполненн\p{L}*[^.]{0,100}выполненн|не совершает невыбранных игроком поступков)/iu);
      const segments = wire['Отрывки прозы'];
      const ids = segments.map(({ segment_id }) => segment_id);
      const audit = reviewedNarration(segments,
        Object.fromEntries(visibleContext.visible_changes.map((_, index) =>
          [`visible_change_${index + 1}`, ids])));
      if (calls.filter((role) => role === 'gameplay_narrator_auditor').length === 1) {
        audit.unsupported = [{ segment_choice: ids[0], kind: 'unsupported_attempt',
          reason: 'Неподтверждённый уход по тропе.' }];
        audit.evidence = [];
      }
      return { output: audit };
    }
    if (call.role_id === 'gameplay_narrator_semantic_repair') {
      assert.match(instruction, /(?:поступк\p{L}*[^.]{0,100}не выбирал|невыполненн\p{L}*[^.]{0,100}выполненн|не совершает невыбранных игроком поступков)/iu);
      return { output: { replacements: [{ prose: groundedProse }] } };
    }
    assert.fail(`Unexpected role ${call.role_id}`);
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: 'd102-literary-prose', surface: 'turn', actor,
    visible_context: visibleContext,
    context: { attempt: { text: 'Потом Мирон мог бы уйти по тропе.' } } });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, groundedProse);
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
});

test('D102 format repair keeps the same world/story boundary without a prose exemplar', async () => {
  const calls = [];
  const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const instruction = call.messages[0].content;
    assertLiteraryBoundary(instruction);
    assert.equal(instruction.split(WORLD_STORY_BOUNDARY).length, 2);
    if (call.role_id === 'gameplay_narrator') return { output: { prose: 3 } };
    if (call.role_id === 'gameplay_narrator_format_repair') {
      return { output: { prose: groundedProse } };
    }
    if (call.role_id === 'gameplay_narrator_auditor') {
      const segments = JSON.parse(call.messages[1].content)['Отрывки прозы'];
      return { output: reviewedNarration(segments,
        { visible_change_1: ['s1'], visible_change_2: ['s1'] }) };
    }
    assert.fail(`Unexpected role ${call.role_id}`);
  } } });
  const result = await service.run({ version: 1, schema: 'narration_request',
    request_id: 'd102-format-prose', surface: 'turn', actor,
    visible_context: visibleContext });
  assert.equal(result.status, 'approved');
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_format_repair',
    'gameplay_narrator_auditor']);
});
