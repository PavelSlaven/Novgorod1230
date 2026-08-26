import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import {
  buildLandscapeGeometry,
  buildLandscapeRenderModel
} from '../src/features/landscape/render.js';
import { loadImage } from '../src/shared/image-cache.js';
import {
  renderForegroundWeather,
  renderLandscapeCanvas
} from '../src/features/landscape/canvas.js';
import {
  LANDSCAPE_DAY_PARTS,
  LANDSCAPE_SCENES,
  LANDSCAPE_WEATHER,
  LOWER_DVINA_LANDSCAPE_SCENES
} from '../src/features/landscape/render-model.js';
import { LANDSCAPE_CONTROL_SHEET_CASES } from
  './landscape-control-sheet.js';
import {
  AUTHORED_PORTRAIT_ASSETS,
  PORTRAIT_EMOTIONS,
  authoredPortraitUrls,
  renderAuthoredPortrait,
  supportsAuthoredPortrait
} from '../src/features/conversation-portrait/authored-portrait.js';

const PUBLIC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

function screen({
  profile = 'env.local_variable',
  nodeCategory = 'spatial.g3.natural_feature',
  dayPart = 'day',
  weather = 'clear',
  facts = [],
  locationLabel = 'Нейтральная подпись',
  prose = 'Текст не является семантическим входом.'
} = {}) {
  return {
    main_prose: prose,
    visible_context: {
      location_label: locationLabel,
      environment: {
        profile_id: profile,
        node_category: nodeCategory,
        facts
      },
      day_part: dayPart,
      weather
    }
  };
}

function scene(overrides) {
  const model = buildLandscapeRenderModel(screen(overrides));
  return { model, geometry: buildLandscapeGeometry(model) };
}

function canvasMock() {
  const calls = [];
  const context = new Proxy({
    calls,
    createLinearGradient() {
      calls.push(['createLinearGradient']);
      return { addColorStop() {} };
    }
  }, {
    get(target, property) {
      if (property in target) return target[property];
      return (...args) => calls.push([property, ...args]);
    },
    set(target, property, value) {
      calls.push([property, value]);
      target[property] = value;
      return true;
    }
  });
  return {
    width: 1280,
    height: 720,
    calls,
    getContext: () => context
  };
}

test('canvas uses authored bitmap exactly once when it loads', async () => {
  const canvas = canvasMock();
  const image = {};
  let loads = 0;
  const result = await renderLandscapeCanvas(canvas, screen(), {
    imageLoader: async (url) => {
      loads += 1;
      assert.equal(url, '/assets/landscape/open_meadow/day-clear.webp');
      return image;
    }
  });
  assert.equal(loads, 1);
  assert.equal(result.authored, true);
  assert.equal(result.fallback, false);
  assert.equal(canvas.calls.filter(([name]) => name === 'drawImage').length, 1);
});

test('unknown scene renders procedural landscape without image load', async () => {
  const canvas = canvasMock();
  const result = await renderLandscapeCanvas(canvas, screen({
    profile: 'unknown-profile'
  }), {
    imageLoader: () => assert.fail('unexpected image load')
  });
  assert.equal(result.authored, false);
  assert.equal(result.fallback, true);
  assert.ok(result.geometry);
});

test('failed authored load falls back once with same model', async () => {
  const canvas = canvasMock();
  const urls = [];
  const result = await renderLandscapeCanvas(canvas, screen(), {
    imageLoader: async (url) => {
      urls.push(url);
      throw new Error('missing');
    }
  });
  assert.deepEqual(urls, ['/assets/landscape/open_meadow/day-clear.webp']);
  assert.equal(result.fallback, true);
  assert.deepEqual(result.geometry, buildLandscapeGeometry(result.model));
});

