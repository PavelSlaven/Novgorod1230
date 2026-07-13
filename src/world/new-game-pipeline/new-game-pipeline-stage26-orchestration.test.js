import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexSource = fs.readFileSync(new URL('../src/world/new-game-pipeline/index.js', import.meta.url), 'utf8');
const screenWrapperSource = fs.readFileSync(new URL('../src/world/new-game-pipeline/screens/first-game-screen.js', import.meta.url), 'utf8');

test('Stage 26 orchestration uses isolated block and has no parallel screen payload path', () => {
  assert.match(indexSource, /runStage26FirstGameScreenBlock/u);
  assert.match(indexSource, /buildStage26Input/u);
  assert.doesNotMatch(indexSource, /buildPartyFirstScreenUiPayload/u);
  assert.doesNotMatch(indexSource, /party_screen_payload/u);
  assert.doesNotMatch(indexSource, /partyScreenPayload/u);
});

test('legacy context-bound runner and arbitrary input path are disabled', () => {
  assert.match(screenWrapperSource, /Legacy context-bound Stage 26 runner is (?:disabled|forbidden)/u);
  assert.doesNotMatch(screenWrapperSource, /context\.getStageOutput/u);
  assert.doesNotMatch(screenWrapperSource, /setStageOutput/u);
});
