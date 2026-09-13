import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';

test('non-dense unseen workshop inspection requires a governed observation cluster', async (t) => {
  const changes = ['Вы подробно осмотрели мастерскую.',
    'На верстаке лежит резец.', 'Под окном темнеют стружки.'];
  const catalogue = changes.join(' ');
  const governed = 'Подробно осматривая мастерскую, вы видите резец на верстаке; под окном темнеют стружки.';
  for (const [prose, accepted] of [[catalogue, false], [governed, true]]) {
    await t.test(accepted ? 'governed cluster passes' : 'action stub plus catalogue fails', async () => {
      const calls = [];
      const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
        calls.push(call.role_id);
        const wire = JSON.parse(call.messages[1].content);
        if (call.role_id === 'gameplay_narrator') {
          assert.match(call.messages[0].content, /whether the current beat is dense or not/u);
          return { output: { prose: catalogue } };
        }
        if (call.role_id === 'gameplay_narrator_semantic_repair') {
          assert.match(call.messages[0].content, /whether dense or not/u);
          return { output: { replacements: [{ prose }] } };
        }
        assert.match(call.messages[0].content, /including a\s+non-dense beat/u);
        const initial = wire.phase === 'initial';
        return { output: review(wire, initial || !accepted) };
      } } });
      const result = await service.run({ version: 1, schema: 'narration_request',
        request_id: `non-dense-workshop-${accepted}`, surface: 'turn', visible_context: {
          version: 1, schema: 'visible_context_package', visible_scene: 'мастерская',
          visible_changes: changes, uncertainties: [], sensory_details: [], visible_npc: [],
          visible_objects: [], known_context: [], allowed_tensions: [], do_not_imply: []
        }, context: {} });
      assert.equal(result.status, accepted ? 'approved' : 'blocked');
      assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor',
        'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor']);
    });
  }
});

test('exact shore inspection shape rejects its former factual catalogue', async (t) => {
  const changes = ['Вы подробно осмотрели место крушения.',
    'На берегу лежат обломки разбитой лодки.', 'В мокром песке видны босые следы.',
    'Рядом заметен отдельный след сапога.', 'Одежда осталась мокрой, а дрожь усилилась.'];
  const uncertainty = 'Наблюдения сами по себе не устанавливают виновника или мотив.';
  const former = `${changes.join(' ')} ${uncertainty}`;
  const repaired = 'Подробно осмотрев место крушения, вы заметили на берегу обломки разбитой лодки и в мокром песке — босые следы; рядом виден отдельный след сапога. Одежда осталась мокрой, а дрожь усилилась. Наблюдения сами по себе не устанавливают виновника или мотив.';
  for (const [prose, accepted] of [[former, false], [repaired, true]]) {
    await t.test(accepted ? 'repaired focal inspection passes' : 'former approved catalogue fails', async () => {
      const service = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
        const wire = JSON.parse(call.messages[1].content);
        if (call.role_id === 'gameplay_narrator') return { output: { prose: former } };
        if (call.role_id === 'gameplay_narrator_semantic_repair') {
          return { output: { replacements: [{ prose }] } };
        }
        return { output: review(wire, wire.phase === 'initial' || !accepted) };
      } } });
      const result = await service.run({ version: 1, schema: 'narration_request',
        request_id: `shore-inspection-${accepted}`, surface: 'turn', visible_context: {
          version: 1, schema: 'visible_context_package', visible_scene: 'берег крушения',
          visible_changes: changes, uncertainties: [uncertainty], sensory_details: [], visible_npc: [],
          visible_objects: [], known_context: [], allowed_tensions: [], do_not_imply: []
        }, context: {} });
      assert.equal(result.status, accepted ? 'approved' : 'blocked');
      if (accepted) assert.equal(result.approved_output.prose, repaired);
    });
  }
});

function review(wire, failed) {
  const ids = wire.segments.map(({ segment_id }) => segment_id);
  return { reviewed_segments: ids,
    source_reviews: wire.required_current_beat.changes.concat(wire.required_current_beat.uncertainties)
      .map(({ ref }) => ({ ref, segment_choices: ids })),
    unsupported: [], literary_failures: failed ? [{ check: 'weak_literary_composition',
      segment_choice: 's1', reason: 'Inspection action is only a stub before independent observations.' }] : [],
    evidence: failed ? [] : ['The inspection governs the supplied workshop observations.'] };
}