test('stale authored loads never draw or fall back', async () => {
  for (const failure of [false, true]) {
    const canvas = canvasMock();
    let settle;
    let current = true;
    const rendering = renderLandscapeCanvas(canvas, screen(), {
      isCurrent: () => current,
      imageLoader: () => new Promise((resolve, reject) => {
        settle = failure ? reject : resolve;
      })
    });
    current = false;
    settle(failure ? new Error('late failure') : {});
    const result = await rendering;
    assert.equal(result.cancelled, true);
    assert.equal(canvas.calls.length, 0);
  }
});

test('foreground weather draws deterministic native canvas overlays only', () => {
  const rain = canvasMock();
  renderForegroundWeather(rain, buildLandscapeRenderModel(screen({ weather: 'rain' })));
  assert.ok(rain.calls.some(([name]) => name === 'stroke'));

  const snow = canvasMock();
  renderForegroundWeather(snow, buildLandscapeRenderModel(screen({ weather: 'snow' })));
  assert.ok(snow.calls.some(([name]) => name === 'arc'));

  const fog = canvasMock();
  renderForegroundWeather(fog, buildLandscapeRenderModel(screen({ weather: 'fog' })));
  assert.ok(fog.calls.some(([name]) => name === 'fillRect'));

  const interior = canvasMock();
  renderForegroundWeather(interior, buildLandscapeRenderModel({
    scene_asset_id: 'lower-dvina-old-drying-shed-interior',
    visible_context: { day_part: 'day', weather: 'rain' }
  }));
  assert.deepEqual(interior.calls, [['clearRect', 0, 0, 1280, 720]]);
});

test('terrain geometry is scoped away from weather, day and presentation facts', () => {
  const base = scene({
    profile: 'env.main_river_channel', dayPart: 'day', weather: 'clear'
  });
  for (const variation of [{
    profile: 'env.main_river_channel', dayPart: 'night', weather: 'fog'
  }, {
    profile: 'env.main_river_channel', dayPart: 'dawn', weather: 'snow',
    facts: ['cold', 'wet', 'exposed']
  }]) {
    const changed = scene(variation);
    assert.equal(changed.model.seeds.terrain, base.model.seeds.terrain);
    assert.deepEqual(changed.geometry, base.geometry);
  }
});

test('labels and prose never participate in landscape geometry', () => {
  const firstScreen = screen({
    locationLabel: 'Лес', prose: 'Перед героем река.'
  });
  const secondScreen = screen({
    locationLabel: 'Пристань', prose: 'Вокруг снег.'
  });
  firstScreen.visible_context.location_ref = 'unapproved-place-a';
  secondScreen.visible_context.location_ref = 'unapproved-place-b';
  const first = {
    model: buildLandscapeRenderModel(firstScreen),
    geometry: buildLandscapeGeometry(buildLandscapeRenderModel(firstScreen))
  };
  const second = {
    model: buildLandscapeRenderModel(secondScreen),
    geometry: buildLandscapeGeometry(buildLandscapeRenderModel(secondScreen))
  };
  assert.deepEqual(first.geometry, second.geometry);
  assert.deepEqual(first.model.seeds, second.model.seeds);
});

test('closed environment profiles create only their admitted major geometry', () => {
  const cases = new Map([
    ['env.local_variable', { water: null, route: false }],
    ['env.main_river_channel', { water: 'main', route: false }],
    ['env.side_channel', { water: 'channel', route: false }],
    ['env.land_path', { water: null, route: true }],
    ['env.forest_track', { water: null, route: true }],
    ['env.wetland', { water: 'wetland', route: false }],
    ['env.offroad', { water: null, route: false }],
    ['env.shore_transition', { water: 'shore', route: false }]
  ]);
  for (const [profile, expected] of cases) {
    const { geometry } = scene({ profile });
    assert.equal(geometry.water?.kind ?? null, expected.water, profile);
    assert.equal(Boolean(geometry.route), expected.route, profile);
  }
});

