import assert from 'node:assert/strict';
import test from 'node:test';
import { withLowerDvinaTraceCurrentScene } from
  '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { distinctNpcLabels } from
  '../src/runtime/lower-dvina-trace-visible-scene-items.js';
import { projectLowerDvinaTraceScreenPanels } from
  '../src/infrastructure/postgres/lower-dvina-trace-screen-panels.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { output } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

const presentation = { locations: [{ location_ref: 'camp',
  display_name: 'Рыбацкий стан', player_visible_physical_facts: [] }] };

function state(version, colors) {
  const visible = colors.map((_, index) => ({
    entity_ref: { entity_kind: 'npc', entity_id: `stranger-${index}` },
    display_label: 'человек', recognition: 'unrecognized'
  }));
  const context = { version: 1, schema: 'visible_context_package',
    visible_scene: 'Рыбацкий стан', visible_changes: [], sensory_details: [],
    visible_npc: visible, visible_objects: [], known_context: [],
    uncertainties: [], allowed_tensions: [], do_not_imply: [] };
  return { actor_id: 'player', party_id: 'party',
    party_state: { state_version: version, turn_number: 1 },
    position: { location_ref: 'camp', g5_anchor_id: 'camp-anchor', zone_ref: 'camp-zone' },
    current_visible_context: context, current_spatial_context: context,
    current_spatial_context_is_fresh: true,
    current_spatial_context_filters_entities: true,
    scene_presentation: presentation,
    npcs: colors.map((color, index) => ({ instance_id: `stranger-${index}`,
      location_ref: 'camp', anchor_id: 'camp-anchor', zone_ref: 'camp-zone',
      identity_state: { canonical_name: `Тайное имя ${index}`,
        sex_category: 'male', age_category: 'adult',
        appearance: { build: 'stocky', skin_tone: 'light', face_shape: 'angular',
          hair: { color, length: 'short', style: 'straight', facial_hair: 'none' },
          eyes: { color: 'gray' } } } })),
    items: [], conversation_sessions: [], conversation_statements: [],
    received_messages: [], last_turn: {}, opening_identity: {} };
}

function labelPair(identityA, identityB, displayLabel = 'человек') {
  const observable = (identity) => ({ ...identity,
    sex_category: identity.sex_category ?? 'male',
    appearance: { hair: { color: 'gray', length: 'short', style: 'straight',
      facial_hair: 'none' }, ...identity.appearance } });
  return distinctNpcLabels([identityA, identityB].map((identity, index) => ({
    entity_ref: { entity_kind: 'npc', entity_id: `visible-${index}` },
    display_label: displayLabel, recognition: 'unrecognized',
    observable_cues: { identity: observable(identity) }
  })));
}

for (const version of [0, 9]) {
  test(`NPC labels use cues enriched from committed state at version ${version}`, () => {
    const committed = state(version, ['gray', 'black']);
    const before = structuredClone(committed);
    const projected = withLowerDvinaTraceCurrentScene({ committedState: committed });
    const context = projected.current_visible_context;
    assert.deepEqual(context.visible_npc.map(({ display_label }) => display_label), [
      'человек, короткие седые прямые волосы',
      'человек, короткие чёрные прямые волосы'
    ]);
    const people = projectLowerDvinaTraceScreenPanels({ payload: projected,
      screen: { panels: {}, visible_context: context } }).panels.people.data.visible_npcs;
    assert.deepEqual(people.map(({ display_label }) => display_label),
      context.visible_npc.map(({ display_label }) => display_label));
    assert.doesNotMatch(JSON.stringify(people), /Тайное имя|stranger-/u);
    assert.deepEqual(committed, before);
  });
}

test('identical observed appearances survive repeated label and People projections', () => {
  const projected = withLowerDvinaTraceCurrentScene({
    committedState: state(9, ['gray', 'gray'])
  });
  const visible = projected.current_visible_context.visible_npc;
  const once = distinctNpcLabels(visible);
  const twice = distinctNpcLabels(once);
  const expected = ['человек, короткие седые прямые волосы',
    'человек, короткие седые прямые волосы'];
  assert.deepEqual(visible.map(({ display_label }) => display_label), expected);
  assert.deepEqual(once, visible);
  assert.deepEqual(twice, once);
  const people = projectLowerDvinaTraceScreenPanels({ payload: projected,
    screen: { panels: {}, visible_context: projected.current_visible_context }
  }).panels.people.data.visible_npcs;
  assert.deepEqual(people.map(({ display_label }) => display_label), expected);
});

