import { hashDeterministicValue } from '../../shared/deterministic-random.js';
import {
  LANDSCAPE_ENVIRONMENT_PROFILES,
  LANDSCAPE_NODE_CATEGORIES,
  normalizeLandscapeDayPart,
  normalizeLandscapeEnvironmentProfile,
  normalizeLandscapeWeather
} from '../../shared/scene-affordances.js';

export { LANDSCAPE_ENVIRONMENT_PROFILES, LANDSCAPE_NODE_CATEGORIES };

export const LANDSCAPE_WEATHER = Object.freeze([
  'clear', 'cloudy', 'overcast', 'rain', 'snow', 'fog'
]);

export const LANDSCAPE_DAY_PARTS = Object.freeze([
  'dawn', 'morning', 'day', 'evening', 'dusk', 'night'
]);

export const LANDSCAPE_SCENES = Object.freeze({
  'env.local_variable': 'open_meadow',
  'env.main_river_channel': 'main_river',
  'env.side_channel': 'side_channel',
  'env.land_path': 'field_road',
  'env.forest_track': 'forest_road',
  'env.wetland': 'wetland',
  'env.offroad': 'offroad',
  'env.shore_transition': 'shore_transition'
});

export const LOWER_DVINA_LANDSCAPE_SCENES = Object.freeze({
  'lower-dvina-old-drying-shed-interior': {
    folder: 'old-drying-shed-interior', interior: true
  },
  'lower-dvina-old-drying-shed-exterior': {
    folder: 'old-drying-shed-exterior', interior: false
  },
  'lower-dvina-wreck-shore': { folder: 'wreck-shore', interior: false },
  'lower-dvina-zhdanko-storehouse-interior': {
    folder: 'zhdanko-storehouse-interior', interior: true
  },
  'lower-dvina-fishing-camp-firepit': {
    folder: 'fishing-camp-firepit', interior: false
  },
  'lower-dvina-zhdanko-river-descent': {
    folder: 'zhdanko-river-descent', interior: false
  },
  'lower-dvina-fishing-camp': { folder: 'fishing-camp', interior: false },
  'lower-dvina-zhdanko-storehouse-exterior': {
    folder: 'zhdanko-storehouse-exterior', interior: false
  }
});

const CATEGORY_SET = new Set(LANDSCAPE_NODE_CATEGORIES);
const FACT_SET = new Set(['cold', 'wet', 'exposed']);
const FOREGROUND_WEATHER = new Set(['rain', 'snow', 'fog']);

const DAY_PALETTES = Object.freeze({
  neutral: ['#c9c4b5', '#e2d9c5', '#78745f', '#666f68'],
  dawn: ['#777f89', '#dfb08e', '#77745e', '#65727a'],
  morning: ['#9caeaf', '#e4d6b4', '#77775e', '#6c8588'],
  day: ['#91a9ad', '#ddd6ba', '#72745b', '#668087'],
  evening: ['#7c858d', '#d49a78', '#766b55', '#687579'],
  dusk: ['#4f5361', '#b57d70', '#5c5b51', '#546269'],
  night: ['#1d2430', '#4a4f5a', '#31382f', '#354754']
});

const TIME_LIGHT = Object.freeze({
  dawn: { exposure: .92, contrast: .96, saturation: .96,
    tint: '#efb29f', tintAlpha: .1 },
  morning: { exposure: 1.02, contrast: 1, saturation: 1.02,
    tint: '#ffd497', tintAlpha: .06 },
  day: { exposure: 1.05, contrast: 1.02, saturation: 1,
    tint: '#fff4cf', tintAlpha: .02 },
  evening: { exposure: .88, contrast: 1.02, saturation: .98,
    tint: '#d48645', tintAlpha: .16 },
  dusk: { exposure: .72, contrast: .94, saturation: .9,
    tint: '#646f9e', tintAlpha: .18 },
  night: { exposure: .5, contrast: .9, saturation: .78,
    tint: '#304e7a', tintAlpha: .28 }
});

