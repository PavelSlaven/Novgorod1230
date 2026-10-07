import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichLowerDvinaTraceVisibleNpcCues } from
  '../src/runtime/lower-dvina-trace-turn-step-current-scene-npc-cues.js';
import { narrationWire, assembleNarrationRoleOutput } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { narrationSources } from
  '../src/runtime/lower-dvina-trace-narration-audit-values.js';
import { reviewedNarration } from './narration-audit-fixture.js';

// D102: authored on 7cd3c93c before the CA-UI-01 production fix; pin this file.
const playerChange = 'Вы поправили пояс.';
const summary = 'Прерывает работу для короткого отдыха.';
const npcIds = ['npc:ca2-fisher-1', 'npc:ca2-fisher-2'];
const sourceRefs = ['visible_change_1', 'visible_change_2', 'visible_change_3'];
const scene = (extra = {}) => ({
  version: 1, schema: 'visible_context_package',
  visible_scene: 'Площадка у мельницы.', visible_changes: [],
  sensory_details: [], visible_npc: [], visible_objects: [], known_context: [],
  uncertainties: [], allowed_tensions: [], do_not_imply: [], ...extra
});
const narratorRequest = (visible_context) => ({
  version: 1, schema: 'narration_request', request_id: 'ca-ui-01',
  surface: 'turn', visible_context, context: {}
});

function transition(npc_id, minute) {
  return { npc_routine_transition: {
    npc_id, occurred_at: { whole_minutes: String(minute),
      subminute_numerator: '0', subminute_denominator: '1' },
    proposal: { factual_transition: { summary } },
    after: { npc_id, causal_state_ref: { routine_state: { status: 'inactive' } },
      npc_snapshot: { machine_state: { current_activity: { summary } } } }
  } };
}

function observedScene(proposals) {
  const visible_npc = npcIds.map((entity_id) => ({
    entity_ref: { entity_kind: 'npc', entity_id }, display_label: 'рыбак'
  }));
  return enrichLowerDvinaTraceVisibleNpcCues({
    visibleContext: scene({ visible_npc, visible_changes: [playerChange] }),
    committedState: {
      current_visible_context: scene({ visible_npc }),
      npcs: npcIds.map((instance_id) => ({ instance_id,
        machine_state: { current_activity: { summary: 'Чинит сети.' } } }))
    }, temporalResults: [{ combined_change_set: { proposals } }]
  });
}

test('CA-UI-01: equal NPC facts at different boundaries retain separate mandatory sources', async (t) => {
  // A repeated proposal at boundary 1 must not count as a second participant.
  const projected = observedScene([
    transition(npcIds[0], 1), transition(npcIds[0], 1),
    transition(npcIds[1], 2)
  ]);
  const request = narratorRequest(projected);

  await t.test('projection preserves both equal facts after the player action', () => {
    assert.equal(projected.visible_changes.length, 3);
    assert.equal(projected.visible_changes[0], playerChange);
    assert.equal(projected.visible_changes[1], projected.visible_changes[2]);
    for (const cue of projected.visible_changes.slice(1)) {
      assert.match(cue, /^1 человек(?:\s|$)/u);
      assert.ok(cue.includes('рыбак'));
      assert.ok(cue.includes(summary));
    }
  });

  await t.test('writer receives two equal texts with distinct source refs', () => {
    const wire = narrationWire(request);
    assert.deepEqual(wire.required_current_beat.changes.map(({ ref }) => ref),
      sourceRefs);
    assert.deepEqual(wire.required_current_beat.changes.map(({ text }) => text),
      projected.visible_changes);
    assert.doesNotMatch(JSON.stringify(wire),
      /npc:ca2|occurred_at|whole_minutes|subminute_numerator|subminute_denominator/u);
  });

  await t.test('auditor requires independent coverage for the second NPC fact', () => {
    const sources = narrationSources(request);
    assert.deepEqual(sources.map(({ key }) => key), sourceRefs);
    assert.deepEqual(sources.map(({ source_index }) => source_index), [0, 1, 2]);
    assert.ok(sources.every(({ field }) => field === 'visible_changes'));
    assert.deepEqual(sources.map(({ text }) => text), projected.visible_changes);
    const segments = [{ segment_id: 's1' }];
    const auditRequest = { ...request, segments };
    const complete = Object.fromEntries(sourceRefs.map((ref) => [ref, ['s1']]));
    assert.equal(assembleNarrationRoleOutput('gameplay_narrator_auditor',
      reviewedNarration(segments, complete), auditRequest).pass, true);
    const omitted = assembleNarrationRoleOutput('gameplay_narrator_auditor',
      reviewedNarration(segments, { ...complete, visible_change_3: [] }), auditRequest);
    assert.equal(omitted.pass, false);
    assert.deepEqual(omitted.coverage.visible_changes[2], {
      source_index: 2, segment_ids: []
    });
    assert.ok(omitted.concerns.some(({ kind }) => kind === 'missing_visible_change'));
  });

  await t.test('duplicate proposals within one boundary retain one participant', () => {
    const duplicate = observedScene([
      transition(npcIds[0], 1), transition(npcIds[0], 1)
    ]);
    assert.equal(duplicate.visible_changes.length, 2);
    assert.match(duplicate.visible_changes[1], /^1 человек(?:\s|$)/u);
    assert.equal(narrationWire(narratorRequest(duplicate))
      .required_current_beat.changes.length, 2);
    assert.equal(narrationSources(narratorRequest(duplicate)).length, 2);
  });
});
