import {
  LANDSCAPE_ENVIRONMENT_PROFILES,
  LANDSCAPE_NODE_CATEGORIES,
  LANDSCAPE_SCENE_ASSET_IDS,
  normalizeLandscapeDayPart,
  normalizeLandscapeEnvironmentProfile,
  normalizeLandscapeWeather
} from '../../shared/scene-affordances.js';

export {
  LANDSCAPE_ENVIRONMENT_PROFILES,
  LANDSCAPE_NODE_CATEGORIES,
  LANDSCAPE_SCENE_ASSET_IDS
};

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
  'lower-dvina-wreck-shore': {
    folder: 'wreck-shore', interior: false
  },
  'lower-dvina-zhdanko-storehouse-interior': {
    folder: 'zhdanko-storehouse-interior', interior: true
  },
  'lower-dvina-fishing-camp-firepit': {
    folder: 'fishing-camp-firepit', interior: false
  },
  'lower-dvina-zhdanko-river-descent': {
    folder: 'zhdanko-river-descent', interior: false
  },
  'lower-dvina-fishing-camp': {
    folder: 'fishing-camp', interior: false
  },
  'lower-dvina-zhdanko-storehouse-exterior': {
    folder: 'zhdanko-storehouse-exterior', interior: false
  }
});

export const FALLBACK_LANDSCAPE_URL =
  '/assets/landscape/open_meadow/day-clear.webp';

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

const FACT_SET = new Set(['cold', 'wet', 'exposed']);

export function buildLandscapeRenderModel(screen) {
  const context = plain(screen?.visible_context)
    ? screen.visible_context : {};
  const environment = plain(context.environment) ? context.environment : {};
  const environmentProfile = normalizeLandscapeEnvironmentProfile(
    environment.profile_id
  );
  const dayPart = normalizeLandscapeDayPart(context.day_part) ?? 'day';
  const weather = normalizeLandscapeWeather(context.weather) ?? 'clear';
  const authoredScene = LOWER_DVINA_LANDSCAPE_SCENES[screen?.scene_asset_id];
  const sceneId = authoredScene
    ? screen.scene_asset_id
    : LANDSCAPE_SCENES[environmentProfile] ?? 'open_meadow';
  const environmentFacts = Object.freeze([...new Set([
    ...(Array.isArray(environment.facts) ? environment.facts : []),
    ...(Array.isArray(context.sensory_details)
      ? context.sensory_details : [])
  ].filter((value) => typeof value === 'string' && FACT_SET.has(value)))]
    .sort());
  const stateId = authoredScene?.interior
    ? (['dusk', 'night'].includes(dayPart) ? 'dark' : 'natural')
    : `${dayPart}-${weather}`;
  const assetUrl = authoredScene
    ? `/assets/landscape/lower-dvina/${authoredScene.folder}/${stateId}.webp`
    : `/assets/landscape/${sceneId}/${stateId}.webp`;

  return deepFreeze({
    width: 1280,
    height: 720,
    sceneId,
    stateId,
    assetUrl,
    fallbackUrl: FALLBACK_LANDSCAPE_URL,
    foregroundWeather: !authoredScene?.interior
      && ['rain', 'snow', 'fog'].includes(weather)
      ? weather : null,
    portraitLighting: authoredScene?.interior
      ? INTERIOR_LIGHT[stateId]
      : combineLighting(dayPart, weather),
    semantics: {
      environmentProfile,
      nodeCategory: LANDSCAPE_NODE_CATEGORIES.includes(environment.node_category)
        ? environment.node_category : null,
      dayPart,
      weather,
      sceneAssetId: authoredScene ? screen.scene_asset_id : null,
      environmentFacts
    }
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
    tintAlpha: atmosphere.tint
      ? atmosphere.tintAlpha : time.tintAlpha,
    snowBounce: weather === 'snow' ? .16 : 0
  };
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
