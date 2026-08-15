import { deterministicUnit } from '../../shared/deterministic-random.js';
const PROFILE = Object.freeze({
  'env.local_variable': {
    horizonY: 378, water: null, route: false,
    trees: 2, bushes: 4, reeds: 0, rough: 1
  },
  'env.main_river_channel': {
    horizonY: 342, water: 'main', route: false,
    trees: 0, bushes: 0, reeds: 0, rough: 0
  },
  'env.side_channel': {
    horizonY: 360, water: 'channel', route: false,
    trees: 4, bushes: 5, reeds: 12, rough: 0
  },
  'env.land_path': {
    horizonY: 370, water: null, route: true,
    trees: 3, bushes: 5, reeds: 0, rough: 1
  },
  'env.forest_track': {
    horizonY: 330, water: null, route: true,
    trees: 12, bushes: 8, reeds: 0, rough: 0
  },
  'env.wetland': {
    horizonY: 416, water: 'wetland', route: false,
    trees: 1, bushes: 4, reeds: 20, rough: 0
  },
  'env.offroad': {
    horizonY: 368, water: null, route: false,
    trees: 3, bushes: 6, reeds: 0, rough: 5
  },
  'env.shore_transition': {
    horizonY: 356, water: 'shore', route: false,
    trees: 2, bushes: 4, reeds: 8, rough: 1
  }
});

const NEUTRAL = Object.freeze({
  horizonY: 378, water: null, route: false,
  trees: 0, bushes: 2, reeds: 0, rough: 1
});

export function buildLandscapeGeometry(model) {
  const config = PROFILE[model.semantics.environmentProfile] ?? NEUTRAL;
  const horizon = buildHorizon(model, config);
  const water = buildWater(model, config, horizon);
  const route = config.route ? buildRoute(model, horizon) : null;
  const vegetation = buildVegetation(model, config, horizon, water);
  const buildings = buildBuildings(model, horizon);
  const foreground = buildForeground(model, config);
  const ground = [
    ...horizon.points,
    [model.width, model.height],
    [0, model.height]
  ];
  return deepFreeze({
    width: model.width,
    height: model.height,
    horizon,
    terrainLayers: [
      { id: 'far_ground', points: horizon.points },
      { id: 'ground', points: ground }
    ],
    water,
    route,
    vegetation,
    buildings,
    foreground
  });
}

function buildHorizon(model, config) {
  const count = 9;
  const points = Array.from({ length: count }, (_, index) => {
    const x = index / (count - 1) * model.width;
    const edge = index === 0 || index === count - 1;
    const y = config.horizonY + (edge ? 0
      : (deterministicUnit(model.seeds.terrain, 20 + index) - .5) * 28);
    return [round(x), round(y)];
  });
  return { y: config.horizonY, points };
}

function buildWater(model, config, horizon) {
  if (config.water === 'main') {
    const boundary = horizon.points.map(([x], index) => [
      x,
      round(horizon.y + 42
        + Math.sin(index * .78) * 10
        + deterministicUnit(model.seeds.terrain, 100 + index) * 9)
    ]);
    return water('main', [[...boundary, [model.width, model.height],
      [0, model.height]]], boundary);
  }
  if (config.water === 'channel') {
    const left = [[610, horizon.y + 8], [520, 455], [338, 570], [90, 720]];
    const right = [[684, horizon.y + 6], [750, 454], [882, 570], [1080, 720]];
    return water('channel', [[...left, ...right.slice().reverse()]],
      [...left, ...right.slice().reverse()]);
  }
  if (config.water === 'shore') {
    const boundary = [
      [820, horizon.y - 4], [742, 430], [674, 510], [610, 605], [530, 720]
    ];
    return water('shore', [[...boundary, [1280, 720], [1280, horizon.y - 4]]],
      boundary);
  }
  if (config.water === 'wetland') {
    const patches = Array.from({ length: 4 }, (_, index) => {
      const cx = 175 + index * 290
        + deterministicUnit(model.seeds.terrain, 180 + index) * 80;
      const cy = 500 + (index % 2) * 92;
      const rx = 105 + deterministicUnit(model.seeds.terrain, 190 + index) * 70;
      const ry = 18 + deterministicUnit(model.seeds.terrain, 200 + index) * 22;
      return ellipsePolygon(cx, cy, rx, ry, 18);
    });
    return water('wetland', patches, patches.flatMap((patch) => patch));
  }
  return null;
}

