import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalDigest } from '@rus/materialization';
import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import { phase2PublicResult } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { phase2InitialCurrentVisibleContext } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-current-visible.js';

test('validated opening projection supplies the initial current scene', () => {
  const screen = {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: 'party-1',
    main_prose: 'Литературная стартовая проза не становится фактом.',
    visible_context: {
      place: 'берег крушения',
      calendar: 'утро',
      environment: {
        profile_id: 'trace_ld_v1_env_cold_wet_shore',
        facts: ['cold', 'wet', 'exposed']
      }
    }
  };
  const current = phase2InitialCurrentVisibleContext({
    screen,
    openingScreenDigest: canonicalDigest(screen)
  });
  assert.deepEqual(current, {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'берег крушения',
    visible_changes: [],
    sensory_details: ['cold', 'wet', 'exposed'],
    visible_npc: [],
    visible_objects: [],
    known_context: ['берег крушения', 'утро'],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: []
  });
  assert.throws(() => phase2InitialCurrentVisibleContext({
    screen,
    openingScreenDigest: canonicalDigest({ ...screen, party_id: 'other' })
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  const unsafeScreen = { ...screen, private_knowledge: ['must-not-pass'] };
  assert.throws(() => phase2InitialCurrentVisibleContext({
    screen: unsafeScreen,
    openingScreenDigest: canonicalDigest(unsafeScreen)
  }), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
});

test('revision 28 initial scene uses the authored presentation, not environment IDs', () => {
  const screen = {
    version: 1, schema: 'first_game_screen', screen_status: 'ready',
    party_id: 'party-28', main_prose: 'Старт.',
    visible_context: { place: 'берег крушения', calendar: 'утро',
      environment: { facts: ['cold', 'wet', 'exposed'] } }
  };
  const current = phase2InitialCurrentVisibleContext({
    screen, openingScreenDigest: canonicalDigest(screen),
    initialState: { position: { location_ref: 'shore' } },
    scenePresentation: { locations: [{ location_ref: 'shore',
      display_name: 'берег крушения',
      player_visible_physical_facts: ['Мокрый песок и ивняк тянутся вдоль берега реки.'] }] }
  });
  assert.deepEqual(current.sensory_details,
    ['Мокрый песок и ивняк тянутся вдоль берега реки.']);
  assert.equal(JSON.stringify(current).match(/cold|wet|exposed/), null);
});

test('public Phase 2 check omits private RNG audit', () => {
  const payload = {
    party_id: 'party-1',
    actor_id: 'player-1',
    party_state: { turn_number: 1, state_version: 1 },
    last_turn: {
      option_id: 'inspect',
      check_result: {
        check_id: 'check-1',
        roll: 10,
        total: 12,
        outcome: { success: true },
        audit: { seed_ref: 'private', algorithm: 'mulberry32_v1' }
      },
      time_update: null,
      body_update: null,
      consequence: {}
    }
  };
  const result = phase2PublicResult({ payload, screen: { schema: 'screen' } });
  assert.equal(Object.hasOwn(result.check, 'audit'), false);
  assert.deepEqual(detectHiddenLeaks(result), []);
});

test('public conversation check omits private RNG audit', () => {
  const payload = {
    party_id: 'party-1', actor_id: 'player-1',
    party_state: { turn_number: 1, state_version: 1 },
    conversation_statements: [{
      statement_id: 'statement-1',
      speaker_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
      utterance_text: 'Иди по тропе.'
    }],
    conversation_audiences: [{
      statement_ref: {
        entity_kind: 'conversation_statement', entity_id: 'statement-1'
      },
      received_messages: [{
        listener_ref: { entity_kind: 'player_character', entity_id: 'player-1' },
        comprehension: 'full', utterance_text: 'Иди по тропе.'
      }]
    }],
    last_turn: {
      option_id: 'talk', check_result: null, time_update: null,
      body_update: null,
      consequence: { conversation: {
        check_result: { roll: 12, audit: { seed_ref: 'private' } },
        semantic_exchange_projection: {
          factual_status: 'applied', response_kind: 'route_disclosure',
          npc_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
          statement_refs: [{
            entity_kind: 'conversation_statement', entity_id: 'statement-1'
          }],
          route_disclosure: { route_ref: 'route-1' }
        }
      } }
    }
  };
  const result = phase2PublicResult({ payload, screen: { schema: 'screen' } });
  assert.equal(Object.hasOwn(result.conversation.check_result, 'audit'), false);
  assert.deepEqual(detectHiddenLeaks(result), []);
});

test('public time projection never exposes the prepared execution ledger', () => {
  const payload = {
    party_id: 'party-1', actor_id: 'player-1',
    party_state: { turn_number: 1, state_version: 1 },
    last_turn: {
      option_id: 'rest', check_result: null, body_update: null,
      time_update: {
        owner: '@rus/time-events-history', schema: 'turn_time_update',
        version: 2,
        clock_before: clock('10'), clock_after: clock('40'),
        exact_elapsed: {
          exact_minutes: { numerator: '30', denominator: '1' }
        },
        boundary_trace: { processed_boundary_ids: [] },
        nearest_boundary: null,
        prepared_effect_ledger: {
          slices: [{ consequence: {
            check_result: { audit: { seed_ref: 'private' } }
          } }]
        }
      },
      consequence: {}
    }
  };
  const result = phase2PublicResult({ payload, screen: { schema: 'screen' } });
  assert.equal('prepared_effect_ledger' in result.time_update, false);
  assert.equal('boundary_trace' in result.time_update, false);
  assert.equal(result.time_update.clock_after.whole_minutes, '40');
  assert.deepEqual(detectHiddenLeaks(result), []);
});

function clock(wholeMinutes) {
  return {
    whole_minutes: wholeMinutes,
    subminute_numerator: '0', subminute_denominator: '1'
  };
}