test('approved legacy opening profile maps explicitly to shore geometry', () => {
  const legacy = scene({ profile: 'trace_ld_v1_env_cold_wet_shore' });
  const canonical = scene({ profile: 'env.shore_transition' });
  assert.equal(legacy.model.semantics.environmentProfile,
    'env.shore_transition');
  assert.equal(legacy.geometry.water.kind, 'shore');
  assert.deepEqual(legacy.geometry, canonical.geometry);
});

test('unknown semantics fail closed to a neutral visual model', () => {
  const { model, geometry } = scene({
    profile: 'forest_edge', nodeCategory: 'village_edge',
    dayPart: 'sunset', weather: 'storm'
  });
  assert.deepEqual(model.semantics, {
    environmentProfile: null,
    nodeCategory: null,
    dayPart: null,
    weather: null,
    environmentFacts: []
  });
  assert.equal(geometry.water, null);
  assert.equal(geometry.route, null);
  assert.equal(geometry.buildings.length, 0);
  assert.equal(model.celestial.sun, null);
  assert.equal(model.celestial.moon, null);
  assert.equal(model.atmosphere.precipitation, null);
});

test('cold, wet and exposed remain presentation-only modifiers', () => {
  const neutral = scene({ profile: 'env.offroad', facts: [] });
  const modified = scene({
    profile: 'env.offroad', facts: ['cold', 'wet', 'exposed']
  });
  assert.deepEqual(modified.geometry, neutral.geometry);
  assert.equal(modified.geometry.water, null);
  assert.equal(modified.model.atmosphere.precipitation, null);
  assert.equal(modified.model.atmosphere.exposedStrokes, true);
  assert.equal(modified.model.atmosphere.wetCue, true);
  assert.equal(modified.model.atmosphere.coldCue, true);
});

test('time of day has explicit readable celestial semantics', () => {
  const dawn = scene({ dayPart: 'dawn' }).model.celestial;
  const morning = scene({ dayPart: 'morning' }).model.celestial;
  const day = scene({ dayPart: 'day' }).model.celestial;
  const evening = scene({ dayPart: 'evening' }).model.celestial;
  const dusk = scene({ dayPart: 'dusk' }).model.celestial;
  const night = scene({ dayPart: 'night' }).model.celestial;
  assert.ok(dawn.sun[1] > morning.sun[1]);
  assert.ok(evening.sun[1] > day.sun[1]);
  assert.ok(day.sun && day.starCount === 0);
  assert.ok(dusk.moon && dusk.starCount > 0);
  assert.equal(night.sun, null);
  assert.ok(night.moon && night.starCount > dusk.starCount);
});

test('weather vocabulary yields distinct semantic visual layers', () => {
  const models = Object.fromEntries([
    'clear', 'cloudy', 'overcast', 'rain', 'snow', 'fog'
  ].map((weather) => [weather, scene({ weather }).model]));
  assert.equal(models.clear.atmosphere.clouds, 0);
  assert.ok(models.cloudy.atmosphere.clouds > 0);
  assert.ok(models.overcast.atmosphere.cloudAlpha
    > models.cloudy.atmosphere.cloudAlpha);
  assert.equal(models.rain.atmosphere.precipitation, 'rain');
  assert.equal(models.snow.atmosphere.precipitation, 'snow');
  assert.ok(models.fog.atmosphere.fogAlpha > 0);
  assert.equal(scene({ dayPart: 'night', weather: 'overcast' })
    .model.celestial.starCount, 0);
  assert.ok(scene({ dayPart: 'night', weather: 'fog' })
    .model.celestial.alpha < models.clear.celestial.alpha);
});

