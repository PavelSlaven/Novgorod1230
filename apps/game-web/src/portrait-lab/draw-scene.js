import { drawBackground } from './draw-background.js';
import { fillHandmadePatch, strokeHandmade } from './handmade.js';

export function drawPortraitScene(context, model, scene, {
  fills = true,
  background = true
} = {}) {
  if (background) drawBackground(context, model);
  if (fills) drawPatches(context, model, scene.patches);
  drawInkPass(context, model, scene, { monochrome: !fills });
}

function drawPatches(context, model, patches) {
  for (const entry of patches) {
    if (!entry.points?.length) continue;
    fillHandmadePatch(context, entry.points, {
      fill: entry.fill,
      seed: entry.seed,
      salt: entry.salt,
      roughness: entry.roughness,
      alpha: entry.alpha
    });
  }
}

function drawInkPass(context, model, scene, { monochrome }) {
  const orderedInk = [
    ...scene.strokes,
    ...scene.hatches,
    ...scene.scratches
  ];
  for (const entry of orderedInk) {
    if (!entry.points || entry.points.length < 2) continue;
    strokeHandmade(context, entry.points, {
      color: monochrome ? monochromeInk(model, entry) : entry.color,
      seed: entry.seed,
      salt: entry.salt,
      roughness: entry.roughness,
      width: entry.width,
      alpha: entry.alpha,
      double: entry.double,
      closed: entry.closed
    });
  }
}

function monochromeInk(model, entry) {
  if (entry.role?.includes('hatch') || entry.role?.includes('scratch')) {
    return model.ink.soft;
  }
  return model.ink.primary;
}
