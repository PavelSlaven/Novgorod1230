import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderForegroundWeather,
  renderLandscapeCanvas
} from '../src/features/landscape/canvas.js';
import {
  buildLandscapeRenderModel,
  LANDSCAPE_DAY_PARTS,
  LANDSCAPE_SCENES,
  LANDSCAPE_WEATHER
} from '../src/features/landscape/render-model.js';
import {
  PORTRAIT_12_URL,
  renderPortrait12,
  supportsPortrait12
} from '../src/features/conversation-portrait/portrait-12.js';
import { hydrateSceneCanvases } from
  '../src/app/scene-canvas-hydration.js';
import { loadImage } from '../src/shared/image-cache.js';

const PUBLIC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

function screen(profile = 'env.local_variable', dayPart = 'day',
  weather = 'clear') {
  return {
    visible_context: {
      environment: { profile_id: profile },
      day_part: dayPart,
      weather
    }
  };
}

function portrait12Spec() {
  return {
    schema: 'portrait_spec_v1',
    person: {
      sex: 'male', age: 'old', build: 'average',
      skin_tone: 'pale', face_shape: 'long'
    },
    hair: {
      color: 'white', length: 'bald', style: 'straight',
      facial_hair: 'full_beard'
    },
    eyes: { color: 'dark', gaze: 'viewer' },
    expression: { emotion: 'neutral', intensity: 'medium' },
    clothing: {
      neckline: 'slit_round', sleeve: 'narrow', outer: 'none',
      fabric: 'light_linen', trim: 'none',
      main_color: 'undyed_linen', secondary_color: 'undyed_linen',
      headwear: 'none'
    },
    pose: { body: 'frontal', head: 'straight' },
    background: 'neutral'
  };
}

test('landscape catalog has exactly 8 x 36 normalized WebP assets', async () => {
  assert.equal(Object.keys(LANDSCAPE_SCENES).length, 8);
  let total = 0;
  for (const sceneId of Object.values(LANDSCAPE_SCENES)) {
    const folder = join(PUBLIC_ROOT, 'assets', 'landscape', sceneId);
    const names = (await readdir(folder)).filter((name) =>
      name.endsWith('.webp')).sort();
    assert.equal(names.length, 36, sceneId);
    for (const dayPart of LANDSCAPE_DAY_PARTS) {
      for (const weather of LANDSCAPE_WEATHER) {
        const name = `${dayPart}-${weather}.webp`;
        assert.ok(names.includes(name), `${sceneId}/${name}`);
        const size = webpDimensions(await readFile(join(folder, name)));
        assert.deepEqual(size, [2560, 1440], `${sceneId}/${name}`);
        total += 1;
      }
    }
  }
  assert.equal(total, 288);
});

test('portrait 12 asset is a genuine transparent 768 x 768 PNG', async () => {
  const png = await readFile(join(
    PUBLIC_ROOT, 'assets', 'portrait', 'portrait-12-neutral.png'
  ));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), 768);
  assert.equal(png.readUInt32BE(20), 768);
  assert.equal(png[25], 6, 'PNG must use RGBA color type');
});

test('selector maps all profiles and preserves independent time/weather axes',
  () => {
    for (const [profile, sceneId] of Object.entries(LANDSCAPE_SCENES)) {
      for (const dayPart of LANDSCAPE_DAY_PARTS) {
        for (const weather of LANDSCAPE_WEATHER) {
          const model = buildLandscapeRenderModel(
            screen(profile, dayPart, weather)
          );
          assert.equal(model.sceneId, sceneId);
          assert.equal(model.stateId, `${dayPart}-${weather}`);
          assert.equal(model.assetUrl,
            `/assets/landscape/${sceneId}/${dayPart}-${weather}.webp`);
        }
      }
    }
    const fallback = buildLandscapeRenderModel(screen('unknown', null, null));
    assert.equal(fallback.assetUrl,
      '/assets/landscape/open_meadow/day-clear.webp');
    assert.equal(buildLandscapeRenderModel(
      screen('trace_ld_v1_env_cold_wet_shore', 'night', 'fog')
    ).sceneId, 'shore_transition');
  });