function water(kind, patches, boundary) {
  return {
    kind,
    patches,
    boundary,
    ripples: patches.flatMap((patch, patchIndex) => {
      const ys = patch.map(([, y]) => y);
      const xs = patch.map(([x]) => x);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      return Array.from({ length: kind === 'wetland' ? 2 : 5 }, (_, index) => {
        const t = (index + 1) / (kind === 'wetland' ? 3 : 6);
        const y = minY + (maxY - minY) * t;
        const inset = (maxX - minX) * (.14 + patchIndex * .01);
        return [[minX + inset, y], [maxX - inset, y + index % 2 * 3]];
      });
    })
  };
}

function buildRoute(model, horizon) {
  const center = model.width * (.48
    + (deterministicUnit(model.seeds.terrain, 240) - .5) * .16);
  const topY = horizon.y + 9;
  const left = [[center - 18, topY], [center - 74, 500], [center - 255, 720]];
  const right = [[center + 16, topY], [center + 62, 500], [center + 225, 720]];
  return {
    patch: [...left, ...right.slice().reverse()],
    boundaries: [left, right],
    centerline: [[center, topY], [center - 7, 500], [center - 32, 720]],
    groundArea: { top: horizon.y, bottom: model.height }
  };
}

function buildVegetation(model, config, horizon, waterGeometry) {
  const trees = Array.from({ length: config.trees }, (_, index) => {
    const [x, anchorY] = vegetationAnchor(
      model, index, config.trees, waterGeometry, horizon, 'tree'
    );
    const height = 60 + deterministicUnit(
      model.seeds.vegetation, 360 + index
    ) * (model.semantics.environmentProfile === 'env.forest_track' ? 150 : 90);
    return tree(x, anchorY, height, model.seeds.vegetation, index);
  });
  const bushes = Array.from({ length: config.bushes }, (_, index) => {
    const [x, y] = vegetationAnchor(
      model, index, config.bushes, waterGeometry, horizon, 'bush'
    );
    const width = 44 + deterministicUnit(
      model.seeds.vegetation, 460 + index
    ) * 90;
    return { anchor: [x, y], width, height: 20 + width * .18 };
  });
  const reeds = Array.from({ length: config.reeds }, (_, index) => {
    const anchor = reedAnchor(model, index, config.reeds, waterGeometry, horizon);
    const height = 24 + deterministicUnit(
      model.seeds.vegetation, 520 + index
    ) * 52;
    return { anchor, tip: [anchor[0] + (index % 3 - 1) * 5, anchor[1] - height] };
  });
  return { trees, bushes, reeds };
}

function vegetationAnchor(model, index, count, waterGeometry, horizon, kind) {
  const progress = (index + .5) / Math.max(1, count);
  const depth = kind === 'tree' ? 44 : 82;
  if (waterGeometry?.kind === 'main') {
    return [spacedX(model, index, count, 300), horizon.y + 42];
  }
  if (waterGeometry?.kind === 'channel') {
    const left = index % 2 === 0;
    const local = (Math.floor(index / 2) + .5) / Math.max(1, Math.ceil(count / 2));
    return [left ? 45 + local * 390 : 1010 + local * 225,
      horizon.y + depth + local * 190];
  }
  if (waterGeometry?.kind === 'shore') {
    return [55 + progress * 430, horizon.y + depth + progress * 190];
  }
  return [
    spacedX(model, index, count, kind === 'tree' ? 300 : 420),
    horizon.y + (kind === 'tree' ? 42 : 55)
      + deterministicUnit(
        model.seeds.vegetation,
        (kind === 'tree' ? 340 : 440) + index
      ) * (kind === 'tree' ? 96 : 145)
  ];
}

