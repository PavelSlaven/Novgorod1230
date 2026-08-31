import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPhase2ReadyScreen,
  rebuildPhase2HistoricalScreen
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { projectLowerDvinaTraceScreenPanels } from
  '../src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';
import { buildLowerDvinaTracePendingScreen } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-presentation.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2.js';

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
      concerns: [], evidence: ['Grounded.']
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

test('direct presentation persistence keeps only public combat state',
  async () => {
    const state = payload();
    state.last_turn = {
      ...state.last_turn,
      input_digest: 'input-2',
      option_id: 'respond_in_active_combat',
      check_result: null,
      time_update: null,
      body_update: null,
      consequence: { combat: { session_after: {
        status: 'paused_for_player', player_response_required: true,
        participant_refs: ['hidden-authoritative-participant'] } } },
      turn_step_commit: { loop_trace: { step_traces: [{
        approved_plan: { resolution: 'domain_request', operations: [{
          op: 'request_combat' }] },
        player_response_boundary: false
      }] } }
    };
    let persistedScreen = null;
    const repository = createLowerDvinaTracePhase2PostgresRepository({
      partyPool: {
        async query(statement, values) {
          if (statement.includes('SELECT state_payload')) {
            return { rowCount: 1, rows: [{ state_payload: state }] };
          }
          persistedScreen = JSON.parse(values[1]);
          return { rowCount: 1, rows: [] };
        },
        connect() { throw new Error('unexpected connection'); }
      },
      committer: { async commit() { throw new Error('unexpected commit'); } }
    });
    const result = await repository.persistPhase2Screen({
      partyId: state.party_id,
      inputDigest: state.last_turn.input_digest,
      result: {
        turn_id: 'turn-2',
        commit: {
          state_version: state.party_state.state_version,
          package_id: state.last_turn.visible_package.package_id,
          package_digest: state.last_turn.visible_package.package_digest
        },
        narration: { ...narration(), presentation: {
          output_digest: 'sha256:narration' } },
        screen: {
          version: 1,
          schema: 'lower_dvina_trace_turn_screen',
          party_id: state.party_id,
          turn_id: 'turn-2',
          turn_number: state.party_state.turn_number,
          screen_status: 'ready',
          combat_state: { status: 'paused_for_player',
            player_response_required: true,
            participant_refs: ['hidden'] },
          visible_context: visibleContext(),
          main_prose: 'Бой продолжается.'
        }
      }
    });
    const expected = { status: 'paused_for_player',
      player_response_required: true };
    assert.deepEqual(result.screen.combat_state, expected);
    assert.deepEqual(persistedScreen.combat_state, expected);
    assert.deepEqual(Object.keys(persistedScreen.combat_state).sort(),
      ['player_response_required', 'status']);
  });

test('combat presentation replay preserves authoritative public combat state', () => {
  const loopTrace = { step_traces: [{ player_response_boundary: false,
    approved_plan: { resolution: 'domain_request', operations: [{
      op: 'request_combat', participant_ref: 'hidden-combat-participant' }] } }] };
  const combat = { session_after: { status: 'paused_for_player',
    player_response_required: true,
    participant_refs: ['hidden-authoritative-participant'] } };
  const visiblePayload = {
    perceived_scene: visibleContext().visible_scene,
    perceived_changes: [], sensory_details: [],
    visible_npcs: visibleContext().visible_npc,
    visible_objects: [], known_context: [], uncertainties: []
  };
  const state = payload({ last_turn: {
    ...payload().last_turn, consequence: { combat },
    turn_step_commit: { loop_trace: loopTrace }
  } });
  const pending = buildLowerDvinaTracePendingScreen({ state,
    turnId: 'turn-2', nextVersion: 3, turnNumber: 2,
    visibleEnvelope: { package_id: 'visible-1',
      package_digest: 'sha256:visible', visible_payload: visiblePayload },
    turnConsequence: { combat } });
  const replay = () => rebuildPhase2HistoricalScreen({ payload: state,
    turnId: 'turn-2', visiblePayload, narrationOutput: {
      package_digest: 'sha256:visible', flow_result: narration()
    }, narrationOutputDigest: 'sha256:narration' });
  const ready = replay();
  assert.deepEqual(ready, replay());
  assert.deepEqual(ready.combat_state, pending.combat_state);
  assert.deepEqual(ready.combat_state, {
    status: 'paused_for_player', player_response_required: true });
  assert.deepEqual(Object.keys(ready.combat_state).sort(),
    ['player_response_required', 'status']);
  assert.equal(JSON.stringify(ready.combat_state)
    .includes('hidden-combat-participant'), false);
  assert.equal(JSON.stringify(ready.combat_state)
    .includes('hidden-authoritative-participant'), false);
});

