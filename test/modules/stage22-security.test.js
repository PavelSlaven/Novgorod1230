import test from 'node:test';
import assert from 'node:assert/strict';
import * as stage22 from '@rus/new-game/stages/stage-22/compat';
import { makeNarratorProse, makeStage22Input } from '../fixtures/stage22-23-fixtures.mjs';

test('Stage 22 rejects hidden-state fields in exact input', () => {
  const input = structuredClone(makeStage22Input());
  input.visible_context_package.full_hidden_scene_state = { motive: 'secret' };
  const codes = stage22.validateStage22Input(input).map((item) => item.code);
  assert.ok(codes.includes('NARRATOR_INPUT_FORBIDDEN_FIELD'));
});

test('Stage 22 rejects unapproved action targets', () => {
  const input = makeStage22Input();
  const precheck = stage22.buildNarratorStartCodePrecheck(input);
  const prose = makeNarratorProse();
  prose.action_options[0].target_ref = { npc_instance_id: 'npc-unapproved' };
  const codes = stage22.validateNarratorStartingProseOutput(prose, input, precheck).map((item) => item.code);
  assert.ok(codes.includes('NARRATOR_ACTION_TARGET_NOT_VISIBLE'));
});

test('Stage 22 rejects technical pipeline language in player prose', () => {
  const input = makeStage22Input();
  const precheck = stage22.buildNarratorStartCodePrecheck(input);
  const prose = makeNarratorProse({ prose: 'Pipeline schema сообщает о воротах.' });
  const codes = stage22.validateNarratorStartingProseOutput(prose, input, precheck).map((item) => item.code);
  assert.ok(codes.includes('NARRATOR_TECHNICAL_TEXT_PRESENT'));
});

test('Stage 22 cannot weaken the visible-context-only policy', () => {
  const input = makeStage22Input((values) => { values.narrator_policy = { do_not_add_new_world_facts: false }; });
  const codes = stage22.validateStage22Input(input).map((item) => item.code);
  assert.ok(codes.includes('NARRATOR_POLICY_WEAKENED'));
});
