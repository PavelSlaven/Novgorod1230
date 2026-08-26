import {
  ellipsePoints,
  fillHandmadePatch,
  strokeHandmade
} from '../../shared/handmade-canvas.js';
import { deterministicUnit } from '../../shared/deterministic-random.js';
import { loadImage } from '../../shared/image-cache.js';
import { drawAtmosphereAndFinishing } from './canvas-atmosphere.js';
import { buildLandscapeGeometry } from './geometry.js';
import { buildLandscapeRenderModel } from './render-model.js';

export async function renderLandscapeCanvas(canvas, screen, {
  imageLoader = loadImage,
  isCurrent = () => true
} = {}) {
  const context = canvas?.getContext?.('2d');
  if (!context) throw new TypeError('Landscape Canvas 2D context is required.');
  const model = buildLandscapeRenderModel(screen);
  if (model.assetUrl) {
    try {
      const image = await imageLoader(model.assetUrl);
      if (!isCurrent()) return cancelled(model);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return Object.freeze({
        model, cancelled: false, authored: true, fallback: false
      });
    } catch {
      if (!isCurrent()) return cancelled(model);
    }
  }
  if (!isCurrent()) return cancelled(model);
  const geometry = buildLandscapeGeometry(model);
  const scaleX = Number(canvas.width || model.width) / model.width;
  const scaleY = Number(canvas.height || model.height) / model.height;
  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.scale(scaleX, scaleY);
  drawLandscape(context, model, geometry);
  context.restore();
  return Object.freeze({
    model, geometry, cancelled: false, authored: false, fallback: true
  });
}

export { renderForegroundWeather } from './canvas-atmosphere.js';

function cancelled(model) {
  return Object.freeze({ model, cancelled: true, authored: false, fallback: false });
}

function drawLandscape(context, model, geometry) {
  drawSky(context, model);
  drawCelestial(context, model);
  drawClouds(context, model);
  drawTerrain(context, model, geometry);
  drawBuildings(context, model, geometry.buildings);
  drawVegetation(context, model, geometry.vegetation);
  drawAtmosphereAndFinishing(context, model, geometry);
}

function drawSky(context, model) {
  const gradient = context.createLinearGradient(0, 0, 0, model.height);
  gradient.addColorStop(0, model.palette.skyTop);
  gradient.addColorStop(.58, model.palette.skyHorizon);
  gradient.addColorStop(1, model.palette.groundLight);
  context.fillStyle = gradient;
  context.fillRect(0, 0, model.width, model.height);
}

