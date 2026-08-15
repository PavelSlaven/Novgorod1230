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

const CATEGORY_SET = new Set(LANDSCAPE_NODE_CATEGORIES);
const FACT_SET = new Set(['cold', 'wet', 'exposed']);

const DAY_PALETTES = Object.freeze({
  neutral: ['#c9c4b5', '#e2d9c5', '#78745f', '#666f68'],
  dawn: ['#777f89', '#dfb08e', '#77745e', '#65727a'],
  morning: ['#9caeaf', '#e4d6b4', '#77775e', '#6c8588'],
  day: ['#91a9ad', '#ddd6ba', '#72745b', '#668087'],
  evening: ['#7c858d', '#d49a78', '#766b55', '#687579'],
  dusk: ['#4f5361', '#b57d70', '#5c5b51', '#546269'],
  night: ['#1d2430', '#4a4f5a', '#31382f', '#354754']
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