test('water, route and buildings remain attached inside landscape bounds', () => {
  for (const profile of [
    'env.main_river_channel', 'env.side_channel',
    'env.wetland', 'env.shore_transition'
  ]) {
    const { geometry } = scene({ profile });
    for (const point of geometry.water.patches.flat()) {
      assert.ok(point[0] >= 0 && point[0] <= geometry.width, profile);
      assert.ok(point[1] >= 0 && point[1] <= geometry.height, profile);
    }
  }
  for (const profile of ['env.land_path', 'env.forest_track']) {
    const { geometry } = scene({ profile });
    for (const point of geometry.route.patch) {
      assert.ok(point[1] >= geometry.route.groundArea.top, profile);
      assert.ok(point[1] <= geometry.route.groundArea.bottom, profile);
    }
  }
  for (const nodeCategory of [
    'spatial.g3.settlement', 'spatial.g3.built_site'
  ]) {
    const { geometry } = scene({ nodeCategory });
    assert.ok(geometry.buildings.length > 0);
    for (const building of geometry.buildings) {
      assert.ok(building.groundAnchor[1] >= geometry.horizon.y);
      assert.ok(building.wall.some((point) =>
        point[1] === building.groundAnchor[1]));
    }
  }
});

test('same exact player-safe input always produces the same frozen scene', () => {
  const first = scene({
    profile: 'env.forest_track', dayPart: 'evening', weather: 'cloudy'
  });
  const second = scene({
    profile: 'env.forest_track', dayPart: 'evening', weather: 'cloudy'
  });
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first.model), true);
  assert.equal(Object.isFrozen(first.geometry), true);
});

test('development control sheet is fixed at eighteen canonical scenes', () => {
  assert.equal(LANDSCAPE_CONTROL_SHEET_CASES.length, 18);
  assert.deepEqual(
    LANDSCAPE_CONTROL_SHEET_CASES.slice(0, 8).map(({ id }) => id),
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  );
  for (const { screen: item } of LANDSCAPE_CONTROL_SHEET_CASES) {
    assert.doesNotThrow(() => buildLandscapeGeometry(
      buildLandscapeRenderModel(item)
    ));
  }
});

test('authored landscape selection covers generic 6 by 6 matrix', () => {
  assert.equal(Object.keys(LANDSCAPE_SCENES).length, 8);
  for (const [profile, sceneId] of Object.entries(LANDSCAPE_SCENES)) {
    for (const dayPart of LANDSCAPE_DAY_PARTS) {
      for (const weather of LANDSCAPE_WEATHER) {
        const model = buildLandscapeRenderModel(screen({
          profile, dayPart, weather
        }));
        assert.equal(model.sceneId, sceneId);
        assert.equal(model.stateId, `${dayPart}-${weather}`);
        assert.equal(model.assetUrl,
          `/assets/landscape/${sceneId}/${dayPart}-${weather}.webp`);
      }
    }
  }
});

test('exact Lower Dvina scene IDs override generic profiles', () => {
  assert.deepEqual(Object.keys(LOWER_DVINA_LANDSCAPE_SCENES).sort(), [
    'lower-dvina-fishing-camp',
    'lower-dvina-fishing-camp-firepit',
    'lower-dvina-old-drying-shed-exterior',
    'lower-dvina-old-drying-shed-interior',
    'lower-dvina-wreck-shore',
    'lower-dvina-zhdanko-river-descent',
    'lower-dvina-zhdanko-storehouse-exterior',
    'lower-dvina-zhdanko-storehouse-interior'
  ]);
  for (const [sceneId, sceneInfo] of
    Object.entries(LOWER_DVINA_LANDSCAPE_SCENES)) {
    const model = buildLandscapeRenderModel({
      scene_asset_id: sceneId,
      visible_context: {
        environment: { profile_id: 'env.offroad' },
        day_part: 'night', weather: 'snow'
      }
    });
    assert.equal(model.sceneId, sceneId);
    assert.equal(model.assetUrl, sceneInfo.interior
      ? `/assets/landscape/lower-dvina/${sceneInfo.folder}/dark.webp`
      : `/assets/landscape/lower-dvina/${sceneInfo.folder}/night-snow.webp`);
  }
});

