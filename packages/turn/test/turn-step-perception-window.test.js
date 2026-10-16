import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTurnStepDraftConsequence } from
  '../src/turn-step-workflow-draft.js';

const at = (whole_minutes) => ({ whole_minutes: String(whole_minutes),
  subminute_numerator: '0', subminute_denominator: '1' });
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const window = (time, event, npc) => ({
  kind: 'post_applied_perception_window',
  status: 'pending_npc_decision',
  observable_response_event_refs: [],
  pending_npc_decision_refs: [npc],
  moments: [{ occurred_at: at(time),
    event_refs: [ref('sound_event', event)],
    pending_npc_decision_refs: [npc] }]
});

test('root loop consequence merges one perception window and preserves moments', () => {
  const result = buildTurnStepDraftConsequence({ loop_result: {
    status: 'resolved', completed_steps: [], clarification: null,
    consequence_fragments: [
      { visible_seed: { turn_step_post_applied_perception_window:
        window(10, 'event-1', 'npc-1') } },
      { visible_seed: { turn_step_post_applied_perception_window:
        window(10, 'event-2', 'npc-2') } },
      { visible_seed: { turn_step_post_applied_perception_window:
        window(11, 'event-3', 'npc-1') } }
    ]
  } });
  const perceptionWindow = result.visible_seed
    .turn_step_post_applied_perception_window;

  assert.equal(perceptionWindow.status, 'pending_npc_decision');
  assert.deepEqual(perceptionWindow.pending_npc_decision_refs,
    ['npc-1', 'npc-2']);
  assert.equal(perceptionWindow.moments.length, 2);
  assert.deepEqual(perceptionWindow.moments[0], {
    occurred_at: at(10),
    event_refs: [ref('sound_event', 'event-1'), ref('sound_event', 'event-2')],
    pending_npc_decision_refs: ['npc-1', 'npc-2']
  });
  assert.deepEqual(perceptionWindow.moments[1], {
    occurred_at: at(11),
    event_refs: [ref('sound_event', 'event-3')],
    pending_npc_decision_refs: ['npc-1']
  });
});

test('empty listener windows merge without inventing pending references', () => {
  const emptyWindow = {
    kind: 'post_applied_perception_window', status: 'completed',
    observable_response_event_refs: [], moments: []
  };
  const result = buildTurnStepDraftConsequence({ loop_result: {
    status: 'resolved', completed_steps: [], clarification: null,
    consequence_fragments: [
      { visible_seed: { turn_step_post_applied_perception_window: emptyWindow } },
      { visible_seed: { turn_step_post_applied_perception_window: emptyWindow } }
    ]
  } });

  assert.deepEqual(result.visible_seed.turn_step_post_applied_perception_window,
    emptyWindow);
});
