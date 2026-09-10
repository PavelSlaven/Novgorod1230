import assert from 'node:assert/strict';
import test from 'node:test';
import { loadScenarioBundle, fixture } from './lower-dvina-trace-phase-2-fixture.js';
import { createLowerDvinaTraceTurnStepVisibleProjector } from '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';
import { enrichLowerDvinaTraceVisibleNpcCues } from '../src/runtime/lower-dvina-trace-turn-step-current-scene-npc-cues.js';
import { projectLowerDvinaTracePlayerSafeState } from '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { nextState } from '../src/infrastructure/postgres/lower-dvina-trace-phase-3-state.js';
import { projectKnownContext } from '../src/runtime/lower-dvina-trace-player-safe-world.js';

const scene = () => ({ schema: 'visible_context_package', version: 1,
  visible_scene: 'Площадка у мельницы', visible_changes: [], sensory_details: ['На земле лежит солома.'],
  visible_npc: [], visible_objects: [], known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] });
const clock = minute => ({ whole_minutes: String(333060 + minute), subminute_numerator: '0', subminute_denominator: '1' });
const bundle = await loadScenarioBundle(13);

test('condition order is not a bodily event and unchanged symptoms stay supporting context', () => {
  const wet = { id: 'wet', status: 'active' };
  const headache = { id: 'headache', status: 'active' };
  const committedState = { body_state: { active_conditions: [wet, headache] } };
  const unchanged = enrichLowerDvinaTraceVisibleNpcCues({ visibleContext: scene(), committedState,
    bodyAfter: { active_conditions: [{ status: 'active', id: 'headache' }, wet] } });
  assert.deepEqual(unchanged.visible_changes, []);
  const changed = enrichLowerDvinaTraceVisibleNpcCues({ visibleContext: scene(), committedState,
    bodyAfter: { active_conditions: [headache, { id: 'damp', status: 'active' }] } });
  assert.equal(changed.visible_changes.length, 1);
  assert.doesNotMatch(changed.visible_changes[0], /headache/u);
  assert.match(changed.visible_changes[0], /wet.*damp/u);
  assert.ok(changed.known_context.some(value => value.includes('headache')));
});

test('a remembered player utterance is not recast as received testimony', () => {
  const known = projectKnownContext({ actor_id: 'player' }, [], [
    { speaker_actor_id: 'player', content: 'Я не знаю дороги.' },
    { speaker_actor_id: 'other', content: 'Я видел лодку.' }
  ]);
  assert.deepEqual(known, ['В прежнем разговоре вы сказали: Я не знаю дороги.',
    'Содержание сообщения из прежнего разговора: Я видел лодку.']);
});

test('final current body and calendar replace their earlier context on authored and generic results', async () => {
  const state = { actor_id: 'player', player_profile: {}, clock: clock(0),
    body_state: { active_conditions: [{ id: 'wet', status: 'active', storage_condition_id: 'PRIVATE_STORAGE' },
      { id: 'wrist_discomfort', label: 'Ноет запястье', status: 'active' }] } };
  const before = enrichLowerDvinaTraceVisibleNpcCues({ visibleContext: scene(), committedState: state,
    calendarProfile: bundle.calendar_profile });
  assert.ok(before.known_context.some(value => value.includes('07:00')));
  const bodyAfter = { active_conditions: [{ id: 'damp', status: 'active' }] };
  for (const consequence of [{ phase4_kind: 'movement' }, {}]) {
    const projector = createLowerDvinaTraceTurnStepVisibleProjector({ calendarProfile: bundle.calendar_profile,
      fallback: { project: async () => before } });
    const output = await projector.project({ retrieved_state: state, consequence,
      body_update: { state_after: bodyAfter }, time_update: { clock_after: clock(15) } });
    assert.ok(output.known_context.some(value => value.includes('07:15')));
    assert.doesNotMatch(JSON.stringify(output.known_context), /07:00|wrist_discomfort|"wet"|PRIVATE_STORAGE/u);
    assert.ok(output.known_context.some(value => value.includes('damp')));
    assert.ok(output.visible_changes.some(value => value.includes('wrist_discomfort') && value.includes('damp')));
    assert.deepEqual(output.sensory_details, before.sensory_details);
    assert.equal(output.visible_scene, before.visible_scene);
  }
  assert.equal(state.body_state.active_conditions[0].id, 'wet');
});

test('actual authored conversation snapshot delivers attributed player journal but never NPC private memory', () => {
  const state = fixture({ scenarioBundle: bundle, materializationBundle: bundle }).state;
  const journal = bundle.knowledge_lie_memory_rules.player_facing_text_records[0];
  const memory = bundle.knowledge_lie_memory_rules.memory_records[0];
  const conversation = { activity_ref: 'conversation', npc_id: 'known-speaker',
    statement_ref: journal.source_statement_ref, memory_ref: memory.memory_template_id,
    journal_ref: journal.journal_template_id, memory_text: memory.summary_text,
    journal_text: journal.summary_text, decision: { trace: {} }, statement_is_new: true };
  const factual = { player_input: { request_id: 'talk', idempotency_key: 'talk', raw_text: 'Спросить о пути.' },
    mode_resolution: { option_id: 'talk', decision_trace: {} }, availability: { check_requests: [] },
    body_update: { applied: false },
    time_update: { clock_before: state.clock, clock_after: clock(5) },
    consequence: { phase3_kind: 'conversation', conversation, duration_minutes: 5 } };
  const committed = nextState({ state, factual, nextVersion: 1, turnNumber: 1,
    inputDigest: 'input', changeSetId: 'change' });
  assert.equal(committed.interactions[0].memory_text, memory.summary_text);
  for (const loaded of [committed, JSON.parse(JSON.stringify(committed))]) {
    const safe = projectLowerDvinaTracePlayerSafeState({ committed_state: loaded, actor_id: loaded.actor_id });
    assert.equal(safe.player_safe_state.interactions[0].speaker_actor_id, 'known-speaker');
    assert.equal(safe.player_safe_state.interactions[0].content, journal.summary_text);
    const visible = enrichLowerDvinaTraceVisibleNpcCues({ visibleContext: scene(), committedState: loaded });
    assert.ok(visible.known_context.some(value => value.includes(journal.summary_text)));
    assert.equal(JSON.stringify([safe, visible]).includes(memory.summary_text), false);
    assert.deepEqual(visible.visible_npc, []);
  }
});
