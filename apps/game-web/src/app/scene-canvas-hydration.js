import {
  renderForegroundWeather,
  renderLandscapeCanvas
} from '../features/landscape/canvas.js';
import {
  renderAuthoredPortrait,
  supportsAuthoredPortrait
} from '../features/conversation-portrait/authored-portrait.js';
import { renderPortrait } from '../portrait-lab/renderer.js';
import { validActiveInterlocutor } from '../shared/scene-affordances.js';

const generation = new WeakMap();

export async function hydrateSceneCanvases(root, screen, {
  landscapeRenderer = renderLandscapeCanvas,
  authoredPortraitRenderer = renderAuthoredPortrait,
  proceduralPortraitRenderer = renderPortrait,
  weatherRenderer = renderForegroundWeather
} = {}) {
  const token = Symbol('scene');
  generation.set(root, token);
  const current = () => generation.get(root) === token;
  const landscape = root?.querySelector?.('[data-landscape-canvas]');
  if (!landscape) return Object.freeze({
    landscape: null, portrait: null, weather: null
  });

  const landscapeResult = await landscapeRenderer(landscape, screen, {
    isCurrent: current
  }).catch(() => null);
  if (!current() || !landscapeResult || landscapeResult.cancelled) {
    return Object.freeze({
      landscape: landscapeResult, portrait: null, weather: null,
      cancelled: true
    });
  }

  const portrait = root.querySelector?.(
    '[data-conversation-portrait-canvas]'
  );
  const interlocutor = screen?.panels?.people?.data?.active_interlocutor;
  let portraitResult = null;
  if (portrait && validActiveInterlocutor(interlocutor)
      && (interlocutor.portrait_asset_id
        || interlocutor.portrait_spec_v1)) {
    const spec = interlocutor.portrait_spec_v1;
    if (supportsAuthoredPortrait(interlocutor.portrait_asset_id)) {
      portraitResult = await authoredPortraitRenderer(
        portrait, interlocutor.portrait_asset_id,
        spec?.expression?.emotion,
        landscapeResult.model.portraitLighting, {
          isCurrent: current
        }
      ).catch(() => current() && spec
        ? proceduralPortraitRenderer(
          portrait, spec, { fills: true, background: false }
        )
        : null);
    } else if (spec) {
      portraitResult = proceduralPortraitRenderer(portrait, spec, {
        fills: true,
        background: false
      });
    }
  }
  if (!current()) {
    return Object.freeze({
      landscape: landscapeResult, portrait: portraitResult, weather: null,
      cancelled: true
    });
  }
  const weather = weatherRenderer(
    root.querySelector?.('[data-scene-weather-canvas]'),
    landscapeResult.model
  );
  return Object.freeze({
    landscape: landscapeResult, portrait: portraitResult, weather,
    cancelled: false
  });
}
