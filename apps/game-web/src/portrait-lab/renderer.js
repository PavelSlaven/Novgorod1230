import { assertPortraitSpecV1 } from './contract.js';
import { drawPortraitScene } from './draw-scene.js';
import { buildPortraitScene } from './portrait-scene.js';
import { buildRenderModel } from './render-model.js';

export function renderPortrait(canvas, spec, { fills = true } = {}) {
  assertPortraitSpecV1(spec);
  const context = canvas?.getContext?.('2d');
  if (!context) throw new TypeError('Canvas 2D context is required.');
  const model = buildRenderModel(spec);
  const scene = buildPortraitScene(model);
  const scaleX = Number(canvas.width || model.width) / model.width;
  const scaleY = Number(canvas.height || model.height) / model.height;

  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.scale(scaleX, scaleY);
  drawPortraitScene(context, model, scene, { fills });
  context.restore();
  return model;
}

export { buildRenderModel } from './render-model.js';
export { buildPortraitScene } from './portrait-scene.js';
