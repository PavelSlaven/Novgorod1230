import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFirstGameScreenProjection,
  validateFirstGameScreen
} from '../src/world/new-game-pipeline/stages/stage26-first-game-screen.js';
import { computeStage25Digest } from '../src/world/new-game-pipeline/stages/stage25-party-commit.js';
import { computeNarratorStartingProseDigest } from '../src/world/new-game-pipeline/stages/stage23-narrator-prose-audit.js';
import { makeStage26Input } from './stage26-fixtures.mjs';

function mutable() { return structuredClone(makeStage26Input()); }
function rebindPublic(input) { input.stage25_party_commit_approval.party_public_state_digest = computeStage25Digest(input.committed_public_read_model); }
function rebindNarrator(input) {
  input.narrator_output_digest = computeNarratorStartingProseDigest(input.approved_narrator_output);
  input.narrator_prose_approval.narrator_output_digest = input.narrator_output_digest;
}

test('attention refs must come from committed public read model', () => {
  const input = mutable();
  input.committed_public_read_model.public_visible_npcs[0].npc_instance_id = 'npc-unknown';
  rebindPublic(input);
  const screen = buildFirstGameScreenProjection(input);
  // Remove the matching committed ref from index after projection to simulate tampering.
  const tamperedInput = structuredClone(input);
  tamperedInput.committed_public_read_model.public_visible_npcs = [];
  rebindPublic(tamperedInput);
  const validation = validateFirstGameScreen(screen, tamperedInput);
  assert.ok(validation.concerns.some((item) => item.code === 'FIRST_SCREEN_ATTENTION_REF_NOT_FOUND'));
});

test('action target must be approved and committed', () => {
  const input = mutable();
  input.approved_narrator_output.action_options[0].target_ref = { anchor_id: 'anchor-secret' };
  rebindNarrator(input);
  const screen = buildFirstGameScreenProjection(input);
  const validation = validateFirstGameScreen(screen, input);
  assert.ok(validation.concerns.some((item) => item.code === 'FIRST_SCREEN_ACTION_REF_NOT_FOUND'));
});

test('action kind and target cannot change after approval', () => {
  const input = makeStage26Input();
  const screen = structuredClone(buildFirstGameScreenProjection(input));
  screen.action_panel.suggested_actions[0].action_kind = 'open';
  screen.action_panel.suggested_actions[0].target_ref = { container_instance_id: 'container-chest-1' };
  const validation = validateFirstGameScreen(screen, input);
  assert.ok(validation.concerns.some((item) => item.code === 'FIRST_SCREEN_ACTION_CREATED_TARGET'));
});

test('explicit outcome promises are blocked', () => {
  const input = mutable();
  input.approved_narrator_output.action_options[0].promises_outcome = true;
  rebindNarrator(input);
  const screen = buildFirstGameScreenProjection(input);
  assert.ok(validateFirstGameScreen(screen, input).concerns.some((item) => item.code === 'FIRST_SCREEN_ACTION_PROMISES_OUTCOME'));
});

test('unknown exit cannot disclose exact destination', () => {
  const input = mutable();
  input.committed_public_read_model.public_visible_map.unknown_exits[0].destination_ref = 'anchor-secret-room';
  rebindPublic(input);
  const screen = buildFirstGameScreenProjection(input);
  assert.ok(validateFirstGameScreen(screen, input).concerns.some((item) => item.code === 'FIRST_SCREEN_UNKNOWN_ROUTE_DESTINATION_LEAK'));
});

test('map nodes must exist in committed knowledge', () => {
  const input = makeStage26Input();
  const screen = structuredClone(buildFirstGameScreenProjection(input));
  screen.map_panel.known_nearby_nodes.push({ node_ref: 'anchor-unknown', label: 'Неизвестное место' });
  assert.ok(validateFirstGameScreen(screen, input).concerns.some((item) => item.code === 'FIRST_SCREEN_MAP_REF_NOT_KNOWN'));
});

test('position and clock panels remain bound to committed state', () => {
  const input = makeStage26Input();
  const screen = structuredClone(buildFirstGameScreenProjection(input));
  screen.position_panel.position_ref.anchor_id = 'anchor-other';
  screen.time_panel.clock_ref.current_minute_of_day = 900;
  const codes = new Set(validateFirstGameScreen(screen, input).concerns.map((item) => item.code));
  assert.equal(codes.has('FIRST_SCREEN_POSITION_MISMATCH'), true);
  assert.equal(codes.has('FIRST_SCREEN_TIME_PANEL_CLOCK_CONFLICT'), true);
});
