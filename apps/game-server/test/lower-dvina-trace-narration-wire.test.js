import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLowerDvinaTraceNarrationService } from '../src/runtime/lower-dvina-trace-narration-llm.js';
import { reviewedNarration } from './narration-audit-fixture.js';

test('captured live snapshot candidates cannot displace the current speech and pending intent', async () => {
  const { visible_context, prose } = JSON.parse(await readFile(new URL(
    './fixtures/narration-current-beat.json', import.meta.url), 'utf8'));
  const candidates = [...visible_context.sensory_details, ...visible_context.visible_objects,
    ...visible_context.known_context, visible_context.visible_scene];
  assert.equal(candidates.length, 23);
  let calls = 0;
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls += 1;
    const wire = JSON.parse(call.messages[1].content);
    assert.deepEqual(wire.optional_support, { visible_scene: visible_context.visible_scene, sensory_details: visible_context.sensory_details });
    assert.deepEqual(wire.required_current_beat.changes.map(({ text }) => text), visible_context.visible_changes);
    assert.deepEqual(wire.required_current_beat.uncertainties.map(({ text }) => text), visible_context.uncertainties);
    if (call.role_id === 'gameplay_narrator') return { output: {
      prose, action_options: [], used_references: [] } };
    return { output: {} };
  } } });
  const result = await narrator.run({ version: 1, schema: 'narration_request',
    request_id: 'captured-static-candidates', surface: 'turn', visible_context, context: {} });
  assert.equal(result.status, 'blocked');
  assert.equal(calls, 2);
});

test('private prose wire admits only scene and sensory support beside a current beat', async (t) => {
  const cases = [
    { name: 'physical result and body with a pending second action',
      changes: ['Сухой конец жерди отломлен.', 'Одежда стала менее мокрой.'],
      uncertainties: ['Перевязать отломленный конец вы ещё не успели; результат неизвестен.'],
      prose: 'Вы отломили сухой конец жерди; одежда стала менее мокрой, а перевязать конец вы ещё не успели — результат пока неизвестен, и можно продолжить или передумать.' },
    { name: 'arrival with near, far and NPC support',
      changes: ['Вы вышли на пристань.', 'Рядом стоят мокрые сваи; вдали темнеет лес; у навеса виден Еремей.'], uncertainties: [],
      prose: 'Вы выходите на пристань: рядом стоят мокрые сваи, вдали темнеет лес, а у навеса виден Еремей.',
      sensory: ['Рядом стоят мокрые сваи.', 'Вдали темнеет лес.'],
      npcs: [{ entity_ref: { entity_kind: 'npc', entity_id: 'eremey' },
        display_label: 'Еремей', recognition: 'known', visible_status: 'Виден у навеса.' }],
      outcome: { movement_committed: true } },
    { name: 'scene-only perception retains descriptive support', changes: [], uncertainties: [],
      sensory: ['Рядом стоят мокрые сваи.'], prose: 'Рядом стоят мокрые сваи.' },
    { name: 'qualitative assessment excludes unchanged scene support',
      changes: ['Сухое укрытие сейчас важнее дальнейшего осмотра.'], uncertainties: [],
      sensory: ['Рядом стоят мокрые сваи.'],
      prose: 'Сейчас важнее искать сухое укрытие, чем продолжать осмотр.',
      outcome: { qualitative_assessment: true } }
  ];
  for (const sample of cases) await t.test(sample.name, async () => {
    const visible = { version: 1, schema: 'visible_context_package',
      visible_scene: 'Тёмная речная вода.', visible_changes: sample.changes,
      uncertainties: sample.uncertainties, sensory_details: sample.sensory ?? [],
      visible_npc: sample.npcs ?? [], visible_objects: [],
      known_context: ['На поясе хозяйственный нож.'],
      allowed_tensions: ['Сдержанное внимание.'], do_not_imply: ['Скрытое содержимое неизвестно.'] };
    const original = structuredClone(visible);
    const style = { tone: 'restrained' };
    const outcome = sample.outcome ?? {};
    const { visible_changes, uncertainties, allowed_tensions, do_not_imply, ...support } = visible;
    const calls = [];
    const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
      calls.push(call.role_id);
      const wire = JSON.parse(call.messages[1].content);
      assert.equal(Object.hasOwn(wire, 'visible_context'), false);
      assert.deepEqual(wire.optional_support, visible_changes.length || uncertainties.length
        ? sample.outcome?.qualitative_assessment === true ? {}
          : { visible_scene: visible.visible_scene, sensory_details: visible.sensory_details }
        : support);
      assert.deepEqual(wire.constraints, { allowed_tensions, do_not_imply, style_policy: style });
      assert.deepEqual(wire.required_current_beat.changes,
        visible_changes.map((text, index) => ({ ref: `visible_change_${index + 1}`, text })));
      assert.deepEqual(wire.required_current_beat.uncertainties,
        uncertainties.map((text, index) => ({ ref: `uncertainty_${index + 1}`, text,
          status: 'unperformed_result_unknown' })));
      assert.deepEqual(wire.confirmed_outcome, outcome);
      for (const text of [...visible_changes, ...uncertainties]) {
        assert.equal(call.messages[1].content.split(JSON.stringify(text)).length - 1, 1);
      }
      assert.equal(Object.hasOwn(wire, 'action_intent'), false);
      assert.deepEqual(call.overrides, { temperature: 0 });
      if (call.role_id === 'gameplay_narrator') {
        assert.match(call.messages[0].content,
          /never recast it as present or past action/u);
        assert.match(call.messages[0].content,
          /bare statement of intention[\s\S]*action has not happened yet[\s\S]*result is still unknown/u);
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        assert.match(call.messages[0].content,
          /unperformed_result_unknown[\s\S]*Never attribute it to an NPC[\s\S]*not unsupported_attempt/u);
        assert.doesNotMatch(call.messages[0].content, /Never\s+Treat a required_current_beat uncertainty/u);
      }
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: sample.prose, action_options: [], used_references: [] } };
      const refs = [...wire.required_current_beat.changes, ...wire.required_current_beat.uncertainties];
      return { output: { ...reviewedNarration(wire.segments,
        Object.fromEntries(refs.map(({ ref }) => [ref, ['s1']]))),
        evidence: ['The current beat is grounded and optional context is selected.'] } };
    } } });
    const result = await narrator.run({ version: 1, schema: 'narration_request',
      request_id: sample.name, surface: 'turn', visible_context: visible,
      style_policy: style, context: { outcome } });
    assert.equal(result.status, 'approved');
    assert.deepEqual(result.approved_output.self_check, {});
    assert.deepEqual(visible, original);
    assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
  });
});