test('interiors select natural or dark without weather foreground', () => {
  for (const sceneId of [
    'lower-dvina-old-drying-shed-interior',
    'lower-dvina-zhdanko-storehouse-interior'
  ]) {
    for (const dayPart of LANDSCAPE_DAY_PARTS) {
      for (const weather of LANDSCAPE_WEATHER) {
        const model = buildLandscapeRenderModel({
          scene_asset_id: sceneId,
          visible_context: { day_part: dayPart, weather }
        });
        const stateId = ['dusk', 'night'].includes(dayPart)
          ? 'dark' : 'natural';
        assert.equal(model.stateId, stateId);
        assert.equal(model.foregroundWeather, null);
        assert.match(model.assetUrl, new RegExp(`/${stateId}\\.webp$`));
      }
    }
  }
});

test('missing axes default asset and light', () => {
  const model = buildLandscapeRenderModel(screen({
    profile: 'env.local_variable', dayPart: null, weather: null
  }));
  assert.equal(model.stateId, 'day-clear');
  assert.equal(model.assetUrl,
    '/assets/landscape/open_meadow/day-clear.webp');
  assert.equal(model.semantics.dayPart, null);
  assert.equal(model.semantics.weather, null);
  assert.deepEqual(model.portraitLighting,
    buildLandscapeRenderModel(screen()).portraitLighting);
});

test('unknown exact uses generic',()=> {
  const m=buildLandscapeRenderModel({...screen({profile:'env.main_river_channel'}),scene_asset_id:'x'});
  assert.equal(m.assetUrl,'/assets/landscape/main_river/day-clear.webp');
  assert.equal(m.semantics.environmentProfile,'env.main_river_channel');
});

test('unknown authored selectors and text fall back to neutral procedural model', () => {
  const first = {
    scene_asset_id: 'unknown-scene',
    main_prose: 'Вокруг снег.',
    visible_context: {
      location_label: 'Река',
      environment: { profile_id: 'unknown-profile' }
    }
  };
  const second = {
    ...first,
    main_prose: 'В избе дождь.',
    visible_context: {
      location_label: 'Другая подпись',
      environment: { profile_id: 'another-profile' }
    }
  };
  const firstModel = buildLandscapeRenderModel(first);
  const secondModel = buildLandscapeRenderModel(second);
  assert.equal(firstModel.sceneId, null);
  assert.equal(firstModel.assetUrl, null);
  assert.equal(firstModel.stateId, 'day-clear');
  assert.deepEqual(buildLandscapeGeometry(firstModel),
    buildLandscapeGeometry(secondModel));
});

test('snow authored assets have no physical-state gate', () => {
  const model = buildLandscapeRenderModel(screen({
    profile: 'env.main_river_channel', weather: 'snow', facts: []
  }));
  assert.equal(model.assetUrl,
    '/assets/landscape/main_river/day-snow.webp');
  assert.equal(model.foregroundWeather, 'snow');
  assert.equal(model.semantics.environmentFacts.includes('cold'), false);
});

test('landscape asset inventory has exact files, counts and dimensions', async () => {
  let genericTotal = 0;
  for (const sceneId of Object.values(LANDSCAPE_SCENES)) {
    const folder = join(PUBLIC_ROOT, 'assets', 'landscape', sceneId);
    const names = (await readdir(folder)).filter((name) =>
      name.endsWith('.webp')).sort();
    const expected = LANDSCAPE_DAY_PARTS.flatMap((dayPart) =>
      LANDSCAPE_WEATHER.map((weather) => `${dayPart}-${weather}.webp`))
      .sort();
    assert.deepEqual(names, expected, sceneId);
    for (const name of names) {
      assert.deepEqual(webpDimensions(await readFile(join(folder, name))),
        [2560, 1440], `${sceneId}/${name}`);
      genericTotal += 1;
    }
  }
  assert.equal(genericTotal, 288);

  let lowerDvinaTotal = 0;
  for (const [sceneId, sceneInfo] of
    Object.entries(LOWER_DVINA_LANDSCAPE_SCENES)) {
    const folder = join(PUBLIC_ROOT, 'assets', 'landscape', 'lower-dvina',
      sceneInfo.folder);
    const names = (await readdir(folder)).filter((name) =>
      name.endsWith('.webp')).sort();
    const expected = sceneInfo.interior
      ? ['dark.webp', 'natural.webp']
      : LANDSCAPE_DAY_PARTS.flatMap((dayPart) =>
        LANDSCAPE_WEATHER.map((weather) => `${dayPart}-${weather}.webp`))
        .sort();
    assert.deepEqual(names, expected, sceneId);
    for (const name of names) {
      assert.deepEqual(webpDimensions(await readFile(join(folder, name))),
        [2560, 1440], `${sceneId}/${name}`);
      lowerDvinaTotal += 1;
    }
  }
  assert.equal(lowerDvinaTotal, 220);
});

