import { rgba } from './canvas-utils.js';
import { fixedPatternUnit } from './render-model.js';

export function drawBackground(context, model) {
  context.fillStyle = model.background.paper;
  context.fillRect(0, 0, model.width, model.height);
  drawPaperFibers(context, model);
}

function drawPaperFibers(context, model) {
  context.save();
  context.strokeStyle = rgba(model.background.fiber, .075);
  context.fillStyle = rgba(model.background.fiber, .055);
  context.lineCap = 'round';
  for (let index = 0; index < 72; index += 1) {
    const x = fixedPatternUnit(200 + index * 4) * model.width;
    const y = fixedPatternUnit(201 + index * 4) * model.height;
    const length = 12 + fixedPatternUnit(202 + index * 4) * 48;
    const slope = (fixedPatternUnit(203 + index * 4) - .5) * 5;
    context.globalAlpha = .35 + fixedPatternUnit(500 + index) * .4;
    context.lineWidth = .45 + fixedPatternUnit(600 + index) * .5;
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
