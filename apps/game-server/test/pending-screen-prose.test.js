import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingScreenFor } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-3-read-projection.js';
import { phase4PendingScreen } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-write-projection.js';
import { phase5PendingScreen } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-5-writes.js';
import { phase6PendingScreen } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-6-writes.js';
import { phase7PendingScreen } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-writes.js';
import { buildLowerDvinaTracePendingScreen } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-presentation.js';
import { committedPendingPhase2PublicResult } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { successEnvelope } from '../src/http/contracts.js';

const scene = 'У берега темнеет вода и качается лодка.';
const pendingMessage =
  'Факты хода сохранены; повествование ожидает повторной доставки.';
const exactUtterance = { speaker_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
  utterance_text: 'Сеть я отложил.', provenance: {
    source: 'phase3_statement_receipt', player_receipt: 'full',
    precommit_service_marker_check: true,
    statement_ref: { entity_kind: 'conversation_statement',
      entity_id: 'statement-1' },
    listener_ref: { entity_kind: 'player_character', entity_id: 'actor-1' },
    receipt_utterance_text: 'Сеть я отложил.'
  } };
const state = { party_id: 'party-1', actor_id: 'actor-1',
  party_state: { turn_number: 1, state_version: 'v1' },
  player_profile: {}, last_turn: { consequence: {},
    exact_npc_utterances: [exactUtterance] }, opening_identity: {
    opening_screen_digest: 'opening-digest'
  } };
const factual = { mode_resolution: { turn_id: 'turn-1' } };
const visibleEnvelope = { package_id: 'visible:turn-1',
  package_digest: 'visible-digest', visible_payload: {
    perceived_scene: scene, perceived_changes: [], sensory_details: [],
    visible_npcs: [], visible_objects: [], known_context: [], uncertainties: []
  } };
const common = { state, factual, visibleEnvelope, turnNumber: 1,
  nextVersion: 'v2' };

test('pending screens do not publish unapproved scene prose', () => {
  const phase3 = pendingScreenFor({ state, factual, visibleEnvelope,
    visibleContext: { visible_scene: scene, visible_changes: [],
      sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [] } });
  const screens = [phase3, phase4PendingScreen(common),
    phase5PendingScreen(common), phase6PendingScreen(common),
    phase7PendingScreen(common)];
  assert.ok(screens.every((screen) => screen.main_prose === pendingMessage));
  assert.ok(screens.every((screen) => !screen.main_prose.includes(scene)));
  assert.ok(screens.every((screen) =>
    screen.exact_npc_utterances?.[0]?.utterance_text === 'Сеть я отложил.'));

  const shared = buildLowerDvinaTracePendingScreen({ state, turnId: 'turn-1',
    nextVersion: 'v2', turnNumber: 1, visibleEnvelope });
  const publicResult = committedPendingPhase2PublicResult({
    payload: state, screen: shared
  });
  const envelope = successEnvelope(publicResult);
  assert.equal(envelope.data.screen.main_prose, pendingMessage);
  assert.equal(envelope.data.screen.visible_context.visible_scene, scene);
  assert.deepEqual(Object.keys(envelope.data.screen.exact_npc_utterances[0]).sort(),
    ['speaker_ref', 'utterance_text']);
});