function drawCelestial(context, model) {
  const { celestial, palette } = model;
  if (celestial.starCount > 0 && celestial.alpha > .1) {
    context.save();
    context.fillStyle = palette.celestial;
    context.globalAlpha = celestial.alpha * .72;
    for (let index = 0; index < celestial.starCount; index += 1) {
      const x = 45 + deterministicUnit(model.seeds.sky, 20 + index * 3) * 1190;
      const y = 24 + deterministicUnit(model.seeds.sky, 21 + index * 3) * 260;
      const radius = .7 + deterministicUnit(model.seeds.sky, 22 + index * 3) * 1.5;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
  if (celestial.sun) {
    fillHandmadePatch(context,
      ellipsePoints(celestial.sun[0], celestial.sun[1], 37, 37, 30), {
        fill: palette.celestial, seed: model.seeds.sky,
        salt: 110, roughness: 2.2, alpha: celestial.alpha * .78
      });
  }
  if (celestial.moon) {
    fillHandmadePatch(context,
      ellipsePoints(celestial.moon[0], celestial.moon[1], 27, 27, 30), {
        fill: palette.celestial, seed: model.seeds.sky,
        salt: 120, roughness: 1.8, alpha: celestial.alpha * .86
      });
    strokeHandmade(context,
      ellipsePoints(celestial.moon[0], celestial.moon[1], 27, 27, 30), {
        color: palette.softInk, seed: model.seeds.sky,
        salt: 121, roughness: 1.4, width: 1.4,
        alpha: celestial.alpha * .58, closed: true
      });
  }
}

function drawClouds(context, model) {
  for (let index = 0; index < model.atmosphere.clouds; index += 1) {
    const x = 35 + deterministicUnit(model.seeds.weather, 200 + index * 4) * 1100;
    const y = 52 + deterministicUnit(model.seeds.weather, 201 + index * 4) * 210;
    const width = 120 + deterministicUnit(model.seeds.weather, 202 + index * 4) * 220;
    const height = 25 + deterministicUnit(model.seeds.weather, 203 + index * 4) * 34;
    const cloud = [
      [x, y + height * .66],
      [x + width * .18, y + height * .22],
      [x + width * .4, y + height * .38],
      [x + width * .6, y],
      [x + width * .78, y + height * .34],
      [x + width, y + height * .66]
    ];
    strokeHandmade(context, cloud, {
      color: model.palette.softInk,
      seed: model.seeds.weather,
      salt: 220 + index,
      roughness: 3.2,
      width: 2,
      alpha: model.atmosphere.cloudAlpha,
      double: true
    });
  }
}

function drawTerrain(context, model, geometry) {
  fillHandmadePatch(context, geometry.terrainLayers[1].points, {
    fill: model.palette.ground,
    seed: model.seeds.terrain,
    salt: 300,
    roughness: 4.5,
    alpha: .94
  });
  strokeHandmade(context, geometry.horizon.points, {
    color: model.palette.softInk,
    seed: model.seeds.terrain,
    salt: 302,
    roughness: 2.8,
    width: 2.2,
    alpha: model.atmosphere.farAlpha,
    double: true
  });
  if (geometry.water) drawWater(context, model, geometry.water);
  if (geometry.route) drawRoute(context, model, geometry.route);
  for (const [index, ridge] of geometry.foreground.ridges.entries()) {
    strokeHandmade(context, ridge, {
      color: model.palette.softInk, seed: model.seeds.terrain,
      salt: 330 + index, roughness: 2.4, width: 1.8, alpha: .52
    });
  }
}

function drawWater(context, model, water) {
  for (const [index, points] of water.patches.entries()) {
    fillHandmadePatch(context, points, {
      fill: model.palette.water,
      seed: model.seeds.terrain,
      salt: 360 + index,
      roughness: 4,
      alpha: water.kind === 'wetland' ? .58 : .88
    });
  }
  const boundaries = water.kind === 'wetland' ? water.patches : [water.boundary];
  for (const [index, points] of boundaries.entries()) {
    strokeHandmade(context, points, {
      color: model.palette.ink,
      seed: model.seeds.terrain,
      salt: 380 + index,
      roughness: 2.2,
      width: 2.2,
      alpha: .72,
      closed: water.kind === 'wetland'
    });
  }
  for (const [index, ripple] of water.ripples.entries()) {
    strokeHandmade(context, ripple, {
      color: model.palette.waterLight,
      seed: model.seeds.terrain,
      salt: 400 + index,
      roughness: 1,
      width: 1.4,
      alpha: .46
    });
  }
}

function drawRoute(context, model, route) {
  fillHandmadePatch(context, route.patch, {
    fill: model.palette.groundLight,
    seed: model.seeds.terrain,
    salt: 450,
    roughness: 3.2,
    alpha: .7
  });
  for (const [index, boundary] of route.boundaries.entries()) {
    strokeHandmade(context, boundary, {
      color: model.palette.softInk,
      seed: model.seeds.terrain,
      salt: 460 + index,
      roughness: 2,
      width: 2,
      alpha: .64
    });
  }
  strokeHandmade(context, route.centerline, {
    color: model.palette.softInk,
    seed: model.seeds.terrain,
    salt: 470,
    roughness: 1.5,
    width: 1.3,
    alpha: .32
  });
}

function drawBuildings(context, model, buildings) {
  context.save();
  context.globalAlpha = model.atmosphere.farAlpha;
  for (const [index, building] of buildings.entries()) {
    fillHandmadePatch(context, building.wall, {
      fill: model.palette.built,
      seed: model.seeds.settlement,
      salt: 500 + index,
      roughness: 2.2,
      alpha: .84
    });
    strokeHandmade(context, building.roof, {
      color: model.palette.ink,
      seed: model.seeds.settlement,
      salt: 520 + index,
      roughness: 1.8,
      width: 2.3,
      alpha: .82
    });
    if (building.opening) {
      strokeHandmade(context, building.opening, {
        color: model.palette.ink,
        seed: model.seeds.settlement,
        salt: 540 + index,
        roughness: .7,
        width: 1.4,
        alpha: .62
      });
    }
  }
  context.restore();
}

function drawVegetation(context, model, vegetation) {
  for (const [index, bush] of vegetation.bushes.entries()) {
    const points = ellipsePoints(
      bush.anchor[0], bush.anchor[1] - bush.height * .45,
      bush.width * .5, bush.height, 18
    );
    fillHandmadePatch(context, points, {
      fill: model.palette.vegetation,
      seed: model.seeds.vegetation,
      salt: 580 + index,
      roughness: 3.8,
      alpha: .48 * model.atmosphere.farAlpha
    });
  }
  for (const [index, tree] of vegetation.trees.entries()) {
    fillHandmadePatch(context, tree.crown, {
      fill: model.palette.vegetation,
      seed: model.seeds.vegetation,
      salt: 620 + index,
      roughness: 5,
      alpha: .72 * model.atmosphere.farAlpha
    });
    strokeHandmade(context, tree.trunk, {
      color: model.palette.ink,
      seed: model.seeds.vegetation,
      salt: 650 + index,
      roughness: 1.6,
      width: 2.6,
      alpha: .7 * model.atmosphere.farAlpha,
      double: true
    });
  }
  for (const [index, reed] of vegetation.reeds.entries()) {
    strokeHandmade(context, [reed.anchor, reed.tip], {
      color: model.palette.vegetation,
      seed: model.seeds.vegetation,
      salt: 680 + index,
      roughness: .8,
      width: 1.6,
      alpha: .78
    });
  }
}
