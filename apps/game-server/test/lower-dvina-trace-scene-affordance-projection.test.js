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
      participant_slot_ref: 'eremey_fisher',
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
    display_label: 'Еремей',
    portrait_asset_id: 'lower-dvina-eremey'
  });
  assert.deepEqual(
    Object.keys(postCommit.panels.people.data.active_interlocutor).sort(),
    ['display_label', 'entity_ref', 'portrait_asset_id']
  );
});

test('participant slots map to safe authored portrait ids', () => {
  const cases = [
    ['onisim_boatman', 'lower-dvina-onisim'],
    ['eremey_fisher', 'lower-dvina-eremey'],
    ['ratsha_storehouse_helper', 'lower-dvina-ratsha'],
    ['zhdanko_storehouse_controller', 'lower-dvina-zhdanko'],
    ['background_fisher_1', 'lower-dvina-fisher-1'],
    ['background_fisher_2', 'lower-dvina-fisher-2']
  ];
  for (const [participantSlot, assetId] of cases) {
    const state = payload();
    state.npcs[0].participant_slot_ref = participantSlot;
    const projected = projectLowerDvinaTraceScreenPanels({
      payload: state,
      screen: { panels: {}, visible_context: visibleContext() }
    });
    assert.equal(projected.panels.people.data.active_interlocutor
      .portrait_asset_id, assetId);
  }

  const state = payload();
  state.npcs[0].participant_slot_ref = 'unknown_slot';
  const projected = projectLowerDvinaTraceScreenPanels({
    payload: state,
    screen: { panels: {}, visible_context: visibleContext() }
  });
  assert.equal(Object.hasOwn(projected.panels.people.data.active_interlocutor,
    'portrait_asset_id'), false);
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

test('active interlocutor gets a non-persisted portrait from sanitized committed equipment', () => {
  const state = payload();
  state.npcs[0].identity_state = {
    canonical_name: 'Еремей', sex_category: 'male', age_category: 'adult',
    appearance: { build: 'average', skin_tone: 'light', face_shape: 'oval', hair: { color: 'dark_brown', length: 'short', style: 'straight', facial_hair: 'none' }, eyes: { color: 'gray' } },
    private_profile_id: 'must-not-leak'
  };
  state.items = [{
    item_id: 'eremey-shirt',
    placement: { holder_npc_id: 'npc-eremey', physical_position: 'equipped', equipment_slot_category_id: 'base_garment' },
    state: { visual_profile_snapshot: { schema: 'item_visual_profile_snapshot_v1', version: 1, equipment_slot: 'base_garment', neckline: 'slit_round', sleeve_form: 'narrow', outer_form: 'none', visible_fabric: 'light_linen', trim: 'none', main_visible_color: 'undyed_linen', secondary_visible_color: null, headwear_kind: 'none' }, hidden_inventory: 'must-not-leak' }
  }];
  const projected = projectLowerDvinaTraceScreenPanels({
    payload: state,
    screen: { panels: {}, visible_context: visibleContext() }
  });
  const interlocutor = projected.panels.people.data.active_interlocutor;
  assert.equal(interlocutor.portrait_spec_v1.person.age, 'adult');
  assert.equal(interlocutor.portrait_spec_v1.clothing.main_color, 'undyed_linen');
  assert.doesNotMatch(JSON.stringify(interlocutor), /private_profile_id|hidden_inventory/);
  assert.equal(Object.hasOwn(state, 'portrait_spec_v1'), false);
  assert.equal(Object.hasOwn(state.npcs[0], 'portrait_spec_v1'), false);
});

for (const concealedState of ['hidden', 'concealed']) {
  test(`nested ${concealedState} equipment is excluded from portrait`, () => {
    const state = payload();
    state.npcs[0].identity_state = {
      canonical_name: 'Еремей', sex_category: 'male', age_category: 'adult',
      appearance: { build: 'average', skin_tone: 'light',
        face_shape: 'oval', hair: { color: 'dark_brown', length: 'short',
          style: 'straight', facial_hair: 'none' },
        eyes: { color: 'gray' } }
    };
    state.items = [portraitGarment({
      itemId: 'eremey-shirt', slot: 'base_garment', color: 'undyed_linen'
    }), portraitGarment({
      itemId: 'eremey-hidden-caftan', slot: 'outer_garment',
      color: 'dark_red', visibilityState: concealedState
    })];
    const projected = projectLowerDvinaTraceScreenPanels({
      payload: state,
      screen: { panels: {}, visible_context: visibleContext() }
    });
    const portrait = projected.panels.people.data.active_interlocutor
      .portrait_spec_v1;
    assert.equal(portrait.clothing.main_color, 'undyed_linen');
    assert.equal(portrait.clothing.outer, 'none');
    assert.doesNotMatch(JSON.stringify(portrait), /dark_red/);
  });
}

function portraitGarment({ itemId, slot, color, visibilityState }) {
  return {
    item_id: itemId,
    placement: { holder_npc_id: 'npc-eremey',
      physical_position: 'equipped', equipment_slot_category_id: slot },
    state: {
      ...(visibilityState == null
        ? {} : { visibility_state: { state: visibilityState } }),
      visual_profile_snapshot: {
        schema: 'item_visual_profile_snapshot_v1', version: 1,
        equipment_slot: slot, neckline: 'slit_round', sleeve_form: 'narrow',
        outer_form: slot === 'outer_garment' ? 'wrap' : 'none',
        visible_fabric: slot === 'outer_garment' ? 'wool' : 'light_linen',
        trim: 'none', main_visible_color: color,
        secondary_visible_color: null, headwear_kind: 'none'
      }
    }
  };
}