test('image cache reuses concurrent loads and retries rejected entries', async () => {
  const previousImage = globalThis.Image;
  const decodes = [Promise.resolve(), Promise.reject(new Error('decode failed')),
    Promise.resolve()];
  const images = [];
  globalThis.Image = class {
    constructor() {
      images.push(this);
    }

    decode() {
      return decodes.shift();
    }
  };

  try {
    const [first, second] = await Promise.all([
      loadImage('concurrent.png'), loadImage('concurrent.png')
    ]);
    assert.equal(first, second);
    assert.equal(images.length, 1);
    assert.equal(first.src, 'concurrent.png');

    await assert.rejects(loadImage('retry.png'), /decode failed/);
    assert.equal(await loadImage('retry.png'), images[2]);
    assert.equal(images.length, 3);
  } finally {
    globalThis.Image = previousImage;
  }
});

test('authored portrait selects all Lower Dvina heads and neutral unknown emotion', () => {
  assert.deepEqual(AUTHORED_PORTRAIT_ASSETS, {
    'lower-dvina-mikula': 'mikula',
    'lower-dvina-onisim': 'onisim',
    'lower-dvina-eremey': 'eremey',
    'lower-dvina-ratsha': 'ratsha',
    'lower-dvina-zhdanko': 'zhdanko',
    'lower-dvina-fisher-1': 'fisher-1',
    'lower-dvina-fisher-2': 'fisher-2'
  });
  for (const [assetId, folder] of Object.entries(AUTHORED_PORTRAIT_ASSETS)) {
    assert.equal(supportsAuthoredPortrait(assetId), true);
    for (const emotion of PORTRAIT_EMOTIONS) {
      assert.deepEqual(authoredPortraitUrls(assetId, emotion), {
        emotion,
        outfitUrl: `/assets/portrait/lower-dvina/${folder}/outfit.png`,
        headUrl: `/assets/portrait/lower-dvina/${folder}/heads/${emotion}.png`
      });
    }
    assert.equal(authoredPortraitUrls(assetId, 'unknown').emotion, 'neutral');
  }
  assert.equal(supportsAuthoredPortrait('unknown'), false);
  assert.equal(authoredPortraitUrls('unknown', 'neutral'), null);
});

test('authored portrait inventory has seven outfits and transparent RGBA heads', async () => {
  let outfits = 0;
  let heads = 0;
  for (const folder of Object.values(AUTHORED_PORTRAIT_ASSETS)) {
    const root = join(PUBLIC_ROOT, 'assets', 'portrait', 'lower-dvina', folder);
    assert.deepEqual((await readdir(root)).filter((name) => name.endsWith('.png')),
      ['outfit.png']);
    assertPng(await readFile(join(root, 'outfit.png')), `${folder}/outfit.png`);
    outfits += 1;
    const names = (await readdir(join(root, 'heads'))).sort();
    assert.deepEqual(names, PORTRAIT_EMOTIONS.map((emotion) => `${emotion}.png`).sort());
    for (const name of names) {
      assertPng(await readFile(join(root, 'heads', name)), `${folder}/${name}`);
      heads += 1;
    }
  }
  assert.equal(outfits, 7);
  assert.equal(heads, 63);
});