test('time and weather alter portrait light, never scene identity', () => {
  const day = buildLandscapeRenderModel(
    screen('env.main_river_channel', 'day', 'clear')
  );
  const night = buildLandscapeRenderModel(
    screen('env.main_river_channel', 'night', 'clear')
  );
  const snow = buildLandscapeRenderModel(
    screen('env.main_river_channel', 'day', 'snow')
  );
  assert.equal(day.sceneId, night.sceneId);
  assert.equal(day.sceneId, snow.sceneId);
  assert.notDeepEqual(day.portraitLighting, night.portraitLighting);
  assert.notDeepEqual(day.portraitLighting, snow.portraitLighting);
  assert.equal(snow.portraitLighting.snowBounce, .16);
});

test('landscape renderer caches images, falls back, and skips stale draw',
  async () => {
    const originalImage = globalThis.Image;
    let created = 0;
    globalThis.Image = class {
      constructor() { created += 1; }
      decode() { return Promise.resolve(); }
    };
    try {
      const url = `/cache-test-${Date.now()}.webp`;
      const [first, second] = await Promise.all([
        loadImage(url), loadImage(url)
      ]);
      assert.equal(first, second);
      assert.equal(created, 1);
    } finally {
      globalThis.Image = originalImage;
    }

    const drawn = [];
    const canvas = fakeCanvas(drawn);
    const result = await renderLandscapeCanvas(canvas, screen(), {
      imageLoader: async (url) => {
        if (url.includes('/day-clear.webp')
            && !url.includes('/open_meadow/')) throw new Error('missing');
        return { url };
      }
    });
    assert.equal(result.fallback, false);
    assert.equal(drawn.filter(([kind]) => kind === 'drawImage').length, 1);

    const staleDrawn = [];
    const stale = await renderLandscapeCanvas(fakeCanvas(staleDrawn), screen(),
      { imageLoader: async () => ({}), isCurrent: () => false });
    assert.equal(stale.cancelled, true);
    assert.equal(staleDrawn.length, 0);
  });

test('missing landscape asset uses the daily open-meadow fallback', async () => {
  const calls = [];
  const result = await renderLandscapeCanvas(fakeCanvas([]),
    screen('env.main_river_channel', 'night', 'rain'), {
      imageLoader: async (url) => {
        calls.push(url);
        if (calls.length === 1) throw new Error('broken asset');
        return {};
      }
    });
  assert.equal(result.fallback, true);
  assert.deepEqual(calls, [
    '/assets/landscape/main_river/night-rain.webp',
    '/assets/landscape/open_meadow/day-clear.webp'
  ]);
});

test('portrait 12 is selected only for its compatible appearance', async () => {
  const compatible = portrait12Spec();
  assert.equal(supportsPortrait12(compatible), true);
  assert.equal(supportsPortrait12({
    ...compatible,
    expression: { emotion: 'angry', intensity: 'high' }
  }), true, 'temporary neutral head supports every valid emotion');
  assert.equal(supportsPortrait12({
    ...compatible,
    person: { ...compatible.person, age: 'adult' }
  }), false);
  assert.equal(supportsPortrait12({
    ...compatible,
    clothing: { ...compatible.clothing, outer: 'wrap' }
  }), false);

  const firstDraws = [];
  const secondDraws = [];
  const imageLoader = async () => ({});
  const day = buildLandscapeRenderModel(screen()).portraitLighting;
  const night = buildLandscapeRenderModel(
    screen('env.local_variable', 'night', 'clear')
  ).portraitLighting;
  const first = await renderPortrait12(fakeCanvas(firstDraws), day,
    { imageLoader });
  const second = await renderPortrait12(fakeCanvas(secondDraws), night,
    { imageLoader });
  assert.equal(first.assetUrl, PORTRAIT_12_URL);
  assert.equal(second.assetUrl, PORTRAIT_12_URL);
  assert.deepEqual(
    firstDraws.find(([kind]) => kind === 'drawImage').slice(2),
    secondDraws.find(([kind]) => kind === 'drawImage').slice(2)
  );
});