for (const sample of [
  { name: 'captured integrated five-minute probing',
    change: 'Вы осторожно прощупывали длинной ветвью воду между обломками; результат наблюдения не установлен.',
    relevant: 'У воды лежат мокрые обломки.', other: ['Над берегом низкое серое небо.', 'За ивняком начинается тропа.'],
    prose: 'Между мокрыми обломками вы осторожно прощупываете воду длинной ветвью; что скрывается под ними, пока неизвестно.' },
  { name: 'unseen integrated contact beside a rough bowl',
    change: 'Вы проводили сухим лоскутом по краю глиняной чаши; результат наблюдения не установлен.',
    relevant: 'Край глиняной чаши шероховатый.', other: ['За дверью виден двор.', 'У стены лежат поленья.'],
    prose: 'По шероховатому краю глиняной чаши вы проводите сухим лоскутом; что это позволило заметить, пока неизвестно.' }
]) test(`${sample.name}: sensory selection supports sparse action, unchanged dump fails`, async () => {
  for (const dump of [false, true]) {
    const visible = { version: 1, schema: 'visible_context_package', visible_scene: 'Текущее место',
      visible_changes: [sample.change], uncertainties: [], sensory_details: [sample.relevant, ...sample.other],
      visible_npc: [], visible_objects: [], known_context: ['Старая история героя.'],
      allowed_tensions: [], do_not_imply: [] };
    const calls = [];
    const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
      calls.push(call.role_id);
      const wire = JSON.parse(call.messages[1].content);
      assert.deepEqual(wire.optional_support, { visible_scene: visible.visible_scene, sensory_details: visible.sensory_details });
      assert.match(call.messages[0].content, /Turn duration is code-owned UI metadata/u);
      assert.match(call.messages[0].content, call.role_id === 'gameplay_narrator_auditor'
        ? /recap of unchanged\s+support is static_context_dump/u
        : /do not recap unchanged scene/u);
      if (call.role_id === 'gameplay_narrator') {
        assert.match(call.messages[0].content, /Source order alone is not a failure/u);
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        assert.match(call.messages[0].content,
          /qualitative assessment[\s\S]*counts as a perceived result/u);
      }
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: dump ? `${sample.prose} ${visible.sensory_details.join(' ')}` : sample.prose,
        action_options: [], used_references: [] } };
      if (call.role_id === 'gameplay_narrator_semantic_repair') {
        assert.ok(wire.concerns.some(({ kind }) => kind === 'literary_quality'));
        return { output: { replacements: [{ prose: sample.prose }] } };
      }
      const ids = wire.segments.map(({ segment_id }) => segment_id);
      const pass = !dump || wire.phase === 'final';
      const reason = 'Неизменённые детали пересказаны списком; неотносящиеся к контакту факты отвлекают от физического эпизода.';
      const audit = { ...reviewedNarration(wire.segments, { visible_change_1: ids }),
        literary_failures: pass ? [] : [{ check: 'static_context_dump',
          segment_choice: ids.at(-1), reason }],
        evidence: pass
          ? ['Подтверждённое движение составляет физический эпизод без служебного времени.']
          : [] };
      return { output: audit };
    } } });
    const result = await service.run({ version: 1, schema: 'narration_request', request_id: `${sample.name}-${dump}`,
      surface: 'turn', visible_context: visible, context: {} });
    assert.equal(result.status, 'approved');
    assert.equal(result.approved_output.prose, sample.prose);
    assert.deepEqual(calls, dump ? ['gameplay_narrator', 'gameplay_narrator_auditor',
      'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor'] : ['gameplay_narrator', 'gameplay_narrator_auditor']);
  }
});