test('labels without differentiating cues remain equal and recognized names stay intact', () => {
  const visible = ['unknown-a', 'unknown-b'].map((id) => ({
    entity_ref: { entity_kind: 'npc', entity_id: id },
    display_label: 'человек', recognition: 'unrecognized'
  }));
  visible.push({ entity_ref: { entity_kind: 'npc', entity_id: 'known' },
    display_label: 'Еремей', recognition: 'recognized',
    observable_cues: { identity: { appearance: { hair: {
      color: 'gray', length: 'short', style: 'straight'
    } } } } });
  const before = structuredClone(visible);
  assert.deepEqual(distinctNpcLabels(distinctNpcLabels(visible)), before);
  assert.deepEqual(visible, before);
});

test('equal appearance labels distinguish only by age before other cues', () => {
  const pair = labelPair({ age_category: 'middle_aged' },
    { age_category: 'old' });
  assert.deepEqual(pair.map(({ display_label }) => display_label), [
    'человек, средних лет, короткие седые прямые волосы',
    'человек, пожилой, короткие седые прямые волосы'
  ]);
  assert.deepEqual(distinctNpcLabels(pair), pair,
    'a repeated projection does not add the age descriptor again');
});

test('age distinguisher uses feminine agreement for female NPCs', () => {
  const labels = labelPair({ sex_category: 'female', age_category: 'middle_aged' },
    { sex_category: 'female', age_category: 'old' }, 'женщина')
    .map(({ display_label }) => display_label);
  assert.deepEqual(labels, [
    'женщина, средних лет, короткие седые прямые волосы',
    'женщина, пожилая, короткие седые прямые волосы'
  ]);
});

test('People panel keeps the appearance summary singular after adding a distinguisher', () => {
  const committed = state(9, ['gray', 'gray']);
  committed.npcs[0].identity_state.age_category = 'middle_aged';
  committed.npcs[1].identity_state.age_category = 'old';
  const projected = withLowerDvinaTraceCurrentScene({ committedState: committed });
  const visible = projected.current_visible_context.visible_npc;
  const people = projectLowerDvinaTraceScreenPanels({ payload: projected,
    screen: { panels: {}, visible_context: projected.current_visible_context }
  }).panels.people.data.visible_npcs;
  assert.deepEqual(people.map(({ display_label }) => display_label),
    visible.map(({ display_label }) => display_label));
  assert.ok(people.every((person) => !Object.hasOwn(person, 'appearance')),
    'the label ends with the shared summary, so People does not repeat it');
  assert.doesNotMatch(JSON.stringify(people), /Тайное имя|stranger-/u);
});

test('equal appearance labels distinguish by eye color when age is equal', () => {
  const labels = labelPair({ age_category: 'adult', appearance: {
    eyes: { color: 'dark' }
  } }, { age_category: 'adult', appearance: {
    eyes: { color: 'blue' }
  } }).map(({ display_label }) => display_label);
  assert.deepEqual(labels, [
    'человек, с тёмными глазами, короткие седые прямые волосы',
    'человек, с голубыми глазами, короткие седые прямые волосы'
  ]);
});

test('equal age and eye labels distinguish by build', () => {
  const labels = labelPair({ age_category: 'adult', appearance: {
    eyes: { color: 'gray' }, build: 'slim'
  } }, { age_category: 'adult', appearance: {
    eyes: { color: 'gray' }, build: 'stocky'
  } }).map(({ display_label }) => display_label);
  assert.deepEqual(labels, [
    'человек, стройного сложения, короткие седые прямые волосы',
    'человек, крепкого сложения, короткие седые прямые волосы'
  ]);
});