test('authored portrait draws complete kit with scene lighting', async () => {
  const canvas = canvasMock();
  const lighting = {
    exposure: 0.9, contrast: 1.1, saturation: 0.8,
    tint: '#778899', tintAlpha: 0.25, snowBounce: 0.15
  };
  const result = await renderAuthoredPortrait(canvas, 'lower-dvina-mikula',
    'happy', lighting, { imageLoader: async (url) => ({ url }) });
  assert.deepEqual(result, {
    emotion: 'happy',
    outfitUrl: '/assets/portrait/lower-dvina/mikula/outfit.png',
    headUrl: '/assets/portrait/lower-dvina/mikula/heads/happy.png',
    cancelled: false
  });
  assert.deepEqual(canvas.calls.filter(([name]) => name === 'drawImage')
    .map(([, image]) => image.url), [
    '/assets/portrait/lower-dvina/mikula/outfit.png',
    '/assets/portrait/lower-dvina/mikula/outfit.png',
    '/assets/portrait/lower-dvina/mikula/heads/happy.png'
  ]);
  assert.ok(canvas.calls.some(([name, value]) => name === 'filter'
    && value === 'brightness(0.9) contrast(1.1) saturate(0.8)'));
  assert.ok(canvas.calls.some(([name, value]) => name === 'fillStyle'
    && value === '#778899'));
  assert.ok(canvas.calls.some(([name]) => name === 'createLinearGradient'));
});

test('authored portrait failure or stale request never draws partial canvas', async () => {
  const lighting = { exposure: 1, contrast: 1, saturation: 1, snowBounce: 0 };
  const failed = canvasMock();
  await assert.rejects(renderAuthoredPortrait(failed, 'lower-dvina-mikula',
    'neutral', lighting, { imageLoader: async (url) => {
      if (url.endsWith('/outfit.png')) return {};
      throw new Error('missing head');
    } }), /missing head/);
  assert.deepEqual(failed.calls, []);

  const stale = canvasMock();
  const result = await renderAuthoredPortrait(stale, 'lower-dvina-mikula',
    'neutral', lighting, {
      imageLoader: async () => ({}),
      isCurrent: () => false
    });
  assert.deepEqual(result, { cancelled: true });
  assert.deepEqual(stale.calls, []);
});

function webpDimensions(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === 'VP8X') return [
      1 + buffer.readUIntLE(data + 4, 3),
      1 + buffer.readUIntLE(data + 7, 3)
    ];
    if (type === 'VP8 ') return [
      buffer.readUInt16LE(data + 6) & 0x3fff,
      buffer.readUInt16LE(data + 8) & 0x3fff
    ];
    if (type === 'VP8L') {
      const a = buffer[data + 1];
      const b = buffer[data + 2];
      const c = buffer[data + 3];
      const d = buffer[data + 4];
      return [
        1 + (((b & 0x3f) << 8) | a),
        1 + (((d & 0x0f) << 10) | (c << 2) | ((b & 0xc0) >> 6))
      ];
    }
    offset = data + size + (size % 2);
  }
  throw new Error('Unsupported WebP');
}

function assertPng(buffer, label) {
  assert.deepEqual(buffer.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), label);
  assert.equal(buffer.toString('ascii', 12, 16), 'IHDR', label);
  assert.equal(buffer.readUInt32BE(16), 768, label);
  assert.equal(buffer.readUInt32BE(20), 768, label);
  assert.equal(buffer[25], 6, label);
  assert.ok(pngHasTransparency(buffer), label);
}

function pngHasTransparency(buffer) {
  const chunks = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const scanlines = inflateSync(Buffer.concat(chunks));
  for (let offset = 0; offset < scanlines.length; offset += 768 * 4 + 1) {
    for (let pixel = offset + 4; pixel < offset + 768 * 4 + 1; pixel += 4) {
      if (scanlines[pixel] < 255) return true;
    }
  }
  return false;
}
