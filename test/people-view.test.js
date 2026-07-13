import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPeopleView } from '../src/ui/people-view.js';
import { buildUiState } from '../src/ui-state.js';
import { buildNpcProfile } from '../src/world/entities.js';
import { createWorldState } from '../src/world/state.js';

test('people view labels npc profile levels in the public summary', () => {
  const view = buildPeopleView([
    {
      name: 'Степан',
      role: 'крестьянин',
      status: 'свой',
      profileLevel: 'background',
      visibleStatus: 'свой',
      locationId: 'loc:1',
      reasonHere: 'стоит у ворот',
      propertyClues: ['выпуклость под одеждой']
    },
    {
      name: 'Отец',
      role: 'священник',
      status: 'уважаемый',
      profileLevel: 'key',
      visibleStatus: 'на виду',
      locationId: 'loc:1',
      reasonHere: 'разговаривает'
    }
  ]);

  assert.equal(view.summaryText, 'Рядом: 2 человека');
  assert.match(view.items[0].meta, /фоновый/);
  assert.match(view.items[1].meta, /ключевой/);
  assert.match(view.items[0].meta, /свой/);
  assert.match(view.items[1].meta, /на виду/);
  assert.match(view.items[0].lines.join(' · '), /занят зачем стоит у ворот/);
  assert.match(view.items[0].lines.join(' · '), /след имущества выпуклость под одеждой/);
  assert.match(view.items[1].lines.join(' · '), /занят зачем разговаривает/);
});

test('ui state preserves npc profile levels in the public snapshot', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  const currentLocationId = world.currentLocationId;
  const backgroundNpc = buildNpcProfile({
    id: 'npc-bg',
    name: 'Степан',
    role: 'крестьянин',
    locationId: currentLocationId,
    profileLevel: 'background'
  }, currentLocationId, 0, world.player);
  const keyNpc = buildNpcProfile({
    id: 'npc-key',
    name: 'староста',
    role: 'староста',
    locationId: currentLocationId,
    profileLevel: 'key'
  }, currentLocationId, 1, world.player);

  world.npcs = [backgroundNpc, keyNpc];

  const ui = buildUiState(world);

  assert.equal(ui.npcs[0].profileLevel, 'background');
  assert.equal(ui.npcs[1].profileLevel, 'key');
  assert.equal(ui.visibleNpcs[0].profileLevel, 'background');
  assert.equal(ui.visibleNpcs[1].profileLevel, 'key');
});
