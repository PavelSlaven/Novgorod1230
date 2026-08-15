import { renderLandscapeCanvas } from '../features/landscape/canvas.js';
import { renderPortrait } from '../portrait-lab/renderer.js';
import { validActiveInterlocutor } from '../shared/scene-affordances.js';

export function hydrateSceneCanvases(root, screen) {
  const landscape = root?.querySelector?.('[data-landscape-canvas]');
  const landscapeResult = landscape
    ? renderLandscapeCanvas(landscape, screen) : null;
  const portrait = root?.querySelector?.('[data-conversation-portrait-canvas]');
  const interlocutor = screen?.panels?.people?.data?.active_interlocutor;
  const portraitResult = portrait
      && validActiveInterlocutor(interlocutor)
      && interlocutor.portrait_spec_v1
    ? renderPortrait(portrait, interlocutor.portrait_spec_v1, {
        fills: true,
        background: false
      })
    : null;
  return Object.freeze({ landscape: landscapeResult, portrait: portraitResult });
}