function buildBuildings(model, horizon) {
  const count = model.semantics.nodeCategory === 'spatial.g3.settlement'
    ? 5
    : model.semantics.nodeCategory === 'spatial.g3.built_site' ? 2 : 0;
  return Array.from({ length: count }, (_, index) => {
    const width = 58 + deterministicUnit(
      model.seeds.settlement, 600 + index
    ) * 62;
    const height = 34 + deterministicUnit(
      model.seeds.settlement, 620 + index
    ) * 38;
    const x = 230 + index * (count === 2 ? 420 : 154)
      + (deterministicUnit(model.seeds.settlement, 640 + index) - .5) * 42;
    const groundY = horizon.y + 32 + (index % 2) * 13;
    const left = x - width / 2;
    const right = x + width / 2;
    return {
      groundAnchor: [round(x), round(groundY)],
      wall: [[left, groundY - height], [right, groundY - height],
        [right, groundY], [left, groundY]],
      roof: [[left - 8, groundY - height], [x, groundY - height - height * .55],
        [right + 8, groundY - height]],
      opening: index % 2 === 0
        ? [[x - 5, groundY - height * .45], [x + 5, groundY - height * .45]]
        : null
    };
  });
}

function buildForeground(model, config) {
  const ridges = Array.from({ length: config.rough }, (_, index) => {
    const x = 70 + index * 235
      + deterministicUnit(model.seeds.terrain, 700 + index) * 90;
    const y = 595 + deterministicUnit(model.seeds.terrain, 720 + index) * 100;
    return [[x - 70, y + 22], [x, y], [x + 88, y + 18]];
  });
  const grass = Array.from({ length: 20 }, (_, index) => {
    const x = deterministicUnit(model.seeds.vegetation, 760 + index) * model.width;
    const y = 560 + deterministicUnit(model.seeds.vegetation, 800 + index) * 155;
    const height = 8 + deterministicUnit(model.seeds.vegetation, 840 + index) * 24;
    return [[x, y], [x + (index % 3 - 1) * 5, y - height]];
  });
  return { ridges, grass };
}

function tree(x, anchorY, height, seed, index) {
  const crownWidth = height * (.26 + deterministicUnit(seed, 380 + index) * .18);
  const crownY = anchorY - height * .72;
  return {
    anchor: [round(x), round(anchorY)],
    trunk: [[round(x), round(anchorY)], [round(x + (index % 3 - 1) * 3), round(anchorY - height)]],
    crown: ellipsePolygon(x, crownY, crownWidth, height * .34, 16)
  };
}

function reedAnchor(model, index, count, waterGeometry, horizon) {
  if (waterGeometry?.kind === 'shore') {
    return [720 + index / Math.max(1, count - 1) * 250,
      445 + index / Math.max(1, count - 1) * 220];
  }
  if (waterGeometry?.kind === 'channel') {
    const left = index % 2 === 0;
    return [left ? 360 + index * 18 : 850 + index * 11,
      500 + index / Math.max(1, count - 1) * 190];
  }
  return [60 + index / Math.max(1, count - 1) * 1160,
    horizon.y + 70 + index % 4 * 48];
}

function spacedX(model, index, count, salt) {
  const slot = model.width / Math.max(1, count);
  return round(slot * (index + .5)
    + (deterministicUnit(model.seeds.vegetation, salt + index) - .5)
      * slot * .54);
}
function ellipsePolygon(cx, cy, rx, ry, count) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    return [round(cx + Math.cos(angle) * rx), round(cy + Math.sin(angle) * ry)];
  });
}
function round(value) {
  return Math.round(value * 100) / 100;
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