const WEATHER_LIGHT = Object.freeze({
  clear: { exposure: 1, contrast: 1.04, saturation: 1.03,
    tint: null, tintAlpha: 0 },
  cloudy: { exposure: .95, contrast: .92, saturation: .95,
    tint: '#bcc4c7', tintAlpha: .04 },
  overcast: { exposure: .87, contrast: .84, saturation: .82,
    tint: '#9caab3', tintAlpha: .1 },
  rain: { exposure: .76, contrast: .9, saturation: .78,
    tint: '#60758b', tintAlpha: .16 },
  snow: { exposure: 1.03, contrast: .92, saturation: .72,
    tint: '#dce9f1', tintAlpha: .14 },
  fog: { exposure: .92, contrast: .7, saturation: .65,
    tint: '#dfe3df', tintAlpha: .22 }
});

const INTERIOR_LIGHT = Object.freeze({
  natural: { exposure: .82, contrast: .88, saturation: .8,
    tint: '#c9b99d', tintAlpha: .12, snowBounce: 0 },
  dark: { exposure: .42, contrast: .82, saturation: .68,
    tint: '#414958', tintAlpha: .24, snowBounce: 0 }
});

export function buildLandscapeRenderModel(screen) {
  const context = plain(screen?.visible_context)
    ? screen.visible_context : {};
  const environment = plain(context.environment) ? context.environment : {};
  const environmentProfile = normalizeLandscapeEnvironmentProfile(
    environment.profile_id
  );
  const nodeCategory = CATEGORY_SET.has(environment.node_category)
    ? environment.node_category : null;
  const weather = normalizeLandscapeWeather(context.weather);
  const dayPart = normalizeLandscapeDayPart(context.day_part);
  const authoredScene = LOWER_DVINA_LANDSCAPE_SCENES[screen?.scene_asset_id];
  const genericScene = LANDSCAPE_SCENES[environmentProfile] ?? null;
  const selectedDayPart = dayPart ?? 'day';
  const selectedWeather = weather ?? 'clear';
  const sceneId = authoredScene ? screen.scene_asset_id : genericScene;
  const stateId = authoredScene?.interior
    ? (['dusk', 'night'].includes(selectedDayPart) ? 'dark' : 'natural')
    : `${selectedDayPart}-${selectedWeather}`;
  const assetUrl = authoredScene
    ? `/assets/landscape/lower-dvina/${authoredScene.folder}/${stateId}.webp`
    : genericScene
      ? `/assets/landscape/${genericScene}/${stateId}.webp`
      : null;
  const environmentFacts = Object.freeze([...new Set([
    ...(Array.isArray(environment.facts) ? environment.facts : []),
    ...(Array.isArray(context.sensory_details)
      ? context.sensory_details : [])
  ].filter((value) => typeof value === 'string' && FACT_SET.has(value)))]
    .sort());
  const terrainIdentity = { environmentProfile, nodeCategory };
  const palette = buildPalette(dayPart, environmentFacts);
  const celestial = buildCelestial(dayPart, weather);
  const atmosphere = buildAtmosphere(weather, environmentFacts);

  return deepFreeze({
    width: 1280,
    height: 720,
    sceneId,
    stateId,
    assetUrl,
    foregroundWeather: assetUrl && !authoredScene?.interior
      && FOREGROUND_WEATHER.has(selectedWeather) ? selectedWeather : null,
    portraitLighting: authoredScene?.interior
      ? INTERIOR_LIGHT[stateId]
      : combineLighting(selectedDayPart, selectedWeather),
    semantics: {
      environmentProfile,
      nodeCategory,
      dayPart,
      weather,
      environmentFacts
    },
    seeds: {
      terrain: scopedSeed('terrain', terrainIdentity),
      vegetation: scopedSeed('vegetation', terrainIdentity),
      settlement: scopedSeed('settlement', terrainIdentity),
      sky: scopedSeed('sky', { dayPart, weather }),
      weather: scopedSeed('weather', { weather })
    },
    palette,
    celestial,
    atmosphere
  });
}

