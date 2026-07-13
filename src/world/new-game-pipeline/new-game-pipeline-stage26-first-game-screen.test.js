import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFirstGameScreenProjection,
  buildFirstScreenCodePrecheck,
  runStage26FirstGameScreenBlock,
  validateFirstGameScreen,
  validateProvidedStage26Result
} from '../src/world/new-game-pipeline/stages/stage26-first-game-screen.js';
import { makeActionAudit, makeSafetyAudit, makeStage26Input } from './stage26-fixtures.mjs';

test('Stage 26 exact input, projection, audits and immutable result pass', async () => {
  const input = makeStage26Input();
  const precheck = buildFirstScreenCodePrecheck(input);
  assert.equal(precheck.pass, true, JSON.stringify(precheck.concerns));
  const projected = buildFirstGameScreenProjection(input);
  assert.equal(validateFirstGameScreen(projected, input).pass, true);
  const result = await runStage26FirstGameScreenBlock({
    input,
    safetyAuditor: async ({ input: role }) => makeSafetyAudit(role.first_game_screen, input),
    actionLabelAuditor: async ({ input: role }) => makeActionAudit({ ...projected, attention_panel: role.attention_panel, action_panel: role.action_panel, map_panel: { ...projected.map_panel, unknown_exits: role.map_unknown_exits } }, input)
  });
  assert.equal(result.pass, true, JSON.stringify(result.concerns));
  assert.equal(result.first_game_screen.ui_safety_boundary.player_sees_only_character_safe_context, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.first_game_screen), true);
});

test('projection preserves approved action and attention refs', () => {
  const input = makeStage26Input();
  const screen = buildFirstGameScreenProjection(input);
  assert.equal(screen.action_panel.suggested_actions[0].option_id, 'option-look-gate');
  assert.equal(screen.action_panel.suggested_actions[0].target_ref.anchor_id, 'anchor-gate');
  assert.equal(screen.attention_panel.visible_npcs[0].source_ref, 'npc-watchman-1');
  assert.equal(screen.map_panel.known_current_node.node_ref, 'anchor-gate');
});

test('provided Stage 26 output is forbidden', () => {
  assert.throws(() => validateProvidedStage26Result(), /forbidden/u);
});
