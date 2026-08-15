import { rgba } from './canvas-utils.js';
import { deterministicUnit } from './render-model.js';

export function drawBackground(context, model) {
  context.fillStyle = model.background.paper;
  context.fillRect(0, 0, model.width, model.height);
  drawPaperFibers(context, model);
}

function drawPaperFibers(context, model) {
  const seed = model.identity.seeds.background;
  context.save();
  context.strokeStyle = rgba(model.background.fiber, .075);
  context.fillStyle = rgba(model.background.fiber, .055);
  context.lineCap = 'round';
  for (let index = 0; index < 72; index += 1) {
    const x = deterministicUnit(seed, 200 + index * 4) * model.width;
    const y = deterministicUnit(seed, 201 + index * 4) * model.height;
    const length = 12 + deterministicUnit(seed, 202 + index * 4) * 48;
    const slope = (deterministicUnit(seed, 203 + index * 4) - .5) * 5;
    context.globalAlpha = .35 + deterministicUnit(seed, 500 + index) * .4;
    context.lineWidth = .45 + deterministicUnit(seed, 600 + index) * .5;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y + slope);
    context.stroke();
    if (index % 6 === 0) {
      context.beginPath();
      context.arc(x - 4, y + 2, .55 + index % 3 * .18, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}