test('combat initialization presentation preserves the safe session state', () => {
  const publicState = { status: 'paused_for_player',
    player_response_required: true };
  const state = payload({ last_turn: { ...payload().last_turn,
    consequence: { combat_initialization: {
      combat_id: 'hidden-combat-id', ...publicState } } } });
  const visiblePayload = {
    perceived_scene: visibleContext().visible_scene,
    perceived_changes: [], sensory_details: [],
    visible_npcs: visibleContext().visible_npc,
    visible_objects: [], known_context: [], uncertainties: []
  };
  const pending = buildLowerDvinaTracePendingScreen({ state,
    turnId: 'turn-2', nextVersion: 3, turnNumber: 2,
    visibleEnvelope: { package_id: 'visible-1',
      package_digest: 'sha256:visible', visible_payload: visiblePayload },
    turnConsequence: { combat_initialization: { session: {
      ...publicState, combat_id: 'hidden-combat-id',
      participant_refs: ['hidden-participant'] } } } });
  const ready = rebuildPhase2HistoricalScreen({ payload: state,
    turnId: 'turn-2', visiblePayload, narrationOutput: {
      package_digest: 'sha256:visible', flow_result: narration()
    }, narrationOutputDigest: 'sha256:narration' });
  assert.deepEqual(pending.combat_state, publicState);
  assert.deepEqual(ready.combat_state, publicState);
  assert.equal(JSON.stringify({ pending: pending.combat_state,
    ready: ready.combat_state }).includes('hidden'), false);
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

test('projects Lower Dvina scene assets with zone precedence', () => {
  const scenes = [
    ['trace_ld_v1_loc_wreck_shore', null, 'lower-dvina-wreck-shore'],
    ['trace_ld_v1_loc_fishing_camp', null, 'lower-dvina-fishing-camp'],
    ['trace_ld_v1_loc_old_drying_shed', null,
      'lower-dvina-old-drying-shed-exterior'],
    ['trace_ld_v1_loc_zhdanko_storehouse', null,
      'lower-dvina-zhdanko-storehouse-exterior'],
    ['trace_ld_v1_loc_fishing_camp', 'fire_rest_area',
      'lower-dvina-fishing-camp-firepit'],
    ['trace_ld_v1_loc_old_drying_shed', 'shed_interior',
      'lower-dvina-old-drying-shed-interior'],
    ['trace_ld_v1_loc_zhdanko_storehouse', 'storehouse_interior',
      'lower-dvina-zhdanko-storehouse-interior'],
    ['trace_ld_v1_loc_zhdanko_storehouse', 'river_access',
      'lower-dvina-zhdanko-river-descent']
  ];
  for (const [locationRef, zoneRef, expected] of scenes) {
    const projected = projectLowerDvinaTraceScreenPanels({
      payload: payload({ position: { location_ref: locationRef, zone_ref: zoneRef } }),
      screen: { panels: {} }
    });
    assert.equal(projected.scene_asset_id, expected);
  }
});

test('removes stale scene asset when position has no mapping', () => {
  const projected = projectLowerDvinaTraceScreenPanels({
    payload: payload({ position: { location_ref: 'unknown', zone_ref: 'unknown' } }),
    screen: { scene_asset_id: 'lower-dvina-wreck-shore', panels: {} }
  });
  assert.equal(Object.hasOwn(projected, 'scene_asset_id'), false);
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

for (const [slot, portraitAssetId] of [
  ['player_clerk', 'lower-dvina-mikula'],
  ['onisim_boatman', 'lower-dvina-onisim'],
  ['eremey_fisher', 'lower-dvina-eremey'],
  ['ratsha_storehouse_helper', 'lower-dvina-ratsha'],
  ['zhdanko_storehouse_controller', 'lower-dvina-zhdanko'],
  ['background_fisher_1', 'lower-dvina-fisher-1'],
  ['background_fisher_2', 'lower-dvina-fisher-2']
]) {
  test(`active interlocutor gets ${slot} mapped portrait asset`, () => {
    const state = payload();
    state.npcs[0].participant_slot_ref = slot;
    const before = structuredClone(state);
    const projected = projectLowerDvinaTraceScreenPanels({
      payload: state,
      screen: { panels: {}, visible_context: visibleContext() }
    });
    const interlocutor = projected.panels.people.data.active_interlocutor;
    assert.equal(interlocutor.portrait_asset_id, portraitAssetId);
    assert.doesNotMatch(JSON.stringify(projected), /participant_slot_ref/);
    assert.deepEqual(state, before);
  });
}

test('ambiguous committed NPC match keeps active interlocutor without portrait asset', () => {
  const state = payload();
  state.npcs[0].participant_slot_ref = 'eremey_fisher';
  state.npcs.push({ actor_id: 'npc-eremey', participant_slot_ref: 'onisim_boatman' });
  const projected = projectLowerDvinaTraceScreenPanels({
    payload: state,
    screen: { panels: {}, visible_context: visibleContext() }
  });
  const interlocutor = projected.panels.people.data.active_interlocutor;
  assert.deepEqual(interlocutor.entity_ref, {
    entity_kind: 'npc', entity_id: 'npc-eremey'
  });
  assert.equal(Object.hasOwn(interlocutor, 'portrait_asset_id'), false);
});

for (const slot of [undefined, 'runtime_unknown']) {
  test(`unmapped ${slot ?? 'missing'} portrait slot keeps active portrait spec`, () => {
    const state = payload();
    state.npcs[0].participant_slot_ref = slot;
    state.npcs[0].identity_state = portraitIdentity();
    state.items = [portraitGarment({
      itemId: 'eremey-shirt', slot: 'base_garment', color: 'undyed_linen'
    })];
    const projected = projectLowerDvinaTraceScreenPanels({
      payload: state,
      screen: { panels: {}, visible_context: visibleContext() }
    });
    const interlocutor = projected.panels.people.data.active_interlocutor;
    assert.equal(Object.hasOwn(interlocutor, 'portrait_asset_id'), false);
    assert.equal(interlocutor.portrait_spec_v1.person.age, 'adult');
  });
}

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

function portraitIdentity() {
  return {
    canonical_name: 'Еремей', sex_category: 'male', age_category: 'adult',
    appearance: { build: 'average', skin_tone: 'light', face_shape: 'oval',
      hair: { color: 'dark_brown', length: 'short', style: 'straight',
        facial_hair: 'none' }, eyes: { color: 'gray' } }
  };
}
