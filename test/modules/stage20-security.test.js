import test from 'node:test';
import assert from 'node:assert/strict';
import * as stage20 from '@rus/new-game/stages/stage-20/compat';
import { makeStage20Input, makeVisibleContextPackage } from '../fixtures/stage20-21-fixtures.mjs';

function codesFor(pkg, input = makeStage20Input()) {
  return stage20.validateVisibleContextPackage(pkg, input).map((item) => item.code);
}

test('Stage 20 rejects private motives and future events in visible surfaces', () => {
  const input = makeStage20Input();
  const pkg = makeVisibleContextPackage(input);
  pkg.visible_scene_facts[0].private_motive = 'secret';
  pkg.visible_scene_facts[0].future_event = 'tomorrow';
  const codes = codesFor(pkg, input);
  assert.ok(codes.includes('VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK'));
  assert.ok(codes.includes('VISIBLE_CONTEXT_FUTURE_EVENT_LEAK'));
});

test('Stage 20 rejects new facts without approved source references', () => {
  const input = makeStage20Input();
  const pkg = makeVisibleContextPackage(input);
  pkg.visible_scene_facts[0].source_refs = ['unknown-ref'];
  assert.ok(codesFor(pkg, input).includes('VISIBLE_CONTEXT_CREATED_WORLD_FACT'));
});

test('Stage 20 rejects unknown entities and unsafe action targets', () => {
  const input = makeStage20Input();
  const pkg = makeVisibleContextPackage(input);
  pkg.visible_items.push({ item_instance_id: 'item-created-by-code' });
  pkg.available_actions_context[0].target_ref = { item_instance_id: 'item-created-by-code' };
  const codes = codesFor(pkg, input);
  assert.ok(codes.includes('VISIBLE_CONTEXT_ITEM_REF_NOT_FOUND'));
});

test('Stage 20 policy cannot weaken hidden boundary', () => {
  const input = makeStage20Input((values) => {
    values.visible_context_policy = { reject_private_motives: false };
  });
  const codes = stage20.validateStage20Input(input).map((item) => item.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_POLICY_INCOMPLETE'));
});
