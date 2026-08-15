import { strokeHandmade } from '../../shared/handmade-canvas.js';
import { deterministicUnit } from '../../shared/deterministic-random.js';

export function drawAtmosphereAndFinishing(context, model, geometry) {
  drawWeather(context, model);
  drawFinishing(context, model, geometry);
}

function drawWeather(context, model) {
  if (model.atmosphere.precipitation === 'rain') drawRain(context, model);
  if (model.atmosphere.precipitation === 'snow') drawSnow(context, model);
  if (model.atmosphere.fogAlpha > 0) {
    const gradient = context.createLinearGradient(0, 160, 0, 650);
    gradient.addColorStop(0, 'rgba(228, 224, 211, 0)');
    gradient.addColorStop(.48,
      `rgba(228, 224, 211, ${model.atmosphere.fogAlpha})`);
    gradient.addColorStop(1, 'rgba(228, 224, 211, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 120, model.width, 570);
  }
}

function drawRain(context, model) {
  for (let index = 0; index < 62; index += 1) {
    const x = deterministicUnit(
      model.seeds.weather, 720 + index * 3
    ) * model.width;
    const y = deterministicUnit(
      model.seeds.weather, 721 + index * 3
    ) * model.height;
    const length = 12 + deterministicUnit(
      model.seeds.weather, 722 + index * 3
    ) * 24;
    strokeHandmade(context, [[x, y], [x - 7, y + length]], {
      color: model.palette.softInk,
      seed: model.seeds.weather,
      salt: 780 + index,
      roughness: .45,
      width: 1.15,
      alpha: .34
    });
  }
}

function drawSnow(context, model) {
  context.save();
  context.fillStyle = '#eee9dc';
  context.globalAlpha = .78;
  for (let index = 0; index < 54; index += 1) {
    const x = deterministicUnit(
      model.seeds.weather, 900 + index * 3
    ) * model.width;
    const y = deterministicUnit(
      model.seeds.weather, 901 + index * 3
    ) * model.height;
    const radius = 1.2 + deterministicUnit(
      model.seeds.weather, 902 + index * 3
    ) * 2.4;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawFinishing(context, model, geometry) {
  for (const [index, grass] of geometry.foreground.grass.entries()) {
    strokeHandmade(context, grass, {
      color: model.palette.softInk,
      seed: model.seeds.vegetation,
      salt: 1040 + index,
      roughness: .7,
      width: 1.2,
      alpha: .34
    });
  }
  if (model.atmosphere.exposedStrokes) {
    for (let index = 0; index < 7; index += 1) {
      const y = 90 + index * 58;
      strokeHandmade(context, [
        [70 + index * 36, y], [210 + index * 36, y - 10]
      ], {
        color: model.palette.softInk,
        seed: model.seeds.weather,
        salt: 1100 + index,
        roughness: 1.4,
        width: 1.1,
        alpha: .2
      });
    }
  }
  drawGrain(context, model);
}

function drawGrain(context, model) {
  context.save();
  context.strokeStyle = model.palette.softInk;
  context.globalAlpha = .08;
  for (let index = 0; index < 48; index += 1) {
    const x = deterministicUnit(
      model.seeds.sky, 1200 + index * 3
    ) * model.width;
    const y = deterministicUnit(
      model.seeds.sky, 1201 + index * 3
    ) * model.height;
    const length = 8 + deterministicUnit(
      model.seeds.sky, 1202 + index * 3
    ) * 34;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y + index % 3 - 1);
    context.stroke();
  }
  context.restore();
}
