import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProviderRequestPayload } from
  '../../../packages/llm-runtime/src/provider-request.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { withPhase3Conversation } from
  '../src/runtime/lower-dvina-trace-phase-3-visible.js';
import { compatNarrationWire, reviewedNarration } from './narration-audit-fixture.js';

const player = { entity_kind: 'player_character', entity_id: 'player' };
const actors = ['npc-a', 'npc-b', 'npc-c'].map((instance_id) => ({
  instance_id, ref: `slot:${instance_id}`
}));
const utterance = 'Я видел лодку.';

const appearanceCues = [
  { identity: { appearance: { hair: { color: 'gray', length: 'medium' } } } },
  { identity: { appearance: { hair: { color: 'black', length: 'short' } } } },
  { identity: { appearance: { hair: { color: 'auburn', length: 'long' } } } }
];

test('group speech attributes identical replies by visible appearance', () => {
  const visible = projectGroupReplies(appearanceCues);

  assert.deepEqual(visible.visible_changes, [
    'человек, седые волосы средней длины говорит: «Я видел лодку.»',
    'человек, короткие чёрные волосы говорит: «Я видел лодку.»',
    'человек, длинные рыжие волосы говорит: «Я видел лодку.»'
  ]);
});

test('group speech keeps repeated replies without synthetic speaker numbers', () => {
  const visible = projectGroupReplies([null, null, null]);

  assert.deepEqual(visible.visible_changes, [
    'человек говорит: «Я видел лодку.»',
    'человек говорит: «Я видел лодку.»',
    'человек говорит: «Я видел лодку.»'
  ]);
  assert.ok(visible.visible_changes.every((line) => !/\(\d+\)/u.test(line)));
  assert.ok(visible.visible_npc.every(({ display_label }) =>
    !/\(\d+\)/u.test(display_label)));
});

test('group speech reaches production writer payload with cues and repeated replies', async (t) => {
  const cases = [
    { name: 'appearance cues reach writer payload', cues: appearanceCues, expected: [
      'человек, седые волосы средней длины говорит: «Я видел лодку.»',
      'человек, короткие чёрные волосы говорит: «Я видел лодку.»',
      'человек, длинные рыжие волосы говорит: «Я видел лодку.»'
    ] },
    { name: 'three unlabelled replies reach writer payload',
      cues: [null, null, null], expected: [
      'человек говорит: «Я видел лодку.»',
      'человек говорит: «Я видел лодку.»',
      'человек говорит: «Я видел лодку.»'
    ] }
  ];

  for (const { name, cues, expected } of cases) {
    await t.test(name, async () => {
      const visible = projectGroupReplies(cues);
      const calls = [];
      const narrator = createLowerDvinaTraceNarrationService({ roleRunner: {
        async run(call) {
          calls.push(call);
          const wire = compatNarrationWire(JSON.parse(call.messages[1].content));
          if (call.role_id === 'gameplay_narrator') return { output: {
            prose: 'Люди ответили.', action_options: [], used_references: []
          } };
          const refs = wire.required_current_beat.changes.map(({ ref }) => ref);
          return { output: reviewedNarration(wire.segments,
            Object.fromEntries(refs.map((ref) => [ref, ['s1']]))) };
        }
      } });

      const result = await narrator.run({ version: 1, schema: 'narration_request',
        request_id: `issue-462-group-writer-wire-${name}`, surface: 'turn',
        visible_context: visible, context: {} });
      assert.equal(result.status, 'approved');

      const writer = calls.find(({ role_id }) => role_id === 'gameplay_narrator');
      assert.ok(writer);
      const payload = buildProviderRequestPayload({ model: 'test-model',
        maxTokens: 20_000, responseFormat: { type: 'json_object' },
        compatibility: 'openai_compatible', thinking: { type: 'disabled' },
        temperature: 0, topP: 1 }, writer.messages);
      const writerInput = compatNarrationWire(JSON.parse(payload.messages[1].content));
      assert.deepEqual(writerInput.required_current_beat.changes.map(
        ({ text }) => text), expected);
      assert.equal(writerInput.required_current_beat.changes.length, 3);
      assert.doesNotMatch(payload.messages[1].content, /\(\d+\)/u);
    });
  }
});

function projectGroupReplies(cues) {
  const playerStatement = {
    entity_kind: 'conversation_statement', entity_id: 'statement-player'
  };
  const replies = actors.map(({ instance_id }, index) => ({
    statement_id: `statement-${index}`,
    speaker_ref: { entity_kind: 'npc', entity_id: instance_id },
    utterance_text: utterance
  }));
  const visibleNpcs = actors.map(({ instance_id }, index) => ({
    entity_ref: { entity_kind: 'npc', entity_id: instance_id },
    display_label: 'человек', recognition: 'unrecognized',
    ...(cues[index] == null ? {} : { observable_cues: cues[index] })
  }));
  const input = {
    consequence: { conversation: { semantic_exchange: {
      response_kind: 'speech',
      decision_request: { npc_ref: replies[0].speaker_ref,
        perceived_message: { source_statement_ref: playerStatement } },
      decisions: replies.map((reply, index) => ({ request: {
        request_id: `request-${index}`, npc_ref: reply.speaker_ref,
        perceived_message: { source_statement_ref: playerStatement }
      } })),
      npc_outcomes: replies.map((reply, index) => ({
        request_id: `request-${index}`, applied: true,
        contribution_ref: { entity_kind: 'conversation_statement',
          entity_id: reply.statement_id }
      })),
      statements: [{ statement_id: playerStatement.entity_id,
        speaker_ref: player, intended_addressee_refs: actors.map(
          ({ instance_id }) => ({ entity_kind: 'npc', entity_id: instance_id }))
      }, ...replies],
      audiences: replies.map((reply) => ({
        statement_ref: { entity_kind: 'conversation_statement',
          entity_id: reply.statement_id },
        received_messages: [{ listener_ref: player, comprehension: 'full',
          utterance_text: reply.utterance_text }]
      }))
    } } },
    retrieved_state: { current_visible_context: {
      visible_scene: 'рыбацкий стан', visible_npc: visibleNpcs
    } }
  };
  return withPhase3Conversation({ input,
    contracts: { actors, ids: {} }, movement: {
      version: 1, schema: 'visible_context_package', visible_scene: 'стан',
      visible_changes: [], sensory_details: [], visible_npc: visibleNpcs,
      visible_objects: [], known_context: [], uncertainties: [],
      allowed_tensions: [], do_not_imply: []
    } });
}
