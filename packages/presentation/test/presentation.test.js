import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCharacterPanel,
  createDiagnosticPanel,
  createFirstGameScreenReadModel,
  createJournalPanel,
  createPeoplePanel,
  createTurnScreenReadModel,
  validateTurnScreen
} from '../src/index.js';

function visibleContext(overrides = {}) {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'На площади стоят люди.',
    visible_changes: [],
    sensory_details: [],
    visible_npc: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: [],
    ...overrides
  };
}

function narration() {
  return {
    version: 1,
    schema: 'narration_flow_result',
    request_id: 'turn-1',
    surface: 'turn',
    status: 'approved',
    pass: true,
    approved_output: {
      version: 1,
      schema: 'narration_output',
      output_id: 'output-1',
      prose: 'На площади глухо переговариваются люди.',
      action_options: [],
      used_references: [],
      self_check: {}
    },
    final_audit: { version: 1, schema: 'narration_audit', pass: true, concerns: [], evidence: ['Grounded.'] },
    generation_history: [],
    audit_history: [],
    repair_history: []
  };
}

test('creates versioned TurnScreen from approved narration only', () => {
  const screen = createTurnScreenReadModel({
    partyId: 'party-1',
    turnId: 'turn-1',
    turnNumber: 1,
    visibleContext: visibleContext(),
    narration: narration(),
    actions: [{ label: 'Осмотреться', command: 'осматриваюсь' }],
    panels: { character: createCharacterPanel({ name: 'Иван' }) }
  });
  assert.equal(screen.schema, 'turn_screen');
  assert.equal(screen.main_prose, 'На площади глухо переговариваются люди.');
  assert.equal(screen.input_panel.input_contract, 'intent_not_fact');
  assert.equal(validateTurnScreen(screen).ok, true);
});

test('rejects hidden fields in screen and panels', () => {
  assert.throws(() => createCharacterPanel({ hidden_state: { secret: true } }), (error) => error.code === 'PRESENTATION_HIDDEN_LEAK');
  assert.throws(() => createTurnScreenReadModel({
    partyId: 'party-1', turnId: 'turn-1', turnNumber: 1,
    visibleContext: visibleContext({ hidden_state: { secret: true } }), narration: narration()
  }), (error) => error.code === 'TURN_SCREEN_INVALID');
});

test('diagnostic panel is suppressed outside developer mode', () => {
  const panel = createDiagnosticPanel({ request_id: 'req-1' });
  assert.equal(panel.visible, false);
  assert.deepEqual(panel.data, {});
});

test('scene affordance panels accept only exact player-safe fields', () => {
  const journal = createJournalPanel({ current_task: 'Добраться до стана' });
  assert.equal(journal.data.current_task, 'Добраться до стана');
  assert.throws(() => createJournalPanel({ current_task: '   ' }), {
    code: 'PRESENTATION_CURRENT_TASK_INVALID'
  });

  const people = createPeoplePanel({
    active_interlocutor: {
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
      display_label: 'Еремей',
      role_label: 'рыбак'
    }
  });
  assert.deepEqual(people.data.active_interlocutor, {
    entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
    display_label: 'Еремей',
    role_label: 'рыбак'
  });
  for (const active_interlocutor of [{
    entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
    display_label: ''
  }, {
    entity_ref: { entity_kind: 'npc', entity_id: 'npc-eremey' },
    display_label: 'Еремей',
    physical_description: 'скрытая характеристика'
  }, {
    entity_ref: {
      entity_kind: 'npc', entity_id: 'npc-eremey', profile_id: 'internal'
    },
    display_label: 'Еремей'
  }]) {
    assert.throws(() => createPeoplePanel({ active_interlocutor }), {
      code: 'PRESENTATION_ACTIVE_INTERLOCUTOR_INVALID'
    });
  }
});

test('turn validation rejects malformed optional scene affordances', () => {
  const screen = createTurnScreenReadModel({
    partyId: 'party-1', turnId: 'turn-1', turnNumber: 1,
    visibleContext: visibleContext(), narration: narration()
  });
  assert.equal(validateTurnScreen({
    ...screen,
    panels: { journal: { visible: true, data: { current_task: '' } } }
  }).ok, false);
  assert.equal(validateTurnScreen({
    ...screen,
    panels: {
      people: {
        visible: true,
        data: {
          active_interlocutor: {
            entity_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
            display_label: 'Еремей',
            age: 40
          }
        }
      }
    }
  }).ok, false);
});

test('adapts approved Stage 26 result into versioned FirstGameScreen', () => {
  const source = {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: 'party-1',
    main_prose: 'У ворот начинается путь.'
  };
  const screen = createFirstGameScreenReadModel({
    stage26Result: {
      version: 1,
      schema: 'stage26_first_game_screen_result',
      pass: true,
      request_id: 'req-1',
      screen_digest: 'sha256:screen',
      visible_context_package_digest: 'sha256:visible',
      narrator_output_digest: 'sha256:narrator',
      first_game_screen: source
    }
  });
  assert.equal(screen.schema, 'first_game_screen');
  assert.equal(screen.source_approval.request_id, 'req-1');
});
