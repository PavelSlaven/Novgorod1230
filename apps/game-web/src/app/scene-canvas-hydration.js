import {
  renderForegroundWeather,
  renderLandscapeCanvas
} from '../features/landscape/canvas.js';
import { renderAuthoredPortrait, supportsAuthoredPortrait } from
  '../features/conversation-portrait/authored-portrait.js';
import { renderPortrait } from '../portrait-lab/renderer.js';
import { validActiveInterlocutor } from '../shared/scene-affordances.js';

const generations = new WeakMap();

export async function hydrateSceneCanvases(root, screen, {
  renderLandscape = renderLandscapeCanvas,
  renderAuthored = renderAuthoredPortrait,
  renderProcedural = renderPortrait,
  renderWeather = renderForegroundWeather
} = {}) {
  if (!root) return Object.freeze({ landscape: null, portrait: null });
  const generation = (generations.get(root) ?? 0) + 1;
  generations.set(root, generation);
  const isCurrent = () => generations.get(root) === generation;
  const landscape = root?.querySelector?.('[data-landscape-canvas]');
  const landscapeResult = landscape
    ? await renderLandscape(landscape, screen, { isCurrent }) : null;
  if (!isCurrent()) return cancelled(landscapeResult);

  const portrait = root?.querySelector?.('[data-conversation-portrait-canvas]');
  const interlocutor = screen?.panels?.people?.data?.active_interlocutor;
  const portraitResult = await hydratePortrait(portrait, interlocutor,
    landscapeResult?.model?.portraitLighting, {
      isCurrent, renderAuthored, renderProcedural
    });
  if (!isCurrent()) return cancelled(landscapeResult, portraitResult);

  const weather = root?.querySelector?.('[data-scene-weather-canvas]');
  if (weather && landscapeResult?.model) renderWeather(weather, landscapeResult.model);
  return Object.freeze({ landscape: landscapeResult, portrait: portraitResult });
}

async function hydratePortrait(canvas, interlocutor, lighting, {
  isCurrent, renderAuthored, renderProcedural
}) {
  if (!canvas || !validActiveInterlocutor(interlocutor)) return null;
  const spec = interlocutor.portrait_spec_v1;
  if (supportsAuthoredPortrait(interlocutor.portrait_asset_id)) {
    try {
      return await renderAuthored(canvas, interlocutor.portrait_asset_id,
        spec?.expression?.emotion, lighting, { isCurrent });
    } catch {
      if (!isCurrent()) return null;
      return spec ? renderProcedural(canvas, spec, {
        fills: true, background: false
      }) : showPortraitFallback(canvas);
    }
  }
  return spec ? renderProcedural(canvas, spec, {
    fills: true, background: false
  }) : showPortraitFallback(canvas);
}

function showPortraitFallback(canvas) {
  const container = canvas?.parentElement;
  const fallback = container?.querySelector?.(
    '[data-conversation-portrait-fallback]'
  );
  if (!fallback) return false;
  canvas.hidden = true;
  fallback.hidden = false;
  container.classList?.remove('conversation-portrait--procedural');
  return true;
}

function cancelled(landscape, portrait = null) {
  return Object.freeze({ landscape, portrait, cancelled: true });
}
