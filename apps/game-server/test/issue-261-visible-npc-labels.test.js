import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLowerDvinaTraceScreenPanels } from
  '../src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { withLowerDvinaTraceCurrentScene } from
  '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { renderPeoplePanel } from '../../game-web/src/features/people/render.js';
import { escapeHtml } from '../../game-web/src/shared/escape-html.js';
import { output } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

const presentation = { locations: [{ location_ref: 'camp',
  display_name: 'Рыбацкий стан', player_visible_physical_facts: [] }] };

function npc(id, name, hairColor) {
  return { instance_id: id, location_ref: 'camp', anchor_id: 'camp-anchor',
    zone_ref: 'camp-zone', identity_state: { canonical_name: name,
      sex_category: 'male', age_category: 'middle_aged', appearance: {
        build: 'stocky', skin_tone: 'light', face_shape: 'angular',
        hair: { color: hairColor, length: 'short', style: 'straight' },
        eyes: { color: 'gray' } } } };
}

function state() {
  const visible = [['stranger-a', 'blond'], ['stranger-b', 'auburn']]
    .map(([id, hairColor]) => ({
      entity_ref: { entity_kind: 'npc', entity_id: id },
      display_label: 'человек', recognition: 'unrecognized',
      observable_cues: { identity: { display_name: 'человек',
        sex_category: 'male', age_category: 'middle_aged', appearance: {
          build: 'stocky', skin_tone: 'light', face_shape: 'angular',
          hair: { color: hairColor, length: 'short', style: 'straight' },
          eyes: { color: 'gray' } } }, equipment: [], outward_presentation: {} }
    }));
  return {
    actor_id: 'player', party_id: 'party-1',
    party_state: { state_version: 9, turn_number: 1 },
    position: { location_ref: 'camp', g5_anchor_id: 'camp-anchor',
      zone_ref: 'camp-zone' },
    current_visible_context: { version: 1, schema: 'visible_context_package',
      visible_scene: 'Рыбацкий стан', visible_changes: [], sensory_details: [],
      visible_npc: visible, visible_objects: [], known_context: [],
      uncertainties: [], allowed_tensions: [], do_not_imply: [] },
    current_spatial_context: { visible_scene: 'Рыбацкий стан',
      sensory_details: [], visible_npc: visible, visible_objects: [],
      known_context: [], uncertainties: [] },
    current_spatial_context_is_fresh: true,
    current_spatial_context_filters_entities: true,
    location_profiles: [{ location_profile_id: 'camp',
      display_name: 'Рыбацкий стан' }], scene_presentation: presentation,
    npcs: [npc('stranger-a', 'Тайное имя один', 'blond'),
      npc('stranger-b', 'Тайное имя два', 'auburn')],
    items: [], route_history: [], conversation_statements: [],
    received_messages: []
  };
}

test('unrecognized visible NPCs keep distinct safe labels in UI and turn model input',
  async (t) => {
    const committed = state();
    const projected = withLowerDvinaTraceCurrentScene({
      committedState: committed, scenePresentation: presentation
    });
    const context = projected.current_visible_context;
    const labels = context.visible_npc.map(({ display_label }) => display_label);
    const screen = projectLowerDvinaTraceScreenPanels({
      payload: { ...committed, ...projected },
      screen: { panels: {}, visible_context: context }
    });
    const people = screen.panels.people.data.visible_npcs;
    const rendered = renderPeoplePanel(screen);

    const safe = projectLowerDvinaTracePlayerSafeState({
      committed_state: { ...committed, ...projected }, actor_id: 'player'
    }).player_safe_state;
    let modelCall;
    const turnModel = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) { modelCall = call; return { output: output() }; }
    } });
    const request = { schema: 'turn_step_request_v1', request_id: 'issue-261',
      committed_state_version: 9, working_revision: 0, step_index: 1,
      root_player_action: 'осматриваю людей у костра',
      remaining_intent: 'осматриваю людей у костра',
      actor: { actor_ref: 'player' }, player_safe_state: safe,
      available_domain_operations: [] };
    await turnModel(request);
    const user = modelCall.messages.find(({ role }) => role === 'user');
    const wire = JSON.parse(user.content);
    const plannerNpcs = wire.player_safe_state.current_visible_context.visible_npc;
    const plannerLabels = plannerNpcs.map(({ display_label }) => display_label);
    const unsafeLabel = /Тайное имя|[A-Za-z_]/u;

    await t.test('People renders distinct safe descriptions including separate appearance', () => {
      assert.equal(people.length, 2);
      const descriptions = people.map(({ display_label, appearance }) =>
        [display_label, appearance].filter(Boolean).join(' '));
      assert.equal(new Set(descriptions).size, 2,
        'visible People entries must distinguish both strangers');
      assert.equal((rendered.match(/<li>/gu) ?? []).length, 2);
      for (const person of people) {
        for (const text of [person.display_label, person.appearance].filter(Boolean)) {
          assert.match(text, /[А-Яа-яЁё]/u);
          assert.doesNotMatch(text, unsafeLabel);
          assert.ok(rendered.includes(escapeHtml(text)),
            'People must render each visible label and appearance');
        }
      }
      assert.doesNotMatch(rendered, /Тайное имя|stranger-[ab]/u);
    });

    await t.test('current scene and actual planner distinguish strangers safely', () => {
      assert.equal(plannerNpcs.length, 2);
      assert.deepEqual(plannerLabels, labels);
      assert.doesNotMatch(user.content, /Тайное имя один|Тайное имя два/u);
      for (const label of plannerLabels) {
        assert.match(label, /[А-Яа-яЁё]/u);
        assert.doesNotMatch(label, unsafeLabel);
      }
      assert.equal(new Set(labels).size, 2,
        'current scene and actual planner must distinguish strangers by visible appearance');
    });

    await t.test('People and actual planner expose the same labels', () => {
      assert.deepEqual(people.map(({ display_label }) => display_label).sort(),
        [...plannerLabels].sort(),
        'People labels must equal labels in the actual planner user payload');
    });
  });