test('fresh worn clothing replaces only the prior appearance suffix everywhere',
  async () => {
    const committed = state(9, ['gray', 'gray']);
    committed.npcs[0].identity_state.age_category = 'middle_aged';
    committed.npcs[1].identity_state.age_category = 'old';
    committed.items = ['madder_red', 'dark_blue'].map((color, index) => ({
      item_id: `shirt-${index}`, placement: {
        holder_npc_id: `stranger-${index}`, physical_position: 'worn',
        equipment_slot_category_id: 'base_garment'
      }, state: { visual_profile_snapshot: {
        schema: 'item_visual_profile_snapshot_v1', version: 1,
        equipment_slot: 'base_garment', visible_fabric: 'wool',
        main_visible_color: color
      } }
    }));
    committed.npcs.push({ instance_id: 'known', location_ref: 'camp',
      anchor_id: 'camp-anchor', zone_ref: 'camp-zone',
      identity_state: { canonical_name: 'Тайное имя', sex_category: 'male',
        age_category: 'adult', appearance: { hair: { color: 'black',
          length: 'short', style: 'straight', facial_hair: 'none' } } } });
    committed.current_visible_context.visible_npc.push({
      entity_ref: { entity_kind: 'npc', entity_id: 'known' },
      display_label: 'человек', recognition: 'unrecognized'
    });
    const first = withLowerDvinaTraceCurrentScene({ committedState: committed });
    const firstContext = structuredClone(first.current_visible_context);

    const next = structuredClone(committed);
    next.party_state.state_version = 10;
    next.current_visible_context = firstContext;
    next.conversation_statements = [{ statement_id: 'known-introduction',
      speaker_ref: { entity_kind: 'npc', entity_id: 'known' },
      utterance_text: 'Я Влас.' }];
    next.received_messages = [{
      source_statement_ref: { entity_kind: 'conversation_statement',
        entity_id: 'known-introduction' },
      listener_ref: { entity_kind: 'player_character', entity_id: 'player' },
      speaker_ref: { entity_kind: 'npc', entity_id: 'known' },
      comprehension: 'full', utterance_text: 'Я Влас.'
    }];
    next.items[0].state.visual_profile_snapshot.main_visible_color = 'forest_green';
    for (const [index, color] of ['forest_green', 'dark_blue'].entries()) {
      next.current_spatial_context.visible_npc[index].observable_cues = {
        equipment: [{ equipment_slot_category_id: 'base_garment',
          visual_profile_snapshot: { equipment_slot: 'base_garment',
            main_visible_color: color, visible_fabric: 'wool' } }]
      };
    }
    next.current_spatial_context.visible_npc[2].observable_cues = {
      identity: { appearance: { hair: { color: 'black', length: 'short',
        style: 'straight' } } }, equipment: []
    };
    const second = withLowerDvinaTraceCurrentScene({ committedState: next });
    const secondVisible = second.current_visible_context.visible_npc;
    const labels = Object.fromEntries(secondVisible.map(({ entity_ref, display_label }) =>
      [entity_ref.entity_id, display_label]));
    assert.equal(labels['stranger-0'],
      'человек, средних лет, короткие седые прямые волосы, зелёная одежда, нижняя одежда из шерсти',
      'appearance suffix must be rebuilt after preserving the age distinguisher');
    assert.equal(labels['stranger-1'],
      'человек, пожилой, короткие седые прямые волосы, тёмно-синяя одежда, нижняя одежда из шерсти');
    assert.equal(labels.known, 'Влас',
      'an NPC recognized by heard name must keep the name');
    assert.doesNotMatch(labels['stranger-0'], /красная одежда/u);

    const people = projectLowerDvinaTraceScreenPanels({ payload: second,
      screen: { panels: {}, visible_context: second.current_visible_context }
    }).panels.people.data.visible_npcs;
    assert.deepEqual(people.map(({ display_label }) => display_label).sort(),
      Object.values(labels).sort());

    let modelCall;
    const turnModel = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) { modelCall = call; return { output: output() }; }
    } });
    const safe = projectLowerDvinaTracePlayerSafeState({
      committed_state: { ...next, ...second }, actor_id: 'player'
    }).player_safe_state;
    await turnModel({ schema: 'turn_step_request_v1', request_id: 'appearance-refresh',
      committed_state_version: 10, working_revision: 0, step_index: 1,
      root_player_action: 'осматриваю людей', remaining_intent: 'осматриваю людей',
      actor: { actor_ref: 'player' }, player_safe_state: safe,
      available_domain_operations: [] });
    const user = modelCall.messages.find(({ role }) => role === 'user');
    const plannerNpcs = JSON.parse(user.content)
      .player_safe_state.current_visible_context.visible_npc;
    assert.deepEqual(Object.fromEntries(plannerNpcs.map(({ entity_ref, display_label }) =>
      [entity_ref.entity_id, display_label])), labels);
    assert.doesNotMatch(user.content, /Тайное имя/u);

    const repeated = withLowerDvinaTraceCurrentScene({
      committedState: { ...next, current_visible_context: second.current_visible_context }
    });
    assert.deepEqual(repeated.current_visible_context.visible_npc, secondVisible,
      'repeating unchanged current cues must keep labels byte-for-byte stable');

    const unmatchedPriorAppearance = structuredClone(next);
    unmatchedPriorAppearance.current_visible_context.visible_npc[0].display_label =
      'знакомый рыбак';
    const untouched = withLowerDvinaTraceCurrentScene({
      committedState: unmatchedPriorAppearance
    }).current_visible_context.visible_npc.find(({ entity_ref }) =>
      entity_ref.entity_id === 'stranger-0');
    assert.equal(untouched.display_label, 'знакомый рыбак',
      'a label without the exact prior summary suffix is not parsed or changed');
  });
