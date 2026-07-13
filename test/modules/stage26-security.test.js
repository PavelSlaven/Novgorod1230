import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFirstGameScreenProjection,
  findForbiddenFirstScreenFields,
  validateFirstGameScreen
} from '@rus/new-game/stages/stage-26';
import { makeStage26Input } from '../fixtures/stage26-fixtures.mjs';

function concernCodes(screen, input) {
  return validateFirstGameScreen(screen, input).concerns.map((item) => item.code);
}

test('security walk rejects nested hidden-state fields', () => {
  const input = makeStage26Input();
  const screen = structuredClone(buildFirstGameScreenProjection(input));
  screen.character_panel.details = { hidden_state: { ambush: true } };
  assert.ok(concernCodes(screen, input).includes('FIRST_SCREEN_HIDDEN_STATE_LEAK'));
  assert.ok(findForbiddenFirstScreenFields(screen).some((item) => item.path.endsWith('hidden_state')));
});

test('security walk rejects private motives and closed-container truth', () => {
  const input = makeStage26Input();
  const screen = structuredClone(buildFirstGameScreenProjection(input));
  screen.attention_panel.visible_npcs[0].private_motives = ['deceive'];
  screen.attention_panel.visible_containers[0].closed_container_contents = ['silver'];
  const codes = concernCodes(screen, input);
  assert.ok(codes.includes('FIRST_SCREEN_PRIVATE_MOTIVE_LEAK'));
  assert.ok(codes.includes('FIRST_SCREEN_CLOSED_CONTAINER_CONTENTS_LEAK'));
});

test('security walk rejects technical IDs in display strings', () => {
  const input = makeStage26Input();
  const screen = structuredClone(buildFirstGameScreenProjection(input));
  screen.action_panel.suggested_actions[0].label = 'Осмотреть npc_watchman_secret';
  assert.ok(concernCodes(screen, input).includes('FIRST_SCREEN_RAW_ID_LEAK'));
});

test('unknown exits cannot reveal destination truth', () => {
  const input = makeStage26Input();
  const screen = structuredClone(buildFirstGameScreenProjection(input));
  screen.map_panel.unknown_exits[0].exact_destination = 'Скрытая пристань';
  assert.ok(concernCodes(screen, input).includes('FIRST_SCREEN_UNKNOWN_ROUTE_DESTINATION_LEAK'));
});

test('unapproved action targets are blocked', () => {
  const input = makeStage26Input();
  const screen = structuredClone(buildFirstGameScreenProjection(input));
  screen.action_panel.suggested_actions[0].target_ref = { npc_instance_id: 'npc-created-by-ui' };
  const codes = concernCodes(screen, input);
  assert.ok(codes.includes('FIRST_SCREEN_ACTION_REF_NOT_FOUND') || codes.includes('FIRST_SCREEN_ACTION_CREATED_TARGET'));
});
