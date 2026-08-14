import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPhase2ReadyScreen,
  rebuildPhase2HistoricalScreen
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { projectLowerDvinaTraceScreenPanels } from
  '../src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';

function payload(overrides = {}) {
  return {
    party_id: 'party-1',
    actor_id: 'player-1',
    party_state: { state_version: 3, turn_number: 2 },
    position: { location_ref: 'camp' },
    npcs: [{
      instance_id: 'npc-eremey',
      location_ref: 'camp',
      identity_state: {
        canonical_name: 'Еремей'
      }
    }],
    conversation_sessions: [{
      schema: 'conversation_session_v1',
      conversation_id: 'conversation-1',
      status: 'active',
      location_ref: { entity_kind: 'location', entity_id: 'camp' },
      active_participant_refs: [{
        entity_kind: 'npc', entity_id: 'npc-eremey'
      }, {
        entity_kind: 'player_character', entity_id: 'player-1'
      }]
    }],
    last_turn: {
      received_at: '2026-08-14T12:00:00.000Z',
      visible_package: {
        package_id: 'visible-1', package_digest: 'sha256:visible'
      }
    },
    opening_identity: { opening_screen_digest: 'sha256:opening' },
    ...overrides
  };
}

function visibleContext() {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'У костра стоит Еремей.',
    visible_changes: [], sensory_details: [], visible_npc: [{
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
      display_label: 'Еремей', recognition: 'known'
    }],
    visible_objects: [], known_context: [], uncertainties: [],
    allowed_tensions: [], do_not_imply: []
  };
}

function narration() {
  return {
    version: 1,
    schema: 'narration_flow_result',
    request_id: 'turn-2',
    surface: 'turn', status: 'approved', pass: true,
    approved_output: {
      version: 1, schema: 'narration_output', output_id: 'output-2',
      prose: 'Еремей ждёт ответа.', action_options: [],
      used_references: [], self_check: {}
    },
    final_audit: {
      version: 1, schema: 'narration_audit', pass: true,
      concerns: [], evidence: []
    },
    generation_history: [], audit_history: [], repair_history: []
  };
}

test('post-commit and historical screens share the active people projection', () => {
  const state = payload();
  const postCommit = buildPhase2ReadyScreen({
    payload: state,
    turnId: 'turn-2',
    visibleContext: visibleContext(),
    narration: narration(),
    narrationOutputDigest: 'sha256:narration'
  });
  const historical = rebuildPhase2HistoricalScreen({
    payload: state,
    turnId: 'turn-2',
    visiblePayload: {
      perceived_scene: visibleContext().visible_scene,
      perceived_changes: [], sensory_details: [],
      visible_npcs: visibleContext().visible_npc,
      visible_objects: [], known_context: [], uncertainties: []
    },
    narrationOutput: {
      package_digest: 'sha256:visible', flow_result: narration()
    },
    narrationOutputDigest: 'sha256:narration'
  });
  assert.deepEqual(postCommit.panels.people, historical.panels.people);
  assert.deepEqual(postCommit.panels.people.data.active_interlocutor, {
    entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
    display_label: 'Еремей'
  });
  assert.deepEqual(
    Object.keys(postCommit.panels.people.data.active_interlocutor).sort(),
    ['display_label', 'entity_ref']
  );
});

test('nearby NPC alone does not become an interlocutor', () => {
  const projected = projectLowerDvinaTraceScreenPanels({
    payload: payload({ conversation_sessions: [] }),
    screen: { panels: {} }
  });
  assert.equal(projected.panels.people, undefined);
});

test('canonical NPC identity is not promoted without a player-safe label', () => {
  const projected = projectLowerDvinaTraceScreenPanels({
    payload: payload(),
    screen: {
      panels: {},
      visible_context: { ...visibleContext(), visible_npc: [] }
    }
  });
  assert.equal(projected.panels.people, undefined);
});

test('state display name does not bypass the persisted visible label', () => {
  const state = payload();
  state.npcs[0].identity_state = { display_name: 'Еремей' };
  const projected = projectLowerDvinaTraceScreenPanels({
    payload: state,
    screen: {
      panels: {},
      visible_context: { ...visibleContext(), visible_npc: [] }
    }
  });
  assert.equal(projected.panels.people, undefined);
});

test('moving away removes a stale active interlocutor panel', () => {
  const active = projectLowerDvinaTraceScreenPanels({
    payload: payload(),
    screen: { panels: {}, visible_context: visibleContext() }
  });
  const moved = projectLowerDvinaTraceScreenPanels({
    payload: payload({ position: { location_ref: 'shed' } }),
    screen: active
  });
  assert.equal(moved.panels.people, undefined);
});
