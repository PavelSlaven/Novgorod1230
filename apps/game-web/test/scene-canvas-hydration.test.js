import test from 'node:test';
import assert from 'node:assert/strict';

import { hydrateSceneCanvases } from '../src/app/scene-canvas-hydration.js';
import { SAMPLE_PORTRAIT_SPEC } from '../src/portrait-lab/sample.js';

function screen(interlocutor = null) {
  return interlocutor ? { panels: { people: { data: {
    active_interlocutor: interlocutor
  } } } } : {};
}

function interlocutor(overrides = {}) {
  return {
    entity_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
    display_label: 'Еремей',
    ...overrides
  };
}

function root(canvases) {
  return { querySelector(selector) { return canvases[selector] ?? null; } };
}

test('late hydration cannot draw portrait or weather after next screen', async () => {
  let resolveOld;
  const canvases = {
    '[data-landscape-canvas]': { id: 'old-landscape' },
    '[data-conversation-portrait-canvas]': { id: 'old-portrait' },
    '[data-scene-weather-canvas]': { id: 'old-weather' }
  };
  const sceneRoot = root(canvases);
  const draws = [];
  const renderLandscape = (canvas) => canvas.id === 'old-landscape'
    ? new Promise((resolve) => { resolveOld = resolve; })
    : Promise.resolve({ model: { id: 'new' } });
  const options = {
    renderLandscape,
    renderProcedural(canvas) { draws.push(canvas.id); },
    renderWeather(canvas) { draws.push(canvas.id); }
  };
  const old = hydrateSceneCanvases(sceneRoot,
    screen(interlocutor({ portrait_spec_v1: SAMPLE_PORTRAIT_SPEC })), options);
  canvases['[data-landscape-canvas]'] = { id: 'new-landscape' };
  canvases['[data-conversation-portrait-canvas]'] = { id: 'new-portrait' };
  canvases['[data-scene-weather-canvas]'] = { id: 'new-weather' };
  await hydrateSceneCanvases(sceneRoot,
    screen(interlocutor({ portrait_spec_v1: SAMPLE_PORTRAIT_SPEC })), options);
  resolveOld({ model: { id: 'old' } });
  await old;
  assert.deepEqual(draws, ['new-portrait', 'new-weather']);
});

test('fallback landscape model reaches weather after portrait', async () => {
  const events = [];
  const model = { id: 'fallback' };
  const canvases = {
    '[data-landscape-canvas]': { id: 'landscape' },
    '[data-conversation-portrait-canvas]': { id: 'portrait' },
    '[data-scene-weather-canvas]': { id: 'weather' }
  };
  await hydrateSceneCanvases(root(canvases),
    screen(interlocutor({ portrait_spec_v1: SAMPLE_PORTRAIT_SPEC })), {
      async renderLandscape() { events.push('landscape'); return { model, fallback: true }; },
      renderProcedural() { events.push('portrait'); },
      renderWeather(canvas, received) { events.push('weather'); assert.equal(received, model); }
    });
  assert.deepEqual(events, ['landscape', 'portrait', 'weather']);
});

test('failed authored portrait uses complete procedural or SVG fallback', async () => {
  const canvas = { id: 'portrait' };
  const calls = [];
  const options = {
    async renderLandscape() { return { model: {} }; },
    async renderAuthored() { throw new Error('missing'); },
    renderProcedural() { calls.push('procedural'); }
  };
  await hydrateSceneCanvases(root({
    '[data-conversation-portrait-canvas]': canvas
  }), screen(interlocutor({
    portrait_asset_id: 'lower-dvina-eremey', portrait_spec_v1: SAMPLE_PORTRAIT_SPEC
  })), options);
  await hydrateSceneCanvases(root({
    '[data-conversation-portrait-canvas]': canvas
  }), screen(interlocutor({ portrait_asset_id: 'lower-dvina-eremey' })), options);
  assert.deepEqual(calls, ['procedural']);
});

test('portrait fallback changes only authored canvas layout', async () => {
  const fallback = { hidden: true };
  const container = {
    classList: { removed: [], remove(name) { this.removed.push(name); } },
    querySelector: () => fallback
  };
  const canvas = { hidden: false, parentElement: container };
  await hydrateSceneCanvases(root({
    '[data-conversation-portrait-canvas]': canvas
  }), screen(interlocutor({ portrait_asset_id: 'lower-dvina-eremey' })), {
    async renderLandscape() { return { model: {} }; },
    async renderAuthored() { throw new Error('missing'); }
  });
  assert.equal(canvas.hidden, true);
  assert.equal(fallback.hidden, false);
  assert.deepEqual(container.classList.removed,
    ['conversation-portrait--procedural']);
});

test('authored portrait receives emotion from portrait spec', async () => {
  let emotion;
  await hydrateSceneCanvases(root({
    '[data-conversation-portrait-canvas]': { id: 'portrait' }
  }), screen(interlocutor({
    portrait_asset_id: 'lower-dvina-eremey',
    portrait_spec_v1: SAMPLE_PORTRAIT_SPEC
  })), {
    async renderLandscape() { return { model: {} }; },
    renderAuthored(_canvas, _assetId, receivedEmotion) { emotion = receivedEmotion; }
  });
  assert.equal(emotion, 'suspicious');
});