function combineLighting(dayPart, weather) {
  const time = TIME_LIGHT[dayPart];
  const atmosphere = WEATHER_LIGHT[weather];
  return {
    exposure: time.exposure * atmosphere.exposure,
    contrast: time.contrast * atmosphere.contrast,
    saturation: time.saturation * atmosphere.saturation,
    tint: atmosphere.tint ?? time.tint,
    tintAlpha: atmosphere.tint ? atmosphere.tintAlpha : time.tintAlpha,
    snowBounce: weather === 'snow' ? .16 : 0
  };
}

function buildPalette(dayPart, facts) {
  const [skyTop, skyHorizon, ground, water] =
    DAY_PALETTES[dayPart ?? 'neutral'];
  const cold = facts.includes('cold');
  const wet = facts.includes('wet');
  return {
    paper: '#e4dcc9',
    skyTop: cold ? mix(skyTop, '#7d939b', .24) : skyTop,
    skyHorizon: cold ? mix(skyHorizon, '#bccbd0', .18) : skyHorizon,
    far: mix(ground, skyHorizon, .42),
    ground: wet ? mix(ground, '#343b35', .24) : ground,
    groundLight: mix(ground, '#d9cfb8', .3),
    water: wet ? mix(water, '#354b50', .2) : water,
    waterLight: mix(water, '#c8d0c8', .28),
    vegetation: mix(ground, '#384536', .38),
    built: mix(ground, '#5b483a', .34),
    ink: dayPart === 'night' ? '#20272c' : '#34332e',
    softInk: dayPart === 'night' ? '#4d5960' : '#615e54',
    celestial: dayPart === 'night' || dayPart === 'dusk'
      ? '#e1ddc8' : '#d5aa68'
  };
}

function buildCelestial(dayPart, weather) {
  const values = {
    dawn: { sun: [210, 330], moon: null, stars: 5 },
    morning: { sun: [300, 205], moon: null, stars: 0 },
    day: { sun: [420, 115], moon: null, stars: 0 },
    evening: { sun: [980, 315], moon: null, stars: 0 },
    dusk: { sun: [1080, 382], moon: [305, 150], stars: 12 },
    night: { sun: null, moon: [880, 135], stars: 30 }
  }[dayPart] ?? { sun: null, moon: null, stars: 0 };
  const overcast = weather === 'overcast';
  const fog = weather === 'fog';
  const alpha = overcast ? .08 : fog ? .18 : weather === 'cloudy' ? .72 : 1;
  return {
    sun: values.sun,
    moon: values.moon,
    starCount: overcast ? 0 : values.stars,
    alpha
  };
}

function buildAtmosphere(weather, facts) {
  const profile = {
    clear: { clouds: 0, cloudAlpha: 0, precipitation: null, fogAlpha: 0 },
    cloudy: { clouds: 4, cloudAlpha: .34, precipitation: null, fogAlpha: 0 },
    overcast: { clouds: 7, cloudAlpha: .72, precipitation: null, fogAlpha: 0 },
    rain: { clouds: 6, cloudAlpha: .58, precipitation: 'rain', fogAlpha: .08 },
    snow: { clouds: 5, cloudAlpha: .48, precipitation: 'snow', fogAlpha: .12 },
    fog: { clouds: 2, cloudAlpha: .12, precipitation: null, fogAlpha: .62 }
  }[weather] ?? {
    clouds: 0, cloudAlpha: 0, precipitation: null, fogAlpha: 0
  };
  return {
    ...profile,
    farAlpha: weather === 'fog' ? .24 : weather === 'overcast' ? .64 : .88,
    exposedStrokes: facts.includes('exposed'),
    wetCue: facts.includes('wet'),
    coldCue: facts.includes('cold')
  };
}

function scopedSeed(scope, value) {
  return hashDeterministicValue({ scope, value });
}

function mix(left, right, amount) {
  const channels = (hex) => [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16));
  const a = channels(left);
  const b = channels(right);
  return `#${a.map((channel, index) => Math.round(
    channel + (b[index] - channel) * amount
  ).toString(16).padStart(2, '0')).join('')}`;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
