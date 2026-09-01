import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { createLowerDvinaTraceTurnStepPlayerSafeProjector } from
  '../src/runtime/lower-dvina-trace-phase-2-player-safe.js';
import { richCommittedState } from
  './lower-dvina-trace-player-safe-state-fixture.js';

function conversationState() {
  const committedState = richCommittedState();
  committedState.position = { location_ref: 'camp', g5_anchor_id: 'camp-anchor' };
  committedState.npcs = [{ instance_id: 'eremey', location_ref: 'camp',
    identity_state: { canonical_name: 'Еремей' } }, { instance_id: 'fisher', location_ref: 'camp' }];
  committedState.current_visible_context = {
    visible_scene: 'У костра ждут ответа.', visible_npc: [
      { entity_ref: { entity_kind: 'npc', entity_id: 'eremey' }, display_label: 'Еремей' },
      { entity_ref: { entity_kind: 'npc', entity_id: 'fisher' }, display_label: 'Рыбак' }
    ]
  };
  committedState.conversation_sessions = [{ schema: 'conversation_session_v1', conversation_id: 'conversation-1',
    status: 'active', location_ref: { entity_kind: 'location', entity_id: 'camp' },
    active_participant_refs: [{ entity_kind: 'player_character', entity_id: 'mikula' },
      { entity_kind: 'npc', entity_id: 'eremey' }, { entity_kind: 'npc', entity_id: 'fisher' }],
    last_contribution_ref: { entity_kind: 'conversation_statement', entity_id: 'statement-eremey' } }];
  committedState.conversation_statements = [{ statement_id: 'statement-eremey', conversation_id: 'conversation-1',
    speaker_ref: { entity_kind: 'npc', entity_id: 'eremey' } }];
  return committedState;
}

test('projects only safely visible active group interlocutor', () => {
  const result = projectLowerDvinaTracePlayerSafeState({ committed_state: conversationState(), actor_id: 'mikula' });
  assert.deepEqual(result.player_safe_state.active_interlocutor, {
    entity_ref: { entity_kind: 'npc', entity_id: 'eremey' }, display_label: 'Еремей'
  });
  assert.equal(JSON.stringify(result.player_safe_state).includes('conversation-1'), false);
});

test('active interlocutor stays planner-visible but out of initial working projection', async () => {
  const committedState = conversationState();
  committedState.npcs = committedState.npcs.slice(0, 1);
  committedState.conversation_sessions[0].active_participant_refs.pop();
  const projector = createLowerDvinaTraceTurnStepPlayerSafeProjector({
    playerSafeStateProjector: projectLowerDvinaTracePlayerSafeState
  });
  const projected = await projector({ committed_state: committedState, actor_id: 'mikula' });
  assert.deepEqual(projected.player_safe_state.active_interlocutor, {
    entity_ref: { entity_kind: 'npc', entity_id: 'eremey' }, display_label: 'Еремей'
  });
  assert.equal(Object.hasOwn(projected.initial_working_projection, 'active_interlocutor'), false);
  assert.doesNotThrow(() => projectLowerDvinaTracePlayerSafeState({ committed_state: committedState,
    working_projection: projected.initial_working_projection, actor_id: 'mikula' }));
});
