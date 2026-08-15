import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLandscapeGeometry,
  buildLandscapeRenderModel
} from '../src/features/landscape/render.js';
import { LANDSCAPE_CONTROL_SHEET_CASES } from
  './landscape-control-sheet.js';

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
