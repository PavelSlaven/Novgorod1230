import test from 'node:test';
import assert from 'node:assert/strict';
import { projectLowerDvinaTraceScreenPanels } from
  '../src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';

const npc = (id, hair, color) => ({
  entity_ref: { entity_kind: 'npc', entity_id: id },
  display_label: 'человек', recognition: 'unrecognized',
  visible_status: 'чинит сети',
  observable_cues: {
    identity: { display_name: 'человек', sex_category: 'male',
      age_category: 'adult', appearance: { build: 'average',
        skin_tone: 'light', face_shape: 'broad', hair,
        eyes: { color: 'gray' } } },
    equipment: [{ physical_position: 'equipped',
      equipment_slot_category_id: 'outer_garment',
      visual_profile_snapshot: { schema: 'item_visual_profile_snapshot_v1',
        version: 1, equipment_slot: 'outer_garment',
        neckline: 'high_closed', sleeve_form: 'narrow',
        outer_form: 'front_open', visible_fabric: 'wool', trim: 'none',
        main_visible_color: color, secondary_visible_color: color,
        headwear_kind: 'none' } }],
    outward_presentation: {}
  }
});

function context(visibleNpcs) {
  return { version: 1, schema: 'visible_context_package',
    visible_scene: 'Рыбацкий стан', visible_changes: [], sensory_details: [],
    visible_npc: visibleNpcs, visible_objects: [], known_context: [],
    uncertainties: [], allowed_tensions: [], do_not_imply: [] };
}

function payload(visibleNpcs) {
  const current = context(visibleNpcs);
  return { party_id: 'party-1', actor_id: 'player-1',
    party_state: { state_version: 1, turn_number: 1 },
    position: { location_ref: 'camp' }, current_visible_context: current,
    npcs: visibleNpcs.map(({ entity_ref: ref }) => ({
      instance_id: ref.entity_id, location_ref: 'camp'
    })), conversation_sessions: [], last_turn: {}, opening_identity: {} };
}

test('people panel preserves player-safe first-contact appearance', () => {
  const visibleNpcs = [
    npc('npc-1', { color: 'blond', length: 'medium', style: 'wavy',
      facial_hair: 'short_beard' }, 'ochre'),
    npc('npc-2', { color: 'light_brown', length: 'bald', style: 'straight',
      facial_hair: 'full_beard' }, 'brown'),
    npc('npc-3', { color: 'blond', length: 'medium', style: 'wavy',
      facial_hair: 'short_beard' }, 'charcoal')
  ];
  const people = projectLowerDvinaTraceScreenPanels({
    payload: payload(visibleNpcs),
    screen: { panels: {}, visible_context: context(visibleNpcs) }
  }).panels.people.data.visible_npcs;

  assert.deepEqual(people.map(({ display_label: label }) => label), [
    'человек (1)', 'человек (2)', 'человек (3)'
  ]);
  assert.deepEqual(people.map(({ appearance }) => appearance), [
    'русые волнистые волосы средней длины, короткая борода, охряная одежда',
    'лысина, густая борода, коричневая одежда',
    'русые волнистые волосы средней длины, короткая борода, угольно-серая одежда'
  ]);
  assert.doesNotMatch(JSON.stringify(people),
    /Еремей|canonical_name|participant_slot_ref|portrait_asset_id/u);
});

test('people panel does not invent absent appearance', () => {
  const visibleNpcs = [{ entity_ref: { entity_kind: 'npc',
    entity_id: 'npc-1' }, display_label: 'человек',
  recognition: 'unrecognized' }];
  const people = projectLowerDvinaTraceScreenPanels({
    payload: payload(visibleNpcs),
    screen: { panels: {}, visible_context: context(visibleNpcs) }
  }).panels.people.data.visible_npcs;
  assert.equal(Object.hasOwn(people[0], 'appearance'), false);
});
