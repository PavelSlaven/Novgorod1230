import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMapPanelState } from '../src/ui/map-panel.js';

test('map panel stays lazy until the details block is opened', () => {
  const state = buildMapPanelState({
    place: {
      exits: [
        { label: 'к переправе' },
        { label: 'к двору' }
      ]
    }
  }, false);

  assert.equal(state.open, false);
  assert.equal(state.shouldRenderGraph, false);
  assert.equal(state.badgeText, '2 пути');
});

test('map panel badge falls back when exits are missing', () => {
  const state = buildMapPanelState({}, true);

  assert.equal(state.open, true);
  assert.equal(state.shouldRenderGraph, true);
  assert.equal(state.badgeText, 'без путей');
});

test('map panel counts visible route archive entries too', () => {
  const state = buildMapPanelState({
    historical: {
      routeArchiveVisible: [
        { summary: 'Путь к реке' },
        { summary: 'Путь к двору' }
      ]
    }
  }, true);

  assert.equal(state.visibleExits, 2);
  assert.equal(state.badgeText, '2 пути');
});

test('map panel summarizes knowledge map nodes', () => {
  const state = buildMapPanelState({
    knowledgeMap: {
      knownPlaces: [{ label: 'двор' }],
      knownRoutes: [{ label: 'тракт к переправе' }],
      knownPeople: [{ label: 'Степан' }],
      knownFacts: [{ label: 'свидетели у ворот' }]
    }
  }, true);

  assert.equal(state.knowledgeCount, 2);
  assert.equal(state.knowledgeText, 'знаний 2');
});