test('hydration rejects stale generations and keeps procedural fallback',
  async () => {
    const root = fakeRoot();
    let release;
    let calls = 0;
    const landscapeRenderer = async (_canvas, _screen, { isCurrent }) => {
      calls += 1;
      if (calls === 1) await new Promise((resolve) => { release = resolve; });
      return {
        model: buildLandscapeRenderModel(screen()),
        cancelled: !isCurrent()
      };
    };
    const first = hydrateSceneCanvases(root, screen(), {
      landscapeRenderer, weatherRenderer: () => null
    });
    const second = await hydrateSceneCanvases(root, screen(), {
      landscapeRenderer, weatherRenderer: () => null
    });
    release();
    const stale = await first;
    assert.equal(second.cancelled, false);
    assert.equal(stale.cancelled, true);

    const spec = portrait12Spec();
    const actorScreen = {
      ...screen(),
      panels: { people: { visible: true, data: {
        active_interlocutor: {
          entity_ref: { entity_kind: 'npc', entity_id: 'npc-12' },
          display_label: 'Старик',
          portrait_spec_v1: spec
        }
      } } }
    };
    let bitmap = 0;
    let procedural = 0;
    const order = [];
    await hydrateSceneCanvases(fakeRoot(true), actorScreen, {
      landscapeRenderer: async () => {
        order.push('landscape');
        return {
          model: buildLandscapeRenderModel(actorScreen), cancelled: false
        };
      },
      bitmapPortraitRenderer: async () => {
        order.push('portrait');
        bitmap += 1;
        return {};
      },
      proceduralPortraitRenderer: () => { procedural += 1; return {}; },
      weatherRenderer: () => { order.push('weather'); return null; }
    });
    assert.deepEqual([bitmap, procedural], [1, 0]);
    assert.deepEqual(order, ['landscape', 'portrait', 'weather']);

    actorScreen.panels.people.data.active_interlocutor.portrait_spec_v1 = {
      ...spec,
      person: { ...spec.person, age: 'adult' }
    };
    await hydrateSceneCanvases(fakeRoot(true), actorScreen, {
      landscapeRenderer: async () => ({
        model: buildLandscapeRenderModel(actorScreen), cancelled: false
      }),
      bitmapPortraitRenderer: async () => { bitmap += 1; return {}; },
      proceduralPortraitRenderer: () => { procedural += 1; return {}; },
      weatherRenderer: () => null
    });
    assert.deepEqual([bitmap, procedural], [1, 1]);
});

test('foreground weather draws only rain, snow and fog', () => {
  for (const [weather, expected] of [
    ['clear', null], ['rain', 'rain'], ['snow', 'snow'], ['fog', 'fog']
  ]) {
    const operations = [];
    const model = buildLandscapeRenderModel(
      screen('env.local_variable', 'day', weather)
    );
    assert.equal(
      renderForegroundWeather(fakeCanvas(operations), model), expected
    );
    assert.ok(operations.some(([kind]) => kind === 'clearRect'));
  }
});

function fakeCanvas(operations) {
  const gradient = { addColorStop(...args) {
    operations.push(['addColorStop', ...args]);
  } };
  const context = {
    save() { operations.push(['save']); },
    restore() { operations.push(['restore']); },
    clearRect(...args) { operations.push(['clearRect', ...args]); },
    drawImage(...args) { operations.push(['drawImage', ...args]); },
    fillRect(...args) { operations.push(['fillRect', ...args]); },
    beginPath() { operations.push(['beginPath']); },
    moveTo(...args) { operations.push(['moveTo', ...args]); },
    lineTo(...args) { operations.push(['lineTo', ...args]); },
    stroke() { operations.push(['stroke']); },
    arc(...args) { operations.push(['arc', ...args]); },
    fill() { operations.push(['fill']); },
    createLinearGradient() { return gradient; }
  };
  return { width: 1280, height: 720, getContext: () => context };
}

function fakeRoot(withPortrait = false) {
  const canvases = {
    '[data-landscape-canvas]': fakeCanvas([]),
    '[data-scene-weather-canvas]': fakeCanvas([])
  };
  if (withPortrait) {
    canvases['[data-conversation-portrait-canvas]'] = fakeCanvas([]);
  }
  return { querySelector: (selector) => canvases[selector] ?? null };
}

function webpDimensions(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === 'VP8X') {
      return [
        1 + buffer.readUIntLE(data + 4, 3),
        1 + buffer.readUIntLE(data + 7, 3)
      ];
    }
    if (type === 'VP8 ') {
      return [
        buffer.readUInt16LE(data + 6) & 0x3fff,
        buffer.readUInt16LE(data + 8) & 0x3fff
      ];
    }
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
